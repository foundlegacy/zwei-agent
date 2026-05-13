import { useMemo } from 'react'

import { useApp } from '../contexts/app-context'
import { useSettings } from '../contexts/settings-context'
import { ChatManager } from '../database/json/chat/ChatManager'
import { ChatConversation } from '../database/json/chat/types'
import { TemplateManager } from '../database/json/template/TemplateManager'
import { Template } from '../database/json/template/types'
import { ZuluAgentSettings } from '../settings/schema/setting.types'

export function useTemplateManager() {
  const app = useApp()
  const { settings, setSettings } = useSettings()
  return useMemo(
    () =>
      new TemplateManager(app, {
        getTemplates: () => settings.templates as Template[],
        saveTemplates: async (templates: Template[]) => {
          await setSettings({
            ...settings,
            templates: templates as ZuluAgentSettings['templates'],
          })
        },
      }),
    [app, settings, setSettings],
  )
}

export function useChatManager() {
  const app = useApp()
  const { settings, setSettings } = useSettings()
  return useMemo(
    () =>
      new ChatManager(app, {
        getChatHistories: () => settings.chatHistories as ChatConversation[],
        saveChatHistories: async (histories: ChatConversation[]) => {
          await setSettings({
            ...settings,
            chatHistories:
              histories as ZuluAgentSettings['chatHistories'],
          })
        },
      }),
    [app, settings, setSettings],
  )
}
