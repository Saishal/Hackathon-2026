import { useCallback, useEffect, useMemo, useState } from 'react';
import { setFormatLocale } from '../components/format';
import { detectLanguage, isLanguage, localeFor, translate } from '../i18n/translate';
import { PreferencesContext } from './context';
import { readStored, writeStored } from './storage';

// Theme and language live in this browser's storage, so they apply before sign-in and on the sign-in page.
// "system" follows the operating system and changes live when it does. index.html applies the stored theme
// before the first paint, so a dark page never flashes light.
export const PREFERENCES_KEY = 'keystone.preferences';
const THEMES = ['system', 'light', 'dark'];
const THEME_COLORS = { light: '#f4f5f7', dark: '#0e1116' };
const DARK_QUERY = '(prefers-color-scheme: dark)';

function initialPreferences() {
  const stored = readStored(PREFERENCES_KEY, {});
  return {
    theme: THEMES.includes(stored?.theme) ? stored.theme : 'system',
    language: isLanguage(stored?.language) ? stored.language : detectLanguage(),
  };
}

const systemPrefersDark = () => Boolean(window.matchMedia?.(DARK_QUERY).matches);

export default function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const { theme, language } = preferences;
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const locale = localeFor(language);

  // Dates and relative times are formatted outside React, so the formatter learns the locale before children render.
  setFormatLocale(locale);

  useEffect(() => {
    const query = window.matchMedia?.(DARK_QUERY);
    if (!query) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolvedTheme]);
  }, [theme, resolvedTheme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    writeStored(PREFERENCES_KEY, preferences);
  }, [preferences]);

  const setTheme = useCallback((next) => {
    if (THEMES.includes(next)) setPreferences((current) => ({ ...current, theme: next }));
  }, []);
  const setLanguage = useCallback((next) => {
    if (isLanguage(next)) setPreferences((current) => ({ ...current, language: next }));
  }, []);
  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  const value = useMemo(
    () => ({ theme, resolvedTheme, language, locale, setTheme, setLanguage, t }),
    [theme, resolvedTheme, language, locale, setTheme, setLanguage, t],
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
