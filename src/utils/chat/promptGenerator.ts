import { App, TFile, TFolder, htmlToMarkdown, requestUrl } from 'obsidian'

import { editorStateToPlainText } from '../../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { ZuluAgentSettings } from '../../settings/schema/setting.types'
import {
  ChatAssistantMessage,
  ChatMessage,
  ChatToolMessage,
  ChatUserMessage,
} from '../../types/chat'
import { RequestMessage } from '../../types/llm/request'
import {
  MentionableBlock,
  MentionableFile,
  MentionableFolder,
  MentionableUrl,
} from '../../types/mentionable'
import { ToolCallResponseStatus } from '../../types/tool-call.types'
import {
  getNestedFiles,
  readMultipleTFiles,
  readTFileContent,
} from '../obsidian'

import { YoutubeTranscript, isYoutubeUrl } from './youtube-transcript'

export class PromptGenerator {
  private app: App
  private settings: ZuluAgentSettings
  private MAX_CONTEXT_MESSAGES = 20

  constructor(app: App, settings: ZuluAgentSettings) {
    this.app = app
    this.settings = settings
  }

  public async generateRequestMessages({
    messages,
  }: {
    messages: ChatMessage[]
  }): Promise<RequestMessage[]> {
    if (messages.length === 0) {
      throw new Error('No messages provided')
    }

    const compiledMessages = await Promise.all(
      messages.map(async (message) => {
        if (message.role === 'user' && !message.promptContent) {
          const { promptContent } =
            await this.compileUserMessagePrompt({
              message,
            })
          return {
            ...message,
            promptContent,
          }
        }
        return message
      }),
    )

    let lastUserMessage: ChatUserMessage | undefined = undefined
    for (let i = compiledMessages.length - 1; i >= 0; --i) {
      if (compiledMessages[i].role === 'user') {
        lastUserMessage = compiledMessages[i] as ChatUserMessage
        break
      }
    }
    if (!lastUserMessage) {
      throw new Error('No user messages found')
    }

    const systemMessage = await this.getSystemMessage()

    const currentFile = lastUserMessage.mentionables.find(
      (m) => m.type === 'current-file',
    )?.file
    const currentFileMessage =
      currentFile && this.settings.chatOptions.includeCurrentFileContent
        ? await this.getCurrentFileMessage(currentFile)
        : undefined

    const requestMessages: RequestMessage[] = [
      ...(systemMessage ? [systemMessage] : []),
      ...(currentFileMessage ? [currentFileMessage] : []),
      ...this.getChatHistoryMessages({ messages: compiledMessages }),
    ]

    return requestMessages
  }

  private getChatHistoryMessages({
    messages,
  }: {
    messages: ChatMessage[]
  }): RequestMessage[] {
    const requestMessages: RequestMessage[] = messages
      .slice(-this.MAX_CONTEXT_MESSAGES)
      .flatMap((message): RequestMessage[] => {
        if (message.role === 'user') {
          return [
            {
              role: 'user',
              content: message.promptContent ?? '',
            },
          ]
        } else if (message.role === 'assistant') {
          return this.parseAssistantMessage({ message })
        } else {
          return this.parseToolMessage({ message })
        }
      })

    const filteredRequestMessages: RequestMessage[] = requestMessages
      .map((msg) => {
        switch (msg.role) {
          case 'user':
            return msg
          case 'assistant': {
            const filteredToolCalls = msg.tool_calls?.filter((t) =>
              requestMessages.some(
                (rm) => rm.role === 'tool' && rm.tool_call.id === t.id,
              ),
            )
            return {
              ...msg,
              tool_calls:
                filteredToolCalls && filteredToolCalls.length > 0
                  ? filteredToolCalls
                  : undefined,
            }
          }
          case 'tool': {
            const assistantMessage = requestMessages.find(
              (rm) =>
                rm.role === 'assistant' &&
                rm.tool_calls?.some((t) => t.id === msg.tool_call.id),
            )
            if (!assistantMessage) {
              console.warn(
                `[Zulu Agent] Tool message with tool_call_id="${msg.tool_call.id}" has no matching assistant message. Available assistant tool_calls:`,
                requestMessages
                  .filter((rm) => rm.role === 'assistant' && rm.tool_calls)
                  .map((rm) => ({
                    content: (rm as RequestMessage & { role: 'assistant' }).content.slice(0, 100),
                    tool_call_ids: ((rm as RequestMessage & { role: 'assistant' }).tool_calls ?? []).map((tc) => tc.id),
                  })),
              )
              return null
            } else {
              return msg
            }
          }
          default:
            return msg
        }
      })
      .filter((m) => m !== null)

    return filteredRequestMessages
  }

  private parseAssistantMessage({
    message,
  }: {
    message: ChatAssistantMessage
  }): RequestMessage[] {
    let citationContent: string | null = null
    if (message.annotations && message.annotations.length > 0) {
      citationContent = `Citations:
${message.annotations
  .map((annotation, index) => {
    if (annotation.type === 'url_citation') {
      const { url, title } = annotation.url_citation
      return `[${index + 1}] ${title ? `${title}: ` : ''}${url}`
    }
  })
  .join('\n')}`
    }

    return [
      {
        role: 'assistant',
        content: [
          message.content,
          ...(citationContent ? [citationContent] : []),
        ].join('\n'),
        tool_calls: message.toolCallRequests,
        providerMetadata: message.providerMetadata,
      },
    ]
  }

  private parseToolMessage({
    message,
  }: {
    message: ChatToolMessage
  }): RequestMessage[] {
    return message.toolCalls.map((toolCall) => {
      switch (toolCall.response.status) {
        case ToolCallResponseStatus.PendingApproval:
        case ToolCallResponseStatus.Running:
        case ToolCallResponseStatus.Rejected:
        case ToolCallResponseStatus.Aborted:
          return {
            role: 'tool',
            tool_call: toolCall.request,
            content: `Tool call ${toolCall.request.id} is ${toolCall.response.status}`,
          }
        case ToolCallResponseStatus.Success:
          return {
            role: 'tool',
            tool_call: toolCall.request,
            content: toolCall.response.data.text,
          }
        case ToolCallResponseStatus.Error:
          return {
            role: 'tool',
            tool_call: toolCall.request,
            content: `Error: ${toolCall.response.error}`,
          }
      }
    })
  }

  public async compileUserMessagePrompt({
    message,
  }: {
    message: ChatUserMessage
  }): Promise<{
    promptContent: ChatUserMessage['promptContent']
  }> {
    try {
      if (!message.content) {
        return {
          promptContent: '',
        }
      }
      const query = editorStateToPlainText(message.content)

      const files = message.mentionables
        .filter((m): m is MentionableFile => m.type === 'file')
        .map((m) => m.file)
      const folders = message.mentionables
        .filter((m): m is MentionableFolder => m.type === 'folder')
        .map((m) => m.folder)
      const nestedFiles = folders.flatMap((folder) =>
        getNestedFiles(folder, this.app.vault),
      )
      const allFiles = [...files, ...nestedFiles]
      const fileContents = await readMultipleTFiles(allFiles, this.app.vault)

      const filePrompt = allFiles
        .map((file, index) => {
          return `\`\`\`${file.path}\n${fileContents[index]}\n\`\`\`\n`
        })
        .join('')

      const blocks = message.mentionables.filter(
        (m): m is MentionableBlock => m.type === 'block',
      )
      const blockPrompt = blocks
        .map(({ file, content }) => {
          return `\`\`\`${file.path}\n${content}\n\`\`\`\n`
        })
        .join('')

      const urls = message.mentionables.filter(
        (m): m is MentionableUrl => m.type === 'url',
      )

      const urlPrompt =
        urls.length > 0
          ? `## Potentially Relevant Websearch Results
${(
  await Promise.all(
    urls.map(
      async ({ url }) => `\`\`\`
Website URL: ${url}
Website Content:
${await this.getWebsiteContent(url)}
\`\`\``,
    ),
  )
).join('\n')}
`
          : ''

      return {
        promptContent: `${filePrompt}${blockPrompt}${urlPrompt}\n\n${query}\n\n`,
      }
    } catch (error) {
      console.error('Failed to compile user message', error)
      throw error
    }
  }

  private async getSystemMessage(): Promise<RequestMessage | null> {
    let content = ''

    if (this.settings.systemPromptEnabled && this.settings.systemPromptFilePath) {
      const file = this.app.vault.getFileByPath(this.settings.systemPromptFilePath)
      if (file) {
        try {
          content = await readTFileContent(file, this.app.vault)
        } catch (error) {
          console.error(
            `[Zulu Agent] Failed to read system prompt file: ${this.settings.systemPromptFilePath}`,
            error,
          )
        }
      } else {
        console.warn(
          `[Zulu Agent] System prompt file not found: ${this.settings.systemPromptFilePath}`,
        )
      }
    }

    if (this.settings.chatOptions.includeVaultStructure ?? true) {
      const vaultTree = this.generateVaultTree()
      if (content) {
        content += `\n\n## Vault Files\nMarkdown files in the vault (paths relative to vault root):\n\`\`\`\n${vaultTree || '(empty vault)'}\n\`\`\``
      } else {
        content = `## Vault Files\nMarkdown files in the vault (paths relative to vault root):\n\`\`\`\n${vaultTree || '(empty vault)'}\n\`\`\``
      }
    }

    const trimmed = content.trim()
    if (!trimmed) return null

    return { role: 'system', content: trimmed }
  }

  private generateVaultTree(): string {
    const rootFolder = this.app.vault.getRoot()
    const paths: string[] = []
    const folders = this.settings.chatOptions?.vaultStructureFolders ?? []
    const includeAll = this.settings.chatOptions?.includeAllVaultFileTypes ?? false
    const includeRootFiles = this.settings.chatOptions?.includeVaultRootFiles ?? true

    if (folders.length === 0) {
      this.collectFilePaths(rootFolder, '', paths, includeAll)
    } else {
      if (includeRootFiles) {
        this.collectRootFiles(rootFolder, paths, includeAll)
      }
      for (const folderPath of folders) {
        const folder = this.app.vault.getAbstractFileByPath(folderPath)
        if (folder instanceof TFolder) {
          this.collectFilePaths(folder, folderPath, paths, includeAll)
        }
      }
    }

    return paths.join('\n')
  }

  private collectFilePaths(
    folder: TFolder,
    parentPath: string,
    paths: string[],
    includeAll = false,
  ): void {
    const children = folder.children
      .filter(
        (child): child is TFolder | TFile =>
          child instanceof TFolder || child instanceof TFile,
      )
      .sort((a, b) => a.name.localeCompare(b.name))

    const allowedExtensions = includeAll ? null : new Set(['md', 'canvas', 'base'])

    for (const child of children) {
      const fullPath = parentPath ? `${parentPath}/${child.name}` : child.name
      if (child instanceof TFolder) {
        this.collectFilePaths(child, fullPath, paths, includeAll)
      } else if (child instanceof TFile) {
        if (allowedExtensions === null || allowedExtensions.has(child.extension)) {
          paths.push(fullPath)
        }
      }
    }
  }

  private collectRootFiles(
    root: TFolder,
    paths: string[],
    includeAll = false,
  ): void {
    const allowedExtensions = includeAll ? null : new Set(['md', 'canvas', 'base'])
    const children = root.children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      if (child instanceof TFile) {
        if (allowedExtensions === null || allowedExtensions.has(child.extension)) {
          paths.push(child.name)
        }
      }
    }
  }

  private async getCurrentFileMessage(
    currentFile: TFile,
  ): Promise<RequestMessage> {
    const fileContent = await readTFileContent(currentFile, this.app.vault)
    return {
      role: 'user',
      content: `# Inputs
## Current File
Here is the file I'm looking at.
\`\`\`${currentFile.path}
${fileContent}
\`\`\`\n\n`,
    }
  }

  /**
   * TODO: Improve markdown conversion logic
   * - filter visually hidden elements
   * ...
   */
  private async getWebsiteContent(url: string): Promise<string> {
    if (isYoutubeUrl(url)) {
      try {
        const { title, transcript } =
          await YoutubeTranscript.fetchTranscriptAndMetadata(url)

        return `Title: ${title}
Video Transcript:
${transcript.map((t) => `${t.offset}: ${t.text}`).join('\n')}`
      } catch (error) {
        console.error('Error fetching YouTube transcript', error)
      }
    }

    const response = await requestUrl({ url })
    return htmlToMarkdown(response.text)
  }

}
