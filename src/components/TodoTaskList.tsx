// The To-do list body: loading, error, empty states and rows.

import type { Todo, TodoList } from "../lib/types";
import { EmptyState } from "./ui/EmptyState";
import { TodoTaskItem } from "./TodoTaskItem";

interface TodoTaskListProps {
  todos: Todo[];
  lists: TodoList[];
  loading: boolean;
  error: string | null;
  showList: boolean;
  manualOrder: boolean;
  todosInList: Todo[];
  emptyTitle: string;
  emptyHint: string;
  onOpen: (todo: Todo) => void;
  onToggleDone: (todo: Todo, done: boolean) => void;
  onMove: (todo: Todo, direction: "up" | "down") => void;
  onDelete: (todo: Todo) => void;
  onSnooze: (todo: Todo, minutes: number) => void;
}

export function TodoTaskList({
  todos,
  lists,
  loading,
  error,
  showList,
  manualOrder,
  todosInList,
  emptyTitle,
  emptyHint,
  onOpen,
  onToggleDone,
  onMove,
  onDelete,
  onSnooze,
}: TodoTaskListProps) {
  if (error) {
    return (
      <p role="alert" className="banner mx-4 my-3">
        {error}
      </p>
    );
  }

  if (loading) {
    return <p className="px-4 py-6 text-sm text-zinc-500">Loading your To-do tasks…</p>;
  }

  if (todos.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} />;
  }

  return (
    <ul className="divide-y divide-zinc-100">
      {todos.map((todo) => {
        const siblings = todosInList.filter((entry) => entry.listId === todo.listId);
        const index = siblings.findIndex((entry) => entry.id === todo.id);
        return (
          <TodoTaskItem
            key={todo.id}
            todo={todo}
            list={lists.find((list) => list.id === todo.listId)}
            showList={showList}
            manualOrder={manualOrder}
            canMoveUp={index > 0}
            canMoveDown={index >= 0 && index < siblings.length - 1}
            onOpen={onOpen}
            onToggleDone={onToggleDone}
            onMove={onMove}
            onDelete={onDelete}
            onSnooze={onSnooze}
          />
        );
      })}
    </ul>
  );
}
