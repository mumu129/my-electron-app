// src/renderer/src/components/ErrorBoundary.jsx
import React from 'react'

export default class ErrorBoundary extends React.Component {
  state = { error: null, info: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] 捕获渲染错误:', error, info)
    this.setState({ info })
  }

  handleRetry = () => this.setState({ error: null, info: null })

  handleCopy = async () => {
    const { error, info } = this.state
    const text = `[message]\n${error?.message || ''}\n\n[stack]\n${error?.stack || String(error)}\n\n[componentStack]\n${info?.componentStack || ''}`
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  render() {
    if (this.state.error) {
      const { error, info } = this.state
      return (
        <div style={{ padding: 24, color: '#cf1322', fontFamily: 'monospace', height: '100%', overflow: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>渲染出错</h3>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            <button onClick={this.handleRetry}>重试</button>
            <button onClick={this.handleCopy}>复制错误信息</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {String(error?.stack || error)}
            {info?.componentStack ? `\n\n[componentStack]\n${info.componentStack}` : ''}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}