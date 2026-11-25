import { observeCommissionSites } from './commission-observation.ts';
import { photographedFlowerSubjects } from '../shanye-world/flower-scenes.ts';
import { hallCollectsAt } from '../journey/afternoon.ts';
import { authoredTriangles, firstAuthoredSurface } from '../shanye-world/authored-triangles.ts';
import { SOURCE_BUNDLES } from '../shanye-world/pipeline-sources.ts';
import { AFTERNOON_STOPS, HALL_GATE_ROOF, HALL_WINDOW, SWALLOW_RIDGE } from '../shanye-world/afternoon-layout.ts';
import { openingMountainCount } from '../shanye-world/opening-envelope.ts';
import { distance, framedPhotoCamera, lerp, projectAnchor } from '../controller/geometry.ts';
import type { TraceSegment, TravelStatus, Vec3 } from '../controller/types.ts';
import type { EnvironmentSnapshot } from '../environment/weather.ts';
import { nearbyRestPoint } from '../journey/rest-points.ts';
import { canSendLetter, canonicalInteraction } from '../journey/journey.ts';
import type { RestTarget } from '../journey/day-clock.ts';
import type { JourneyState, PhotoObservation } from '../journey/types.ts';
import { DISCOVERIES, INTERACTIONS, WORLD, traceSegment } from '../shanye-world/world-layout.ts';
import { LUNCH_STONE } from '../shanye-world/forest-composition.ts';
import { COURTYARD_PHOTO } from '../shanye-world/courtyard.ts';
import { POST_PORCH_PHOTO, projectPostSubject } from '../shanye-world/post-photo.ts';
import { nearestInteraction, observePhoto, photoSceneFrom } from './engine-helper.ts';

// The source door is at [-3,14.5,-232.5]. Its opening lies between the
// post-front-west/east boxes at x=-5.25/-0.75. Sample just in front of the
// north facade so the wall-mounted subject does not occlude itself.
export const POST_DOOR_SHAPE={position:[-3,16.75,-231.7] as Vec3,size:[4.5,4.5,0] as Vec3,right:[1,0,0] as Vec3};

/** Only authored terrain inside WORLD.bounds exists in the rendered scene.
 * The analytic height function continues outside it and must not hide the sun. */
export function boundedSunTrace(origin:Vec3,destination:Vec3,clearance=.025,trace:TraceSegment=traceSegment):ReturnType<TraceSegment>{
  let enter=0,exit=1;
  for(const [axis,min,max]of [[0,WORLD.bounds.minX+.001,WORLD.bounds.maxX-.001],[2,WORLD.bounds.minZ+.001,WORLD.bounds.maxZ-.001]] as const){
    const d=destination[axis]-origin[axis];
    if(Math.abs(d)<1e-9){if(origin[axis]<min||origin[axis]>max)return{hit:false,fraction:1,point:destination,distance:distance(origin,destination)};}
    else{const a=(min-origin[axis])/d,b=(max-origin[axis])/d;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
  }
  if(exit<=enter)return{hit:false,fraction:1,point:destination,distance:distance(origin,destination)};
  const result=trace(lerp(origin,destination,enter),lerp(origin,destination,exit),clearance);
  const fraction=result.hit?enter+(exit-enter)*result.fraction:1;
  return{hit:result.hit,fraction,point:result.hit?lerp(origin,destination,fraction):destination,distance:distance(origin,destination)*fraction};
}

// The broad east-house collider encloses the crest. Test the native tiles
// before accepting any view from below or directly under the lower roof.
const eastHouse = authoredTriangles(SOURCE_BUNDLES.find(bundle=>bundle.id==='town-street')!, 'town_house_east');
const traceSwallowRoof: TraceSegment = (from,to,clearance) => {
  const hit=traceSegment(from,to,clearance);
  if (hit.obstacle !== 'town-house-east') return hit;
  const surface=firstAuthoredSurface(eastHouse,from,to);
  return surface
    ? {hit:true, point:surface.point, distance:distance(from,surface.point), fraction:surface.fraction, obstacle:hit.obstacle}
    : {hit:false, point:to, distance:distance(from,to), fraction:1};
};

export function observeAppliedPhoto(status:TravelStatus,environment:EnvironmentSnapshot, journey?: JourneyState['durable']):PhotoObservation{
  const camera=framedPhotoCamera(status.camera,status.photography.settings.framing);
  const observed=observePhoto({...status,camera}),anchors={...observed.anchors},vantageTags=[...observed.vantageTags];
  if(observed.area==='post'){
    anchors['post-door']=projectAnchor(camera,POST_DOOR_SHAPE,0,traceSegment);
    const {bounds,feetHeight,maxFeetHeightDelta}=POST_PORCH_PHOTO,[x,y,z]=status.position;
    if(status.mode==='photo'&&x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ&&Math.abs(y-feetHeight)<maxFeetHeightDelta){
      vantageTags.push('post-porch-view');
      anchors['post-door-frame']=projectPostSubject(camera,POST_PORCH_PHOTO.door,traceSegment);
      anchors['post-eave']=projectPostSubject(camera,POST_PORCH_PHOTO.eave,traceSegment);
    }
  }
  if(observed.area==='town'){
    const {bounds,zoneHeight,maxFeetHeightDelta}=COURTYARD_PHOTO,[x,y,z]=status.position;
    if(x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ&&Math.abs(y-zoneHeight)<maxFeetHeightDelta)vantageTags.push('courtyard-view');
    for(const [key,shape]of [['courtyard-bell',COURTYARD_PHOTO.anchors.bell],['courtyard-eave',COURTYARD_PHOTO.anchors.eave]] as const){
      anchors[key]=projectAnchor(camera,shape,0,(from,to,clearance)=>{
        const hit=traceSegment(from,to,clearance);
        // Only this photographed subject's own actual solid parts may be the
        // first visible surface. Columns, walls and other subjects still block.
        return hit.obstacle&&shape.proxy.has(hit.obstacle)?{hit:false,point:to,distance:distance(from,to),fraction:1}:hit;
      });
    }
  }
  let afternoonSubject: PhotoObservation['afternoonSubject'];
  if (observed.area === 'town') {
    const [x, y, z] = camera.position;
    const stop = AFTERNOON_STOPS.shoes.position;
    const visible = (subject: ReturnType<typeof projectAnchor>, width: number) =>
      subject.depth > 0 && subject.visibleFraction >= .96 && !subject.occluded && subject.width >= width;
    if (x < SWALLOW_RIDGE.position[0] && Math.abs(y - 26.5) < 3 && Math.hypot(x - stop[0], z - stop[2]) < 12) {
      const roof = projectAnchor(camera, SWALLOW_RIDGE, 0, traceSwallowRoof);
      if (visible(roof, .055) && roof.height > .055) afternoonSubject = 'swallow-roof';
    }
    if (z > HALL_WINDOW.position[2] + .25 && z < 103 && y > 33) {
      const window = projectAnchor(camera, HALL_WINDOW, 0, traceSegment);
      const gate = projectAnchor(camera, HALL_GATE_ROOF, 0, (from, to, clearance) => {
        const hit = traceSegment(from, to, clearance);
        return hit.obstacle === 'mountain/south-gate/attic-0'
          ? {hit:false, point:to, distance:distance(from,to), fraction:1} : hit;
      });
      if (window.visibleFraction > .80 && !window.occluded && window.width >= .11 && visible(gate, .028) && gate.depth > window.depth
        && Math.abs(gate.x - window.x) + gate.width * .28 < window.width * .51
        && Math.abs(gate.y - window.y) < window.height * .45) afternoonSubject = 'hall-window';
    }
  }
  const sun=environment.sunDisc;
  if(observed.area==='ridge'&&sun.visible)anchors['sun-disc']=projectAnchor(camera,{position:sun.position,radius:sun.radius},0,boundedSunTrace);
  const openingMountains = observed.area === 'post' && status.photography.settings.mode === 'landscape'
    ? openingMountainCount(camera, traceSegment) : undefined;
  const flowerSubjects=photographedFlowerSubjects(status,camera,Boolean(environment.clock&&!hallCollectsAt(environment.clock.minute)));
  const commission = journey && !journey.creativeMode && environment.clock && journey.photoCommissions.orders.length
    ? observeCommissionSites(camera, journey.photoCommissions.orders.filter(order => !order.photoId).map(order => order.site),
      environment.clock.minute, journey.trackedScenicSpot,
      status.photography.settings.mode === 'portrait' && status.avatarVisible && status.photography.subjectVisible ? status.position : undefined)
    : undefined;
  return {...observed, anchors, vantageTags,
    ...(commission?.matched.length ? {commissionSites:commission.matched} : {}),
    ...(commission?.hint ? {commissionHint:commission.hint} : {}), ...(flowerSubjects.length?{flowerSubjects}:{}), ...(openingMountains !== undefined ? { openingMountains } : {}), ...(afternoonSubject ? { afternoonSubject } : {})};
}

/** Freeze the clock actually applied to light/sky, rather than the next desired tick. */
export function appliedPhotoScene(status:TravelStatus,environment:EnvironmentSnapshot){
  return{...photoSceneFrom(status,environment),...(environment.clock?{clock:{...environment.clock}}:{})};
}

export function nearestPhysicalInteraction(position:Vec3,townReady:boolean,creativeMode=false,lunchDelivered=false):string|null{
  if(lunchDelivered && Math.hypot(position[0]-LUNCH_STONE[0],position[2]-LUNCH_STONE[2])<=2.25 && Math.abs(position[1]-LUNCH_STONE[1])<2) return 'forest-lunch';
  const ordinary=nearestInteraction(position),rest=creativeMode?undefined:nearbyRestPoint(position,townReady);
  if(!rest)return ordinary;
  const other=[...INTERACTIONS,...DISCOVERIES.map(item=>({...item,id:`discover:${item.id}`}))].find(item=>item.id===ordinary);
  const planar=(p:Vec3)=>Math.hypot(position[0]-p[0],position[2]-p[2]);
  return !other||planar(rest.position)<=planar(other.position)?`rest:${rest.id}`:ordinary;
}

/** The frontend chooses a named window, never a place, weather or timestamp. */
export function validatedRestTarget(payload:unknown,status:TravelStatus,state:JourneyState):RestTarget|null{
  const value=payload&&typeof payload==='object'?(payload as Record<string,unknown>).target:payload;
  if(value!=='morning'&&value!=='golden'&&value!=='sunset')return null;
  if(!state.durable.started||state.durable.creativeMode||state.runtime.ride||status.mode==='zipline'||!status.grounded
    ||!['play','photo'].includes(state.runtime.screen)||state.runtime.pauseReasons.some(reason=>reason!=='ui')
    ||!nearbyRestPoint(status.position,state.durable.stamps.town))return null;
  return value;
}

/** Final mail confirmation uses the current physical mailbox, never a UI ID.
 * Only the confirmation modal's own pause can be released by its host. */
export function validatedMailTarget(status:TravelStatus,state:JourneyState):string|null{
  const screen=state.runtime.screen,fromJourney=['play','photo'].includes(screen)
    ||screen==='journal'&&['play','photo'].includes(state.runtime.returnScreen);
  if(!state.durable.started||!canSendLetter(state)||state.runtime.ride||status.mode==='zipline'||!status.grounded
    ||!fromJourney||state.runtime.pauseReasons.some(reason=>reason!=='ui'))return null;
  const id=canonicalInteraction(nearestPhysicalInteraction(status.position,state.durable.stamps.town,state.durable.creativeMode));
  return id&&/^mailbox:(post|forest|town|ridge)$/.test(id)?id:null;
}
