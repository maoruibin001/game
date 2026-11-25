import type { CardId, CompositionReason, CompositionResult, CourtyardCompositionResult, JourneyState, MemoryCompositionResult, MemoryId, PhotoObservation, PostPorchCompositionResult, ProjectedAnchor } from './types.ts';

const clamp = (n: number) => Math.min(1, Math.max(0, n));
function result(target: CardId | 'tutorial', reason: CompositionReason, hint: string, proximity = 0): CompositionResult {
  return { target, matched: reason === 'ready', reason, hint, proximity: clamp(proximity) };
}
function invalidAnchor(a: ProjectedAnchor | undefined): CompositionReason | null {
  if (!a || ![a.x, a.y, a.width, a.height, a.depth, a.visibleFraction].every(Number.isFinite)) return 'missing-landmark';
  if (a.depth <= 0) return 'behind-camera';
  if (a.occluded || a.visibleFraction < 0.7) return 'occluded';
  if (a.width <= 0 || a.height <= 0 || a.width > 4 || a.height > 4) return 'missing-landmark';
  if (a.x < 0.04 || a.x > 0.96 || a.y < 0.04 || a.y > 0.96) return 'outside-frame';
  if (a.width * a.height < 0.00025) return 'too-small';
  return null;
}
function contains(outer: ProjectedAnchor, inner: ProjectedAnchor, allowance: number): boolean {
  return Math.abs(inner.x - outer.x) + inner.width * 0.5 <= outer.width * (0.5 + allowance)
    && Math.abs(inner.y - outer.y) + inner.height * 0.5 <= outer.height * (0.5 + allowance);
}
const frameSubjects = {
  'forest-chime': '风铃', windmill: '风车', 'stone-arch': '石拱',
  mountain: '双峰', 'red-mailbox': '红邮筒', 'post-door': '邮局门洞',
} as const;
function reasonHint(reason: CompositionReason, id: keyof typeof frameSubjects): string {
  const subject = frameSubjects[id];
  if (reason === 'occluded') return `${subject}被挡住了。往旁边挪一步看看。`;
  if (reason === 'too-small') return `${subject}在画面里太小了。把镜头拉近一点。`;
  if (reason === 'behind-camera') return `${subject}在镜头后面。转身找找它。`;
  if (reason === 'outside-frame') return `${subject}出了画框。转动镜头，把它收进来。`;
  return `还没找到${subject}。看看旧卡上它的轮廓。`;
}

export function routeSignFrame(observation: PhotoObservation): 'ready' | 'mill-only' | 'sign-only' | null {
  if (observation.area !== 'forest') return null;
  const arrow = observation.anchors['postal-arrow'], mill = observation.anchors.windmill;
  const hasArrow = Boolean(arrow && !invalidAnchor(arrow) && arrow.width >= .026);
  const hasMill = Boolean(mill && !invalidAnchor(mill) && mill.height >= .085);
  if (hasArrow && hasMill && Math.abs(arrow!.x - mill!.x) > mill!.width * .29) return 'ready';
  if (hasMill && !hasArrow) return 'mill-only';
  if (hasArrow && !hasMill) return 'sign-only';
  return null;
}

export function cliffPhotoNote(observation: PhotoObservation, minute?: number, raining = false): string {
  if (observation.area !== 'ridge' || !observation.vantageTags.includes('valley-letter-view') || invalidAnchor(observation.anchors['cliff-pine'])) return '';
  if (minute === undefined || minute < 1000 || minute >= 1135) return '';
  if (raining) return '晚照崖落着雨。那棵横松只剩下一笔深色，石缝里的赭红倒显了出来。';
  const disc = observation.anchors['sun-disc'];
  if (disc && !disc.occluded && disc.depth > 0 && disc.visibleFraction > .75 && minute >= 1060) return '太阳挨着西山，横松伸出去的那一枝，像是在石崖上托住最后一点亮。';
  return '晚照崖的石壁分成冷暖两面。等我收起相机，山风还在慢慢梳那棵松。';
}

/** Shared main-card and daily-check-in condition for the two real forest subjects. */
export function evaluateForestSubjects(observation:PhotoObservation):CompositionResult {
  const target='forest' as const;
  for (const id of ['forest-chime','windmill'] as const) {
    const failure = invalidAnchor(observation.anchors[id]);
    if (failure) return result(target, failure, reasonHint(failure, id), .25);
  }
  const chime=observation.anchors['forest-chime']!,mill=observation.anchors.windmill!;
  if(chime.depth>=mill.depth*.8)return result(target,'depth-order','走到风铃南侧，让近处的铃和远处的风车一起入镜。',.4);
  if(chime.width*chime.height<.00045||chime.height<.025)
    return result(target,'too-small',reasonHint('too-small','forest-chime'),.5);
  if(mill.width<.12||mill.height<.18)
    return result(target,'too-small',reasonHint('too-small','windmill'),.5);
  // The complete real sail sweep and bell shell must fit, not just their centre points.
  for (const id of ['forest-chime','windmill'] as const) {
    const a = observation.anchors[id]!;
    if(a.x-a.width/2<.035||a.x+a.width/2>.965||a.y-a.height/2<.035||a.y+a.height/2>.965)
      return result(target,'outside-frame',reasonHint('outside-frame',id),.6);
  }
  if(Math.abs(chime.x-mill.x)<mill.width*.5+chime.width*.5+.015)
    return result(target,'alignment','向旁边挪一点，让风铃留在风车一侧，别叠住叶片。',.75);
  return result(target,'ready','近处的铃，远处的风车，都清楚了。按下快门，听它回信。',1);
}

/** Pure geometric comparison: world adapters supply projected, ray-tested anchor facts. */
export function evaluateFrame(state: JourneyState, observation: PhotoObservation, target: CardId | 'tutorial'): CompositionResult {
  const expectedArea = target === 'tutorial' ? 'post' : target;
  if (observation.area !== expectedArea) return result(target, 'wrong-area', target === 'forest' ? '风铃的线索在林地。' : target === 'town' ? '石拱的线索在旧镇。' : '在邮局门洞里看看远处的风车。');
  if (target === 'town' && !state.durable.gateOpened) return result(target, 'open-gate', '木栅挡住了旧卡里的视线。先找找旁边的机构。');
  const tag = target === 'tutorial' ? 'post-overlook' : target === 'forest' ? 'forest-view' : 'town-view';
  if (!observation.vantageTags.includes(tag)) return result(target, 'find-viewpoint', target === 'forest' ? '沿林间小路找一找，风铃和风车的距离会改变。' : target === 'town' ? '走到石拱外面，回头看看门里的山。' : '向门洞的开阔处走几步。', 0.15);
  if (target === 'forest') return evaluateForestSubjects(observation);
  const ids = target === 'town' ? ['stone-arch', 'mountain', 'red-mailbox'] as const : ['post-door', 'windmill'] as const;
  for (const id of ids) {
    const failure = invalidAnchor(observation.anchors[id]);
    if (failure) return result(target, failure, reasonHint(failure, id), 0.25);
  }
  if (target === 'tutorial') {
    const frame = observation.anchors['post-door']!;
    const mill = observation.anchors.windmill!;
    if (frame.depth >= mill.depth) return result(target, 'depth-order', '让近处的框景，围住远处的风车。', 0.4);
    const error = Math.hypot((mill.x - frame.x) / frame.width, (mill.y - frame.y) / frame.height);
    const proximity = 0.4 + 0.55 * (1 - clamp(error));
    if (!contains(frame, mill, .2)) return result(target, 'alignment', '让风车落在门洞里，再按下快门。', proximity);
    return result(target, 'ready', '就是这里。把第一阵山风留在照片里。', 1);
  }
  const arch = observation.anchors['stone-arch']!;
  const mountain = observation.anchors.mountain!;
  const mailbox = observation.anchors['red-mailbox']!;
  if (arch.depth >= mountain.depth || mailbox.depth >= mountain.depth) return result(target, 'depth-order', '石拱在前，山在门后。再换个方向看看。', 0.4);
  const mountainAligned = contains(arch, mountain, 0.22);
  const mailboxBelow = mailbox.y > mountain.y + 0.06 && mailbox.y > 0.5 && mailbox.y < 0.94;
  const mailboxBesideArch = Math.abs(mailbox.x - arch.x) < Math.max(0.32, arch.width);
  if (!mountainAligned) return result(target, 'alignment', '让山峰留在石拱里面。', 0.55);
  if (!mailboxBelow || !mailboxBesideArch) return result(target, 'alignment', '山在门里，红邮筒在画面下方。旧卡还差这一角。', 0.8);
  return result(target, 'ready', '门里的山，今天又有人看见了。按下快门吧。', 1);
}

/** A letter attachment describes one leg of the walk. Read visible uncropped subjects at the shutter. */
export function ridgeRouteSlot(view: PhotoObservation): 'turn' | 'destination' | undefined {
  if (view.area !== 'ridge' || !view.vantageTags.includes('valley-letter-view')) return;
  for (const [id, slot] of [['ridge-arrow','turn'], ['memory-windmill','destination']] as const) {
    const a = view.anchors[id];
    if (a && !a.occluded && a.depth > 0 && a.visibleFraction >= .98
      && a.x > .17 && a.x < .83 && a.y > .14 && a.y < .86
      && a.width >= (slot === 'turn' ? .10 : .055) && a.height >= (slot === 'turn' ? .045 : .105)) return slot;
  }
}

/** A broad shared view, independent of discovery order and every main-quest stamp. */
export function evaluateMemoryFrame(observation: PhotoObservation, target: MemoryId = 'valley-letter'): MemoryCompositionResult {
  const reply = (reason: CompositionReason, hint: string, proximity = 0): MemoryCompositionResult => ({ target, matched: reason === 'ready', reason, hint, proximity });
  if (!observation.vantageTags.includes('valley-letter-view')) return reply('find-viewpoint', '从东岭长椅附近回望山谷，找一处能同时看见风车和旧镇红屋顶的位置。');
  for (const id of ['memory-windmill', 'memory-town'] as const) {
    const a = observation.anchors[id];
    if (!a || ![a.x,a.y,a.width,a.height,a.depth,a.visibleFraction].every(Number.isFinite) || a.width <= 0 || a.height <= 0 || a.width > 4 || a.height > 4) return reply('missing-landmark', '让风车和旧镇的红屋顶都出现在镜头里。', .15);
    if (a.depth <= 0 || a.x < .03 || a.x > .97 || a.y < .03 || a.y > .97) return reply('outside-frame', '把镜头慢慢转向山谷，给风车和红屋顶各留一点位置。', .3);
    if (a.occluded || a.visibleFraction < .65) return reply('occluded', '有一处风景被挡住了。在长椅附近挪一挪，让两边都露出来。', .4);
    if (a.width < .008 || a.height < .008 || a.width * a.height < .00012) return reply('too-small', '景物还太小，换个能认清风车和红屋顶的位置。', .55);
  }
  const windmill = observation.anchors['memory-windmill']!, town = observation.anchors['memory-town']!;
  if (Math.hypot(windmill.x - town.x, windmill.y - town.y) < .08) return reply('alignment', '让风车和红屋顶各自清楚地留在画面里。', .7);
  return reply('ready', '两条路，都在这一张风景里了。按下快门，把来信补完整。', 1);
}

/** The bell and a real eave segment must be visible together; area entry is never a photograph. */
export function evaluateCourtyardFrame(observation: PhotoObservation): CourtyardCompositionResult {
  const reply = (reason: CompositionReason, hint: string, proximity = 0): CourtyardCompositionResult => ({ target:'courtyard', matched:reason==='ready', reason, hint, proximity });
  if (observation.area !== 'town') return reply('wrong-area','钟与屋檐在旧镇的小院里。');
  if (!observation.vantageTags.includes('courtyard-view')) return reply('find-viewpoint','桥落下后，在小院入口回望，让钟、檐线和院屋一起入镜。');
  for (const id of ['courtyard-bell','courtyard-eave'] as const) {
    const a=observation.anchors[id];
    if (!a || ![a.x,a.y,a.width,a.height,a.depth,a.visibleFraction].every(Number.isFinite)
      || a.width<=0 || a.height<=0 || a.width>4 || a.height>4) return reply('missing-landmark','让小钟和一段屋檐都清楚入镜。',.15);
    if(a.depth<=0) return reply('behind-camera','把小钟与屋檐一起留在镜头前。',.2);
    if(a.x<.04||a.x>.96||a.y<.04||a.y>.96) return reply('outside-frame','给小钟和屋檐各留一点画面。',.3);
    if(a.occluded||a.visibleFraction<.65) return reply('occluded','有一处被柱子或屋檐挡住了，沿廊口挪几步。',.4);
    if(a.width*a.height<(id==='courtyard-bell'?.001:.003)) return reply('too-small','靠近一点，让小钟与檐线都能认清。',.5);
  }
  const bell=observation.anchors['courtyard-bell']!,eave=observation.anchors['courtyard-eave']!;
  // This reply asks for the courtyard scene. A steep close-up of the fascia
  // otherwise reports ready while the dark soffit dominates the photograph.
  if(eave.height>.24||bell.height>.32)
    return reply('alignment','往院口退几步、稍放平相机：让钟留在一侧，檐线只占上缘，也给院屋留一点位置。',.65);
  if(bell.y<=eave.y)
    return reply('alignment','让钟留在檐线下方，一起拍下今天的小院。',.7);
  return reply('ready','小钟与屋檐都在了。这张可以回答旧镇的来信。',1);
}

/** Optional photographic advice only: neither a first-photo lock nor a daily stamp. */
export function evaluatePostPorchFrame(observation: PhotoObservation): PostPorchCompositionResult {
  const reply = (reason: CompositionReason, hint: string, proximity = 0): PostPorchCompositionResult =>
    ({ target: 'post-porch', matched: reason === 'ready', reason, hint, proximity });
  if (observation.area !== 'post') return reply('wrong-area', '廊前告别是邮局门前的一处可选构图。');
  if (!observation.vantageTags.includes('post-porch-view')) return reply('find-viewpoint', '可选构图「廊前告别」：到邮局北侧廊前，回望木门与屋檐。');
  for (const id of ['post-door-frame', 'post-eave'] as const) {
    const anchor = observation.anchors[id], failure = invalidAnchor(anchor);
    if (failure) return reply(failure, failure === 'occluded'
      ? '可选构图：门框或屋檐被挡住了，沿廊前挪几步；也可以随时拍下喜欢的风景。'
      : failure === 'too-small' ? '可选构图：靠近一些，让木门和檐线都能认清。'
        : '可选构图「廊前告别」：回望邮局，把木门与檐线一起留下。', .25);
    if (anchor!.visibleFraction < .95) return reply('outside-frame', '可选构图：稍退几步，把完整的门框与一段檐线留在画面里。', .5);
  }
  const door = observation.anchors['post-door-frame']!, eave = observation.anchors['post-eave']!;
  if (door.y <= eave.y + .03 || Math.abs(door.x - eave.x) > eave.width * .5)
    return reply('alignment', '可选构图：让木门留在檐线下方，像临走前回头看的一眼。', .75);
  return reply('ready', '廊前告别 · 构图 100%。木门与屋檐都在了，按下快门留住出发前这一眼。', 1);
}
