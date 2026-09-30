import { Component, type ReactNode } from 'react';
import { navigate } from './router';

/** Shows what broke instead of a blank screen, and gets the player back home. */
export class ErrorBoundary extends Component<{ children: ReactNode; full?: boolean }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className={`crash ${this.props.full ? 'crash-full' : ''}`} role="alert">
        <div className="panel crash-card">
          <h2>Щось зламалось</h2>
          <p className="muted small">Сторінка впала з помилкою — надішліть її текст розробнику:</p>
          <pre className="crash-text">{error.message || String(error)}</pre>
          <div className="crash-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                navigate('/play');
                this.setState({ error: null });
              }}
            >
              На головну
            </button>
            <button className="btn" onClick={() => window.location.reload()}>
              Оновити сторінку
            </button>
          </div>
        </div>
      </div>
    );
  }
}
