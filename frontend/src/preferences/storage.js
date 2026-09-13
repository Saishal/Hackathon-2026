// Browser storage can be unavailable (private windows, blocked site data), so every read and write is
// guarded and the app keeps working with defaults.
export function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The choice still applies for this visit.
  }
}
