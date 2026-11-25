import { markLoadTimeline } from '@forgeax/engine/app';
import type { EntityHandle } from '@forgeax/engine/ecs';
import type { AssetRegistry } from '@forgeax/engine/assets-runtime';
import { Instances, MeshFilter, MeshRenderer, PointLight, ShadowParticipation } from '@forgeax/engine/render';
import { Transform } from '@forgeax/engine/scene';
import type { TravelStatus } from '../controller/types.ts';
import { afterClosing, fireworkCues, fireworkPlacement, fireworkPosition, firstWillowLantern, FIRST_WILLOW_CORE_OUT, proposedFirework } from '../journey/night.ts';
import type { JourneyState, Vec3 } from '../journey/types.ts';
import { partyPlacement } from '../journey/flower-party.ts';
import { FIELD_BOX_LIMIT } from '../journey/flower-stock.ts';
import { NIGHT_SPARK_COLORS } from '../shanye-world/night-art.ts';
import { drawFestivalFlower, FESTIVAL_BURST_LIFE, drawGoldenWillow, drawInvitationStars, drawScarletPetals, PETAL_LIFETIME, WILLOW_LIFETIME } from './firework-shape.ts';
import { NIGHT_STOPS, WILLOW_LAMP_MAST } from '../shanye-world/night-layout.ts';
import { terrainHeight } from '../shanye-world/world-layout.ts';
import { worldGuidText } from '../shanye-world/world-refs.ts';

const HIDDEN: Vec3=[0,-1024,0];
const COLORS=NIGHT_SPARK_COLORS;
const IVORY=COLORS.indexOf('willow-ivory'), HONEY=COLORS.indexOf('willow-honey'), COPPER=COLORS.indexOf('willow-copper');
const sparkLife=5.15;
const thetaStep=Math.PI*(3-Math.sqrt(5));
const matrix=(out:number[],x:number,y:number,z:number,width:number,height=width)=>{
  out.push(width,0,0,0,0,height,0,0,0,0,width,0,x,y,z,1);
};
type World=import('@forgeax/engine/ecs').World;

/** The daylight boundary is visible before a journey starts. Night props are
 * independent so a missing late-game publication cannot stop the title. */
export async function installNightScene(world:World, assets:AssetRegistry) {
  const gateMesh=(await assets.load(worldGuidText('mesh/night/gate'),'mesh')).unwrap();
  const gateResult=world.spawn({component:Transform,data:{pos:[0,0,0]}},
    {component:MeshFilter,data:{assetHandle:gateMesh}},{component:MeshRenderer,data:{materials:[]}},
    {component:ShadowParticipation,data:{cast:true,receive:true}});
  if(!gateResult.ok){assets.release(gateMesh).unwrap();gateResult.unwrap();}
  const gate=gateResult.unwrap();
  let props:Awaited<ReturnType<typeof loadNightProps>>;
  let closed=false,openBefore=false,attempts=0;
  let phase:'idle'|'loading'|'ready'|'failed'='idle',error:string|undefined;
  function request(retry=false) {
    if(closed||(phase!=='idle'&&!(retry&&phase==='failed'&&attempts<2)))return;
    attempts++;
    phase='loading';error=undefined;
    markLoadTimeline('shanye-night-props-start');
    void loadNightProps(world,assets,()=>closed).then(loaded=>{
      if(closed||!loaded)return;
      props=loaded;phase='ready';
      markLoadTimeline('shanye-night-props-ready');
    }).catch(cause=>{
      if(closed)return;
      phase='failed';error=cause instanceof Error?cause.message:String(cause);
      console.warn('[山谷夜场] 景物加载失败。',error);
    });
  }
  return {
    status:()=>({phase,attempts,...(error?{error}:{})}),
    request,
    update(state:JourneyState,status:TravelStatus){
      const open=afterClosing(state.durable);
      if(open!==openBefore){
        world.set(gate,Transform,{pos:open?[...HIDDEN]:[0,0,0]}).unwrap();
        openBefore=open;
      }
      if(state.durable.started&&state.runtime.screen!=='menu')request();
      props?.update(state,status);
    },
    dispose(){
      closed=true;
      props?.dispose();
      world.despawn(gate).unwrap();
      assets.release(gateMesh).unwrap();
    },
  };
}

async function loadNightProps(world:World, assets:AssetRegistry, cancelled:()=>boolean) {
  const owned:EntityHandle[]=[];
  const names=['stalls','fish','bundle','scarlet','ghost','torch','moon-riddle','promise','pole',...COLORS.map(color=>`spark-${color}`)] as const;
  const loaded=await Promise.allSettled(names.map(async name=>{
    const guid=worldGuidText(`mesh/night/${name}`);
    const result=await assets.load(guid,'mesh');
    if(!result.ok)throw new Error(`mesh/night/${name} ${guid} · ${result.error.code}`);
    return result.value;
  }));
  const meshHandles=loaded.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
  const failed=loaded.find(result=>result.status==='rejected');
  if(cancelled()||failed){
    for(const mesh of meshHandles)assets.release(mesh);
    if(failed)throw failed.reason;
    return;
  }
  try {
  const handles=meshHandles.map((assetHandle,index)=>{
    const entity=world.spawn({component:Transform,data:{pos:[...HIDDEN]}},{component:MeshFilter,data:{assetHandle}},
      {component:MeshRenderer,data:{materials:[]}},{component:ShadowParticipation,data:{cast:index===0,receive:index===0}},
      ...(index>=names.length-COLORS.length?[{component:Instances,data:{transforms:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}}]:[])).unwrap();
    owned.push(entity);return entity;
  });
  const [stalls,fish,bundle,scarlet,ghost,torch,moonRiddle,promise,pole,...sparks]=handles as [EntityHandle,EntityHandle,EntityHandle,EntityHandle,EntityHandle,EntityHandle,EntityHandle,EntityHandle,EntityHandle,...EntityHandle[]];
  const boxes=Array.from({length:FIELD_BOX_LIMIT},(_,index)=>{
    const entity=world.spawn({component:Transform,data:{pos:[...HIDDEN]}},
      {component:MeshFilter,data:{assetHandle:meshHandles[index%2===0?2:3]!}},
      {component:MeshRenderer,data:{materials:[]}},
      {component:ShadowParticipation,data:{cast:false,receive:false}}).unwrap();
    owned.push(entity);return entity;
  });
  const companion=world.spawn({component:Transform,data:{pos:[...HIDDEN],scale:[.71,.71,.71]}},
    {component:MeshFilter,data:{assetHandle:meshHandles[1]!}},{component:MeshRenderer,data:{materials:[]}},
    {component:ShadowParticipation,data:{cast:false,receive:false}}).unwrap();
  owned.push(companion);
  const light=(color:Vec3,range:number)=>{
    const entity=world.spawn({component:Transform,data:{pos:[...HIDDEN]}},{component:PointLight,data:{color:[...color],intensity:0,range}}).unwrap();
    owned.push(entity);return entity;
  };
  const torchLight=light([1,.57,.24],11);
  const flare=light([1,.63,.28],64);
  const willowLight=light([1,.67,.36],24);
  const lampLight=light([1,.57,.24],6);
  const fishGlow=light([1,.37,.18],7);
  const grandfatherWindow=light([1,.64,.27],14);
  world.set(grandfatherWindow,Transform,{pos:[170.49,27.4,22.18]}).unwrap();
  const streetLights=[142,135,129.2].map(x=>({
    pos:[x,terrainHeight(x,-18)+2.9,-18] as Vec3, entity:light([1,.65,.29],10.2),
  }));
  const setPosition=(entity:EntityHandle, pos:Vec3)=>{
    const old=world.get(entity,Transform).unwrap().pos;
    if(old[0]!==pos[0]||old[1]!==pos[1]||old[2]!==pos[2])world.set(entity,Transform,{pos:[...pos]}).unwrap();
  };
  const setIntensity=(entity:EntityHandle,value:number)=>{
    if(Math.abs(world.get(entity,PointLight).unwrap().intensity-value)>.003)world.set(entity,PointLight,{intensity:value}).unwrap();
  };
  let openBefore:boolean|undefined, showing=false;
  function update(state:JourneyState, status:TravelStatus) {
    const d=state.durable,r=state.runtime,open=afterClosing(d),seconds=d.playSeconds;
    if(open!==openBefore){
      setPosition(stalls,open?[0,0,0]:HIDDEN);
      setPosition(moonRiddle,open?[0,0,0]:HIDDEN);
      for(const lamp of streetLights){ setPosition(lamp.entity,lamp.pos);setIntensity(lamp.entity,open?47:0); }
      openBefore=open;
    }
    const fishAt = NIGHT_STOPS.fish, fishY=terrainHeight(fishAt.x,fishAt.z)+1.92;
    const moving=r.fishMotionUntil>seconds ? Math.min(1,(r.fishMotionUntil-seconds)/1.55) : 0;
    const fishPos:Vec3=[fishAt.x-.77,fishY+moving*.28*Math.sin(seconds*2.2),fishAt.z+moving*1.45*Math.sin(seconds*1.34)];
    setPosition(fish,open?fishPos:HIDDEN);setPosition(fishGlow,fishPos);setIntensity(fishGlow,open?5.5:0);
    const greeting=open && d.night.fishLetter==='delivered' && moving>0;
    setPosition(companion,greeting?[fishPos[0]+.14,fishY+.31-.22*moving*Math.sin(seconds*2.2),fishAt.z-.95-moving*Math.sin(seconds*1.34)]:HIDDEN);

    const [x,y,z]=status.position,heading=status.facingYaw;
    const grip:Vec3=[x+Math.cos(heading)*.44+Math.sin(heading)*.25,y+1.30,z+Math.sin(heading)*.44-Math.cos(heading)*.25];
    const torchVisible=r.torchLit && r.screen!=='menu';
    setPosition(torch,torchVisible&&status.mode==='walk'?grip:HIDDEN);
    setPosition(torchLight,[grip[0],grip[1]+.47,grip[2]]);
    setIntensity(torchLight,torchVisible?25+1.35*Math.sin(seconds*8.9):0);
    const show=r.fireworkShow;
    const fuse=show && seconds-show.startedAt<3;
    const displayed=d.flowerStock ? (fuse?show.party?.boxes:d.flowerStock.boxes)??[] : [];
    for(const [i,handle] of boxes.entries())setPosition(handle,displayed[i]?.position??HIDDEN);
    setPosition(bundle,d.flowerStock?HIDDEN:fireworkPosition(d,'gold')??(fuse?show.launches.gold:undefined)??HIDDEN);
    setPosition(scarlet,d.flowerStock?HIDDEN:fireworkPosition(d,'scarlet')??(fuse?show.launches.scarlet:undefined)??HIDDEN);
    if(r.placingFirework && status.mode==='walk') {
      const point=proposedFirework(d);
      setPosition(ghost,(r.partyHolding?partyPlacement(d,r.partyHolding,point).ok:fireworkPlacement(d,r.fireworkInHand,point).valid)?point:HIDDEN);
    } else setPosition(ghost,HIDDEN);

    const elapsed=show?seconds-show.startedAt:0;
    const response=show?.party?.invitation?Math.max(0,Math.min(1,(elapsed-41.2)/3)):0;
    const lamp=firstWillowLantern(d);
    const {x:lampX,z:lampZ,foot,down,up,drop}=WILLOW_LAMP_MAST;
    const tip=down+(up-down)*(lamp?.extension??0)+drop;
    const hanging:Vec3=lamp?[lampX,tip,lampZ-.32]:HIDDEN;
    const swing=lamp?.angle??0;
    const current=world.get(promise,Transform).unwrap();
    const halfTurn=swing/2;
    if (hanging[1]!==current.pos[1]||Math.sin(halfTurn)!==current.quat[2])
      world.set(promise,Transform,{pos:[...hanging],quat:[0,0,Math.sin(halfTurn),Math.cos(halfTurn)]}).unwrap();
    const length=tip-foot;
    const poleTransform=world.get(pole,Transform).unwrap();
    if(lamp ? poleTransform.pos[1]!==foot||poleTransform.scale[1]!==length : poleTransform.pos[1]!==HIDDEN[1])
      world.set(pole,Transform,{pos:lamp?[lampX,foot,lampZ]:[...HIDDEN],scale:[1,length,1]}).unwrap();
    setPosition(lampLight,lamp?[lampX+drop*Math.sin(swing),tip-drop*Math.cos(swing),lampZ-.32]:HIDDEN);
    setIntensity(lampLight,lamp?4.2:0);
    setIntensity(grandfatherWindow,response*(1-response)*160);
    if(!show){
      if(showing){for(const entity of sparks)setPosition(entity,HIDDEN);setIntensity(flare,0);setIntensity(willowLight,0);showing=false;}
      return;
    }
    showing=true;
    const transforms=COLORS.map(()=>[] as number[]);
    let flash=0, willowGlow=0;
    let flashPos:Vec3=show.position;
    for(const cue of fireworkCues(show)){
      const launch='launch' in cue?cue.launch:show.launches[cue.kind];
      const life=cue.shape==='willow'?WILLOW_LIFETIME:cue.shape==='petals'?PETAL_LIFETIME:cue.shape==='festival'?FESTIVAL_BURST_LIFE:sparkLife;
      if(!launch || elapsed<cue.rise || elapsed>cue.burst+life) continue;
      const [lx,ly,lz]=launch.map((coordinate,index)=>coordinate-show.position[index]!) as [number,number,number];
      const [dx,dy,dz]=cue.offset;
      const center:Vec3=[lx+dx,ly+dy,lz+dz];
      const batch=transforms[COLORS.indexOf(cue.color)]!;
      const flight=cue.burst-cue.rise;
      if(elapsed<cue.burst){
        for(let i=0;i<19;i++){
          const t=(elapsed-cue.rise-i*.035)/flight;
          if(t<0)break;
          const f=t*(2-t),width=.038+.115*(1-i/19)**1.6;
          matrix(batch,lx+f*dx+.037*Math.sin(i*2.5),ly+f*dy+.5,lz+f*dz,width,width*(i===0?2.1:1.5));
        }
        continue;
      }
      const age=elapsed-cue.burst;
      const core=1-Math.min(1,age/.82);
      if(core>flash){flash=core;flashPos=[launch[0]+dx,launch[1]+dy,launch[2]+dz];}
      if(cue.shape==='willow'){
        const first=show.firstWillow ? {ivory:transforms[IVORY]!,honey:transforms[HONEY]!,copper:transforms[COPPER]!} : undefined;
        const finale=show.party?.invitation===true&&!show.firstWillow;
        drawGoldenWillow(finale?transforms[HONEY]!:batch,finale?transforms[COPPER]!:transforms[3]!,
          transforms[1]!,center,age,cue.radius,cue.count,first,true,finale);
        const arch=Math.sin(Math.PI*Math.min(1,age/5.8));
        const afterglow=show.firstWillow?Math.max(0,Math.min(1,(FIRST_WILLOW_CORE_OUT-elapsed)/.55)):1;
        willowGlow=arch*arch*120*afterglow;
        continue;
      }
      if(cue.shape==='petals'){
        drawScarletPetals(batch,transforms[3]!,center,age,cue.radius);
        continue;
      }
      if(cue.shape==='festival'){
        if(cue.kind==='stars'&&show.party?.invitation)drawInvitationStars(batch,transforms[4]!,center,age,cue.radius);
        else if(cue.kind!=='gold'&&cue.kind!=='scarlet')drawFestivalFlower(cue.kind,batch,transforms[0]!,center,age,cue.radius);
        continue;
      }
      for(let i=0;i<cue.count;i++){
        const v=1-(2*(i+.5))/cue.count,h=Math.sqrt(1-v*v),angle=i*thetaStep;
        const spokes=[Math.cos(angle)*h+(cue.shape==='spray'?.37*v:0),v,Math.sin(angle)*h] as const;
        const speed=.8+.24*Math.sin(i*47.329),life=sparkLife*(.70+.30*(.5+.5*Math.sin(i*103.1)));
        for(let trail=0;trail<3;trail++){
          const time=age-trail*.096;
          if(time<0||time>life)continue;
          const spread=cue.radius*speed*(1-Math.exp(-time*.79)),fade=1-time/life;
          const scale=(.047+.069*fade)*Math.pow(.66,trail)*(.79+.21*Math.sin(12*time+i)**2);
          matrix(batch,center[0]+spokes[0]*spread+.084*time,center[1]+spokes[1]*spread-.33*time*time,center[2]+spokes[2]*spread,scale,scale*(1.35+trail*.1));
        }
      }
    }
    for(const [index,batch] of transforms.entries()){
      const entity=sparks[index]!;
      if(!batch.length){setPosition(entity,HIDDEN);continue;}
      world.set(entity,Instances,{transforms:batch}).unwrap();
      setPosition(entity,show.position);
    }
    setPosition(flare,flashPos);setIntensity(flare,flash*flash*75);
    const gold=show.launches.gold;
    if(gold)setPosition(willowLight,show.firstWillow?[gold[0]-.5,gold[1]+2.45,gold[2]-3.4]:[gold[0]-1,gold[1]+8,gold[2]-10]);
    setIntensity(willowLight,willowGlow);
  }
  return {update,dispose(){
    for(const entity of owned.reverse())world.despawn(entity).unwrap();
    for(const mesh of meshHandles)assets.release(mesh).unwrap();
  }};
  } catch (cause) {
    for(const entity of owned.reverse())world.despawn(entity);
    for(const mesh of meshHandles)assets.release(mesh);
    throw cause;
  }
}
