import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "../lib/types";
import { EditTaskDialog } from "./EditTaskDialog";

const task: Task = {
  id: 7,
  title: "Write the report",
  note: "Draft first",
  estSlots: 2,
  completedSlots: 1,
  isDone: false,
  isActive: false,
  createdAt: "2026-01-01 10:00:00",
  completedAt: null,
  tags: ["work"],
  subtasks: [],
};

describe("EditTaskDialog", () => {
  it("saves edited planned and completed pomodoros together with tags", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<EditTaskDialog task={task} onClose={onClose} onSave={onSave} />);

    const planned = screen.getByLabelText("Planned pomodoros");
    await user.clear(planned);
    await user.type(planned, "5");

    const done = screen.getByLabelText("Pomodoros done");
    await user.clear(done);
    await user.type(done, "3");

    const tags = screen.getByLabelText("Tags");
    await user.clear(tags);
    await user.type(tags, "work, focus");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(7, {
      title: "Write the report",
      note: "Draft first",
      estSlots: 5,
      completedSlots: 3,
      tags: ["work", "focus"],
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("accepts zero completed pomodoros", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<EditTaskDialog task={task} onClose={vi.fn()} onSave={onSave} />);

    const done = screen.getByLabelText("Pomodoros done");
    await user.clear(done);
    await user.type(done, "0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(7, expect.objectContaining({ completedSlots: 0 }));
  });

  it("rejects an out-of-range completed count without saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(<EditTaskDialog task={task} onClose={vi.fn()} onSave={onSave} />);

    const done = screen.getByLabelText("Pomodoros done");
    await user.clear(done);
    await user.type(done, "1000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pomodoros done must be a whole number between 0 and 999.",
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
