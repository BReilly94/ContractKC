import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ckb-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="ckb-dialog__header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="ckb-dialog__close"
        >
          ×
        </button>
      </header>
      <div className="ckb-dialog__body">{children}</div>
    </dialog>
  );
}
