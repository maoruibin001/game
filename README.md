# 拍一卷山色

[快速运行与开发](开始运行.md)

[本轮制作清单与验收顺序](docs/2026-11-19-拍一卷山色制作清单.md) · [Agent 试玩指南](docs/agent-play-guide.md)

一段可以自由选路的体素山谷旅行。带上两张缺角的旧明信片，用相机找回照片里的风景，让风车转动、旧桥落下，最后寄出一张属于自己的明信片。

参赛主版本为桌面网页，正式 @forgeax/engine@0.5.0 与 zaohua-platform-sdk@0.2.0。完整设计与制作规格见上层 GAME-DESIGN.md、PLAN.md、SCENE-PIPELINE.md。当前处于实现和运行验收阶段；本轮 P0 证据另存于上层 production/sprint-p0-20261116/，历史状态与新候选分开记录，最终通过及发布不能仅由本地构建推定。

## 操作

| 操作 | 键鼠 |
| --- | --- |
| 行走并转身 | W A S D（人物朝向行进方向，镜头保持稳定） |
| 快走 | Shift |
| 转动视角 | 左键 / 右键拖动，或 ← → |
| 举起 / 放下相机 | C / Q |
| 相机取景 | 右键拖动或 ← → 转镜头；W A S D 慢走微调；A / D 平移 |
| 快门 | 左键 / 空格 / F |
| 情境互动 | E |
| 地图 | M |
| 旅行册 | J / Tab |
| 返回或暂停 | Esc |
| 自救复位 | HUD 或暂停菜单中的「回到最近小路」 |

「回到最近小路」保留照片和旅途进度，按当前门桥状态返回可达路点；不会代替解锁机关。

从山口可以先去风来林地，也可以先去石巷旧镇。用合格照片在旅行册里回答前两封来信，再为第三封选择一张自己的照片，到任意邮筒确认寄出。阿禾的回信也可以用林地指路构图或东岭指路照片完成，无需先拿到林地印记。六处往事与额外摄影为自由探索内容，主线结束后仍可继续旅行。

旧镇留下的残信与山脊长椅还连着一个可选摄影事件。找到线索，把沿途两处地标留在同一张真实照片里，就能读到一封完整来信。信中的照片独立保存在旅行册中，可以明确选择另一张合格实拍来替换。

旅行进度与照片自动保存在当前浏览器的本地设备存档中；请使用同一浏览器与同一访问地址继续旅行。V6 存档可以读取本作较早的 V1–V5 进度。照片原图保存在同一浏览器的 IndexedDB 中。

## 版本和正常开发入口

Node >=22.13，pnpm12.15.0；Engine 固定 0.5.0，造化平台 SDK 固定 0.2.0。

```sh
pnpm exec forgeax project check --json
pnpm test
pnpm typecheck
pnpm exec forgeax project build --json
pnpm exec forgeax project preview --port 59562 --json
pnpm exec forgeax dev start --headless true --backend auto --json
pnpm exec forgeax dev status --json
```

正常造化预览使用造化插件的 Preview。完整游戏验收采用正式SDK的 owner 浏览器和正常键鼠操作，截图、实际运行和平台适配各自留证。旧ForgeaX MCP入口仍存在rc.2版本绑定；本工程通过正式0.5.0 SDK运行，不因此降级。造化多模块HTML适配修复候选已在本工程完成正常构建和入口适配，平台校验、正式账号授权、远端上传及赛事提交分别留证，见上层 production/pipeline/ 与 production/submission/。

## 内容与来源

- 原创世界、道路、角色、摄影与旅途状态实现位于 assets/。
- 地标制作源由本任务编写，经过现有 Scene Foundry 实际体素编译、合并与原生网格输出；并非模型worker生成成功记录。完整来源见上层 production/pipeline/。
- 三段配乐的旋律、节奏与和声为本作新编原创；保留MIT许可的Shanshui合成代码。三段原生音频由正常Pack构建产生，曲谱、许可和可追溯来源位于 assets/music/。早期素材库曲谱已移出活跃资产根，不再用于本作。
- 原创界面、地图与声音由本项目编写，真实照片来自游戏自身画布；没有图像时不以插画替代玩家照片。
- 使用ForgeaX正式game-3d模板初始化，旧展示资产已移到上层 production/template-reference/，只保留当前测试所需的可复用fixture；详见 docs/template-disposition.md。

该工程的游戏绑定、构建产物、运行验收和赛事投稿分别记录。开发资料和本机状态不进入公开上传产物。

## 配乐音源代码署名与许可

# Third-party synthesis code notice

Only the Shanshui synthesis equations are used by these new compositions. The original score, MIDI pitches, rhythm, harmony, form and cue design below are authored for 山野来信 on 2026-11-16.

### shanshui

MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
