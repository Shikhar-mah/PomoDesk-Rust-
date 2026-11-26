// One compact toolbar: search, completion filter, a filter popover and sort.

import { useEffect, useRef, useState } from "react";

import type { TodoPriority, TodoView } from "../lib/types";
import type { CompletionFilter, DueFilter, SortMode, TodoFilters } from "../lib/todoViews";
import { FilterIcon, SearchIcon } from "./ui/Icon";

interface TodoToolbarProps {
  filters: TodoFilters;
  onChange: (filters: TodoFilters) => void;
  /** Completed is forced in the Completed view. */
  view: TodoView;
}

const PRIORITIES: Array<{ value: TodoPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function TodoToolbar({ filters, onChange, view }: TodoToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Filters and sort reset when the user changes view.
  useEffect(() => {
    setFilterOpen(false);
  }, [view]);

  useEffect(() => {
    if (!filterOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFilterOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [filterOpen]);

  const activeFilterCount =
    filters.priorities.length + (filters.due !== "any" ? 1 : 0);

  function togglePriority(priority: TodoPriority) {
    const next = filters.priorities.includes(priority)
      ? filters.priorities.filter((entry) => entry !== priority)
      : [...filters.priorities, priority];
    onChange({ ...filters, priorities: next });
  }

  return (
    <div className="todo-toolbar">
      <div className="todo-search">
        <SearchIcon />
        <input
          type="search"
          className="text-input todo-search__input"
          aria-label="Search tasks"
          placeholder="Search tasks"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
        />
      </div>

      <label className="todo-compact-field">
        <span className="sr-only">Show</span>
        <select
          className="text-input"
          aria-label="Show"
          value={view === "completed" ? "completed" : filters.completion}
          disabled={view === "completed"}
          onChange={(event) =>
            onChange({
              ...filters,
              completion: event.target.value as CompletionFilter,
            })
          }
        >
          <option value="open">Open</option>
          <option value="all">All</option>
          <option value="completed">Completed</option>
        </select>
      </label>

      <div className="todo-filter-wrap" ref={filterRef}>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((value) => !value)}
        >
          <FilterIcon />
          Filter
          {activeFilterCount > 0 ? <span className="badge badge--neutral">{activeFilterCount}</span> : null}
        </button>

        {filterOpen ? (
          <div className="todo-popover" role="group" aria-label="Filters">
            <fieldset className="todo-popover__group">
              <legend>Priority</legend>
              {PRIORITIES.map((entry) => (
                <label key={entry.value} className="todo-check-row">
                  <input
                    type="checkbox"
                    checked={filters.priorities.includes(entry.value)}
                    onChange={() => togglePriority(entry.value)}
                  />
                  {entry.label}
                </label>
              ))}
            </fieldset>

            <label className="todo-popover__group">
              <span>Due</span>
              <select
                className="text-input"
                value={filters.due}
                onChange={(event) =>
                  onChange({ ...filters, due: event.target.value as DueFilter })
                }
              >
                <option value="any">Any</option>
                <option value="today">Today</option>
                <option value="next7">Next 7 days</option>
                <option value="overdue">Overdue</option>
                <option value="none">No date</option>
              </select>
            </label>

            <label className="todo-popover__group todo-popover__sort">
              <span>Sort</span>
              <select
                className="text-input"
                value={filters.sort}
                onChange={(event) =>
                  onChange({ ...filters, sort: event.target.value as SortMode })
                }
              >
                <option value="manual">Manual</option>
                <option value="due">Due date</option>
                <option value="priority">Priority</option>
                <option value="created">Created date</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <label className="todo-compact-field todo-sort">
        <span className="sr-only">Sort</span>
        <select
          className="text-input"
          aria-label="Sort"
          value={filters.sort}
          onChange={(event) =>
            onChange({ ...filters, sort: event.target.value as SortMode })
          }
        >
          <option value="manual">Manual</option>
          <option value="due">Due date</option>
          <option value="priority">Priority</option>
          <option value="created">Created date</option>
        </select>
      </label>
    </div>
  );
}
