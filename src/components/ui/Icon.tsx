// A small, consistent set of line icons.
//
// Every icon inherits the colour of the text around it and is decorative on
// its own: the control that holds it always carries a visible label or an
// accessible name, so meaning never depends on recognising the glyph.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Shared drawing attributes, so all icons look like they belong together. */
const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
} as const;

export function PlayIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M9 5.5v13M15 5.5v13" strokeWidth={3} />
    </svg>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M3 5v6h6" />
      <path d="M3.5 11a8.5 8.5 0 1 1 2.2 6.6" />
    </svg>
  );
}

export function SkipIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M5 5.5v13l9-6.5z" fill="currentColor" stroke="none" />
      <path d="M18 5.5v13" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 12.5h10L18 7" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M4 4v15h16" />
      <path d="M8 15l3.5-4.5L15 14l4-6" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3" />
      <path d="M1.5 15h5M9.5 8h5M17.5 17h5" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...ICON_PROPS} {...props}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}
