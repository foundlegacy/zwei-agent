import fuzzysort from 'fuzzysort'
import { App, TFile } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

type Props = {
  app: App
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function ObsidianFileSelector({
  app,
  value,
  placeholder,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const allFiles = app.vault.getFiles().filter((f) => f.extension === 'md')

  const results = search
    ? fuzzysort.go(search, allFiles, {
        keys: ['path'],
        threshold: 0.2,
        limit: 30,
      })
    : allFiles.slice(0, 30).map((f) => ({
        obj: f,
        score: 0,
      }))

  const displayedFiles = results.map((r) => ('obj' in r ? r.obj : r))

  useEffect(() => {
    setFocusedIndex(0)
  }, [search])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const rootDocument = activeDocument
    rootDocument.addEventListener('mousedown', handler)
    return () => rootDocument.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (file: TFile) => {
    onChange(file.path)
    setOpen(false)
    setSearch('')
  }

  const selectedFile = value ? allFiles.find((f) => f.path === value) : null
  const displayText = selectedFile ? selectedFile.path : (placeholder ?? 'Select file...')

  return (
    <div ref={containerRef} className="za-file-selector">
      <input
        type="text"
        value={open ? search : displayText}
        placeholder={placeholder}
        className="za-file-selector-input"
        readOnly={!open}
        onFocus={() => {
          setOpen(true)
          setSearch('')
          window.setTimeout(() => inputRef.current?.focus(), 0)
        }}
        onChange={(e) => {
          if (open) {
            setSearch(e.target.value)
          }
        }}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setFocusedIndex(Math.min(focusedIndex + 1, displayedFiles.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setFocusedIndex(Math.max(0, focusedIndex - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (displayedFiles[focusedIndex]) {
              handleSelect(displayedFiles[focusedIndex])
            }
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && (
        <div className="za-file-selector-dropdown">
          {displayedFiles.length === 0 ? (
            <div className="za-file-selector-empty">No matching files</div>
          ) : (
            displayedFiles.map((file, i) => (
              <div
                key={file.path}
                className={`za-file-selector-item ${i === focusedIndex ? 'za-file-selector-item-focused' : ''}`}
                onClick={() => handleSelect(file)}
                onMouseEnter={() => setFocusedIndex(i)}
              >
                <span className="za-file-selector-item-name">
                  {file.name}
                </span>
                <span className="za-file-selector-item-path">
                  {file.path}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
