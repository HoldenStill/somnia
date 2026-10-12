import React, { Component, ErrorInfo, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in Somnia UI:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#09090b] text-zinc-100 p-6">
          <div className="max-w-md p-6 rounded-2xl bg-[#121217] border border-rose-500/30 text-center space-y-4 shadow-2xl">
            <h2 className="text-lg font-bold text-rose-400">Application Error</h2>
            <p className="text-xs text-zinc-400 font-mono bg-[#181820] p-3 rounded-xl border border-zinc-800 text-left overflow-auto max-h-36">
              {this.state.error?.message || 'An unexpected UI error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-teal-500 text-zinc-950 font-semibold text-xs hover:bg-teal-400 transition-colors shadow-[0_0_12px_rgba(45,212,191,0.3)]"
            >
              Reload Application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
