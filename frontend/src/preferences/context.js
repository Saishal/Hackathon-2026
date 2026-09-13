import { createContext, useContext } from 'react';
import { translate } from '../i18n/translate';

// Display preferences shared with every component: theme, language and the translator for that language.
// The default keeps components usable outside the provider (English, light).
export const PreferencesContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  language: 'en',
  locale: 'en-US',
  setTheme: () => {},
  setLanguage: () => {},
  t: (key, vars) => translate('en', key, vars),
});

export const usePreferences = () => useContext(PreferencesContext);
export const useT = () => useContext(PreferencesContext).t;
