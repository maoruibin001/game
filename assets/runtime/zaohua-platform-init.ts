import { initialize, game, lifecycle } from 'zaohua-platform-sdk';
import { platformBridge, requestPlatformPause } from './platform-bridge.ts';

// Builder compiles this non-Pack entry before the actual Engine entry. The
// frontend reports a completed scene and mounted game UI before loaded().
await initialize({ capabilities: ['game.loading', 'game.lifecycle'] });
game.loading({ stage: '准备山谷与旅行册' });
const unregister = lifecycle.register({
  pause: () => requestPlatformPause(true),
  resume: () => requestPlatformPause(false),
  getState: () => ({ paused: platformBridge.paused }),
});
let loaded = false;
const ready = () => { if (!loaded) { loaded = true; game.loaded(); } };
platformBridge.readyListeners.add(ready);
if (platformBridge.ready) ready();
globalThis.addEventListener?.('pagehide', () => {
  unregister(); platformBridge.readyListeners.delete(ready);
}, { once: true });
