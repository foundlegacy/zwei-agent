import { v4 as uuidv4 } from 'uuid'

import { BaseLLMProvider } from '../../core/llm/base'
import { ToolManager } from '../../core/tools/toolManager'
import { ChatMessage, ChatToolMessage } from '../../types/chat'
import { ChatModel } from '../../types/chat-model.types'
import { RequestMessage, RequestTool } from '../../types/llm/request'
import {
  Annotation,
  LLMResponseStreaming,
  ToolCallDelta,
} from '../../types/llm/response'
import { LLMProvider } from '../../types/provider.types'
import {
  ToolCallRequest,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'

import { fetchAnnotationTitles } from './fetch-annotation-titles'
import { PromptGenerator } from './promptGenerator'

export type ResponseGeneratorParams = {
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
  messages: ChatMessage[]
  conversationId: string
  enableTools: boolean
  maxAutoIterations: number
  promptGenerator: PromptGenerator
  toolManager: ToolManager
  abortSignal?: AbortSignal
}

export class ResponseGenerator {
  private readonly providerClient: BaseLLMProvider<LLMProvider>
  private readonly model: ChatModel
  private readonly conversationId: string
  private readonly enableTools: boolean
  private readonly promptGenerator: PromptGenerator
  private readonly toolManager: ToolManager
  private readonly abortSignal?: AbortSignal
  private readonly receivedMessages: ChatMessage[]
  private readonly maxAutoIterations: number

  private responseMessages: ChatMessage[] = [] // Response messages that are generated after the initial messages
  private subscribers: ((messages: ChatMessage[]) => void)[] = []

  constructor(params: ResponseGeneratorParams) {
    this.providerClient = params.providerClient
    this.model = params.model
    this.conversationId = params.conversationId
    this.enableTools = params.enableTools
    this.maxAutoIterations = Math.max(1, params.maxAutoIterations) // Ensure maxAutoIterations is at least 1
    this.receivedMessages = params.messages
    this.promptGenerator = params.promptGenerator
    this.toolManager = params.toolManager
    this.abortSignal = params.abortSignal
  }

  public subscribe(callback: (messages: ChatMessage[]) => void) {
    this.subscribers.push(callback)

    return () => {
      this.subscribers = this.subscribers.filter((cb) => cb !== callback)
    }
  }

  /** Merge tool call requests into an existing or new tool message. */
  private upsertToolCalls(
    toolCallRequests: ToolCallRequest[],
    toolMessageId: string | null,
  ): ChatToolMessage {
    const existing = toolMessageId
      ? (this.responseMessages.find(
          (m) => m.id === toolMessageId && m.role === 'tool',
        ) as ChatToolMessage | undefined)
      : undefined

    const existingMap = new Map(
      existing?.toolCalls?.map((tc) => [tc.request.name, tc]) ?? [],
    )

    const toolCalls = toolCallRequests.map((tc) => {
      const prev = existingMap.get(tc.name)
      return {
        request: tc,
        response: prev?.response ?? {
          status: this.toolManager.isToolExecutionAllowed(tc.name)
            ? ToolCallResponseStatus.Running
            : ToolCallResponseStatus.PendingApproval,
        },
      }
    })

    // Also update response status on existing entries (placeholder always set Running)
    for (const tc of toolCalls) {
      const allowed = this.toolManager.isToolExecutionAllowed(tc.request.name)
      const desired = allowed
        ? ToolCallResponseStatus.Running
        : ToolCallResponseStatus.PendingApproval
      if (tc.response.status !== desired) {
        tc.response = { status: desired }
      }
    }

    const message: ChatToolMessage = {
      role: 'tool' as const,
      id: existing?.id ?? toolMessageId ?? uuidv4(),
      toolCalls,
    }

    this.updateResponseMessages((messages) =>
      existing
        ? messages.map((m) => (m.id === message.id ? message : m))
        : [...messages, message],
    )

    return message
  }

  public async run() {
    for (let i = 0; i < this.maxAutoIterations; i++) {
      const { toolCallRequests, toolMessageId } =
        await this.streamSingleResponse()
      if (toolCallRequests.length === 0) {
        return
      }

      const toolMessage = this.upsertToolCalls(
        toolCallRequests,
        toolMessageId,
      )

      // Collect all tool call responses first to avoid race conditions
      const toolCallResponses = await Promise.all(
        toolMessage.toolCalls
          .filter(
            (toolCall) =>
              toolCall.response.status === ToolCallResponseStatus.Running,
          )
          .map(async (toolCall) => {
            const response = await this.toolManager.callTool({
              name: toolCall.request.name,
              args: toolCall.request.arguments,
              id: toolCall.request.id,
              signal: this.abortSignal,
            })
            return { toolCallId: toolCall.request.id, response }
          }),
      )

      // Apply all responses in a single atomic update
      this.updateResponseMessages((messages) =>
        messages.map((message) =>
          message.id === toolMessage.id && message.role === 'tool'
            ? {
                ...message,
                toolCalls: message.toolCalls?.map((tc) => {
                  const found = toolCallResponses.find(
                    (r) => r.toolCallId === tc.request.id,
                  )
                  return found ? { ...tc, response: found.response } : tc
                }),
              }
            : message,
        ),
      )

      const updatedToolMessage = this.responseMessages.find(
        (message) => message.id === toolMessage.id && message.role === 'tool',
      ) as ChatToolMessage | undefined
      if (
        !updatedToolMessage?.toolCalls?.every((toolCall) =>
          [
            ToolCallResponseStatus.Success,
            ToolCallResponseStatus.Error,
          ].includes(toolCall.response.status),
        )
      ) {
        // Exit the auto-iteration loop if any tool call hasn't completed
        // Only 'success' or 'error' states are considered complete
        return
      }
    }
  }

  private async streamSingleResponse(): Promise<{
    toolCallRequests: ToolCallRequest[]
    toolMessageId: string | null
  }> {
    const requestMessages = await this.promptGenerator.generateRequestMessages({
      messages: [...this.receivedMessages, ...this.responseMessages],
    })

    const assistantWithToolCalls = requestMessages.filter(
      (m): m is Extract<RequestMessage, { role: 'assistant' }> =>
        m.role === 'assistant' && m.tool_calls != null && m.tool_calls.length > 0,
    )
    const toolMessages = requestMessages.filter(
      (m): m is Extract<RequestMessage, { role: 'tool' }> =>
        m.role === 'tool',
    )

    if (assistantWithToolCalls.length > 0 || toolMessages.length > 0) {
      console.log('[Zulu Agent] Tool message pairing check:', {
        totalMessages: requestMessages.length,
        assistantMessagesWithToolCalls: assistantWithToolCalls.map((m) => ({
          contentPreview: m.content.slice(0, 80),
          toolCallIds: m.tool_calls?.map((tc) => tc.id),
        })),
        toolMessages: toolMessages.map((m) => ({
          toolCallId: m.tool_call.id,
          contentPreview: m.content.slice(0, 80),
        })),
      })
    }

    const availableTools = this.enableTools
      ? await this.toolManager.listAvailableTools()
      : []

    const tools: RequestTool[] | undefined =
      availableTools.length > 0
        ? availableTools.map((tool) => ({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: {
                ...tool.inputSchema,
                properties: tool.inputSchema.properties ?? {},
              },
            },
          }))
        : undefined

    const stream = await this.providerClient.streamResponse(
      this.model,
      {
        model: this.model.model,
        messages: requestMessages,
        tools,
        stream: true,
      },
      {
        signal: this.abortSignal,
      },
    )

    // Create a new assistant message for the response if it doesn't exist
    if (this.responseMessages.at(-1)?.role !== 'assistant') {
      this.responseMessages.push({
        role: 'assistant',
        content: '',
        id: uuidv4(),
        metadata: {
          model: this.model,
        },
      })
    }
    const lastMessage = this.responseMessages.at(-1)
    if (lastMessage?.role !== 'assistant') {
      throw new Error('Last message is not an assistant message')
    }
    const responseMessageId = lastMessage.id
    let responseToolCalls: Record<number, ToolCallDelta> = {}
    let toolMessageId: string | null = null
    let hadToolCalls = false

    for await (const chunk of stream) {
      const { updatedToolCalls } = this.processChunk(
        chunk,
        responseMessageId,
        responseToolCalls,
      )
      responseToolCalls = updatedToolCalls

      // As soon as we detect the first tool call, emit a placeholder
      // tool message so the user sees the spinning gear immediately
      if (!hadToolCalls && Object.keys(responseToolCalls).length > 0) {
        hadToolCalls = true
        const preliminaryRequests: ToolCallRequest[] =
          Object.values(responseToolCalls)
            .filter((tc) => tc.function?.name != null)
            .map((tc) => ({
              id: tc.id ?? uuidv4(),
              name: tc.function!.name!,
              arguments: tc.function!.arguments ?? '',
            }))

        if (preliminaryRequests.length > 0) {
          toolMessageId = uuidv4()
          const toolMessage: ChatToolMessage = {
            role: 'tool' as const,
            id: toolMessageId,
            toolCalls: preliminaryRequests.map((req) => ({
              request: req,
              response: {
                // Always show Running during streaming so the card stays
                // collapsed with the spinning gear — never open with empty params.
                status: ToolCallResponseStatus.Running,
              },
            })),
          }
          this.updateResponseMessages((messages) => [
            ...messages,
            toolMessage,
          ])
        }
      }
    }

    const toolCallRequests: ToolCallRequest[] = Object.values(responseToolCalls)
      .map((toolCall) => {
        if (!toolCall.function?.name) {
          return null
        }
        return {
          id: toolCall.id ?? uuidv4(),
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        }
      })
      .filter((toolCall) => toolCall !== null)

    // Update the assistant message with tool call metadata
    this.updateResponseMessages((messages) =>
      messages.map((message) =>
        message.id === responseMessageId && message.role === 'assistant'
          ? {
              ...message,
              toolCallRequests:
                toolCallRequests.length > 0 ? toolCallRequests : undefined,
            }
          : message,
      ),
    )

    return {
      toolCallRequests,
      toolMessageId,
    }
  }

  private processChunk(
    chunk: LLMResponseStreaming,
    responseMessageId: string,
    responseToolCalls: Record<number, ToolCallDelta>,
  ): {
    updatedToolCalls: Record<number, ToolCallDelta>
  } {
    const content = chunk.choices[0]?.delta?.content ?? ''
    const reasoning = chunk.choices[0]?.delta?.reasoning
    const toolCalls = chunk.choices[0]?.delta?.tool_calls
    const annotations = chunk.choices[0]?.delta?.annotations

    const updatedToolCalls = toolCalls
      ? this.mergeToolCallDeltas(toolCalls, responseToolCalls)
      : responseToolCalls

    if (annotations) {
      // For annotations with empty titles, fetch the title of the URL and update the chat messages
      fetchAnnotationTitles(annotations, (url, title) => {
        this.updateResponseMessages((messages) =>
          messages.map((message) =>
            message.id === responseMessageId && message.role === 'assistant'
              ? {
                  ...message,
                  annotations: message.annotations?.map((a) =>
                    a.type === 'url_citation' && a.url_citation.url === url
                      ? {
                          ...a,
                          url_citation: {
                            ...a.url_citation,
                            title: title ?? undefined,
                          },
                        }
                      : a,
                  ),
                }
              : message,
          ),
        )
      })
    }

    const providerMetadata = chunk.choices[0]?.delta?.providerMetadata

    this.updateResponseMessages((messages) =>
      messages.map((message) => {
        if (message.id !== responseMessageId || message.role !== 'assistant') {
          return message
        }

        const combinedContent = message.content + content
        let strippedContent = combinedContent
        let extractedReasoning = reasoning
          ? (message.reasoning ?? '') + reasoning
          : message.reasoning

        // Extract <think>...</think> blocks from content (Ollama/local models
        // embed reasoning inline rather than in a separate delta field).
        const thinkRegex = /<think>([\s\S]*?)<\/think>/g
        let thinkMatch: RegExpExecArray | null
        while ((thinkMatch = thinkRegex.exec(combinedContent)) !== null) {
          const thinkContent = thinkMatch[1].replace(/^\n|\n$/g, '')
          extractedReasoning = (extractedReasoning ?? '') + thinkContent
        }
        strippedContent = combinedContent.replace(thinkRegex, '')

        return {
          ...message,
          content: strippedContent,
          reasoning: extractedReasoning,
          annotations: this.mergeAnnotations(
            message.annotations,
            annotations,
          ),
          metadata: {
            ...message.metadata,
            usage: chunk.usage ?? message.metadata?.usage,
          },
          providerMetadata: message.providerMetadata ?? providerMetadata,
        }
      }),
    )

    return {
      updatedToolCalls,
    }
  }

  private updateResponseMessages(
    updaterFunction: (messages: ChatMessage[]) => ChatMessage[],
  ) {
    this.responseMessages = updaterFunction(this.responseMessages)
    this.notifySubscribers(this.responseMessages)
  }

  private notifySubscribers(messages: ChatMessage[]) {
    this.subscribers.forEach((callback) => callback(messages))
  }

  private mergeToolCallDeltas(
    toolCalls: ToolCallDelta[],
    existingToolCalls: Record<number, ToolCallDelta>,
  ): Record<number, ToolCallDelta> {
    const merged = { ...existingToolCalls }

    for (const toolCall of toolCalls) {
      const { index } = toolCall

      if (!merged[index]) {
        merged[index] = toolCall
        continue
      }

      const mergedToolCall: ToolCallDelta = {
        index,
        id: merged[index].id ?? toolCall.id,
        type: merged[index].type ?? toolCall.type,
      }

      if (merged[index].function || toolCall.function) {
        const existingArgs = merged[index].function?.arguments
        const newArgs = toolCall.function?.arguments

        mergedToolCall.function = {
          name: merged[index].function?.name ?? toolCall.function?.name,
          arguments:
            existingArgs || newArgs
              ? [existingArgs ?? '', newArgs ?? ''].join('')
              : undefined,
        }
      }

      merged[index] = mergedToolCall
    }

    return merged
  }

  private mergeAnnotations(
    prevAnnotations?: Annotation[],
    newAnnotations?: Annotation[],
  ): Annotation[] | undefined {
    if (!prevAnnotations) return newAnnotations
    if (!newAnnotations) return prevAnnotations

    const mergedAnnotations = [...prevAnnotations]
    for (const newAnnotation of newAnnotations) {
      if (
        !mergedAnnotations.find(
          (annotation) =>
            annotation.url_citation.url === newAnnotation.url_citation.url,
        )
      ) {
        mergedAnnotations.push(newAnnotation)
      }
    }
    return mergedAnnotations
  }
}
