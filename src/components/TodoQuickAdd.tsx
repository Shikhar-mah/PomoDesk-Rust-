// Always-visible single-line quick add. Title is the only requirement; due,
// priority and list are revealed as small chips on focus.

import { useEffect, useRef, useState } from "react";

import { describeError } from "../lib/ipc";
import type { TodoInput, TodoList, TodoPriority } from "../lib/types";

interface TodoQuickAddProps {
  lists: TodoList[];
  currentListId: number | null;
  defaultListId: number;
  onAdd: (input: TodoInput) => Promise<void>;
}

export function TodoQuickAdd({
  lists,
  currentListId,
  defaultListId,
  onAdd,
}: TodoQuickAddProps) {
  const [title, setTitle] = useState("");
  const [focused, setFocused] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [listId, setListId] = useState(defaultListId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeLists = lists.filter((list) => list.archivedAt === null);

  useEffect(() => {
    setListId(defaultListId);
  }, [defaultListId]);

  async function submit() {
    const clean = title.trim();
    if (!clean || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onAdd({
        title: clean,
        note: "",
        listId: currentListId ?? listId,
        priority,
        dueDate: dueDate || null,
        dueTime: dueDate && dueTime ? dueTime : null,
        reminder: null,
      });
      setTitle("");
      setDueDate("");
      setDueTime("");
      inputRef.current?.focus();
    } catch (submitError) {
      setError(describeError(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="todo-quick-add">
      <form
        className="todo-quick-add__row"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <span aria-hidden="true" className="todo-quick-add__plus">
          ＋
        </span>
        <input
          ref={inputRef}
          type="text"
          className="todo-quick-add__input"
          aria-label="Add a task"
          placeholder="Add a task…"
          value={title}
          maxLength={200}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            // Keep the chips visible while one of them has focus.
            if (!event.currentTarget.closest(".todo-quick-add")?.contains(event.relatedTarget as Node)) {
              setFocused(false);
            }
          }}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !title.trim()}>
          Add
        </button>
      </form>

      {focused || title ? (
        <div className="todo-quick-add__chips">
          <button
            type="button"
            className="todo-chip"
            aria-expanded={dueOpen}
            onClick={() => setDueOpen((value) => !value)}
          >
            Due
          </button>

          <label className="todo-chip todo-chip--field">
            Priority
            <select
              aria-label="Priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TodoPriority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          {currentListId === null ? (
            <label className="todo-chip todo-chip--field">
              List
              <select
                aria-label="List"
                value={listId}
                onChange={(event) => setListId(Number(event.target.value))}
              >
                {activeLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {dueOpen ? (
            <span className="todo-quick-add__due">
              <input
                type="date"
                className="text-input"
                aria-label="Due date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <input
                type="time"
                className="text-input"
                aria-label="Due time"
                value={dueTime}
                disabled={!dueDate}
                onChange={(event) => setDueTime(event.target.value)}
              />
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
