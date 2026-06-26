import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ryan Memory OS recovered from a render error.', error, info)
  }

  render() {
    if (this.state.hasError) {
      return <main className="fatal-error"><h1>Ryan Memory OS hit a display error.</h1><p>Your local data was not cleared. Reload the page to try again.</p><button onClick={() => window.location.reload()}>Reload safely</button></main>
    }
    return this.props.children
  }
}
