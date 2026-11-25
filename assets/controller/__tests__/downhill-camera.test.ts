import { describe,expect,it } from 'vitest';
import { createTravelController } from '../travel-controller.ts';
import { EMPTY_INPUT, type TraceSegment, type Vec3 } from '../types.ts';
import { courierSole } from '../traveler-stance.ts';
import { resolveMove, travelerVisibleSurface, walkingSurfaceHeight } from '../../shanye-world/world-layout.ts';
import { postalLookoutCamera } from '../../shanye-world/postal-lookout.ts';
import { traceTravelSegment } from '../../shanye-world/road-safety.ts';

describe('downhill walking camera',()=>{
  it.each([
    ['postal',[-16.4,-233.1],[-13.8,-222.5]],
    ['stairs',[158,93.5],[158,65]],
    ['open grass',[14,-209],[16.8,-215.2]],
  ] as const)('keeps the rear boom steady on the %s descent in both motion settings',(_name,a,b)=>{
    const yaw=Math.atan2(b[0]-a[0],a[1]-b[1]);
    for(const reducedMotion of [false,true]) {
      const controller=createTravelController({spawn:[a[0],0,a[1]],terrainHeight:walkingSurfaceHeight,initialYaw:yaw,
        initialPitch:.13,resolveMove,walkingCameraFrame:postalLookoutCamera,
        traceSegment:(from,to,r)=>traceTravelSegment(from,to,{gateOpen:true,bridgeWalkable:true},r)});
      controller.setLookSettings({reducedMotion});
      const dt=1/60;
      controller.updateCamera(dt,true);
      let previous=controller.snapshot();
      for(let distance=0;distance<Math.hypot(a[0]-b[0],a[1]-b[1]);distance+=6.8*dt) {
        controller.submitInput({...EMPTY_INPUT,vertical:1,steerCharacter:true});
        controller.step(dt);
        controller.updateCamera(dt);
        const current=controller.snapshot(),eye=current.camera.position,walk=current.walkingCamera!;
        expect(eye[1]).toBeGreaterThanOrEqual(walkingSurfaceHeight(eye[0],eye[2])+.299);
        expect(Math.abs(walk.safeDistance-previous.walkingCamera!.safeDistance)).toBeLessThan(.54);
        expect(Math.abs(eye[1]-previous.camera.position[1])).toBeLessThan(.43);
        previous=current;
      }
    }
  });

  it('clips immediately at a solid obstacle and releases the same collision-safe ray gradually',()=>{
    let wall=false;
    const trace:TraceSegment=(start,end,r)=>{
      const dz=end[2]-start[2],hit=wall&&r===.3&&dz>2;
      const point:Vec3=hit?[start[0],start[1]+(end[1]-start[1])*2/dz,start[2]+2]:end;
      return {hit,point,fraction:hit?2/dz:1,distance:Math.hypot(point[0]-start[0],point[1]-start[1],point[2]-start[2])};
    };
    const controller=createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:0,traceSegment:trace});
    const full=controller.snapshot().walkingCamera!.safeDistance;
    wall=true;
    controller.updateCamera(1/60);
    const clipped=controller.snapshot().walkingCamera!.safeDistance;
    expect(clipped).toBeLessThan(2.1);
    wall=false;
    controller.updateCamera(1/60);
    expect(controller.snapshot().walkingCamera!.safeDistance-clipped).toBeLessThan(.085);
    for(let i=0;i<70;i++)controller.updateCamera(1/60);
    expect(controller.snapshot().walkingCamera!.safeDistance).toBeCloseTo(full);
  });
});

describe('visible sole support',()=>{
  it('brings both soles through the grass collision offset to the rendered surface',()=>{
    const x=16.2,z=-212.7,p:Vec3=[x,walkingSurfaceHeight(x,z),z];
    for(const side of [-1,1] as const) {
      const tread=(a:number,b:number,y:number)=>travelerVisibleSurface(a,b,y,false);
      const legacy=courierSole(p,0,side,0,0);
      const corrected=courierSole(p,0,side,0,0,tread);
      const uncorrected=courierSole(p,0,side,0,0,tread).clearance-corrected.adjustment;
      expect(legacy.adjustment).toBe(0);
      expect(uncorrected).toBeGreaterThan(.069);
      expect(corrected.clearance).toBeCloseTo(.009,7);
    }
  });
  it('keeps a planted heel at the upper stair edge while leaving the swing foot free',()=>{
    const surface=(x:number,z:number)=>x>.1?1+.08*z:1+.25*z;
    const planted=courierSole([0,1.08,0],0,1,.17,0,surface);
    const swinging=courierSole([0,1.08,0],0,-1,-.17,.057,surface);
    expect(planted.clearance).toBeCloseTo(.009,8);
    expect(swinging.clearance).toBeCloseTo(.066,8);
  });
});
