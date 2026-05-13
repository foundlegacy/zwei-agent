import { App, TFile, TFolder, normalizePath } from 'obsidian'

import {
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'

type Tool = {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<
      string,
      {
        type: string
        description: string
        items?: { type: string }
        enum?: string[]
      }
    >
    required?: string[]
  }
}

const BUILTIN_TOOLS: Tool[] = [
  {
    name: 'read_vault_file',
    description:
      "Read a file from the vault (.md, .base, .canvas only). Use sparingly — large files cost many tokens. Path is relative to vault root (e.g., \"Notes/My Note.md\").",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to vault root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'edit_vault_file',
    description:
      "Replace text in a vault file. Requires user approval. You MUST have read the file first. The old_string must be UNIQUE in the file — include enough surrounding lines to disambiguate. The match is exact (whitespace, indentation, punctuation). If you get a \"appears N times\" error, retry with more surrounding context.",
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to vault root.',
        },
        old_string: {
          type: 'string',
          description:
            'EXACT text to replace. Must be unique in the file. Include 2-3 surrounding lines if needed.',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text. Empty string deletes.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'search_vault',
    description:
      'Search all .md, .base, .canvas vault files for a word or phrase. Returns file paths and matching line numbers. Prefer search_files when you know the target files.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Word or phrase to search for.',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case-sensitive? Default false.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_files',
    description:
      'Search specific .md, .base, .canvas vault files for a word or phrase. Use when you know which files to search. Returns matching line numbers per file.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to search (relative to vault root).',
        },
        query: {
          type: 'string',
          description: 'Word or phrase to search for.',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case-sensitive? Default false.',
        },
      },
      required: ['paths', 'query'],
    },
  },
  {
    name: 'file_operation',
    description:
      'Create or delete a vault file. Requires user approval. For create: provide path + content (.md/.canvas/.base). For delete: provide path only (permanent).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'delete'],
          description: '"create" or "delete".',
        },
        path: {
          type: 'string',
          description: 'File path relative to vault root, e.g. "Notes/My Note.md".',
        },
        content: {
          type: 'string',
          description: 'Required for create. File content (markdown, JSON canvas, etc.).',
        },
      },
      required: ['action', 'path'],
    },
  },
  {
    name: 'folder_operation',
    description:
      'Create or delete a vault folder. Requires user approval. Create creates parents as needed. Delete only works on empty folders.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'delete'],
          description: '"create" or "delete".',
        },
        path: {
          type: 'string',
          description: 'Folder path relative to vault root, e.g. "Projects/New".',
        },
      },
      required: ['action', 'path'],
    },
  },
  {
    name: 'rename_file',
    description:
      'Rename or move a vault file. Requires user approval. Provide current and new path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Current file path.',
        },
        new_path: {
          type: 'string',
          description: 'New file path.',
        },
      },
      required: ['path', 'new_path'],
    },
  },
  {
    name: 'rename_folder',
    description:
      'Rename or move a vault folder (all contents move with it). Requires user approval.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Current folder path.',
        },
        new_path: {
          type: 'string',
          description: 'New folder path.',
        },
      },
      required: ['path', 'new_path'],
    },
  },
  {
    name: 'list_css_snippets',
    description:
      'List all CSS snippets in .obsidian/snippets/. Returns filenames.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_css_snippet',
    description:
      'Read the content of a CSS snippet from .obsidian/snippets/. Provide the filename (e.g. "my-theme.css").',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'CSS snippet filename, e.g. "my-theme.css".',
        },
      },
      required: ['filename'],
    },
  },
  {
    name: 'edit_css_snippet',
    description:
      'Edit a CSS snippet by exact string replacement. Requires user approval. Must read snippet first. old_string must be UNIQUE — include surrounding lines if ambiguous.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Snippet filename, e.g. "my-theme.css".',
        },
        old_string: {
          type: 'string',
          description: 'EXACT text to replace. Must be unique in the snippet.',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text. Empty string deletes.',
        },
      },
      required: ['filename', 'old_string', 'new_string'],
    },
  },
  {
    name: 'css_snippet_operation',
    description:
      'Create or delete a CSS snippet in .obsidian/snippets/. Requires user approval. For create: provide filename (.css) + content. For delete: provide filename (permanent).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'delete'],
          description: '"create" or "delete".',
        },
        filename: {
          type: 'string',
          description: 'Filename ending in .css, e.g. "my-theme.css".',
        },
        content: {
          type: 'string',
          description: 'Required for create. The CSS content.',
        },
      },
      required: ['action', 'filename'],
    },
  },
]

function cssSnippetPath(filename: string): string {
  return normalizePath(`.obsidian/snippets/${filename}`)
}

const BUILTIN_TOOL_NAMES = new Set(BUILTIN_TOOLS.map((t) => t.name))

export class ToolManager {
  private app: App
  private enabledTools: string[]
  private activeToolCalls: Map<string, AbortController> = new Map()

  constructor(app: App, enabledTools?: string[]) {
    this.app = app
    this.enabledTools = (enabledTools ?? [...BUILTIN_TOOL_NAMES]).filter(
      (name) => BUILTIN_TOOL_NAMES.has(name),
    )
  }

  getBuiltinTools(): Tool[] {
    return BUILTIN_TOOLS
  }

  async listAvailableTools(): Promise<Tool[]> {
    return BUILTIN_TOOLS.filter((t) => this.enabledTools.includes(t.name))
  }

  isToolExecutionAllowed(toolName: string): boolean {
    if (toolName === 'edit_vault_file') return false
    if (toolName === 'file_operation') return false
    if (toolName === 'folder_operation') return false
    if (toolName === 'rename_file') return false
    if (toolName === 'rename_folder') return false
    if (toolName === 'edit_css_snippet') return false
    if (toolName === 'css_snippet_operation') return false
    return true
  }

  async callTool({
    name,
    args,
    id,
    signal,
  }: {
    name: string
    args?: Record<string, unknown> | string | undefined
    id?: string
    signal?: AbortSignal
  }): Promise<
    Extract<
      ToolCallResponse,
      {
        status:
          | ToolCallResponseStatus.Success
          | ToolCallResponseStatus.Error
          | ToolCallResponseStatus.Aborted
      }
    >
  > {
    if (!this.isBuiltinTool(name)) {
      return {
        status: ToolCallResponseStatus.Error,
        error: `Unknown tool: ${name}`,
      }
    }

    return this.executeBuiltinTool({ name, args, id, signal })
  }

  abortToolCall(id: string): boolean {
    const toolAbortController = this.activeToolCalls.get(id)
    if (toolAbortController) {
      toolAbortController.abort()
      this.activeToolCalls.delete(id)
      return true
    }
    return false
  }

  private isBuiltinTool(name: string): boolean {
    return BUILTIN_TOOL_NAMES.has(name)
  }

  private async executeBuiltinTool({
    name,
    args,
    id,
    signal,
  }: {
    name: string
    args?: Record<string, unknown> | string | undefined
    id?: string
    signal?: AbortSignal
  }): Promise<
    Extract<
      ToolCallResponse,
      {
        status:
          | ToolCallResponseStatus.Success
          | ToolCallResponseStatus.Error
          | ToolCallResponseStatus.Aborted
      }
    >
  > {
    const toolAbortController = new AbortController()
    if (id !== undefined) {
      const existing = this.activeToolCalls.get(id)
      if (existing) existing.abort()
      this.activeToolCalls.set(id, toolAbortController)
    }
    const compositeSignal = toolAbortController.signal
    if (signal) {
      signal.addEventListener('abort', () => toolAbortController.abort())
    }

    try {
      if (compositeSignal.aborted) {
        return { status: ToolCallResponseStatus.Aborted }
      }

      const parsedArgs: Record<string, unknown> =
        typeof args === 'string'
          ? args === ''
            ? {}
            : JSON.parse(args)
          : (args ?? {})

      if (name === 'read_vault_file') {
        const path = parsedArgs['path']
        if (typeof path !== 'string' || !path) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "path" parameter. Provide the file path relative to the vault root.',
          }
        }

        const normalizedPath = normalizePath(path)
        const file = this.app.vault.getAbstractFileByPath(normalizedPath)

        if (!file) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `File not found at path: ${path}`,
          }
        }

        if (!(file instanceof TFile)) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Path "${path}" is not a file.`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const content = await this.app.vault.cachedRead(file)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `## ${path}\n\n\`\`\`\n${content}\n\`\`\``,
          },
        }
      }

      if (name === 'edit_vault_file') {
        const path = parsedArgs['path']
        const oldString = parsedArgs['old_string']
        const newString = parsedArgs['new_string']

        if (typeof path !== 'string' || !path) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "path" parameter.',
          }
        }
        if (typeof oldString !== 'string') {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "old_string" parameter.',
          }
        }
        if (typeof newString !== 'string') {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "new_string" parameter.',
          }
        }

        const normalizedPath = normalizePath(path)
        const file = this.app.vault.getAbstractFileByPath(normalizedPath)

        if (!file) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `File not found at path: ${path}`,
          }
        }

        if (!(file instanceof TFile)) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Path "${path}" is not a file.`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const content = await this.app.vault.read(file)

        const occurrences = countOccurrences(content, oldString)
        if (occurrences === 0) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              `Text not found in the file. The exact text including all whitespace must match. File content:\n\n\`\`\`\n${content}\n\`\`\``,
          }
        }
        if (occurrences > 1) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              `Found ${occurrences} matches — the old_string must be unique. Include more surrounding context (2-3 lines). Try again with a longer match string from:\n\n\`\`\`\n${content}\n\`\`\``,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const newContent = content.replace(oldString, newString)
        await this.app.vault.modify(file, newContent)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `File edited successfully: ${path}`,
          },
        }
      }

      if (name === 'search_vault') {
        const query = parsedArgs['query']
        if (typeof query !== 'string' || !query) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "query" parameter. Provide the word or phrase to search for.',
          }
        }

        const caseSensitive = parsedArgs['caseSensitive'] === true
        const searchQuery = caseSensitive ? query : query.toLowerCase()

        const files = this.app.vault.getFiles()

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const results = await Promise.all(
          files.map(async (file) => {
            if (compositeSignal.aborted) return null
            try {
              const content = await this.app.vault.cachedRead(file)
              const contentForSearch = caseSensitive
                ? content
                : content.toLowerCase()
              if (!contentForSearch.includes(searchQuery)) return null

              const lines = content.split('\n')
              const matchingLines: string[] = []
              for (let i = 0; i < lines.length; i++) {
                const line = caseSensitive
                  ? lines[i]
                  : lines[i].toLowerCase()
                if (line.includes(searchQuery)) {
                  matchingLines.push(`${i + 1}: ${lines[i].trim()}`)
                }
              }
              return { path: file.path, matches: matchingLines }
            } catch {
              return null
            }
          }),
        )

        const matchedFiles = results.filter(
          (r): r is { path: string; matches: string[] } => r !== null,
        )

        if (matchedFiles.length === 0) {
          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: `No files found matching "${query}".`,
            },
          }
        }

        const output = matchedFiles
          .map(
            ({ path, matches }) =>
              `## ${path}\n${matches.map((m) => `  ${m}`).join('\n')}`,
          )
          .join('\n\n')

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `Found ${matchedFiles.length} file(s) matching "${query}":\n\n${output}`,
          },
        }
      }

      if (name === 'search_files') {
        const paths = parsedArgs['paths']
        const query = parsedArgs['query']

        if (!Array.isArray(paths) || paths.length === 0) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "paths" parameter. Provide an array of file paths to search.',
          }
        }
        if (typeof query !== 'string' || !query) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "query" parameter. Provide the word or phrase to search for.',
          }
        }

        const caseSensitive = parsedArgs['caseSensitive'] === true
        const searchQuery = caseSensitive ? query : query.toLowerCase()

        const resolvedFiles: { file: TFile; path: string }[] = []
        for (const p of paths) {
          if (typeof p !== 'string' || !p) continue
          const normalizedPath = normalizePath(p)
          const abstractFile =
            this.app.vault.getAbstractFileByPath(normalizedPath)
          if (abstractFile && abstractFile instanceof TFile) {
            resolvedFiles.push({ file: abstractFile, path: p })
          }
        }

        if (resolvedFiles.length === 0) {
          return {
            status: ToolCallResponseStatus.Error,
            error: 'None of the specified paths were found in the vault.',
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const results = await Promise.all(
          resolvedFiles.map(async ({ file, path }) => {
            if (compositeSignal.aborted) return null
            try {
              const content = await this.app.vault.cachedRead(file)
              const contentForSearch = caseSensitive
                ? content
                : content.toLowerCase()
              if (!contentForSearch.includes(searchQuery)) return null

              const lines = content.split('\n')
              const matchingLines: string[] = []
              for (let i = 0; i < lines.length; i++) {
                const line = caseSensitive
                  ? lines[i]
                  : lines[i].toLowerCase()
                if (line.includes(searchQuery)) {
                  matchingLines.push(`${i + 1}: ${lines[i].trim()}`)
                }
              }
              return { path, matches: matchingLines }
            } catch {
              return null
            }
          }),
        )

        const matchedFiles = results.filter(
          (r): r is { path: string; matches: string[] } => r !== null,
        )

        if (matchedFiles.length === 0) {
          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: `No matches found for "${query}" in the specified files.`,
            },
          }
        }

        const output = matchedFiles
          .map(
            ({ path, matches }) =>
              `## ${path}\n${matches.map((m) => `  ${m}`).join('\n')}`,
          )
          .join('\n\n')

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `Found matches for "${query}" in ${matchedFiles.length} file(s):\n\n${output}`,
          },
        }
      }

      if (name === 'file_operation') {
        const action = parsedArgs['action']
        const path = parsedArgs['path']

        if (typeof path !== 'string' || !path) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "path" parameter. Provide the file path relative to the vault root.',
          }
        }
        if (action !== 'create' && action !== 'delete') {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "action" parameter. Must be "create" or "delete".',
          }
        }

        const normalizedPath = normalizePath(path)

        if (action === 'create') {
          const content = parsedArgs['content']
          if (typeof content !== 'string') {
            return {
              status: ToolCallResponseStatus.Error,
              error:
                'Missing or invalid "content" parameter. Provide the file content for "create" action.',
            }
          }

          const existing = this.app.vault.getAbstractFileByPath(normalizedPath)
          if (existing) {
            return {
              status: ToolCallResponseStatus.Error,
              error: `A file or folder already exists at path: ${path}`,
            }
          }

          if (compositeSignal.aborted) {
            return { status: ToolCallResponseStatus.Aborted }
          }

          const parentPath = normalizedPath.split('/').slice(0, -1).join('/')
          if (parentPath) {
            const parentFolder = this.app.vault.getAbstractFileByPath(parentPath)
            if (!parentFolder) {
              await this.app.vault.createFolder(parentPath)
            }
          }

          await this.app.vault.create(normalizedPath, content)

          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: `File created successfully: ${path}`,
            },
          }
        }

        // action === 'delete'
        const file = this.app.vault.getAbstractFileByPath(normalizedPath)

        if (!file) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `File not found at path: ${path}`,
          }
        }

        if (!(file instanceof TFile)) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Path "${path}" is not a file. Use folder_operation for folders.`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        await this.app.vault.trash(file, false)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `File deleted: ${path}`,
          },
        }
      }

      if (name === 'folder_operation') {
        const action = parsedArgs['action']
        const path = parsedArgs['path']

        if (typeof path !== 'string' || !path) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "path" parameter. Provide the folder path relative to the vault root.',
          }
        }
        if (action !== 'create' && action !== 'delete') {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "action" parameter. Must be "create" or "delete".',
          }
        }

        const normalizedPath = normalizePath(path)

        if (action === 'create') {
          const existing = this.app.vault.getAbstractFileByPath(normalizedPath)
          if (existing) {
            return {
              status: ToolCallResponseStatus.Error,
              error: `A file or folder already exists at path: ${path}`,
            }
          }

          if (compositeSignal.aborted) {
            return { status: ToolCallResponseStatus.Aborted }
          }

          await this.app.vault.createFolder(normalizedPath)

          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: `Folder created successfully: ${path}`,
            },
          }
        }

        // action === 'delete'
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath)

        if (!folder) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Folder not found at path: ${path}`,
          }
        }

        if (!(folder instanceof TFolder)) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Path "${path}" is not a folder. Use file_operation for files.`,
          }
        }

        if (folder.children.length > 0) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Folder "${path}" is not empty. It contains ${folder.children.length} item(s). Only empty folders can be deleted.`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        await this.app.vault.trash(folder, false)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `Folder deleted: ${path}`,
          },
        }
      }

      if (name === 'rename_file') {
        const path = parsedArgs['path']
        const newPath = parsedArgs['new_path']

        if (typeof path !== 'string' || !path) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "path" parameter. Provide the current file path.',
          }
        }
        if (typeof newPath !== 'string' || !newPath) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "new_path" parameter. Provide the new file path.',
          }
        }

        const normalizedPath = normalizePath(path)
        const normalizedNewPath = normalizePath(newPath)
        const file = this.app.vault.getAbstractFileByPath(normalizedPath)

        if (!file) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `File not found at path: ${path}`,
          }
        }

        if (!(file instanceof TFile)) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Path "${path}" is not a file.`,
          }
        }

        const existing = this.app.vault.getAbstractFileByPath(normalizedNewPath)
        if (existing) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `A file or folder already exists at path: ${newPath}`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        await this.app.vault.rename(file, normalizedNewPath)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `File renamed successfully: ${path} → ${newPath}`,
          },
        }
      }

      if (name === 'rename_folder') {
        const path = parsedArgs['path']
        const newPath = parsedArgs['new_path']

        if (typeof path !== 'string' || !path) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "path" parameter. Provide the current folder path.',
          }
        }
        if (typeof newPath !== 'string' || !newPath) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "new_path" parameter. Provide the new folder path.',
          }
        }

        const normalizedPath = normalizePath(path)
        const normalizedNewPath = normalizePath(newPath)
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath)

        if (!folder) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Folder not found at path: ${path}`,
          }
        }

        if (!(folder instanceof TFolder)) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `Path "${path}" is not a folder.`,
          }
        }

        const existing = this.app.vault.getAbstractFileByPath(normalizedNewPath)
        if (existing) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `A file or folder already exists at path: ${newPath}`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        await this.app.vault.rename(folder, normalizedNewPath)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `Folder renamed successfully: ${path} → ${newPath}`,
          },
        }
      }

      if (name === 'list_css_snippets') {
        const snippetsDir = normalizePath('.obsidian/snippets')
        const exists = await this.app.vault.adapter.exists(snippetsDir)
        if (!exists) {
          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: 'No CSS snippets found. The .obsidian/snippets folder does not exist yet.',
            },
          }
        }

        const files = await this.app.vault.adapter.list(snippetsDir)
        const cssFiles = files.files.filter((f) => f.endsWith('.css'))

        if (cssFiles.length === 0) {
          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: 'No CSS snippets found. The .obsidian/snippets folder is empty.',
            },
          }
        }

        const snippetList = cssFiles
          .map((f) => {
            const name = f.replace(/\.css$/i, '')
            return `- ${f} (${name})`
          })
          .join('\n')

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `Found ${cssFiles.length} CSS snippet(s):\n\n${snippetList}`,
          },
        }
      }

      if (name === 'read_css_snippet') {
        const filename = parsedArgs['filename']
        if (typeof filename !== 'string' || !filename) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "filename" parameter. Provide the CSS snippet filename (e.g., "my-theme.css").',
          }
        }

        const snippetPath = cssSnippetPath(filename)
        if (!(await this.app.vault.adapter.exists(snippetPath))) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `CSS snippet not found: ${filename}`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const content = await this.app.vault.adapter.read(snippetPath)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `## ${filename}\n\n\`\`\`css\n${content}\n\`\`\``,
          },
        }
      }

      if (name === 'edit_css_snippet') {
        const filename = parsedArgs['filename']
        const oldString = parsedArgs['old_string']
        const newString = parsedArgs['new_string']

        if (typeof filename !== 'string' || !filename) {
          return {
            status: ToolCallResponseStatus.Error,
            error: 'Missing or invalid "filename" parameter.',
          }
        }
        if (typeof oldString !== 'string') {
          return {
            status: ToolCallResponseStatus.Error,
            error: 'Missing or invalid "old_string" parameter.',
          }
        }
        if (typeof newString !== 'string') {
          return {
            status: ToolCallResponseStatus.Error,
            error: 'Missing or invalid "new_string" parameter.',
          }
        }

        const snippetPath = cssSnippetPath(filename)
        if (!(await this.app.vault.adapter.exists(snippetPath))) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `CSS snippet not found: ${filename}`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const content = await this.app.vault.adapter.read(snippetPath)

        const occurrences = countOccurrences(content, oldString)
        if (occurrences === 0) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              `Text not found in the snippet. The exact text including all whitespace must match. Snippet content:\n\n\`\`\`css\n${content}\n\`\`\``,
          }
        }
        if (occurrences > 1) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              `Found ${occurrences} matches — the old_string must be unique. Include more surrounding context (2-3 lines). Try again with a longer match from:\n\n\`\`\`css\n${content}\n\`\`\``,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        const newContent = content.replace(oldString, newString)
        await this.app.vault.adapter.write(snippetPath, newContent)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `CSS snippet edited successfully: ${filename}`,
          },
        }
      }

      if (name === 'css_snippet_operation') {
        const action = parsedArgs['action']
        const filename = parsedArgs['filename']

        if (typeof filename !== 'string' || !filename) {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "filename" parameter.',
          }
        }
        if (action !== 'create' && action !== 'delete') {
          return {
            status: ToolCallResponseStatus.Error,
            error:
              'Missing or invalid "action" parameter. Must be "create" or "delete".',
          }
        }

        if (action === 'create') {
          if (!filename.endsWith('.css')) {
            return {
              status: ToolCallResponseStatus.Error,
              error:
                'Filename must end with .css (e.g., "my-theme.css").',
            }
          }
          const content = parsedArgs['content']
          if (typeof content !== 'string') {
            return {
              status: ToolCallResponseStatus.Error,
              error:
                'Missing or invalid "content" parameter. Provide the CSS content for "create" action.',
            }
          }

          const snippetPath = cssSnippetPath(filename)

          if (await this.app.vault.adapter.exists(snippetPath)) {
            return {
              status: ToolCallResponseStatus.Error,
              error: `A CSS snippet already exists at: ${filename}`,
            }
          }

          // Ensure .obsidian/snippets directory exists
          const snippetsDir = normalizePath('.obsidian/snippets')
          if (!(await this.app.vault.adapter.exists(snippetsDir))) {
            const obsidianDir = normalizePath('.obsidian')
            if (!(await this.app.vault.adapter.exists(obsidianDir))) {
              await this.app.vault.adapter.mkdir(obsidianDir)
            }
            await this.app.vault.adapter.mkdir(snippetsDir)
          }

          if (compositeSignal.aborted) {
            return { status: ToolCallResponseStatus.Aborted }
          }

          await this.app.vault.adapter.write(snippetPath, content)

          return {
            status: ToolCallResponseStatus.Success,
            data: {
              type: 'text',
              text: `CSS snippet created successfully: ${filename}`,
            },
          }
        }

        // action === 'delete'
        const snippetPath = cssSnippetPath(filename)

        if (!(await this.app.vault.adapter.exists(snippetPath))) {
          return {
            status: ToolCallResponseStatus.Error,
            error: `CSS snippet not found: ${filename}`,
          }
        }

        if (compositeSignal.aborted) {
          return { status: ToolCallResponseStatus.Aborted }
        }

        await this.app.vault.adapter.remove(snippetPath)

        return {
          status: ToolCallResponseStatus.Success,
          data: {
            type: 'text',
            text: `CSS snippet deleted: ${filename}`,
          },
        }
      }

      return {
        status: ToolCallResponseStatus.Error,
        error: `Unknown built-in tool: ${name}`,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { status: ToolCallResponseStatus.Aborted }
      }
      return {
        status: ToolCallResponseStatus.Error,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }
    } finally {
      if (id !== undefined) {
        this.activeToolCalls.delete(id)
      }
    }
  }
}

function countOccurrences(str: string, search: string): number {
  if (!search) return 0
  let count = 0
  let pos = 0
  while ((pos = str.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}
