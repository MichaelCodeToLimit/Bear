import type { PhotoEditorState } from '../usePhotoEditor'

/** History steps; the first row is how the document started ("New" or "Open"). Click a row to go back to it. */
export function HistoryPanel({ state }: { state: PhotoEditorState }) {
  const { editor, hasDoc, origin } = state
  const { steps, index } = editor.history
  const rows = hasDoc ? [origin, ...steps.map((s) => s.label)] : []
  return (
    <section aria-label="History" className="flex h-44 shrink-0 flex-col">
      <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">History</h3>
      <ol className="min-h-0 flex-1 overflow-y-auto pb-1">
        {rows.map((label, i) => (
          <li key={i}>
            <button
              data-testid="history-row"
              aria-current={i === index ? 'step' : undefined}
              onClick={() => editor.history.goTo(i)}
              className={`block w-full truncate px-3 py-0.5 text-left text-[12px] ${i === index ? 'bg-active font-medium text-ink' : i > index ? 'text-muted/60 hover:bg-hover' : 'text-ink hover:bg-hover'}`}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
