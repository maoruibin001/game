import { describe,it,expect } from 'vitest';
import { createJourney, reduceJourney } from '../journey.ts';
import { restoreJourney, serializeJourney } from '../save.ts';
import { FLOWER_ORDER } from '../flower-catalog.ts';
import { awardFlower, emptyFlowerStock } from '../flower-stock.ts';
import { adoptOldBoxes, launchGround, partyCues } from '../flower-party.ts';
import { drawFestivalFlower, drawInvitationStars } from '../../entry/firework-shape.ts';
import { EMPTY_INPUT } from '../../controller/types.ts';
import { createTravelController } from '../../controller/travel-controller.ts';
import { terrainHeight, walkingSurfaceHeight, resolveMove, traceSegment } from '../../shanye-world/world-layout.ts';
import { sixthNearby, SIXTH_STOPS } from '../../shanye-world/sixth-layout.ts';
import type { JourneyAction, JourneyState, Photo, Vec3 } from '../types.ts';

const step=(s:JourneyState,a:JourneyAction)=>reduceJourney(s,a).state;
const ground=(x:number,z:number):Vec3=>[x,terrainHeight(x,z),z];
const interact=(s:JourneyState,id:string,position:Vec3)=>step(step(step(s,{
  type:'set-pose',pose:{position,yaw:0,pitch:0,area:'town'},
}),{type:'set-context',nearby:id}),{type:'interact',id});
const photo:Photo={id:'photo-1',sequence:1, title:'山门',area:'town',
  pose:{position:ground(159.17,94.6),yaw:0,pitch:0,area:'town'},capturedAt:100,playSeconds:1,thumbnail:null,
  matchedCards:[],memoryCandidates:[],tutorialMatch:false,caption:'',afternoonSubject:'hall-window',
  original:{key:'shanye:original:flower-finale-test',width:1920,height:1080,bytes:10808,mime:'image/jpeg'}};
function reward(){
  const state=step(createJourney(),{type:'start'});
  state.durable.clock={day:1,minute:1122};
  state.durable.fireworks={photo,day:1,minute:930};
  state.durable.night={...state.durable.night,scarletClaimed:true,fishLetter:'delivered',torch:true};
  state.durable.totalPhotos=1;
  return state;
}
function fullStock(){
  return FLOWER_ORDER.reduce(awardFlower,emptyFlowerStock());
}

describe('ten flower commissions',()=>{
  it('adopts a spent original gold box and awards silver only once at the receiving point',()=>{
    let s=reward();
    s.durable.night.spent=true;
    expect(adoptOldBoxes(s.durable).counts).toEqual({gold:0,scarlet:1});
    s.durable.flowerQuests.proofs.silver={...photo,flowerSubjects:['silver']};
    s=interact(s,'flower:forest-inbox',ground(-174,-48.4));
    expect(s.durable.flowerStock).toBeNull();
    s=interact(s,'flower:forest-request',ground(5.7,-228.1));
    s=interact(s,'flower:forest-inbox',ground(-174,-48.4));
    expect(s.durable.flowerStock?.earned).toEqual(['gold','scarlet','silver']);
    s=interact(s,'flower:forest-inbox',ground(-174,-48.4));
    expect(s.durable.flowerStock?.counts.silver).toBe(1);
    expect(restoreJourney(serializeJourney(s)).state.durable.flowerQuests.proofs.silver?.original?.key).toBe(photo.original?.key);
  });
  it('requires a new shutter date after accepting a revisit and grants exactly one duplicate',()=>{
    let s=reward();
    s.durable.flowerStock=fullStock();
    s=interact(s,'flower:moon-riddle',ground(132.4,-19.5));
    s.durable.film=[{...photo,flowerSubjects:['moon']}];
    s=step(s,{type:'flower-photo',operation:'repeat',photoId:photo.id});
    expect(s.durable.flowerQuests.revisit?.reviewed).toBe(false);
    s.durable.film.push({...photo,id:'photo-2',sequence:2,flowerSubjects:['moon']});
    s=step(s,{type:'flower-photo',operation:'repeat',photoId:'photo-2'});
    s=step(s,{type:'flower-photo',operation:'redeem',kind:'silver'});
    s=step(s,{type:'flower-photo',operation:'redeem',kind:'silver'});
    expect(s.durable.flowerStock?.counts.silver).toBe(2);
  });
  it('consumes ten different original boxes once and records the postmark after 50 seconds',()=>{
    let s=reward();
    const points=FLOWER_ORDER.map((_,i)=>ground((i<5?128.2:129.2)+i%5*2,i<5?-42.8:-45.8));
    expect(points.every(point=>launchGround(point)?.capacity===12)).toBe(true);
    s.durable.flowerStock={...fullStock(),boxes:FLOWER_ORDER.map((kind,i)=>({kind,position:points[i]!,source:'stock'}))};
    s.runtime.torchLit=true;
    s=interact(s,'night-ignite',points[0]!);
    expect(s.runtime.fireworkShow?.party?.invitation).toBe(true);
    expect(s.runtime.fireworkShow?.party?.cues.map(cue=>cue.launch)).toEqual(points);
    expect(s.durable.flowerStock?.invitation).toEqual({started:true,witnessed:false});
    expect(Object.values(s.durable.flowerStock?.counts??{}).reduce((sum,n)=>sum+n,0)).toBe(0);
    const saved=restoreJourney(serializeJourney(s)).state;
    expect(saved.durable.flowerStock?.invitation).toEqual({started:true,witnessed:false});
    expect(saved.runtime.fireworkShow).toBeNull();
    for(let i=0;i<50;i++)s=step(s,{type:'tick',deltaSeconds:1});
    expect(s.durable.flowerStock?.invitation.witnessed).toBe(true);
  });
  it('separates the invitation finale while keeping the original launch points and ordinary cues',()=>{
    const boxes=FLOWER_ORDER.map((kind,i)=>({kind,position:ground(128+i,-43.6),source:'stock' as const}));
    const invitation=partyCues(boxes,true);
    const willow=invitation.find(cue=>cue.kind==='gold')!;
    const stars=invitation.find(cue=>cue.kind==='stars')!;
    expect(willow).toMatchObject({burst:38,radius:9.2,count:27});
    expect(stars).toMatchObject({burst:41.65,radius:8.6,count:19,launch:boxes.at(-1)!.position});
    expect(stars.offset[1]-willow.offset[1]).toBeGreaterThan(4);
    const ordinary=partyCues(boxes,false).find(cue=>cue.kind==='stars')!;
    expect(ordinary.offset[1]).toBe(20.6);
    expect(ordinary.burst).toBeCloseTo(12+(39.1-6)*.64);
    const pearl:number[]=[],blue:number[]=[];
    drawInvitationStars(pearl,blue,[0,0,0],1.65,stars.radius);
    expect(pearl.length/16).toBe(24);
    expect((pearl.length+blue.length)/16).toBe(69);
    expect(pearl.filter((_,index)=>index%16===12).every(x=>Math.abs(x)<stars.radius*.75)).toBe(true);
  });
  it('keeps three borrowed launch anchors and eight distinguishable new silhouettes',()=>{
    const stock=fullStock(),anchor=ground(132,-43.65);
    expect(partyCues(stock.earned.map(kind=>({kind,position:anchor,source:'stock'})),true)).toHaveLength(10);
    const shapes=new Set<string>();
    for(const flower of FLOWER_ORDER.slice(2)){
      if(flower==='gold'||flower==='scarlet')continue;
      const base:number[]=[],accent:number[]=[];
      drawFestivalFlower(flower,base,accent,[0,0,0],1.4,5);
      expect(base.length+accent.length).toBeGreaterThan(100);
      shapes.add(JSON.stringify([base,accent]));
    }
    expect(shapes.size).toBe(8);
  });
});

describe('the sixth person',()=>{
  it.each([false,true])('the discontinuity needs an ordinary walking jump, unlocked=%s',jump=>{
    const controller=createTravelController({spawn:ground(178.7,34.78),initialYaw:Math.PI/2,
      terrainHeight:walkingSurfaceHeight,resolveMove,traceSegment});
    controller.setAbilities({run:false,jump});
    const advance=(n:number,vertical:number,jumping=false)=>{
      controller.submitInput({...EMPTY_INPUT,vertical,jump:jumping});
      for(let i=0;i<n;i++)controller.step(1/60);
    };
    advance(28,1);advance(23,1,true);advance(28,0);
    expect(sixthNearby(controller.snapshot().position)).toBe(jump?'sixth:tin':null);
  });
  it('preserves tin-first, uncovering and switching the display through an overnight reload',()=>{
    let s=reward();
    s.durable.skills.jump=true;
    s=interact(s,'sixth:tin',SIXTH_STOPS.tin.position);
    expect(s.durable.sixth).toMatchObject({seen:false,tin:true,revealed:false});
    s=interact(s,'sixth:enlarger',SIXTH_STOPS.enlarger.position);
    s=step(s,{type:'sixth',operation:'reveal'});
    s=step(s,{type:'set-screen',screen:'play'});
    s=interact(s,'sixth:window',SIXTH_STOPS.window.position);
    s=step(s,{type:'sixth',operation:'display'});
    expect(s.durable.sixth.displayed).toBe(false);
    s=step(s,{type:'set-screen',screen:'play'});
    s.durable.clock={day:1,minute:1240};
    s=interact(s,'sixth:room',SIXTH_STOPS.room.position);
    expect(s.runtime.sixthPanel).toBeNull();
    expect(restoreJourney(serializeJourney(s)).state.durable.sixth.revealed).toBe(true);
    s.durable.clock={day:2,minute:450};
    s=interact(s,'sixth:room',SIXTH_STOPS.room.position);
    expect(s.runtime.sixthPanel).toBe('room');
    s=step(s,{type:'sixth',operation:'display'});
    expect(restoreJourney(serializeJourney(s)).state.durable.sixth).toEqual({
      seen:true,tin:true,revealed:true,displayed:true,portrait:null,
    });
  });
});
