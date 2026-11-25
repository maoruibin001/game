import type { GameProjectionValue } from '@forgeax/engine/app';
import { JOURNEY_CHANNEL } from './protocol.ts';

type Port = Pick<MessagePort, 'addEventListener' | 'removeEventListener' | 'postMessage' | 'start'>;
/** On-demand observation over the already owned game channel. No gameplay commands,
 * polling loop, DOM access, or persistent state changes belong to this bridge. */
export function createPhotoDiagnosticsReader(port: Port, timeoutMs = 3000) {
  let sequence = 0, disposed = false;
  const pending = new Map<string, { resolve: (value: GameProjectionValue) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const receive = (event: MessageEvent) => {
    const message = event.data;
    if (!message || message.channel !== JOURNEY_CHANNEL || message.kind !== 'photo-inspection-result') return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId); clearTimeout(request.timer);
    if (message.error || !message.snapshot || typeof message.snapshot !== 'object' || Array.isArray(message.snapshot)) {
      request.reject(new Error(typeof message.error === 'string' ? message.error : '摄影观察数据无效。')); return;
    }
    request.resolve(message.snapshot as GameProjectionValue);
  };
  port.addEventListener('message', receive); port.start();
  return {
    read: (): Promise<GameProjectionValue> => new Promise((resolve, reject) => {
      if (disposed) { reject(new Error('摄影观察通道已关闭。')); return; }
      const requestId = `photo-inspect-${++sequence}`;
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('前端摄影观察超时；未改变游戏状态。')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      port.postMessage({ channel: JOURNEY_CHANNEL, kind: 'photo-inspection-request', requestId });
    }),
    dispose() {
      if (disposed) return;
      disposed = true; port.removeEventListener('message', receive);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('摄影观察通道已关闭。')); }
      pending.clear();
    },
  };
}

export function attachPhotoDiagnosticsResponder(port: Port, snapshot: () => GameProjectionValue) {
  const receive = (event: MessageEvent) => {
    const message = event.data;
    if (!message || message.channel !== JOURNEY_CHANNEL || message.kind !== 'photo-inspection-request' || typeof message.requestId !== 'string' || message.requestId.length > 64) return;
    try { port.postMessage({ channel: JOURNEY_CHANNEL, kind: 'photo-inspection-result', requestId: message.requestId, snapshot: snapshot() }); }
    catch (cause) { port.postMessage({ channel: JOURNEY_CHANNEL, kind: 'photo-inspection-result', requestId: message.requestId, error: cause instanceof Error ? cause.message : '摄影观察数据暂不可用。' }); }
  };
  port.addEventListener('message', receive); port.start();
  return () => port.removeEventListener('message', receive);
}
