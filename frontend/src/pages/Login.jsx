import { useId, useState } from "react";
import Icon from "../components/Icon.jsx";

// Access-code login. The code is checked by the Worker; on success the
// Worker sets an HttpOnly session cookie (never readable by JavaScript).
export default function Login({ onLogin, configured, status, onRetry }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLogin(code.trim());
    } catch (err) {
      setError(err.message || "Login failed");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="card login-card" onSubmit={handleSubmit} noValidate>
        <div className="login-brand">
          <span className="brand-mark">
            <Icon name="shield" size={22} />
          </span>
          <div>
            <h1 className="login-title">Agent Activity Logger</h1>
            <p className="muted small">AI Security Monitoring Dashboard</p>
          </div>
        </div>

        {status === "checking" && (
          <p className="muted" aria-busy="true">
            <span className="spinner" aria-hidden="true" /> Checking session…
          </p>
        )}

        {status === "error" && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} />
            <span>Cannot reach the server.</span>
            <button type="button" className="btn btn-link" onClick={onRetry}>Retry</button>
          </div>
        )}

        {status === "anonymous" && !configured && (
          <div className="alert alert-error" role="alert">
            <Icon name="alert" size={16} />
            <span>Authentication is not configured on the server yet.</span>
          </div>
        )}

        {status === "anonymous" && (
          <>
            <p className="muted small">
              This dashboard shows private agent execution data. Enter the access code to continue.
            </p>
            <label className="field-label" htmlFor={id}>Access code</label>
            <input
              id={id}
              className={`input ${error ? "has-error" : ""}`}
              type="password"
              autoComplete="current-password"
              value={code}
              maxLength={200}
              disabled={busy}
              aria-invalid={Boolean(error)}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              autoFocus
            />
            {error && (
              <div className="alert alert-error" role="alert">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </div>
            )}
            <button type="submit" className="btn btn-primary login-submit" disabled={busy || !code.trim()}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="lock" size={16} />} Sign in
            </button>
          </>
        )}
      </form>
    </div>
  );
}
