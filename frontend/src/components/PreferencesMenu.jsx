import { useEffect, useId, useRef, useState } from 'react';
import { LANGUAGES } from '../i18n/translate';
import { usePreferences } from '../preferences/context';
import Icon from './Icon';

// Display menu: theme (follow the system, light or dark) and interface language. Choices apply at once and
// are remembered in this browser, including on the sign-in page.
const THEME_OPTIONS = [['system', 'monitor'], ['light', 'sun'], ['dark', 'moon']];

export default function PreferencesMenu({ className = '' }) {
  const { theme, resolvedTheme, language, setTheme, setLanguage, t } = usePreferences();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => { if (!box.current?.contains(event.target)) setOpen(false); };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`popover-anchor ${className}`} ref={box}>
      <button ref={button} type="button" className="topbar-button" aria-expanded={open} aria-controls={panelId}
        aria-label={t('preferences.button')} title={t('preferences.button')} onClick={() => setOpen((value) => !value)}>
        <Icon name={resolvedTheme === 'dark' ? 'moon' : 'sun'} size={18} />
      </button>

      {open && (
        <div className="popover" id={panelId} role="group" aria-labelledby={`${panelId}-title`}>
          <h2 id={`${panelId}-title`}>{t('preferences.title')}</h2>

          <div className="popover-section">
            <p className="popover-label" id={`${panelId}-theme`}>{t('preferences.theme')}</p>
            <div className="segmented" role="radiogroup" aria-labelledby={`${panelId}-theme`}>
              {THEME_OPTIONS.map(([value, icon]) => (
                <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => setTheme(value)}>
                  <Icon name={icon} size={15} /> {t(`preferences.themes.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="popover-section">
            <p className="popover-label" id={`${panelId}-language`}><Icon name="globe" size={14} /> {t('preferences.language')}</p>
            <div className="language-list" role="radiogroup" aria-labelledby={`${panelId}-language`}>
              {LANGUAGES.map((entry) => (
                <button key={entry.code} type="button" role="radio" lang={entry.code} className="language-option"
                  aria-checked={language === entry.code} onClick={() => setLanguage(entry.code)}>
                  <span>{entry.label}</span>
                  {language === entry.code && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
            {language !== 'en' && <p className="popover-note">{t('preferences.partialTranslation')}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
