export const FLOWERS = {
  gold: '金柳',
  scarlet: '朱红',
  silver: '银羽',
  twins: '并蒂',
  rain: '听雨珠',
  wheat: '麦浪',
  swallow: '折燕',
  pine: '松针',
  moon: '月渡',
  stars: '千星归谷',
} as const;

export type FlowerKind = keyof typeof FLOWERS;

export const FLOWER_ORDER = ['gold','scarlet','silver','twins','rain','wheat','swallow','pine','moon','stars'] as const;

export function isFlowerKind(value: unknown): value is FlowerKind {
  return typeof value==='string' && Object.hasOwn(FLOWERS,value);
}

export const COMMISSIONS = {
  silver: {
    title:'寄给林地的风向',
    brief:'到风来林地，把风向标和风车拍进同一张。交到林地长椅旁的收件匣。',
    pickup:'forest-request', delivery:'forest-inbox',
  },
  twins: {
    title:'两张底片给东岭',
    brief:'给阿禾拍东岭的转弯处与抵达处。从邮局寄出两张指路照片，再在回邮格领盒。',
    pickup:'ridge-request', delivery:'ridge-request',
  },
  rain: {
    title:'钟响过哪一道檐',
    brief:'从钟院的檐下拍清铜钟和檐口。晴天也可以在钟亭交件。',
    pickup:'bell-inbox', delivery:'bell-inbox',
  },
  wheat: {
    title:'歪路碑的来路',
    brief:'先在旧镇辨认歪斜路碑，再到镇南晒谷场。从场边把里程牌和来路拍进同一张。',
    pickup:'town-milepost', delivery:'field-inbox',
  },
  swallow: {
    title:'折纸寄回东岭',
    brief:'看过旧镇的墙缝藏信后，循折纸到东岭长椅回望，把风车和红屋顶一起拍下。',
    pickup:'ridge-fold', delivery:'ridge-fold',
  },
  pine: {
    title:'松枝背后的旧镇',
    brief:'在半山松台回望，找一个近松不遮屋顶的角度，拍下近松、旧镇与远山。',
    pickup:'pine-inbox', delivery:'pine-inbox',
  },
  moon: {
    title:'少了一角的月亮',
    brief:'花街开市后读灯谜。把缺月灯和它落在旁边墙上的月影一起拍下，再交给谜摊。',
    pickup:'moon-riddle', delivery:'moon-riddle',
  },
  stars: {
    title:'把这一卷寄给自己',
    brief:'完成山谷回信，在山口邮局选一张白日行迹和一张夜色记忆，排成对页寄出。',
    pickup:'day-night-post', delivery:'day-night-post',
  },
} as const;

export type CommissionKind = keyof typeof COMMISSIONS;
export const COMMISSION_ORDER = ['silver','twins','rain','wheat','swallow','pine','moon','stars'] as const;
export type FlowerSubject = 'silver'|'wheat'|'pine'|'moon';

export function isFlowerSubject(value: unknown): value is FlowerSubject {
  return value==='silver'||value==='wheat'||value==='pine'||value==='moon';
}

export const COMMISSION_STOPS = {
  'forest-request':{ title:'林地委托架', x:5.7,z:-228.1, radius:2.4 },
  'forest-inbox':{ title:'林地收件匣', x:-174,z:-48.4, radius:2.4 },
  'ridge-request':{ title:'东岭回邮格', x:8.9,z:-229.8, radius:2.2 },
  'bell-inbox':{ title:'钟亭收件匣', x:155.5,z:39.7, radius:2.3 },
  'town-milepost':{ title:'旧镇歪路碑', x:153.3,z:-28, radius:2.5 },
  'field-inbox':{ title:'晒谷场邮包架', x:140.7,z:-42, radius:2.4 },
  'ridge-fold':{ title:'长椅的折纸夹', x:64,z:204, radius:3 },
  'pine-inbox':{ title:'半山回山亭', x:159.6,z:76.5, radius:2.1 },
  'moon-riddle':{ title:'花街谜摊', x:132.4,z:-19.5, radius:1.7 },
  'day-night-post':{ title:'邮局自己的邮格', x:1.8,z:-228.6, radius:2.3 },
} as const;
export type CommissionStop = keyof typeof COMMISSION_STOPS;
