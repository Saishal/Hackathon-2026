import { useCallback, useMemo, useState } from 'react';
import { HelpContext } from './context';

// One place that knows whether the help drawer is open and which topic it should show first.
// Contextual "?" buttons anywhere in the app call open(topicId); the header button calls open().
export function HelpProvider({ children }) {
  const [state, setState] = useState({ open: false, topic: null });

  const open = useCallback((topic = null) => setState({ open: true, topic }), []);
  const close = useCallback(() => setState((current) => ({ ...current, open: false })), []);
  const toggle = useCallback(() => setState((current) => ({ open: !current.open, topic: current.open ? current.topic : null })), []);

  const value = useMemo(() => ({ state, open, close, toggle }), [state, open, close, toggle]);
  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}
