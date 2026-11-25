import { FORGEAX_FRAME_COMPLETED_EVENT, FORGEAX_FRAME_SUBMITTED_EVENT } from '@forgeax/engine/app';
import { photoFrameBounds, type PhotoFraming } from '../shared/photography-contract.ts';

export interface CapturedPhotograph {
  thumbnail: string;
  original: Blob;
  width: number;
  height: number;
}

export interface PhotoFrameFact {
  frameId: number;
  deviceGeneration: number;
  worldIdentity?: string;
  presentation?: string;
  pendingReason?: string;
}
export interface PhotoCaptureProgress {
  phase: 'waiting-frame' | 'copying' | 'encoding' | 'captured' | 'failed' | 'cancelled';
  elapsedMs: number;
  fence?: PhotoFrameFact;
  completed?: PhotoFrameFact;
  readyFrames: number;
  emptyFrames: number;
  error?: string;
}
export const PHOTO_FRAME_TIMEOUT_MS = 10000;

type PhotoCanvas = HTMLCanvasElement | OffscreenCanvas;
function frameFact(value: unknown): PhotoFrameFact | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, unknown>;
  if (!Number.isSafeInteger(v.frameId) || (v.frameId as number) < 0 || !Number.isSafeInteger(v.deviceGeneration)) return;
  const pending = v.presentationPendingReason as { code?: unknown } | undefined;
  return { frameId: v.frameId as number, deviceGeneration: v.deviceGeneration as number,
    ...(typeof v.worldIdentity === 'string' ? { worldIdentity: v.worldIdentity } : {}),
    ...(typeof v.presentation === 'string' ? { presentation: v.presentation } : {}),
    ...(typeof pending?.code === 'string' ? { pendingReason: pending.code } : {}) };
}
/** Small read-only projection of the public App-owned frame progress. */
export function photoFrameProgress(canvas: PhotoCanvas) {
  const progress = (canvas as PhotoCanvas & { forgeaxFrameProgress?: { submitted?: unknown; completed?: unknown } }).forgeaxFrameProgress;
  return { submitted: frameFact(progress?.submitted), completed: frameFact(progress?.completed) };
}
function hasImage(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let minimum = 255, maximum = 0, alpha = 0;
  for (let i = 0; i < pixels.length; i += 64) {
    const luma = (pixels[i]! * 3 + pixels[i + 1]! * 6 + pixels[i + 2]!) / 10;
    minimum = Math.min(minimum, luma); maximum = Math.max(maximum, luma); alpha += pixels[i + 3]!;
  }
  return maximum - minimum >= 2 && alpha !== 0;
}

/** Both outputs use one completed native-resolution frame. DOM HUD is a sibling,
 * never part of this canvas. A frame-id fence drains older in-flight work without
 * guessing that four future completed pictures are needed. */
export async function capturePostcard(
  canvas: PhotoCanvas,
  ownerDocument: Document,
  signal: AbortSignal,
  onProgress?: (progress: PhotoCaptureProgress) => void,
  sourceFrame?: { frameId: number; worldIdentity: string },
  framing?: PhotoFraming,
): Promise<CapturedPhotograph> {
  const started = performance.now();
  const {width:initialWidth,height:initialHeight}=canvas;
  const initial = photoFrameProgress(canvas);
  let fence = initial.submitted ?? initial.completed;
  // In Worker mode the source publication queue can be ahead of GPU submission.
  // The frontend supplies App.execution.report().frame.submitted, so a queued
  // pre-shutter source frame cannot pass merely by reaching the GPU later.
  if (sourceFrame && fence) fence = { ...fence, frameId: Math.max(fence.frameId, sourceFrame.frameId) };
  let completed: PhotoFrameFact | undefined;
  let readyFrames = 0, emptyFrames = 0;
  const report = (phase: PhotoCaptureProgress['phase'], error?: string) => onProgress?.({
    phase, elapsedMs: Math.round(performance.now() - started),
    ...(fence ? { fence: { ...fence } } : {}), ...(completed ? { completed: { ...completed } } : {}),
    readyFrames, emptyFrames, ...(error ? { error } : {}),
  });
  try {
  const image = await new Promise<HTMLCanvasElement>((resolve, reject) => {
    let settled = false;
    const dispose = () => {
      canvas.removeEventListener(FORGEAX_FRAME_COMPLETED_EVENT, complete);
      canvas.removeEventListener(FORGEAX_FRAME_SUBMITTED_EVENT, submitted);
      signal.removeEventListener('abort', abort); clearTimeout(timer);
    };
    const fail = (message: string) => { if (settled) return; settled = true; dispose(); reject(new Error(message)); };
    const sameSource = (frame: PhotoFrameFact) => (!sourceFrame || frame.worldIdentity === sourceFrame.worldIdentity) && (!fence || (frame.deviceGeneration === fence.deviceGeneration && frame.worldIdentity === fence.worldIdentity));
    // A newly attached/replaced canvas may not yet have a retained snapshot.
    // Only a real submission observed after this request can establish its fence.
    const submitted = (event: Event) => {
      const frame = frameFact((event as CustomEvent).detail);
      if (!frame) return;
      if (!sameSource(frame)) { fail('渲染画面已重建，请重新取景。'); return; }
      fence ??= { ...frame, frameId: Math.max(sourceFrame?.frameId ?? -1, frame.frameId - 1) };
      report('waiting-frame');
    };
    const complete = (event: Event) => {
      const frame = frameFact((event as CustomEvent).detail);
      if (!frame || settled) return;
      completed = frame;
      if (!sameSource(frame)) { fail('渲染画面已重建，请重新取景。'); return; }
      if (!fence || frame.frameId <= fence.frameId || frame.presentation !== 'ready') { report('waiting-frame'); return; }
      readyFrames++;
      try {
        // Copy in the completion callback, before another browser frame can
        // recycle/clear the WebGPU presentation surface. Never await rAF here.
        report('copying');
        if (canvas.width < 1 || canvas.height < 1) { emptyFrames++; report('waiting-frame'); return; }
        if (framing==='wide'&&(initialWidth!==canvas.width||initialHeight!==canvas.height)) {
          fail('窗口尺寸已改变，请确认画框后再拍一次。'); return;
        }
        const copy = ownerDocument.createElement('canvas');
        const {x,y,width,height}=photoFrameBounds(canvas.width,canvas.height,framing);
        copy.width = width; copy.height = height;
        const context = copy.getContext('2d', { willReadFrequently: true });
        if (!context) { fail('无法显影照片，请检查浏览器画布支持。'); return; }
        if(width===canvas.width&&height===canvas.height)context.drawImage(canvas,0,0,width,height);
        else context.drawImage(canvas,x,y,width,height,0,0,width,height);
        if (!hasImage(context, copy.width, copy.height)) { emptyFrames++; report('waiting-frame'); return; }
        settled = true; dispose(); resolve(copy);
      } catch (cause) { fail(cause instanceof Error ? cause.message : '照片画面读取失败，请重新取景。'); }
    };
    const abort = () => fail('拍摄已取消。');
    const timer = setTimeout(() => fail(emptyFrames > 0 ? '照片没有读到实际风景，请重新取景。'
      : '还没有收到本次快门的新画面，请保持游戏窗口可见后再拍一次。'), PHOTO_FRAME_TIMEOUT_MS);
    canvas.addEventListener(FORGEAX_FRAME_SUBMITTED_EVENT, submitted);
    canvas.addEventListener(FORGEAX_FRAME_COMPLETED_EVENT, complete);
    signal.addEventListener('abort', abort, { once: true });
    report('waiting-frame');
    if (signal.aborted) abort();
  });
  if (signal.aborted) throw new Error('拍摄已取消。');
  report('encoding');
  const original = await new Promise<Blob>((resolve, reject) => {
    image.toBlob(blob => blob ? resolve(blob) : reject(new Error('原照片编码失败，请重新拍摄。')), 'image/jpeg', .94);
  });
  if (signal.aborted) throw new Error('拍摄已取消。');
  if (original.type !== 'image/jpeg' || original.size === 0) throw new Error('原照片未能正确编码。');
  const preview = ownerDocument.createElement('canvas');
  const aspect = image.width / image.height;
  preview.width = Math.min(480, image.width); preview.height = Math.max(1, Math.round(preview.width / aspect));
  const small = preview.getContext('2d');
  if (!small) throw new Error('无法生成照片预览。');
  small.drawImage(image, 0, 0, preview.width, preview.height);
  let quality = .86;
  let result = preview.toDataURL('image/jpeg', quality);
  while (result.length > 80000 && preview.width > 240) {
    preview.width = Math.max(240, Math.round(preview.width * .8)); preview.height = Math.max(1, Math.round(preview.width / aspect));
    small.drawImage(image, 0, 0, preview.width, preview.height);
    result = preview.toDataURL('image/jpeg', quality);
  }
  while (result.length > 80000 && quality > .3) { quality -= .08; result = preview.toDataURL('image/jpeg', quality); }
  if (result.length > 80000) throw new Error('照片预览过大，尚未保存。');
  report('captured');
  return { thumbnail: result, original, width: image.width, height: image.height };
  } catch (cause) {
    report(signal.aborted ? 'cancelled' : 'failed', cause instanceof Error ? cause.message : '照片显影失败。');
    throw cause;
  }
}
