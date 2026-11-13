import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("explains the consequence before the user commits", () => {
    render(
      <ConfirmDialog
        open
        title="Switch preset?"
        message={'Switch to "Deep Work"? Your current focus session will be discarded.'}
        confirmLabel="Switch preset"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Switch preset?" })).toBeInTheDocument();
    expect(screen.getByText(/will be discarded/i)).toBeInTheDocument();
  });

  it("confirms and cancels through the provided callbacks", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open
        title="Delete task?"
        message="This cannot be undone."
        confirmLabel="Delete task"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete task" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("prevents double submission while busy", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        busy
        title="Delete task?"
        message="This cannot be undone."
        confirmLabel="Delete task"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    const confirm = screen.getByRole("button", { name: /Working/ });
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
