import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@forgeax/engine/app', () => ({ FORGEAX_FRAME_COMPLETED_EVENT: 'completed', FORGEAX_FRAME_SUBMITTED_EVENT: 'submitted' }));
import { capturePostcard, photoFrameProgress, PHOTO_FRAME_TIMEOUT_MS, type PhotoCaptureProgress } from '../photo-capture.ts';

interface Fact { frameId: number; deviceGeneration: number; worldIdentity: string; presentation?: string }
const fact = (frameId: number, extra: Partial<Fact> = {}): Fact => ({ frameId, deviceGeneration: 1, worldIdentity: 'valley', ...extra });
function harness(retained = true) {
  const canvas = Object.assign(new EventTarget(), { width: 1920, height: 1080,
    forgeaxFrameProgress: retained ? { submitted: fact(15), completed: fact(13, { presentation: 'ready' }) } : {} }) as unknown as HTMLCanvasElement;
  let empty = false;
  const drawImage = vi.fn();
  const blob = new Blob(['actual image bytes'], { type: 'image/jpeg' });
  const context = { drawImage, getImageData: () => {
    const data = new Uint8ClampedArray(128); data[3] = 255; data[67] = 255;
    if (!empty) data[64] = data[65] = data[66] = 200;
    return { data };
  } };
  const copies: HTMLCanvasElement[] = [];
  const document = { defaultView: { requestAnimationFrame: vi.fn(() => { throw new Error('copy must not cross another RAF'); }) }, createElement: () => {
    const copy = { width: 0, height: 0, getContext: () => context,
      toBlob: (callback: (value: Blob) => void) => callback(blob), toDataURL: () => 'data:image/jpeg;base64,c2NlbmU=' } as unknown as HTMLCanvasElement;
    copies.push(copy); return copy;
  } } as unknown as Document;
  const emit = (type: 'submitted' | 'completed', frame: Fact) => {
    canvas.forgeaxFrameProgress = { ...canvas.forgeaxFrameProgress, [type]: frame } as typeof canvas.forgeaxFrameProgress;
    canvas.dispatchEvent(new CustomEvent(type, { detail: frame }));
  };
  const progress: PhotoCaptureProgress[] = [];
  const abort = new AbortController();
  return { canvas, document, drawImage, copies, emit, abort, progress, empty: (value: boolean) => { empty = value; },
    capture: () => capturePostcard(canvas, document, abort.signal, update => progress.push(update)) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('postcard capture at the public completed-frame boundary', () => {
  it('ignores old in-flight and pending frames, then copies the first new ready frame synchronously at native resolution', async () => {
    const h = harness(), photo = h.capture();
    h.emit('completed', fact(14, { presentation: 'ready' }));
    h.emit('completed', fact(15, { presentation: 'ready' }));
    h.emit('completed', fact(16, { presentation: 'pending' }));
    expect(h.drawImage).not.toHaveBeenCalled();
    h.emit('completed', fact(17, { presentation: 'ready' }));
    expect(h.drawImage).toHaveBeenCalledExactlyOnceWith(h.canvas, 0, 0, 1920, 1080);
    const result = await photo;
    expect(result).toMatchObject({ width: 1920, height: 1080, original: expect.any(Blob) });
    expect(result.original.type).toBe('image/jpeg');
    expect(h.progress.at(-1)).toMatchObject({ phase: 'captured', fence: { frameId: 15 }, completed: { frameId: 17 }, readyFrames: 1 });
    expect(h.document.defaultView!.requestAnimationFrame).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drains source publications admitted before the shutter even if they reach GPU submission later', async () => {
    const h = harness();
    const photo = capturePostcard(h.canvas, h.document, h.abort.signal, undefined, { frameId: 18, worldIdentity: 'valley' });
    for (const frameId of [16, 17, 18]) {
      h.emit('submitted', fact(frameId)); h.emit('completed', fact(frameId, { presentation: 'ready' }));
    }
    expect(h.drawImage).not.toHaveBeenCalled();
    h.emit('submitted', fact(19)); h.emit('completed', fact(19, { presentation: 'ready' }));
    await expect(photo).resolves.toMatchObject({ width: 1920 });
  });

  it.each([
    { source:[1280,600], output:[1056,594], origin:[112,3] },
    { source:[600,1000], output:[592,333], origin:[4,333] },
  ])('copies only the native pixels inside the 16:9 finder for $source',async({source,output,origin})=>{
    const h=harness();
    [h.canvas.width,h.canvas.height]=source as [number,number];
    const photograph=capturePostcard(h.canvas,h.document,h.abort.signal,undefined,undefined,'wide');
    h.emit('completed',fact(17,{presentation:'ready'}));
    expect(h.drawImage).toHaveBeenNthCalledWith(1,h.canvas,...origin,...output,0,0,...output);
    await expect(photograph).resolves.toMatchObject({width:output[0],height:output[1]});
  });

  it('does not save a crop from a different in-flight window size',async()=>{
    const h=harness();
    const photograph=capturePostcard(h.canvas,h.document,h.abort.signal,undefined,undefined,'wide');
    h.canvas.height=600;
    h.emit('completed',fact(17,{presentation:'ready'}));
    await expect(photograph).rejects.toThrow('窗口尺寸已改变');
    expect(h.drawImage).not.toHaveBeenCalled();
  });

  it.each([16, 2000])('captures eight distinct frozen exposures when completed frames take %i ms', async interval => {
    const h = harness();
    for (let n = 0; n < 8; n++) {
      const photo = h.capture();
      const id = 16 + n;
      h.emit('submitted', fact(id));
      await vi.advanceTimersByTimeAsync(interval);
      h.emit('completed', fact(id, { presentation: 'ready' }));
      expect((await photo).original.size).toBeGreaterThan(0);
      expect(h.progress.at(-1)).toMatchObject({ phase: 'captured', completed: { frameId: id } });
    }
    expect(h.progress.filter(p => p.phase === 'captured')).toHaveLength(8);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not save an empty surface and retries at the next completed picture', async () => {
    const h = harness(); h.empty(true);
    const photo = h.capture(); h.emit('completed', fact(16, { presentation: 'ready' }));
    expect(h.progress.at(-1)).toMatchObject({ phase: 'waiting-frame', emptyFrames: 1 });
    h.empty(false); h.emit('completed', fact(17, { presentation: 'ready' }));
    await photo;
    expect(h.progress.at(-1)).toMatchObject({ phase: 'captured', emptyFrames: 1, readyFrames: 2 });
  });

  it('requires an observed new submission if no retained progress exists after canvas initialization', async () => {
    const h = harness(false), photo = h.capture();
    h.emit('completed', fact(7, { presentation: 'ready' }));
    expect(h.drawImage).not.toHaveBeenCalled();
    h.emit('submitted', fact(8)); h.emit('completed', fact(8, { presentation: 'ready' }));
    await expect(photo).resolves.toMatchObject({ width: 1920 });
  });

  it('fails closed on renderer generation changes without accepting another world picture', async () => {
    const h = harness(), photo = h.capture();
    h.emit('completed', fact(100, { deviceGeneration: 2, presentation: 'ready' }));
    await expect(photo).rejects.toThrow('画面已重建');
    expect(h.drawImage).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a stopped/pending renderer failure distinct from a successfully saved photograph', async () => {
    const h = harness(), photo = h.capture();
    const failed = expect(photo).rejects.toThrow('没有收到本次快门的新画面');
    h.emit('completed', fact(16, { presentation: 'pending' }));
    await vi.advanceTimersByTimeAsync(PHOTO_FRAME_TIMEOUT_MS);
    await failed;
    expect(h.progress.at(-1)?.phase).toBe('failed'); expect(h.drawImage).not.toHaveBeenCalled();
    h.emit('completed', fact(17, { presentation: 'ready' }));
    expect(h.drawImage).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up cancelled captures and lets a later request succeed independently', async () => {
    const h = harness(), photo = h.capture();
    h.abort.abort(); await expect(photo).rejects.toThrow('拍摄已取消');
    h.emit('completed', fact(16, { presentation: 'ready' }));
    expect(h.drawImage).not.toHaveBeenCalled(); expect(h.progress.at(-1)?.phase).toBe('cancelled');
    const next = capturePostcard(h.canvas, h.document, new AbortController().signal);
    h.emit('completed', fact(17, { presentation: 'ready' }));
    await expect(next).resolves.toMatchObject({ width: 1920 }); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not treat missing or malformed frame identities as proof of a new picture', async () => {
    const h = harness(false), photo = h.capture();
    const failed = expect(photo).rejects.toThrow('没有收到本次快门的新画面');
    h.canvas.dispatchEvent(new CustomEvent('completed', { detail: { presentation: 'ready' } }));
    h.canvas.forgeaxFrameProgress = { completed: { frameId: NaN, deviceGeneration: 1, presentation: 'ready' } };
    expect(photoFrameProgress(h.canvas).completed).toBeUndefined();
    await vi.advanceTimersByTimeAsync(PHOTO_FRAME_TIMEOUT_MS); await failed;
    expect(h.drawImage).not.toHaveBeenCalled();
  });
});
