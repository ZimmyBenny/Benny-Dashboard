import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDueReminders, patchTaskStatus, updateTask } from '../../api/tasks.api';
import type { Task } from '../../api/tasks.api';
import { ReminderPopup } from './ReminderPopup';
import { useAuthStore } from '../../store/authStore';

const POLL_INTERVAL_MS = 60_000;

function dismissKey(task: Task): string {
  return `reminder_dismissed_${task.id}_${task.reminder_at ?? ''}`;
}

function isDismissed(task: Task): boolean {
  return localStorage.getItem(dismissKey(task)) === '1';
}

function markDismissed(task: Task): void {
  localStorage.setItem(dismissKey(task), '1');
}

export function ReminderPoller() {
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = token !== null;
  const [queue, setQueue] = useState<Task[]>([]);

  const poll = useCallback(async () => {
    try {
      const due = await fetchDueReminders();
      const fresh = due.filter((t) => !isDismissed(t));
      setQueue((prev) => {
        // Merge: keep already-queued items that are still in fresh, append new ones
        const existingIds = new Set(prev.map((t) => t.id));
        const additions = fresh.filter((t) => !existingIds.has(t.id));
        return [...prev, ...additions];
      });
    } catch (err) {
      console.warn('[ReminderPoller] fetch failed', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, poll]);

  const current = queue[0] ?? null;
  const navigate = useNavigate();

  const handleStatusChange = useCallback(async (task: Task, status: Task['status']) => {
    try {
      await patchTaskStatus(task.id, status, task.position);
      window.dispatchEvent(new CustomEvent('tasks-refresh'));
    } catch (err) {
      console.error('[ReminderPoller] status change failed', err);
    }
    markDismissed(task);
    setQueue((prev) => prev.filter((t) => t.id !== task.id));
  }, []);

  const handleOpen = useCallback((task: Task) => {
    markDismissed(task);
    setQueue((prev) => prev.filter((t) => t.id !== task.id));
    navigate('/tasks', { state: { openTask: task } });
  }, [navigate]);

  const handleLater = useCallback(async (task: Task, snoozeUntil: Date) => {
    try {
      await updateTask(task.id, {
        ...task,
        reminder_at: snoozeUntil.toISOString(),
        has_reminder: 1,
      });
      window.dispatchEvent(new CustomEvent('tasks-refresh'));
    } catch (err) {
      console.error('[ReminderPoller] snooze failed', err);
    }
    markDismissed(task);
    setQueue((prev) => prev.filter((t) => t.id !== task.id));
  }, []);

  if (!current) return null;
  return <ReminderPopup key={current.id} task={current} queueLength={queue.length} onStatusChange={handleStatusChange} onOpen={handleOpen} onLater={handleLater} />;
}
