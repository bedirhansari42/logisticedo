/* Hata sınırı: bir sayfa çizilirken hata olursa (ör. bozuk bir kayıt) pencere boş kalmasın.
   Sayfa düzeyinde kullanılır (kenar çubuğu çalışmaya devam eder, başka sayfaya geçilince sıfırlanır: resetKey)
   ve en üstte son çare olarak (main.jsx). Hook kullanmaz: sağlayıcıların dışında da çalışır. */
import { Component } from "react";
import { tr as t } from "../lib/i18n.js";

export class ErrorBoundary extends Component {
  state = { error: null, key: undefined };

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // Başka sayfaya geçilince yeniden dene
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const msg = String(error?.message || error || "").slice(0, 300);
    return (
      <div className={this.props.root ? "page page--narrow page--center" : "page page--narrow"} role="alert">
        <div className="empty-state">
          <h2>{t("d.err.title")}</h2>
          <p className="muted">{t(this.props.root ? "d.err.textRoot" : "d.err.text")}</p>
          {msg && <p className="muted"><code>{msg}</code></p>}
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>{t("d.err.reload")}</button>
        </div>
      </div>
    );
  }
}
