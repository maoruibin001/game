import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJourneyAudio, resolveJourneySound } from '../audio';
import { createJourney, reduceJourney, restoreJourney, serializeJourney } from '../../journey/index';
import type { JourneyEvent, Pose } from '../../journey/types';

// Scheduling and graph routing only. This fake does not render or audition audio.
class Param {
  value = 0;
  events: { kind: string; value?: number; time: number }[] = [];
  cancelScheduledValues(time: number) { this.events.push({ kind: 'cancel', time }); }
  setTargetAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'target', value, time }); }
  setValueAtTime(value: number, time: number) { this.value = value; this.events.push({ kind: 'set', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ kind: 'ramp', value, time }); }
}
class Node {
  outputs: Node[] = [];
  starts: number[][] = [];
  stops: number[][] = [];
  gain = new Param(); frequency = new Param(); pan = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  type = ''; buffer?: unknown; loop = false; onended?: () => void;
  constructor(readonly kind: string) {}
  connect(other: Node) { this.outputs.push(other); }
  disconnect() {}
  start(...args: number[]) { this.starts.push(args); }
  stop(...args: number[]) { this.stops.push(args); }
}
function context() {
  const nodes: Node[] = [];
  const node = (kind: string) => { const value = new Node(kind); nodes.push(value); return value; };
  return {
    nodes, currentTime: 100, sampleRate: 1000, state: 'running', destination: node('destination'),
    createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
    createDynamicsCompressor: () => node('compressor'), createStereoPanner: () => node('pan'),
    createOscillator: () => node('oscillator'), createBufferSource: () => node('noise'),
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({ duration: length / sampleRate, getChannelData: () => new Float32Array(length) }),
    async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; }, async close() { this.state = 'closed'; },
  };
}
const town: Pose = { position: [148,24,11], yaw: 0, pitch: 0, area: 'town' };
const sources = (nodes: Node[]) => nodes.filter(node => node.kind === 'noise' || node.kind === 'oscillator');
afterEach(() => vi.useRealTimers());

describe('woodscreen crank audio', () => {
  it('plays one short effects-bus cue only when the real interaction first opens the gate', async () => {
    vi.useFakeTimers();
    const ctx = context(), audio = createJourneyAudio({ proceduralMusic: false, createContext: () => ctx as unknown as AudioContext });
    try {
      expect(await audio.unlock()).toBe(true);
      audio.setMix({ masterVolume: .51, musicVolume: 0, ambienceVolume: 0, effectsVolume: .37 });
      const effects = ctx.nodes.find(node => node.kind === 'gain' && node.gain.events.some(event => event.kind === 'target' && event.value === .37))!;
      expect(effects).toBeDefined();
      let state = reduceJourney(createJourney(town), { type: 'start' }).state;
      const deliver = (events: JourneyEvent[]) => { for (const event of events) audio.play(event); };
      let before = ctx.nodes.length;
      deliver(reduceJourney(state, { type: 'interact', id: 'town-lever' }).events);
      expect(ctx.nodes.length).toBe(before); // Remote E does not operate or sound the crank.
      state = reduceJourney(state, { type: 'set-context', nearby: 'town-lever' }).state;
      const opened = reduceJourney(state, { type: 'interact', id: 'town-lever' });
      expect(opened.events.filter(event => event.type === 'world:gate-opened')).toHaveLength(1);
      deliver(opened.events);
      const cue = sources(ctx.nodes.slice(before));
      expect(cue).toHaveLength(9); // Axle noise + three noise/tone turns + noise/tone latch.
      expect(cue.filter(node => node.kind === 'noise')).toHaveLength(5);
      expect(cue.filter(node => node.kind === 'oscillator')).toHaveLength(4);
      for (const voice of cue) {
        const envelope = voice.outputs[0]!.outputs[0]!;
        expect(envelope.outputs[0]).toBe(effects);
        expect(voice.starts).toHaveLength(1);
        expect(voice.starts[0]![0]).toBeGreaterThanOrEqual(100);
        expect(voice.stops[0]![0]).toBeLessThanOrEqual(101.051);
      }
      const latch = cue.filter(node => node.starts[0]![0] > 100.8);
      expect(latch).toHaveLength(2);
      before = ctx.nodes.length;
      deliver(reduceJourney(opened.state, { type: 'interact', id: 'town-lever' }).events);
      deliver(reduceJourney(opened.state, { type: 'tick', deltaSeconds: 1 }).events);
      expect(ctx.nodes.length).toBe(before); // Holding/repeating E or a render tick cannot replay it.
      const restored = reduceJourney(restoreJourney(serializeJourney(opened.state), town).state, { type: 'start' });
      expect(restored.events.some(event => event.type === 'world:gate-opened')).toBe(false);
      expect(restored.state.durable.gateOpened).toBe(true);
    } finally { audio.destroy(); }
  });

  it('keeps a single shutter and unrelated P1 mappings silent', async () => {
    vi.useFakeTimers();
    const ctx = context(), audio = createJourneyAudio({ proceduralMusic: false, createContext: () => ctx as unknown as AudioContext });
    try {
      await audio.unlock(); const before = ctx.nodes.length;
      audio.play('shutter'); audio.play({ type: 'photo:captured' }); audio.play({ type: 'photo:timer-ready' });
      expect(sources(ctx.nodes.slice(before))).toHaveLength(2);
      for (const event of ['ride:arrived', 'ride:cancelled', 'album:full', 'photography:changed'] as const) expect(resolveJourneySound({ type: event })).toBeNull();
      expect(resolveJourneySound({ type: 'camera:opened' })).toBe('camera-open');
      expect(resolveJourneySound({ type: 'camera:closed' })).toBe('camera-close');
      expect(resolveJourneySound({ type: 'discovery:found', discovery: 'last-letter' })).toBe('courtyard-bell');
      expect(resolveJourneySound({ type: 'world:gate-opened' })).toBe('world:gate-opened');
    } finally { audio.destroy(); }
  });

  it('keeps the first bird and wind chime on schedule during ordinary repeated gestures',async()=>{
    vi.useFakeTimers();
    const ctx=context(),audio=createJourneyAudio({proceduralMusic:false,createContext:()=>ctx as unknown as AudioContext});
    const sky={weather:'morning',rain:0,wind:.24} as const;
    try{
      await audio.unlock();
      for(const time of [101,102,103.2]){
        ctx.currentTime=time;await audio.unlock();audio.setEnvironment(sky);
      }
      const first=ctx.nodes.filter(node=>node.kind==='oscillator');
      expect(first.some(node=>node.frequency.events.some(event=>event.kind==='set'&&event.value!>1800))).toBe(true);
      audio.setRegion('forest');
      for(let second=1;second<=7;second++){
        ctx.currentTime=103.2+second;await audio.unlock();audio.setEnvironment(sky);
      }
      expect(ctx.nodes.filter(node=>node.kind==='oscillator'&&node.frequency.value>850&&node.frequency.value<1500).length).toBeGreaterThan(0);
    }finally{audio.destroy();}
  });

  it('does not schedule a gate sound before unlock, while paused, or after disposal', async () => {
    vi.useFakeTimers();
    const ctx = context(), audio = createJourneyAudio({ proceduralMusic: false, createContext: () => ctx as unknown as AudioContext });
    const event = { type: 'world:gate-opened' } as const;
    audio.play(event); expect(ctx.nodes).toHaveLength(1);
    await audio.unlock(); audio.play(event);
    const active = sources(ctx.nodes).filter(node => node.stops.length > 0);
    audio.pause();
    expect(active.every(node => node.stops.some(args => args.length === 0))).toBe(true);
    const before = ctx.nodes.length;
    audio.play(event); expect(ctx.nodes.length).toBe(before);
    audio.destroy(); audio.play(event); expect(ctx.nodes.length).toBe(before);
  });
});
