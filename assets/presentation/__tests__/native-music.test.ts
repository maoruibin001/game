import { describe, it, expect, vi, afterEach } from 'vitest';
import type { GameHost } from '@forgeax/engine/app';
import { AssetRegistry } from '@forgeax/engine/assets-runtime';
import { audioContribution } from '@forgeax/engine/audio';
import type { AudioClipAsset } from '@forgeax/engine/types';
import { createNativeJourneyMusic } from '../native-music';
const makeHost = () => {
  const resume = vi.fn(async () => undefined);
  const audio = { play: vi.fn(), stop: vi.fn(), setPaused: vi.fn(), setVolume: vi.fn(), setBusVolume: vi.fn(), getState: vi.fn(() => ({ contextState: 'running', lastError: null })), getPlaybackPosition: vi.fn(() => 1), musicOutput: vi.fn(() => ({ context: { resume } })), destroy: vi.fn() };
  const decoderDispose = vi.fn();
  const assets = { installDecoder: vi.fn(() => ({ kind: 'audio', dispose: decoderDispose })), load: vi.fn(async (guid: string, _kind?: unknown, _options?: { signal: AbortSignal }) => ({ ok: true, value: { guid } })), read: vi.fn(() => ({ ok: true, value: { data: new Uint8Array(0) } })), release: vi.fn() };
  return { host: { audio, assets } as unknown as GameHost, audio, assets, resume, decoderDispose };
};
const frame = { region: 'post' as const, ending: false, paused: false, settings: { masterVolume: .8, musicVolume: .5 } };
afterEach(() => vi.useRealTimers());
describe('native journey music ownership', () => {
  it('loads official assets and waits for a trusted gesture before playback', async () => {
    const {host,audio,assets,resume,decoderDispose}=makeHost(); const music=createNativeJourneyMusic(host); music.update(frame);
    expect(await music.ready).toBe(true); expect(assets.load).toHaveBeenCalledTimes(3); expect(audio.play).not.toHaveBeenCalled();
    expect(assets.installDecoder).toHaveBeenCalledWith(audioContribution.kind,audioContribution.decoder);
    expect(assets.installDecoder.mock.invocationCallOrder[0]).toBeLessThan(assets.load.mock.invocationCallOrder[0]!);
    expect(assets.load.mock.calls.every(call=>call[1]===audioContribution.kind && call[2]?.signal.aborted===false)).toBe(true);
    await music.unlock(); expect(resume).toHaveBeenCalledOnce(); expect(audio.play).toHaveBeenCalledOnce(); expect(audio.setBusVolume).toHaveBeenLastCalledWith('music',.4);
    music.destroy(); expect(assets.release).toHaveBeenCalledTimes(3); expect(audio.destroy).not.toHaveBeenCalled();
    expect(decoderDispose).toHaveBeenCalledOnce(); expect(assets.load.mock.calls[0]![2]!.signal.aborted).toBe(true);
    expect(decoderDispose.mock.invocationCallOrder[0]).toBeGreaterThan(assets.release.mock.invocationCallOrder.at(-1)!);
  });
  it('pauses the native sources and plays the outro once for a stable ending', async () => {
    vi.useFakeTimers(); const {host,audio}=makeHost(); const music=createNativeJourneyMusic(host); await music.ready; music.update(frame); await music.unlock();
    music.update({...frame,region:'ridge'}); vi.advanceTimersByTime(1600); expect(audio.play).toHaveBeenCalledTimes(2); expect(audio.stop).toHaveBeenCalled();
    music.update({...frame,ending:true}); music.update({...frame,ending:true}); expect(audio.play).toHaveBeenCalledTimes(3);
    music.update({...frame,ending:true,paused:true}); expect(audio.setPaused).toHaveBeenLastCalledWith(0x5a100003,true);
    music.destroy(); music.destroy(); expect(audio.destroy).not.toHaveBeenCalled();
  });
  it('reports asset failures and never starts a false successful source', async () => {
    const {host,assets,audio,decoderDispose}=makeHost(); assets.load.mockImplementation(async()=>({ok:false,error:{code:'not-found'}}) as never);
    const report=vi.fn(); const music=createNativeJourneyMusic(host,{onStatus:report}); expect(await music.ready).toBe(false); expect(music.state().phase).toBe('failed');
    expect(music.state().code).toBe('not-found'); expect(await music.unlock()).toBe(false); expect(audio.play).not.toHaveBeenCalled(); expect(report).toHaveBeenCalled(); expect(decoderDispose).toHaveBeenCalledOnce(); music.destroy(); expect(decoderDispose).toHaveBeenCalledOnce();
  });
  it('releases a late asynchronous load after disposal without adopting it', async () => {
    const {host,assets,audio,decoderDispose}=makeHost(); let resolve!: (value: unknown)=>void;
    const pending=new Promise(r=>{resolve=r}); assets.load.mockImplementation(async()=>await pending as never);
    const music=createNativeJourneyMusic(host); music.destroy(); resolve({ok:true,value:{guid:'late'}});
    expect(await music.ready).toBe(false); expect(assets.release).toHaveBeenCalledTimes(3); expect(audio.play).not.toHaveBeenCalled(); expect(decoderDispose).toHaveBeenCalledOnce();
  });
  it('preserves an installation error and never attempts music loads without an owner', async () => {
    const {host,assets}=makeHost(); assets.installDecoder.mockImplementation(()=>{throw new TypeError('duplicate decoder kind "audio"')});
    const music=createNativeJourneyMusic(host); expect(await music.ready).toBe(false); expect(assets.load).not.toHaveBeenCalled();
    expect(music.state()).toMatchObject({phase:'failed',code:'native-music-decoder-install-failed',detail:'duplicate decoder kind "audio"'}); music.destroy();
  });
  it('uses the real 0.5 audio owner and retains another consumer lease after disposal', async () => {
    const assets=new AssetRegistry(); const {audio}=makeHost();
    const bytes=new Uint8Array(48), data=new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('RIFF'),0); data.setUint32(4,40,true); bytes.set(new TextEncoder().encode('WAVEfmt '),8);
    data.setUint32(16,16,true); data.setUint16(20,1,true); data.setUint16(22,1,true); data.setUint32(24,8000,true); data.setUint32(28,16000,true); data.setUint16(32,2,true); data.setUint16(34,16,true); bytes.set(new TextEncoder().encode('data'),36); data.setUint32(40,4,true);
    const clip:AudioClipAsset={kind:'audio',sourceKey:'test/owner-lease',mediaType:'audio/wav',bytes};
    expect(assets.create(audioContribution.kind,clip).ok).toBe(false);
    const otherLease=assets.installDecoder(audioContribution.kind,audioContribution.decoder);
    const load=vi.spyOn(assets,'load').mockImplementation(async()=>assets.create(audioContribution.kind,clip) as never);
    const music=createNativeJourneyMusic({assets,audio} as unknown as GameHost);
    expect(await music.ready).toBe(true); expect(load).toHaveBeenCalledTimes(3); music.destroy();
    const surviving=assets.create(audioContribution.kind,clip); expect(surviving.ok).toBe(true); if(surviving.ok)assets.release(surviving.value);
    otherLease.dispose(); expect(assets.create(audioContribution.kind,clip).ok).toBe(false); assets.dispose();
  });
});
