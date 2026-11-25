import type { AnchorShape, Vec3 } from '../controller/types.ts';
import { PHOTO_ANCHORS, terrainHeight } from '../shanye-world/world-layout.ts';
import { FOREST_CHIME_PROXY_IDS } from '../shanye-world/forest-composition.ts';
import { COURTYARD_PHOTO } from '../shanye-world/courtyard.ts';
import { POST_PORCH_PHOTO } from '../shanye-world/post-photo.ts';
import { HALL_WINDOW } from '../shanye-world/afternoon-layout.ts';
import { NIGHT_STOPS } from '../shanye-world/night-layout.ts';
import { SIXTH_ROOM } from '../shanye-world/sixth-layout.ts';
import { CLIFF_PINE, CLIFF_PINE_PROXIES, ridgeArrow } from '../shanye-world/scene-details.ts';
import { HERO_MOUNTAIN_BOXES } from '../shanye-world/hero-mountain.ts';

export interface CommissionSubject {
  label: string;
  shape: AnchorShape;
  own?: string | ReadonlySet<string>;
  /** The actual exterior sample mesh requires a more accurate test than its collision boxes. */
  postal?: 'door' | 'eave';
}
interface CommissionSite {
  group: string;
  instruction: string;
  subjects: readonly CommissionSubject[];
  window?: 'day' | 'night';
  hidden?: true;
}

const subject = (label: string, shape: AnchorShape, own?: string | ReadonlySet<string>): CommissionSubject => ({ label, shape, own });
const prop = (label: string, position: Vec3, size: Vec3, own?: string) => subject(label, { position, size }, own);
const grounded = (label: string, x: number, z: number, lift: number, size: Vec3, own?: string) =>
  prop(label, [x, terrainHeight(x, z) + lift, z], size, own);

const door = { ...subject('邮局门框', POST_PORCH_PHOTO.door), postal: 'door' as const };
const eave = { ...subject('廊下的长屋檐', POST_PORCH_PHOTO.eave), postal: 'eave' as const };
const chime = subject('铜风铃', PHOTO_ANCHORS.forest.anchors.chime, FOREST_CHIME_PROXY_IDS);
const windmill = subject('风车叶片', PHOTO_ANCHORS.forest.anchors.windmill, 'windmill-tower');
const arch = subject('石拱', PHOTO_ANCHORS.town.anchors.arch);
const ridgePine = subject('晚照崖横松', CLIFF_PINE, CLIFF_PINE_PROXIES);
const mountains = subject('拱后的双峰', PHOTO_ANCHORS.town.anchors.mountain,
  new Set(HERO_MOUNTAIN_BOXES.map((_, index) => `distant-crag-${index}`)));
const torch = ({x,z}: {x:number;z:number}) => grounded('火把架', x, z, 1.1, [.8,1.4,.55]);

export const COMMISSION_SITES = {
  'old-post': { group:'post', instruction:'把山口旧邮局的门框拍清楚。沿廊外找个能看到正面的地方。', subjects:[door] },
  'post-porch': { group:'post', instruction:'门框和廊下的长檐一起入镜，侧着取景也可以。', subjects:[door,eave] },
  'forest-clearing': { group:'forest', instruction:'林地空场旁找铜风铃。铃身、铃口都留在画面里。', subjects:[chime] },
  'forest-windmill': { group:'forest', instruction:'把铜风铃和它旁边的风车拍在一张里。留开一点，别让铃挡住叶片。', subjects:[chime,windmill] },
  'old-town': { group:'arch', instruction:'把旧镇石拱的拱身拍清楚。可以从拱前向两侧找角度。', subjects:[arch] },
  'town-arch': { group:'arch', instruction:'从石拱南面，把石拱与拱后的双峰一同留下。木屏已开时更容易看清。', subjects:[arch,mountains] },
  'ridge-station': { group:'ridge-station', instruction:'拍下山脊驿站旁的邮筒。绕着栏杆找一个能看清邮口的角度。',
    subjects:[prop('山脊邮筒',[11.75,97.55,233.25],[1.1,1.6,.65])] },
  'ridge-arrow': { group:'east-ridge', instruction:'在东岭长椅附近拍清指路牌上的红箭头，侧着拍也可以。', subjects:[subject('东岭红箭头',ridgeArrow(terrainHeight),'ridge-sign/board')] },
  'ridge-mail-road': { group:'east-ridge', instruction:'从晚照崖长椅附近找横松，拍清伸出去的枝条。各种天气和时刻都可以。', subjects:[ridgePine] },
  'courtyard-bell': { group:'bell', window:'day', instruction:'白天进钟院。找一个能同时看见铜钟和钟亭屋檐的角度。',
    subjects:[subject('铜钟',COURTYARD_PHOTO.anchors.bell,COURTYARD_PHOTO.anchors.bell.proxy),
      subject('钟亭屋檐',COURTYARD_PHOTO.anchors.eave,COURTYARD_PHOTO.anchors.eave.proxy)] },
  'monastery': { group:'hall', window:'day', instruction:'白天上禅院，拍清阿公的木窗。站在窗前、窗后都可以。', subjects:[subject('老窗木框',HALL_WINDOW)] },
  'flower-market': { group:'market', window:'night', instruction:'18:40 开市后，从东口进花街，找客栈旁的缺月灯。拍清灯身即可。',
    subjects:[prop('缺月灯',[134.55,26.1,-20.8],[.64,.84,.20])] },
  'night-torch-foot': { group:'south-gate', window:'day', instruction:'在山门台阶脚找火把架。把架上火把和木架一起留下。', subjects:[torch(NIGHT_STOPS.footTorch)] },
  'night-torch-upper': { group:'hall', window:'day', instruction:'白天沿石阶上到高处，在上院拍清火把架。', subjects:[torch(NIGHT_STOPS.upperTorch)] },
  'pine-firework': { group:'pine-terrace', window:'day', instruction:'白天到半山松台，回望阶下立在坡边的近松，树冠露清楚就行。',
    subjects:[grounded('松台下的近松',155.6,72.35,4,[2.2,1.2,2.2])] },
  'field-firework': { group:'field', instruction:'去镇外晒谷场，找场边那块小里程牌。让牌面和一点来路入镜。',
    subjects:[prop('晒谷场里程牌',[141.2,23.93,-41.7],[1.35,.65,.19])] },
  'sixth-room': { group:'photo-room', hidden:true, window:'day', instruction:'白天进照相铺内室。拍清暖灯边的旧合影，小屋里可以换个站位。',
    subjects:[{label:'内室旧合影',shape:{position:[SIXTH_ROOM.west+.29,SIXTH_ROOM.floor+2.06,SIXTH_ROOM.south+1.29], size:[1.78,.75,0], right:[0,0,1]}}] },
} as const satisfies Record<string,CommissionSite>;

export type CommissionSiteId = keyof typeof COMMISSION_SITES;
export const commissionSiteIds = Object.keys(COMMISSION_SITES) as CommissionSiteId[];
export function isCommissionSite(value: unknown): value is CommissionSiteId {
  return typeof value === 'string' && Object.hasOwn(COMMISSION_SITES, value);
}
export function commissionSite(id: CommissionSiteId): CommissionSite { return COMMISSION_SITES[id]; }
export function commissionTimeAllows(id: CommissionSiteId, minute: number): boolean {
  const window = commissionSite(id).window, day = minute >= 380 && minute < 1120;
  return !window || (window === 'day') === day;
}
