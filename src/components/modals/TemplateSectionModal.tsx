import { App, Modal } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import { AppProvider } from '../../contexts/app-context'
import { PluginProvider } from '../../contexts/plugin-context'
import { SettingsProvider } from '../../contexts/settings-context'
import ZuluAgentPlugin from '../../main'
import { TemplateSection } from '../settings/sections/TemplateSection'

type TemplateSectionModalProps = {
  app: App
  plugin: ZuluAgentPlugin
}

function TemplateSectionWrapper({
  app,
  plugin,
}: TemplateSectionModalProps) {
  return (
    <PluginProvider plugin={plugin}>
      <AppProvider app={app}>
        <SettingsProvider
          settings={plugin.settings}
          setSettings={(newSettings) => plugin.setSettings(newSettings)}
          addSettingsChangeListener={(listener) =>
            plugin.addSettingsChangeListener(listener)
          }
        >
          <TemplateSection app={app} />
        </SettingsProvider>
      </AppProvider>
    </PluginProvider>
  )
}

export class TemplateSectionModal extends Modal {
  private root: Root | null = null
  private plugin: ZuluAgentPlugin

  constructor(app: App, plugin: ZuluAgentPlugin) {
    super(app)
    this.plugin = plugin
  }

  onOpen() {
    this.root = createRoot(this.contentEl)
    this.root.render(
      <TemplateSectionWrapper
        app={this.app}
        plugin={this.plugin}
      />,
    )
    this.modalEl.style.width = '720px'
  }

  onClose() {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
    this.contentEl.empty()
  }
}
