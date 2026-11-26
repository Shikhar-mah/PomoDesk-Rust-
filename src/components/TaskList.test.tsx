import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "../lib/types";
import { TaskList } from "./TaskList";

const openTask: Task = {
  id: 1,
  title: "Write the report",
  note: "",
  estSlots: 3,
  completedSlots: 1,
  isDone: false,
  isActive: true,
  createdAt: "2026-11-12 09:00:00",
  completedAt: null,
  tags: [],
  subtasks: [],
};

const finishedTask: Task = {
  ...openTask,
  id: 2,
  title: "Old chore",
  isDone: true,
  isActive: false,
  completedAt: "2026-11-12 11:00:00",
};

function renderList(tasks: Task[]) {
  const handlers = {
    onAdd: vi.fn().mockResolvedValue(undefined),
    onActivate: vi.fn(),
    onToggleDone: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onAddSubtask: vi.fn(),
    onToggleSubtaskDone: vi.fn(),
    onSelectSubtask: vi.fn(),
    onEditSubtask: vi.fn(),
    onDeleteSubtask: vi.fn(),
  };

  render(
    <TaskList tasks={tasks} loading={false} error={null} {...handlers} />,
  );
  return handlers;
}

describe("TaskList", () => {
  it("hides finished tasks until the user asks for them", async () => {
    const user = userEvent.setup();
    renderList([openTask, finishedTask]);

    expect(screen.getByText("Write the report")).toBeInTheDocument();
    expect(screen.queryByText("Old chore")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /show completed/i }));

    expect(screen.getByText("Old chore")).toBeInTheDocument();
  });

  it("explains an empty list and keeps quick add one click away", async () => {
    const user = userEvent.setup();
    renderList([]);

    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /add task/i }));
    expect(screen.getByLabelText("Task title")).toBeInTheDocument();
  });

  it("reports a failed load in plain language", () => {
    render(
      <TaskList
        tasks={[]}
        loading={false}
        error="PomoDesk couldn't load your tasks. Please restart the app."
        onAdd={vi.fn()}
        onActivate={vi.fn()}
        onToggleDone={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onAddSubtask={vi.fn()}
        onToggleSubtaskDone={vi.fn()}
        onSelectSubtask={vi.fn()}
        onEditSubtask={vi.fn()}
        onDeleteSubtask={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load your tasks/i);
  });
});
