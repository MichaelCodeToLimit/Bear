import type { CSSProperties, ReactNode } from 'react'
import {
  PLACEHOLDER_PROMPT, SLIDE_H, SLIDE_W,
  type ShapeElement, type Slide, type SlideElement, type TextElement, type TextStyle
} from './model'
import { fontFamily, type Theme } from './themes'

const ptToPx = (pt: number) => (pt * 4) / 3

/** CSS for a text box's content, resolving theme defaults. */
export function textCss(style: TextStyle, theme: Theme, placeholder?: string, fallbackColor?: string): CSSProperties {
  return {
    fontFamily: fontFamily(theme, style.font, placeholder),
    fontSize: ptToPx(style.fontSize ?? 18),
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: style.underline ? 'underline' : undefined,
    color: style.color ?? fallbackColor ?? (placeholder === 'title' ? theme.title : theme.text),
    textAlign: style.align ?? 'left',
    lineHeight: 1.2
  }
}

const JUSTIFY: Record<string, CSSProperties['justifyContent']> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }

/** Lines of text, rendered as bullets when asked. */
export function TextContent({ text, style }: { text: string; style: TextStyle }) {
  const lines = text.split('\n')
  if (style.bullets) {
    return (
      <ul className="m-0 list-disc pl-[1.1em]">
        {lines.map((l, i) => (
          <li key={i} className="whitespace-pre-wrap" style={{ listStyleType: l.trim() ? 'disc' : 'none' }}>
            {l || ' '}
          </li>
        ))}
      </ul>
    )
  }
  return <div className="whitespace-pre-wrap">{text || ' '}</div>
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

interface ElementViewProps {
  el: SlideElement
  theme: Theme
  /** Show "Click to add title" in empty placeholders (editor only). */
  prompts?: boolean
  /** Hide the text (the editor draws a textarea over it while editing). */
  hideText?: boolean
}

export function ElementView({ el, theme, prompts, hideText }: ElementViewProps) {
  const box: CSSProperties = { position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h }
  if (el.kind === 'image') {
    return <img src={el.src} alt="" draggable={false} style={{ ...box, objectFit: 'fill' }} />
  }
  const text = el.text
  const t = el as TextElement
  const showPrompt = el.kind === 'text' && !text && prompts && t.placeholder
  if (el.kind === 'text' && !text && !showPrompt) return null
  const css = textCss(el.style, theme, el.kind === 'text' ? t.placeholder : undefined, el.kind === 'shape' ? '#ffffff' : undefined)
  return (
    <div style={box} data-el={el.id}>
      {el.kind === 'shape' && <ShapeSvg el={el} />}
      {!hideText && (text || showPrompt) && (
        <div
          className="absolute inset-0 flex flex-col overflow-visible p-[6px]"
          style={{ ...css, justifyContent: JUSTIFY[el.style.valign ?? (el.kind === 'shape' ? 'middle' : 'top')], opacity: showPrompt ? 0.45 : 1 }}
        >
          <TextContent text={showPrompt ? PLACEHOLDER_PROMPT[t.placeholder!] : text} style={showPrompt ? { ...el.style, bullets: false } : el.style} />
        </div>
      )}
    </div>
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
}

/** A whole slide, scaled to `width`. Children are drawn in slide coordinates on top. */
export function SlideView({ slide, theme, width, prompts, editingId, children, className }: SlideViewProps) {
  const scale = width / SLIDE_W
  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height: SLIDE_H * scale }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, background: slide.background ?? theme.background }}
      >
        {slide.elements.map((el) => (
          <ElementView key={el.id} el={el} theme={theme} prompts={prompts} hideText={el.id === editingId} />
        ))}
        {children}
      </div>
    </div>
  )
}
