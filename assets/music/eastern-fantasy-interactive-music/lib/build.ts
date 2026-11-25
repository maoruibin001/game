import { ok, err, type AudioClipAsset } from '@forgeax/engine/types';
import { renderCue } from './render.mjs';

const KEYS = {
  normal: 'audio/journey-scene-v1/normal-ref',
  vista: 'audio/journey-scene-v1/high-ref',
  outro: 'audio/journey-scene-v1/outro',
} as const;

export function build(cue: keyof typeof KEYS) {
  try {
    const { bytes } = renderCue(cue), sourceKey = KEYS[cue];
    const audio: AudioClipAsset = { kind: 'audio', sourceKey, mediaType: 'audio/wav', bytes };
    return ok({ [sourceKey]: audio });
  } catch (cause) {
    return err({ code: 'shanye-original-score-failed', expected: 'Original score rendered by retained licensed synthesis code', hint: 'Inspect the original score or synthesis error; do not substitute the archived library composition', detail: { cue, cause: String(cause) } });
  }
}
