import { z } from 'zod'

import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_PROVIDERS,
} from '../../constants'
import { chatModelSchema } from '../../types/chat-model.types'
import { llmProviderSchema } from '../../types/provider.types'

/**
 * Settings
 */

export const zuluAgentSettingsSchema = z.object({
  providers: z.array(llmProviderSchema).catch([...DEFAULT_PROVIDERS]),

  chatModels: z.array(chatModelSchema).catch([...DEFAULT_CHAT_MODELS]),

  chatModelId: z
    .string()
    .catch(
      DEFAULT_CHAT_MODELS.find((v) => v.id === DEFAULT_CHAT_MODEL_ID)?.id ??
        DEFAULT_CHAT_MODELS[0].id,
    ),

  // System Prompt (legacy inline text, kept for backwards compatibility)
  systemPrompt: z.string().catch(''),

  // System Prompt from .md file
  systemPromptEnabled: z.boolean().catch(false),
  systemPromptFilePath: z.string().catch(''),

  // Chat options
  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean(),
      maxAutoIterations: z.number(),
      includeVaultStructure: z.boolean(),
      vaultStructureFolders: z.array(z.string()),
      includeAllVaultFileTypes: z.boolean(),
      includeVaultRootFiles: z.boolean(),
    })
    .catch({
      includeCurrentFileContent: true,
      maxAutoIterations: 10,
      includeVaultStructure: true,
      vaultStructureFolders: [],
      includeAllVaultFileTypes: false,
      includeVaultRootFiles: true,
    }),

  // Tools - list of enabled tool names
  enabledTools: z
    .array(z.string())
    .catch(['read_vault_file', 'edit_vault_file', 'search_vault', 'search_files', 'file_operation', 'folder_operation', 'rename_file', 'rename_folder', 'list_css_snippets', 'read_css_snippet', 'edit_css_snippet', 'css_snippet_operation']),

  // Templates stored in data.json
  templates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        content: z
          .object({
            nodes: z.array(z.unknown()),
          })
          .catch({ nodes: [] }),
        createdAt: z.number(),
        updatedAt: z.number(),
      }),
    )
    .catch([]),

  // Chat histories stored in data.json
  chatHistories: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        messages: z.array(z.unknown()),
        createdAt: z.number(),
        updatedAt: z.number(),
      }),
    )
    .catch([]),
})
export type ZuluAgentSettings = z.infer<typeof zuluAgentSettingsSchema>
