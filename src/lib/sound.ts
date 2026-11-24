// Notification sounds bundled from the `notification sound/` folder.
//
// Every supported audio file in that folder becomes an option automatically, so
// adding another file is all it takes to make it available in Settings. The file
// name is used as a stable id; the visible label is derived from it.

const soundModules = import.meta.glob("../../notification sound/*.{mp3,ogg,wav,m4a}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export interface CompletionSound {
  /** Stable id: the file name without its extension. */
  id: string;
  /** Human-readable name shown in Settings. */
  label: string;
  /** Bundled URL passed to the audio element. */
  url: string;
}

function fileNameStem(path: string): string {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.[^.]+$/, "");
}

function labelFromStem(stem: string): string {
  const words = stem.split(/[-_\s]+/).filter(Boolean);

  // Asset libraries often suffix a download id; it is not part of the name.
  if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) {
    words.pop();
  }

  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Every bundled sound, in a predictable order for the picker. */
export const COMPLETION_SOUNDS: CompletionSound[] = Object.entries(soundModules)
  .map(([path, url]) => {
    const id = fileNameStem(path);
    return { id, label: labelFromStem(id), url };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

/** Used when no choice has been saved or the saved file is no longer bundled. */
export const DEFAULT_SOUND_ID = COMPLETION_SOUNDS[0]?.id ?? "";

/** The chosen sound, falling back to the default if it is unavailable. */
export function resolveCompletionSound(soundId?: string | null): CompletionSound | null {
  return (
    COMPLETION_SOUNDS.find((sound) => sound.id === soundId) ?? COMPLETION_SOUNDS[0] ?? null
  );
}

// Reusing one element per sound keeps a second notification from overlapping the
// previous one and lets the browser preload the file ahead of time.
const players = new Map<string, HTMLAudioElement>();

function playerFor(sound: CompletionSound): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;

  let player = players.get(sound.id);
  if (!player) {
    player = new Audio(sound.url);
    player.preload = "auto";
    players.set(sound.id, player);
  }
  return player;
}

export function playCompletionSound(soundId?: string | null): HTMLAudioElement | null {
  try {
    const sound = resolveCompletionSound(soundId);
    if (!sound) return null;

    const player = playerFor(sound);
    if (!player) return null;

    player.pause();
    player.currentTime = 0;
    // Browsers can refuse playback before the first interaction. The desktop
    // notification is the primary signal, so a refused chime is harmless.
    void player.play().catch(() => {});
    return player;
  } catch {
    // Sound is a nicety: never let it break the timer.
    return null;
  }
}

/** Stops a notification or preview that is still playing. */
export function stopCompletionSound(): void {
  for (const player of players.values()) {
    try {
      player.pause();
      player.currentTime = 0;
    } catch {
      // A browser that cannot seek or pause has already stopped the sound.
    }
  }
}
