import type { RegionId, SettingsView } from './types';
import type { JourneyEvent, JourneyEventType } from '../journey/types';
import type { WeatherId } from '../shared/photography-contract';

export type JourneySound = 'shutter' | 'postmark' | 'discovery' | 'photo:matched' | 'world:windmill-awaken' | 'world:bridge-lowering' | 'world:bridge-lowered' | 'world:gate-opened' | 'ending' | 'page' | 'footstep' | 'windbell' | 'wind-song' | 'bird' | 'memory-unlocked' | 'timer' | 'camera-open' | 'camera-close' | 'courtyard-bell' | 'night:spark' | 'night:launch' | 'night:burst' | 'night:fish';
export type JourneyAudioEvent = JourneySound | string | Pick<JourneyEvent, 'type' | 'discovery' | 'memory'>;

/** Every rule event is deliberately mapped or silent; new rule events fail type checking. */
export const JOURNEY_EVENT_SOUNDS: Readonly<Record<JourneyEventType, JourneySound | null>> = {
  'notice': null,
  'input:reset': null,
  'journey:started': 'page',
  'journey:continued': 'page',
  'journey:menu': 'page',
  'journey:suspended': null,
  'journey:resumed': null,
  'journey:recovered': null,
  'clock:rested': 'page',
  'clock:evening-bell': 'courtyard-bell',
  'clock:changed': null,
  'outing:checked-in': 'discovery',
  'outing:tracked': null,
  'reply:photo-selected': 'page',
  'creative:changed': null,
  'screen:changed': 'page',
  'camera:opened': 'camera-open',
  'camera:closed': 'camera-close',
  'area:entered': null, // The continuous ambience follows AudioFrame.region.
  'tutorial:completed': 'discovery',
  'discovery:read': 'page',
  'discovery:found': 'discovery',
  'letter:read': 'page',
  'photo:captured': null, // capture-request already plays the shutter at the real exposure.
  'photo:matched': 'photo:matched',
  'skill:learned': 'discovery',
  'reward:fireworks': 'postmark',
  'clock:market-open': 'courtyard-bell',
  'night:spark': 'night:spark',
  'night:launch': 'night:launch',
  'night:burst': 'night:burst',
  'night:fish': 'night:fish',
  'world:windmill-awaken': 'world:windmill-awaken',
  'world:bridge-lowering': 'world:bridge-lowering',
  'world:bridge-lowered': 'world:bridge-lowered',
  'world:gate-opened': 'world:gate-opened',
  'world:sunset': null, // ending:mailed owns the postmark; the native outro owns the score.
  'album:already-kept': null,
  'album:full': null,
  'album:kept': 'page',
  'album:draft-discarded': 'page',
  'album:deleted': 'page',
  'ending:photo-selected': 'page',
  'ending:mailed': 'ending',
  'ending:finished': 'page',
  'ride:started': null, // Zipline wind follows the controller mode through AudioFrame.
  'ride:cancelled': null,
  'ride:arrived': null,
  'settings:changed': null,
  'memory:unlocked': 'memory-unlocked',
  'memory:photo-replaced': 'page',
  'photo:timer-started': 'timer',
  'photo:timer-cancelled': null,
  'photo:timer-ready': null, // Only the actual capture request owns the shutter.
  'weather:changed': null, // Actual applied EnvironmentAudioFrame drives continuous sound.
  'photography:changed': null,
};
const DIRECT_SOUNDS = new Set<JourneySound>(['shutter', 'postmark', 'discovery', 'photo:matched',
  'world:windmill-awaken', 'world:bridge-lowering', 'world:bridge-lowered', 'world:gate-opened', 'ending', 'page',
  'footstep', 'windbell', 'wind-song', 'bird', 'memory-unlocked', 'timer', 'camera-open', 'camera-close', 'courtyard-bell']);

export function resolveJourneySound(event: JourneyAudioEvent): JourneySound | null {
  const type = typeof event === 'string' ? event : event.type;
  if (typeof event !== 'string' && event.discovery === 'wind-song'
    && (type === 'discovery:found' || type === 'discovery:read')) return 'wind-song';
  if (typeof event !== 'string' && event.discovery === 'last-letter'
    && (type === 'discovery:found' || type === 'discovery:read')) return 'courtyard-bell';
  if (Object.prototype.hasOwnProperty.call(JOURNEY_EVENT_SOUNDS, type)) {
    return JOURNEY_EVENT_SOUNDS[type as JourneyEventType];
  }
  return DIRECT_SOUNDS.has(type as JourneySound) ? type as JourneySound : null;
}

export interface AudioFrame {
  region?: RegionId;
  distanceWalked?: number;
  moving?: boolean;
  surface?: 'earth' | 'stone' | 'wood' | 'water';
  windmill?: boolean;
  zipline?: boolean;
}
export interface JourneyAudio {
  /** Call synchronously inside the first trusted click/key gesture. Returns false if unavailable. */
  unlock(): Promise<boolean>;
  setMix(settings: Pick<SettingsView, 'masterVolume' | 'musicVolume' | 'ambienceVolume' | 'effectsVolume'>): void;
  /** Crossfades the fallback score out when native music is ready, and back in on failure. */
  setMusicEnabled(enabled: boolean): void;
  setRegion(region: RegionId): void;
  update(frame: AudioFrame): void;
  /** Actual applied weather/audio intensities, not a UI request. Inputs are clamped 0..1. */
  setEnvironment(frame: EnvironmentAudioFrame): void;
  play(event: JourneyAudioEvent): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  readonly unlocked: boolean;
}
export interface EnvironmentAudioFrame { weather: WeatherId; rain: number; wind: number; }
export interface JourneyAudioOptions {
  /** Turn off when the host plays the catalog music; never layer both scores. */
  proceduralMusic?: boolean;
  /** The owner's document window, if mounted in another same-origin realm. */
  window?: Window;
  /** Optional test / host injection. The returned context is owned by this module. */
  createContext?: () => AudioContext;
}

const limit = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Original synthesis: no recordings, external assets, fetches, or paid generation. Frontend only. */
export function createJourneyAudio(options: JourneyAudioOptions = {}): JourneyAudio {
  let context: AudioContext | undefined;
  let master: GainNode, music: GainNode, ambience: GainNode, effects: GainNode;
  let windGain: GainNode, windFilter: BiquadFilterNode, breezeSource: AudioBufferSourceNode | undefined;
  let rainGain: GainNode, rainFilter: BiquadFilterNode, rainSource: AudioBufferSourceNode | undefined;
  let windBuffer: AudioBuffer, shortBuffer: AudioBuffer;
  let timer: ReturnType<typeof setInterval> | undefined;
  let destroyed = false, activated = false, paused = false;
  let proceduralMusic = options.proceduralMusic !== false;
  let region: RegionId = 'post', moving = false, surface: AudioFrame['surface'] = 'earth';
  let windmill = false, zipline = false, lastDistance = 0, nextBird = 0, nextBell = 0, nextCreak = 0, nextMusic = 0, phrase = 0;
  let settings = { masterVolume: .72, musicVolume: .52, ambienceVolume: .7, effectsVolume: .78 };
  let environment: EnvironmentAudioFrame = { weather: 'morning', rain: 0, wind: 1 };
  const voices = new Set<AudioScheduledSourceNode>();
  const nodes = new Set<AudioNode>();
  // Deterministic sound textures; this is an instrument, not a streamed audio dependency.
  let randomState = 0x63a49bc;
  const random = () => { randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; };
  const at = () => context?.currentTime ?? 0;
  function gain(value: number, parent: AudioNode): GainNode {
    const node = context!.createGain(); node.gain.value = value; node.connect(parent); nodes.add(node); return node;
  }
  function smooth(param: AudioParam, value: number, time = .18) {
    const now = at(); param.cancelScheduledValues(now); param.setTargetAtTime(value, now, time);
  }
  function own(source: AudioScheduledSourceNode, cleanup: AudioNode[]) {
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); for (const node of cleanup) { node.disconnect(); nodes.delete(node); } };
    if (voices.size > 48) { const oldest = voices.values().next().value; if (oldest && oldest !== source) { try { oldest.stop(); } catch { /* Already ended. */ } voices.delete(oldest); } }
  }
  function tone(midi: number, start: number, duration: number, amplitude: number, bus: AudioNode, type: OscillatorType = 'sine', pan = 0) {
    const osc = context!.createOscillator(), env = gain(0, bus);
    osc.type = type; osc.frequency.value = frequency(midi);
    let panner: StereoPannerNode | undefined;
    panner = context!.createStereoPanner(); panner.pan.value = pan; osc.connect(panner); panner.connect(env);
    env.gain.setValueAtTime(.0001, start); env.gain.exponentialRampToValueAtTime(Math.max(.0002, amplitude), start + .015); env.gain.exponentialRampToValueAtTime(.0001, start + duration);
    own(osc, panner ? [env, panner] : [env]); osc.start(start); osc.stop(start + duration + .03);
  }
  function noise(start: number, duration: number, amplitude: number, cutoff: number, bus: AudioNode, filterType: BiquadFilterType = 'lowpass') {
    const source = context!.createBufferSource(), filter = context!.createBiquadFilter(), env = gain(0, bus);
    source.buffer = shortBuffer; source.loop = duration > shortBuffer.duration; filter.type = filterType; filter.frequency.value = cutoff;
    source.connect(filter); filter.connect(env); env.gain.setValueAtTime(.0001, start); env.gain.exponentialRampToValueAtTime(amplitude, start + Math.min(.025, duration * .2)); env.gain.exponentialRampToValueAtTime(.0001, start + duration);
    own(source, [filter, env]); source.start(start, random() * .2); source.stop(start + duration + .03);
  }
  function bell(start = at(), midi = 86, volume = .055) { tone(midi, start, 2.8, volume, ambience); tone(midi + 19, start + .008, 1.7, volume * .18, ambience); }
  function courtyardBell(start = at(), volume = .065) {
    tone(62, start, 3.8, volume, effects, 'sine', .08);
    tone(74, start + .01, 2.7, volume * .42, effects, 'sine', .08);
    tone(81, start + .02, 1.9, volume * .18, effects, 'sine', .08);
  }
  function windSong(start = at()) {
    // Six original D-major chime notes answer this optional discovery immediately.
    // Use the effects bus so it remains distinct from random forest ambience.
    const notes = [74, 78, 81, 86, 81, 78];
    const offsets = [0, .22, .57, 1, 1.42, 1.86];
    const pans = [-.24, .14, -.1, .24, .08, 0];
    notes.forEach((note, i) => {
      tone(note, start + offsets[i]!, 2.8, .075, effects, 'sine', pans[i]!);
      tone(note + 19, start + offsets[i]! + .008, 1.7, .014, effects, 'sine', pans[i]!);
    });
  }
  function bird(start = at()) {
    const osc = context!.createOscillator(), env = gain(0, ambience);
    osc.type = 'sine'; osc.frequency.setValueAtTime(2100 + random() * 600, start); osc.frequency.exponentialRampToValueAtTime(3400 + random() * 900, start + .08); osc.frequency.exponentialRampToValueAtTime(1800 + random() * 900, start + .23);
    osc.connect(env); env.gain.setValueAtTime(.0001, start); env.gain.exponentialRampToValueAtTime(.022, start + .025); env.gain.exponentialRampToValueAtTime(.0001, start + .24);
    own(osc, [env]); osc.start(start); osc.stop(start + .26);
  }
  function step() {
    const t = at();
    if (surface === 'water') { noise(t, .14, .10, 1850, effects);tone(79,t+.024,.06,.018,effects); }
    else if (surface === 'stone') { noise(t, .065, .065, 2600, effects); tone(44 + random() * 4, t, .07, .03, effects); }
    else if (surface === 'wood') { noise(t, .08, .07, 1300, effects); tone(48 + random() * 2, t, .11, .038, effects, 'triangle'); }
    else noise(t, .115, .08, 820, effects);
  }
  function phraseAt(time: number) {
    // D major pentatonic, seven-second breathing spaces; melody stays below ambience details.
    const motifs: Record<RegionId, number[]> = { post: [62, 66, 69, 73, 69, 66], forest: [66, 69, 74, 73, 69, 66], town: [62, 64, 66, 69, 66, 64], ridge: [69, 73, 74, 78, 74, 73] };
    const melody = motifs[region]; const offset = phrase++ % 2 ? 2 : 0;
    for (let i = 0; i < 6; i++) {
      const note = melody[(i + offset) % melody.length]!;
      tone(note, time + i * .82, 2.5, .035, music, 'sine', (i % 2 ? 1 : -1) * .2);
      tone(note + 12, time + i * .82 + .007, 1.6, .008, music, 'sine', (i % 2 ? -1 : 1) * .16);
    }
    tone(region === 'forest' ? 47 : 50, time, 5.2, .035, music); tone(57, time + 2.46, 3, .018, music);
  }
  function startBreeze() {
    if (breezeSource || !context || paused) return;
    breezeSource = context.createBufferSource(); breezeSource.buffer = windBuffer; breezeSource.loop = true; breezeSource.connect(windFilter); breezeSource.start();
    rainSource = context.createBufferSource(); rainSource.buffer = shortBuffer; rainSource.loop = true; rainSource.connect(rainFilter); rainSource.start();
  }
  function stopBreeze() {
    for (const source of [breezeSource, rainSource]) if (source) { try { source.stop(); } catch { /* Already stopped. */ } source.disconnect(); }
    breezeSource = undefined; rainSource = undefined;
  }
  function schedule() {
    if (!context || paused || destroyed || context.state !== 'running') return;
    const t = at();
    if (proceduralMusic && t >= nextMusic) { phraseAt(t + .05); nextMusic = t + 13.12; }
    if (t >= nextBird && region !== 'town' && environment.rain < .35) { bird(t + .1); if (random() > .5) bird(t + .48); nextBird = t + (region === 'forest' ? 8 : 17) + random() * 17; }
    if (t >= nextBell && region === 'forest') { bell(t + .08, [86, 88, 93][Math.floor(random() * 3)]!, .038); nextBell = t + 7 + random() * 15; }
    if (t >= nextBell && region === 'town' && environment.rain > .2) { courtyardBell(t + .12, .03); nextBell = t + 18 + random() * 16; }
    if (t >= nextCreak && windmill) { noise(t + .03, .4, .012, 380, ambience); tone(36, t + .02, .5, .007, ambience, 'triangle'); nextCreak = t + 2.3; }
    const gust = .75 + .25 * Math.sin(t * .21) * Math.sin(t * .083);
    smooth(windGain.gain, (region === 'ridge' ? .075 : region === 'forest' ? .045 : .025) * gust * environment.wind + (zipline ? .12 : 0), .8);
  }
  function startScheduler() { if (!timer) timer = setInterval(schedule, 250); }
  function clearScheduledVoices() { for (const voice of voices) { try { voice.stop(); } catch { /* Already stopped. */ } } voices.clear(); }
  function setup() {
    const browser = options.window ?? (typeof window === 'undefined' ? undefined : window);
    const ctor = (browser as (Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }) | undefined)?.AudioContext ?? (browser as (Window & { webkitAudioContext?: typeof AudioContext }) | undefined)?.webkitAudioContext;
    if (!options.createContext && !ctor) return false;
    context = options.createContext ? options.createContext() : new ctor!();
    const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 3; compressor.attack.value = .005; compressor.release.value = .2; compressor.connect(context.destination); nodes.add(compressor);
    master = gain(settings.masterVolume, compressor); music = gain(proceduralMusic ? settings.musicVolume : 0, master); ambience = gain(settings.ambienceVolume, master); effects = gain(settings.effectsVolume, master);
    windFilter = context.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 650; nodes.add(windFilter); windGain = gain(.025, ambience); windFilter.connect(windGain);
    rainFilter = context.createBiquadFilter(); rainFilter.type = 'highpass'; rainFilter.frequency.value = 850; nodes.add(rainFilter); rainGain = gain(environment.rain * .065, ambience); rainFilter.connect(rainGain);
    windBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 4), context.sampleRate);
    shortBuffer = context.createBuffer(1, Math.ceil(context.sampleRate), context.sampleRate);
    for (const buffer of [windBuffer, shortBuffer]) { const data = buffer.getChannelData(0); let previous = 0; for (let i = 0; i < data.length; i++) { const white = random() * 2 - 1; previous = (previous + white * .035) / 1.035; data[i] = buffer === windBuffer ? previous * 3.6 : white; } }
    return true;
  }
  const api: JourneyAudio = {
    get unlocked() { return activated && !destroyed; },
    async unlock() {
      if (destroyed) return false;
      try {
        if (activated && timer && context?.state === 'running') return true;
        if (!context && !setup()) return false;
        activated = true;
        if (paused) return true;
        await context!.resume();
        if (destroyed || paused) return !destroyed;
        // UI gestures can race while the context resumes. Only the owner that
        // starts the scheduler assigns its initial deadlines.
        if (!timer) {
          nextMusic = Math.max(nextMusic, at() + .35); nextBird = Math.max(nextBird, at() + 3); nextBell = Math.max(nextBell, at() + 6);
        }
        startBreeze(); startScheduler(); return context!.state === 'running';
      } catch { activated = false; return false; }
    },
    setMix(next) { settings = { masterVolume: limit(next.masterVolume), musicVolume: limit(next.musicVolume), ambienceVolume: limit(next.ambienceVolume), effectsVolume: limit(next.effectsVolume) }; if (!context || destroyed) return; smooth(master.gain, settings.masterVolume); smooth(music.gain, proceduralMusic ? settings.musicVolume : 0); smooth(ambience.gain, settings.ambienceVolume); smooth(effects.gain, settings.effectsVolume); },
    setMusicEnabled(enabled) { if (proceduralMusic === enabled || destroyed) return; proceduralMusic = enabled; if (context) { smooth(music.gain, enabled ? settings.musicVolume : 0, .4); if (enabled) nextMusic = at() + .5; } },
    setRegion(next) { if (region === next) return; region = next; if (context) { smooth(windFilter.frequency, region === 'forest' ? 900 : region === 'ridge' ? 1500 : 550, 1.5); nextBird = at() + 3 + random() * 4; nextBell = at() + 2 + random() * 4; } },
    update(frame) {
      if (frame.region) api.setRegion(frame.region);
      moving = frame.moving ?? moving; surface = frame.surface ?? surface; windmill = frame.windmill ?? windmill; zipline = frame.zipline ?? zipline;
      if (frame.distanceWalked !== undefined) {
        if (frame.distanceWalked < lastDistance || !moving || paused || !activated) lastDistance = frame.distanceWalked;
        if (frame.distanceWalked - lastDistance >= .92) { lastDistance = frame.distanceWalked; if (context?.state === 'running') step(); }
      }
    },
    setEnvironment(frame) {
      if (destroyed) return;
      environment = { weather: frame.weather, rain: limit(frame.rain), wind: limit(frame.wind) };
      if (context) { smooth(rainGain.gain, environment.rain * .065, .35); schedule(); }
    },
    play(event) {
      if (!context || !activated || paused || destroyed || context.state !== 'running') return;
      const t = at();
      switch (resolveJourneySound(event)) {
        case 'shutter': noise(t, .035, .18, 4200, effects, 'highpass'); noise(t + .08, .045, .13, 2100, effects); break;
        case 'postmark': noise(t, .055, .19, 700, effects); tone(40, t, .09, .12, effects); noise(t + .11, .06, .035, 2500, effects); break;
        case 'page': noise(t, .22, .025, 2200, effects, 'bandpass'); break;
        case 'timer': tone(81, t, .12, .035, effects); break;
        case 'camera-open': noise(t, .06, .04, 1800, effects, 'bandpass'); tone(69, t, .08, .022, effects, 'triangle'); break;
        case 'camera-close': noise(t, .05, .032, 1200, effects, 'bandpass'); tone(62, t, .07, .018, effects, 'triangle'); break;
        case 'courtyard-bell': courtyardBell(t); break;
        case 'night:spark':
          noise(t,.65,.032,2700,effects,'bandpass');
          [0,.11,.26,.42].forEach(offset=>noise(t+offset,.034,.039,3800,effects,'highpass'));
          break;
        case 'night:launch':
          noise(t,.21,.16,390,effects);
          tone(62,t+.05,.58,.018,effects,'sine');
          noise(t+.14,.75,.029,1700,effects,'bandpass');
          break;
        case 'night:burst':
          noise(t,.6,.26,310,effects);
          tone(38,t,.36,.14,effects,'sine');
          [0,.095,.17,.30,.49,.72].forEach((offset,i)=>noise(t+.06+offset,.07,.12/(1+i*.46),3000-i*195,effects,'bandpass'));
          break;
        case 'night:fish': bell(t,79,.034);bell(t+.23,86,.024);break;
        case 'footstep': step(); break;
        case 'bird': bird(); break;
        case 'windbell': bell(); break;
        case 'wind-song': windSong(t); break;
        case 'discovery': [74, 78, 81].forEach((note, i) => tone(note, t + i * .14, 1.4, .055, effects)); break;
        case 'memory-unlocked':
          noise(t, .32, .035, 1800, effects, 'bandpass');
          [74, 78, 81, 86].forEach((note, i) => tone(note, t + .12 + i * .19, 2.1, .055, effects));
          break;
        case 'photo:matched': [62, 69, 74, 78].forEach((note, i) => tone(note, t + i * .2, 2.6, .07, effects)); break;
        case 'world:windmill-awaken': windmill = true; noise(t, 1.4, .025, 320, effects); bell(t + .4, 81, .09); bell(t + 1.1, 86, .055); break;
        case 'world:bridge-lowering': noise(t, 2.7, .05, 480, effects); [0, .43, .91, 1.52, 2.13].forEach(d => tone(36 + d * 3, t + d, .22, .035, effects, 'triangle')); break;
        case 'world:bridge-lowered': noise(t, .26, .12, 340, effects); tone(35, t, .5, .08, effects); break;
        case 'world:gate-opened':
          // One actual gate transition: wooden axle, three ratchet turns, then a latch.
          noise(t, .75, .028, 620, effects, 'bandpass');
          [.05, .23, .43].forEach((offset, i) => {
            noise(t + offset, .045, .04, 1600, effects, 'bandpass');
            tone(48 + i, t + offset, .16, .018, effects, 'triangle');
          });
          noise(t + .82, .11, .075, 900, effects); tone(45, t + .82, .2, .03, effects, 'triangle');
          break;
        case 'ending':
          api.play('postmark');
          if (proceduralMusic) { [62, 66, 69, 74, 78, 81, 86].forEach((note, i) => tone(note, t + .8 + i * .42, 3.8, .06, music)); nextMusic = t + 16; }
          break;
      }
    },
    pause() { if (paused || destroyed) return; paused = true; if (timer) clearInterval(timer); timer = undefined; stopBreeze(); clearScheduledVoices(); if (context?.state === 'running') void context.suspend().catch(() => undefined); },
    resume() { if (!paused || destroyed) return; paused = false; nextMusic = at() + .8; nextBird = at() + 4; if (activated) void api.unlock(); },
    destroy() { if (destroyed) return; destroyed = true; if (timer) clearInterval(timer); timer = undefined; stopBreeze(); clearScheduledVoices(); for (const node of nodes) node.disconnect(); nodes.clear(); if (context && context.state !== 'closed') void context.close().catch(() => undefined); },
  };
  return api;
}
