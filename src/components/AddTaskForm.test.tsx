import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AddTaskForm } from "./AddTaskForm";

async function openForm() {
  await userEvent.setup().click(screen.getByRole("button", { name: /add task/i }));
}

describe("AddTaskForm", () => {
  it("stays collapsed until the user asks to add a task", async () => {
    render(<AddTaskForm onAdd={vi.fn()} />);

    expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
    await openForm();
    expect(screen.getByLabelText("Task title")).toBeInTheDocument();
  });

  it("asks for a title instead of sending an empty task", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<AddTaskForm onAdd={onAdd} />);
    await openForm();
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Give the task a title.");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("rejects a planned-pomodoro count that is out of range", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(<AddTaskForm onAdd={onAdd} />);
    await openForm();

    await user.type(screen.getByLabelText("Task title"), "Write the report");
    await user.clear(screen.getByLabelText("Pomodoros"));
    await user.type(screen.getByLabelText("Pomodoros"), "0");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Planned pomodoros must be a whole number between 1 and 99.",
    );
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("sends a trimmed title and clears the form afterwards", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(undefined);

    render(<AddTaskForm onAdd={onAdd} />);
    await openForm();

    await user.type(screen.getByLabelText("Task title"), "  Draft the outline  ");
    await user.click(screen.getByRole("button", { name: "Add" }));

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
    await openForm();

    await user.type(screen.getByLabelText("Task title"), "Write the report");
    await user.clear(screen.getByLabelText("Pomodoros"));
    await user.type(screen.getByLabelText("Pomodoros"), "0");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByLabelText("Pomodoros")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Task title")).not.toHaveAttribute("aria-invalid");
  });

  it("keeps what the user typed when saving fails", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error("boom"));

    render(<AddTaskForm onAdd={onAdd} />);
    await openForm();

    await user.type(screen.getByLabelText("Task title"), "Important work");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const titleInput = screen.getByLabelText("Task title") as HTMLInputElement;
    expect(titleInput.value).toBe("Important work");
  });
});
