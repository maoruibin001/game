import {describe,expect,it} from 'vitest';
import {add,cross,dot,normalize,subtract} from '../../controller/geometry.ts';
import type {TravelStatus,Vec3} from '../../controller/types.ts';
import {createTravelController} from '../../controller/travel-controller.ts';
import {evaluateFrame,evaluateMemoryFrame} from '../../journey/photography.ts';
import {createJourney} from '../../journey/journey.ts';
import {SOURCE_BUNDLES} from '../../shanye-world/pipeline-sources.ts';
import {compilePipelineBundles} from '../../shanye-world/pipeline-import.ts';
import {PHOTO_ANCHORS,terrainHeight,traceSegment} from '../../shanye-world/world-layout.ts';
import {observePhoto} from '../engine-helper.ts';

function statusAt(x:number,z:number,target?:Vec3):TravelStatus {
  const position:Vec3=[x,terrainHeight(x,z),z],eye=add(position,[0,1.64,0]);
  const subjects=PHOTO_ANCHORS.valley.anchors;
  const forward=target?normalize(subtract(target,eye)):normalize(add(normalize(subtract(subjects.windmill.position,eye)),normalize(subtract(subjects.townRoof.position,eye))));
  return {...createTravelController({spawn:position,terrainHeight}).snapshot(),position,yaw:Math.atan2(forward[0],-forward[2]),pitch:-Math.asin(forward[1]),facingYaw:0,mode:'photo',paused:false,grounded:true,speed:0,distanceWalked:0,stepPhase:0,ziplineProgress:0,camera:{position:eye,forward,up:[0,1,0],verticalFovRadians:Math.PI/3,aspect:16/9}};
}

// Consume the same Native Mesh output as the scene, including the tower profile.
// Raw SOURCE_BUNDLES vertices alone no longer describe the rendered tower.
const nativeSubjects=compilePipelineBundles(SOURCE_BUNDLES.filter(b=>b.id==='forest-windmill'||b.id==='town-street').map(b=>({...b,meshes:b.meshes.filter(m=>m.entityId==='windmill_tower'||m.entityId==='town_house_east')})));
function nativeSubject(bundleId:string,entityId:string){
  const key=`hero/${bundleId}/${entityId.replaceAll('_','-')}`,mesh=nativeSubjects.resources[`mesh/${key}`];
  if(mesh?.kind!=='mesh'||!(mesh.attributes.position instanceof Float32Array)||!mesh.indices)throw new Error(`Missing native triangle mesh ${key}`);
  const positions=mesh.attributes.position,indices=mesh.indices,translation=nativeSubjects.entities[key]!.components.Transform!.pos!;
  if(!Array.isArray(translation)||translation.length!==3||!translation.every(Number.isFinite))throw new Error(`Invalid native subject translation ${key}`);
  const vertex=(i:number):Vec3=>[positions[i*3]!+translation[0]!,positions[i*3+1]!+translation[1]!,positions[i*3+2]!+translation[2]!];
  return{mesh,indices,vertex};
}
/** Independent intersection against compiled Native Mesh triangles, not a collision proxy. */
function firstSurface(origin:Vec3,target:Vec3,bundleId:string,entityId:string):string|undefined {
  const {mesh,indices,vertex}=nativeSubject(bundleId,entityId);
  const direction=subtract(target,origin);let fraction=Infinity,material:string|undefined;
  for(const section of mesh.submeshes){
    for(let i=section.indexOffset;i<section.indexOffset+section.indexCount;i+=3){
      const A=vertex(indices[i]!),B=vertex(indices[i+1]!),C=vertex(indices[i+2]!),e1=subtract(B,A),e2=subtract(C,A),h=cross(direction,e2),det=dot(e1,h);
      if(Math.abs(det)<1e-8)continue;
      const f=1/det,s=subtract(origin,A),u=f*dot(s,h);if(u<0||u>1)continue;
      const q=cross(s,e1),v=f*dot(direction,q);if(v<0||u+v>1)continue;
      const t=f*dot(e2,q);if(t>=0&&t<=1&&t<fraction){fraction=t;material=mesh.materialSlots[section.materialSlot]!.slotName.replace(/^pipeline-/,'').replace(/-\d+$/,'');}
    }
  }
  return material;
}

describe('real valley photography',()=>{
  it.each([[0,200],[64,204],[-30,190],[85,185]])('allows both real subjects from the broad ridge region at %s,%s',(x,z)=>{
    const observation=observePhoto(statusAt(x,z));
    expect(evaluateMemoryFrame(observation).matched).toBe(true);
    expect(observation.anchors['memory-windmill']!.visibleFraction).toBe(1);
    expect(observation.anchors['memory-town']!.visibleFraction).toBe(1);
  });
  it.each([[0,200],[64,204]])('the sightlines at %s,%s meet actual tower material and actual red roof triangles',(x,z)=>{
    const {camera}=statusAt(x,z),{windmill,townRoof}=PHOTO_ANCHORS.valley.anchors;
    expect(['plaster','wooddark']).toContain(firstSurface(camera.position,windmill.position,'forest-windmill','windmill_tower'));
    expect(firstSurface(camera.position,townRoof.position,'town-street','town_house_east')).toBe('weather-roof');
  });
  it('projects the actual compiled tower bounds after its authored height profile',()=>{
    const {mesh,vertex}=nativeSubject('forest-windmill','windmill_tower'),shape=PHOTO_ANCHORS.valley.anchors.windmill;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<(mesh.attributes.position as Float32Array).length/3;i++){
      const point=vertex(i);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis]!,point[axis]!);max[axis]=Math.max(max[axis]!,point[axis]!);}
    }
    expect(min).toEqual(shape.position.map((n,i)=>n-shape.size[i]!/2));
    expect(max).toEqual(shape.position.map((n,i)=>n+shape.size[i]!/2));
    expect(max[1]).toBe(46.5);
  });
  it.each([[0,225],[35,195]])('rejects real ridge/tree occlusion within the region at %s,%s',(x,z)=>{
    const observation=observePhoto(statusAt(x,z));
    expect(observation.vantageTags).toContain('valley-letter-view');
    expect(observation.anchors['memory-windmill']!.occluded).toBe(true);
    expect(evaluateMemoryFrame(observation).matched).toBe(false);
  });
  it('does not grant a photograph from coordinates, a backwards camera, or a cropped zoom',()=>{
    const outside=observePhoto(statusAt(0,179));
    expect(outside.vantageTags).not.toContain('valley-letter-view');
    expect(evaluateMemoryFrame(outside).matched).toBe(false);
    const backwards=statusAt(64,204);backwards.camera.forward=backwards.camera.forward.map(n=>-n) as unknown as Vec3;
    expect(evaluateMemoryFrame(observePhoto(backwards)).matched).toBe(false);
    const zoomed=statusAt(64,204);zoomed.camera.verticalFovRadians=Math.PI/6;
    expect(evaluateMemoryFrame(observePhoto(zoomed)).matched).toBe(false);
  });
  it('preserves the two main-card compositions and never supplies memory anchors there',()=>{
    const state=createJourney();state.durable.gateOpened=true;
    for(const id of ['forest','town'] as const){
      const zone=PHOTO_ANCHORS[id],observation=observePhoto(statusAt(zone.view[0],zone.view[2],zone.target));
      expect(evaluateFrame(state,observation,id).matched).toBe(true);
      expect(observation.anchors['memory-windmill']).toBeUndefined();
      expect(evaluateMemoryFrame(observation).matched).toBe(false);
    }
  });
  it('recognizes the authored mountain front surface when its anchor is inside the same mountain',()=>{
    const zone=PHOTO_ANCHORS.town,status=statusAt(zone.view[0],zone.view[2],zone.target);
    expect(traceSegment(status.camera.position,zone.anchors.mountain.position,.025)).toMatchObject({hit:true,obstacle:'distant-crag-16'});
    expect(observePhoto(status).anchors.mountain!.occluded).toBe(false);
  });
  it.each([[149,40,'courtyard-house'],[80,140,'terrain'],[230,0,'scenery-1360']] as const)('keeps the real %s,%s obstruction %s in front of the mountain',(x,z,obstacle)=>{
    const target=PHOTO_ANCHORS.town.anchors.mountain.position,status=statusAt(x,z,target);
    // The courtyard house now uses its compiled per-solid collision volumes.
    const actualObstacle=obstacle==='courtyard-house'?expect.stringMatching(/^courtyard\/town-courtyard-house\//):obstacle;
    expect(traceSegment(status.camera.position,target,.025)).toMatchObject({hit:true,obstacle:actualObstacle});
    expect(observePhoto(status).anchors.mountain!.occluded).toBe(true);
  });
});
