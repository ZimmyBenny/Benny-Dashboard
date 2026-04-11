import { useState, useEffect } from 'react';
import { fetchArchivedTasks, type Task } from '../../api/tasks.api';

interface ArchiveListProps {
  onTaskClick: (task: Task) => void;
  refreshKey?: number;
}

export function ArchiveList({ onTaskClick, refreshKey = 0 }: ArchiveListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [allTasks, setAllTasks] = useState<Task[]>([]);

  useEffect(() => {
    setLoading(true);
    fetchArchivedTasks()
      .then(setAllTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  useEffect(() => {
    if (!search.trim()) {
      setTasks(allTasks);
    } else {
      const q = search.toLowerCase();
      setTasks(allTasks.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.tags ?? '').toLowerCase().includes(q)
      ));
    }
  }, [search, allTasks]);

  return (
    <div>
      {/* Suchfeld */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative' }}>
          <span
            className="material-symbols-outlined"
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', color: 'var(--color-outline)', pointerEvents: 'none' }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Archiv durchsuchen (Titel, Beschreibung, Tags)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.5rem',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              outline: 'none',
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
      </div>

      {loading && (
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
          Wird geladen...
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
          {search ? 'Keine Treffer.' : 'Noch keine archivierten Aufgaben.'}
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {tasks.map((task) => {
            const tags = task.tags ? task.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
            return (
              <div
                key={task.id}
                onClick={() => onTaskClick(task)}
                style={{
                  background: 'var(--color-surface-container)',
                  border: '1px solid var(--color-surface-container-high)',
                  borderRadius: '0.75rem',
                  padding: '0.875rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(204,151,255,0.2)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-surface-container-high)'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-outline)', flexShrink: 0 }}>inventory_2</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)', marginBottom: (task.area || tags.length > 0) ? '0.25rem' : 0, wordBreak: 'break-word' }}>
                    {task.title}
                  </p>
                  {(task.area || tags.length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {task.area && (
                        <span style={{ padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(52,181,250,0.08)', color: 'var(--color-secondary)', fontFamily: 'var(--font-body)', fontSize: '0.6rem', fontWeight: 500 }}>
                          {task.area}
                        </span>
                      )}
                      {tags.map((tag) => (
                        <span key={tag} style={{ padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.6rem' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {task.completed_at && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--color-outline)', flexShrink: 0 }}>
                    {new Date(task.completed_at.includes('T') ? task.completed_at : task.completed_at.replace(' ', 'T') + 'Z').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
