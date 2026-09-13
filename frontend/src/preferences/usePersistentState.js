import { useEffect, useState } from 'react';
import { readStored, writeStored } from './storage';

// useState that remembers its value in this browser under `key`. Stored objects are merged over the
// defaults, so a setting added later still gets its default for people who saved before it existed.
export function usePersistentState(key, defaults) {
  const [value, setValue] = useState(() => {
    const stored = key ? readStored(key, undefined) : undefined;
    if (stored === undefined || stored === null) return defaults;
    if (typeof defaults === 'object' && !Array.isArray(defaults) && typeof stored === 'object' && !Array.isArray(stored)) {
      return { ...defaults, ...stored };
    }
    return typeof stored === typeof defaults ? stored : defaults;
  });

  useEffect(() => {
    if (key) writeStored(key, value);
  }, [key, value]);

  return [value, setValue];
}
