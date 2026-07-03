import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PushSetupState =
  | 'pending'
  | 'ready'
  | 'permission_denied'
  | 'fis_auth_error'
  | 'no_project_id'
  | 'simulator'
  | 'unavailable';

export interface PushSetupStatus {
  state: PushSetupState;
  detail?: string;
}

interface PushStatusContextValue {
  status: PushSetupStatus;
  setPushStatus: (status: PushSetupStatus) => void;
}

const PushStatusContext = createContext<PushStatusContextValue | null>(null);

export function PushStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PushSetupStatus>({ state: 'pending' });

  const setPushStatus = useCallback((next: PushSetupStatus) => {
    setStatus(next);
  }, []);

  const value = useMemo(
    () => ({
      status,
      setPushStatus,
    }),
    [status, setPushStatus],
  );

  return (
    <PushStatusContext.Provider value={value}>{children}</PushStatusContext.Provider>
  );
}

export function usePushStatus(): PushStatusContextValue {
  const context = useContext(PushStatusContext);
  if (!context) {
    throw new Error('usePushStatus must be used within PushStatusProvider');
  }
  return context;
}
