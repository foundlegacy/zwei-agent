import {
  ZuluAgentSettings,
  zuluAgentSettingsSchema,
} from './setting.types'

export function parseZuluAgentSettings(
  data: unknown,
): ZuluAgentSettings {
  try {
    return zuluAgentSettingsSchema.parse(data)
  } catch (error) {
    console.warn('Invalid settings provided, using defaults:', error)
    return zuluAgentSettingsSchema.parse({})
  }
}
