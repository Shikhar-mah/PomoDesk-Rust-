// The preset tabs. Selecting a different tab may need a confirmation, which is
// handled by the parent (see App.tsx).

import { cn } from "../lib/cn";
import type { Preset } from "../lib/types";

interface PresetTabsProps {
  presets: Preset[];
  activePresetId: number;
  disabled?: boolean;
  onSelect: (presetId: number) => void;
}

export function PresetTabs({ presets, activePresetId, disabled, onSelect }: PresetTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Timer presets"
      className="flex gap-2 overflow-x-auto pb-1"
    >
      {presets.map((preset) => {
        const selected = preset.id === activePresetId;

        return (
          <button
            key={preset.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onSelect(preset.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
            )}
          >
            {preset.name}
          </button>
        );
      })}
    </div>
  );
}
