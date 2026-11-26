// One To-do row: checkbox, title, due/priority/subtask metadata and a menu.

import { cn } from "../lib/cn";
import { dueLabel, PRIORITY_LABEL, subtaskProgress } from "../lib/todoViews";
import type { Todo, TodoList } from "../lib/types";
import { Menu, type MenuItem } from "./ui/Menu";

interface TodoTaskItemProps {
  todo: Todo;
  list: TodoList | undefined;
  /** Show the list name/dot (smart views only). */
  showList: boolean;
  /** Move up/down is only meaningful in Manual sort. */
  manualOrder: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onOpen: (todo: Todo) => void;
  onToggleDone: (todo: Todo, done: boolean) => void;
  onMove: (todo: Todo, direction: "up" | "down") => void;
  onDelete: (todo: Todo) => void;
  onSnooze: (todo: Todo, minutes: number) => void;
}

export function TodoTaskItem({
  todo,
  list,
  showList,
  manualOrder,
  canMoveUp,
  canMoveDown,
  onOpen,
  onToggleDone,
  onMove,
  onDelete,
  onSnooze,
}: TodoTaskItemProps) {
  const due = dueLabel(todo);
  const progress = subtaskProgress(todo);
  const overdue = due?.startsWith("Overdue");

  const items: MenuItem[] = [
    { label: "Edit", onSelect: () => onOpen(todo) },
    {
      label: "Move up",
      onSelect: () => onMove(todo, "up"),
      disabled: !manualOrder || !canMoveUp,
    },
    {
      label: "Move down",
      onSelect: () => onMove(todo, "down"),
      disabled: !manualOrder || !canMoveDown,
    },
  ];

  if (todo.reminder) {
    items.push(
      { label: "Snooze 5 min", onSelect: () => onSnooze(todo, 5) },
      { label: "Snooze 15 min", onSelect: () => onSnooze(todo, 15) },
      { label: "Snooze 1 hour", onSelect: () => onSnooze(todo, 60) },
      { label: "Snooze 1 day", onSelect: () => onSnooze(todo, 1440) },
    );
  }

  items.push({ label: "Delete", onSelect: () => onDelete(todo), danger: true });

  return (
    <li className={cn("todo-item", todo.isDone && "todo-item--done")}>
      <input
        type="checkbox"
        className="todo-item__check"
        checked={todo.isDone}
        aria-label={todo.isDone ? `Re-open "${todo.title}"` : `Mark "${todo.title}" done`}
        onChange={(event) => onToggleDone(todo, event.target.checked)}
      />

      <button type="button" className="todo-item__title" onClick={() => onOpen(todo)}>
        {todo.title}
      </button>

      <span className="todo-item__meta">
        {showList && list ? (
          <span className="todo-list-ref">
            <span className="list-dot" data-color={list.color} aria-hidden="true" />
            {list.name}
          </span>
        ) : null}

        {due ? (
          <span className={cn("todo-due", overdue && "todo-due--overdue")} title={due}>
            {due}
          </span>
        ) : null}

        <span className="todo-priority" data-priority={todo.priority}>
          {PRIORITY_LABEL[todo.priority]}
        </span>

        {progress ? (
          <span className="badge badge--neutral" title="Checklist progress">
            {progress}
          </span>
        ) : null}
      </span>

      <Menu
        label={`More actions for "${todo.title}"`}
        items={items}
        className="todo-item__menu"
      />
    </li>
  );
}
