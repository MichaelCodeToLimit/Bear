import type { PhotoEditor } from '../model/editor'
import { holdSpace, toolById } from './index'
import type { ToolContext, ToolId, ToolKeyEvent, ToolPointer } from './types'

export type PointerPhase = 'down' | 'move' | 'up'

/**
 * Routes pointer events to the active tool and keeps track of a press in progress, so that history
 * navigation, tool switches and Space can deal with it. Plain logic, so Node tests can drive it.
 */
export class ToolDispatcher {
  private pressed = false
  /** While Space is held: the tool to return to. */
  private held: ToolId | null = null

  constructor(
    private ctx: () => ToolContext,
    private active: () => ToolId,
    private setTool: (t: ToolId) => void
  ) {}

  /** True while a press (drag) is in progress. */
  get busy(): boolean {
    return this.pressed
  }

  pointer(phase: PointerPhase, p: ToolPointer): void {
    if (phase === 'down') {
      if (this.pressed) return
      this.pressed = true
    } else if (phase === 'up') {
      // A cancelled press still sends its pointerup; the tool has nothing left to finish.
      if (!this.pressed) return
      this.pressed = false
    }
    toolById(this.active())[phase](this.ctx(), p)
  }

  /** A key for the active tool (Enter, Escape, arrows…); not during a drag. True when handled. */
  onKey(e: ToolKeyEvent): boolean {
    if (this.pressed) return false
    return toolById(this.active()).onKey?.(this.ctx(), e) ?? false
  }

  /** A new document: the active tool drops everything it had pending. */
  reset(): void {
    this.pressed = false
    toolById(this.active()).cancel?.(this.ctx())
  }

  /** Abandon the press in progress, undoing its live preview. */
  cancelGesture(): void {
    if (!this.pressed) return
    this.pressed = false
    toolById(this.active()).cancel?.(this.ctx())
  }

  /** Cancel any drag before undo, redo or a History click, so its preview can't be committed over the restored state. */
  attach(editor: PhotoEditor): () => void {
    editor.history.beforeNavigate = () => this.cancelGesture()
    return () => {
      if (editor.history.beforeNavigate) editor.history.beforeNavigate = undefined
    }
  }

  /**
   * Space pressed or released. The switch to Hand is temporary, so the previous tool keeps its
   * pending work (and its overlay) for when Space comes up. Ignored during a drag.
   */
  space(event: 'down' | 'up'): void {
    if (event === 'down' && this.pressed) return
    const next = holdSpace({ tool: this.active(), held: this.held }, event)
    this.held = next.held
    if (next.tool === this.active()) return
    this.temporaryTarget = next.tool
    this.setTool(next.tool)
  }

  private temporaryTarget: ToolId | null = null

  /**
   * Call whenever the active tool changed from `prev`, however it happened (Toolbox, ribbon, letter
   * key, Space). A real switch makes the old tool drop its work (a pending crop box, an open polygon)
   * and ends any Space hold; a Space switch keeps it. Returns true when the work was dropped.
   */
  toolChanged(prev: ToolId): boolean {
    if (this.temporaryTarget !== null && this.temporaryTarget === this.active()) {
      this.temporaryTarget = null
      return false
    }
    this.temporaryTarget = null
    this.held = null
    this.pressed = false
    toolById(prev).cancel?.(this.ctx())
    return true
  }
}
