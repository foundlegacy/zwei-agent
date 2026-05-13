import { App, PluginSettingTab } from 'obsidian'
import { Root, createRoot } from 'react-dom/client'

import { SettingsTabRoot } from '../components/settings/SettingsTabRoot'
import { PluginProvider } from '../contexts/plugin-context'
import { SettingsProvider } from '../contexts/settings-context'
import ZuluAgentPlugin from '../main'

export class ZuluAgentSettingTab extends PluginSettingTab {
  plugin: ZuluAgentPlugin
  private root: Root | null = null

  constructor(app: App, plugin: ZuluAgentPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    this.root = createRoot(containerEl)
    this.root.render(
      <PluginProvider plugin={this.plugin}>
        <SettingsProvider
          settings={this.plugin.settings}
          setSettings={(newSettings) => this.plugin.setSettings(newSettings)}
          addSettingsChangeListener={(listener) =>
            this.plugin.addSettingsChangeListener(listener)
          }
        >
          <SettingsTabRoot app={this.app} plugin={this.plugin} />
        </SettingsProvider>
      </PluginProvider>,
    )
  }

  hide(): void {
    if (this.root) {
      this.root.unmount()
      this.root = null
    }
  }
}
