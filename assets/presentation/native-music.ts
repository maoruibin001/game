import type { GameHost } from '@forgeax/engine/app';
import { audioContribution } from '@forgeax/engine/audio';
import type { AssetDecoderLease, AudioClipAsset } from '@forgeax/engine/types';
import { JOURNEY_MUSIC, JOURNEY_MUSIC_TRANSPORT, type JourneyMusicCue } from '../music/music-cues';
import type { RegionId, SettingsView } from './types';

export interface NativeMusicFrame {
  region: RegionId;
  /** True for the ending presentation. A rising edge starts the one-shot outro once. */
  ending: boolean;
  settings: Pick<SettingsView, 'masterVolume' | 'musicVolume'>;
  /** Visibility/platform/user pause; a photograph or journal need not silence the score. */
  paused: boolean;
}
export interface NativeMusicStatus {
  phase: 'loading' | 'ready' | 'playing' | 'paused' | 'unavailable' | 'failed' | 'disposed';
  cue?: JourneyMusicCue;
  code?: string;
  message?: string;
  detail?: unknown;
}
export interface NativeJourneyMusic {
  /** Asset Registry only; resolves false on load/read failure, with error retained in status. */
  readonly ready: Promise<boolean>;
  /** Call in the original trusted gesture. Resumes only the borrowed native audio context. */
  unlock(): Promise<boolean>;
  update(frame: NativeMusicFrame): void;
  state(): NativeMusicStatus;
  destroy(): void;
}
export interface NativeMusicOptions { onStatus?(status: NativeMusicStatus): void; }
const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const IDS: Record<JourneyMusicCue, number> = { normal: 0x5a100001, vista: 0x5a100002, outro: 0x5a100003 };

/** Owns three music source IDs and asset handles, borrows (never destroys) the native Host audio. */
export function createNativeJourneyMusic(host: GameHost, options: NativeMusicOptions = {}): NativeJourneyMusic {
  const audio = host.audio;
  let disposed = false, unlocked = false, loaded = false, failed = false;
  let status: NativeMusicStatus = { phase: audio ? 'loading' : 'unavailable' };
  let frame: NativeMusicFrame = { region: 'post', ending: false, paused: true, settings: { masterVolume: .72, musicVolume: .52 } };
  let current: JourneyMusicCue | undefined;
  let monitorAt = 0, startAt = 0, playbackSeen = false;
  let transition: ReturnType<typeof setInterval> | undefined;
  let fadeFrom = new Map<JourneyMusicCue, number>(), fadeElapsed = 0, fadeAt = 0;
  const voices = new Map<JourneyMusicCue, number>();
  const clips = new Map<JourneyMusicCue, AudioClipAsset>();
  const release: (() => void)[] = [];
  const loading = new AbortController();
  let decoderLease: AssetDecoderLease | undefined;
  function report(next: NativeMusicStatus) {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next; options.onStatus?.({ ...next });
  }
  function stopVoices() { if (transition) clearInterval(transition); transition = undefined; for (const cue of voices.keys()) audio?.stop(IDS[cue]); voices.clear(); current = undefined; }
  function releaseAssets() {
    loading.abort();
    for (const free of release.splice(0)) free();
    clips.clear();
    // This owner lease is reference counted. Never remove another consumer's decoder.
    decoderLease?.dispose(); decoderLease = undefined;
  }
  function fail(code: string, message: string, detail?: unknown) { if (failed || disposed) return; failed = true; stopVoices(); releaseAssets(); report({ phase: 'failed', code, message, detail }); }
  function tickFade() {
    if (disposed || failed || !audio) return;
    const now = Date.now(); const dt = Math.max(0, Math.min(200, now - fadeAt)); fadeAt = now;
    if (frame.paused) return;
    fadeElapsed += dt;
    const ratio = Math.min(1, fadeElapsed / (JOURNEY_MUSIC_TRANSPORT.crossfadeSeconds * 1000));
    for (const [cue, initial] of fadeFrom) {
      const volume = cue === current ? initial + (JOURNEY_MUSIC[cue].initialVolume - initial) * ratio : initial * (1 - ratio);
      audio.setVolume(IDS[cue], volume); voices.set(cue, volume);
      if (ratio === 1 && cue !== current) { audio.stop(IDS[cue]); voices.delete(cue); }
    }
    if (ratio === 1 && transition) { clearInterval(transition); transition = undefined; }
  }
  function switchCue(cue: JourneyMusicCue) {
    if (!audio || !loaded || !unlocked || disposed || failed || current === cue) return;
    if (host.audio !== audio) { fail('host-audio-replaced', '音乐宿主已经更换，等待游戏重新挂载音频。'); return; }
    const clip = clips.get(cue); if (!clip) return;
    if (transition) clearInterval(transition);
    if (!voices.has(cue)) {
      // The native service owns decoding/graph creation. No fetch or second native Context.
      audio.play(IDS[cue], clip, { loop: JOURNEY_MUSIC[cue].loop, volume: 0, spatialBlend: 0, bus: 'music' });
      audio.setPaused(IDS[cue], frame.paused); voices.set(cue, 0);
    }
    current = cue; playbackSeen = false; startAt = Date.now();
    fadeFrom = new Map(voices); fadeElapsed = 0; fadeAt = Date.now();
    transition = setInterval(tickFade, 40);
    report({ phase: frame.paused ? 'paused' : 'ready', cue });
  }
  function applyFrame() {
    if (!audio || disposed || failed) return;
    // Only our music bus is changed. Master user volume is folded into its gain,
    // leaving game effects and the independent original ambient synthesizer alone.
    audio.setBusVolume('music', clamp(frame.settings.masterVolume) * clamp(frame.settings.musicVolume));
    for (const cue of voices.keys()) audio.setPaused(IDS[cue], frame.paused);
    if (frame.paused) { startAt = Date.now(); if (current) report({ phase: 'paused', cue: current }); return; }
    switchCue(frame.ending ? 'outro' : frame.region === 'ridge' ? 'vista' : 'normal');
    const now = Date.now();
    if (current && now >= monitorAt) {
      monitorAt = now + 500;
      const state = audio.getState(); const position = audio.getPlaybackPosition(IDS[current]);
      if (state.contextState === 'closed') fail('native-context-closed', '原生音乐服务已关闭。', state.lastError);
      else if (state.contextState === 'running' && position !== undefined) { playbackSeen = true; report({ phase: 'playing', cue: current }); }
      else if (state.contextState === 'running' && !playbackSeen && now - startAt > 8000) fail('native-playback-not-started', '原生音乐未能开始播放，使用原创合成配乐。', state.lastError);
    }
  }
  const ready = (async () => {
    if (!audio) { report({ phase: 'unavailable', code: 'host-audio-unavailable', message: '当前宿主没有原生音频服务，使用原创合成配乐。' }); return false; }
    try {
      // Frontend registries are realm-local: the Engine audio plugin's decoder
      // does not cover this Host's assets. Install the official 0.5 owner before load.
      decoderLease = host.assets.installDecoder(audioContribution.kind, audioContribution.decoder);
    } catch (error) {
      fail('native-music-decoder-install-failed', '正式音乐解码器无法安装。', error instanceof Error ? error.message : String(error));
      return false;
    }
    try {
      // Small fixed set, loaded concurrently by the Asset Registry. No paid generation.
      const results = await Promise.all((Object.keys(JOURNEY_MUSIC) as JourneyMusicCue[]).map(async cue => {
        const result = await host.assets.load(JOURNEY_MUSIC[cue].guid, audioContribution.kind, { signal: loading.signal });
        if (!result.ok) return { cue, ok: false as const, error: result.error };
        if (disposed || failed) { host.assets.release(result.value); return { cue, ok: false as const, error: { code: 'disposed' } }; }
        release.push(() => host.assets.release(result.value));
        const content = host.assets.read(result.value);
        if (!content.ok) return { cue, ok: false as const, error: content.error };
        return { cue, ok: true as const, clip: content.value };
      }));
      if (disposed) return false;
      const invalid = results.find(result => !result.ok);
      if (invalid && !invalid.ok) { fail(String(invalid.error.code), '正式音乐资源暂时无法读取，使用原创合成配乐。', invalid.error); return false; }
      for (const result of results) if (result.ok) clips.set(result.cue, result.clip);
      loaded = true; report({ phase: 'ready' }); applyFrame(); return true;
    } catch (error) { if (!disposed) fail('native-music-load-threw', '正式音乐加载异常，使用原创合成配乐。', error instanceof Error ? error.message : String(error)); return false; }
  })();
  const api: NativeJourneyMusic = {
    ready,
    async unlock() {
      if (disposed || failed || !audio) return false;
      try {
        // musicOutput() is the public current-context seam; it also installs Host gesture handling.
        const output = audio.musicOutput();
        const nativeContext = output?.context;
        const resumed = nativeContext && 'resume' in nativeContext ? (nativeContext as AudioContext).resume() : Promise.resolve();
        unlocked = true;
        await resumed;
        if (disposed || failed) return false;
        const success = await ready; if (success && !disposed) applyFrame(); return success;
      } catch (error) { report({ phase: 'ready', code: 'gesture-resume-required', message: '再次点击游戏即可继续音乐。', detail: error instanceof Error ? error.message : String(error) }); return false; }
    },
    update(next) { if (disposed) return; frame = next; applyFrame(); },
    state() { return { ...status }; },
    destroy() { if (disposed) return; disposed = true; stopVoices(); releaseAssets(); report({ phase: 'disposed' }); },
  };
  return api;
}
