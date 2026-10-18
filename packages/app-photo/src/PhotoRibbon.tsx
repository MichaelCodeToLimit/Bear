import {
  Blend, ClipboardPaste, Contrast, Copy, Crop, Droplets, Expand, FlipHorizontal2, FlipVertical2, Focus, Grid2x2,
  Grid3x3, Layers2, Maximize, Moon, Palette, Ratio, Redo2, RotateCcw, RotateCw, RotateCcwSquare, Ruler, Scaling, Scan,
  Scissors, SlidersHorizontal, Sparkles, Spline, Sun, SunMedium, Undo2, Wind, ZoomIn, ZoomOut, type LucideIcon
} from 'lucide-react'
import { Ribbon, RibbonButton, RibbonGroup, RibbonRows } from '@bear/ui'
import type { CanvasBackground } from './CanvasView'
import type { PhotoEditorState } from './usePhotoEditor'

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
}

/** A command that arrives in a later task: shown so the layout is final, but disabled for now. */
const soon = (icon: LucideIcon, label: string, large = false) => <RibbonButton key={label} icon={icon} label={label} large={large} showLabel={!large} disabled />

export function PhotoRibbon(p: PhotoRibbonProps) {
  const { state, accent } = p
  const { editor, hasDoc } = state
  const h = editor.history
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
              {soon(RotateCw, 'Rotate 90° right')}
              {soon(RotateCcw, 'Rotate 90° left')}
              {soon(RotateCcwSquare, 'Rotate 180°')}
            </RibbonRows>
            <RibbonRows>
              {soon(FlipHorizontal2, 'Flip horizontal')}
              {soon(FlipVertical2, 'Flip vertical')}
            </RibbonRows>
          </RibbonGroup>
        </>
      )}
      {p.tab === 'image' && (
        <>
          <RibbonGroup label="Size">
            {soon(Scaling, 'Image size', true)}
            <RibbonButton large icon={Expand} label="Canvas size" disabled={!hasDoc} onClick={p.onCanvasSize} />
          </RibbonGroup>
          <RibbonGroup label="Edges">
            {soon(Scan, 'Trim', true)}
          </RibbonGroup>
          <RibbonGroup label="Layers">
            <RibbonButton large icon={Layers2} label="Flatten" disabled={!hasDoc || editor.doc.layers.length < 2} onClick={() => editor.flatten()} />
          </RibbonGroup>
        </>
      )}
      {p.tab === 'adjust' && (
        <>
          <RibbonGroup label="Light">
            {soon(SunMedium, 'Brightness/ Contrast', true)}
            {soon(SlidersHorizontal, 'Levels', true)}
            {soon(Spline, 'Curves', true)}
          </RibbonGroup>
          <RibbonGroup label="Colour">
            {soon(Palette, 'Hue/ Saturation', true)}
            {soon(Contrast, 'Invert', true)}
            {soon(Droplets, 'Black & white', true)}
          </RibbonGroup>
        </>
      )}
      {p.tab === 'filters' && (
        <>
          <RibbonGroup label="Blur">
            {soon(Focus, 'Gaussian blur', true)}
            {soon(Blend, 'Box blur', true)}
            {soon(Wind, 'Motion blur', true)}
          </RibbonGroup>
          <RibbonGroup label="Sharpen">
            {soon(Sparkles, 'Sharpen', true)}
            {soon(Ratio, 'Unsharp mask', true)}
          </RibbonGroup>
          <RibbonGroup label="Texture">
            {soon(Grid3x3, 'Add noise', true)}
            {soon(Grid2x2, 'Pixelate', true)}
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
