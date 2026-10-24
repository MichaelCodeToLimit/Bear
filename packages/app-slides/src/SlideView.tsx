import type { CSSProperties, ReactNode } from 'react'
import { Music, Play } from 'lucide-react'
import {
  PLACEHOLDER_PROMPT, SLIDE_H, SLIDE_W,
  type ImageElement, type Presentation, type ShapeElement, type Slide, type SlideElement, type TableElement, type TextElement, type TextStyle
} from './model'
import { fontFamily, type Theme } from './themes'
import { MOTION_CSS, animationCss, type ElementFrame } from './animation'
import { ChartView } from './chart'

// Animation and transition keyframes, once per document (the audience window copies them over).
if (typeof document !== 'undefined' && !document.getElementById('bear-motion-css')) {
  const s = document.createElement('style')
  s.id = 'bear-motion-css'
  s.textContent = MOTION_CSS
  document.head.appendChild(s)
}

const ptToPx = (pt: number) => (pt * 4) / 3

/** CSS for a text box's content, resolving theme defaults. */
export function textCss(style: TextStyle, theme: Theme, placeholder?: string, fallbackColor?: string): CSSProperties {
  const decorations = [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean).join(' ')
  return {
    fontFamily: fontFamily(theme, style.font, placeholder),
    fontSize: ptToPx(style.fontSize ?? 18),
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: decorations || undefined,
    color: style.color ?? fallbackColor ?? (placeholder === 'title' ? theme.title : theme.text),
    textAlign: style.align ?? 'left',
    lineHeight: 1.2 * (style.lineSpacing ?? 1),
    textShadow: style.shadow ? '2px 2px 4px rgba(0,0,0,0.45)' : undefined,
    WebkitTextStroke: style.outline ? `1.5px ${style.outline}` : undefined
  }
}

const JUSTIFY: Record<string, CSSProperties['justifyContent']> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

/** Lines of text, rendered as a bulleted or numbered list when asked. */
export function TextContent({ text, style }: { text: string; style: TextStyle }) {
  const lines = text.split('\n')
  if (style.bullets || style.numbered) {
    const List = style.numbered ? 'ol' : 'ul'
    return (
      <List className={`m-0 pl-[1.4em] ${style.numbered ? 'list-decimal' : 'list-disc'}`}>
        {lines.map((l, i) => (
          <li key={i} className="whitespace-pre-wrap" style={{ listStyleType: l.trim() ? undefined : 'none' }}>
            {l || ' '}
          </li>
        ))}
      </List>
    )
  }
  return <div className="whitespace-pre-wrap">{text || ' '}</div>
}

function ShapeSvg({ el }: { el: ShapeElement }) {
  const sw = el.stroke ? el.strokeWidth ?? 2 : 0
  const common = { fill: el.fill ?? 'none', stroke: el.stroke ?? 'none', strokeWidth: sw, vectorEffect: 'non-scaling-stroke' as const }
  const { w, h } = el
  let shape: ReactNode
  switch (el.shape) {
    case 'ellipse':
      shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - sw / 2)} ry={Math.max(0, h / 2 - sw / 2)} {...common} />
      break
    case 'roundRect':
      shape = <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={Math.min(w, h) * 0.16} {...common} />
      break
    case 'triangle':
      shape = <polygon points={`${w / 2},${sw} ${w - sw},${h - sw} ${sw},${h - sw}`} {...common} />
      break
    case 'arrow': {
      const head = Math.min(w * 0.4, h)
      shape = <polygon points={`0,${h * 0.25} ${w - head},${h * 0.25} ${w - head},0 ${w},${h / 2} ${w - head},${h} ${w - head},${h * 0.75} 0,${h * 0.75}`} {...common} />
      break
    }
    case 'line':
      shape = <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={el.stroke ?? '#000'} strokeWidth={el.strokeWidth ?? 3} strokeLinecap="round" />
      break
    default:
      shape = <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} {...common} />
  }
  return (
    <svg className="absolute inset-0 overflow-visible" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {shape}
    </svg>
  )
}

function ImageContent({ el }: { el: ImageElement }) {
  const c = el.crop
  if (!c || (c.l === 0 && c.t === 0 && c.r === 0 && c.b === 0)) {
    return <img src={el.src} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={{ objectFit: 'fill' }} />
  }
  // Show only the uncropped part, stretched to the box.
  const iw = el.w / Math.max(0.05, 1 - c.l - c.r)
  const ih = el.h / Math.max(0.05, 1 - c.t - c.b)
  return (
    <div className="absolute inset-0 overflow-hidden">
      <img src={el.src} alt="" draggable={false} style={{ position: 'absolute', left: -c.l * iw, top: -c.t * ih, width: iw, height: ih, maxWidth: 'none' }} />
    </div>
  )
}

export function TableContent({ el, theme }: { el: TableElement; theme: Theme }) {
  const accent = theme.accents[el.accent % theme.accents.length]
  const css = textCss(el.style, theme)
  return (
    <table className="absolute inset-0 h-full w-full table-fixed border-collapse" style={{ ...css, fontSize: css.fontSize }}>
      <tbody>
        {el.rows.map((row, r) => {
          const head = el.header && r === 0
          const band = el.banded && !head && (r - (el.header ? 1 : 0)) % 2 === 1
          return (
            <tr key={r} style={{ background: head ? accent : band ? `color-mix(in srgb, ${accent} 14%, transparent)` : undefined }}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  data-cell={`${r}:${c}`}
                  className="overflow-hidden whitespace-pre-wrap px-[8px] py-[4px] align-middle"
                  style={{ border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`, color: head ? '#ffffff' : css.color, fontWeight: head ? 700 : css.fontWeight }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** How media looks: a still with a play badge in the editor, real controls in the show. */
function MediaContent({ el, live }: { el: Extract<SlideElement, { kind: 'media' }>; live?: boolean }) {
  if (el.mediaType === 'video') {
    return live ? (
      <video src={el.src} controls autoPlay={el.autoplay} loop={el.loop} className="absolute inset-0 h-full w-full bg-black object-contain" onClick={(e) => e.stopPropagation()} />
    ) : (
      <div className="absolute inset-0 bg-black">
        <video src={el.src} muted preload="metadata" className="h-full w-full object-contain" />
        <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-full bg-black/55 p-4"><Play size={Math.min(el.w, el.h) * 0.18} color="#fff" fill="#fff" /></div></div>
      </div>
    )
  }
  return live ? (
    <div className="absolute inset-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <audio src={el.src} controls autoPlay={el.autoplay} loop={el.loop} style={{ width: Math.max(el.w, 260) }} />
    </div>
  ) : (
    <div className="absolute inset-0 flex items-center justify-center rounded-lg" style={{ background: 'rgba(0,0,0,0.06)' }}>
      <Music size={Math.min(el.w, el.h) * 0.6} strokeWidth={1.5} color="#64748b" />
    </div>
  )
}

interface ElementViewProps {
  el: SlideElement
  theme: Theme
  /** Show "Click to add title" in empty placeholders (editor only). */
  prompts?: boolean
  /** Hide the text (the editor draws a textarea over it while editing). */
  hideText?: boolean
  /** In a slide show: what this element does at the current animation step. */
  frame?: ElementFrame
  /** Media plays (slide show). */
  live?: boolean
}

export function ElementView({ el, theme, prompts, hideText, frame, live }: ElementViewProps) {
  if (el.hidden || frame?.visible === false) return null
  const outer: CSSProperties = {
    position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h,
    animation: frame?.play ? animationCss(frame.play) : undefined
  }
  const inner: CSSProperties = {
    position: 'absolute', inset: 0,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity ?? undefined
  }
  const flip = el.flipH || el.flipV ? `scale(${el.flipH ? -1 : 1}, ${el.flipV ? -1 : 1})` : undefined
  let content: ReactNode
  if (el.kind === 'image') {
    content = <div className="absolute inset-0" style={{ transform: flip }}><ImageContent el={el} /></div>
  } else if (el.kind === 'table') {
    content = <TableContent el={el} theme={theme} />
  } else if (el.kind === 'chart') {
    content = <ChartView el={el} theme={theme} />
  } else if (el.kind === 'media') {
    content = <MediaContent el={el} live={live} />
  } else {
    const t = el as TextElement
    const showPrompt = el.kind === 'text' && !el.text && prompts && t.placeholder
    if (el.kind === 'text' && !el.text && !showPrompt) return null
    const css = textCss(el.style, theme, el.kind === 'text' ? t.placeholder : undefined, el.kind === 'shape' ? '#ffffff' : undefined)
    content = (
      <>
        {el.kind === 'shape' && <div className="absolute inset-0" style={{ transform: flip }}><ShapeSvg el={el} /></div>}
        {!hideText && (el.text || showPrompt) && (
          <div
            className="absolute inset-0 flex flex-col overflow-visible p-[6px]"
            style={{ ...css, justifyContent: JUSTIFY[el.style.valign ?? (el.kind === 'shape' ? 'middle' : 'top')], opacity: showPrompt ? 0.45 : 1 }}
          >
            <TextContent text={showPrompt ? PLACEHOLDER_PROMPT[t.placeholder!] : el.text} style={showPrompt ? { ...el.style, bullets: false, numbered: false } : el.style} />
          </div>
        )}
      </>
    )
  }
  return (
    <div style={outer} data-el={el.id}>
      <div style={inner}>{content}</div>
    </div>
  )
}

/** Today's date as people expect it on a slide. */
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** Footer, date and slide number from Header & footer, drawn on top of the slide. */
function FooterView({ pres, index, slide, theme }: { pres: Presentation; index: number; slide: Slide; theme: Theme }) {
  const f = pres.footer
  if (!f || (f.skipTitle && slide.layout === 'title')) return null
  const style: CSSProperties = { position: 'absolute', top: SLIDE_H - 46, height: 30, fontSize: 16, color: theme.text, opacity: 0.75, fontFamily: theme.bodyFont, display: 'flex', alignItems: 'center' }
  return (
    <>
      {f.date && <div data-footer="date" style={{ ...style, left: 60, width: 320 }}>{f.dateText || today()}</div>}
      {f.showText && f.text && <div data-footer="text" style={{ ...style, left: 400, width: 480, justifyContent: 'center' }}>{f.text}</div>}
      {f.slideNumber && <div data-footer="number" style={{ ...style, left: 900, width: 320, justifyContent: 'flex-end' }}>{index + 1}</div>}
    </>
  )
}

interface SlideViewProps {
  slide: Slide
  theme: Theme
  /** Rendered width in CSS pixels; the 1280-wide slide is scaled to fit. */
  width: number
  prompts?: boolean
  editingId?: string | null
  children?: ReactNode
  className?: string
  /** The presentation and slide number: adds the slide master's elements and the footer. */
  deck?: { pres: Presentation; index: number }
  /** Slide show: animation state per element. */
  frames?: Map<string, ElementFrame>
  /** Slide show: media plays. */
  live?: boolean
  style?: CSSProperties
}

/** A whole slide, scaled to `width`. Children are drawn in slide coordinates on top. */
export function SlideView({ slide, theme, width, prompts, editingId, children, className, deck, frames, live, style }: SlideViewProps) {
  const scale = width / SLIDE_W
  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height: SLIDE_H * scale, ...style }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, background: slide.background ?? theme.background }}
      >
        {deck?.pres.master?.elements.map((el) => <ElementView key={el.id} el={el} theme={theme} live={live} />)}
        {slide.elements.map((el) => (
          <ElementView key={el.id} el={el} theme={theme} prompts={prompts} hideText={el.id === editingId} frame={frames?.get(el.id)} live={live} />
        ))}
        {deck && <FooterView pres={deck.pres} index={deck.index} slide={slide} theme={theme} />}
        {children}
      </div>
    </div>
  )
}
