import { useEffect, useRef, useState } from 'react'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Chart } from './model'
import type { SheetStore } from './store'
import { HEADER_H, HEADER_W } from './Grid'

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])

const PALETTE = ['#0f766e', '#d97706', '#4f46e5', '#be123c', '#4d7c0f', '#0369a1', '#9333ea', '#78716c']

/** Build an ECharts option from a sheet range: first row = series names, first column = categories. */
export function chartOption(store: SheetStore, chart: Chart) {
  const { r1, c1, r2, c2 } = chart.range
  const val = (r: number, c: number) => store.value(r, c)
  const firstRowText = Array.from({ length: c2 - c1 + 1 }, (_, i) => val(r1, c1 + i)).some((v) => typeof v === 'string')
  // Text in the first column (below any header row) means it holds category labels.
  const firstColText =
    c2 > c1 &&
    Array.from({ length: r2 - r1 + 1 }, (_, i) => val(r1 + i, c1))
      .slice(firstRowText ? 1 : 0)
      .some((v) => typeof v === 'string')
  const dataR1 = firstRowText ? r1 + 1 : r1
  const dataC1 = firstColText ? c1 + 1 : c1

  const categories: string[] = []
  for (let r = dataR1; r <= r2; r++) categories.push(firstColText ? store.display(r, c1) : String(r - dataR1 + 1))
  const series: { name: string; data: number[] }[] = []
  for (let c = dataC1; c <= c2; c++) {
    const data: number[] = []
    for (let r = dataR1; r <= r2; r++) {
      const v = val(r, c)
      data.push(typeof v === 'number' ? v : 0)
    }
    series.push({ name: firstRowText ? store.display(r1, c) : `Series ${c - dataC1 + 1}`, data })
  }

  const base = {
    color: PALETTE,
    animation: false,
    title: chart.title ? { text: chart.title, left: 'center', top: 8, textStyle: { fontSize: 15, fontWeight: 600, color: '#1f1f1f' } } : undefined,
    tooltip: { trigger: chart.type === 'pie' ? 'item' : 'axis' },
    legend: { bottom: 6, type: 'scroll' as const }
  }
  if (chart.type === 'pie') {
    const s = series[0] ?? { name: '', data: [] }
    return {
      ...base,
      series: [{
        type: 'pie', name: s.name, radius: ['0%', '62%'], center: ['50%', '52%'],
        data: categories.map((name, i) => ({ name, value: s.data[i] ?? 0 })),
        label: { formatter: '{b}: {d}%' }
      }]
    }
  }
  const horizontal = chart.type === 'bar'
  const catAxis = { type: 'category' as const, data: categories, axisTick: { alignWithLabel: true } }
  const valAxis = { type: 'value' as const, splitLine: { lineStyle: { color: '#eee' } } }
  return {
    ...base,
    grid: { left: 48, right: 20, top: chart.title ? 46 : 22, bottom: 44, containLabel: true },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: series.map((s) => ({
      type: chart.type === 'line' ? 'line' : 'bar',
      name: s.name,
      data: s.data,
      smooth: chart.type === 'line' ? 0.2 : undefined,
      barMaxWidth: 48
    }))
  }
}

interface ChartLayerProps {
  store: SheetStore
  version: number
  scroll: { x: number; y: number }
  accent: string
}

/** Floating charts positioned in sheet coordinates; they scroll with the grid. */
export function ChartLayer({ store, version, scroll, accent }: ChartLayerProps) {
  const charts = store.sheet.charts
  if (!charts.length) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${HEADER_H}px 0 0 ${HEADER_W}px)` }}>
      {charts.map((c) => (
        <ChartBox key={c.id} store={store} chart={c} version={version} scroll={scroll} accent={accent} />
      ))}
    </div>
  )
}

function ChartBox({ store, chart, version, scroll, accent }: { store: SheetStore; chart: Chart; version: number; scroll: { x: number; y: number }; accent: string }) {
  const host = useRef<HTMLDivElement>(null)
  const inst = useRef<ECharts | null>(null)
  const [drag, setDrag] = useState<null | { mode: 'move' | 'resize'; sx: number; sy: number; orig: Chart }>(null)
  const selected = store.selectedChart === chart.id

  useEffect(() => {
    inst.current = init(host.current!, undefined, { renderer: 'canvas' })
    return () => inst.current?.dispose()
  }, [])

  useEffect(() => {
    inst.current?.setOption(chartOption(store, chart), true)
  }, [store, chart, version])

  useEffect(() => {
    inst.current?.resize()
  }, [chart.w, chart.h])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      if (drag.mode === 'move') store.updateChart(chart.id, { x: Math.max(0, drag.orig.x + dx), y: Math.max(0, drag.orig.y + dy) }, false)
      else store.updateChart(chart.id, { w: Math.max(200, drag.orig.w + dx), h: Math.max(140, drag.orig.h + dy) }, false)
    }
    const onUp = () => {
      const moved = store.sheet.charts.find((c) => c.id === chart.id)
      // Record one undo step for the whole drag.
      if (moved) {
        const final = { x: moved.x, y: moved.y, w: moved.w, h: moved.h }
        store.updateChart(chart.id, { x: drag.orig.x, y: drag.orig.y, w: drag.orig.w, h: drag.orig.h }, false)
        store.updateChart(chart.id, final)
      }
      setDrag(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, store, chart.id])

  return (
    <div
      data-chart={chart.id}
      className="pointer-events-auto absolute rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
      style={{
        left: HEADER_W + chart.x - scroll.x,
        top: HEADER_H + chart.y - scroll.y,
        width: chart.w,
        height: chart.h,
        outline: selected ? `2px solid ${accent}` : '1px solid #d4d2d0'
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        store.selectChart(chart.id)
        ;(document.querySelector('[data-grid]') as HTMLElement | null)?.focus({ preventScroll: true })
        setDrag({ mode: 'move', sx: e.clientX, sy: e.clientY, orig: chart })
      }}
    >
      <div ref={host} className="h-full w-full cursor-move" />
      {selected && (
        <div
          title="Resize"
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border-2 bg-white"
          style={{ borderColor: accent }}
          onMouseDown={(e) => {
            e.stopPropagation()
            setDrag({ mode: 'resize', sx: e.clientX, sy: e.clientY, orig: chart })
          }}
        />
      )}
    </div>
  )
}
