import { Editor, MarkdownView, Notice, Plugin } from 'obsidian'

import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/Chat'
import { CHAT_VIEW_TYPE } from './constants'
import {
  ZuluAgentSettings,
  zuluAgentSettingsSchema,
} from './settings/schema/setting.types'
import { parseZuluAgentSettings } from './settings/schema/settings'
import { ZuluAgentSettingTab } from './settings/SettingTab'
import { getMentionableBlockData } from './utils/obsidian'

export default class ZuluAgentPlugin extends Plugin {
  settings: ZuluAgentSettings
  initialChatProps?: ChatProps
  settingsChangeListeners: ((newSettings: ZuluAgentSettings) => void)[] = []

  async onload() {
    try {
      await this.loadSettings()
    } catch (error) {
      console.error('[Zulu Agent] Failed to load settings, using defaults:', error)
      this.settings = parseZuluAgentSettings({})
      await this.saveData(this.settings)
    }

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this))

    this.addRibbonIcon('cog', 'Open Zulu Agent', () =>
      this.openChatView(),
    )

    this.addCommand({
      id: 'open-new-chat',
      name: 'Open chat',
      callback: () => this.openChatView(true),
    })

    this.addCommand({
      id: 'add-selection-to-chat',
      name: 'Add selection to chat',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.addSelectionToChat(editor, view)
      },
    })

    this.addSettingTab(new ZuluAgentSettingTab(this.app, this))
  }

  onunload() {}

  async loadSettings() {
    this.settings = parseZuluAgentSettings(await this.loadData())
  }

  async setSettings(newSettings: ZuluAgentSettings) {
    const validationResult = zuluAgentSettingsSchema.safeParse(newSettings)

    if (!validationResult.success) {
      new Notice(`Invalid settings:
${validationResult.error.issues.map((v) => v.message).join('\n')}`)
      return
    }

    this.settings = newSettings
    await this.saveData(newSettings)
    this.settingsChangeListeners.forEach((listener) => listener(newSettings))
  }

  addSettingsChangeListener(
    listener: (newSettings: ZuluAgentSettings) => void,
  ) {
    this.settingsChangeListeners.push(listener)
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(
        (l) => l !== listener,
      )
    }
  }

  async openChatView(openNewChat = false) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView)
    const editor = view?.editor
    if (!view || !editor) {
      this.activateChatView(undefined, openNewChat)
      return
    }
    const selectedBlockData = await getMentionableBlockData(editor, view)
    this.activateChatView(
      {
        selectedBlock: selectedBlockData ?? undefined,
      },
      openNewChat,
    )
  }

  async activateChatView(chatProps?: ChatProps, openNewChat = false) {
    this.initialChatProps = chatProps

    const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]

    await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({
      type: CHAT_VIEW_TYPE,
      active: true,
    })

    if (openNewChat && leaf && leaf.view instanceof ChatView) {
      leaf.view.openNewChat(chatProps?.selectedBlock)
    }

    this.app.workspace.revealLeaf(
      this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0],
    )
  }

  async addSelectionToChat(editor: Editor, view: MarkdownView) {
    const data = await getMentionableBlockData(editor, view)
    if (!data) return

    const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
    if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
      await this.activateChatView({
        selectedBlock: data,
      })
      return
    }

    await this.app.workspace.revealLeaf(leaves[0])

    const chatView = leaves[0].view
    chatView.addSelectionToChat(data)
    chatView.focusMessage()
  }
}
