# 拍一卷山色 · 规则接口

`index.ts` 是唯一导出入口。这里是零引擎、零 DOM 的状态与规则库，由 Engine 原生插件持有唯一 `JourneyState`。Frontend 只接收 `toPresentationView` 投影，浏览器存档写入由 Frontend 完成。此文件夹没有独立运行入口。

## 接入顺序

1. 用 `WORLD.spawn`、`WORLD.spawnYaw` 构造 `Pose`，调用 `createJourney(spawn)` 或 `restoreJourney(serialized, spawn)`。后者返回 `status/warnings`，损坏或新版本记录应保留，不能自动覆盖。
2. 正常用户动作交 `reduceJourney(state, action)`；其结果 `{state, events}` 都可序列化。事件只代表本次转移，加载和渲染不会重放风车、桥、发现音效。`input:reset` 时清除移动键、鼠标增量等残留输入。
3. 每帧先由场景计算有效交互与真实摄影投影，再用 `set-context`、`set-pose`、`tick`。`canMove` 控制位移；相机举起时也接受控制器已通过地形与碰撞校验的慢走位置，规则不再锁住人物。每个 tick 最多推进一秒，隐藏或暂停不会累计后台时间。
4. `worldState(state)` 输出 `windmillTurning/curtainOpen/ziplineAvailable/gateOpen/bridgeProgress/bridgeWalkable/townLights/courtyardOpen/sunset/rideProgress/canMove/paused/valleyLetterOpened`。镇桥 3.2 秒落下后才可走；重载后直接恢复安全的已落下桥。`valleyLetterOpened` 控制可选来信的折纸状态。
5. `toPresentationView(state, {mapBounds: WORLD.bounds, hasSave, saveStatus, saveMessage, toast})` 输出 UI 的独立契约。`actionFromPresentation` 将 UI 动作转成规则动作；null 表示宿主处理，例如快门截图、全屏、新开旅程。
6. 有意义的持久变化后将 `serializeJourney(state)` 发给 Frontend 存储；写入成功才显示 `saved`。`saveToStorage/loadFromStorage` 可供宿主适配，但不应从 Engine 访问 localStorage。存档 V4 上限 4,200,000 个字符串字符，新拍缩略图最多 80,000 字符；V1–V3 老照片继续接受原 180,000 字符上限，只接受 PNG/JPEG/WebP data URL，并检查对应签名、必要头信息和容器边界。该检查不解码压缩流，不证明所有像素可解码；图片解码、画面像素检查、压缩与真实截图属于宿主。稳定存储键仍为 `shanye-laixin.journey.v2`，不要因为 envelope 升到 V4 而换键丢失旧进度。

## 交互和摄影

`set-context.nearby` 使用场景真实距离和遮挡查询得到的最近对象。规则支持 `postman`、`town-lever`、四个 `*-mailbox`、`zipline`、六个直接发现 ID，或规范形式 `postmaster/town-gate/mailbox:<区域>/discover:<id>`。`interact.id` 必须等于当前 nearby，才能生效。场景接近判定是权威，禁止从 UI 直接指定远处对象完成任务。

滑索由宿主将靠近 `zipline` 的互动映射为 `start-ride`，传入世界定义的目标 `Pose` 和 `duration`。控制器沿真实路线更新画面，并逐帧发送 `ride-progress {progress}`；规则 `tick` 只累计经过时间，不按另一套时钟自动到站。控制器真实落地时发送 `finish-ride {pose}`：位置必须有效且距离目的地不超过 8 米，完成后才累计次数并清除 ride；重复完成事件无效。无 pose 的完成事件只在已收到 progress=1 后接受。`cancel-ride` 和返回菜单恢复安全起点；即使进度已达 1，在真正完成前的存档也恢复至起点。

`PhotoObservation` 中所有坐标是屏幕归一化 0..1，Y 向下，depth 向前为正；width/height 是场景实际开口或目标的投影范围。`visibleFraction` 和 `occluded` 来自真实投影/射线。前景门框不能用整座建筑外框替代，排除目标自身碰撞时也不能忽略其它遮挡。

| 目标 | area / vantageTags | anchors | 额外条件 |
|---|---|---|---|
| 自由照片 | 任意 | 任意或空 | 只要举起相机就可拍，不假装完成主线 |
| 邮局可选构图教程 | post / post-overlook | post-door, windmill | 近门洞框住远风车 |
| 林地明信片 | forest / forest-view | forest-chime, windmill | 真实近铃与远风车完整同框、左右分开，主体尺寸与遮挡均通过 |
| 旧镇明信片 | town / town-view | stone-arch, mountain, red-mailbox | 木栅已开；拱内山峰；红邮筒处于下半画面 |
| 可选完整来信 | 任意 area / valley-letter-view | memory-windmill, memory-town | 两真实主体同框；下节规定宽松摄影条件与线索顺序 |

每个必需目标必须在镜头前、未遮挡、可见比例至少 70%，且不能小到无法辨识。站在区域内只给线索，不自动盖章。快门需要先由 Engine 固定这一瞬间的 observation/pose，再将真实截图返回为 `take-photo {observation,thumbnail,capturedAt}`，避免截图和构图取自两帧。宿主应在截图期间禁用重复快门和移动，不允许任意外部投影绕过场景检查。

规则内部 `runtime.screen='photo'` 表示相机举起；UI 始终映射为 `screen='play',camera.active=true`。成功新快门自动放入 8 张候选底片 `film`，不强弹确认模态；满时淘汰最早候选，精选、主卡、回信与完整来信的独立副本仍保留。按 C 退出相机；J/M/暂停关闭时返回原来的相机状态。

## 完成、相册与重载

两张摄影卡可任意顺序完成，教程和发现数量不锁主线。可一开始去山脊拍自由照片并 `select-ending-photo`。两张印记齐全且选过自己的照片后，任意邮筒 `interact` 都可寄出；`mailed=true` 后进入 ending 并启动夕阳。`finish-ending` 返回自由探索。若看结尾途中退出，重新继续会回到结尾。

精选相册仅 12 张，候选底片最多 8 张。`keep-photo {photoId?,replaceId?}` 可将指定底片收入精选；不传 ID 时选当前兼容 draft 或最新底片。满精选时须显式选择替换。`delete-film-photo {photoId}` 只移除候选；`delete-photo` 只移除精选。主线卡照、选定回信、完整来信均独立保存，删除或淘汰底片不会影响它们。选回信和替换完整来信的候选包含底片。寄出后回信内容不再变更。

六个发现为 `hidden-trail/old-stamp/lost-postcard/sunset-seat/wind-song/last-letter`，只按首次发现计数，重复互动可重读。最后一封信在旧镇桥后的小院，镇印记解锁后才能读。

V4 存档为 `{game:'shanye-laixin',version:4,photoTable,journey}`。运行时每份照片仍是完整 `Photo`，只有序列化将相同 ID / 内容的照片存一次，其它位置记录引用；异常历史副本如果同 ID 内容不同，也分配不同引用保留，不静默覆盖。恢复后各独立副本重新复制。旧 V1/V2/V3 仍读取原嵌入照片格式；旧 `pendingPhoto` 进入底片、字段清空，保留普通选片与删除入口。旧照片不猜测原图、天气或机位。V1 兼容早期原始旅行册 `{version:1,completed,gateOpen,photos,selectedPhotoId,discoveries:string[],player,...}`，不猜测其它项目格式。

混合容量通常按 16 张不同的历史 180k 照片（12 精选、2 主卡、回信、完整来信）加 8 张不同的新 80k 底片计算，照片约 3.52M 字符。旧 draft 刚迁入底片且尚未淘汰时，更保守上界为 17 张旧图加 7 张新图，约 3.62M 字符，加有限元信息仍低于固定 4.2M 上限。全新集合更小，常见共享照片再按 ID 去重。定向测试覆盖完整混合存档的保存恢复及旧大 draft 迁移；先前隔离 Chromium 实测单 key 值上限 5,242,856 字符，其它浏览器与已有 origin 占用不由此保证。

恢复时去重、限制数组和文本、校验位置/图片/编号、补齐默认设置，拒绝未来版本。runtime 上下文、焦点暂停原因、滑索瞬时进度与倒计时不会恢复；新页面先停在主菜单。

## 天气、摄影与原图

共享类型来自 `assets/shared/photography-contract.ts`。`durable.weather` 为 morning/rain/afterglow，`durable.photography` 记录 mode/lens/exposure/pose/viewpoint/timerSeconds。`set-weather {weather}` 与 `set-photography {settings}` 修改请求设置；实际天气过渡、碰撞、焦段 FOV、代拍人物与真实机位由宿主和控制器应用。首次寄信当次切换 afterglow，此后仍可自由换天气。

`durable.weatherCycle` 保存稳定 `seed`、周期序号 `cycle`、已过有效秒数 `elapsedSeconds` 与本轮长度 `durationSeconds`。周期为 210–300 秒，只随正常 active tick 前进，暂停、隐藏、菜单、旅行册等模态期间不前进。`createJourney(spawn,{weatherSeed})` 接受 Engine 在新旅程时生成一次的 uint32；加载沿存档种子，旧 V4 缺字段及 V1/V2/V3 使用固定兼容种子，不在恢复时随机重抽。

`weatherForecast(durable)` 与 `VM.weather.forecast` 只给 `observedAtSeconds/changeInSeconds/probabilities`。三个天气概率为整数百分比且合计 100，按当前天气与周期调整，不暴露将来的实际结果。到期再按稳定种子加权选一次，可选中非最高项，也可能延续当前天气。每次手动 `set-weather`（包括同一天气）都会重置本轮并重新预测，同时取消已有倒计时而不会启动快门。自然到期只有真实天气改变才发 `weather:changed`；若恰好与拍摄倒计时同 tick 到期，天气变更与取消优先，不发 `photo:timer-ready`。Engine 在真实 capture pending 期间冻结有效 tick，保证快门场景描述来自同一已应用帧。

所有快门入口由宿主发送 `begin-countdown`。0 秒只发 `photo:timer-ready`；3 秒设置 `runtime.countdownSeconds`，有效 tick 走完仅发一次 ready 并清空。ready 不生成照片或奖励，Engine 此时再固定真实画面，经 Frontend 原图与缩图成功返回后提交 `take-photo`。离开相机、暂停/隐藏/UI 模态、返回菜单、实际修改天气或摄影设置都会取消倒计时；`cancel-countdown` 可主动取消。没有成功截图不增加照片数，也不盖章。

`take-photo` 可携带真实快门帧的 `scene?:PhotoSceneRecord` 与 `original?:OriginalPhoto`。规则只清洗并深拷贝事实描述，不以设置值补造缺失的旧照片信息。原图仅保存 IndexedDB key、原生尺寸、MIME 与字节数，完整原图字节不进入 localStorage。`cleanOriginalPhoto/cleanPhotoScene/cleanPhotography/isWeather` 供 Engine 边界复用。`export-photo` 属于 Frontend 原图下载动作，规则 adapter 返回 null，不能伪造导出成功。


## 可选完整来信

共享协议在项目 `production/VALLEY-LETTER-CONTRACT.md`。唯一事件 ID 是 `valley-letter`，线索由既有 `lost-postcard` 与 `sunset-seat` 发现派生，没有额外集齐数、坐下动作或等待门槛。主线卡与最终寄信条件不变。

`evaluateMemoryFrame` 只看世界提供的宽松区域 tag 与两个真实投影：中心在 0.03..0.97、可见比例至少 0.65、没有遮挡、宽高至少 0.008、面积至少 0.00012、主体中心间距至少 0.08。左右顺序不限，也不靠 area 标签、线索状态或主线印记假定成功。每张快门照片都按当时构图记录 `memoryCandidates`；失败仍是自由照片。宿主负责真实截图与几何来源，测试中的合格投影不代替画面验收。

两处线索均读过时，新合格快门携带有效截图即可展开来信，不占相册位置。如果先拍后读，仍在底片、精选、回信或卡照中的合格照片会在后续读线索时自动认出；已删除或被容量淘汰且没有其它独立副本的底片不会认出。完成时独立复制整张照片到 `durable.memories['valley-letter']`，只发一次 `memory:unlocked`。之后删除普通相册照片、删除底片或重载，都不清空来信图片或重播奖励。

后续快门不自动替换信图。已有完整来信的玩家可从有效候选中显式选择，发送 `replace-memory-photo {memoryId:'valley-letter',photoId}`；成功只发 `memory:photo-replaced`，原首次完成时间不变。UI 使用 `memories` 和 `camera.memory` 投影，信页嵌于既有发现页；照片来自独立副本，不回查相册。损坏的记忆照片仅丢弃该可选记录并提示，不删除其它旅行进度。

## 定向验证

```sh
pnpm exec vitest run assets/journey/__tests__
```

规则用例覆盖两条主线顺序 × 四处邮筒、摄影几何反例、可选教程、六发现、相册满、独立回信、暂停/相机/滑索/桥、安全重载、V1/V2/V3 迁移、损坏与未来存档、配额错误及 UI 投影。来信用例覆盖线索/快门的六种顺序、真实图片载荷、独立副本、相册满与删除、首次奖励去重、主动换照和真实构图反例。规则测试不证明画面、真实输入、平台存储、路线可走或实际 30–45 分钟体验；这些应沿正式工程普通入口验收。没有强制等待来凑时长。
