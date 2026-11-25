import {describe,expect,it} from 'vitest';
import {add,normalize,subtract} from '../../controller/geometry.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import type {Vec3} from '../../controller/types.ts';
import {createWeatherTransition,type EnvironmentSnapshot} from '../../environment/weather.ts';
import {sunDiscShape} from '../../environment/sun-disc.ts';
import {createJourney,reduceJourney} from '../../journey/journey.ts';
import {evaluateCourtyardFrame} from '../../journey/photography.ts';
import type {WeatherId} from '../../shared/photography-contract.ts';
import {COURTYARD_PHOTO} from '../../shanye-world/courtyard.ts';
import {terrainHeight,traceSegment} from '../../shanye-world/world-layout.ts';
import {observeAppliedPhoto,appliedPhotoScene} from '../journey-host.ts';
import {poseFromController} from '../engine-helper.ts';

// Valid small PNG container; image decoding and real scene pixels remain the
// frontend/native capture acceptance gate, separate from this rules integration.
const thumbnail='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC9sAAAAASUVORK5CYII=';

function at(x:number,z:number,backwards=false,target:Vec3=COURTYARD_PHOTO.view.target){
  const feet:Vec3=[x,terrainHeight(x,z),z],direction=normalize(subtract(target,add(feet,[0,1.64,0])));
  const c=createTravelController({spawn:feet,terrainHeight,traceSegment,initialYaw:Math.atan2(direction[0],-direction[2])+(backwards?Math.PI:0),initialPitch:-Math.asin(direction[1])});
  c.toggleCamera();return c.snapshot();
}
function environment(position:Vec3,weather:WeatherId='morning'):EnvironmentSnapshot{
  const values=createWeatherTransition(weather).step(weather,0,false,{day:1,minute:930});
  return{...values,exposure:0,revision:1,frozen:false,rainVisible:0,sheltered:false,sunDisc:sunDiscShape(position,values.solar,values.sunVisibility)};
}

describe('real courtyard subjects in the capture adapter',()=>{
  it.each([-.5,0,.5])('keeps the bell and eave readable from a nearby ordinary viewpoint offset %sm',offset=>{
    const s=at(COURTYARD_PHOTO.view.feet[0]+offset,COURTYARD_PHOTO.view.feet[2]);
    const observed=observeAppliedPhoto(s,environment(s.camera.position));
    expect(observed.vantageTags).toContain('courtyard-view');
    expect(evaluateCourtyardFrame(observed)).toMatchObject({matched:true,reason:'ready'});
    expect(observed.anchors['courtyard-bell']!.occluded).toBe(false);
    expect(observed.anchors['courtyard-eave']!.occluded).toBe(false);
  });

  it('does not ignore the courtyard house and cannot qualify a reverse/outside-region view',()=>{
    const reverse=at(COURTYARD_PHOTO.view.feet[0],COURTYARD_PHOTO.view.feet[2],true);
    expect(evaluateCourtyardFrame(observeAppliedPhoto(reverse,environment(reverse.camera.position))).matched).toBe(false);
    const behindHouse=at(142,52),blocked=observeAppliedPhoto(behindHouse,environment(behindHouse.camera.position));
    expect(blocked.anchors['courtyard-bell']!.occluded).toBe(true);
    expect(blocked.vantageTags).not.toContain('courtyard-view');
    expect(evaluateCourtyardFrame(blocked).matched).toBe(false);
  });

  it('guides a ceiling-dominated close-up back to the entrance while retaining ordinary photography',()=>{
    const status=at(156.2,47,false,[161.2,27,51.1]),env=environment(status.camera.position),observation=observeAppliedPhoto(status,env);
    expect(evaluateCourtyardFrame(observation)).toMatchObject({matched:false,reason:'alignment',hint:expect.stringContaining('院口退几步')});
    let state=reduceJourney(createJourney(poseFromController(status)),{type:'start'}).state;
    state=reduceJourney(state,{type:'open-camera'}).state;
    const taken=reduceJourney(state,{type:'take-photo',observation,scene:appliedPhotoScene(status,env),thumbnail,original:{key:'unit-courtyard-close-up',width:1920,height:1080,mime:'image/jpeg',bytes:10000}}).state;
    expect(taken.durable.film).toHaveLength(1);expect(taken.durable.film[0]!.original?.key).toBe('unit-courtyard-close-up');
  });

  it.each(['morning','rain','afterglow'] as const)('passes actual shutter geometry into a retained candidate in %s only after the bridge is available',weather=>{
    const s=at(COURTYARD_PHOTO.view.feet[0],COURTYARD_PHOTO.view.feet[2]),env=environment(s.camera.position,weather),observation=observeAppliedPhoto(s,env),scene=appliedPhotoScene(s,env);
    const started=reduceJourney(createJourney(poseFromController(s)),{type:'start'}).state;
    for(const bridgeProgress of [0,1]){
      let state={...started,durable:{...started.durable,stamps:{forest:true,town:true},gateOpened:true},runtime:{...started.runtime,bridgeProgress}};
      state=reduceJourney(state,{type:'open-camera'}).state;
      const taken=reduceJourney(state,{type:'take-photo',observation,scene,thumbnail,original:{key:'unit-courtyard-photo',width:1920,height:1080,mime:'image/jpeg',bytes:10000}}).state;
      const photo=taken.durable.film.at(-1)!;
      expect(photo).toBeDefined();expect(photo.scene!.clock).toEqual(env.clock);
      expect(photo.replyCandidates??[]).toEqual(bridgeProgress===1?[{letter:'town',variant:'courtyard',ruleVersion:1}]:[]);
      expect(taken.runtime.bridgeProgress).toBe(bridgeProgress);
    }
  });
});
