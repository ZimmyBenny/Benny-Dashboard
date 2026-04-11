import { useEffect } from 'react';
import type { Task } from '../../api/tasks.api';

interface ReminderPopupProps {
  task: Task;
  onStatusChange: (task: Task, status: Task['status']) => void | Promise<void>;
  onOpen: (task: Task) => void;
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
  } catch { /* AudioContext ohne User-Interaktion geblockt */ }
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

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  urgent: 'Dringend', high: 'Hoch', medium: 'Mittel', low: 'Niedrig',
};
const PRIORITY_COLOR: Record<Task['priority'], string> = {
  urgent: 'var(--color-error)', high: 'var(--color-primary)',
  medium: 'var(--color-on-surface-variant)', low: 'var(--color-outline)',
};

const STATUS_OPTIONS: { status: Task['status']; label: string; primary?: boolean }[] = [
  { status: 'open',        label: 'Offen' },
  { status: 'in_progress', label: 'In Arbeit' },
  { status: 'waiting',     label: 'Wartend' },
  { status: 'done',        label: 'Erledigt', primary: true },
];

export function ReminderPopup({ task, onStatusChange, onOpen, onLater }: ReminderPopupProps) {
  useEffect(() => { playNotificationSound(); }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '0.875rem', padding: '1.5rem',
        width: '100%', maxWidth: '440px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)' }}>
            notifications_active
          </span>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-primary)',
          }}>
            Erinnerung
          </span>
          {task.reminder_at && (
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-outline)', fontFamily: 'var(--font-body)' }}>
              {formatLocalDateTime(task.reminder_at)}
            </span>
          )}
        </div>

        {/* Task-Karte */}
        <div style={{
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '0.625rem', padding: '1rem', marginBottom: '1.25rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.05rem',
            color: 'var(--color-on-surface)', margin: '0 0 0.5rem', lineHeight: 1.3,
          }}>
            {task.title}
          </p>

          {/* Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: task.description ? '0.625rem' : 0 }}>
            <span style={{
              padding: '0.1rem 0.5rem', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 600,
              fontFamily: 'var(--font-body)', letterSpacing: '0.05em', textTransform: 'uppercase',
              color: PRIORITY_COLOR[task.priority], background: 'rgba(255,255,255,0.06)',
            }}>
              {PRIORITY_LABEL[task.priority]}
            </span>
            {task.area && (
              <span style={{
                padding: '0.1rem 0.5rem', borderRadius: '9999px', fontSize: '0.65rem',
                fontFamily: 'var(--font-body)', color: 'var(--color-secondary)', background: 'rgba(52,181,250,0.08)',
              }}>
                {task.area}
              </span>
            )}
          </div>

          {task.description && (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)',
              margin: 0, lineHeight: 1.5, wordBreak: 'break-word',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {task.description}
            </p>
          )}
        </div>

        {/* Aufgabe öffnen */}
        <button
          onClick={() => onOpen(task)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
            width: '100%', marginBottom: '1rem',
            padding: '0.5rem 1rem', borderRadius: '0.5rem',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-outline-variant)',
            color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)',
            fontWeight: 500, fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>open_in_new</span>
          Aufgabe öffnen
        </button>

        {/* Status-Auswahl */}
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--color-outline)', marginBottom: '0.5rem' }}>
          Status setzen:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {STATUS_OPTIONS.map(({ status, label, primary }) => (
            <button
              key={status}
              onClick={() => onStatusChange(task, status)}
              style={{
                padding: '0.5rem 0.75rem', borderRadius: '9999px',
                background: primary
                  ? 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))'
                  : 'rgba(255,255,255,0.06)',
                border: primary ? 'none' : '1px solid var(--color-outline-variant)',
                color: primary ? '#000' : 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)', fontWeight: primary ? 700 : 500,
                fontSize: '0.8rem', cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Später */}
        <button
          onClick={() => onLater(task)}
          style={{
            marginTop: '0.75rem', width: '100%', padding: '0.4rem 1rem',
            borderRadius: '9999px', background: 'transparent',
            border: '1px solid var(--color-outline-variant)',
            color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
            fontWeight: 500, fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          Später erinnern
        </button>
      </div>
    </div>
  );
}
