import type { AreaId, CardId, PhotoSceneRecord, Pose } from './types.ts';

export interface PhotoCaptionContext {
  area: AreaId;
  pose: Pose;
  scene?: PhotoSceneRecord;
  matchedCards: readonly CardId[];
  courtyard: boolean;
  memory: boolean;
  postPorch: boolean;
}

const SPOTS: readonly { position: readonly [number, number]; radius: number; line: string }[] = [
  { position: [-3, -228], radius: 14, line: '山口老邮局的门廊还留着出发时的暖意，老邮差正守在旧木柱旁。' },
  { position: [-186, -16], radius: 16, line: '滑索木架沿着风向伸向山口，下面是一整片起伏的松林。' },
  { position: [-182, -27], radius: 14, line: '林间木桌上的旧邮戳刻着四个风向，风吹过风车时会轻轻响起来。' },
  { position: [-176, -153], radius: 18, line: '杉影小路比大路安静得多，泥土里还留着旧邮差绕行的脚印。' },
  { position: [-229, 61], radius: 22, line: '站在西坡高处听风穿过松针，远处的山脊像一层层安静的浪。' },
  { position: [176, 26], radius: 14, line: '旧镇东屋后的砖墙与窄巷，藏着平时赶路容易错过的安静一面。' },
  { position: [64, 204], radius: 20, line: '在东岭朝南的长椅边回望，两条曾经分开的邮路同时落在眼前。' },
  { position: [0, 235], radius: 24, line: '山脊观景台的木檐挑向整座山谷，云影从脚下慢慢飘过去。' },
];

function timeMood(minute?: number): string {
  if (minute === undefined) return '白昼';
  if (minute < 360 || minute >= 1130) return '夜色里的暖灯';
  if (minute < 480) return '清晨薄光';
  if (minute < 1000) return '白日晴朗的光线';
  if (minute < 1100) return '傍晚斜照';
  return '暮色刚落下来时';
}

export function composePhotoCaption(ctx: PhotoCaptionContext): string {
  const weather = ctx.scene?.weather;
  const minute = ctx.scene?.clock?.minute;
  const night = minute !== undefined && (minute < 360 || minute >= 1130);
  if (ctx.matchedCards.includes('forest')) {
    return weather === 'rain' ? '细雨停在近处的铜铃上，远处风车还慢慢转着，两阵风留在了同一张照片里。'
      : night ? '夜风拂过木铃架，风车塔在山坡夜色里安静地站着。'
        : '近处的风铃和远处的风车站在一起，木架旧了，风还是认得路。';
  }
  if (ctx.matchedCards.includes('town')) {
    return weather === 'rain' ? '木屏打开后，细雨正落过石拱和红邮筒，门里的双峰在雾气里很轻。'
      : night ? '夜灯亮起时穿过石拱门望向远山，红邮筒静静立在巷口。'
        : '木屏打开以后，近处的红邮筒、石拱门和远方的双峰又一次站在了一起。';
  }
  if (ctx.courtyard) {
    return weather === 'rain' ? '站在听雨钟院的檐口外，雨点敲过瓦片，铜钟挂在檐下听见这一阵风。'
      : '听雨钟院高挑起的瓦檐下，修缮过的铜钟安静地垂在木架中间，院里正好可以歇脚。';
  }
  if (ctx.memory) {
    return '站在东岭长椅旁向山谷回望，风车塔与旧镇红屋顶终于被收进同一张底片。';
  }
  if (ctx.postPorch) {
    return '临出发前回望山口邮局的木门与檐线，好像刚刚把今天的第一页翻开。';
  }
  const near = SPOTS.find(s => Math.hypot(ctx.pose.position[0] - s.position[0], ctx.pose.position[2] - s.position[1]) <= s.radius);
  const placeLine = near?.line ?? ({
    post: '山口旧邮局前的空气很宽阔，小路从脚下延伸进山谷。',
    forest: '风来林地的针叶与黄叶错落在一处，每走几步光影都会换个样子。',
    town: '石巷旧镇的石墙和屋瓦叠在一起，拐过街角就能看见另一侧的山坡。',
    ridge: '沿着山脊古道往高处走，整个山谷的风和云都变得很近。',
  }[ctx.area]);
  const weatherLine = weather === 'rain' ? '细雨打湿了屋瓦与石径。'
    : weather === 'afterglow' ? '多云把光拉得很软，远山多了一层薄雾。'
      : `${timeMood(minute)}落在山坡上，轮廓清晰又温和。`;
  const frameLine = ctx.scene?.mode === 'portrait'
    ? ({ look: '镜头留住了自己站在风里远望的背影。', wave: '对着镜头轻轻挥了挥手，替今天的自己打个招呼。', letter: '低头把信纸捧在手里，让山谷一起入镜。' }[ctx.scene.pose])
    : ctx.scene?.lens === 'detail' ? '拉近了焦段，只留下这一小角耐看的细节。'
      : ctx.scene?.lens === 'wide' ? '广角把前景的路与远方的山色一并带回来了。' : '';
  return `${placeLine}${weatherLine}${frameLine}`.slice(0, 140);
}
