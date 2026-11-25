import { definePack, definePackageId } from '@forgeax/engine/pack/source';
import { FORGEAX_FRAME_COMPLETED_EVENT } from '@forgeax/engine/app';
import type { Plugin } from '@forgeax/engine/plugin';
import { ok } from '@forgeax/engine/types';
import { createPresentation } from '../presentation/presentation.ts';
import { createJourneyAudio } from '../presentation/audio.ts';
import { createNativeJourneyMusic } from '../presentation/native-music.ts';
import { JOURNEY_MUSIC } from '../music/music-cues.ts';
import { initialPresentationView, type PhotoView, type PresentationAction, type PresentationViewModel } from '../presentation/types.ts';
import { SAVE_KEY, serializeJourney, restoreJourney } from '../journey/index.ts';
import type { JourneyState, PauseReason, Photo } from '../journey/types.ts';
import { attachPlatformPause, markJourneyReady, platformBridge } from '../runtime/platform-bridge.ts';
import { JOURNEY_CHANNEL, isJourneyMessage, type EngineMessage, type FrontendMessage } from './protocol.ts';
import { capturePostcard, photoFrameProgress, type PhotoCaptureProgress } from './photo-capture.ts';
import { photoFrameBounds } from '../shared/photography-contract.ts';
import { attachPhotoDiagnosticsResponder } from './photo-diagnostics.ts';
import { createPhotoRepository, photoOriginalKey } from './photo-repository.ts';
import { composePostcard, composeRouteLetter } from './postcard-export.ts';
import { AREA_LABELS } from '../journey/content.ts';
import { composePhotoCaption } from '../journey/photo-notes.ts';
import { formatClock } from '../journey/day-clock.ts';
import { LEGACY_WEATHER_LABELS, WEATHER_LABELS } from '../shared/photography-contract.ts';

export const presentation: Plugin.Object = {
  name: 'shanye-laixin/presentation',
  inject: ['gameHost'],
  async apply(ctx) {
    const host = ctx.gameHost!;
    const root = host.uiRoot;
    const port = host.presentationPort ?? host.port;
    if (!root || !port || !host.canvas) throw new Error('拍一卷山色需要正常的 Engine 前端、画布和消息通道。');
    const document = root.ownerDocument, win = document.defaultView!;
    const canvas = host.canvas;
    await ctx.effect(async function* () {
      // Position the engine-measured FPS counter cleanly at bottom-right while
      // walking, and hide it automatically in camera mode so photos stay pure.
      const productStyle = document.createElement('style');
      productStyle.textContent = `
        #forgeax-status {
          display: ${new URLSearchParams(win.location?.search).get('debug') === '1' ? 'block' : 'none'} !important;
          left: auto !important;
          right: 44px !important;
          bottom: 6px !important;
          opacity: 0.78 !important;
          background: #132d22b8;
          padding: 2px 8px;
          border-radius: 3px;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.03em;
        }
        body:has(.sy-hud.camera-active) #forgeax-status { display: none !important; }
      `;
      document.head.append(productStyle);
      let disposed = false, latest: JourneyState | undefined;
      let hasSave = false, rawSave: string | null = null, saveBlocked = false, saveWarningSent = false;
      let lastSaveRevision = -1, saveTimer: ReturnType<typeof setTimeout> | undefined;
      let lastMessage: Extract<EngineMessage, { kind: 'state' }> | undefined;
      const completedFrame = () => (canvas as typeof canvas & { forgeaxFrameProgress?: { completed?: { presentation?: string } } }).forgeaxFrameProgress?.completed?.presentation === 'ready';
      let firstFrame = completedFrame(), initialized = false, restoreSent = false;
      const captures = new Map<string, AbortController>();
      let lastCapture: (PhotoCaptureProgress & { requestId: string; storage?: { phase: 'writing' | 'saved' | 'failed'; elapsedMs: number; error?: string } }) | undefined;
      const completedFrames: { completedAtMs: number; frame: NonNullable<ReturnType<typeof photoFrameProgress>['completed']> }[] = [];
      const originals = createPhotoRepository(win);
      const protectedOriginals = new Set<string>();
      const resolvedOriginals = new Map<string, Awaited<ReturnType<typeof originals.resolve>>>();
      const resolvingOriginals = new Set<string>();
      let exportMessage: PresentationViewModel['toast'] | undefined;
      const retainedPhotos = () => {
        if (!latest) return [];
        const d = latest.durable;
        // Preserve every independent original reference, including conflicting historical copies.
        return [...d.film, ...d.album, d.pendingPhoto, d.endingPhoto, d.openingReply, d.fireworks?.photo, ...Object.values(d.cardPhotos),
          ...Object.values(d.memories).map(memory => memory?.photo), ...d.checkIns.map(check => check.photo),
          ...Object.values(d.routeDraft), ...Object.values(d.replyPhotos).flatMap(reply => [reply?.photo,reply?.destination])].filter((photo): photo is Photo => Boolean(photo));
      };
      const retainedKeys = () => new Set(retainedPhotos().flatMap(photo => photo.original ? [photo.original.key] : []));
      const acknowledgements = new Set<() => void>();
      let inputClearUnavailable = false;
      const clearPresentationInput = () => {
        const app = host.app;
        const input = 'input' in app ? app.input : undefined;
        if (typeof input?.clear === 'function') input.clear();
        else if (!inputClearUnavailable) {
          inputClearUnavailable = true;
          console.warn('[shanye.input] Host does not expose public input.clear() for modal ownership.');
        }
      };
      const send = (message: Omit<FrontendMessage, 'channel'>) => port.postMessage({ channel: JOURNEY_CHANNEL, ...message });
      const command = (action: FrontendMessage & { kind: 'command' }) => port.postMessage(action);
      const pauseReason = (reason: PauseReason, paused: boolean) => command({ channel: JOURNEY_CHANNEL, kind: 'command', action: { type: paused ? 'pause' : 'resume', reason } });
      try {
        rawSave = win.localStorage.getItem(SAVE_KEY);
        const restored = restoreJourney(rawSave);
        hasSave = restored.status === 'loaded' || restored.status === 'migrated';
        saveBlocked = restored.status === 'invalid' || restored.status === 'future-version';
      } catch { saveBlocked = true; }
      const audio = createJourneyAudio({ proceduralMusic: false });
      const nativeMusic = createNativeJourneyMusic(host, { onStatus: status => {
        audio.setMusicEnabled(status.phase === 'failed' || status.phase === 'unavailable');
        if (status.phase === 'failed') console.warn('[shanye.music]', status);
      } });
      const perform = (action: PresentationAction, payload?: unknown) => {
        void audio.unlock(); void nativeMusic.unlock();
        if (action === 'export-route-letter') {
          const reply = latest?.durable.replyPhotos.forest;
          if (reply?.variant !== 'route-pair' || !reply.photo.original || !reply.destination?.original) return;
          const response = lastMessage?.view.replies?.items.find(item=>item.id==='forest')?.response ?? '';
          void Promise.all([originals.resolve(reply.photo.original.key),originals.resolve(reply.destination.original.key)]).then(async ([a,b])=>{
            if (!a || !b) throw new Error('找不到其中一张原照，无法冲印双照回信。');
            const print = await composeRouteLetter(document,a.url,b.url,response);
            if (disposed) return;
            const url=URL.createObjectURL(print), link=document.createElement('a');
            link.href=url; link.download='拍一卷山色-东岭指路.jpg'; document.body.append(link); link.click(); link.remove();
            setTimeout(()=>URL.revokeObjectURL(url),30000);
          }).catch(error=>{
            if (!disposed) { exportMessage={id:`export-${Date.now()}`,kind:'error',title:'回信未能冲印',message:String(error.message ?? error)}; renderView(); }
          });
          return;
        }
        if (action === 'export-postcard') {
          const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          const photo = retainedPhotos().find(item => item.id === data.photoId);
          if (!photo?.original) {
            exportMessage = { id: `export-${Date.now()}`, kind: 'error', title: '明信片尚未生成', message: '这张照片没有可用的高清原照；历史缩略图仍会保留。' }; renderView(); return;
          }
          const autoCaption = composePhotoCaption({
            area: photo.area, pose: photo.pose, ...(photo.scene ? { scene: photo.scene } : {}),
            matchedCards: photo.matchedCards, courtyard: Boolean(photo.replyCandidates?.some(c => c.variant === 'courtyard')),
            memory: photo.memoryCandidates.includes('valley-letter'),
            postPorch: photo.area === 'post' && Math.hypot(photo.pose.position[0] - 2, photo.pose.position[2] + 214) <= 7,
          });
          const note = (typeof data.note === 'string' ? data.note.trim() : '') || photo.caption || autoCaption;
          void originals.resolve(photo.original.key).then(async original => {
            if (!original || disposed) throw new Error('当前浏览器中找不到原照，未使用缩略图替代。');
            const blob = await composePostcard(document, original.url, {
              title: typeof data.title === 'string' ? data.title.slice(0, 32) : photo.title, location: AREA_LABELS[photo.area],
              date: photo.scene?.clock ? formatClock(photo.scene.clock) : `旅途 · 第 ${photo.sequence} 张`,
              weather: photo.scene ? (photo.scene.clock ? WEATHER_LABELS : LEGACY_WEATHER_LABELS)[photo.scene.weather] : '', note });
            if (disposed) return;
            const url = URL.createObjectURL(blob), link = document.createElement('a');
            link.href = url; link.download = `拍一卷山色-明信片-${photo.sequence}.jpg`;
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
          }).catch(cause => {
            if (disposed) return;
            exportMessage = { id: `export-${Date.now()}`, kind: 'error', title: '明信片没有导出', message: cause instanceof Error ? cause.message : '请检查浏览器下载权限。' }; renderView();
          }); return;
        }
        if (action === 'export-photo') {
          const id = payload && typeof payload === 'object' ? (payload as { photoId?: unknown }).photoId : payload;
          const photo = retainedPhotos().find(item => item.id === id);
          if (!photo?.original) return;
          void originals.download(photo.original.key, `拍一卷山色-${photo.sequence}-${photo.scene?.weather ?? 'photo'}.jpg`).catch(cause => {
            if (disposed) return;
            exportMessage = { id: `export-${Date.now()}`, kind: 'error', title: '原照没有导出', message: cause instanceof Error ? cause.message : '请检查浏览器下载权限。' };
            renderView();
          });
          return;
        }
        if (action === 'fullscreen') {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void root.parentElement?.requestFullscreen?.();
          return;
        }
        if (action === 'new-game' || (action === 'start' && !hasSave)) {
          if (saveBlocked && rawSave) {
            try { win.localStorage.setItem(`${SAVE_KEY}.unreadable-backup`, rawSave); saveBlocked = false; }
            catch { /* Keep the damaged record protected if backup is unavailable. */ }
          }
        }
        const acceptedAction = action === 'start' && !hasSave ? 'new-game' : action;
        send({ kind: 'presentation', action: acceptedAction, payload } as Omit<FrontendMessage, 'channel'>);
      };
      const ui = createPresentation(root, {
        onAction: perform, onUserGesture: () => { void audio.unlock(); void nativeMusic.unlock(); },
        onSettingChange: (key, value) => command({ channel: JOURNEY_CHANNEL, kind: 'command', action: { type: 'set-settings', settings: { [key]: value } } }),
        onModalChange: (open) => {
          // A held shutter can lose its keyup after the review takes UI focus.
          // Revoke the old input at the actual ownership boundary, not per render.
          clearPresentationInput();
          pauseReason('ui', open);
        },
        onReturnToGame: () => {
          if (!(canvas instanceof win.HTMLCanvasElement)) return;
          if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
          canvas.focus({ preventScroll: true });
        },
        onRequestGameFocus: () => {
          clearPresentationInput();
          if (canvas instanceof win.HTMLCanvasElement) {
            if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
            canvas.focus({ preventScroll: true });
          }
        },
      });
      ui.render({ ...initialPresentationView(), hasSave });
      const hydratePhoto = (photo: PhotoView): PhotoView => {
        const key = photo.originalKey;
        if (!key) return photo;
        if (resolvedOriginals.has(key)) {
          const original = resolvedOriginals.get(key);
          return original ? { ...photo, imageUrl: original.url, width: original.photo.width, height: original.photo.height, originalState: 'ready' }
            : { ...photo, originalState: 'missing' };
        }
        if (!resolvingOriginals.has(key)) {
          resolvingOriginals.add(key);
          void originals.resolve(key).then(value => { resolvedOriginals.set(key, value); }).catch(() => { resolvedOriginals.set(key, null); }).finally(() => {
            resolvingOriginals.delete(key); if (!disposed) renderView();
          });
        }
        return { ...photo, originalState: 'loading' };
      };
      const renderView = () => {
        if (disposed || !lastMessage) return;
        const view = lastMessage.view;
        const frame = view.camera.active && canvas.width > 0 && canvas.height > 0
          ? photoFrameBounds(canvas.width, canvas.height, view.camera.photography?.framing) : undefined;
        ui.render({ ...view, hasSave: hasSave || Boolean(latest?.durable.started),
          ...(frame ? { camera: { ...view.camera, frame: {
            left: frame.x / canvas.width, top: frame.y / canvas.height,
            width: frame.width / canvas.width, height: frame.height / canvas.height,
          } } } : {}),
          album: view.album.map(hydratePhoto), film: view.film?.map(hydratePhoto),
          ...(view.pendingPhoto ? { pendingPhoto: hydratePhoto(view.pendingPhoto) } : {}),
          ...(view.endingPhoto ? { endingPhoto: hydratePhoto(view.endingPhoto) } : {}),
          memories: view.memories?.map(memory => ({ ...memory, ...(memory.photo ? { photo: hydratePhoto(memory.photo) } : {}), replacementPhotos: memory.replacementPhotos.map(hydratePhoto) })),
          ...(view.outings ? { outings: { ...view.outings,
            slots: view.outings.slots.map(spot => ({ ...spot, ...(spot.photo ? { photo: hydratePhoto(spot.photo) } : {}) })),
            ...(view.outings.tracked ? { tracked: { ...view.outings.tracked,
              ...(view.outings.tracked.photo ? { photo: hydratePhoto(view.outings.tracked.photo) } : {}) } } : {}),
          } } : {}),
          ...(view.sixth ? {sixth:{...view.sixth,choices:view.sixth.choices.map(hydratePhoto),
            ...(view.sixth.portrait?{portrait:hydratePhoto(view.sixth.portrait)}:{})}} : {}),
          ...(view.fireworks ? {fireworks:hydratePhoto(view.fireworks)} : {}),
          ...(view.mountainLetter ? { mountainLetter: { ...view.mountainLetter,
            candidates: view.mountainLetter.candidates.map(photo => ({ ...hydratePhoto(photo), result: photo.result })),
            ...(view.mountainLetter.photo ? { photo: hydratePhoto(view.mountainLetter.photo) } : {}),
          } } : {}),
          ...(view.replies ? { replies: { ...view.replies,
            items: view.replies.items.map(letter => ({ ...letter, ...(letter.route ? {route:{...letter.route,slots:letter.route.slots.map(s=>({...s,choices:s.choices.map(hydratePhoto),...(s.photo?{photo:hydratePhoto(s.photo)}:{})}))}} : {}), candidates: letter.candidates.map(hydratePhoto), ...(letter.photo ? { photo: hydratePhoto(letter.photo) } : {}) })),
            final: { ...view.replies.final, ...(view.replies.final.photo ? { photo: hydratePhoto(view.replies.final.photo) } : {}) },
          } } : {}),
          ...(exportMessage ? { toast: exportMessage } : {}),
        });
      };
      let lastFrontendStatus = '';
      const reportFrontendStatus = () => {
        if (disposed) return;
        const status = nativeMusic.state();
        const active = document.activeElement;
        const target = active === canvas ? 'canvas' : active && root.contains(active) ? 'ui' : 'other';
        const snapshot = { kind: 'frontend-status', music: { phase: status.phase,
          ...(status.cue ? { cue: status.cue } : {}), ...(status.code ? { code: status.code } : {}) }, focus: { target } };
        const key = JSON.stringify(snapshot);
        if (key === lastFrontendStatus) return;
        lastFrontendStatus = key;
        send(snapshot as Omit<FrontendMessage, 'channel'>);
      };
      document.addEventListener('focusin', reportFrontendStatus);
      document.addEventListener('focusout', reportFrontendStatus);
      const persist = () => {
        if (!latest || !latest.durable.started || disposed) return;
        if (saveBlocked) {
          if (!saveWarningSent) {
            saveWarningSent = true;
            send({ kind: 'save-status', status: 'failed', message: '旧旅行册暂不能安全备份，本次进度尚未写入设备，请保留本页。' } as Omit<FrontendMessage, 'channel'>);
          }
          return;
        }
        try {
          const value = serializeJourney(latest);
          if (win.localStorage.getItem(SAVE_KEY) !== rawSave) {
            throw new Error('另一标签页已更新旅行册，本页的进度未保存。刷新可继续已保存的旅程。');
          }
          win.localStorage.setItem(SAVE_KEY, value); rawSave = value; hasSave = true;
          // Do not sweep this shared origin's original store from one tab's
          // snapshot. Another tab can still retain an image absent here. A film
          // deletion removes its candidate reference; independent originals stay.
          const keys = retainedKeys();
          for (const key of protectedOriginals) keys.add(key);
          originals.releaseUnused(keys);
          for (const key of resolvedOriginals.keys()) if (!keys.has(key)) resolvedOriginals.delete(key);
          send({ kind: 'save-status', status: 'saved' } as Omit<FrontendMessage, 'channel'>);
        } catch (cause) {
          send({ kind: 'save-status', status: 'failed', message: cause instanceof Error ? cause.message : '旅行册未能保存，请保留本页。' } as Omit<FrontendMessage, 'channel'>);
        }
      };
      const ready = () => { if ((firstFrame || completedFrame()) && initialized) markJourneyReady(); };
      const frame = (event: Event) => {
        const fact = photoFrameProgress(canvas).completed;
        if (fact) { completedFrames.push({ completedAtMs: performance.now(), frame: fact }); if (completedFrames.length > 120) completedFrames.shift(); }
        if ((event as CustomEvent<{ presentation?: string }>).detail?.presentation !== 'ready') return;
        firstFrame = true; ready();
      };
      canvas.addEventListener(FORGEAX_FRAME_COMPLETED_EVENT, frame);
      const unregisterPause = attachPlatformPause(async (paused) => {
        pauseReason('platform', paused);
        if (!latest) return; // No game can be moving before its first accepted state.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => { acknowledgements.delete(check); reject(new Error('游戏尚未确认暂停状态。')); }, 2200);
          const check = () => {
            if (latest?.runtime.pauseReasons.includes('platform') !== paused) return;
            clearTimeout(timer); acknowledgements.delete(check); resolve();
          };
          acknowledgements.add(check); check();
        });
      });
      const receive = (event: MessageEvent) => {
        if (disposed || !isJourneyMessage(event.data)) return;
        const message = event.data as EngineMessage;
        if (message.kind === 'ready') {
          if (!restoreSent) { restoreSent = true; send({ kind: 'restore', serialized: rawSave } as Omit<FrontendMessage, 'channel'>); }
          return;
        }
        if (message.kind === 'capture-cancelled') { captures.get(message.requestId)?.abort(); captures.delete(message.requestId); return; }
        if (message.kind === 'capture-request') {
          if (captures.has(message.requestId)) return;
          const controller = new AbortController(); captures.set(message.requestId, controller);
          audio.play('shutter');
          let originalKey: string | undefined, storageStarted: number | undefined;
          const storage = (phase: 'writing' | 'saved' | 'failed', error?: string) => {
            if (lastCapture?.requestId !== message.requestId || storageStarted === undefined) return;
            lastCapture = { ...lastCapture, storage: { phase, elapsedMs: Math.round(performance.now() - storageStarted), ...(error ? { error } : {}) } };
          };
          const execution = 'execution' in host.app ? host.app.execution.report() : undefined;
          const sourceFrame = execution?.engine.realm === 'worker' && execution.world.identity
            ? { frameId: execution.frame.submitted, worldIdentity: execution.world.identity } : undefined;
          void capturePostcard(canvas, document, controller.signal, progress => { lastCapture = { ...progress, requestId: message.requestId }; }, sourceFrame, message.framing).then(async captured => {
            if (disposed || controller.signal.aborted) return;
            storageStarted = performance.now(); storage('writing');
            originalKey = photoOriginalKey(win.crypto);
            protectedOriginals.add(originalKey);
            const original = await originals.put(originalKey, captured.original, captured.width, captured.height);
            if (disposed || controller.signal.aborted) {
              protectedOriginals.delete(originalKey); await originals.remove(originalKey); return;
            }
            storage('saved');
            ui.flash();
            send({ kind: 'capture-result', requestId: message.requestId, thumbnail: captured.thumbnail, original, capturedAt: Date.now() } as Omit<FrontendMessage, 'channel'>);
          }).catch(cause => {
            const error = cause instanceof Error ? cause.message : '照片显影失败。';
            storage('failed', error);
            if (originalKey) { protectedOriginals.delete(originalKey); void originals.remove(originalKey).catch(() => undefined); }
            if (!disposed && !controller.signal.aborted) send({ kind: 'capture-result', requestId: message.requestId, error } as Omit<FrontendMessage, 'channel'>);
          }).finally(() => captures.delete(message.requestId));
          return;
        }
        if (message.kind !== 'state') return;
        latest = message.state; lastMessage = message; initialized = message.restored;
        for (const key of retainedKeys()) protectedOriginals.delete(key);
        const d = latest.durable, r = latest.runtime;
        const paused = r.pauseReasons.length > 0 || !['play', 'photo'].includes(r.screen) || d.pendingPhoto !== null;
        // Lifecycle ACK reports its own suspension reason. A player-owned menu
        // remains an independent pause and must not be closed by platform resume.
        platformBridge.paused = r.pauseReasons.includes('platform');
        audio.setMix(d.settings); audio.setRegion(d.player.area);
        audio.setEnvironment({ weather: message.environment.weather, rain: message.environment.rain * (message.environment.sheltered ? .35 : 1), wind: message.environment.wind });
        const audioPaused = r.screen === 'paused' || r.pauseReasons.some(reason => reason !== 'ui');
        if (audioPaused) audio.pause(); else audio.resume();
        nativeMusic.update({ region: d.player.area, ending: r.screen === 'ending' && !d.endingSeen, settings: d.settings, paused: audioPaused });
        audio.update({ distanceWalked: d.distanceWalked, moving: message.controller.speed > .15, region: d.player.area,
          surface: message.environment.postalRain?.underfoot ? 'water' : d.player.area === 'town' ? 'stone' : 'earth', windmill: d.stamps.forest && d.player.area === 'forest', zipline: message.controller.mode === 'zipline' });
        for (const gameEvent of message.events) audio.play(gameEvent);
        renderView();
        reportFrontendStatus();
        if (message.restored && message.saveRevision !== lastSaveRevision) {
          lastSaveRevision = message.saveRevision;
          if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = undefined; persist(); }, 750);
        }
        for (const acknowledge of acknowledgements) acknowledge();
        ready();
      };
      port.addEventListener('message', receive); port.start();
      const visibility = () => { pauseReason('hidden', document.hidden); if (document.hidden) persist(); };
      const blur = () => { pauseReason('blur', true); persist(); };
      const focus = () => pauseReason('blur', false);
      const pagehide = () => persist();
      document.addEventListener('visibilitychange', visibility); win.addEventListener('blur', blur); win.addEventListener('focus', focus); win.addEventListener('pagehide', pagehide);
      const photographySnapshot = () => JSON.parse(JSON.stringify({ mounted: true, screen: lastMessage?.view.screen ?? 'menu', hasSave, saveBlocked, capturesPending: captures.size,
          frameProgress: photoFrameProgress(canvas), completedFrames: completedFrames.map(item => ({ ...item, frame: { ...item.frame } })), lastCapture,
          originalsReady: [...resolvedOriginals.values()].filter(Boolean).length,
          originalsMissing: [...resolvedOriginals.values()].filter(value => value === null).length,
          ready: initialized && firstFrame }));
      const unregisterRead = host.gameProjection?.registerRead({ id: 'shan.ui', title: '拍一卷山色界面', description: 'Normal frontend UI, persistence and real photograph status.', read: photographySnapshot });
      const unregisterPhotographyRead = attachPhotoDiagnosticsResponder(port, photographySnapshot);
      send({ kind: 'inspect' });
      // Restore is idempotent; no persistent progress is written before acceptance.
      restoreSent = true;
      send({ kind: 'restore', serialized: rawSave } as Omit<FrontendMessage, 'channel'>);
      yield () => {
        persist(); disposed = true;
        if (saveTimer) clearTimeout(saveTimer);
        for (const capture of captures.values()) capture.abort(); captures.clear();
        port.removeEventListener('message', receive); canvas.removeEventListener(FORGEAX_FRAME_COMPLETED_EVENT, frame);
        document.removeEventListener('visibilitychange', visibility); win.removeEventListener('blur', blur); win.removeEventListener('focus', focus); win.removeEventListener('pagehide', pagehide);
        document.removeEventListener('focusin', reportFrontendStatus); document.removeEventListener('focusout', reportFrontendStatus);
        unregisterPause(); unregisterRead?.(); unregisterPhotographyRead(); nativeMusic.destroy(); audio.destroy(); ui.destroy(); originals.destroy();
        productStyle.remove();
      };
    });
  },
};

export default definePack({
  schemaVersion: '2.0.0', plugins: true,
  packageId: definePackageId('01a1e000-7701-7000-8000-000000000050'),
  build: () => ok({ 'plugin/frontend': { kind: 'plugin', module: { specifier: './frontend.pack.ts', export: 'presentation' },
    config: { music: Object.values(JOURNEY_MUSIC).map(cue => ({ $asset: cue.guid })) } } }),
});
