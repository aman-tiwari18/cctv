import { createContext, useContext } from 'react';

/**
 * Shares whether the main (top-left hamburger) mobile navigation drawer is open.
 * Lets in-page overlays — like the ExamSidebar mobile drawer — react to the main
 * nav opening (e.g. contract/close themselves so two drawers never stack).
 */
const MobileNavContext = createContext(false);

export const MobileNavProvider = MobileNavContext.Provider;

export const useMobileNavOpen = () => useContext(MobileNavContext);

export default MobileNavContext;
