import { App } from 'obsidian'
import React from 'react'

import ZuluAgentPlugin from '../../../main'

import { ChatModelsSubSection } from './models/ChatModelsSubSection'

type ModelsSectionProps = {
  app: App
  plugin: ZuluAgentPlugin
}

export function ModelsSection({ app, plugin }: ModelsSectionProps) {
  return (
    <div className="za-settings-section">
      <div className="za-settings-header">Configured Models</div>
      <ChatModelsSubSection app={app} plugin={plugin} />
    </div>
  )
}
