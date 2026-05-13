import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import ZuluAgentPlugin from '../../../main'
import { LLMProvider, LLMProviderType } from '../../../types/provider.types'
import { ObsidianButton } from '../../../components/common/ObsidianButton'
import { ObsidianDropdown } from '../../../components/common/ObsidianDropdown'
import { ObsidianSetting } from '../../../components/common/ObsidianSetting'
import { ObsidianTextInput } from '../../../components/common/ObsidianTextInput'
import { ReactModal } from '../../../components/common/ReactModal'

type ProviderFormComponentProps = {
  plugin: ZuluAgentPlugin
  provider?: LLMProvider
  onClose: () => void
}

function ProviderFormComponent({
  plugin,
  provider,
  onClose,
}: ProviderFormComponentProps) {
  const isEditing = !!provider

  const [providerType, setProviderType] = useState<LLMProviderType>(
    (provider?.type as LLMProviderType) || 'openai',
  )
  const [providerId, setProviderId] = useState(provider?.id ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(provider?.apiKey ?? '')

  const handleSubmit = async () => {
    const settings = plugin.settings

    if (!providerId.trim()) {
      new Notice('Please enter a provider ID')
      return
    }

    if (!isEditing && settings.providers.some((p) => p.id === providerId.trim())) {
      new Notice('A provider with this ID already exists')
      return
    }

    const newProvider: LLMProvider = {
      type: providerType,
      id: providerId.trim(),
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    }

    await plugin.setSettings({
      ...settings,
      providers: isEditing
        ?         settings.providers.map((p) => (p.id === provider.id ? newProvider : p))
        : [...settings.providers, newProvider],
    })

    new Notice(isEditing ? `Updated provider: ${providerId}` : `Added provider: ${providerId}`)
    onClose()
  }

  const typeInfo = PROVIDER_TYPES_INFO[providerType]

  return (
    <>
      <ObsidianSetting
        name="API Structure"
        desc="The API structure used by the provider. If you are not sure, select OpenAI."
        required
      >
        <ObsidianDropdown
          value={providerType}
          options={Object.fromEntries(
            Object.entries(PROVIDER_TYPES_INFO).map(([key, info]) => [
              key,
              info.label,
            ]),
          )}
          onChange={(value) => setProviderType(value as LLMProviderType)}
        />
      </ObsidianSetting>

      <ObsidianSetting name="Provider ID" desc="A unique identifier for this provider (e.g. 'openai')" required>
        <ObsidianTextInput
          value={providerId}
          placeholder="openai"
          onChange={(value) => setProviderId(value)}
        />
      </ObsidianSetting>

      {typeInfo.requireApiKey && (
        <ObsidianSetting name="API Key" desc="Your API key for authentication" required>
          <ObsidianTextInput
            value={apiKey}
            placeholder="sk-..."
            onChange={(value) => setApiKey(value)}
          />
        </ObsidianSetting>
      )}

      {typeInfo.requireBaseUrl && (
        <ObsidianSetting name="Base URL" desc="Custom API endpoint URL (optional)">
          <ObsidianTextInput
            value={baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(value) => setBaseUrl(value)}
          />
        </ObsidianSetting>
      )}

      <ObsidianSetting>
        <ObsidianButton text={isEditing ? 'Save' : 'Add'} onClick={() => void handleSubmit()} cta />
        <ObsidianButton text="Cancel" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}

export class AddProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: ZuluAgentPlugin) {
    super({
      app,
      Component: ProviderFormComponent,
      props: { plugin },
      options: {
        title: 'Add Provider',
      },
    })
  }
}

export class EditProviderModal extends ReactModal<ProviderFormComponentProps> {
  constructor(app: App, plugin: ZuluAgentPlugin, provider: LLMProvider) {
    super({
      app,
      Component: ProviderFormComponent,
      props: { plugin, provider },
      options: {
        title: `Edit Provider: ${provider.id}`,
      },
    })
  }
}
