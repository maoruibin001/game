import {describe,expect,it} from 'vitest';
import {createTravelController} from '../../controller/travel-controller.ts';
import {EMPTY_INPUT,type TraceSegment} from '../../controller/types.ts';
import {DEFAULT_PHOTOGRAPHY} from '../../shared/photography-contract.ts';
import {initialPresentationView,type PresentationViewModel} from '../types.ts';
import {portraitFramingStatus} from '../photography-tools.ts';

function viewOf(c:ReturnType<typeof createTravelController>):PresentationViewModel {
  const p=c.snapshot().photography;
  return {...initialPresentationView(),screen:'play',camera:{active:true,ready:false,alignment:0,
    photography:p.settings,candidateStatus:p.candidateStatus,
    viewpoints:p.candidates.map(candidate=>({...candidate,label:`机位 ${candidate.index}`}))}};
}
const expected=(c:ReturnType<typeof createTravelController>)=>c.snapshot().photography.candidateAvailable&&c.snapshot().photography.subjectVisible;

describe('visible portrait guidance follows the actual controller',()=>{
  it('does not turn an unmatched landscape into a blocked shutter',()=>{
    const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0});c.toggleCamera();
    expect(viewOf(c).camera.ready).toBe(false);expect(portraitFramingStatus(viewOf(c))).toBeUndefined();
  });
  it('matches the host capture predicate after every real pose, lens, timer and viewpoint change',()=>{
    const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0});c.toggleCamera();
    for(const lens of ['wide','standard','detail'] as const)for(const pose of ['look','wave','letter'] as const)for(const viewpoint of [0,1,2])for(const timerSeconds of [0,3] as const){
      c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',lens,pose,viewpoint,timerSeconds});
      expect(portraitFramingStatus(viewOf(c))?.available).toBe(expected(c));
      expect(expected(c)).toBe(true);
    }
  });
  it('immediately reflects a subject leaving the fixed tripod frame and a new usable placement',()=>{
    const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0});c.toggleCamera();
    c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});
    c.submitInput({...EMPTY_INPUT,horizontal:1});for(let i=0;i<600;i++){c.step(1/60);c.updateCamera(1/60);}
    expect(expected(c)).toBe(false);expect(portraitFramingStatus(viewOf(c))).toMatchObject({available:false,message:c.snapshot().photography.candidateStatus});
    c.submitInput({...EMPTY_INPUT});c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',viewpoint:1});
    expect(expected(c)).toBe(true);expect(portraitFramingStatus(viewOf(c))?.available).toBe(true);
  });
  it('reports real wall blockage and does not borrow availability from a different selected candidate',()=>{
    const wall:TraceSegment=(a,b,clearance=0)=>{const boundary=1-clearance,hit=Math.max(a[2],b[2])>=boundary,t=(boundary-a[2])/(b[2]-a[2]||1);return{hit,point:[a[0],a[1],boundary],distance:Math.abs(boundary-a[2]),fraction:Math.max(0,Math.min(1,t))};};
    const c=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:0,traceSegment:wall});c.toggleCamera();c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});
    const view=viewOf(c);expect(expected(c)).toBe(false);expect(portraitFramingStatus(view)?.available).toBe(false);
    view.camera.viewpoints=[{index:1,label:'另一个机位',available:true}];
    expect(portraitFramingStatus(view)).toEqual({available:false,message:'正在确认代拍机位，请稍等。'});
  });
});
