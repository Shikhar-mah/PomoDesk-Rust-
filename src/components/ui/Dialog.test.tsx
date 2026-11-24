import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("holds the page still while it is open", () => {
    const { rerender } = render(
      <Dialog open title="Settings" onClose={() => {}}>
        <p>Body</p>
      </Dialog>,
    );

    // The page behind a modal must not scroll.
    expect(document.body.classList.contains("is-dialog-open")).toBe(true);

    rerender(
      <Dialog open={false} title="Settings" onClose={() => {}}>
        <p>Body</p>
      </Dialog>,
    );

    expect(document.body.classList.contains("is-dialog-open")).toBe(false);
  });

  it("names the dialog after its title and describes it", () => {
    render(
      <Dialog
        open
        title="Delete task?"
        description="This cannot be undone."
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Delete task?");
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
  });
});
