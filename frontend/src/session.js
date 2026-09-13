import { createContext, useContext } from 'react';

// The signed-in user, their capabilities and organization, shared with every view. Components check
// capabilities with can(session, ...) from components/format.js; the server enforces the same rules.
export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);
