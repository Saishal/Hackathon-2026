import en from './en';
import es from './es';

export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
];

const DICTIONARIES = { en, es };

export const isLanguage = (code) => Object.hasOwn(DICTIONARIES, code);
export const localeFor = (language) => LANGUAGES.find((entry) => entry.code === language)?.locale ?? 'en-US';

export function detectLanguage() {
  const preferred = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  return preferred.map((tag) => String(tag).slice(0, 2).toLowerCase()).find(isLanguage) ?? 'en';
}

function lookup(language, key) {
  return DICTIONARIES[language]?.[key] ?? en[key];
}

// t('key', { name: 'Ava' }) fills {name}. With a numeric `count`, `key.one` or `key.other` is chosen by the
// language's plural rules. A missing key falls back to English, then to `defaultValue`, then to the key.
export function translate(language, key, vars = {}) {
  let text;
  if (typeof vars.count === 'number') {
    const form = new Intl.PluralRules(localeFor(language)).select(vars.count) === 'one' ? 'one' : 'other';
    text = lookup(language, `${key}.${form}`) ?? lookup(language, key);
  } else {
    text = lookup(language, key);
  }
  if (text === undefined) return vars.defaultValue ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
}
