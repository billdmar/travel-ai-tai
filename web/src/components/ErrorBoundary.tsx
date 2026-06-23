import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * App-level error boundary (FOUNDATION stub).
 *
 * Currently renders children untouched and only logs caught errors. FE-QUALITY
 * fills in the real fallback UI (and any reset/recovery affordance).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // FE-QUALITY: report to logging/monitoring here.
    console.error('ErrorBoundary caught an error', error, info)
  }

  render(): ReactNode {
    return this.props.children
  }
}
