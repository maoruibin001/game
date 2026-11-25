import { synthesize } from './shanshui.mjs';
import { compose } from './compositions.mjs';

export function renderCue(cue) {
  const recipe = compose(cue), channels = synthesize(recipe, cue);
  let peak = 0, sum = 0;
  for (const channel of channels) for (const sample of channel) {
    if (!Number.isFinite(sample)) throw new Error('Non-finite original music sample');
    peak = Math.max(peak, Math.abs(sample)); sum += sample * sample;
  }
  const rms = Math.sqrt(sum / (channels[0].length * 2));
  const gain = Math.min(1.8, .075 / Math.max(rms, 1e-9), .70 / Math.max(peak, 1e-9));
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      let fade = 1;
      if (recipe.oneShot) fade = Math.min(1, i / 3840) * Math.min(1, (channel.length - 1 - i) / 124800);
      channel[i] *= gain * Math.max(0, fade);
    }
    if (!recipe.oneShot) {
      // Tiny periodic seam repair, after the synth has folded full reverb tails.
      const mean = (channel[0] + channel.at(-1)) * .5;
      for (let i = 0; i < 240; i++) {
        const weight = .5 + .5 * Math.cos(Math.PI * i / 240);
        channel[i] = channel[i] * (1 - weight) + mean * weight;
        const last = channel.length - 1 - i;
        channel[last] = channel[last] * (1 - weight) + mean * weight;
      }
    }
  }
  return { recipe, channels, bytes: encodeWave(channels), gain };
}

/** Original uncompressed PCM16 WAVE writer; no samples or third-party encoder. */
function encodeWave(channels) {
  const frames = channels[0].length, bytes = new Uint8Array(44 + frames * 4), v = new DataView(bytes.buffer);
  const tag = (offset, text) => [...text].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  tag(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, 48000, true); v.setUint32(28, 192000, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const value = channels[c][i];
    if (!Number.isFinite(value) || Math.abs(value) >= 1) throw new Error('Music clipping');
    v.setInt16(44 + (i * 2 + c) * 2, Math.round(value * 32767), true);
  }
  return bytes;
}
