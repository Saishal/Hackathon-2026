import { createContext, useContext } from 'react';

// Shared between the provider and the hook. Kept in a plain module so each React file exports only
// components, which is what keeps fast refresh working during development.
export const HelpContext = createContext({ state: { open: false, topic: null }, open: () => {}, close: () => {}, toggle: () => {} });

export const useHelp = () => useContext(HelpContext);
