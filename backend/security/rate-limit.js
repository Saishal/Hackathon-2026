// In-memory login throttling for a single-process demo server. Failures are counted per account
// (so guessing one password from many addresses is still stopped) and per client address.
// A multi-instance deployment would move these counters to a shared store.
function createLoginLimiter({ maxFailures = 5, windowMinutes = 15, maxPerAddress = 50, now = () => Date.now() } = {}) {
  const windowMs = windowMinutes * 60 * 1000;
  const failures = new Map();

  const recent = (key) => {
    const list = (failures.get(key) ?? []).filter((time) => now() - time < windowMs);
    if (list.length > 0) failures.set(key, list); else failures.delete(key);
    return list;
  };

  return {
    check(address, email) {
      const account = recent(`account:${email}`);
      const client = recent(`address:${address}`);
      const blocking = account.length >= maxFailures ? account : client.length >= maxPerAddress ? client : null;
      if (!blocking) return { allowed: true };
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blocking[0] + windowMs - now()) / 1000)) };
    },
    recordFailure(address, email) {
      for (const key of [`account:${email}`, `address:${address}`]) failures.set(key, [...recent(key), now()]);
    },
    reset(email) {
      failures.delete(`account:${email}`);
    },
  };
}

module.exports = { createLoginLimiter };
