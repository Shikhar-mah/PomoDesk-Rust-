// The To-do page. It owns its task dialogs and all filter state; the shell only
// decides which section is visible.

import { useEffect, useState } from "react";

import {
  applyFilters,
  DEFAULT_FILTERS,
  sortCompleted,
  tasksForView,
  viewTitle,
  type TodoFilters,
} from "../lib/todoViews";
import type { Todo, TodoInput, TodoList } from "../lib/types";
import { useNavigationStore } from "../stores/navigation";
import { useTodoStore } from "../stores/todos";
import { ConfirmDialog } from "./ConfirmDialog";
import { TodoDialog } from "./TodoDialog";
import { TodoQuickAdd } from "./TodoQuickAdd";
import { TodoTaskList } from "./TodoTaskList";
import { TodoToolbar } from "./TodoToolbar";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { Menu } from "./ui/Menu";

interface TodoPageProps {
  onNewList: () => void;
  onEditList: (list: TodoList) => void;
  /** A task opened from a notification. */
  revealTodoId: number | null;
  onRevealHandled: () => void;
}

export function TodoPage({
  onNewList,
  onEditList,
  revealTodoId,
  onRevealHandled,
}: TodoPageProps) {
  const todoView = useNavigationStore((state) => state.todoView);
  const listId = useNavigationStore((state) => state.listId);
  const openView = useNavigationStore((state) => state.openView);

  const lists = useTodoStore((state) => state.lists);
  const todos = useTodoStore((state) => state.todos);
  const loading = useTodoStore((state) => state.loading);
  const error = useTodoStore((state) => state.error);

  const [filters, setFilters] = useState<TodoFilters>(DEFAULT_FILTERS);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingTodo, setDeletingTodo] = useState<Todo | null>(null);
  const [deletingList, setDeletingList] = useState<TodoList | null>(null);
  const [moveTasksToInbox, setMoveTasksToInbox] = useState(true);

  // Filters are per-view and reset when the view changes. Upcoming and Overdue
  // default to due-date order so the nearest work is on top.
  useEffect(() => {
    setFilters({
      ...DEFAULT_FILTERS,
      sort: todoView === "upcoming" || todoView === "overdue" ? "due" : "manual",
    });
  }, [todoView, listId]);

  // Archiving the list that is on screen returns to the smart view.
  useEffect(() => {
    if (todoView !== "list" || lists.length === 0) return;
    const list = lists.find((entry) => entry.id === listId);
    if (!list || list.archivedAt !== null) openView("all");
  }, [todoView, listId, lists, openView]);

  // A notification asked to open this task.
  useEffect(() => {
    if (revealTodoId === null) return;
    const todo = todos.find((entry) => entry.id === revealTodoId);
    if (todo) {
      setEditing(todo);
      onRevealHandled();
    }
  }, [revealTodoId, todos, onRevealHandled]);

  const title = viewTitle(todoView, lists, listId);
  const currentList = lists.find((list) => list.id === listId) ?? null;
  const inbox = lists.find((list) => list.isInbox) ?? null;
  const defaultListId = currentList?.id ?? inbox?.id ?? lists[0]?.id ?? 0;

  const archivedLists = lists.filter((list) => list.archivedAt !== null);
  const canUseQuickAdd =
    todoView !== "completed" && todoView !== "archived" && loading === false;

  const viewTodos = tasksForView(todos, lists, todoView, listId);
  const effectiveFilters =
    todoView === "completed"
      ? { ...filters, completion: "completed" as const }
      : filters;
  const visibleTodos =
    todoView === "completed"
      ? sortCompleted(applyFilters(viewTodos, effectiveFilters))
      : applyFilters(viewTodos, effectiveFilters);

  const openCount = viewTodos.filter((todo) => !todo.isDone).length;
  const isManual = filters.sort === "manual";

  const emptyCopy =
    filters.search || filters.priorities.length > 0 || filters.due !== "any"
      ? { title: "No tasks match", hint: "Try clearing the search or filters." }
      : todoView === "today"
        ? { title: "Nothing due today", hint: "Tasks due today show up here." }
        : todoView === "upcoming"
          ? { title: "Nothing coming up", hint: "Future tasks will appear here." }
          : todoView === "overdue"
            ? { title: "Nothing overdue", hint: "You're all caught up." }
            : todoView === "completed"
              ? { title: "No completed tasks", hint: "Finished tasks appear here, newest first." }
              : todoView === "list"
                ? { title: "This list is empty", hint: "Add the first task above." }
                : { title: "No To-do tasks yet", hint: "Add anything you need to get done." };

  async function saveTodo(id: number | null, input: TodoInput) {
    if (id === null) await useTodoStore.getState().add(input);
    else await useTodoStore.getState().edit(id, input);
  }

  async function confirmDeleteTodo() {
    if (!deletingTodo) return;
    const target = deletingTodo;
    setDeletingTodo(null);
    await useTodoStore.getState().remove(target.id);
  }

  async function confirmDeleteList() {
    if (!deletingList) return;
    const target = deletingList;
    setDeletingList(null);
    await useTodoStore.getState().deleteList(target.id, moveTasksToInbox);
    if (todoView === "list" && listId === target.id) openView("all");
  }

  const listMenuItems = currentList
    ? [
        { label: "Rename or recolour", onSelect: () => onEditList(currentList) },
        {
          label: "Archive list",
          onSelect: () =>
            void useTodoStore.getState().setListArchived(currentList.id, true),
          disabled: currentList.isInbox,
        },
        {
          label: "Delete list",
          onSelect: () => {
            setMoveTasksToInbox(true);
            setDeletingList(currentList);
          },
          disabled: currentList.isInbox,
          danger: true,
        },
      ]
    : [];

  if (todoView === "archived") {
    return (
      <div className="todo-page">
        <header className="todo-header">
          <div>
            <h2 className="todo-header__title">Archived lists</h2>
            <p className="todo-header__meta">
              {archivedLists.length === 0
                ? "No archived lists"
                : `${archivedLists.length} archived`}
            </p>
          </div>
        </header>

        {archivedLists.length === 0 ? (
          <div className="surface-card">
            <EmptyState
              title="Nothing archived"
              hint="Archiving a list hides it from navigation and smart views."
            />
          </div>
        ) : (
          <ul className="surface-card divide-y divide-zinc-100">
            {archivedLists.map((list) => (
              <li key={list.id} className="flex items-center gap-3 px-4 py-3">
                <span className="list-dot" data-color={list.color} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{list.name}</span>
                <Button
                  size="sm"
                  onClick={() =>
                    void useTodoStore.getState().setListArchived(list.id, false)
                  }
                >
                  Restore
                </Button>
                <Button
                  size="sm"
                  className="text-red-700"
                  onClick={() => {
                    setMoveTasksToInbox(true);
                    setDeletingList(list);
                  }}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}

        <ConfirmDialog
          open={deletingList !== null}
          title="Delete list?"
          message={
            deletingList
              ? `“${deletingList.name}” will be removed. Its tasks are moved to Inbox.`
              : ""
          }
          confirmLabel="Delete list"
          destructive
          onConfirm={() => void confirmDeleteList()}
          onCancel={() => setDeletingList(null)}
        />
      </div>
    );
  }

  return (
    <div className="todo-page">
      <header className="todo-header">
        <div className="min-w-0">
          <h2 className="todo-header__title truncate">{title}</h2>
          <p className="todo-header__meta">
            {openCount === 0 ? "Nothing open" : `${openCount} open`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            + New task
          </Button>
          <Button size="sm" onClick={onNewList}>
            + New list
          </Button>
          {currentList ? (
            <Menu
              label={`Actions for list "${currentList.name}"`}
              items={listMenuItems}
              disabled={currentList.isInbox}
            />
          ) : null}
        </div>
      </header>

      <div className="todo-selector" aria-label="To-do navigation">
        {(
          [
            { view: "all", label: "All" },
            { view: "today", label: "Today" },
            { view: "upcoming", label: "Upcoming" },
            { view: "overdue", label: "Overdue" },
            { view: "completed", label: "Completed" },
          ] as const
        ).map((entry) => (
          <button
            key={entry.view}
            type="button"
            className="todo-selector__chip"
            aria-current={
              todoView === entry.view && listId === null ? "page" : undefined
            }
            onClick={() => openView(entry.view)}
          >
            {entry.label}
          </button>
        ))}

        {lists
          .filter((list) => list.archivedAt === null)
          .map((list) => (
            <button
              key={list.id}
              type="button"
              className="todo-selector__chip"
              aria-current={
                todoView === "list" && listId === list.id ? "page" : undefined
              }
              onClick={() => useNavigationStore.getState().openList(list.id)}
            >
              <span className="list-dot" data-color={list.color} aria-hidden="true" />
              {list.name}
            </button>
          ))}

        <button
          type="button"
          className="todo-selector__chip"
          onClick={() => openView("archived")}
        >
          Archived
        </button>
      </div>

      <TodoToolbar filters={filters} onChange={setFilters} view={todoView} />

      {canUseQuickAdd ? (
        <div className="surface-card todo-list-card">
          <TodoQuickAdd
            lists={lists}
            currentListId={currentList?.id ?? null}
            defaultListId={defaultListId}
            onAdd={(input) => useTodoStore.getState().add(input)}
          />
          <TodoTaskList
            todos={visibleTodos}
            lists={lists}
            loading={loading}
            error={error}
            showList={todoView !== "list"}
            manualOrder={isManual}
            todosInList={todos}
            emptyTitle={emptyCopy.title}
            emptyHint={emptyCopy.hint}
            onOpen={(todo) => setEditing(todo)}
            onToggleDone={(todo, done) => void useTodoStore.getState().toggleDone(todo.id, done)}
            onMove={(todo, direction) =>
              void useTodoStore.getState().move(todo.id, direction)
            }
            onDelete={(todo) => setDeletingTodo(todo)}
            onSnooze={(todo, minutes) =>
              void useTodoStore.getState().snooze(todo.id, minutes)
            }
          />
        </div>
      ) : (
        <div className="surface-card todo-list-card">
          <TodoTaskList
            todos={visibleTodos}
            lists={lists}
            loading={loading}
            error={error}
            showList={todoView !== "list"}
            manualOrder={isManual}
            todosInList={todos}
            emptyTitle={emptyCopy.title}
            emptyHint={emptyCopy.hint}
            onOpen={(todo) => setEditing(todo)}
            onToggleDone={(todo, done) => void useTodoStore.getState().toggleDone(todo.id, done)}
            onMove={(todo, direction) =>
              void useTodoStore.getState().move(todo.id, direction)
            }
            onDelete={(todo) => setDeletingTodo(todo)}
            onSnooze={(todo, minutes) =>
              void useTodoStore.getState().snooze(todo.id, minutes)
            }
          />
        </div>
      )}

      <TodoDialog
        key={creating ? "new-todo" : `todo-${editing?.id ?? "closed"}`}
        open={creating || editing !== null}
        todo={editing}
        lists={lists}
        defaultListId={defaultListId}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSave={saveTodo}
        onDelete={(todo) => {
          setEditing(null);
          setDeletingTodo(todo);
        }}
        onAddSubtask={(todoId, title) => useTodoStore.getState().addSubtask(todoId, title)}
        onToggleSubtask={(id, done) => useTodoStore.getState().toggleSubtask(id, done)}
        onRemoveSubtask={(id) => useTodoStore.getState().removeSubtask(id)}
      />

      <ConfirmDialog
        open={deletingTodo !== null}
        title="Delete To-do task?"
        message={
          deletingTodo
            ? `“${deletingTodo.title}” and its checklist will be removed. Pomodoro data is not affected.`
            : ""
        }
        confirmLabel="Delete task"
        destructive
        onConfirm={() => void confirmDeleteTodo()}
        onCancel={() => setDeletingTodo(null)}
      />

      <Dialog
        open={deletingList !== null}
        title="Delete list?"
        description={
          deletingList
            ? `Choose what happens to the tasks in “${deletingList.name}”.`
            : undefined
        }
        onClose={() => setDeletingList(null)}
        footer={
          <>
            <Button onClick={() => setDeletingList(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDeleteList()}>
              Delete list
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="todo-check-row">
            <input
              type="radio"
              name="list-delete-mode"
              checked={moveTasksToInbox}
              onChange={() => setMoveTasksToInbox(true)}
            />
            Move its tasks to Inbox (recommended)
          </label>
          <label className="todo-check-row">
            <input
              type="radio"
              name="list-delete-mode"
              checked={!moveTasksToInbox}
              onChange={() => setMoveTasksToInbox(false)}
            />
            Delete its tasks too
          </label>
        </div>
      </Dialog>
    </div>
  );
}
