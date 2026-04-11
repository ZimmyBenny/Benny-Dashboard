import { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCorners,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Task } from '../../api/tasks.api';
import { fetchTasks, reorderTasks, archiveTask, deleteTask } from '../../api/tasks.api';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { DragPrompt } from './DragPrompt';

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

interface PendingDrag {
  taskId: number;
  fromCol: Status;
  toCol: Status;
  snapshotBefore: Record<Status, Task[]>;
}

interface KanbanBoardProps {
  filters?: { search?: string; area?: string; priority?: string };
  onTaskClick: (task: Task) => void;
  onShowAllDone?: () => void;
  refreshKey?: number;
}

export function KanbanBoard({ filters, onTaskClick, onShowAllDone, refreshKey = 0 }: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [tasksByColumn, setTasksByColumn] = useState<Record<Status, Task[]>>({
    open: [], in_progress: [], waiting: [], done: [],
  });
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [dragOriginCol, setDragOriginCol] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDrag, setPendingDrag] = useState<PendingDrag | null>(null);

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
    setDragOriginCol(findColumnOfTask(id));
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

    // Use the origin column captured at drag start — NOT findColumnOfTask.
    // By the time handleDragEnd fires, handleDragOver has already moved the
    // task visually into the target column, so findColumnOfTask would return
    // the destination column for activeCol, making activeCol === overCol and
    // suppressing the DragPrompt entirely.
    const activeCol = dragOriginCol;
    setDragOriginCol(null);

    const overIsColumn = COLUMNS.some((c) => c.id === over.id);
    const overCol = overIsColumn
      ? (over.id as Status)
      : findColumnOfTask(over.id);

    if (!activeCol || !overCol) return;

    // Cross-column drop: pause and show DragPrompt
    if (activeCol !== overCol) {
      // Snapshot was already taken before handleDragOver moved the task visually.
      // We need the snapshot BEFORE the visual move — reconstruct from allTasks.
      const snapshot = groupByStatus(allTasks);

      setPendingDrag({
        taskId: Number(active.id),
        fromCol: activeCol,
        toCol: overCol,
        snapshotBefore: snapshot,
      });
      return;
    }

    // Same-column reorder: persist immediately as before
    setTasksByColumn((prev) => {
      const activeId = Number(active.id);
      const overId = overIsColumn ? null : Number(over.id);

      let updated = { ...prev };

      if (!overIsColumn) {
        const col = [...prev[activeCol]];
        const oldIndex = col.findIndex((t) => t.id === activeId);
        const newIndex = col.findIndex((t) => t.id === overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          updated[activeCol] = arrayMove(col, oldIndex, newIndex);
        }
      }

      const apiUpdates: { id: number; status: string; position: number }[] = [];
      updated[activeCol].forEach((t, idx) => {
        apiUpdates.push({ id: t.id, status: activeCol, position: idx });
      });

      reorderTasks(apiUpdates).catch(() => {
        setTasksByColumn(groupByStatus(allTasks));
      });

      return updated;
    });
  }

  async function handleDragPromptConfirm(statusNote: string) {
    if (!pendingDrag) return;
    const { taskId, fromCol, toCol, snapshotBefore } = pendingDrag;
    setPendingDrag(null);

    // tasksByColumn is already visually updated (task is in toCol).
    // We build reorder updates for both affected columns. For the moved task
    // we include status_note directly — avoids a separate PUT /tasks/:id call
    // that would overwrite all fields with empty defaults for missing body keys.
    const noteValue = statusNote.trim() || null;
    const colsToUpdate = [fromCol, toCol];
    const apiUpdates: { id: number; status: string; position: number; status_note?: string | null }[] = [];
    for (const col of colsToUpdate) {
      tasksByColumn[col].forEach((t, idx) => {
        const update: { id: number; status: string; position: number; status_note?: string | null } = {
          id: t.id,
          status: col,
          position: idx,
        };
        if (t.id === taskId) {
          update.status_note = noteValue;
        }
        apiUpdates.push(update);
      });
    }

    try {
      await reorderTasks(apiUpdates);
      load();
    } catch {
      setTasksByColumn(snapshotBefore);
    }
  }

  async function handleDelete(taskId: number, taskTitle: string) {
    if (!window.confirm(`Aufgabe "${taskTitle}" wirklich löschen?`)) return;
    try {
      await deleteTask(taskId);
      load();
    } catch {
      // silently ignore
    }
  }

  async function handleArchive(taskId: number) {
    try {
      await archiveTask(taskId);
      load();
    } catch {
      // silently ignore
    }
  }

  function handleDragPromptCancel() {
    if (!pendingDrag) return;
    setTasksByColumn(pendingDrag.snapshotBefore);
    setPendingDrag(null);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
        Aufgaben werden geladen...
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
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
              onArchive={col.id === 'done' ? handleArchive : undefined}
              onDelete={handleDelete}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} onClick={() => {}} isDragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {pendingDrag && (
        <DragPrompt
          fromCol={COLUMNS.find((c) => c.id === pendingDrag.fromCol)?.title ?? pendingDrag.fromCol}
          toCol={COLUMNS.find((c) => c.id === pendingDrag.toCol)?.title ?? pendingDrag.toCol}
          onConfirm={handleDragPromptConfirm}
          onCancel={handleDragPromptCancel}
        />
      )}
    </>
  );
}
