import { useEffect, useState } from 'react';
import { authApi } from '../api/keystone';
import Icon, { KeystoneMark } from './Icon';

// Sign-in screen. Credentials are never stored or pre-filled here; the seeded demo accounts are
// documented in the README for local development only.
export default function Login({ notice, bootError, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(bootError ?? null);
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState(null);

  useEffect(() => {
    let active = true;
    authApi.environment()
      .then((result) => { if (active) setEnvironment(result); })
      .catch((failure) => { if (active && !bootError) setError(failure); });
    return () => { active = false; };
  }, [bootError]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await authApi.login(email, password));
    } catch (failure) {
      setError(failure);
      setPassword('');
      setBusy(false);
    }
  }

  const isDemo = environment?.environment === 'demo';

  return (
    <div className="login-page">
      <main className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <KeystoneMark size={36} />
          <span>
            <strong>Keystone</strong>
            <small>{environment?.organizationName ?? 'Skill coverage and workforce readiness'}</small>
          </span>
        </div>

        <h1 id="login-title">Sign in</h1>
        <p className="muted">Use your Keystone account. What you can see depends on your role.</p>

        {notice && <p className="status-line status-neutral" role="status"><Icon name="info" size={16} /><span>{notice}</span></p>}
        {error && <p className="alert" role="alert">{error.message}</p>}

        <form className="login-form" onSubmit={submit}>
          <label className="field">Email
            <input type="email" autoComplete="username" required value={email} maxLength={254}
              onChange={(event) => setEmail(event.target.value)} aria-invalid={error?.code === 'invalid_credentials'} />
          </label>
          <label className="field">Password
            <input type="password" autoComplete="current-password" required value={password} maxLength={200}
              onChange={(event) => setPassword(event.target.value)} aria-invalid={error?.code === 'invalid_credentials'} />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !email.trim() || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <footer className="login-foot">
          {isDemo && <span className="tag tag-warn"><Icon name="info" size={14} /> Demo environment · fictional data</span>}
          <span className="muted small">
            {isDemo ? 'Seeded demo accounts are listed in the project README for local development.' : 'Ask an administrator if you need an account.'}
          </span>
        </footer>
      </main>
    </div>
  );
}
