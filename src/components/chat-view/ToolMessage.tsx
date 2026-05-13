import clsx from 'clsx'
import { Check, ChevronDown, ChevronRight, Cog, X } from 'lucide-react'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'

import { ChatToolMessage } from '../../types/chat'
import {
  ToolCallRequest,
  ToolCallResponse,
  ToolCallResponseStatus,
} from '../../types/tool-call.types'
import { ToolManager } from '../../core/tools/toolManager'

import { ObsidianCodeBlock } from './ObsidianMarkdown'

const STATUS_LABELS: Record<ToolCallResponseStatus, string> = {
  [ToolCallResponseStatus.PendingApproval]: 'Call',
  [ToolCallResponseStatus.Rejected]: 'Rejected',
  [ToolCallResponseStatus.Running]: 'Running',
  [ToolCallResponseStatus.Success]: 'Called',
  [ToolCallResponseStatus.Error]: 'Failed',
  [ToolCallResponseStatus.Aborted]: 'Aborted',
}

export const getToolMessageContent = (message: ChatToolMessage): string => {
  return message.toolCalls
    ?.map((toolCall) => {
      return [
        `${STATUS_LABELS[toolCall.response.status]} ${toolCall.request.name}`,
        ...(toolCall.request.arguments
          ? [`Parameters: ${toolCall.request.arguments}`]
          : []),
      ].join('\n')
    })
    .join('\n')
}

const ToolMessage = memo(function ToolMessage({
  message,
  toolManager,
  onMessageUpdate,
}: {
  message: ChatToolMessage
  toolManager: ToolManager
  onMessageUpdate: (message: ChatToolMessage) => void
}) {
  return (
    <div className="za-toolcall-container">
      {message.toolCalls.map((toolCall, index) => (
        <div
          key={toolCall.request.id}
          className={clsx(index > 0 && 'za-toolcall-border-top')}
        >
          <ToolCallItem
            request={toolCall.request}
            response={toolCall.response}
            toolManager={toolManager}
            onResponseUpdate={(response) =>
              onMessageUpdate({
                ...message,
                toolCalls: message.toolCalls.map((t) =>
                  t.request.id === toolCall.request.id ? { ...t, response } : t,
                ),
              })
            }
          />
        </div>
      ))}
    </div>
  )
})

function ToolCallItem({
  request,
  response,
  toolManager,
  onResponseUpdate,
}: {
  request: ToolCallRequest
  response: ToolCallResponse
  toolManager: ToolManager
  onResponseUpdate: (response: ToolCallResponse) => void
}) {
  const {
    handleToolCall,
    handleReject,
    handleAbort,
  } = useToolCall(request, toolManager, onResponseUpdate)

  const [isOpen, setIsOpen] = useState(
    response.status === ToolCallResponseStatus.PendingApproval,
  )

  // Auto-expand when status transitions to PendingApproval so the user
  // reviews changes before accepting.
  useEffect(() => {
    if (response.status === ToolCallResponseStatus.PendingApproval) {
      setIsOpen(true)
    }
  }, [response.status])

  const toolName = request.name
  const parameters = useMemo(() => {
    if (!request.arguments) {
      return 'No parameters'
    }
    try {
      return JSON.stringify(JSON.parse(request.arguments), null, 2)
    } catch {
      return request.arguments
    }
  }, [request.arguments])

  return (
    <div className="za-toolcall">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="za-toolcall-header"
      >
        <div className="za-toolcall-header-icon">
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        <div className="za-toolcall-header-content">
          <span>{STATUS_LABELS[response.status] || 'Unknown'}</span>
          <span>&nbsp;&nbsp;</span>
          <span className="za-toolcall-header-tool-name">
            {toolName}
          </span>
        </div>
        <div className="za-toolcall-header-icon za-toolcall-header-icon--status">
          <StatusIcon status={response.status} />
        </div>
      </div>
      {isOpen && (
        <div className="za-toolcall-content">
          <div className="za-toolcall-content-section">
            <div>Parameters:</div>
            <ObsidianCodeBlock language="json" content={parameters} />
          </div>
          {response.status === ToolCallResponseStatus.Success && (
            <div className="za-toolcall-content-section">
              <div>Result:</div>
              <ObsidianCodeBlock content={response.data.text} />
            </div>
          )}
          {response.status === ToolCallResponseStatus.Error && (
            <div className="za-toolcall-content-section">
              <div>Error:</div>
              <ObsidianCodeBlock content={response.error} />
            </div>
          )}
        </div>
      )}
      {(response.status === ToolCallResponseStatus.PendingApproval ||
        response.status === ToolCallResponseStatus.Running) && (
        <div className="za-toolcall-footer">
          {response.status === ToolCallResponseStatus.PendingApproval && (
            <div className="za-toolcall-footer-actions">
              <button
                className="za-toolcall-btn za-toolcall-btn-allow"
                onClick={() => {
                void handleToolCall()
                setIsOpen(false)
              }}
              >
                Allow
              </button>
              <button
                className="za-toolcall-btn za-toolcall-btn-reject"
                onClick={() => {
                void handleReject()
                setIsOpen(false)
              }}
              >
                Reject
              </button>
            </div>
          )}
          {response.status === ToolCallResponseStatus.Running && (
            <div className="za-toolcall-footer-actions">
              <button className="za-toolcall-btn za-toolcall-btn-abort" onClick={() => { void handleAbort() }}>Abort</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function useToolCall(
  request: ToolCallRequest,
  toolManager: ToolManager,
  onResponseUpdate: (response: ToolCallResponse) => void,
) {
  const handleToolCall = useCallback(async () => {
    onResponseUpdate({
      status: ToolCallResponseStatus.Running,
    })
    const toolCallResponse: ToolCallResponse = await toolManager.callTool({
      name: request.name,
      args: request.arguments,
      id: request.id,
    })
    onResponseUpdate(toolCallResponse)
  }, [request, onResponseUpdate, toolManager])

  const handleReject = useCallback(async () => {
    onResponseUpdate({
      status: ToolCallResponseStatus.Rejected,
    })
  }, [onResponseUpdate])

  const handleAbort = useCallback(async () => {
    toolManager.abortToolCall(request.id)
    onResponseUpdate({
      status: ToolCallResponseStatus.Aborted,
    })
  }, [request, onResponseUpdate, toolManager])

  return {
    handleToolCall,
    handleReject,
    handleAbort,
  }
}

function StatusIcon({ status }: { status: ToolCallResponseStatus }) {
  switch (status) {
    case ToolCallResponseStatus.PendingApproval:
      return null
    case ToolCallResponseStatus.Rejected:
    case ToolCallResponseStatus.Aborted:
    case ToolCallResponseStatus.Error:
      return <X size={16} style={{ color: 'var(--text-error)' }} />
    case ToolCallResponseStatus.Running:
      return <Cog size={16} className="za-spin-cog" />
    case ToolCallResponseStatus.Success:
      return <Check size={16} style={{ color: 'var(--text-success)' }} />
    default:
      return null
  }
}

export default ToolMessage
