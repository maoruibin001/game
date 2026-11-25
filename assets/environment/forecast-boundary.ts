import {createJourney,restoreJourney,type JourneyAction,type JourneyEvent,type JourneyState,type Pose,type RestoreResult,canPlay} from '../journey/index.ts';

/** Runtime entropy belongs to a new journey only; Packs and restore remain deterministic. */
const randomWeatherSeed=()=>globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!;
export function createFreshJourney(spawn:Pose,seedSource:()=>number=randomWeatherSeed):JourneyState {
  return createJourney(spawn,{weatherSeed:seedSource()>>>0,pocketMapCollapsed:true});
}
export function restoreWithWeatherSeed(serialized:string|null,spawn:Pose,seedSource:()=>number=randomWeatherSeed):RestoreResult {
  const result=restoreJourney(serialized,spawn);
  return result.status==='empty'?{...result,state:createFreshJourney(spawn,seedSource)}:result;
}
/** A weather boundary wins over a simultaneous timer edge; it never requests a replacement shot. */
export function shutterTransition(action:JourneyAction,events:readonly JourneyEvent[],state:JourneyState):'cancel'|'ready'|'unchanged' {
  if(action.type==='cancel-countdown'||action.type==='set-weather'||!canPlay(state)||state.runtime.screen!=='photo'
    ||events.some(event=>event.type==='photo:timer-cancelled'||event.type==='weather:changed'||event.type==='photography:changed'))return 'cancel';
  return events.some(event=>event.type==='photo:timer-ready')?'ready':'unchanged';
}
