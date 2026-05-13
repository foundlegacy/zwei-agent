import { UseMutationResult, useMutation } from '@tanstack/react-query'
import { Notice } from 'obsidian'
import { useCallback, useMemo, useRef } from 'react'

import { useApp } from '../../contexts/app-context'
import { useSettings } from '../../contexts/settings-context'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
  LLMModelNotFoundException,
} from '../../core/llm/exception'
import { getChatModelClient } from '../../core/llm/manager'
import { ToolManager } from '../../core/tools/toolManager'
import { ChatMessage } from '../../types/chat'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import { ResponseGenerator } from '../../utils/chat/responseGenerator'
import { ErrorModal } from '../modals/ErrorModal'

type UseChatStreamManagerParams = {
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  autoScrollToBottom: () => void
  promptGenerator: PromptGenerator
}

export type UseChatStreamManager = {
  abortActiveStreams: () => void
  submitChatMutation: UseMutationResult<
    void,
    Error,
    { chatMessages: ChatMessage[]; conversationId: string }
  >
  toolManager: ToolManager
}

export function useChatStreamManager({
  setChatMessages,
  autoScrollToBottom,
  promptGenerator,
}: UseChatStreamManagerParams): UseChatStreamManager {
  const app = useApp()
  const { settings, setSettings } = useSettings()

  const activeStreamAbortControllersRef = useRef<AbortController[]>([])

  const toolManager = useMemo(
    () => new ToolManager(app, settings.enabledTools),
    [app, settings.enabledTools],
  )

  const abortActiveStreams = useCallback(() => {
    for (const abortController of activeStreamAbortControllersRef.current) {
      abortController.abort()
    }
    activeStreamAbortControllersRef.current = []
  }, [])

  const { providerClient, model } = useMemo(() => {
    try {
      return getChatModelClient({
        modelId: settings.chatModelId,
        settings,
        setSettings,
      })
    } catch (error) {
      if (error instanceof LLMModelNotFoundException) {
        if (settings.chatModels.length === 0) {
          throw error
        }
        const firstChatModel = settings.chatModels[0]
        void setSettings({
          ...settings,
          chatModelId: firstChatModel.id,
          chatModels: settings.chatModels.map((model) =>
            model.id === firstChatModel.id
              ? {
                  ...model,
                  enable: true,
                }
              : model,
          ),
        })
        return getChatModelClient({
          modelId: firstChatModel.id,
          settings,
          setSettings,
        })
      }
      throw error
    }
  }, [settings, setSettings])

  const submitChatMutation = useMutation({
    mutationFn: async ({
      chatMessages,
      conversationId,
    }: {
      chatMessages: ChatMessage[]
      conversationId: string
    }) => {
      const lastMessage = chatMessages.at(-1)
      if (!lastMessage) {
        return
      }

      abortActiveStreams()
      const abortController = new AbortController()
      activeStreamAbortControllersRef.current.push(abortController)

      let unsubscribeResponseGenerator: (() => void) | undefined

      try {
        const responseGenerator = new ResponseGenerator({
          providerClient,
          model,
          messages: chatMessages,
          conversationId,
          enableTools: settings.enabledTools.length > 0,
          maxAutoIterations: settings.chatOptions.maxAutoIterations,
          promptGenerator,
          toolManager,
          abortSignal: abortController.signal,
        })

        unsubscribeResponseGenerator = responseGenerator.subscribe(
          (responseMessages) => {
            setChatMessages((prevChatMessages) => {
              const lastMessageIndex = prevChatMessages.findIndex(
                (message) => message.id === lastMessage.id,
              )
              if (lastMessageIndex === -1) {
                abortController.abort()
                return prevChatMessages
              }
              return [
                ...prevChatMessages.slice(0, lastMessageIndex + 1),
                ...responseMessages,
              ]
            })
            autoScrollToBottom()
          },
        )

        await responseGenerator.run()
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return
        }
        throw error
      } finally {
        if (unsubscribeResponseGenerator) {
          unsubscribeResponseGenerator()
        }
        activeStreamAbortControllersRef.current =
          activeStreamAbortControllersRef.current.filter(
            (controller) => controller !== abortController,
          )
      }
    },
    onError: (error) => {
      if (
        error instanceof LLMAPIKeyNotSetException ||
        error instanceof LLMAPIKeyInvalidException ||
        error instanceof LLMBaseUrlNotSetException
      ) {
        new ErrorModal(app, 'Error', error.message, error.rawError?.message, {
          showSettingsButton: true,
        }).open()
      } else {
        new Notice(error.message)
        console.error('Failed to generate response', error)
      }
    },
  })

  return {
    abortActiveStreams,
    submitChatMutation,
    toolManager,
  }
}
