import { describe,expect,it } from 'vitest';
import { DEFAULT_PHOTOGRAPHY } from '../../shared/photography-contract.ts';
import { createTravelController } from '../travel-controller.ts';
import { EMPTY_INPUT,type InputFrame,type Vec3 } from '../types.ts';

const frame=(patch:Partial<InputFrame>):InputFrame=>({...EMPTY_INPUT,...patch});
const make=(yaw=0)=>createTravelController({spawn:[0,0,0],terrainHeight:()=>0,initialYaw:yaw,initialPitch:0});
const advance=(c:ReturnType<typeof make>,count=60)=>{for(let i=0;i<count;i++){c.step(1/60);c.updateCamera(1/60);}};
const delta=(a:Vec3,b:Vec3):Vec3=>[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

describe('movement follows the traveller facing',()=>{
  const headings=[['north',0,[0,0,-1],[1,0,0]],['east',Math.PI/2,[1,0,0],[0,0,1]],['south',Math.PI,[0,0,1],[-1,0,0]],['west',-Math.PI/2,[-1,0,0],[0,0,-1]]] as const;
  it.each(headings)('keeps W/S and A/D relative to a traveller facing %s',(_name,yaw,forward,right)=>{
    for(const [input,direction] of [
      [frame({vertical:1}),forward],
      [frame({vertical:-1}),forward.map(n=>-n)],
      [frame({horizontal:1}),right],
      [frame({horizontal:-1}),right.map(n=>-n)],
    ] as const){
      const c=make(yaw);c.submitInput(input);advance(c);
      const s=c.snapshot();expect(s.speed).toBeCloseTo(6.8);expect(s.position[0]).toBeCloseTo(direction[0]!*s.distanceWalked);expect(s.position[2]).toBeCloseTo(direction[2]!*s.distanceWalked);
      expect(s.facingYaw).toBeCloseTo(yaw);expect(s.yaw).toBeCloseTo(yaw);
    }
  });
  it('returns on the same line after backing up or strafing, without turning the body',()=>{
    for(const [out,back] of [[{vertical:-1},{vertical:1}],[{horizontal:1},{horizontal:-1}]] as const){
      const c=make(.73);c.submitInput(frame(out));advance(c);const away=c.snapshot();
      expect(away.facingYaw).toBeCloseTo(.73);c.submitInput(frame(back));advance(c);
      const backStep=delta(away.position,c.snapshot().position);
      expect(dot(away.position,backStep)).toBeLessThan(0);
      expect(away.position[0]*backStep[2]-away.position[2]*backStep[0]).toBeCloseTo(0,8);
      expect(c.snapshot().facingYaw).toBeCloseTo(.73);
    }
  });
  it('turns an idle traveller with normal mouse look before the very next movement frame',()=>{
    const c=make();c.submitInput(frame({lookActive:true,lookX:(Math.PI/2)/.0022}));
    expect(c.snapshot().yaw).toBeCloseTo(Math.PI/2);expect(c.snapshot().facingYaw).toBeCloseTo(Math.PI/2);
    c.submitInput(frame({vertical:1}));advance(c);expect(c.snapshot().position[0]).toBeGreaterThan(6.5);expect(c.snapshot().speed).toBeCloseTo(6.8);expect(c.snapshot().position[2]).toBeCloseTo(0);
    c.submitInput(frame({lookActive:false,lookX:800,lookY:400}));expect(c.snapshot().facingYaw).toBeCloseTo(Math.PI/2);expect(c.snapshot().yaw).toBeCloseTo(Math.PI/2);
  });
  it('keeps diagonal run speed and mid-air steering while facing changes',()=>{
    const c=make();c.submitInput(frame({run:true,jump:true,vertical:1,horizontal:1,lookActive:true,lookX:(Math.PI/2)/.0022}));advance(c,6);
    const s=c.snapshot();expect(s.position[1]).toBeGreaterThan(0);expect(s.grounded).toBe(false);expect(s.running).toBe(true);
    expect(s.position[0]).toBeCloseTo(1.1/Math.sqrt(2));expect(s.position[2]).toBeCloseTo(1.1/Math.sqrt(2));expect(s.facingYaw).toBeCloseTo(Math.PI/2);
  });
  it.each([0,1,2])('uses the subject facing for portrait movement at viewpoint %s, independently of camera pan',viewpoint=>{
    const c=make(.6);c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait',viewpoint});c.toggleCamera();
    const original=c.snapshot();c.submitInput(frame({lookActive:true,lookX:180,lookY:20}));
    expect(c.snapshot().facingYaw).toBe(original.facingYaw);expect(c.snapshot().yaw).not.toBe(original.yaw);
    const before=c.snapshot(),forward:Vec3=[Math.sin(before.facingYaw),0,-Math.cos(before.facingYaw)];
    c.submitInput(frame({vertical:1}));advance(c,1);
    const movement=delta(before.position,c.snapshot().position);expect(dot(movement,forward)).toBeCloseTo(2.2/60);
    expect(c.snapshot().camera.position).toEqual(original.camera.position);
    const next=c.snapshot(),right:Vec3=[Math.cos(next.facingYaw),0,Math.sin(next.facingYaw)];
    c.submitInput(frame({horizontal:1}));advance(c,1);expect(dot(delta(next.position,c.snapshot().position),right)).toBeCloseTo(2.2/60);
  });
  it.each(['walk','handheld'] as const)('preserves the subject heading and realigns the view on leaving a tripod for %s',target=>{
    const c=make(.6);c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'portrait'});c.toggleCamera();
    c.submitInput(frame({horizontal:1}));advance(c,10);const portrait=c.snapshot();
    if(target==='walk')c.toggleCamera();else c.configurePhotography({...DEFAULT_PHOTOGRAPHY,mode:'landscape'});
    const next=c.snapshot();expect(next.position).toEqual(portrait.position);expect(next.facingYaw).toBe(portrait.facingYaw);expect(next.yaw).toBe(next.facingYaw);
    c.submitInput(frame({vertical:1}));advance(c,1);
    const forward:Vec3=[Math.sin(next.facingYaw),0,-Math.cos(next.facingYaw)];
    const moved=dot(delta(next.position,c.snapshot().position),forward);
    if(target==='walk'){expect(moved).toBeGreaterThan(0);expect(moved).toBeLessThan(6.8/60);}
    else expect(moved).toBeCloseTo(2.2/60);
  });
  it('turns the character—not the camera/map—when steering with A/D in walk mode',()=>{
    const c=make(0);
    c.submitInput(frame({horizontal:1,steerCharacter:true}));advance(c,30);
    const rightTurn=c.snapshot();
    expect(rightTurn.yaw).toBeCloseTo(0);
    expect(rightTurn.facingYaw).toBeGreaterThan(1.4);
    expect(rightTurn.position[0]).toBeGreaterThan(2.5);

    c.submitInput(frame({horizontal:-1,steerCharacter:true}));advance(c,45);
    const leftTurn=c.snapshot();
    expect(leftTurn.yaw).toBeCloseTo(0);
    expect(leftTurn.facingYaw).toBeLessThan(-1.4);

    c.submitInput(frame({lookActive:true,lookX:250,steerCharacter:true,orbitOnly:true}));
    expect(c.snapshot().yaw).toBeGreaterThan(0.4);
    expect(c.snapshot().facingYaw).toBeCloseTo(leftTurn.facingYaw);
  });
});

describe('held walking intent and quick stops',()=>{
  it('keeps W independent of a left orbit and passive right-button transitions',()=>{
    const c=make();
    c.submitInput(frame({lookActive:true,lookX:.95/.0022,orbitOnly:true,steerCharacter:true}));
    expect(c.snapshot().facingYaw).toBe(0);
    for(const changes of [{},{lookActive:true},{lookActive:false}]){
      const before=c.snapshot();
      c.submitInput(frame({vertical:1,steerCharacter:true,...changes}));advance(c,12);
      const next=c.snapshot();
      expect(next.position[0]).toBeCloseTo(before.position[0],8);
      expect(next.position[2]).toBeLessThan(before.position[2]);
      expect(next.facingYaw).toBe(0);
    }
    c.submitInput(frame({vertical:1,steerCharacter:true,lookActive:true,lookX:.42/.0022}));
    advance(c,1);
    expect(c.snapshot().facingYaw).toBeGreaterThan(0);
    expect(c.snapshot().facingYaw).toBeLessThan(.42);
    c.submitInput(frame({vertical:1,steerCharacter:true}));
    advance(c,12);
    expect(c.snapshot().facingYaw).toBeCloseTo(.42);
  });
  it.each([1,-1])('keeps the displacement and facing together in a continuous W to lateral %s turn',side=>{
    const c=make();
    c.submitInput(frame({vertical:1,steerCharacter:true}));advance(c,15);
    c.submitInput(frame({horizontal:side,steerCharacter:true}));
    for(let i=0;i<34;i++){
      const before=c.snapshot();
      advance(c,1);
      const after=c.snapshot(),[dx,,dz]=delta(before.position,after.position);
      expect(Math.atan2(dx,-dz)).toBeCloseTo(after.facingYaw,7);
      if(i===0)expect(Math.abs(after.facingYaw)).toBeLessThan(.35);
    }
    expect(c.snapshot().facingYaw).toBeCloseTo(side*Math.PI/2,8);
  });
  it('takes a short stopping step when walking but no trailing step in the photo view',()=>{
    const c=make();
    c.submitInput(frame({vertical:1,steerCharacter:true}));advance(c,1);
    expect(c.snapshot().speed).toBeGreaterThan(0);expect(c.snapshot().speed).toBeLessThan(6.8);
    advance(c,9);expect(c.snapshot().speed).toBeCloseTo(6.8);
    const before=c.snapshot().distanceWalked;
    c.submitInput(frame({}));advance(c,6);
    expect(c.snapshot().speed).toBeCloseTo(0);
    expect(c.snapshot().distanceWalked-before).toBeGreaterThan(.08);
    expect(c.snapshot().distanceWalked-before).toBeLessThan(.24);
    c.toggleCamera();
    c.submitInput(frame({lookActive:true,lookX:.6/.0022}));c.submitInput(frame({horizontal:1}));
    const start=c.snapshot();advance(c,1);
    expect(dot(delta(start.position,c.snapshot().position),[Math.cos(start.yaw),0,Math.sin(start.yaw)])).toBeCloseTo(2.2/60,7);
    c.submitInput(frame({}));const release=c.snapshot().position;advance(c,10);
    expect(c.snapshot().position).toEqual(release);
  });
});
