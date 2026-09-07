import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Appearance = 'cyberpunk' | 'daylight';

const APPEARANCE_STORAGE_KEY = 'day-tripper.appearance';

function readStoredAppearance(): Appearance {
  if (typeof window === 'undefined') return 'cyberpunk';

  try {
    return window.localStorage.getItem(APPEARANCE_STORAGE_KEY) === 'daylight'
      ? 'daylight'
      : 'cyberpunk';
  } catch {
    return 'cyberpunk';
  }
}

function applyAppearance(appearance: Appearance) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.appearance = appearance;
  }
}

type AppearanceContextValue = {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(() => {
    const stored = readStoredAppearance();
    applyAppearance(stored);
    return stored;
  });

  useEffect(() => {
    applyAppearance(appearance);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
    } catch {
      // The preference still applies for this session if storage is unavailable.
    }
  }, [appearance]);

  return (
    <AppearanceContext.Provider value={{ appearance, setAppearance: setAppearanceState }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error('useAppearance must be used within AppearanceProvider.');
  }
  return context;
}