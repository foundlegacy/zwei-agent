import { App } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { editorStateToPlainText } from '../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { useApp } from '../contexts/app-context'
import { ChatConversationMetadata } from '../database/json/chat/types'
import { ChatMessage, SerializedChatMessage } from '../types/chat'
import { Mentionable } from '../types/mentionable'
import {
  deserializeMentionable,
  serializeMentionable,
} from '../utils/chat/mentionable'

import { useChatManager } from './useJsonManagers'

type UseChatHistory = {
  createOrUpdateConversation: (
    id: string,
    messages: ChatMessage[],
  ) => Promise<void> | undefined
  deleteConversation: (id: string) => Promise<void>
  getChatMessagesById: (id: string) => Promise<ChatMessage[] | null>
  updateConversationTitle: (id: string, title: string) => Promise<void>
  chatList: ChatConversationMetadata[]
}

function debounce<T extends (...args: unknown[]) => Promise<void>>(
  fn: T,
  delay: number,
  options?: { maxWait?: number },
): T {
  let timer: number | null = null
  let maxTimer: number | null = null

  const debounced = function (this: unknown, ...args: unknown[]) {
    if (maxTimer === null && options?.maxWait) {
      maxTimer = window.setTimeout(() => {
        if (timer !== null) {
          window.clearTimeout(timer)
          timer = null
        }
        maxTimer = null
        fn.apply(this, args)
      }, options.maxWait)
    }
    if (timer !== null) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(() => {
      if (maxTimer !== null) {
        window.clearTimeout(maxTimer)
        maxTimer = null
      }
      timer = null
      fn.apply(this, args)
    }, delay)
  } as T

  return debounced
}

function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function useChatHistory(): UseChatHistory {
  const app = useApp()
  const chatManager = useChatManager()
  const [chatList, setChatList] = useState<ChatConversationMetadata[]>([])

  const fetchChatList = useCallback(async () => {
    const list = await chatManager.listChats()
    setChatList(list)
  }, [chatManager])

  useEffect(() => {
    void fetchChatList()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial fetch on mount, dependencies intentionally empty
  }, [])

  const createOrUpdateConversation = useMemo(
    () =>
      debounce(
        async (id: string, messages: ChatMessage[]): Promise<void> => {
          const serializedMessages = messages.map(serializeChatMessage)
          const existingConversation = await chatManager.findById(id)

          if (existingConversation) {
            if (isEqual(existingConversation.messages, serializedMessages)) {
              return
            }
            await chatManager.updateChat(existingConversation.id, {
              messages: serializedMessages,
            })
          } else {
            const firstUserMessage = messages.find((v) => v.role === 'user')
            const content = firstUserMessage?.content

            await chatManager.createChat({
              id,
              title: content
                ? editorStateToPlainText(content).substring(
                    0,
                    50,
                  )
                : 'New chat',
              messages: serializedMessages,
            })
          }

          await fetchChatList()
        },
        300,
        {
          maxWait: 1000,
        },
      ),
    [chatManager, fetchChatList],
  )

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      await chatManager.deleteChat(id)
      await fetchChatList()
    },
    [chatManager, fetchChatList],
  )

  const getChatMessagesById = useCallback(
    async (id: string): Promise<ChatMessage[] | null> => {
      const conversation = await chatManager.findById(id)
      if (!conversation) {
        return null
      }
      return conversation.messages.map((message) =>
        deserializeChatMessage(message as SerializedChatMessage, app),
      )
    },
    [chatManager, app],
  )

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (title.length === 0) {
        throw new Error('Chat title cannot be empty')
      }
      const conversation = await chatManager.findById(id)
      if (!conversation) {
        throw new Error('Conversation not found')
      }
      await chatManager.updateChat(conversation.id, {
        title,
      })
      await fetchChatList()
    },
    [chatManager, fetchChatList],
  )

  return {
    createOrUpdateConversation,
    deleteConversation,
    getChatMessagesById,
    updateConversationTitle,
    chatList,
  }
}

const serializeChatMessage = (message: ChatMessage): SerializedChatMessage => {
  switch (message.role) {
    case 'user':
      return {
        role: 'user',
        content: message.content,
        promptContent: message.promptContent,
        id: message.id,
        mentionables: message.mentionables.map(serializeMentionable),
      }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        reasoning: message.reasoning,
        annotations: message.annotations,
        toolCallRequests: message.toolCallRequests,
        id: message.id,
        metadata: message.metadata,
        providerMetadata: message.providerMetadata,
      }
    case 'tool':
      return {
        role: 'tool',
        toolCalls: message.toolCalls,
        id: message.id,
      }
  }
}

const deserializeChatMessage = (
  message: SerializedChatMessage,
  app: App,
): ChatMessage => {
  switch (message.role) {
    case 'user': {
      return {
        role: 'user',
        content: message.content,
        promptContent: message.promptContent,
        id: message.id,
        mentionables: message.mentionables
          .map((m) => deserializeMentionable(m, app))
          .filter((m): m is Mentionable => m !== null),
      }
    }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        reasoning: message.reasoning,
        annotations: message.annotations,
        toolCallRequests: message.toolCallRequests,
        id: message.id,
        metadata: message.metadata,
        providerMetadata: message.providerMetadata,
      }
    case 'tool':
      return {
        role: 'tool',
        toolCalls: message.toolCalls,
        id: message.id,
      }
  }
}
