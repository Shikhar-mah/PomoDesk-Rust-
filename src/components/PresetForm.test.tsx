import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Preset } from "../lib/types";
import { PresetForm } from "./PresetForm";

const existing: Preset = {
  id: 5,
  name: "Deep Work",
  focusSec: 50 * 60,
  shortBreakSec: 10 * 60,
  longBreakSec: 25 * 60,
  longBreakEvery: 2,
  sortOrder: 1,
  isBuiltin: true,
};

describe("PresetForm", () => {
  it("asks for a name before creating a preset", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<PresetForm preset={null} onCancel={vi.fn()} onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Create preset" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Give this preset a name.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a duration outside 1–240 minutes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<PresetForm preset={null} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Sprint");
    await user.clear(screen.getByLabelText("Focus"));
    await user.type(screen.getByLabelText("Focus"), "0");
    await user.click(screen.getByRole("button", { name: "Create preset" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Each duration must be a whole number of minutes between 1 and 240.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("converts minutes to seconds and keeps the every-N rule", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<PresetForm preset={null} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "  Writing  ");
    await user.clear(screen.getByLabelText("Long break every"));
    await user.type(screen.getByLabelText("Long break every"), "3");
    await user.click(screen.getByRole("button", { name: "Create preset" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Writing",
      focusSec: 25 * 60,
      shortBreakSec: 5 * 60,
      longBreakSec: 15 * 60,
      longBreakEvery: 3,
    });
  });

  it("pre-fills an existing preset and saves under the Save label", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<PresetForm preset={existing} onCancel={vi.fn()} onSubmit={onSubmit} />);

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Deep Work");
    expect((screen.getByLabelText("Focus") as HTMLInputElement).value).toBe("50");

    await user.clear(screen.getByLabelText("Focus"));
    await user.type(screen.getByLabelText("Focus"), "45");
    await user.click(screen.getByRole("button", { name: "Save preset" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Deep Work", focusSec: 45 * 60 }),
    );
  });

  it("keeps the dialog open and explains a failed save", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("nope"));

    render(<PresetForm preset={null} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Sprint");
    await user.click(screen.getByRole("button", { name: "Create preset" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Sprint");
  });
});
