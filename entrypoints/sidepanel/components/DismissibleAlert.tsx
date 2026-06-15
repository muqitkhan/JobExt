interface DismissibleAlertProps {
  message: string;
  variant: 'error' | 'success';
  onDismiss: () => void;
}

export function DismissibleAlert({ message, variant, onDismiss }: DismissibleAlertProps) {
  const isError = variant === 'error';

  return (
    <div
      className="animate-in flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-sm"
      style={{
        background: isError ? 'var(--danger-soft)' : 'var(--accent-soft)',
        color: isError ? 'var(--danger)' : 'var(--accent)',
      }}
      role={isError ? 'alert' : 'status'}
    >
      <p className="min-w-0 flex-1 leading-snug">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
        title="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
