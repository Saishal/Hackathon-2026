import { useCallback, useMemo, useState } from 'react';

// Filter state that lives in the URL hash query (#/people?department=Engineering), so a filtered
// view can be bookmarked or pasted to a colleague. Writes use replaceState, which does not fire
// hashchange, so the page is not remounted on every keystroke; the initial read comes from the URL.
// Only keys in `defaults` are read, and a value equal to its default is omitted from the URL.

function readHash() {
  const [path = '', search = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  return { path, params: new URLSearchParams(search) };
}

function writeHash(path, params) {
  const search = params.toString();
  const next = `#/${path}${search ? `?${search}` : ''}`;
  if (next !== window.location.hash) window.history.replaceState(null, '', next);
}

export function useUrlFilters(defaults, { preserve = [] } = {}) {
  const keys = useMemo(() => Object.keys(defaults), [defaults]);
  const [filters, setFilters] = useState(() => {
    const { params } = readHash();
    const initial = { ...defaults };
    for (const key of keys) if (params.has(key)) initial[key] = params.get(key);
    return initial;
  });

  const commit = useCallback((next) => {
    const { path, params } = readHash();
    const kept = new URLSearchParams();
    for (const key of preserve) if (params.has(key)) kept.set(key, params.get(key));
    for (const key of keys) if (next[key] !== defaults[key] && next[key] !== '' && next[key] !== undefined) kept.set(key, next[key]);
    writeHash(path, kept);
    setFilters(next);
  }, [defaults, keys, preserve]);

  const setFilter = useCallback((key) => (eventOrValue) => {
    const value = eventOrValue && typeof eventOrValue === 'object' && 'target' in eventOrValue
      ? (eventOrValue.target.type === 'checkbox' ? (eventOrValue.target.checked ? 'true' : '') : eventOrValue.target.value)
      : eventOrValue;
    commit({ ...filters, [key]: value });
  }, [commit, filters]);

  const replace = useCallback((next) => commit({ ...defaults, ...next }), [commit, defaults]);
  const reset = useCallback(() => commit({ ...defaults }), [commit, defaults]);
  const active = useMemo(() => keys.filter((key) => filters[key] !== defaults[key] && filters[key] !== ''), [filters, defaults, keys]);

  return { filters, setFilter, replace, reset, active };
}
