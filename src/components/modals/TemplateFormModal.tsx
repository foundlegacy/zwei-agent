import { $generateNodesFromSerializedNodes } from '@lexical/clipboard'
import { BaseSerializedNode } from '@lexical/clipboard/clipboard'
import { InitialEditorStateType } from '@lexical/react/LexicalComposer'
import { $insertNodes, LexicalEditor } from 'lexical'
import { App, Notice } from 'obsidian'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AppProvider } from '../../contexts/app-context'
import { PluginProvider } from '../../contexts/plugin-context'
import { SettingsProvider } from '../../contexts/settings-context'
import { DuplicateTemplateException } from '../../database/json/exception'
import { TemplateManager } from '../../database/json/template/TemplateManager'
import { Template } from '../../database/json/template/types'
import ZuluAgentPlugin from '../../main'
import { ZuluAgentSettings } from '../../settings/schema/setting.types'
import LexicalContentEditable from '../chat-view/chat-input/LexicalContentEditable'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ReactModal } from '../common/ReactModal'

type TemplateFormComponentProps = {
  app: App
  plugin: ZuluAgentPlugin
  selectedSerializedNodes?: BaseSerializedNode[] | null
  templateId?: string
  onSubmit?: () => void
  onClose: () => void
}

export class CreateTemplateModal extends ReactModal<TemplateFormComponentProps> {
  constructor({
    app,
    plugin,
    selectedSerializedNodes,
    onSubmit,
  }: {
    app: App
    plugin: ZuluAgentPlugin
    selectedSerializedNodes?: BaseSerializedNode[] | null
    onSubmit?: () => void
  }) {
    super({
      app: app,
      Component: TemplateFormComponentWrapper,
      props: {
        app,
        plugin,
        selectedSerializedNodes,
        onSubmit,
      },
      options: {
        title: 'Add Saved Prompt',
      },
    })
  }
}

export class EditTemplateModal extends ReactModal<TemplateFormComponentProps> {
  constructor({
    app,
    plugin,
    templateId,
    onSubmit,
  }: {
    app: App
    plugin: ZuluAgentPlugin
    templateId?: string
    onSubmit?: () => void
  }) {
    super({
      app: app,
      Component: TemplateFormComponentWrapper,
      props: {
        app,
        plugin,
        templateId,
        onSubmit,
      },
      options: {
        title: 'Edit Saved Prompt',
      },
    })
  }
}

function TemplateFormComponentWrapper({
  app,
  plugin,
  selectedSerializedNodes,
  templateId,
  onSubmit,
  onClose,
}: TemplateFormComponentProps) {
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
          <TemplateFormComponent
            app={app}
            plugin={plugin}
            selectedSerializedNodes={selectedSerializedNodes}
            templateId={templateId}
            onSubmit={onSubmit}
            onClose={onClose}
          />
        </SettingsProvider>
      </AppProvider>
    </PluginProvider>
  )
}

function TemplateFormComponent({
  app,
  plugin,
  selectedSerializedNodes,
  templateId,
  onSubmit,
  onClose,
}: TemplateFormComponentProps) {
  const settings = plugin.settings
  const templateManager = useMemo(
    () =>
      new TemplateManager(app, {
        getTemplates: () => settings.templates as Template[],
        saveTemplates: async (templates: Template[]) => {
          await plugin.setSettings({
            ...plugin.settings,
            templates: templates as ZuluAgentSettings['templates'],
          })
        },
      }),
    [app, settings, plugin],
  )

  const [templateName, setTemplateName] = useState('')
  const editorRef = useRef<LexicalEditor | null>(null)
  const contentEditableRef = useRef<HTMLDivElement>(null)

  const initialEditorState: InitialEditorStateType = (
    editor: LexicalEditor,
  ) => {
    if (!selectedSerializedNodes) return
    editor.update(() => {
      const parsedNodes = $generateNodesFromSerializedNodes(
        selectedSerializedNodes,
      )
      $insertNodes(parsedNodes)
    })
  }

  const handleSubmit = async () => {
    try {
      if (!editorRef.current) return
      const serializedEditorState = editorRef.current.toJSON()
      const nodes = serializedEditorState.editorState.root.children
      if (nodes.length === 0) {
        new Notice('Please enter a content for your saved prompt')
        return
      }
      if (templateName.trim().length === 0) {
        new Notice('Please enter a name for your saved prompt')
        return
      }

      if (templateId === undefined) {
        await templateManager.createTemplate({
          name: templateName,
          content: { nodes },
        })
      } else {
        await templateManager.updateTemplate(templateId, {
          name: templateName,
          content: { nodes },
        })
      }

      new Notice(
        `Saved prompt ${templateId === undefined ? 'created' : 'updated'}: ${templateName}`,
      )

      onSubmit?.()
      onClose()
    } catch (error) {
      if (error instanceof DuplicateTemplateException) {
        new Notice('A saved prompt with this name already exists')
      } else {
        console.error(error)
        new Notice('Failed to create saved prompt')
      }
    }
  }

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    async function fetchExistingTemplate(templateId: string) {
      try {
        const existingTemplate = await templateManager.findById(templateId)
        if (existingTemplate && isMountedRef.current) {
          setTemplateName(existingTemplate.name)
          editorRef.current?.update(() => {
            const parsedNodes = $generateNodesFromSerializedNodes(
              existingTemplate.content.nodes,
            )
            $insertNodes(parsedNodes)
          })
        }
      } catch (error) {
        console.error('Failed to fetch existing saved prompt:', error)
        new Notice('Failed to load saved prompt. Please try again.')
      }
    }
    if (templateId) {
      fetchExistingTemplate(templateId)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [templateId, templateManager])

  return (
    <>
      <ObsidianSetting name="Name" desc="The name of the saved prompt" required>
        <ObsidianTextInput
          value={templateName}
          onChange={(value) => setTemplateName(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name="Saved Prompt Content"
        desc="Content of the saved prompt"
        className="za-settings-description-preserve-whitespace"
        required
      />
      <div className="za-chat-user-input-container">
        <LexicalContentEditable
          initialEditorState={initialEditorState}
          editorRef={editorRef}
          contentEditableRef={contentEditableRef}
          onEnter={handleSubmit}
        />
      </div>

      <ObsidianSetting>
        <ObsidianButton text="Save" onClick={handleSubmit} cta />
        <ObsidianButton text="Cancel" onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
