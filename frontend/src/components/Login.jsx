import { useEffect, useState } from 'react';
import { authApi } from '../api/keystone';
import { useT } from '../preferences/context';
import Icon, { KeystoneMark } from './Icon';
import PreferencesMenu from './PreferencesMenu';

// Sign-in screen. Credentials are never stored or pre-filled here; the seeded demo accounts are
// documented in the README for local development only. Theme and language can be chosen before signing in.
export default function Login({ notice, bootError, onSignedIn }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(bootError ?? null);
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState(null);
  const [capsLock, setCapsLock] = useState(false);

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

  // This warning never reads or exposes the password. It only uses the keyboard modifier state.
  const updateCapsLock = (event) => setCapsLock(Boolean(event.getModifierState?.('CapsLock')));

  const isDemo = environment?.environment === 'demo';

  return (
    <div className="login-page">
      <main className="login-card" aria-labelledby="login-title">
        <PreferencesMenu className="login-prefs" />
        <div className="login-brand">
          <KeystoneMark size={36} />
          <span>
            <strong>Keystone</strong>
            <small>{environment?.organizationName ?? t('login.tagline')}</small>
          </span>
        </div>

        <h1 id="login-title">{t('login.title')}</h1>
        <p className="muted">{t('login.intro')}</p>

        {notice && <p className="status-line status-neutral" role="status"><Icon name="info" size={16} /><span>{notice}</span></p>}
        {error && <p className="alert" role="alert">{error.status === 0 ? t('login.unreachable') : error.message}</p>}

        <form className="login-form" onSubmit={submit}>
          <label className="field">{t('login.email')}
            <input type="email" autoComplete="username" required value={email} maxLength={254}
              onChange={(event) => setEmail(event.target.value)} aria-invalid={error?.code === 'invalid_credentials'} />
          </label>
          <label className="field">{t('login.password')}
            <input type="password" autoComplete="current-password" required value={password} maxLength={200}
              onChange={(event) => { setPassword(event.target.value); updateCapsLock(event); }}
              onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLock(false)}
              aria-invalid={error?.code === 'invalid_credentials'} aria-describedby={capsLock ? 'caps-lock-warning' : undefined} />
          </label>
          {capsLock && <p id="caps-lock-warning" className="field-message status-warn" role="status"><Icon name="alert" size={15} /> Caps Lock is on.</p>}
          <button className="btn btn-primary btn-block" disabled={busy || !email.trim() || !password}>
            {busy ? t('login.signingIn') : t('login.submit')}
          </button>
        </form>

        <footer className="login-foot">
          {isDemo && <span className="tag tag-warn"><Icon name="info" size={14} /> {t('common.demo')}</span>}
          <span className="muted small">{isDemo ? t('login.demoAccounts') : t('login.askAdmin')}</span>
        </footer>
      </main>
    </div>
  );
}
