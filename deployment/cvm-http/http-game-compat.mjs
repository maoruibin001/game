import { createSHA256 } from 'hash-wasm';
import { sha256 as fallbackSha256 } from '@noble/hashes/sha2.js';

if (!globalThis.isSecureContext) installHttpGameCompatibility();

function installHttpGameCompatibility() {
  const crypto = globalThis.crypto;
  if (typeof crypto.randomUUID !== 'function') {
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value() {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
      },
    });
  }

  if (crypto.subtle === undefined) {
    let sha256;
    const initialized = createSHA256().then(
      hasher => { sha256 = hasher; },
      () => {},
    );
    Object.defineProperty(crypto, 'subtle', {
      configurable: true,
      value: Object.freeze({
        async digest(algorithm, data) {
          const name = typeof algorithm === 'string' ? algorithm : algorithm?.name;
          if (name?.toUpperCase() !== 'SHA-256') {
            throw new DOMException('Only SHA-256 is available on this HTTP build', 'NotSupportedError');
          }
          let bytes = ArrayBuffer.isView(data)
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);

          // Snapshot before yielding, as the caller can mutate its input immediately.
          if (!sha256) {
            bytes = bytes.slice();
            await initialized;
          }
          if (!sha256) return fallbackSha256(bytes).buffer;
          return sha256.init().update(bytes).digest('binary').buffer;
        },
      }),
    });
  }

  const NativeWorker = globalThis.Worker;
  if (typeof NativeWorker !== 'function') return;

  globalThis.Worker = class HttpGameWorker extends NativeWorker {
    constructor(script, options) {
      const base = globalThis.document?.baseURI ?? globalThis.location.href;
      const url = new URL(script, base);
      const match = /^\/mountain-roll\/(?:assets\/)?((?:forgeax-pack-program-worker|(?:engine|kernel|render)-worker-runtime-[A-Za-z0-9_-]+)\.js)$/.exec(url.pathname);
      if (url.origin === location.origin && match) {
        const prefix = options?.type === 'module' ? 'http-module-' : 'http-classic-';
        url.pathname = url.pathname.slice(0, -match[1].length) + prefix + match[1];
        super(url, options);
      } else {
        super(script, options);
      }
    }
  };
}
