# 拍一卷山色 · 玩家与摄影控制

正式入口：`installTravelController(options)`。在拥有 world/gameHost 的原生 Plugin 的 `ctx.effect` 中调用，清理时 `yield handle.dispose`。不需要新增根 Pack；不启用模板 player/camera 插件。引擎仍为 ForgeaX 0.5.0。

位置是**脚底坐标**；世界回调 `terrainHeight / resolveMove / traceSegment` 由 `world-layout.ts` 提供。人物 root 使用脚底原点且不要挂与 CPU 移动相争的 `CharacterController`。若使用官方中心原点模板网格，传 `modelOffsetY: .93`。当前移动明确属于游戏侧高度/AABB碰撞，并未冒称整块体素地形已有 Rapier 碰撞。

```ts
const handle = installTravelController({
  world:ctx.world,host:ctx.gameHost!,player,camera,
  spawn:WORLD.spawn,initialYaw:Math.PI,
  terrainHeight,resolveMove,traceSegment,
  visibilityRoot:avatarRoot,joints:avatarJointHandles,
  onAction:({type,state})=>dispatchGameplayAction(type,state),
  onFrame:state=>publishJourneyState(state),
});
yield handle.dispose;
```

控制：WASD/方向键移动，Shift 快走，按住鼠标左键或右键拖动观察。C/Q 举起相机，点击快门按钮或按 Space/F 拍照，E 互动，M 打开地图，J/Tab 打开旅行手册，Esc 先放下相机。摄影时移动速度为 2.2 m/s，仍使用同一地形与碰撞。`controller.action(...)` 是界面操作入口。`setPaused(true)` 用于菜单、平台暂停及截图请求。恢复输入前须放开原键。UI 在输入所有权切换时清除旧按键，并在非模态摄影控件操作后把焦点还给画布。

`onAction` 收到 `camera-enter / camera-exit / shutter / interact / pause / map / journal / zipline-start / zipline-land`。快门前先同步取景pose；真正截图仍由Engine等Native Camera/人物写完且完成渲染帧后提交。`snapshot()`为只读复制，暴露position、mode、camera、speed、distanceWalked、stepPhase、posePhase、ziplineProgress、avatarVisible及photography。

`configurePhotography(settings: PhotographySettings)` 使用共享photography-contract；重复相同配置幂等。手持landscape隐藏完整人物，镜头随慢走移动；portrait使用同一个Native Camera，围绕当前脚点与玩家选定背景生成中间/左/右三个真实候选。机位检查地形、墙体射线、人物帽顶/肩/脚的入镜和遮挡。相机位置固定后，WASD仅慢移人物，RMB在±.45弧度水平、±.28弧度俯仰范围微调画面；换mode/lens/viewpoint从当前脚点重新摆机位。三焦段真实FOV为60°/42°/28°。无法摆放的候选明确返回不可用，不把相机放入障碍物。

`snapshot().photography`包含actual applied的`settings`、`candidates[{index,available,reason,position}]`、`selectedViewpoint`、`availableViewpoints`、`candidateAvailable`、中文`candidateStatus`与`subjectVisible`。Engine按candidateAvailable拒绝无效代拍快门并显示原因。候选被挡或人物走出框后会重新给出真实不可用状态；控制器只发快门意图，不伪造照片。

`setPaused(true)`冻结镜头、人物位置/朝向、步态和posePhase；摄影配置和宽高比请求排队到unpause再应用，snapshot保持已应用值。Native系统仍发布相同冻结Transform，使同一轮收到“换姿势+快门”时第一个完成帧也包含选中的姿势，随后不漂移。曝光和倒计时由Engine/规则管理，控制器不另开计时器或渲染器。

摄影：`projectAnchor(camera,{position,size:[width,height,depth],right?},0,traceSegment)` 返回rules兼容的中心x/y、width/height、depth、visibleFraction、occluded，另有visible/screenRadius。x/y为0..1，y向下，depth前方为正。`right`指定建筑开口的水平轴；此时投影竖直矩形开口，不投影建筑包围盒。`cameraRay(camera,x=.5,y=.5)` 返回世界射线。世界遮挡在subject前12厘米截断，避免挂墙被摄物自遮挡。暂不做多采样部分遮挡；visibleFraction是屏幕内比例，occluded为中心射线判断。

滑索：规则解锁并且玩家到达入口后调用 `startZipline(WORLD.zipline)`；距离检查默认6米，沿start/points/end以20m/s运动（挂接8m/s、落地段6m/s），最多2米垂弧，默认跟随路线；按住RMB可自主环顾，松手1.25秒后平滑回到路线方向。镜头距离在挂接/落地时平滑变化；末端贴地、释放输入门并发`zipline-land`。暂停可中止计时，不能摄影/交互打断中途状态。正常读取存档用`restore(position,yaw)`，会贴地并释放输入门。

`setLookSettings({sensitivity,invertY,reducedMotion})` 将存档里的镜头设置同步到实际控制。三焦段入口是configurePhotography；保留setPhotoFov(radians)作为低层兼容入口，截图冻结期间不改变镜头。

人物可提供left/rightArm、Forearm、Leg、chest、head、cameraProp和可选letterProp，保留原AvatarJoint及脚底/肩/髋pivot。look/wave/letter真实写Native Transform；wave的摆臂沿posePhase，letter显示root-child信纸于[0,1.05,-.36]并低头持纸，其余姿态隐藏信纸。手持隐藏完整人物，代拍恢复原scale；相机必须在visibilityRoot之外。

此模块的纯逻辑测试不等于实际浏览器/画面验收；官方`project play`由集成负责人验证。
