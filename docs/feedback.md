# Engine and integration feedback

## 2026-11-19 Postal gate shadow swims during small camera turns

On Engine 0.5.0 hardware WebGPU, start a new game, walk a few steps out of the postal gateway and lower the view toward the shadow crossing the path and grass. Hold the time and weather fixed with the creative controls, then turn the camera through several small angles without moving the traveller. The default directional Vogel filter seeds its rotated shadow samples from framebuffer pixels. The projected shadow edge can change as the same patch of ground moves across those pixels, even at a fixed sun direction.

The game uses the SDK’s light-space PCF Soft filter with its existing map size and cascade distances. Three small turns produced mean absolute green-channel changes of 2.95 to 3.09 levels before the fix and 0.42 to 0.73 afterward, measured by projecting the same grass points into each successive frame. The local diagnostic series and measurements are under `.forgeax/diag/post-shadow-camera/` and `.forgeax/diag/post-shadow-edge-metrics.json`. The original RHI capture digest is recorded in `.forgeax/diag/post-shadow-rhi.json`.

## 2026-11-15 pnpm workspace pattern mismatch

Official SDK 0.5.0 `project new --template game-3d` succeeded. Adding the official Zaohua platform SDK with its normal installer completed dependency installation, but `project check` then returned `project-pnpm-workspace-state-stale`.

The generated pnpm-workspace.yaml omitted `packages`. pnpm 12.15.0 recorded workspacePackagePatterns as `["."]`, while the Engine verifier interprets an omitted field as `[]`. This game explicitly declares `packages: ['.']` and reinstalls through pnpm to align the manifest and native installed records. No dependency records or verifier code are patched.

## 2026-11-16 CLI screenshot witness clears native modal focus (formal 0.5.0)

Confirmed on formal `@forgeax/engine@0.5.0`, without package patches. During `project play`, `play.screenshot()` delegates to a canvas witness capture that temporarily applies `* { visibility: hidden !important; } canvas { visibility: visible !important; }`. A focused ordinary game UI button consequently loses focus to BODY. Resuming a relative Tab sequence after this observation navigates from the beginning rather than from the previous control. This does not reproduce with ordinary page screenshots or normal player keyboard input.

Reproduction: open the photo-reply journal, Tab to a candidate and press Enter, capture via the formal helper, then continue Tab to the note/confirmation controls. The same component sequence with ordinary screenshot succeeds; introducing only the official visibility style reproduces the lost focus and missed confirmation. Expected: read-only observation preserves focus and scroll, or explicitly documents focus invalidation. Game QA now captures after a completed confirmation and does not chain relative navigation across this observation boundary. No game success state or input is injected, and no engine version is downgraded.

Evidence outside the game repository: `../production/iteration-letter-courtyard-20261116/qa-reply-tab-component-02/RESULT.json`; original owner failure `../production/iteration-letter-courtyard-20261116/owner/letter-story-probe-2026-11-16T10-34-26-124Z/official-play.json` and `FAILURE-UI-confirmation.png`.

## 2026-11-18 Desktop preview startup blocked by HTTP-cache refresh (0.5.0)

Reproduction: complete startup once, serve a new build of the same project at the same origin, then open it normally again. On port 59566, Chrome retained the previous ForgeAX startup version and no service worker controlled the page. The document and three entry scripts returned, but the generated entry waited for a GET of `/?forgeax-startup-cache-reset=1`. Chrome aborted that request and the identical recovery request after their timeouts. A direct HTTP request to the endpoint returned 200 and `Clear-Site-Data: "cache"`. The browser's internal reason for the stalled request is unverified.

Expected: the new versioned entry can start without waiting for an origin-wide cache clear. The project pins a pnpm patch to the two bundled DevKit entry points. Ordinary startup still prepares a controlling service worker when present. On an actual startup error, the existing single recovery attempt still requests cache refresh. If the HTTP refresh fails, recovery logs it and proceeds with revalidation and the versioned retry.

## 2026-11-19 Desktop startup profile on Engine 0.5.0

Serve the existing `d095b43` production build through `forgeax project preview` and open it in regular Chrome. After the title admits input, read `await __forgeaxLoadTimeline.collect({ timeoutMs: 900 })` in DevTools. Use the page `timeOrigin` for all three realms and compute unions for overlapping records. The local compact receipt is `.forgeax/diag/editorial-startup/chrome-worker-timeline.json`.

On the M2 Pro desktop, the Engine Worker activated the root from 4.598 s to 20.217 s and committed the world from 20.217 s to 26.963 s. The largest measured substage was the stock material asset decoder, with 189 records covering 9.983 s. Recorded Engine asset fetches covered 229 ms and recorded artifact decoding covered 415 ms. Those smaller intervals can be contained in asset decode windows. The first completed frame arrived at 28.454 s and the first presentable frame at 28.730 s.

The second `Starting workers` display corresponds to adopting the staged Render Worker and waiting for its startup inside `world-commit`. That commit also contains the Kernel Pool readiness wait when enabled. The Render Worker module has already been asked to preload during root setup. Renderer `shader` and `pipeline` records measure the instrumented calls, with no separate driver or GPU completion distribution. The package has 196 materials with 194 distinct authored payloads after excluding cooking metadata, which limits exact deduplication at project level.

Project load markers from `744d41d` bound `assets.load(scene)` to 15.635 s, instantiation to 156 ms and environment installation to 32 ms on an ordinary Chrome navigation. The same probe recorded world commit at 6.089 s and the first presentable frame at 29.886 s. The Engine dependency and material decode path accounts for most of the observed root activation. The product patch for this build is limited to grass riser normals and diagnostic marks.

Ordinary input samples are in `.forgeax/diag/editorial-startup/chrome-to-playable.json`. On `d095b43`, the menu became operable at 29.487 s on the first navigation and 26.839 s on a same-tab, cache-enabled reload. Movement followed by camera entry was observed at 30.606 s and 28.159 s respectively. On `744d41d`, the cache-enabled new-tab resume observed the menu at 36.210 s and camera entry at 37.333 s, with movement and the earlier first photo confirmed in the isolated test save. These are path checks under the listed conditions. The controlled three-cold and three-warm title baseline stays in `.forgeax/diag/editorial-startup/chrome-title-timings.json`.
