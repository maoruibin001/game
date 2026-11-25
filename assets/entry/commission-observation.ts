import { distance, projectAnchor } from '../controller/geometry.ts';
import type { CameraPose, SegmentHit, Vec3 } from '../controller/types.ts';
import { commissionSite, commissionTimeAllows, type CommissionSiteId, type CommissionSubject } from '../journey/commission-sites.ts';
import { POST_PORCH_PHOTO, projectPostSubject } from '../shanye-world/post-photo.ts';
import { traceSegment } from '../shanye-world/world-layout.ts';

type TraceSegment = (from: Vec3, to: Vec3, clearance?: number) => SegmentHit & { obstacle?: string };
type Issue = 'frame' | 'size' | 'cover';
const textFor = (label: string, issue: Issue) => ({
  frame: `再让「${label}」多露一点，把它收进画框。`,
  size: `「${label}」还是太小。走近几步，或试试拉近镜头。`,
  cover: `「${label}」被挡住了。向旁边挪一点，再看看。`,
})[issue];

function inspectSubject(camera: CameraPose, subject: CommissionSubject, trace: TraceSegment, portrait?: Vec3) {
  const p = projectAnchor(camera, subject.shape);
  const failed = (issue: Issue) => ({issue, visible: p.depth > 0 && p.visibleFraction > .2});
  if (p.depth <= .3 || p.visibleFraction < .72 || p.x <= .025 || p.x >= .975 || p.y <= .025 || p.y >= .975)
    return failed('frame');
  if (Math.max(p.width,p.height) < .048 || Math.min(p.width,p.height) < .006 || p.width*p.height < .00075)
    return failed('size');
  if (subject.postal) {
    if (projectPostSubject(camera, POST_PORCH_PHOTO[subject.postal], trace).visibleFraction < .52) return failed('cover');
  } else {
    const { position, size = [1,1,1], right } = subject.shape;
    const horizontal = right ?? [1,0,0];
    const probes = [[0,0], [-.27,0], [.27,0], [0,-.27], [0,.27]] as const;
    const permits = (obstacle: string | undefined) => obstacle && (typeof subject.own === 'string'
      ? obstacle === subject.own : subject.own?.has(obstacle));
    const clear = probes.filter(([x,y]) => {
      const sample: Vec3 = [position[0]+horizontal[0]*x*size[0],position[1]+y*size[1],position[2]+horizontal[2]*x*size[0]];
      const hit = trace(camera.position,sample,.018);
      return !hit.hit || permits(hit.obstacle) || distance(hit.point,sample)<.13;
    }).length;
    if (clear < 3) return failed('cover');
  }
  if (portrait) {
    const a = projectAnchor(camera,{position:[portrait[0],portrait[1]+.85,portrait[2]],size:[.78,1.70,.55]});
    if (a.depth > .1 && a.depth < p.depth && a.visibleFraction > 0) {
      const overlap = (a:number,b:number,m:number,n:number) => Math.max(0,Math.min(a+m/2,b+n/2)-Math.max(a-m/2,b-n/2));
      if (overlap(a.x,p.x,a.width,p.width)*overlap(a.y,p.y,a.height,p.height) > p.width*p.height*.42) return failed('cover');
    }
  }
  return {issue:null,visible:true};
}

export function observeCommissionSites(
  camera: CameraPose, sites: readonly CommissionSiteId[], minute: number, tracked?: string | null,
  portrait?: Vec3, trace: TraceSegment = traceSegment,
) {
  const matched: CommissionSiteId[] = [];
  let hint: { ready: boolean; text: string } | undefined;
  for (const id of sites) {
    const site = commissionSite(id);
    const observations = site.subjects.map(subject => inspectSubject(camera,subject,trace,portrait));
    const failedIndex = observations.findIndex(result => result.issue !== null);
    const open = commissionTimeAllows(id,minute);
    if (failedIndex < 0 && open) {
      matched.push(id);
      hint = {ready:true,text:'委托主体清楚了。拍下后可在来信里交件。'};
    } else if (!hint?.ready && (tracked === id || observations.some(result => result.visible))) {
      const text = open ? textFor(site.subjects[failedIndex]!.label,observations[failedIndex]!.issue!)
        : site.window === 'night' ? '这份委托等花街 18:40 开市后再拍。' : '这份委托请在 06:20–18:40 光线充足时拍。';
      if (!hint || tracked === id) hint = {ready:false,text};
    }
  }
  return { matched, hint };
}
