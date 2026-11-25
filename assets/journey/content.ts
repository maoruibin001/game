import type { AreaId, DiscoveryId, Pose, Settings } from './types.ts';

export const SAVE_KEY = 'shanye-laixin.journey.v2';
// Keep the device slot stable: the envelope owns schema version, not the historical key suffix.
export const SAVE_VERSION = 6;
export const ALBUM_CAPACITY = 12;
export const FILM_CAPACITY = 8;
export const CAPTURE_THUMBNAIL_MAX_LENGTH = 80_000;
// Old V1–V3 images retain their historical budget. New captures use the smaller cap above.
export const THUMBNAIL_MAX_LENGTH = 180_000;
// 16 distinct legacy 180k images + 8 new 80k film images + bounded metadata fit.
// V4 also serializes shared photo IDs once; original image bytes live outside this save.
export const MAX_SAVE_LENGTH = 4_200_000;
export const DEFAULT_POSE: Pose = { position: [0, 0, 0], yaw: 0, pitch: 0, area: 'post' };
export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8, musicVolume: 0.55, ambienceVolume: 0.75, effectsVolume: 0.8,
  sensitivity: 1, invertY: false, cameraAssist: true, quality: 'high', reducedMotion: false,
};
export const AREA_LABELS: Record<AreaId, string> = { post: '山口邮局', forest: '风来林地', town: '石巷旧镇', ridge: '山脊观景站' };
export const POST_OPENING_HINT = '看看门外木架上的信封。按 C 举机，横着走几步，把远处的山尖装进去。';
export const MOUNTAIN_LETTER = {
  title: '能不能寄我一座山？',
  body: '今天走不开，见不到山。门外木架上有只空信封。你拿相机替我装一座进去，好吗？——阿禾',
  responses: [
    '我收到啦。信封里还是空的，山倒在旁边站得好好的。它大概还没想出远门。——阿禾',
    '我拆开信，山尖露出来了。把它放在窗边，忙完一抬头就能看见。——阿禾',
    '两座都寄来了？你替我看看，我家门有那么宽吗？——阿禾',
  ],
  labels: ['山还在信封外', '装进一座山', '装进两座山'],
  request: '旅人你好。阿公那张旧合影，我只剩这一角了。你能找找他当年按快门的地方，替我补拍一张今天的吗？东岭能望见两条路。请拍两张，一张告诉我在哪拐，一张让我认得到了哪里。——阿禾',
  oldPhotoBack: ['红瓦旁有风车。', '那扇窗把远处一道檐框在里面。'],
} as const;
export const FREE_PHOTO_HINT = '自由取景：喜欢的风景都可以拍，不必对齐旧卡。';
export const VALLEY_LETTER = {
  title: '山谷并不远',
  fragment: '阿禾：桥修好了。我把剩下的话折在东岭那张朝南的长椅旁。回头看看，风车和旧镇的红屋顶会落在同一张照片里。等你拍到它们，就知道我说的“离得不远”是什么样子。——后半页被雨浸掉了。',
  seatNote: '椅边压着一张折纸：回头看看风车和旧镇的红屋顶，给它们拍张合影吧。若还没读过那封残信，它在旧镇东侧的屋后。',
  complete: '阿禾：\n\n桥修好的那天，我从风车下走来，你从镇口出发。我们都怕让对方多等，反倒各自绕了一小段路。后来才发现，坐在这张椅子上，两边都看得见。\n\n我把信折在这里。你若来得晚，就先坐一会儿，看看红屋顶，再看看风车。照片把两条路放在了一起；下次见面，我们慢慢走，不用谁赶着等谁。',
} as const;
export const CARDS = {
  forest: { title: '风来时的问候', clue: '让近处风铃与远处风车同框。', before: '沿林间邮路走走，旧卡里的风铃就在那附近。', after: '风车转起来了。你听，山谷回信了。' },
  town: { title: '门里的山', clue: '门里的山，才是归处。', before: '看看石拱旁的木栅。旧照片的视线，好像被什么挡住了。', after: '桥已落下，街灯亮起。穿过旧街，去看看那座山吧。' },
} as const;
export const REPLY_LETTERS = {
  forest: {
    title: '阿公在风车下等我，哪儿拐弯？',
    body: '阿公把午饭落在家里了。我提着饭盒到了旧镇，两条小路看起来一模一样。走林间近路，拍一张红箭头和风车，我就能认出拐点。要是你看见铃架和风车，那张也行。走东岭的话，帮我拍两张吧，一张是长椅旁的红箭头，一张是要走到的风车。我把它们照顺序叠在饭盒上。——阿禾',
    response: '我看见红箭头才敢拐弯。再走两步，就听见阿公喊我了。红饭盒搁在铃架下面，你要过来，给你留了半块葱饼。——阿禾',
    chimeResponse: '我照着你拍的铃架找到了风车。阿公远远看见饭盒，就朝我招手。我们在铃架下给你留了半块葱饼。——阿禾',
    pairResponse: '第一张的红箭头让我知道从长椅哪边拐，第二张的风车让我认出了来路。老窗在石巷那一侧。回到石拱，过桥走进钟院，再沿山门后的石阶上去。到了窗边，拿旧照背面的两句话比一比。——阿禾',
    ridgeResponse: '我拿着照片转了个身，把自家的红屋顶放到身后，就知道风车在山谷哪头了。阿公已经吃上了。路过铃架，记得掀一下红饭盒的盖子，葱饼还热。——阿禾',
  },
  town: {
    title: '门后的山和屋檐，还在吗？',
    body: '镇口木屏后面，曾经能看见山；过了小桥，还有一处避雨的屋檐。替我带一张今天的照片吧。晴天看看门里的山，遇雨就到檐下坐坐，不必为了这封信等天气。',
    response: '山还在门里，红邮筒也没有搬走。原来有些地方不是消失了，只是太久没人回头看。谢谢你把今天的旧镇寄给我。',
    courtyardResponse: '屋檐还留着，钟绳也有人补过。你拍到的那处空位，就是我从前放行李的地方。如今它还能让路过的人歇一歇，这就很好。',
    rainResponse: '照片里的雨，让我又想起檐下的那一小段路。',
  },
} as const;
export const FINAL_REPLY = {
  title: '这一路，你最想留下哪一刻？',
  body: '前两封是替别人看看，这一封留给你自己。可以去东岭长椅上回望，也可以选一张早已拍好的照片。不必等日落，也没有标准构图。等你选好，就把今天寄回去。',
  response: '这一次，信封里有你自己选的风景。有人托你看看旧地方，你也给今天留了一页。等下一次想起山谷，就从这张照片开始吧。',
  noteOptions: ['原来离得并不远。', '我想记住这阵天色。', '下次，我还会慢慢走。'],
  // The postcard is a receipt for the day, not the end of the old photo: hand the thread back to the window.
  oldWindowPostscript: '附：明信片我收下了。阿公那张旧照还缺一扇窗——过了落桥，去上院客堂找找吧。山下那扇窗替你留着。阿公说，他看见金柳，就从老窗边把灯挑过屋脊。',
} as const;
export const DISCOVERIES: Record<DiscoveryId, { title: string; area: AreaId; description: string; letter: string; kind: string }> = {
  'hidden-trail': { title: '一条没人催你走的小路', area: 'forest', kind: '小径', description: '树根旁的脚印通向林间高处。', letter: '路牌只写了大路。小路留下来，是给愿意多看一眼的人。' },
  'old-stamp': { title: '山谷旧邮戳', area: 'forest', kind: '邮戳', description: '林地木桌上的一枚旧邮戳，印着山与风。', letter: '收信人搬走了，山还在。邮戳也就一直没换。' },
  'lost-postcard': { title: '没有寄出的夏天', area: 'town', kind: '旧信片', description: '旧镇东侧屋后的木托上，有一封被雨浸掉半页的信。', letter: VALLEY_LETTER.fragment },
  'sunset-seat': { title: '留给你的长椅', area: 'ridge', kind: '视点', description: '东岭长椅朝向山谷，椅边压着一张折纸。', letter: VALLEY_LETTER.seatNote },
  'wind-song': { title: '风替人说的话', area: 'forest', kind: '声音', description: '不同长度的风铃，藏着一段熟悉的旋律。', letter: '有人说风没有记性。我把铃挂起来，才发现它每次都认得回家的路。' },
  'last-letter': { title: '山谷的回信', area: 'town', kind: '短信', description: '小院门打开后，墙上露出一封短短的信。', letter: '谢谢你来看它们。老地方也会变，但只要有人愿意走近，就总有新的风景。' },
};
export const INTRO_LETTER = '阿禾托我问你，能不能寄她一座山？门外木架上有只空信封。——山口邮递员';
export const ENDING_LETTER = FINAL_REPLY.response;
export const CONTROL_HINTS = { move: 'W/A/S/D 移动与转身 · Shift 跑步 · 空格跳跃', look: '拖动鼠标或 ←/→ 转动视角', camera: 'C 举起相机', shutter: '快门按钮 / 空格 拍照', interact: 'E 互动', journal: 'J 旅行册', map: 'M 地图', pause: 'Esc 返回 / 暂停' } as const;
