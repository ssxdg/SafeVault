import React, { useLayoutEffect, useRef, useState } from 'react'

function NotePreview({ note }) {
  const [expanded, setExpanded] = useState(false)
  const [canExpand, setCanExpand] = useState(false)
  const containerRef = useRef(null)
  const textRef = useRef(null)

  useLayoutEffect(() => {
    if (expanded || !containerRef.current || !textRef.current) return

    // 根据实际渲染高度判断是否溢出，兼容不同列宽、字号和手动换行的备注。
    const updateOverflow = () => {
      setCanExpand(textRef.current.scrollHeight > textRef.current.clientHeight + 1)
    }
    updateOverflow()
    const observer = new ResizeObserver(updateOverflow)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [expanded, note])

  return (
    <span className="note-preview" ref={containerRef}>
      <span className={`note-preview-text${expanded ? ' expanded' : ''}`} ref={textRef}>{note}</span>
      {(canExpand || expanded) && (
        <button
          type="button"
          className="note-preview-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      )}
    </span>
  )
}

export default NotePreview
