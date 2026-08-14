import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    console.error('Erro não tratado capturado pelo ErrorBoundary:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center',
      }}>
        <span style={{ fontSize: 32 }}>⚠️</span>
        <p style={{ fontWeight: 600, fontSize: 16 }}>Algo deu errado nesta tela</p>
        <p style={{ color: 'var(--text-3)', fontSize: 13, maxWidth: 420 }}>
          {this.state.erro.message || 'Erro inesperado.'}
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
          ↺ Recarregar
        </button>
      </div>
    )
  }
}
