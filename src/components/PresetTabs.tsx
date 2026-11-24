// The preset tabs. Selecting a different tab may need a confirmation, which is
// handled by the parent (see App.tsx).

import type { Preset } from "../lib/types";

interface PresetTabsProps {
  presets: Preset[];
  activePresetId: number;
  disabled?: boolean;
  onSelect: (presetId: number) => void;
}

export function PresetTabs({ presets, activePresetId, disabled, onSelect }: PresetTabsProps) {
  return (
    <div role="tablist" aria-label="Timer presets" className="preset-tabs">
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
            className="preset-tab"
          >
            {preset.name}
          </button>
        );
      })}
    </div>
  );
}
