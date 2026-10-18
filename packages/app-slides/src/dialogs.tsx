import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Modal } from '@bear/ui'
import type { ChartElement, ChartType, MediaElement } from './model'
import { DEFAULT_FOOTER, type SlidesStore } from './store'
import type { Match } from './find'

const field = 'h-8 rounded border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-[var(--accent)]'

/** Find (and replace) text across every slide and the notes. */
export function FindReplaceDialog({ store, accent, replace: startReplace, onClose }: { store: SlidesStore; accent: string; replace: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [r, setR] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [showReplace, setShowReplace] = useState(startReplace)
  const [at, setAt] = useState(-1)
  const [message, setMessage] = useState('')
  const opts = { matchCase }
  const matches = useMemo(() => (q ? store.find(q, opts) : []), [q, matchCase, store.version]) // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (i: number) => {
    if (!matches.length) return setMessage(q ? 'No matches.' : '')
    const n = ((i % matches.length) + matches.length) % matches.length
    setAt(n)
    store.showMatch(matches[n])
    setMessage(`${n + 1} of ${matches.length}${matches[n].target === 'notes' ? ' (in the notes)' : ''}`)
  }
  const current: Match | undefined = at >= 0 ? matches[at] : undefined

  return (
    <Modal
      title={showReplace ? 'Replace' : 'Find'}
      width={440}
      onClose={onClose}
      footer={
        <>
          {showReplace && <Button onClick={() => { const n = store.replaceAll(q, r, opts); setMessage(`Replaced ${n}.`); setAt(-1) }} >Replace all</Button>}
          {showReplace && <Button disabled={!current} onClick={() => { if (current) { store.replace(current, q, r); setMessage('Replaced. Find next to continue.') } }}>Replace</Button>}
          <Button primary accent={accent} disabled={!q} onClick={() => goTo(at + 1)}>Find next</Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] text-ink">
        <label className="block text-xs text-muted">Find what
          <input autoFocus aria-label="Find what" value={q} onChange={(e) => { setQ(e.target.value); setAt(-1); setMessage('') }} onKeyDown={(e) => e.key === 'Enter' && goTo(at + (e.shiftKey ? -1 : 1))} className={`mt-1 w-full ${field}`} />
        </label>
        {showReplace ? (
          <label className="block text-xs text-muted">Replace with
            <input aria-label="Replace with" value={r} onChange={(e) => setR(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
        ) : (
          <button onClick={() => setShowReplace(true)} className="text-[12px] text-[var(--accent)] hover:underline">Replace…</button>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label>
        <p role="status" className="min-h-5 text-[12px] text-muted">{message || (q ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : '')}</p>
      </div>
    </Modal>
  )
}

/** Footer text, date and slide numbers on every slide. */
export function HeaderFooterDialog({ store, accent, onClose }: { store: SlidesStore; accent: string; onClose: () => void }) {
  const [f, setF] = useState({ ...DEFAULT_FOOTER, ...store.pres.footer })
  return (
    <Modal title="Header & footer" width={440} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button primary accent={accent} onClick={() => { store.setFooter(f); onClose() }}>Apply to all</Button></>}>
      <div className="space-y-3 text-[13px] text-ink">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.date} onChange={(e) => setF({ ...f, date: e.target.checked })} /> Date</label>
        {f.date && <input aria-label="Fixed date" value={f.dateText} onChange={(e) => setF({ ...f, dateText: e.target.value })} placeholder="Today's date (leave empty)" className={`ml-6 w-[calc(100%-1.5rem)] ${field}`} />}
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.slideNumber} onChange={(e) => setF({ ...f, slideNumber: e.target.checked })} /> Slide number</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.showText} onChange={(e) => setF({ ...f, showText: e.target.checked })} /> Footer</label>
        {f.showText && <input aria-label="Footer text" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} className={`ml-6 w-[calc(100%-1.5rem)] ${field}`} />}
        <label className="flex items-center gap-2 border-t border-line pt-3"><input type="checkbox" checked={f.skipTitle} onChange={(e) => setF({ ...f, skipTitle: e.target.checked })} /> Don't show on title slides</label>
      </div>
    </Modal>
  )
}

/** Loop, automatic timings, target length. */
export function SetUpShowDialog({ store, accent, onClose }: { store: SlidesStore; accent: string; onClose: () => void }) {
  const show = { useTimings: false, loop: false, ...store.pres.show }
  const [s, setS] = useState({ ...show, target: show.targetMinutes ? String(show.targetMinutes) : '' })
  const hasTimings = store.pres.slides.some((x) => x.timing || x.advanceAfter)
  return (
    <Modal
      title="Set up slide show"
      width={440}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button primary accent={accent} onClick={() => { store.setShow({ useTimings: s.useTimings, loop: s.loop, targetMinutes: Number(s.target) || undefined }); onClose() }}>OK</Button></>}
    >
      <div className="space-y-3 text-[13px] text-ink">
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.loop} onChange={(e) => setS({ ...s, loop: e.target.checked })} /> Loop continuously until Esc (kiosk)</label>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs text-muted">Advance slides</legend>
          <label className="flex items-center gap-2"><input type="radio" name="advance" checked={!s.useTimings} onChange={() => setS({ ...s, useTimings: false })} /> Manually (click or key)</label>
          <label className="flex items-center gap-2"><input type="radio" name="advance" checked={s.useTimings} onChange={() => setS({ ...s, useTimings: true })} /> Using rehearsed timings{!hasTimings && <span className="text-muted"> (none yet; use Rehearse timings)</span>}</label>
        </fieldset>
        <label className="flex items-center gap-2">Target talk length
          <input aria-label="Target talk length" type="number" min={1} value={s.target} onChange={(e) => setS({ ...s, target: e.target.value })} className={`w-20 ${field}`} /> minutes
        </label>
        <p className="text-[12px] text-muted">With a target, rehearsals point out slides you rushed or spent too long on.</p>
        {hasTimings && <button onClick={() => { store.clearTimings(); onClose() }} className="text-[12px] text-red-700 hover:underline">Clear all rehearsed timings</button>}
      </div>
    </Modal>
  )
}

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: 'column', label: 'Column' }, { id: 'bar', label: 'Bar' }, { id: 'line', label: 'Line' }, { id: 'pie', label: 'Pie' }, { id: 'doughnut', label: 'Doughnut' }
]

/** The numbers behind a chart, as a small spreadsheet. */
export function ChartDataDialog({ store, el, accent, onClose }: { store: SlidesStore; el: ChartElement; accent: string; onClose: () => void }) {
  const [d, setD] = useState({ chartType: el.chartType, title: el.title, legend: el.legend, categories: [...el.categories], series: el.series.map((s) => ({ ...s, values: [...s.values] })) })
  const pie = d.chartType === 'pie' || d.chartType === 'doughnut'
  const series = pie ? d.series.slice(0, 1) : d.series
  const setValue = (si: number, ci: number, v: string) => setD({ ...d, series: d.series.map((s, i) => (i === si ? { ...s, values: d.categories.map((_, j) => (j === ci ? Number(v) || 0 : s.values[j] ?? 0)) } : s)) })
  return (
    <Modal
      title="Edit chart data"
      width={620}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button primary accent={accent} onClick={() => { store.setChart(el.id, { ...d, series: pie ? d.series.slice(0, 1) : d.series }); onClose() }}>Done</Button></>}
    >
      <div className="space-y-3 text-[13px] text-ink">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">Type
            <select aria-label="Chart type" value={d.chartType} onChange={(e) => setD({ ...d, chartType: e.target.value as ChartType })} className={field}>
              {CHART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="flex flex-1 items-center gap-2">Title <input aria-label="Chart title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className={`flex-1 ${field}`} /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={d.legend} onChange={(e) => setD({ ...d, legend: e.target.checked })} /> Legend</label>
        </div>
        <div className="max-h-[320px] overflow-auto rounded border border-line">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-canvas">
                <th className="border border-line px-2 py-1 text-left font-medium text-muted">Category</th>
                {series.map((s, si) => (
                  <th key={si} className="border border-line p-0">
                    <div className="flex items-center">
                      <input aria-label={`Series ${si + 1} name`} value={s.name} onChange={(e) => setD({ ...d, series: d.series.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)) })} className="h-7 min-w-0 flex-1 bg-transparent px-2 font-medium outline-none" />
                      {!pie && d.series.length > 1 && <button aria-label={`Remove series ${s.name}`} onClick={() => setD({ ...d, series: d.series.filter((_, i) => i !== si) })} className="px-1 text-muted hover:text-ink"><Trash2 size={12} /></button>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.categories.map((c, ci) => (
                <tr key={ci}>
                  <td className="border border-line p-0">
                    <div className="flex items-center">
                      <input aria-label={`Category ${ci + 1}`} value={c} onChange={(e) => setD({ ...d, categories: d.categories.map((x, i) => (i === ci ? e.target.value : x)) })} className="h-7 min-w-0 flex-1 bg-transparent px-2 outline-none" />
                      {d.categories.length > 1 && <button aria-label={`Remove ${c || 'category'}`} onClick={() => setD({ ...d, categories: d.categories.filter((_, i) => i !== ci), series: d.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== ci) })) })} className="px-1 text-muted hover:text-ink"><Trash2 size={12} /></button>}
                    </div>
                  </td>
                  {series.map((s, si) => (
                    <td key={si} className="border border-line p-0">
                      <input aria-label={`${s.name} ${c}`} type="number" value={s.values[ci] ?? 0} onChange={(e) => setValue(si, ci, e.target.value)} className="h-7 w-full bg-transparent px-2 text-right outline-none" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setD({ ...d, categories: [...d.categories, `Item ${d.categories.length + 1}`], series: d.series.map((s) => ({ ...s, values: [...s.values, 0] })) })} className="flex items-center gap-1 rounded border border-line px-2 py-1 hover:bg-hover"><Plus size={13} /> Category</button>
          {!pie && <button onClick={() => setD({ ...d, series: [...d.series, { name: `Series ${d.series.length + 1}`, values: d.categories.map(() => 0) }] })} className="flex items-center gap-1 rounded border border-line px-2 py-1 hover:bg-hover"><Plus size={13} /> Series</button>}
        </div>
      </div>
    </Modal>
  )
}

/** Play a video or sound while editing. */
export function MediaPreview({ el, onClose }: { el: MediaElement; onClose: () => void }) {
  return (
    <Modal title={el.fileName || (el.mediaType === 'video' ? 'Video' : 'Audio')} width={el.mediaType === 'video' ? 720 : 420} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      {el.mediaType === 'video'
        ? <video src={el.src} controls autoPlay className="w-full rounded bg-black" />
        : <audio src={el.src} controls autoPlay className="w-full" />}
    </Modal>
  )
}
