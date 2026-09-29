"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useAudioPrefs } from "@/lib/audioPrefs";

export function MuteAllButton() {
  const allMuted = useAudioPrefs((s) => s.allMuted());
  const setAllMuted = useAudioPrefs((s) => s.setAllMuted);

  return (
    <button
      type="button"
      onClick={() => setAllMuted(!allMuted)}
      className="btn btn-ghost"
      title={allMuted ? "Unmute all slides" : "Mute all slides"}
    >
      {allMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      {allMuted ? "Unmute all" : "Mute all"}
    </button>
  );
}
