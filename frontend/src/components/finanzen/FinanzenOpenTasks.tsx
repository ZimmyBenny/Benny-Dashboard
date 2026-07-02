import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchTasks, type Task } from '../../api/tasks.api';

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  urgent: 'Dringend',
};

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: 'var(--color-outline)',
  medium: 'var(--color-on-surface-variant)',
  high: '#fb923c',
  urgent: 'var(--color-error)',
};

function formatDue(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function FinanzenOpenTasks() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['tasks', 'finanzen-open'],
    queryFn: () => fetchTasks({ area: 'Finanzen' }),
  });

  const open = (data ?? [])
    .filter((t) => t.status !== 'done' && t.status !== 'archived')
    .sort((a, b) => {
      if (a.due_date === b.due_date) return 0;
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

  if (isLoading) {
    return <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-outline)' }}>Lade…</p>;
  }
  if (isError) {
    return <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-error)' }}>Aufgaben konnten nicht geladen werden.</p>;
  }
  if (open.length === 0) {
    return <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>Keine offenen Finanzen-Aufgaben</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {open.map((t) => {
        const due = formatDue(t.due_date);
        return (
          <button
            key={t.id}
            className="module-card"
            onClick={() => navigate('/tasks')}
            style={{ textAlign: 'left', padding: '0.75rem 1rem', cursor: 'pointer' }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)', flexShrink: 0 }}>task_alt</span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-on-surface)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t.title}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: PRIORITY_COLOR[t.priority], flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {PRIORITY_LABEL[t.priority]}
              </span>
              {due && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                  {due}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
