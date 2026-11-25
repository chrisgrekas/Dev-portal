import { ReactNode, useEffect, useRef } from 'react';
import { errorMessage } from '../api/client';
import { Button, IconButton } from './ui';

interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg';
  /** Αν δοθεί, το περιεχόμενο γίνεται φόρμα με κουμπιά Ακύρωση / submitLabel. */
  onSubmit?: () => void;
  submitLabel?: string;
  submitVariant?: 'primary' | 'danger';
  submitDisabled?: boolean;
  busy?: boolean;
  error?: unknown;
  footer?: ReactNode;
}

/**
 * Modal sheet πάνω από native <dialog> (focus trap, Esc, top layer).
 * Ο γονέας το κάνει mount μόνο όταν είναι ανοιχτό, ώστε η κατάσταση της φόρμας να ξεκινά καθαρή.
 */
export function Sheet({
  title,
  onClose,
  children,
  size = 'md',
  onSubmit,
  submitLabel = 'Αποθήκευση',
  submitVariant = 'primary',
  submitDisabled,
  busy,
  error,
  footer,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      // Το autoFocus του React τρέχει πριν ανοίξει το dialog, οπότε εστιάζουμε εδώ:
      // [data-autofocus] αν υπάρχει, αλλιώς το πρώτο πεδίο της φόρμας (όχι το κουμπί κλεισίματος).
      const target =
        d.querySelector<HTMLElement>('[data-autofocus="true"]') ??
        d.querySelector<HTMLElement>('.sheet-body input:not([disabled]), .sheet-body textarea:not([disabled]), .sheet-body select:not([disabled])');
      target?.focus();
    }
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  const close = () => {
    if (!busy) onClose();
  };

  const content = (
    <>
      <div className="sheet-header">
        <h2>{title}</h2>
        <IconButton icon="close" label="Κλείσιμο" onClick={close} />
      </div>
      <div className="sheet-body">
        {children}
        {error != null && (
          <div className="form-error" role="alert">
            {errorMessage(error)}
          </div>
        )}
      </div>
      {(onSubmit || footer) && (
        <div className="sheet-footer">
          {footer}
          {onSubmit && (
            <>
              <Button variant="secondary" onClick={close}>
                Ακύρωση
              </Button>
              <Button type="submit" variant={submitVariant} busy={busy} disabled={submitDisabled}>
                {submitLabel}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={`sheet sheet-${size}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      {onSubmit ? (
        <form
          className="sheet-inner"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && !submitDisabled) onSubmit();
          }}
        >
          {content}
        </form>
      ) : (
        <div className="sheet-inner">{content}</div>
      )}
    </dialog>
  );
}
