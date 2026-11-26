import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Todo, TodoList } from "../lib/types";
import { TodoDialog } from "./TodoDialog";

const lists: TodoList[] = [
  {
    id: 1,
    name: "Inbox",
    color: "zinc",
    icon: "inbox",
    sortOrder: 0,
    isInbox: true,
    archivedAt: null,
    createdAt: "2026-01-01 09:00:00",
  },
  {
    id: 2,
    name: "Work",
    color: "blue",
    icon: "briefcase",
    sortOrder: 1,
    isInbox: false,
    archivedAt: null,
    createdAt: "2026-01-01 09:00:00",
  },
];

const existing: Todo = {
  id: 10,
  listId: 2,
  title: "Submit report",
  note: "Numbers checked",
  isDone: false,
  priority: "high",
  dueDate: "2026-11-24",
  dueTime: "17:00",
  sortOrder: 0,
  createdAt: "2026-01-01 09:00:00",
  completedAt: null,
  subtasks: [],
  reminder: null,
};

function renderDialog(overrides: Partial<Parameters<typeof TodoDialog>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onAddSubtask: vi.fn().mockResolvedValue(undefined),
    onToggleSubtask: vi.fn().mockResolvedValue(undefined),
    onRemoveSubtask: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <TodoDialog
      open
      todo={null}
      lists={lists}
      defaultListId={1}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("TodoDialog", () => {
  it("creates a task with only a title", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderDialog();

    await user.type(screen.getByLabelText("Title"), "Call the dentist");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(null, {
      title: "Call the dentist",
      note: "",
      listId: 1,
      priority: "medium",
      dueDate: null,
      dueTime: null,
      reminder: null,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses a reminder that has no due date", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    await user.type(screen.getByLabelText("Title"), "Task");
    await user.selectOptions(screen.getByLabelText("Reminder"), "due");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add a due date before setting a reminder for it.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("sends the due date, priority, list and reminder together", async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    await user.type(screen.getByLabelText("Title"), "Submit report");
    await user.selectOptions(screen.getByLabelText("List"), "2");
    await user.click(screen.getByRole("radio", { name: "High" }));
    await user.type(screen.getByLabelText("Due date"), "2026-11-24");
    await user.type(screen.getByLabelText("Due time"), "17:00");
    await user.selectOptions(screen.getByLabelText("Reminder"), "before");
    await user.selectOptions(screen.getByLabelText("Lead time"), "30");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        title: "Submit report",
        listId: 2,
        priority: "high",
        dueDate: "2026-11-24",
        dueTime: "17:00",
        reminder: { mode: "before", leadMinutes: 30 },
      }),
    );
  });

  it("adds checklist items only after the task exists", async () => {
    const user = userEvent.setup();
    const { onAddSubtask } = renderDialog({ todo: existing, defaultListId: 2 });

    expect(screen.getByText("Checklist")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New checklist item"), "Check numbers");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(onAddSubtask).toHaveBeenCalledWith(10, "Check numbers");
  });
});
