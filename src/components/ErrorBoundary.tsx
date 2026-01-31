'use client'

import React from 'react'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-100 text-red-800 rounded border border-red-300">
                    <h2 className="font-bold">Something went wrong.</h2>
                    <pre className="mt-2 text-sm overflow-auto">{this.state.error?.message}</pre>
                    <pre className="mt-2 text-xs text-gray-600">{this.state.error?.stack}</pre>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
