import {
  Blend, ClipboardPaste, Contrast, Copy, Crop, Droplets, Expand, FlipHorizontal2, FlipVertical2, Focus, Grid2x2,
  Grid3x3, Layers2, Maximize, Moon, Palette, Ratio, Redo2, RotateCcw, RotateCw, RotateCcwSquare, Ruler, Scaling, Scan,
  Scissors, SlidersHorizontal, Sparkles, Spline, Sun, SunMedium, Undo2, Wind, ZoomIn, ZoomOut, type LucideIcon
} from 'lucide-react'
import { Ribbon, RibbonButton, RibbonGroup, RibbonRows } from '@bear/ui'
import type { CanvasBackground } from './CanvasView'
import type { PhotoEditorState } from './usePhotoEditor'
import type { DialogKind, ImageCommand } from './dialogs/useImageDialogs'

export const PHOTO_TABS = [
  { id: 'home', label: 'Home' },
  { id: 'image', label: 'Image' },
  { id: 'adjust', label: 'Adjust' },
  { id: 'filters', label: 'Filters' },
  { id: 'view', label: 'View' }
]

export interface PhotoRibbonProps {
  state: PhotoEditorState
  tab: string
  setTab: (t: string) => void
  onFile: () => void
  accent: string
  background: CanvasBackground
  setBackground: (b: CanvasBackground) => void
  zoom: (cmd: 'in' | 'out' | 'fit' | 'actual') => void
  onCanvasSize: () => void
  /** Adjust, Filters and Image size dialogs (Invert and Black & white apply at once). */
  onDialog: (kind: DialogKind) => void
  /** Rotate, flip and trim. */
  onImage: (cmd: ImageCommand) => void
}

/** A command that arrives in a later task: shown so the layout is final, but disabled for now. */
const soon = (icon: LucideIcon, label: string, large = false) => <RibbonButton key={label} icon={icon} label={label} large={large} showLabel={!large} disabled />

export function PhotoRibbon(p: PhotoRibbonProps) {
  const { state, accent } = p
  const { editor, hasDoc } = state
  const h = editor.history
  const dialog = (icon: LucideIcon, label: string, kind: DialogKind) => <RibbonButton key={label} large icon={icon} label={label} disabled={!hasDoc} onClick={() => p.onDialog(kind)} />
  const image = (icon: LucideIcon, label: string, cmd: ImageCommand) => <RibbonButton key={label} icon={icon} label={label} showLabel disabled={!hasDoc} onClick={() => p.onImage(cmd)} />
  return (
    <Ribbon tabs={PHOTO_TABS} active={p.tab} onChange={p.setTab} onFile={p.onFile} accent={accent}>
      {p.tab === 'home' && (
        <>
          <RibbonGroup label="History">
            <RibbonButton large icon={Undo2} label="Undo" disabled={!hasDoc || !h.canUndo} onClick={() => h.undo()} shortcut="Ctrl+Z" />
            <RibbonButton large icon={Redo2} label="Redo" disabled={!hasDoc || !h.canRedo} onClick={() => h.redo()} shortcut="Ctrl+Y" />
          </RibbonGroup>
          <RibbonGroup label="Clipboard">
            {soon(ClipboardPaste, 'Paste', true)}
            <RibbonRows>
              {soon(Scissors, 'Cut')}
              {soon(Copy, 'Copy')}
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Crop">
            <RibbonButton large icon={Crop} label="Crop" active={state.tool === 'crop'} disabled={!hasDoc} onClick={() => state.setTool('crop')} shortcut="C" />
          </RibbonGroup>
          <RibbonGroup label="Rotate and flip">
            <RibbonRows>
              {image(RotateCw, 'Rotate 90° right', { rotate: 1 })}
              {image(RotateCcw, 'Rotate 90° left', { rotate: 3 })}
              {image(RotateCcwSquare, 'Rotate 180°', { rotate: 2 })}
            </RibbonRows>
            <RibbonRows>
              {image(FlipHorizontal2, 'Flip horizontal', { flip: 'h' })}
              {image(FlipVertical2, 'Flip vertical', { flip: 'v' })}
            </RibbonRows>
          </RibbonGroup>
        </>
      )}
      {p.tab === 'image' && (
        <>
          <RibbonGroup label="Size">
            {dialog(Scaling, 'Image size', 'imageSize')}
            <RibbonButton large icon={Expand} label="Canvas size" disabled={!hasDoc} onClick={p.onCanvasSize} />
          </RibbonGroup>
          <RibbonGroup label="Edges">
            <RibbonButton large icon={Scan} label="Trim" disabled={!hasDoc} onClick={() => p.onImage('trim')} />
          </RibbonGroup>
          <RibbonGroup label="Layers">
            <RibbonButton large icon={Layers2} label="Flatten" disabled={!hasDoc || editor.doc.layers.length < 2} onClick={() => editor.flatten()} />
          </RibbonGroup>
        </>
      )}
      {p.tab === 'adjust' && (
        <>
          <RibbonGroup label="Light">
            {dialog(SunMedium, 'Brightness/ Contrast', 'brightness')}
            {dialog(SlidersHorizontal, 'Levels', 'levels')}
            {dialog(Spline, 'Curves', 'curves')}
          </RibbonGroup>
          <RibbonGroup label="Colour">
            {dialog(Palette, 'Hue/ Saturation', 'hsl')}
            {dialog(Contrast, 'Invert', 'invert')}
            {dialog(Droplets, 'Black & white', 'bw')}
          </RibbonGroup>
        </>
      )}
      {p.tab === 'filters' && (
        <>
          <RibbonGroup label="Blur">
            {dialog(Focus, 'Gaussian blur', 'gaussian')}
            {dialog(Blend, 'Box blur', 'box')}
            {dialog(Wind, 'Motion blur', 'motion')}
          </RibbonGroup>
          <RibbonGroup label="Sharpen">
            {dialog(Sparkles, 'Sharpen', 'sharpen')}
            {dialog(Ratio, 'Unsharp mask', 'unsharp')}
          </RibbonGroup>
          <RibbonGroup label="Texture">
            {dialog(Grid3x3, 'Add noise', 'noise')}
            {dialog(Grid2x2, 'Pixelate', 'pixelate')}
          </RibbonGroup>
        </>
      )}
      {p.tab === 'view' && (
        <>
          <RibbonGroup label="Zoom">
            <RibbonButton large icon={ZoomIn} label="Zoom in" disabled={!hasDoc} onClick={() => p.zoom('in')} shortcut="Ctrl+=" />
            <RibbonButton large icon={ZoomOut} label="Zoom out" disabled={!hasDoc} onClick={() => p.zoom('out')} shortcut="Ctrl+-" />
            <RibbonButton large icon={Maximize} label="Fit to window" disabled={!hasDoc} onClick={() => p.zoom('fit')} shortcut="Ctrl+0" />
            <RibbonButton large icon={Scan} label="100%" disabled={!hasDoc} onClick={() => p.zoom('actual')} shortcut="Ctrl+1" />
          </RibbonGroup>
          <RibbonGroup label="Show">
            <RibbonRows>
              {soon(Ruler, 'Rulers')}
              {soon(Grid3x3, 'Grid')}
            </RibbonRows>
          </RibbonGroup>
          <RibbonGroup label="Canvas background">
            <RibbonButton large icon={Sun} label="Light" active={p.background === 'light'} onClick={() => p.setBackground('light')} />
            <RibbonButton large icon={Moon} label="Dark" active={p.background === 'dark'} onClick={() => p.setBackground('dark')} />
          </RibbonGroup>
        </>
      )}
    </Ribbon>
  )
}
