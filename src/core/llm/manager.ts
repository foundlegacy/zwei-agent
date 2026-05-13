import { ZuluAgentSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'

import { BaseLLMProvider } from './base'
import { LLMModelNotFoundException } from './exception'
import { OpenAIAuthenticatedProvider } from './openai'

export function getProviderClient({
  providerId,
  model,
  settings,
  setSettings,
}: {
  providerId: string
  model?: ChatModel
  settings: ZuluAgentSettings
  setSettings?: (newSettings: ZuluAgentSettings) => void | Promise<void>
}): BaseLLMProvider<LLMProvider> {
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  const onProviderUpdate = setSettings
    ? async (targetProviderId: string, update: Partial<LLMProvider>) => {
        const updatedProviders: LLMProvider[] = settings.providers.map(
          (item) =>
            item.id === targetProviderId
              ? ({ ...item, ...update } as LLMProvider)
              : item,
        )
        await setSettings({
          ...settings,
          providers: updatedProviders,
        })
      }
    : undefined

  return new OpenAIAuthenticatedProvider(provider)
}

export function getChatModelClient({
  modelId,
  settings,
  setSettings,
}: {
  modelId: string
  settings: ZuluAgentSettings
  setSettings: (newSettings: ZuluAgentSettings) => void | Promise<void>
}): {
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
} {
  const chatModel = settings.chatModels.find((model) => model.id === modelId)
  if (!chatModel) {
    throw new LLMModelNotFoundException(`Chat model ${modelId} not found`)
  }

  const providerClient = getProviderClient({
    providerId: chatModel.providerId,
    model: chatModel,
    settings,
    setSettings,
  })

  return {
    providerClient,
    model: chatModel,
  }
}
