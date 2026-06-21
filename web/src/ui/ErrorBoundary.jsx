import { Component } from 'react'

// Filet de sécurité global : transforme un crash React (ex. erreur jetée dans un
// useFrame, un composant qui plante au chargement d'un modèle) en écran de
// récupération au lieu d'un écran blanc qui tue tout le jeu.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Log pour le debug ; on garde la stack côté console.
    console.error('[ErrorBoundary] Crash capturé :', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const message = this.state.error?.message ?? 'Erreur inconnue'
    return (
      <div style={styles.overlay} role="alert">
        <div style={styles.card}>
          <div style={styles.emoji}>😵‍💫</div>
          <h1 style={styles.title}>Oups, le jeu a planté</h1>
          <p style={styles.text}>
            Une erreur a interrompu la partie. Tu peux recharger pour reprendre — ta
            progression sauvegardée n'est pas perdue.
          </p>
          <button type="button" style={styles.button} onClick={this.handleReload}>
            Recharger le jeu
          </button>
          <details style={styles.details}>
            <summary style={styles.summary}>Détails techniques</summary>
            <pre style={styles.pre}>{message}</pre>
          </details>
        </div>
      </div>
    )
  }
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'radial-gradient(circle at 50% 30%, #1c2336 0%, #0b0e16 100%)',
    color: '#f2f4f8',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    zIndex: 999999,
  },
  card: {
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '18px',
    padding: '32px 26px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  },
  emoji: { fontSize: '44px', marginBottom: '8px' },
  title: { fontSize: '22px', margin: '0 0 12px', fontWeight: 700 },
  text: { fontSize: '15px', lineHeight: 1.5, margin: '0 0 22px', color: '#c4cad6' },
  button: {
    appearance: 'none',
    border: 'none',
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #5b8cff, #7a5bff)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    padding: '12px 26px',
    borderRadius: '12px',
    boxShadow: '0 8px 20px rgba(91,140,255,0.35)',
  },
  details: { marginTop: '22px', textAlign: 'left' },
  summary: { cursor: 'pointer', fontSize: '13px', color: '#8a93a6' },
  pre: {
    marginTop: '10px',
    padding: '12px',
    background: 'rgba(0,0,0,0.4)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#ff9b9b',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '160px',
    overflow: 'auto',
  },
}

export default ErrorBoundary
