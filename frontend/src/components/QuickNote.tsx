import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQuickNote, saveQuickNote } from '../api/quicknote.api';
import { TaskSlideOver } from './tasks/TaskSlideOver';
import { createTask, type Task } from '../api/tasks.api';

/**
 * QuickNote — Scratchpad PRO Dashboard (scope).
 * Ein Textfeld, Auto-Speichern (entprellt ~700ms + onBlur), getrennt je Bereich
 * gespeichert (app_settings-Key quick_note_<scope>). Plus "→ In Aufgabe"-Button,
 * der den Notiz-Text mit passendem Bereich ins Aufgaben-Formular übernimmt.
 */
const SCOPE_AREA: Record<string, string> = {
  amazon: 'Amazon', dj: 'DJ', finanzen: 'Finanzen', start: 'Sonstiges',
};

export function QuickNote({ scope }: { scope: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['quick-note', scope], queryFn: () => getQuickNote(scope), staleTime: 60_000 });
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [taskOpen, setTaskOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (data !== undefined && text === null) setText(data); }, [data, text]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function scheduleSave(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { saveQuickNote(scope, v).then(() => setSaved(true)).catch(() => {}); }, 700);
  }
  function handleChange(v: string) { setText(v); setSaved(false); scheduleSave(v); }
  function handleBlur() {
    if (timer.current) clearTimeout(timer.current);
    if (text !== null) saveQuickNote(scope, text).then(() => setSaved(true)).catch(() => {});
  }

  const trimmed = (text ?? '').trim();

  async function handleTaskSave(dataToSave: Partial<Task> & { title: string }) {
    await createTask(dataToSave);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  }

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-body)', fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-outline)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>edit_note</span>
          Schnelle Notiz
        </span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: saved ? 'var(--color-outline)' : 'var(--color-primary)', transition: 'color 150ms ease' }}>
          {saved ? 'gespeichert' : 'speichert…'}
        </span>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '0.35rem' }}>
        <textarea
          value={text ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Kurz was aufschreiben, damit du's nicht vergisst…"
          rows={3}
          style={{
            width: '100%', resize: 'vertical', minHeight: '72px', boxSizing: 'border-box',
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
            lineHeight: 1.55, padding: '0.6rem 0.75rem',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button
          onClick={() => setTaskOpen(true)}
          disabled={!trimmed}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600,
            padding: '0.35rem 0.7rem', borderRadius: '9999px',
            border: '1px solid var(--color-outline-variant)', background: 'transparent',
            color: trimmed ? 'var(--color-primary)' : 'var(--color-outline)',
            cursor: trimmed ? 'pointer' : 'not-allowed', opacity: trimmed ? 1 : 0.55,
            transition: 'color 150ms ease, border-color 150ms ease',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>add_task</span>
          In Aufgabe umwandeln
        </button>
      </div>
      <TaskSlideOver
        isOpen={taskOpen}
        onClose={() => setTaskOpen(false)}
        task={null}
        onSave={handleTaskSave}
        onDelete={async () => {}}
        prefill={{ title: trimmed, area: SCOPE_AREA[scope] }}
      />
    </div>
  );
}
