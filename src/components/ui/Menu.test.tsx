import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Menu } from "./Menu";

describe("Menu", () => {
  it("opens a menu with the row's actions and runs the chosen one", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <Menu
        label="More actions for task"
        items={[
          { label: "Edit", onSelect: onEdit },
          { label: "Delete", onSelect: vi.fn(), danger: true },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "More actions for task" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves through items with the arrow keys and closes on Escape", async () => {
    const user = userEvent.setup();

    render(
      <Menu
        label="Row actions"
        items={[
          { label: "One", onSelect: vi.fn() },
          { label: "Two", onSelect: vi.fn() },
          { label: "Three", onSelect: vi.fn() },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Row actions" });
    await user.click(trigger);

    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Two" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Three" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "One" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("renders disabled items but keeps them unreachable", async () => {
    const user = userEvent.setup();

    render(
      <Menu
        label="Row actions"
        items={[
          { label: "Move up", onSelect: vi.fn(), disabled: true },
          { label: "Delete", onSelect: vi.fn() },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Row actions" }));

    expect(screen.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
  });
});
