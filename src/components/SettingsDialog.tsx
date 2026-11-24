// Settings: the five preferences plus preset management.
//
// Preset editing happens inline (the list is replaced by the form) so we never
// stack dialogs on top of each other. Problems are reported inside the
// dialog: a message behind the backdrop would be invisible.

import { useEffect, useState } from "react";

import { describeError } from "../lib/ipc";
import {
  COMPLETION_SOUNDS,
  playCompletionSound,
  resolveCompletionSound,
  stopCompletionSound,
} from "../lib/sound";
import type { Preset, PresetInput, Settings } from "../lib/types";
import { usePresetsStore } from "../stores/presets";
import { useSettingsStore } from "../stores/settings";
import { useTimerStore } from "../stores/timer";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { PresetForm } from "./PresetForm";
import { Toggle } from "./ui/Toggle";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type EditorState = { mode: "create" } | { mode: "edit"; preset: Preset } | null;

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const settings = useSettingsStore((state) => state.settings);
  const saveSettings = useSettingsStore((state) => state.save);

  const presets = usePresetsStore((state) => state.presets);
  const createPreset = usePresetsStore((state) => state.create);
  const updatePreset = usePresetsStore((state) => state.update);
  const removePreset = usePresetsStore((state) => state.remove);

  const timerSnapshot = useTimerStore((state) => state.snapshot);

  const selectedSoundId = resolveCompletionSound(settings?.soundId)?.id ?? "";

  const [editor, setEditor] = useState<EditorState>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leaving Settings must never leave a preview ringing behind it. The sound
  // itself may be a long alarm, so this is part of closing the dialog.
  useEffect(() => {
    if (open) return;
    stopCompletionSound();
    setPreviewing(false);
  }, [open]);

  // Deleting the preset of a focus session that is in progress throws that
  // session away, so the inline confirmation has to say so.
  const deletingActiveSession =
    pendingDeleteId !== null &&
    timerSnapshot?.activePresetId === pendingDeleteId &&
    timerSnapshot.sessionType === "focus" &&
    (timerSnapshot.status === "running" ||
      (timerSnapshot.status === "paused" && timerSnapshot.remainingMs < timerSnapshot.totalMs));

  async function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!settings) return;
    try {
      await saveSettings({ ...settings, [key]: value });
      setError(null);
    } catch (saveError) {
      setError(describeError(saveError));
    }
  }

  function stopPreview() {
    stopCompletionSound();
    setPreviewing(false);
  }

  function togglePreview() {
    if (previewing) {
      stopPreview();
      return;
    }

    const player = playCompletionSound(selectedSoundId);
    if (!player) return;

    setPreviewing(true);
    player.addEventListener("ended", () => setPreviewing(false), { once: true });
  }

  async function submitPreset(input: PresetInput) {
    if (editor?.mode === "edit") {
      await updatePreset(editor.preset.id, input);
    } else {
      await createPreset(input);
    }
    setEditor(null);
  }

  async function confirmDelete(id: number) {
    setDeleting(true);
    try {
      await removePreset(id);
      setPendingDeleteId(null);
      setError(null);
    } catch (deleteError) {
      setError(describeError(deleteError));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} title="Settings" onClose={onClose} className="dialog--wide">
      <div className="space-y-6">
        {error ? (
          <p role="alert" className="banner">
            {error}
          </p>
        ) : null}

        <section aria-labelledby="settings-preferences">
          <h3 id="settings-preferences" className="mb-1 text-sm font-semibold text-zinc-800">
            Preferences
          </h3>

          {settings ? (
            <div className="divide-y divide-zinc-100">
              <Toggle
                label="Start breaks automatically"
                description="A break begins as soon as a focus session finishes."
                checked={settings.autoStartBreaks}
                onChange={(value) => void changeSetting("autoStartBreaks", value)}
              />
              <Toggle
                label="Start focus automatically"
                description="The next focus session begins when a break finishes."
                checked={settings.autoStartFocus}
                onChange={(value) => void changeSetting("autoStartFocus", value)}
              />
              <Toggle
                label="Play a sound"
                description="A sound plays when a session ends."
                checked={settings.soundEnabled}
                onChange={(value) => {
                  if (!value) stopPreview();
                  void changeSetting("soundEnabled", value);
                }}
              />

              {settings.soundEnabled && COMPLETION_SOUNDS.length > 0 ? (
                <div className="py-3">
                  <label
                    htmlFor="settings-sound"
                    className="text-sm font-medium text-zinc-800"
                  >
                    Notification sound
                  </label>
                  <p id="settings-sound-hint" className="mt-0.5 text-xs text-zinc-600">
                    Choose the sound you hear when a session ends.
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      id="settings-sound"
                      className="text-input w-64 max-w-full"
                      value={selectedSoundId}
                      aria-describedby="settings-sound-hint"
                      onChange={(event) => {
                        stopPreview();
                        void changeSetting("soundId", event.target.value);
                      }}
                    >
                      {COMPLETION_SOUNDS.map((sound) => (
                        <option key={sound.id} value={sound.id}>
                          {sound.label}
                        </option>
                      ))}
                    </select>

                    <Button size="sm" onClick={togglePreview}>
                      {previewing ? "Stop preview" : "Preview"}
                    </Button>
                  </div>
                </div>
              ) : null}
              <Toggle
                label="Show desktop notifications"
                description="A system notification when a session ends."
                checked={settings.notificationsEnabled}
                onChange={(value) => void changeSetting("notificationsEnabled", value)}
              />
              <Toggle
                label="Keep running when the window is closed"
                description="PomoDesk stays in the system tray so the timer keeps going."
                checked={settings.minimizeToTray}
                onChange={(value) => void changeSetting("minimizeToTray", value)}
              />
            </div>
          ) : (
            <p className="py-3 text-sm text-zinc-500">Loading your settings…</p>
          )}
        </section>

        <section aria-labelledby="settings-presets">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="settings-presets" className="text-sm font-semibold text-zinc-800">
              Timer presets
            </h3>
            {!editor ? (
              <Button onClick={() => setEditor({ mode: "create" })}>Add preset</Button>
            ) : null}
          </div>

          {editor ? (
            <div className="rounded-lg border border-zinc-200 p-3">
              <p className="mb-3 text-sm font-medium text-zinc-700">
                {editor.mode === "edit" ? `Edit “${editor.preset.name}”` : "New preset"}
              </p>
              <PresetForm
                preset={editor.mode === "edit" ? editor.preset : null}
                onCancel={() => setEditor(null)}
                onSubmit={submitPreset}
              />
            </div>
          ) : presets.length === 0 ? (
            <EmptyState
              title="No presets"
              hint="Add a preset so the timer knows how long to run."
            />
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {presets.map((preset) => (
                <li key={preset.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-800">{preset.name}</p>
                      <p className="text-xs text-zinc-600">
                        {Math.round(preset.focusSec / 60)} / {Math.round(preset.shortBreakSec / 60)} /{" "}
                        {Math.round(preset.longBreakSec / 60)} min · long break every{" "}
                        {preset.longBreakEvery}
                      </p>
                    </div>

                    {pendingDeleteId === preset.id ? null : (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          size="sm"
                          onClick={() => setEditor({ mode: "edit", preset })}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          className="text-red-700"
                          onClick={() => setPendingDeleteId(preset.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {pendingDeleteId === preset.id ? (
                    <div className="mt-2 rounded-lg bg-red-50 p-3">
                      <p className="text-sm text-red-800">
                        {deletingActiveSession
                          ? "Deleting this preset throws away the focus session you are running. Delete it anyway?"
                          : "Delete this preset?"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={deleting}
                          onClick={() => void confirmDelete(preset.id)}
                        >
                          {deleting ? "Deleting…" : "Delete preset"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={deleting}
                          onClick={() => setPendingDeleteId(null)}
                        >
                          Keep it
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}
