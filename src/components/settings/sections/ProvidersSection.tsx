import { Settings, Trash2 } from 'lucide-react'
import { App } from 'obsidian'
import React from 'react'

import {
  DEFAULT_PROVIDERS,
  PROVIDER_TYPES_INFO,
} from '../../../constants'
import { useSettings } from '../../../contexts/settings-context'
import ZuluAgentPlugin from '../../../main'
import { LLMProvider, LLMProviderType } from '../../../types/provider.types'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddProviderModal,
  EditProviderModal,
} from '../modals/ProviderFormModal'

type ProvidersSectionProps = {
  app: App
  plugin: ZuluAgentPlugin
}

export function ProvidersSection({ app, plugin }: ProvidersSectionProps) {
  const { settings, setSettings } = useSettings()

  const handleDeleteProvider = async (provider: LLMProvider) => {
    const associatedChatModels = settings.chatModels.filter(
      (m) => m.providerId === provider.id,
    )

    const message =
      `Are you sure you want to delete provider "${provider.id}"?\n\n` +
      `This will also delete:\n` +
      `- ${associatedChatModels.length} chat model(s)`

    new ConfirmModal(app, {
      title: 'Delete Provider',
      message: message,
      ctaText: 'Delete',
      onConfirm: async () => {
        await setSettings({
          ...settings,
          providers: [...settings.providers].filter(
            (v) => v.id !== provider.id,
          ),
          chatModels: [...settings.chatModels].filter(
            (v) => v.providerId !== provider.id,
          ),
        })
      },
    }).open()
  }

  return (
    <div className="za-settings-section">
      <div className="za-settings-header">Providers</div>

      <div className="za-settings-desc">
        Configure API providers (usage-based billing). DeepSeek is recommended for good price-intelligence ratio.
      </div>

      <div className="za-settings-table-container">
        <table className="za-settings-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col width={60} />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>API Structure</th>
              <th>API Key</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settings.providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.id}</td>
                <td>{PROVIDER_TYPES_INFO[provider.type as LLMProviderType]?.label ?? provider.type}</td>
                <td
                  className="za-settings-table-api-key"
                  onClick={() => {
                    new EditProviderModal(app, plugin, provider).open()
                  }}
                >
                  {provider.apiKey ? '••••••••' : 'Set API key'}
                </td>
                <td>
                  <div className="za-settings-actions">
                    <button
                      onClick={() => {
                        new EditProviderModal(app, plugin, provider).open()
                      }}
                      className="clickable-icon"
                    >
                      <Settings />
                    </button>
                    {!DEFAULT_PROVIDERS.some((v) => v.id === provider.id) && (
                      <button
                        onClick={() => handleDeleteProvider(provider)}
                        className="clickable-icon"
                      >
                        <Trash2 />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button
                  onClick={() => {
                    new AddProviderModal(app, plugin).open()
                  }}
                >
                  Add provider
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
