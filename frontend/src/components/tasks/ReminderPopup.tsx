import { useEffect } from 'react';
import type { Task } from '../../api/tasks.api';

interface ReminderPopupProps {
  task: Task;
  onStatusChange: (task: Task, status: Task['status']) => void | Promise<void>;
  onLater: (task: Task) => void;
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch { /* browser blockt AudioContext ohne User-Interaktion — ignorieren */ }
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

const STATUS_OPTIONS: { status: Task['status']; label: string; primary?: boolean }[] = [
  { status: 'open',        label: 'Offen' },
  { status: 'in_progress', label: 'In Arbeit' },
  { status: 'waiting',     label: 'Wartend' },
  { status: 'done',        label: 'Erledigt', primary: true },
];

export function ReminderPopup({ task, onStatusChange, onLater }: ReminderPopupProps) {
  useEffect(() => { playNotificationSound(); }, []);

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

        {/* Status-Auswahl */}
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-outline)', marginTop: '1.25rem', marginBottom: '0.5rem' }}>
          Status setzen:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {STATUS_OPTIONS.map(({ status, label, primary }) => (
            <button
              key={status}
              onClick={() => onStatusChange(task, status)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '9999px',
                background: primary
                  ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                  : 'rgba(255,255,255,0.06)',
                border: primary ? 'none' : '1px solid var(--color-outline-variant)',
                color: primary ? '#000' : 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontWeight: primary ? 700 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Spaeter */}
        <button
          onClick={() => onLater(task)}
          style={{
            marginTop: '0.75rem',
            width: '100%',
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            background: 'transparent',
            border: '1px solid var(--color-outline-variant)',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          Später erinnern
        </button>
      </div>
    </div>
  );
}
