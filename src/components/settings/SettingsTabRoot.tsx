import { Coffee, ExternalLink } from 'lucide-react'
import { App } from 'obsidian'
import { useState } from 'react'

import ZuluAgentPlugin from '../../main'

import { ChatSection } from './sections/ChatSection'
import { ModelsSection } from './sections/ModelsSection'
import { ProvidersSection } from './sections/ProvidersSection'
import { SystemSection } from './sections/SystemSection'
import { TemplateSection } from './sections/TemplateSection'
import { ToolsSection } from './sections/ToolsSection'

type SettingsTabRootProps = {
  app: App
  plugin: ZuluAgentPlugin
}

const TABS = [
  { id: 'models', label: 'Models & Providers' },
  { id: 'system', label: 'System' },
  { id: 'tools', label: 'Tools' },
  { id: 'templates', label: 'Saved Prompts' },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsTabRoot({ app, plugin }: SettingsTabRootProps) {
  const [activeTab, setActiveTab] = useState<TabId>('models')

  return (
    <div className="za-settings-root">
      <div className="za-settings-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`za-settings-tab ${activeTab === tab.id ? 'za-settings-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="za-settings-content">
        {activeTab === 'models' && (
          <>
            <a
              href="https://ko-fi.com/foundlegacy"
              target="_blank"
              rel="noopener"
              className="za-settings-kofi-banner"
            >
              <div className="za-settings-kofi-banner-icon">
                <Coffee />
              </div>
              <div className="za-settings-kofi-banner-content">
                <div className="za-settings-kofi-banner-title">
                  Support this plugin on ko-fi
                </div>
                <div className="za-settings-kofi-banner-desc">
                  If you find Zulu Agent useful, consider buying me a coffee
                </div>
              </div>
              <div className="za-settings-kofi-banner-arrow">
                <ExternalLink />
              </div>
            </a>
            <ProvidersSection app={app} plugin={plugin} />
            <ChatSection />
            <ModelsSection app={app} plugin={plugin} />
          </>
        )}
        {activeTab === 'system' && <SystemSection />}
        {activeTab === 'tools' && <ToolsSection />}
        {activeTab === 'templates' && <TemplateSection app={app} />}
      </div>
    </div>
  )
}
