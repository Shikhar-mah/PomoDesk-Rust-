// A short two-note chime, synthesised in the browser.
//
// Why not ship an audio file? A generated chime keeps the app tiny, works
// offline, and needs no asset pipeline. The OS notification is the primary
// signal; this is the pleasant extra.

let audioContext: AudioContext | null = null;

export function playCompletionSound(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!Ctor) return;

    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const start = audioContext.currentTime;
    const notes = [880, 1174.66]; // A5 then D6

    notes.forEach((frequency, index) => {
      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = start + index * 0.16;
      const noteEnd = noteStart + 0.18;

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      // A quick fade in/out avoids clicks and keeps the chime gentle.
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
    });
  } catch {
    // Sound is a nicety: never let it break the timer.
  }
}
