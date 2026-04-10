import { PageWrapper } from '../components/layout/PageWrapper';

export function TasksPage() {
  return (
    <PageWrapper>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <span className="material-symbols-outlined text-5xl mb-4" style={{ color: 'var(--color-primary)' }}>
          task_alt
        </span>
        <h1
          className="text-2xl font-bold mb-2"
          style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
        >
          Aufgaben
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>
          Dieses Modul wird in einem zukuenftigen Update verfuegbar sein.
        </p>
      </div>
    </PageWrapper>
  );
}
