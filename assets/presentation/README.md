# 《拍一卷山色》界面与声音

正式源码在本目录。`production/staging/presentation` 仅保留组件检查脚本与早期草稿，不参与游戏打包。此模块不创建游戏入口、Canvas 或自己的 Engine 实例。

## 前端挂载

`createPresentation(uiRoot, callbacks)` 的 uiRoot 必须来自当前 ForgeaX `GameHost.uiRoot`。所有 DOM 用它的 `ownerDocument` 创建并附着于容器内部。返回 `render(PresentationViewModel)`、`flash()`、`destroy()`。窗口销毁时必须调用 destroy；借来的 Host Port 不由此模块关闭。

`types.ts` 是显示契约，游戏状态由 `journey/` 拥有；正式映射是 `journey/presentation-adapter.ts`。前端 Pack 通过 `host.presentationPort ?? host.port` 收状态、发指令。不要让 UI 直接访问 Engine World，或用 Play-only projection 充当生产数据源。

- `screen='play' + camera.active=true` 表示相机举起。V4 快门成功只更新 `film`（最近 8 张），不打开模态；`screen='photo'` 仅保留旧草稿兼容显示。旅行册仍为三个全局标签，风景标签内分底片和精选（12 张）。
- `onAction(action,payload)`：`save-photo` 为 `{photoId}`，`replace-photo` 为 `{photoId,replaceId}`，`delete-film-photo` / `export-photo` 为 `{photoId}`；`select-ending-photo` 沿用字符串 ID。导出仅发出用户意图，Host 从本地原图存储读取 Blob 后下载，UI 不宣称已经导出。
- `onSettingChange(key,value)` 发送实际游戏设置，由状态回流。视角灵敏度接 controller.setLookSettings；画质接正常 Engine 画质配置，不能只更新下拉框文字。
- `onUserGesture` 保留浏览器原始点击栈，用来解锁声音和原生音乐。
- `onModalChange(open)` 是界面输入所有权变化。内部设置、操作说明和重开确认也会通知；让 controller 暂停且清输入，恢复使用 controller 的 releaseGate。开关菜单的真实状态仍由游戏规则决定。
- `onRequestGameFocus()`：非模态工具的鼠标点击、键盘调整后的 Esc，请 Host 清当前真实 input producer 并把焦点给游戏 Canvas；不暂停人物。`onReturnToGame()` 仍仅在最后一层模态关闭并回到 play 后触发。
- UI 不注册全局 C/E/M/J 快捷键。全局按键由 controller 统一处理；模态面板内仅处理 Esc、Tab 焦点循环。界面 pointer/mouse/key 冒泡被阻断，避免点击菜单误触快门。

界面包括开始/继续/重开确认、画质和声音设置、键鼠操作、目标 HUD、存档状态、取景框和旧卡片参照、快门闪光、最近 8 张底片选片、删除和 12 张精选满册后明确替换、旅行册三标签及相册两页、六处拾遗、手绘地图、暂停、选择寄信照片、寄信成品和再探索。

地图位置使用归一化 world 坐标。map-data.ts 从正式 shanye-world/world-layout.ts 导出 4 个真实地标和 6 条可见路线；隐蔽发现路径保留探索。玩家箭头与地图共用 SVG 坐标系，避免宽高受限时的留白导致错位。世界路线变化后运行 staging 的 export-map.ts 更新。相机判断和交互范围完全由规则与世界计算；UI 不判定谜题。

## 照片真实性

只显示 Engine 捕获的 `PhotoView.imageUrl`，支持 PNG/JPEG/WebP 的 data URI、同源 blob 和同源 HTTP 资源；拒绝脚本、跨域图和 SVG data URI。照片缺失时明确写“照片还未显影”，不会以插画替代玩家实拍。`art.ts` 里的原创 SVG 只用于旧卡片/地图/图标。

外部显示文字统一 HTML 转义。高频 render 对稳定 HUD/modal 使用签名缓存，玩家位置和取景对齐只改局部样式。鼠标拖滑块时不会每帧重建焦点控件。Toast 按 ID 去重，所有计时器随销毁清理。

## 声音接口

`createJourneyAudio({proceduralMusic:true, window:uiRoot.ownerDocument.defaultView})` 为原创 WebAudio 环境音与备用配乐，只有在 trusted user event 调用 `unlock()` 后建立/恢复 Context。

- `setMix(settings)`：总音量、音乐、环境、音效四路，值 0–1。
- `setMusicEnabled(false)`：原生音乐准备好后淡出备用配乐；失败时设 true 恢复，不叠两套音乐。
- `setRegion(region)` / `update({region,distanceWalked,moving,surface,windmill,zipline})`：区域风声、鸟鸣、风铃、风车和按行走距离发出的脚步。
- `play(event)` 接完整规则事件（type、discovery、memory）；穷尽映射表保证新事件必须被有意映射或静默。`capture-request` 单独 `play('shutter')`；`photo:captured` 与 `photo:timer-ready` 静默，避免重复快门。`discovery:found/read` 的 wind-song 播独立风铃曲，memory 完成展开纸页和短旋律。
- `setEnvironment({weather,rain,wind})` 只收已经应用的实际环境帧；rain/wind 归一化 0–1，自动夹取。Host 的遮雨判断已反映在 rain 中，不用 UI 天气请求直接驱动音频。雨声沿环境音总线随暂停/恢复/销毁管理，不建立额外 Context；原生三段配乐不变。倒计时开始只有短提示音，取消或完成事件不留下延迟快门。
- `pause()/resume()` 保留设置并清调度，`destroy()` 释放自己创建的音频 Context、音源与定时器。

只有隐藏、失焦、平台暂停与显式暂停需要静音；旅行册、照片确认、寄信结尾允许继续低音量配乐，否则这些画面的匹配/邮戳声音会被游戏暂停状态吞掉。声音暂停与人物输入暂停是不同的决定。

`createNativeJourneyMusic(host,{onStatus})` 借用当前 `host.audio` 与 `host.assets`，通过 Registry 加载 `music/music-cues.ts` 的三个官方 GUID。公开 `ready:Promise<boolean>`、`unlock()`、`update({region,ending,settings,paused})`、`state()`、`destroy()`。

- 普通旅途 normal、山脊 vista、结尾一次性 outro。过渡 1.5 秒。暂停保留原生音源位置。
- onStatus 的 `ready/playing/paused` 禁用备用旋律；`failed/unavailable` 恢复备用旋律，保留 code/message/detail 供 QA。`loading` 期间可先保留备用配乐。
- 异步 load 完成后先查 disposal fence。持有的 Asset handle 在销毁时释放；只停止本模块的三个 source ID，不销毁借用的 Host 音频服务。
- 8 秒运行态仍未开始本模块的音源时给出明确失败；不把 play() 的 void 返回值当成可听验收。

所有环境音/音效与备用旋律为本次原创程序合成，无外部请求或付费生成。正式三段配乐的原创乐谱与所用音源许可由 `assets/music/` 完整保留。

## 已做检查与边界

- 全项目 `pnpm exec tsc --noEmit --pretty false` 通过。
- `pnpm exec vitest run assets/presentation/__tests__/native-music.test.ts`：4 项，覆盖手势、native source 暂停/过渡、失败报告、异步销毁后晚到 handle 的释放，且不 destroy Host。
- `production/staging/presentation/component-check.mjs`：11 项独立组件诊断通过；点击、滑块焦点、模态回调、六发现/两页相册、地图位置增量、事件阻断、满相册明确替换、转义/图源限制、程序音频解锁/生命周期、1280×600 边界和销毁。证据在 `production/evidence/presentation/`。
- 组件图使用纯色背景，明确以 `component-only` 命名，只检查 UI；不是游戏截图，不是实际场景、原生配乐试听或正式交付验收。
- 真正游戏验收仍须走 Engine 官方 owner browser 的 project play，包含世界背景、控制器恢复、真实拍照、保存再加载、三段音乐实际可听、全流程寄信；不能以组件诊断替代。

## 天气与摄影显示契约（2026-11-16）

`weather` 提供当前 id/label/options 和可选 transitioning；`camera.photography` 复用 shared/photography-contract 的完整设置：landscape/portrait、wide/standard/detail、EV -1…1、look/wave/letter、viewpoint 0…2、timerSeconds 0/3。`camera.viewpoints` 的 available/reason 来自真实控制器，UI 不虚构机位。`set-weather {id}` / `set-photography Partial<PhotographySettings>` 只请求改变，以回流 DTO 为准。`camera.countdownSeconds`、captureState/captureMessage 显示计时与捕获/保存状态；cancel-countdown 发取消请求。

取景边界覆盖整个世界 Canvas，与实际保存同范围；UI 不入照片。`PhotoView.originalKey/width/height/sceneDescription` 描述原图，Host 可异步用 Blob URL 替换 imageUrl 并设置 originalState ready/missing。大图采用 contain，保留所有像素；缺原图禁用导出，旧照片没有 originalKey 时不提供伪原图出口。底片滚动上限 8 的提示明确显示，精选、来信和回信的独立副本由规则持久保存。

本轮组件检查：`node assets/presentation/__tests__/weather-photo-check.mjs` 7/7，通过真实公开 BrowserInputBackend 检查鼠标工具后 C/W 输入、滑杆键盘焦点和 Esc；覆盖非阻塞 film、三种天气请求、人物/机位可用性、稳定倒计时 DOM、原图显示/缺失/导出意图、底片删除、12 张满册替换、模态恢复及 1280×600/720 布局。证据与 1920/1280 按钮坐标在 `production/evidence/presentation/weather-photo/`。纯色背景和历史真实照片只作组件夹具，不等于新摄影、天气、存储或下载实机验收。

## 天气预报显示

`WeatherView.forecast?` 接规则真实观测 DTO：`observedAtSeconds`、`changeInSeconds` 与三项整数百分比 `probabilities: Record<WeatherId,number>`。时间必须有限且非负，三项概率须在 0–100 且合计 100；缺项或非法时整块隐藏，不在 UI 归一化、随机生成或推算实际未来天气。最高项并列时一起标记“可能”，没有“准确率 100%”之类承诺。规则允许维持当前天气，因此摘要写“下一轮天气约 X 分后”；手动切换会重新观测。

预报摘要独立定位于上方中央，默认收起；展开分布不创建模态，不触发游戏动作或暂停。鼠标点击后沿 onRequestGameFocus 回画布；键盘展开可用 Esc 收起并返回。每帧剩余时间与摄影工具采用独立缓存，避免重建滑杆和快门。天气、底片、人物工具原坐标保留，声音仍只接受实际环境帧。

`node assets/presentation/__tests__/forecast-check.mjs` 使用真实 createJourney→规则 adapter DTO 加公开 BrowserInputBackend，覆盖 100% 校验、并列概率、非法隐藏、非模态 C/W、键盘 Esc、每帧时间更新时滑杆 DOM/焦点、真实手动天气 reducer 重新观测、600/1080 组件布局及卸载。证据位于 `production/evidence/presentation/forecast/`，不替代官方 owner 实机验收。
