import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../api/tasks.api';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
  onArchive?: (id: number) => void;
}

const PRIORITY_STYLES: Record<Task['priority'], { color: string; bg: string; label: string }> = {
  urgent: { color: 'var(--color-error)', bg: 'rgba(255,110,132,0.12)', label: 'Dringend' },
  high:   { color: 'var(--color-primary)', bg: 'rgba(204,151,255,0.12)', label: 'Hoch' },
  medium: { color: 'var(--color-on-surface-variant)', bg: 'rgba(163,170,196,0.1)', label: 'Mittel' },
  low:    { color: 'var(--color-outline)', bg: 'rgba(109,117,140,0.1)', label: 'Niedrig' },
};

function isOverdue(dueDate: string | null, status: Task['status']): boolean {
  if (!dueDate || status === 'done') return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

export function TaskCard({ task, onClick, isDragging = false, onArchive }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: task.id,
  });

  const dragging = isDragging || isSortableDragging;
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium;
  const overdue = isOverdue(task.due_date, task.status);
  const tags = task.tags ? task.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? 'border-color 150ms ease',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-surface-container-high)',
        borderRadius: '0.75rem',
        padding: '1rem',
        cursor: 'pointer',
        opacity: dragging ? 0.5 : 1,
        boxShadow: dragging ? 'var(--glow-primary)' : 'none',
        userSelect: 'none',
        marginBottom: '0.5rem',
      }}
      onMouseEnter={(e) => {
        if (!dragging) {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(204,151,255,0.3)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-surface-container-high)';
      }}
    >
      {/* Title */}
      <p style={{
        fontFamily: 'var(--font-headline)',
        fontWeight: 700,
        fontSize: '0.875rem',
        color: 'var(--color-on-surface)',
        marginBottom: '0.5rem',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}>
        {task.title}
      </p>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.375rem', marginBottom: tags.length > 0 ? '0.5rem' : 0 }}>
        {/* Priority badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.15rem 0.5rem',
          borderRadius: '9999px',
          background: priority.bg,
          color: priority.color,
          fontFamily: 'var(--font-body)',
          fontSize: '0.65rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {priority.label}
        </span>

        {/* Area label */}
        {task.area && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.15rem 0.5rem',
            borderRadius: '9999px',
            background: 'rgba(52,181,250,0.08)',
            color: 'var(--color-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.65rem',
            fontWeight: 500,
            letterSpacing: '0.04em',
          }}>
            {task.area}
          </span>
        )}

        {/* Due date */}
        {task.due_date && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.65rem',
            color: overdue ? 'var(--color-error)' : 'var(--color-outline)',
            letterSpacing: '0.03em',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
              {overdue ? 'warning' : 'event'}
            </span>
            {task.due_date}
          </span>
        )}

        {/* Reminder bell */}
        {task.has_reminder === 1 && task.reminder_at && (
          <span
            title={`Erinnerung: ${new Date(task.reminder_at.includes('T') ? task.reminder_at : task.reminder_at.replace(' ', 'T') + 'Z').toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              color: 'var(--color-primary)',
              letterSpacing: '0.03em',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>notifications</span>
          </span>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              padding: '0.1rem 0.45rem',
              borderRadius: '9999px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.6rem',
              letterSpacing: '0.03em',
            }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Status-Notiz */}
      {task.status_note && (
        <p style={{
          marginTop: '0.5rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.7rem',
          fontStyle: 'italic',
          color: 'var(--color-on-surface-variant)',
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}>
          {task.status_note}
        </p>
      )}

      {onArchive && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(task.id); }}
            title="Archivieren"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0.375rem',
              padding: '0.2rem 0.45rem',
              cursor: 'pointer',
              color: 'var(--color-outline)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              letterSpacing: '0.04em',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(204,151,255,0.3)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-outline)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>inventory_2</span>
            Archivieren
          </button>
        </div>
      )}
    </div>
  );
}
