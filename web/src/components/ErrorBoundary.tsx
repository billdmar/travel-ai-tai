import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * App-level error boundary. Catches render-time errors anywhere below it and
 * shows an on-brand fallback (warm ivory canvas, charcoal ink, serif headline,
 * accent CTA) instead of a blank white screen. The "Try again" button clears
 * the error state so React re-mounts the subtree; the secondary action does a
 * full reload as an escape hatch.
 *
 * The fallback uses no animation, so it is inherently reduced-motion-safe.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface caught errors to the console for now; a real monitoring sink
    // (Sentry, etc.) can hook in here later.
    console.error('ErrorBoundary caught an error', error, info)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false })
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] flex-col items-center justify-center bg-canvas px-6 text-center text-ink"
      >
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-ink-faint">
          Something went wrong
        </p>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tightish text-ink sm:text-5xl">
          This page hit a snag
        </h1>
        <p className="mt-4 max-w-md text-base text-ink-soft">
          An unexpected error interrupted the page. You can try again, or reload
          if the problem persists.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center justify-center rounded-full bg-accent-500 px-6 py-2.5 text-sm font-medium tracking-tightish text-white transition-colors duration-hover ease-lux hover:bg-accent-600 active:bg-accent-700"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex items-center justify-center rounded-full border border-ink-line bg-canvas-raised px-6 py-2.5 text-sm font-medium tracking-tightish text-ink transition-colors duration-hover ease-lux hover:bg-canvas-sunken"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
