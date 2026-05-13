import { Edit, Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { usePlugin } from '../../../contexts/plugin-context'
import { TemplateManager } from '../../../database/json/template/TemplateManager'
import { Template, TemplateMetadata } from '../../../database/json/template/types'
import { ZuluAgentSettings } from '../../../settings/schema/setting.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  CreateTemplateModal,
  EditTemplateModal,
} from '../../modals/TemplateFormModal'

type TemplateSectionProps = {
  app: App
}

export function TemplateSection({ app }: TemplateSectionProps) {
  const { settings, setSettings } = useSettings()
  const plugin = usePlugin()
  const templateManager = useMemo(
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

  const [templateList, setTemplateList] = useState<TemplateMetadata[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchTemplateList = useCallback(async () => {
    setIsLoading(true)
    try {
      setTemplateList(await templateManager.listMetadata())
    } catch (error) {
      console.error('Failed to fetch saved prompt list:', error)
          new Notice(
            'Failed to load saved prompts. Please try refreshing the settings.',
          )
      setTemplateList([])
    } finally {
      setIsLoading(false)
    }
  }, [templateManager])

  const handleCreate = useCallback(() => {
    new CreateTemplateModal({
      app,
      plugin,
      selectedSerializedNodes: null,
      onSubmit: fetchTemplateList,
    }).open()
  }, [fetchTemplateList, app, plugin])

  const handleEdit = useCallback(
    (template: TemplateMetadata) => {
      new EditTemplateModal({
        app,
        plugin,
        templateId: template.id,
      onSubmit: () => { void fetchTemplateList() },
      }).open()
    },
    [fetchTemplateList, app, plugin],
  )

  const handleDelete = useCallback(
    (template: TemplateMetadata) => {
      const message = `Are you sure you want to delete saved prompt "${template.name}"?`
      new ConfirmModal(app, {
        title: 'Delete Saved Prompt',
        message: message,
        ctaText: 'Delete',
        onConfirm: () => {
          void templateManager.deleteTemplate(template.id).then(() => {
            void fetchTemplateList()
          }).catch((error: Error) => {
            console.error('Failed to delete saved prompt:', error)
            new Notice('Failed to delete saved prompt. Please try again.')
          })
        },
      }).open()
    },
    [templateManager, fetchTemplateList, app],
  )

  useEffect(() => {
    void fetchTemplateList()
  }, [fetchTemplateList])

  return (
    <div className="za-settings-section">
      <div className="za-settings-header">Saved Prompts</div>

      <div className="za-settings-desc">
        Create saved prompts with reusable content that you can quickly insert into
        your chat. Type <code>/prompt-name</code> in the chat input to trigger
        prompt insertion.
      </div>

      <div className="za-settings-sub-header-container">
        <div className="za-settings-sub-header">Saved Prompts</div>
        <ObsidianButton text="Add Saved Prompt" onClick={handleCreate} />
      </div>

      <div className="za-templates-grid">
        {isLoading ? (
          <div className="za-templates-empty">Loading saved prompts...</div>
        ) : templateList.length > 0 ? (
          templateList.map((template) => (
            <TemplateItem
              key={template.id}
              template={template}
              onDelete={() => {
                handleDelete(template)
              }}
              onEdit={() => {
                handleEdit(template)
              }}
            />
          ))
        ) : (
          <div className="za-templates-empty">No saved prompts found</div>
        )}
      </div>
    </div>
  )
}

function TemplateItem({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateMetadata
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="za-template-card">
      <div className="za-template-card-header">
        <div className="za-template-card-name">{template.name}</div>
        <div className="za-template-card-actions">
          <button
            className="clickable-icon"
            aria-label="Edit Saved Prompt"
            onClick={onEdit}
          >
            <Edit size={16} />
          </button>
          <button
            className="clickable-icon"
            aria-label="Delete Saved Prompt"
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
