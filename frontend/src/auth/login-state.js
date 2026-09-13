// Modifier events contain no credential data. Unsupported events preserve the last known state.
export const capsLockState = (event, previous = false) => typeof event?.getModifierState === 'function' ? Boolean(event.getModifierState('CapsLock')) : previous;
export const defaultPersistence = (environment) => environment === 'demo';
