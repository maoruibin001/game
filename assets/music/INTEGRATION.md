# 山野来信 · 原创原生音乐接入

2026-11-16：三个 GUID 的内容已改为本项目从零编写的新曲谱，详见音乐库 README 和 SOURCE-PROVENANCE.json。旧库曲谱已完整归档且不在资产根。normal/vista/outro 时长分别为 54.545458 / 30 / 10.909083 秒；normal 88 BPM、vista 96 BPM，outro 为 88 BPM 的 16 拍。音源仅保留 MIT Shanshui 合成方程。

三段 Pack 均已放入现有 `forge.json.assetRoots=["assets"]`，不需要新增入口或 manifest。正式原生流程为 Pack 源码 → Engine cooker → DDC/catalog → `gameHost.assets.load(guid, 'audio')`。不要从源码路径读取音频，不要在浏览器执行 `lib/build.ts`，不要手写 catalog。

身份与建议初始音量集中于 `music-cues.ts`。音量只是初始混音建议，最终听感由普通用户手势启动后的游戏试听决定。

## 0.5.0 Host 消费契约

以下类型与方法已对当前安装的 `@forgeax/engine@0.5.0` 核对。前端根声明 `inject: ['gameHost']`，从当前 `gameHost` 获取 `assets` 和借用的 `audio` 服务：

```ts
const cue = JOURNEY_MUSIC.normal;
const audio = gameHost.audio;
if (!audio) {
  // Keep the game's explicit procedural-audio fallback; report native availability.
  return;
}
const loaded = await gameHost.assets.load(cue.guid, 'audio');
if (!loaded.ok) {
  // Preserve loaded.error.code / expected / hint / detail.
  return;
}
const handle = loaded.value;
try {
  const content = gameHost.assets.read(handle);
  if (!content.ok) return;
  // Use a source ID owned by the presentation audio module.
  audio.play(sourceId, content.value, {
    loop: cue.loop,
    volume: cue.initialVolume,
    spatialBlend: 0,
    bus: 'music',
  });
} finally {
  gameHost.assets.release(handle);
}
```

`WebAudioEngine.play()` takes the source ID and `AudioClipAsset`; it returns `void`, not an acceptance Result. Inspect `audio.getState().lastError`, context state and the actual audible result. Source IDs must not collide with other game sounds. The UI audio module owns its source IDs, pending-load fence and stop/disposal behavior.

- Start from a real click/key gesture. Native Host audio handles lazy AudioContext creation and gesture resume; do not build a second native music Context.
- For music settings use `audio.setBusVolume('music', sliderValue)`. Keep source level and user bus setting separate so a crossfade does not overwrite the user's setting.
- For a 1.5 second crossfade, start the new source at volume 0, vary old/new source gain with `audio.setVolume(id, gain)`, then `audio.stop(oldId)`. Cancel the fade scheduler on UI disposal/restart.
- `audio.setPaused(id, true/false)` retains playback position. Stop both voices when the journey is disposed; do not destroy the borrowed Host audio service.
- `gameHost.audio` belongs to the App. Never retain it across an App rebuild. Async music loading must check the consumer's current generation/disposal flag before calling play.
- `normal` / `vista` are new complete original mixes. They are not a twelve-stem native music transport. `outro` is a short independent sixteen-beat ending; use after fading the loop or at its intended entry origin, not as an arbitrary phase-aligned replacement.

## Sources and attribution

`eastern-fantasy-interactive-music/LICENSES.md` retains the Shanshui MIT notice; unused Liyue, Syrtis and NumPy dependencies were removed from the active closure. `README.md` retains library documentation and all three Entry sections. `SOURCE-PROVENANCE.json` retains official download IDs, versions, source revision and ZIP digests. Original ZIPs and the unmodified subsets remain in `production/library/` outside the active asset root.

The merged library keeps the original Pack source bytes, package IDs and output source keys. Shared files were copied once only when all delivered SHA-256 values matched. No bird or bell assets have been added.

## Verification boundary

Music-only TypeScript checking and the official `asset inspect --parameters-only` identity checks pass on the installed 0.5.0 release. These checks do not generate audio. Whole-project build, catalog/GUID output readback and normal Preview playback remain owned by the root integration task. No `asset verify`, cold cook or project build was started concurrently by this asset task.
