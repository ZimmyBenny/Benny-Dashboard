import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  DragOverlay,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Task } from '../../api/tasks.api';
import { fetchTasks, reorderTasks } from '../../api/tasks.api';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';

type Status = Task['status'];

const COLUMNS: { id: Status; title: string; icon: string; color: string }[] = [
  { id: 'open',        title: 'Offen',    icon: 'radio_button_unchecked', color: 'var(--color-on-surface-variant)' },
  { id: 'in_progress', title: 'In Arbeit', icon: 'pending',               color: 'var(--color-secondary)' },
  { id: 'waiting',     title: 'Wartend',  icon: 'hourglass_empty',        color: 'var(--color-primary)' },
  { id: 'done',        title: 'Erledigt', icon: 'check_circle',           color: '#4ade80' },
];

function groupByStatus(tasks: Task[]): Record<Status, Task[]> {
  return {
    open:        tasks.filter((t) => t.status === 'open').sort((a, b) => a.position - b.position),
    in_progress: tasks.filter((t) => t.status === 'in_progress').sort((a, b) => a.position - b.position),
    waiting:     tasks.filter((t) => t.status === 'waiting').sort((a, b) => a.position - b.position),
    done:        tasks.filter((t) => t.status === 'done').sort((a, b) => a.position - b.position),
  };
}

interface KanbanBoardProps {
  filters?: { search?: string; area?: string; priority?: string };
  onTaskClick: (task: Task) => void;
  onShowAllDone?: () => void;
  refreshKey?: number;
}

export function KanbanBoard({ filters, onTaskClick, onShowAllDone, refreshKey = 0 }: KanbanBoardProps) {
  const [tasksByColumn, setTasksByColumn] = useState<Record<Status, Task[]>>({
    open: [], in_progress: [], waiting: [], done: [],
  });
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchTasks(filters)
      .then((tasks) => {
        setAllTasks(tasks);
        setTasksByColumn(groupByStatus(tasks));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  function findColumnOfTask(taskId: number | string): Status | null {
    const id = Number(taskId);
    for (const col of COLUMNS) {
      if (tasksByColumn[col.id].some((t) => t.id === id)) {
        return col.id;
      }
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = Number(event.active.id);
    const task = allTasks.find((t) => t.id === id) ?? null;
    setActiveTask(task);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeCol = findColumnOfTask(active.id);
    const overIsColumn = COLUMNS.some((c) => c.id === over.id);
    const overCol = overIsColumn
      ? (over.id as Status)
      : findColumnOfTask(over.id);

    if (!activeCol || !overCol || activeCol === overCol) return;

    setTasksByColumn((prev) => {
      const activeId = Number(active.id);
      const task = prev[activeCol].find((t) => t.id === activeId);
      if (!task) return prev;

      return {
        ...prev,
        [activeCol]: prev[activeCol].filter((t) => t.id !== activeId),
        [overCol]: [...prev[overCol], { ...task, status: overCol }],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeCol = findColumnOfTask(active.id);
    const overIsColumn = COLUMNS.some((c) => c.id === over.id);
    const overCol = overIsColumn
      ? (over.id as Status)
      : findColumnOfTask(over.id);

    if (!activeCol || !overCol) return;

    setTasksByColumn((prev) => {
      const activeId = Number(active.id);
      const overId = overIsColumn ? null : Number(over.id);

      let updated = { ...prev };

      if (activeCol === overCol && !overIsColumn) {
        // Reorder within same column
        const col = [...prev[activeCol]];
        const oldIndex = col.findIndex((t) => t.id === activeId);
        const newIndex = col.findIndex((t) => t.id === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          updated[activeCol] = arrayMove(col, oldIndex, newIndex);
        }
      }

      // Persist all items in affected columns with new positions
      const colsToUpdate = activeCol === overCol ? [activeCol] : [activeCol, overCol];
      const apiUpdates: { id: number; status: string; position: number }[] = [];
      for (const col of colsToUpdate) {
        updated[col].forEach((t, idx) => {
          apiUpdates.push({ id: t.id, status: col, position: idx });
        });
      }

      reorderTasks(apiUpdates).catch(() => {
        // Revert on error
        setTasksByColumn(groupByStatus(allTasks));
      });

      return updated;
    });
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
        Aufgaben werden geladen...
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div style={{
        display: 'flex',
        gap: '1rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        alignItems: 'flex-start',
      }}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            icon={col.icon}
            color={col.color}
            tasks={tasksByColumn[col.id]}
            onTaskClick={onTaskClick}
            onShowAllDone={col.id === 'done' ? onShowAllDone : undefined}
            totalDoneCount={col.id === 'done' ? tasksByColumn.done.length : undefined}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? (
          <TaskCard task={activeTask} onClick={() => {}} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
