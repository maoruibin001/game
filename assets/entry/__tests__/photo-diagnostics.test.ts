import { MessageChannel, Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { attachPhotoDiagnosticsResponder, createPhotoDiagnosticsReader } from '../photo-diagnostics.ts';
import { JOURNEY_CHANNEL } from '../protocol.ts';

type Port = Parameters<typeof createPhotoDiagnosticsReader>[0];
const port = (value: MessageChannel['port1']) => value as unknown as Port;
const snapshot = { mounted: true, capturesPending: 0, completedFrames: [{ completedAtMs: 400, frame: { frameId: 18, deviceGeneration: 1, presentation: 'ready', worldIdentity: 'valley' } }], lastCapture: { phase: 'captured' } };

describe('source to frontend read-only photography observation', () => {
  it('crosses a real worker MessagePort and awaits the source read without a frontend registrar', async () => {
    const channel = new MessageChannel();
    const source = new URL('../photo-diagnostics.ts', import.meta.url).href;
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      import(workerData.source).then(({ createPhotoDiagnosticsReader }) => {
        const reader = createPhotoDiagnosticsReader(workerData.port);
        // Same async definition.read() shape as the official source inspector.
        const reads = new Map([['shan.capture', { read: reader.read }]]);
        parentPort.on('message', async ({ id }) => {
          try { parentPort.postMessage({ value: await reads.get(id).read() }); }
          catch (error) { parentPort.postMessage({ error: error.message }); }
        });
        parentPort.postMessage({ ready: true });
      });
    `, { eval: true, workerData: { source, port: channel.port1 }, transferList: [channel.port1], execArgv: [] });
    const stop = attachPhotoDiagnosticsResponder(port(channel.port2), () => snapshot);
    try {
      expect((await once(worker, 'message'))[0]).toEqual({ ready: true });
      const response = once(worker, 'message'); worker.postMessage({ id: 'shan.capture' });
      expect((await response)[0]).toEqual({ value: snapshot });
      expect(snapshot.lastCapture.phase).toBe('captured');
    } finally { stop(); channel.port2.close(); await worker.terminate(); }
  });

  it('keeps concurrent reads correlated without sending any gameplay commands', async () => {
    const channel = new MessageChannel(), messages: unknown[] = [];
    channel.port2.on('message', message => messages.push(message));
    const reader = createPhotoDiagnosticsReader(port(channel.port1));
    let count = 0;
    const stop = attachPhotoDiagnosticsResponder(port(channel.port2), () => ({ ...snapshot, count: ++count }));
    try {
      expect(await Promise.all([reader.read(), reader.read()])).toEqual([{ ...snapshot, count: 1 }, { ...snapshot, count: 2 }]);
      expect(messages).toEqual([1, 2].map(n => ({ channel: JOURNEY_CHANNEL, kind: 'photo-inspection-request', requestId: `photo-inspect-${n}` })));
    } finally { reader.dispose(); stop(); channel.port1.close(); channel.port2.close(); }
  });

  it('rejects an unavailable responder with a bounded timeout and allows a later independent read', async () => {
    const channel = new MessageChannel(), reader = createPhotoDiagnosticsReader(port(channel.port1), 30);
    channel.port2.start();
    try {
      await expect(reader.read()).rejects.toThrow('观察超时');
      const stop = attachPhotoDiagnosticsResponder(port(channel.port2), () => snapshot);
      try { await expect(reader.read()).resolves.toEqual(snapshot); } finally { stop(); }
    } finally { reader.dispose(); channel.port1.close(); channel.port2.close(); }
  });

  it('rejects outstanding reads on disposal and ignores mismatched responses', async () => {
    const channel = new MessageChannel(), reader = createPhotoDiagnosticsReader(port(channel.port1));
    try {
      const result = reader.read();
      channel.port2.postMessage({ channel: JOURNEY_CHANNEL, kind: 'photo-inspection-result', requestId: 'unrelated', snapshot });
      reader.dispose(); await expect(result).rejects.toThrow('观察通道已关闭');
      await expect(reader.read()).rejects.toThrow('观察通道已关闭');
    } finally { channel.port1.close(); channel.port2.close(); }
  });
});
