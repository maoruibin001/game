/** Stable asset identities, now carrying newly composed 山野来信 music. */
export const JOURNEY_MUSIC = {
  normal: {
    guid: '108c2d7f-5731-580d-acaf-245765729f53',
    sourceKey: 'audio/journey-scene-v1/normal-ref',
    loop: true,
    initialVolume: 0.68,
  },
  vista: {
    guid: 'c07b05b6-9a31-568d-8cc0-3f1172c7da94',
    sourceKey: 'audio/journey-scene-v1/high-ref',
    loop: true,
    initialVolume: 0.72,
  },
  outro: {
    guid: 'c40d4d5b-58b4-571e-a1a9-f6d1a2ed8199',
    sourceKey: 'audio/journey-scene-v1/outro',
    loop: false,
    initialVolume: 0.74,
  },
} as const;

export type JourneyMusicCue = keyof typeof JOURNEY_MUSIC;

/** Normal-cue transport defaults; vista runs at 96 BPM for 30 s. Output is Engine-owned. */
export const JOURNEY_MUSIC_TRANSPORT = {
  bpm: 88,
  loopBeats: 80,
  loopSeconds: 54.545458333333336,
  outroBeats: 16,
  crossfadeSeconds: 1.5,
  bus: 'music',
} as const;
