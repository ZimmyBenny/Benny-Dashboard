import { useState } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { KanbanBoard } from '../components/tasks/KanbanBoard';
import { TaskFilters } from '../components/tasks/TaskFilters';
import { TaskSlideOver } from '../components/tasks/TaskSlideOver';
import { createTask, updateTask, deleteTask, type Task } from '../api/tasks.api';

interface Filters {
  search: string;
  area: string;
  priority: string;
}

export function TasksPage() {
  const [filters, setFilters] = useState<Filters>({ search: '', area: '', priority: '' });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);

  function refreshBoard() {
    setBoardRefreshKey((k) => k + 1);
  }

  function handleTaskClick(task: Task) {
    setSelectedTask(task);
    setIsSlideOverOpen(true);
  }

  function handleNewTask() {
    setSelectedTask(null);
    setIsSlideOverOpen(true);
  }

  function handleCloseSlideOver() {
    setIsSlideOverOpen(false);
    setSelectedTask(null);
  }

  async function handleSave(data: Partial<Task> & { title: string }) {
    if (selectedTask) {
      await updateTask(selectedTask.id, data);
    } else {
      await createTask(data);
    }
    refreshBoard();
  }

  async function handleDelete(id: number) {
    await deleteTask(id);
    handleCloseSlideOver();
    refreshBoard();
  }

  // Build API filter params (skip empty strings)
  const apiFilters = {
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.area ? { area: filters.area } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
  };

  return (
    <PageWrapper>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
          task_alt
        </span>
        <h1 style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 800,
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)',
        }}>
          Aufgaben
        </h1>
      </div>

      {/* Filters + New task button */}
      <TaskFilters
        onFilterChange={setFilters}
        onNewTask={handleNewTask}
      />

      {/* Kanban Board */}
      <KanbanBoard
        filters={apiFilters}
        onTaskClick={handleTaskClick}
        refreshKey={boardRefreshKey}
      />

      {/* Slide-Over Panel */}
      <TaskSlideOver
        isOpen={isSlideOverOpen}
        onClose={handleCloseSlideOver}
        task={selectedTask}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </PageWrapper>
  );
}
