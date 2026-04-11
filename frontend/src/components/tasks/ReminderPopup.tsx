import type { Task } from '../../api/tasks.api';

interface ReminderPopupProps {
  task: Task;
  onDone: (task: Task) => void | Promise<void>;
  onLater: (task: Task) => void;
}

function formatLocalDateTime(iso: string): string {
  const normalized = iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function ReminderPopup({ task, onDone, onLater }: ReminderPopupProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          width: '100%',
          maxWidth: '420px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '22px', color: 'var(--color-primary)' }}
          >
            notifications_active
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              fontSize: '1rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-on-surface)',
              margin: 0,
            }}
          >
            Erinnerung!
          </h2>
        </div>

        {/* Task title */}
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1.125rem',
            color: 'var(--color-on-surface)',
            marginTop: '1rem',
            marginBottom: 0,
          }}
        >
          {task.title}
        </p>

        {/* Planned time */}
        {task.reminder_at && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'var(--color-on-surface-variant)',
              marginTop: '0.375rem',
              marginBottom: 0,
            }}
          >
            Geplant: {formatLocalDateTime(task.reminder_at)}
          </p>
        )}

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginTop: '1.5rem',
          }}
        >
          <button
            onClick={() => onLater(task)}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              background: 'transparent',
              border: '1px solid var(--color-outline-variant)',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Spaeter
          </button>
          <button
            onClick={() => onDone(task)}
            style={{
              flex: 1,
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              border: 'none',
              color: '#000',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Erledigt
          </button>
        </div>
      </div>
    </div>
  );
}
