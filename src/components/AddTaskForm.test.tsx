import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AddTaskForm } from "./AddTaskForm";

describe("AddTaskForm", () => {
  it("asks for a title instead of sending an empty task", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<AddTaskForm onAdd={onAdd} />);
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Give the task a title.");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("rejects a planned-pomodoro count that is out of range", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<AddTaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Task title"), "Write the report");
    await user.clear(screen.getByLabelText("Pomodoros"));
    await user.type(screen.getByLabelText("Pomodoros"), "0");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Planned pomodoros must be a whole number between 1 and 99.",
    );
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("sends a trimmed title and clears the form afterwards", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);

    render(<AddTaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Task title"), "  Draft the outline  ");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(onAdd).toHaveBeenCalledWith({
      title: "Draft the outline",
      note: "",
      estSlots: 1,
      tags: [],
    });

    const titleInput = screen.getByLabelText("Task title") as HTMLInputElement;
    expect(titleInput.value).toBe("");
  });

  it("puts the problem next to the field it belongs to", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<AddTaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Task title"), "Write the report");
    await user.clear(screen.getByLabelText("Pomodoros"));
    await user.type(screen.getByLabelText("Pomodoros"), "0");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    // Only the field that is wrong is marked as wrong.
    expect(screen.getByLabelText("Pomodoros")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Task title")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps what the user typed when saving fails", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("boom"));

    render(<AddTaskForm onAdd={onAdd} />);

    await user.type(screen.getByLabelText("Task title"), "Important work");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const titleInput = screen.getByLabelText("Task title") as HTMLInputElement;
    expect(titleInput.value).toBe("Important work");
  });
});
