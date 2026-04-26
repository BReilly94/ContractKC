'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  add: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const add = useCallback(
    (opts: ToastOptions) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...opts, id }]);
      setTimeout(() => dismiss(id), opts.duration ?? 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ add }}>
      {children}
      <div
        className="ckb-toast-region"
        aria-live="assertive"
        aria-atomic="false"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`ckb-toast ckb-toast--${t.variant ?? 'info'}`}
            role="status"
          >
            <div className="ckb-toast__body">
              <strong className="ckb-toast__title">{t.title}</strong>
              {t.description && (
                <p className="ckb-toast__description">{t.description}</p>
              )}
            </div>
            <button
              type="button"
              className="ckb-toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (opts: ToastOptions) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx.add;
}
