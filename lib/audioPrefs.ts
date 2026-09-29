"use client";

import { create } from "zustand";

interface AudioPrefs {
  /** Default used for any slide that hasn't been toggled individually. */
  globalMuted: boolean;
  /** Per-slide overrides, keyed by slide id. */
  overrides: Record<string, boolean>;

  isMuted: (slideId: string) => boolean;
  toggleSlide: (slideId: string) => void;
  setSlideMuted: (slideId: string, muted: boolean) => void;
  /** Mute or unmute every slide at once, clearing any individual overrides. */
  setAllMuted: (muted: boolean) => void;
  /** True only if every known slide would currently play muted. */
  allMuted: () => boolean;
}

export const useAudioPrefs = create<AudioPrefs>((set, get) => ({
  globalMuted: true, // start muted so autoplay is never blocked
  overrides: {},

  isMuted: (slideId) => get().overrides[slideId] ?? get().globalMuted,

  toggleSlide: (slideId) => {
    const muted = get().isMuted(slideId);
    set((s) => ({ overrides: { ...s.overrides, [slideId]: !muted } }));
  },

  setSlideMuted: (slideId, muted) =>
    set((s) => ({ overrides: { ...s.overrides, [slideId]: muted } })),

  setAllMuted: (muted) => set({ globalMuted: muted, overrides: {} }),

  allMuted: () => {
    const { globalMuted, overrides } = get();
    return globalMuted && Object.values(overrides).every((v) => v !== false);
  },
}));
