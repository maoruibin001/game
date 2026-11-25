type PauseHandler = (paused: boolean) => Promise<void>;
interface PlatformBridge {
  paused: boolean;
  requestedPause: boolean;
  ready: boolean;
  handler?: PauseHandler;
  readyListeners: Set<() => void>;
}
const key = Symbol.for('shanye-laixin.platform-bridge.v1');
const root = globalThis as unknown as Record<symbol, PlatformBridge | undefined>;
export const platformBridge: PlatformBridge = root[key] ??= {
  paused: true, requestedPause: false, ready: false, readyListeners: new Set(),
};
export async function requestPlatformPause(paused: boolean): Promise<void> {
  platformBridge.requestedPause = paused;
  if (platformBridge.handler) await platformBridge.handler(paused);
}
export function attachPlatformPause(handler: PauseHandler): () => void {
  platformBridge.handler = handler;
  if (platformBridge.requestedPause) void handler(true);
  return () => { if (platformBridge.handler === handler) delete platformBridge.handler; };
}
export function markJourneyReady(): void {
  if (platformBridge.ready) return;
  platformBridge.ready = true;
  for (const fn of platformBridge.readyListeners) fn();
}
