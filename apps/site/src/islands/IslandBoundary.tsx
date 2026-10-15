import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label: string
}

/** Catches render errors inside an island so one broken toy never blanks the page. */
export class IslandBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // warn, not error: keeps "no console errors" checks meaningful for real faults.
    console.warn(`[island:${this.props.label}] failed to render`, error)
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="island-fallback" role="status" data-island-failed={this.props.label}>
          This one didn't load. Try reloading.
        </p>
      )
    }
    return this.props.children
  }
}
