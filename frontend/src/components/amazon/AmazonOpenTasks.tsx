import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchTasks, createTask, deleteTask, type Task } from '../../api/tasks.api';
import { TaskSlideOver } from '../tasks/TaskSlideOver';
import { todayLocal, isoDateLocal } from '../../lib/dates';

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

/** Normalisiert ein rohes due_date ("YYYY-MM-DD" oder ISO) auf lokales "YYYY-MM-DD". */
function dueLocalOf(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return isoDateLocal(d);
}

function formatDue(dueLocal: string | null): string | null {
  if (!dueLocal) return null;
  const [y, m, d] = dueLocal.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function AmazonOpenTasks() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [slideOverOpen, setSlideOverOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tasks', 'amazon-open'],
    queryFn: () => fetchTasks({ area: 'Amazon' }),
  });

  const today = todayLocal();

  const open = (data ?? [])
    .filter((t) => t.status !== 'done' && t.status !== 'archived')
    .map((t) => {
      const dl = dueLocalOf(t.due_date);
      const overdue = dl !== null && dl < today;
      const dueToday = dl !== null && dl === today;
      return { task: t, dueLocal: dl, overdue, dueToday };
    })
    .sort((a, b) => {
      // Rang: überfällig (0) → heute (1) → mit Datum (2) → ohne Datum (3)
      const rank = (x: typeof a) => (x.overdue ? 0 : x.dueToday ? 1 : x.dueLocal ? 2 : 3);
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.dueLocal && b.dueLocal) return a.dueLocal.localeCompare(b.dueLocal);
      return 0;
    });

  const count = open.length;

  async function handleSave(payload: Partial<Task> & { title: string }) {
    await createTask(payload);
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  async function handleDelete(id: number) {
    await deleteTask(id);
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  return (
    <>
      <div style={{
        border: '1px solid rgba(148,170,255,0.25)',
        borderRadius: '1rem',
        background: 'linear-gradient(135deg, rgba(148,170,255,0.06) 0%, var(--color-surface-container) 100%)',
        boxShadow: '0 0 40px rgba(148,170,255,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
        padding: '1.25rem 1.5rem',
      }}>
        {/* Header-Zeile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: count > 0 || isLoading || isError ? '1rem' : '0.75rem' }}>
          {/* Icon-Badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '32px', height: '32px', borderRadius: '0.5rem', flexShrink: 0,
            background: 'rgba(148,170,255,0.12)',
            border: '1px solid rgba(148,170,255,0.25)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-primary)' }}>task_alt</span>
          </span>

          {/* Titel (Gradient) */}
          <h2 style={{
            fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.05rem',
            letterSpacing: '0.02em', margin: 0,
            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>
            Offene Aufgaben
          </h2>

          {/* Zähler-Pill */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: '1.5rem', height: '1.5rem', padding: '0 0.5rem', borderRadius: '999px',
            background: 'rgba(148,170,255,0.15)', border: '1px solid rgba(148,170,255,0.3)',
            fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 700,
            color: 'var(--color-primary)', flexShrink: 0,
          }}>
            {count}
          </span>

          <div style={{ flex: 1 }} />

          {/* + Aufgabe */}
          <button
            onClick={() => setSlideOverOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0,
              padding: '0.5rem 0.9rem', borderRadius: '9999px',
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              color: '#000', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.02em',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
            Aufgabe
          </button>
        </div>

        {/* Inhalt */}
        {isLoading && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-outline)', margin: 0 }}>Lade…</p>
        )}
        {isError && !isLoading && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-error)', margin: 0 }}>Aufgaben konnten nicht geladen werden.</p>
        )}
        {!isLoading && !isError && count === 0 && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic', margin: 0 }}>
            Keine offenen Amazon-Aufgaben
          </p>
        )}

        {!isLoading && !isError && count > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {open.map(({ task: t, dueLocal, overdue, dueToday }) => {
              const dueLabel = formatDue(dueLocal);
              return (
                <button
                  key={t.id}
                  onClick={() => navigate('/tasks')}
                  style={{
                    textAlign: 'left', cursor: 'pointer', width: '100%',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.7rem 0.9rem', borderRadius: '0.65rem',
                    background: overdue ? 'rgba(255,110,132,0.06)' : 'var(--color-surface-container-high)',
                    border: '1px solid var(--color-outline-variant)',
                    borderLeft: overdue ? '3px solid var(--color-error)' : '3px solid rgba(148,170,255,0.35)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.05rem', color: overdue ? 'var(--color-error)' : 'var(--color-primary)', flexShrink: 0 }}>task_alt</span>

                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-on-surface)',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.title}
                  </span>

                  {dueToday && (
                    <span style={{
                      flexShrink: 0, padding: '0.1rem 0.5rem', borderRadius: '999px',
                      background: 'rgba(92,253,128,0.15)', border: '1px solid rgba(92,253,128,0.35)',
                      fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 700,
                      color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      Heute
                    </span>
                  )}

                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: PRIORITY_COLOR[t.priority], flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {PRIORITY_LABEL[t.priority]}
                  </span>

                  {dueLabel && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.72rem', flexShrink: 0,
                      fontWeight: overdue ? 700 : 400,
                      color: overdue ? 'var(--color-error)' : 'var(--color-on-surface-variant)',
                    }}>
                      {dueLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <TaskSlideOver
        isOpen={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        task={null}
        onSave={handleSave}
        onDelete={handleDelete}
        prefill={{ area: 'Amazon' }}
      />
    </>
  );
}
