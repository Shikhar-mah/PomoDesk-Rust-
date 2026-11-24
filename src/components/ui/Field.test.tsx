import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TextField } from "./TextField";

describe("TextField", () => {
  it("links the label, the hint and the error to the control", () => {
    render(
      <TextField
        id="task-title"
        label="Task title"
        value=""
        onChange={() => {}}
        hint="One line is enough"
        error="Give the task a title."
      />,
    );

    const input = screen.getByLabelText("Task title");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("task-title-error");
    expect(describedBy).toContain("task-title-hint");

    expect(screen.getByRole("alert")).toHaveTextContent("Give the task a title.");
  });

  it("marks a field as optional without changing its label", () => {
    render(<TextField id="task-note" label="Note" optional value="" onChange={() => {}} />);

    expect(screen.getByLabelText("Note")).toBeInTheDocument();
    expect(screen.getByText("optional")).toBeInTheDocument();
    expect(screen.getByLabelText("Note")).not.toHaveAttribute("aria-invalid");
  });
});
