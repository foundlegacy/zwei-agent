import { App, Notice } from 'obsidian'
import { useState } from 'react'

import { PROVIDER_TYPES_INFO } from '../../../constants'
import ZuluAgentPlugin from '../../../main'
import { ChatModel } from '../../../types/chat-model.types'
import { LLMProviderType } from '../../../types/provider.types'
import { ObsidianButton } from '../../../components/common/ObsidianButton'
import { ObsidianDropdown } from '../../../components/common/ObsidianDropdown'
import { ObsidianSetting } from '../../../components/common/ObsidianSetting'
import { ObsidianTextInput } from '../../../components/common/ObsidianTextInput'
import { ReactModal } from '../../../components/common/ReactModal'

type AddChatModelComponentProps = {
  plugin: ZuluAgentPlugin
  onClose: () => void
}

function AddChatModelComponent({ plugin, onClose }: AddChatModelComponentProps) {
  const [providerId, setProviderId] = useState('')
  const [modelId, setModelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [temperature, setTemperature] = useState('0.6')

  const handleSubmit = async () => {
    const settings = plugin.settings

    if (!providerId) {
      new Notice('Please select a provider')
      return
    }
    if (!modelId.trim()) {
      new Notice('Please enter a model ID')
      return
    }
    if (!modelName.trim()) {
      new Notice('Please enter a model name')
      return
    }

    const parsedTemp = parseFloat(temperature)
    if (isNaN(parsedTemp) || parsedTemp < 0 || parsedTemp > 2) {
      new Notice('Temperature must be between 0 and 2')
      return
    }

    if (settings.chatModels.some((m) => m.id === modelId.trim())) {
      new Notice('A model with this ID already exists')
      return
    }

    const provider = settings.providers.find((p) => p.id === providerId)
    if (!provider) {
      new Notice('Provider not found')
      return
    }

    const newModel: ChatModel = {
      providerType: provider.type as ChatModel['providerType'],
      providerId: provider.id,
      id: modelId.trim(),
      model: modelName.trim(),
      temperature: parsedTemp,
      enable: true,
    }

    await plugin.setSettings({
      ...settings,
      chatModels: [...settings.chatModels, newModel],
    })

    new Notice(`Added model: ${modelId}`)
    onClose()
  }

  return (
    <>
      <ObsidianSetting name="Provider" desc="Select the API provider for this model" required>
        <ObsidianDropdown
          value={providerId}
          options={Object.fromEntries(
            plugin.settings.providers.map((p) => [
              p.id,
              `${p.id} (${PROVIDER_TYPES_INFO[p.type as LLMProviderType]?.label ?? p.type})`,
            ]),
          )}
          onChange={(value) => setProviderId(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting name="Model ID" desc="A unique identifier for this model (e.g. 'my-custom-model')" required>
        <ObsidianTextInput
          value={modelId}
          placeholder="my-custom-model"
          onChange={(value) => setModelId(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting name="Model Name" desc="The API model name (e.g. 'gpt-4o' or 'deepseek-chat')" required>
        <ObsidianTextInput
          value={modelName}
          placeholder="gpt-4o"
          onChange={(value) => setModelName(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting name="Temperature" desc="Controls randomness (0-2, default 0.6)">
        <ObsidianTextInput
          value={temperature}
          placeholder="0.6"
          onChange={(value) => setTemperature(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting>
        <ObsidianButton text="Add" onClick={handleSubmit} cta />
        <ObsidianButton text="Cancel" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}

export class AddChatModelModal extends ReactModal<AddChatModelComponentProps> {
  constructor(app: App, plugin: ZuluAgentPlugin) {
    super({
      app,
      Component: AddChatModelComponent,
      props: { plugin },
      options: {
        title: 'Add Model',
      },
    })
  }
}
