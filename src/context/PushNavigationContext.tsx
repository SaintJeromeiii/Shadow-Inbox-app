import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

export interface PushNavigationPayload {
  notificationId: string;
  accountKey?: string;
}

type PushNavigationHandler = (payload: PushNavigationPayload) => void;

interface PushNavigationContextValue {
  registerHandler: (handler: PushNavigationHandler | null) => void;
  handlePushOpen: (payload: PushNavigationPayload) => void;
}

const PushNavigationContext = createContext<PushNavigationContextValue | null>(null);

export function PushNavigationProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<PushNavigationHandler | null>(null);

  const registerHandler = useCallback((handler: PushNavigationHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const handlePushOpen = useCallback((payload: PushNavigationPayload) => {
    if (!payload.notificationId) {
      return;
    }
    handlerRef.current?.(payload);
  }, []);

  const value = { registerHandler, handlePushOpen };

  return (
    <PushNavigationContext.Provider value={value}>{children}</PushNavigationContext.Provider>
  );
}

export function usePushNavigation() {
  const context = useContext(PushNavigationContext);
  if (!context) {
    throw new Error('usePushNavigation must be used within PushNavigationProvider');
  }
  return context;
}

export function useRegisterPushNavigation(handler: PushNavigationHandler) {
  const { registerHandler } = usePushNavigation();

  useEffect(() => {
    registerHandler(handler);
    return () => registerHandler(null);
  }, [handler, registerHandler]);
}
