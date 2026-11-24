import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COMPLETION_SOUNDS,
  DEFAULT_SOUND_ID,
  playCompletionSound,
  resolveCompletionSound,
  stopCompletionSound,
} from "./sound";

class FakeAudio {
  static instances: FakeAudio[] = [];

  src: string;
  preload = "";
  currentTime = 0;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }
}

describe("completion sounds", () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  });

  it("discovers every audio file in the notification sound folder", () => {
    expect(COMPLETION_SOUNDS.length).toBeGreaterThan(0);
    expect(COMPLETION_SOUNDS.map((sound) => sound.id)).toContain("kirby-alarm-clock-127079");
  });

  it("turns a file name into a readable label without the download id", () => {
    const sound = COMPLETION_SOUNDS.find(
      (candidate) => candidate.id === "kirby-alarm-clock-127079",
    );

    expect(sound?.label).toBe("Kirby alarm clock");
  });

  it("falls back to the default when the saved sound is missing", () => {
    expect(resolveCompletionSound("no-longer-here")?.id).toBe(DEFAULT_SOUND_ID);
  });

  it("plays the bundled file and can stop it", () => {
    playCompletionSound(DEFAULT_SOUND_ID);

    const player = FakeAudio.instances[0];
    expect(player.src).toContain("kirby-alarm-clock");
    expect(player.play).toHaveBeenCalledOnce();

    player.currentTime = 12;
    stopCompletionSound();

    expect(player.pause).toHaveBeenCalled();
    expect(player.currentTime).toBe(0);
  });
});
