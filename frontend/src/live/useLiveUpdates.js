import { useCallback, useEffect, useRef } from 'react';
import { keystoneApi } from '../api/keystone';

// Keeps an open tab current without websockets: every 20 seconds (and whenever the tab becomes
// visible again) it asks the server for its activity stamp - the id of the newest audit entry, a
// few bytes - and calls `onChange` only when that id moved since the last look. The audit log is
// append-only and every official change writes to it, so a moved id is exactly "something changed".
//
// `sync()` records the current stamp after this tab's own writes, so its own changes do not come
// back as a second refresh.

const POLL_MS = 20 * 1000;

export function useLiveUpdates(onChange, { enabled = true } = {}) {
  const lastSeen = useRef(null);

  const sync = useCallback(async () => {
    try {
      lastSeen.current = (await keystoneApi.activityStamp()).latestAuditId;
    } catch {
      // Offline or signed out: the next poll starts over.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const check = async () => {
      try {
        const stamp = await keystoneApi.activityStamp();
        if (!live) return;
        const moved = lastSeen.current !== null && stamp.latestAuditId !== lastSeen.current;
        lastSeen.current = stamp.latestAuditId;
        if (moved) onChange(stamp);
      } catch {
        // A failed poll is silent; the request layer already sends an ended session back to sign-in.
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, onChange]);

  return { sync };
}
