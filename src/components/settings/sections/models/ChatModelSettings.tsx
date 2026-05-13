import { App, Notice } from 'obsidian'
import { useState } from 'react'

import ZuluAgentPlugin from '../../../../main'
import { ChatModel, chatModelSchema } from '../../../../types/chat-model.types'
import { ObsidianButton } from '../../../common/ObsidianButton'
import { ObsidianDropdown } from '../../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../../common/ObsidianToggle'
import { ReactModal } from '../../../common/ReactModal'

type SettingsComponentProps = {
  model: ChatModel
  plugin: ZuluAgentPlugin
  onClose: () => void
}

export class ChatModelSettingsModal extends ReactModal<SettingsComponentProps> {
  constructor(model: ChatModel, app: App, plugin: ZuluAgentPlugin) {
    const modelSettings = getModelSettings(model)
    super({
      app: app,
      Component: modelSettings
        ? modelSettings.SettingsComponent
        : () => <div>No settings available for this model</div>,
      props: { model, plugin },
      options: {
        title: `Edit Chat Model: ${model.id}`,
      },
    })
  }
}

type ModelSettingsRegistry = {
  check: (model: ChatModel) => boolean
  SettingsComponent: React.FC<SettingsComponentProps>
}

type PricingValues = {
  inputCached: string
  inputCacheMiss: string
  output: string
}

function usePricingState(model: ChatModel): {
  pricingValues: PricingValues
  setPricingValues: React.Dispatch<React.SetStateAction<PricingValues>>
  buildPricing: () => { inputCached: number; inputCacheMiss: number; output: number } | undefined
} {
  const pricing = 'pricing' in model ? (model as any).pricing : undefined
  const [pricingValues, setPricingValues] = useState<PricingValues>({
    inputCached: pricing?.inputCached?.toString() ?? '',
    inputCacheMiss: pricing?.inputCacheMiss?.toString() ?? '',
    output: pricing?.output?.toString() ?? '',
  })

  const buildPricing = () => {
    const cached = pricingValues.inputCached === '' ? undefined : parseFloat(pricingValues.inputCached)
    const miss = pricingValues.inputCacheMiss === '' ? undefined : parseFloat(pricingValues.inputCacheMiss)
    const out = pricingValues.output === '' ? undefined : parseFloat(pricingValues.output)
    if (cached === undefined && miss === undefined && out === undefined) return undefined
    return {
      inputCached: cached ?? 0,
      inputCacheMiss: miss ?? 0,
      output: out ?? 0,
    }
  }

  return { pricingValues, setPricingValues, buildPricing }
}

function PricingSection({
  pricingValues,
  setPricingValues,
}: {
  pricingValues: PricingValues
  setPricingValues: React.Dispatch<React.SetStateAction<PricingValues>>
}) {
  const update = (field: keyof PricingValues, value: string) => {
    setPricingValues((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <>
      <div className="za-settings-separator" />
      <div className="za-settings-sub-header">Pricing (per 1M tokens)</div>
      <ObsidianSetting
        name="Input Cached / 1M"
        desc="Price per 1 million cached input tokens (cache hit). Leave empty to use default pricing."
      >
        <ObsidianTextInput
          value={pricingValues.inputCached}
          placeholder="0.00"
          onChange={(value: string) => update('inputCached', value)}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name="Input Cache Miss / 1M"
        desc="Price per 1 million uncached input tokens (cache miss). Leave empty to use default pricing."
      >
        <ObsidianTextInput
          value={pricingValues.inputCacheMiss}
          placeholder="0.00"
          onChange={(value: string) => update('inputCacheMiss', value)}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name="Output / 1M"
        desc="Price per 1 million output tokens. Leave empty to use default pricing."
      >
        <ObsidianTextInput
          value={pricingValues.output}
          placeholder="0.00"
          onChange={(value: string) => update('output', value)}
        />
      </ObsidianSetting>
    </>
  )
}

function ReasoningSection({
  reasoningEnabled,
  setReasoningEnabled,
  reasoningEffort,
  setReasoningEffort,
}: {
  reasoningEnabled: boolean
  setReasoningEnabled: (value: boolean) => void
  reasoningEffort: string
  setReasoningEffort: (value: string) => void
}) {
  return (
    <>
      <ObsidianSetting
        name="Reasoning"
        desc="Enable reasoning/thinking mode for this model."
      >
        <ObsidianToggle
          value={reasoningEnabled}
          onChange={(value: boolean) => setReasoningEnabled(value)}
        />
      </ObsidianSetting>
      {reasoningEnabled && (
        <ObsidianSetting
          name="Reasoning Effort"
          desc={`Controls reasoning depth level. Default is "medium".`}
          className="za-setting-item--nested"
          required
        >
          <ObsidianDropdown
            value={reasoningEffort}
            options={{
              low: 'low',
              medium: 'medium',
              high: 'high',
              xhigh: 'xhigh',
            }}
            onChange={(value: string) => setReasoningEffort(value)}
          />
        </ObsidianSetting>
      )}
    </>
  )
}

const MODEL_SETTINGS_REGISTRY: ModelSettingsRegistry[] = [
  {
    check: (model) => model.providerType === 'openai' || model.providerType === 'local',

    SettingsComponent: (props: SettingsComponentProps) => {
      const { model: initialModel, plugin, onClose } = props
      const [temperature, setTemperature] = useState(
        initialModel.temperature?.toString() ?? '0.6',
      )
      const [reasoningEnabled, setReasoningEnabled] = useState<boolean>(
        (initialModel as any).reasoning?.enabled ?? false,
      )
      const [reasoningEffort, setReasoningEffort] = useState<string>(
        (initialModel as any).reasoning?.reasoning_effort ?? 'medium',
      )
      const { pricingValues, setPricingValues, buildPricing } = usePricingState(initialModel)

      const handleSubmit = async () => {
        const parsedTemp = parseFloat(temperature)
        if (isNaN(parsedTemp) || parsedTemp < 0 || parsedTemp > 2) {
          new Notice('Temperature must be between 0 and 2')
          return
        }

        const updatedModel: Record<string, unknown> = {
          ...initialModel,
          temperature: parsedTemp,
          reasoning: {
            enabled: reasoningEnabled,
            reasoning_effort: reasoningEffort as
              | 'low'
              | 'medium'
              | 'high'
              | 'xhigh',
          },
          pricing: buildPricing(),
        }

        const validationResult = chatModelSchema.safeParse(updatedModel)
        if (!validationResult.success) {
          new Notice(
            validationResult.error.issues.map((v) => v.message).join('\n'),
          )
          return
        }

        await plugin.setSettings({
          ...plugin.settings,
          chatModels: plugin.settings.chatModels.map((m) =>
            m.id === initialModel.id ? (updatedModel as ChatModel) : m,
          ),
        })
        onClose()
      }

      return (
        <>
          <ObsidianSetting
            name="Temperature"
            desc="Controls randomness in responses. Lower values are more deterministic (0-2). Default is 0.6."
            required
          >
            <ObsidianTextInput
              value={temperature}
              placeholder="0.6"
              onChange={(value: string) => setTemperature(value)}
              type="number"
            />
          </ObsidianSetting>

          <ReasoningSection
            reasoningEnabled={reasoningEnabled}
            setReasoningEnabled={setReasoningEnabled}
            reasoningEffort={reasoningEffort}
            setReasoningEffort={setReasoningEffort}
          />

          <PricingSection pricingValues={pricingValues} setPricingValues={setPricingValues} />

          <ObsidianSetting>
            <ObsidianButton text="Save" onClick={handleSubmit} cta />
            <ObsidianButton text="Cancel" onClick={onClose} />
          </ObsidianSetting>
        </>
      )
    },
  },
]

function getModelSettings(model: ChatModel): ModelSettingsRegistry | undefined {
  return MODEL_SETTINGS_REGISTRY.find((registry) => registry.check(model))
}

export function hasChatModelSettings(model: ChatModel): boolean {
  return !!getModelSettings(model)
}
