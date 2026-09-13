import { useCallback, useEffect, useState } from 'react';

// One in-page signal for "official data changed somewhere else": another person approved a change,
// archived an employee, acknowledged a risk, or the same person did it in another tab. The section
// host raises it after its poll notices a new audit entry (see useLiveUpdates); pages that load their
// own data subscribe and refetch, so nobody has to press reload to see a colleague's work.

export const DATA_CHANGED_EVENT = 'keystone:data-changed';

export const notifyDataChanged = (detail = null) => window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT, { detail }));

// Runs `callback` on every signal. Pass a stable function (useCallback) to avoid re-subscribing each render.
export function useDataChanged(callback) {
  useEffect(() => {
    const handle = (event) => callback(event.detail);
    window.addEventListener(DATA_CHANGED_EVENT, handle);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handle);
  }, [callback]);
}

// A counter that advances on every signal, for effects that load in place of a load() function.
export function useDataVersion() {
  const [version, setVersion] = useState(0);
  useDataChanged(useCallback(() => setVersion((value) => value + 1), []));
  return version;
}
