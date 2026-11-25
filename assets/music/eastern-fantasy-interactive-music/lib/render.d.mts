export function renderCue(cue: 'normal' | 'vista' | 'outro'): {
  recipe: { id: string; title: string; bpm: number; bars: number; loopSeconds: number; oneShot: boolean; tracks: Record<string, unknown[]> };
  channels: [Float32Array, Float32Array]; bytes: Uint8Array; gain: number;
};
