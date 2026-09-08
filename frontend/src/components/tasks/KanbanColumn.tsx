import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task } from '../../api/tasks.api';
import { TaskCard } from './TaskCard';
import { CollapseButton } from './CollapsedColumn';

interface KanbanColumnProps {
  id: string;
  title: string;
  icon: string;
  tasks: Task[];
  color: string;
  onTaskClick: (task: Task) => void;
  onShowAllDone?: () => void;
  totalDoneCount?: number;
  onArchive?: (id: number) => void;
  onDelete?: (id: number, title: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function KanbanColumn({
  id,
  title,
  icon,
  tasks,
  color,
  onTaskClick,
  onShowAllDone,
  totalDoneCount,
  onArchive,
  onDelete,
  collapsed = false,
  onToggleCollapse,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const isDone = id === 'done';
  const showMoreLink = isDone && totalDoneCount !== undefined && totalDoneCount > tasks.length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: '280px',
      flex: 1,
      background: 'color-mix(in srgb, var(--color-surface-container-low) 60%, transparent)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '0.875rem',
      overflow: 'hidden',
    }}>
      {/* Column header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.875rem 1rem',
        borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '18px', color, flexShrink: 0 }}>
          {icon}
        </span>
        <span style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 700,
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface)',
          flex: 1,
        }}>
          {title}
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '20px',
          height: '20px',
          padding: '0 6px',
          borderRadius: '9999px',
          background: 'rgba(255,255,255,0.07)',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.7rem',
          fontWeight: 600,
        }}>
          {tasks.length}
        </span>
        {onToggleCollapse && <CollapseButton collapsed={collapsed} onClick={onToggleCollapse} />}
      </div>

      {/* Drop zone — eingeklappt: Höhe 0, Einträge ausgeblendet (Kopf bleibt sichtbar) */}
      <div
        ref={setNodeRef}
        style={{
          flex: collapsed ? '0 0 auto' : 1,
          padding: collapsed ? 0 : '0.75rem',
          minHeight: collapsed ? 0 : '200px',
          height: collapsed ? 0 : undefined,
          overflow: 'hidden',
          background: isOver ? 'rgba(148,170,255,0.04)' : 'transparent',
          transition: 'background 150ms ease',
        }}
      >
        {!collapsed && (
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} onArchive={onArchive} onDelete={onDelete} />
          ))}
        </SortableContext>
        )}

        {tasks.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '80px',
            color: 'var(--color-outline)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            fontStyle: 'italic',
          }}>
            Keine Aufgaben
          </div>
        )}

        {showMoreLink && (
          <button
            onClick={onShowAllDone}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '0.5rem',
              padding: '0.5rem',
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'border-color 150ms ease, color 150ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(148,170,255,0.3)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.1)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-on-surface-variant)';
            }}
          >
            Alle anzeigen ({totalDoneCount})
          </button>
        )}
      </div>
    </div>
  );
}
