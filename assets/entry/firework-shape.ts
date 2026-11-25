import { FIRST_WILLOW_CORE_OUT, FIRST_WILLOW_CUE } from '../journey/night.ts';
import type { Vec3 } from '../journey/types.ts';

const goldenAngle = Math.PI * (3 - Math.sqrt(5));
// World-space corridors. Keep the lower sweep separated from either end of the valley.
const WILLOW_BUNDLES = [
  {x:-1.05,z:.025,loft:2.8,drop:4.25,lag:.08,fade:0,veer:-.28},
  {x: -.64,z:-.075,loft:3.9,drop:5.15,lag:.29,fade:.22,veer:-.13},
  {x: -.27,z:.065,loft:2.8,drop:5.65,lag:.48,fade:.10,veer:.10},
  {x:  .28,z:-.057,loft:3.75,drop:4.56,lag:.39,fade:.36,veer:-.12},
  {x:  .66,z:.079,loft:3.1,drop:5.55,lag:.20,fade:0,veer:.15},
  {x: 1.04,z:-.032,loft:2.9,drop:4.0,lag:.05,fade:.16,veer:.30},
] as const;
const WILLOW_STRANDS = [
  {length:1,spread:0,loft:0,lag:0},
  {length:.94,spread:-.28,loft:-.24,lag:.018},
  {length:1.04,spread:.28,loft:.18,lag:.034},
  {length:.89,spread:-.56,loft:-.38,lag:.025},
  {length:.96,spread:.56,loft:.26,lag:.024},
] as const;
export const WILLOW_LIFETIME = 8.4;

function trailSegment(output: number[], from: Vec3, to: Vec3, thickness: number) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < .002) return;

  const ux = dx / length, uy = dy / length, uz = dz / length;
  const horizontal = Math.hypot(ux, uz);
  const rx = horizontal > .001 ? uz / horizontal : 1;
  const rz = horizontal > .001 ? -ux / horizontal : 0;
  const overlap = 1.06;
  output.push(
    rx * thickness, 0, rz * thickness, 0,
    dx * overlap, dy * overlap, dz * overlap, 0,
    -rz * uy * thickness, (rz * ux - rx * uz) * thickness, rx * uy * thickness, 0,
    (from[0] + to[0]) * .5, (from[1] + to[1]) * .5, (from[2] + to[2]) * .5, 1,
  );
}

export type FirstWillowPalette = { ivory:number[]; honey:number[]; copper:number[] };

export function drawGoldenWillow(
  gold: number[], amber: number[], pearl: number[], center: Vec3, age: number, radius: number, branches: number, first?: FirstWillowPalette, inBundles = false, invitation = false,
) {
  const [x, y, z] = center;
  const coreAge=FIRST_WILLOW_CORE_OUT-FIRST_WILLOW_CUE.burst;
  if(first&&age<coreAge){
    const coreScale=.56*Math.min(1,(coreAge-age)/.90);
    ember(first.honey,[x,y,z],coreScale);
  }
  for (let i = 0; i < branches; i++) {
    const strandIndex=i%WILLOW_STRANDS.length;
    const strand=WILLOW_STRANDS[strandIndex]!;
    const bundle=first&&inBundles ? WILLOW_BUNDLES[Math.floor(i/WILLOW_STRANDS.length)] : undefined;
    const delay = (i % 7) * .067;
    const elapsed = age - delay;
    const duration = WILLOW_LIFETIME - (i % 5) * .28 - (bundle?.fade??0);
    if (elapsed <= 0 || elapsed >= duration) continue;
    const tip = Math.min(1, elapsed / 1.46);
    const fade = Math.max(0, Math.min(1, (duration - elapsed) / 2.9));
    const fine=Boolean(first)&&(bundle?strandIndex>1:i%3===1);
    const sag = Math.max(0, elapsed - 1.7 - (bundle?bundle.lag+strand.lag:0)) * (fine?1.28:1);
    const angle = i * goldenAngle;
    const reach = radius * (.66 + .34 * ((i * 17) % branches) / (branches - 1));
    const loft = 2.45 + ((i * 11) % 17) * .113;
    const bend = .16 * Math.sin(i * 31.4);

    // The branch begins at the burst, reaches sideways, then curves down.
    // The bent segments overlap so the shape survives small thumbnail sizes.
    const point = (s: number): Vec3 => {
      if (bundle) {
        // Open the arc early, then spend the remaining motion on the fall.
        const fan=s*(2.65+s*(-2.30+.65*s));
        const hang=s*s;
        const reach=radius*fan;
        const drift=(bundle.veer+strand.spread+.075*sag)*hang;
        return [x+.87*(bundle.x*reach+drift),
          y+(bundle.loft+strand.loft)*Math.sin(Math.PI*s*.91)
            - bundle.drop*strand.length*hang-sag*(.25+.70*hang),
          z+bundle.z*reach+strand.spread*.43*hang];
      }
      const travel = reach * s * (1.32 - .32 * s);
      const heading = angle + bend * s * s;
      return [x + .11 * sag + Math.cos(heading) * travel,
        y + loft * Math.sin(Math.PI * s * .88)
          - (3.45 + sag * (invitation ? .36 : .22)) * s * s - sag * (invitation ? .53 : .36),
        z + Math.sin(heading) * travel * .66];
    };
    // During the final fall the inner sections burn out first.
    const start = invitation ? Math.max(0, (elapsed - 2.5) * .24)
      : Math.max(0, (elapsed - (first?2.65:5.3)) * (first?.17:.245));
    const step=.065;
    // Pin the grouped segment grid so a faded gap cannot slide back into view.
    const rest=bundle?Math.ceil(start/step)*step:start;
    let before=point(rest);
    for (let cell=Math.round(rest/step)+1,s=rest+step; s<tip+step; cell++,s+=step) {
      const t = Math.min(s, tip);
      const after = point(t);
      const tail = (fine && t < .70) || (elapsed > 5 && t < start + .15);
      const tipLit = !fine && tip-t < .07 && elapsed < 4.4;
      const batch = first ? tail ? first.copper : tipLit ? first.ivory : first.honey
        : invitation ? t > .79 ? amber : gold
        : elapsed < .85 && t < .18 ? pearl : t < .68 && elapsed < 6.2 ? gold : amber;
      const thickness = first ? (fine?.078:.131)*(.76+.24*(1-t))*fade
        : invitation ? (.086 + .034 * (1-t))*fade
        : (.029 + .049 * (1 - t) + .026 * Math.sin(Math.PI * t)) * fade;
      // Separate fine branches into descending sections before the core dies.
      const gap=fine&&(bundle
        ? age>=3.6+bundle.lag*.20&&cell>4&&cell%5===2
        : age>=3.60&&t>.29&&Math.floor((t+delay)*18)%5===2);
      if(!gap && t>rest)trailSegment(batch, before, after, thickness);
      before = after;
      if (t === tip) break;
    }
  }
}

export const PETAL_LIFETIME = 6.7;

function ember(output: number[], [x,y,z]: Vec3, width: number) {
  output.push(width,0,0,0, 0,width,0,0, 0,0,width,0, x,y,z,1);
}

export function drawScarletPetals(red: number[], amber: number[], center: Vec3, age: number, radius: number) {
  const blooms = [
    { x:-.74, y:-.46, z:.34, tilt:-.62, lag:0, size:.93 },
    { x:0, y:.23, z:-.34, tilt:.23, lag:.29, size:1.18 },
    { x:.72, y:-.74, z:.53, tilt:.59, lag:.51, size:1.03 },
  ];
  for (const [index,bloom] of blooms.entries()) {
    const time=age-bloom.lag;
    if (time<=0 || time>=PETAL_LIFETIME-.25) continue;
    const bloomAmount=1-Math.pow(1-Math.min(1,time/1.27),2.2);
    const drift=1-Math.exp(-time*2.9);
    const fade=Math.min(1,(PETAL_LIFETIME-.25-time)/2.55);
    const settle=Math.max(0,time-1.7)*.16;
    const origin:Vec3=[center[0]+bloom.x*radius*drift,center[1]+bloom.y*drift-settle,center[2]+bloom.z*radius*drift];
    const cosine=Math.cos(bloom.tilt), sine=Math.sin(bloom.tilt);

    // Each group grows into its own upright cup. The outer stars trace the
    // rim, the inner stars form two angled petals, and the warm center stays low.
    const place=(batch:number[], x:number, y:number, depth:number, width:number)=>{
      const scale=bloom.size*bloomAmount;
      ember(batch,[origin[0]+(x*cosine-depth*sine)*scale,
        origin[1]+y*scale,origin[2]+(x*sine+depth*cosine)*scale], width*fade);
    };
    for (const sign of [-1,1]) {
      for(let dot=0;dot<11;dot++){
        const t=dot/10;
        const expansion=.21*t+.83*Math.sin(t*Math.PI*.69);
        const rim=-.75+1.86*t+.16*t*t;
        place(red,sign*expansion,rim,-.18*Math.sin(Math.PI*t),.095+.038*t);
      }
      for(let dot=0;dot<8;dot++){
        const t=dot/7;
        place(red,sign*(.08+.55*Math.sin(t*Math.PI*.71)), -.66+1.75*t,
          .34+.19*Math.sin(t*Math.PI), .073+.026*t);
      }
    }
    for(let dot=0;dot<11;dot++){
      const angle=goldenAngle*dot+index*.4;
      const r=.14+.29*dot/10;
      place(amber,Math.cos(angle)*r,-.36+Math.sin(angle)*r*.69,Math.sin(angle)*r,.065+.045*(1-dot/11));
    }
  }
}

export const FESTIVAL_BURST_LIFE = 5.8;

const STAR_CLUSTERS = [
  { x:-.47, y:.04, z:.06, delay:0 },
  { x: .02, y:.24, z:-.13, delay:.19 },
  { x: .47, y:-.07, z:.10, delay:.39 },
] as const;

export function drawInvitationStars(pearl:number[], blue:number[], center:Vec3, age:number, radius:number) {
  const fade=Math.min(1,(FESTIVAL_BURST_LIFE-age)/2.15);
  if(fade<=0)return;
  for (const cluster of STAR_CLUSTERS) {
    const time=age-cluster.delay;
    if (time<=0) continue;
    const open=1-Math.exp(-2.4*time);
    const fall=.09*Math.max(0,time-1.0)**1.6;
    for (let i=0;i<23;i++) {
      const theta=i*goldenAngle;
      const radial=Math.sqrt((i+.5)/23);
      const bright=i%3===0;
      const glint=.90+.10*Math.sin(i*2.1+time*2.9)**2;
      ember(bright?pearl:blue,[
        center[0]+(cluster.x+.23*radial*Math.cos(theta))*radius*open,
        center[1]+(cluster.y+.205*radial*Math.sin(theta))*radius*open-fall,
        center[2]+(cluster.z+.095*Math.sin(theta*2))*radius*open,
      ],(bright?.245-.034*radial:.105-.026*radial)*fade*glint);
    }
  }
}

type FestivalFlower = Exclude<import('../journey/flower-catalog.ts').FlowerKind,'gold'|'scarlet'>;

export function drawFestivalFlower(
  kind: FestivalFlower, output: number[], accent: number[], center: Vec3, age: number, radius: number,
) {
  const fraction=Math.min(1,age/1.56);
  const turn=1-(1-fraction)**2;
  const fade=Math.max(0,Math.min(1,(FESTIVAL_BURST_LIFE-age)/2));
  if (!(fraction>0&&fade>0)) return;
  const gravity=.17*Math.max(0,age-1.2)**1.7;
  const at=(x:number,y:number,z:number):Vec3=>[
    center[0]+x*radius,center[1]+y*radius-gravity,center[2]+z*radius,
  ];
  const point=(x:number,y:number,z:number,width=.075,glow=false)=>ember(glow?accent:output,at(x,y,z),width*fade);
  const trace=(sample:(t:number)=>Vec3,n:number,width:number,batch=output)=>{
    let from=sample(0);
    for(let i=1;i<=n;i++){
      const t=i/n,there=sample(t);
      trailSegment(batch,from,there,width*fade*(1-.54*t));
      from=there;
    }
  };

  if(kind==='silver'){
    for(let i=0;i<7;i++){
      const width=.43+i*.091;
      trace(t=>at(-.29+width*t*turn,.05+(.40-.125*i)*t*turn-.13*t*t,.16*turn*t*Math.sin(i)),12,.067);
      point(-.29+width*turn,.05+(.40-.125*i)*turn-.13,.16*turn*Math.sin(i),.105,true);
    }
    return;
  }
  if(kind==='twins'){
    for(const [index,offset] of [-.37,.38].entries()){
      const phase=Math.min(1,Math.max(0,(age-index*.42)/1.35));
      if(!phase)continue;
      const size=phase*(index?.40:.52);
      for(let i=0;i<32;i++){
        const a=i*Math.PI/16;
        const n=size*(.9+.10*Math.cos(a*6));
        point(offset+Math.cos(a)*n,(index?.34:-.15)+Math.sin(a)*n,Math.sin(a)*n*.41,.091,index===1);
      }
      point(offset,index?.34:-.15,0,.15,true);
    }
    return;
  }
  if(kind==='rain'){
    for(let row=0;row<3;row++){
      const spread=turn*(.51+row*.14);
      for(let i=0;i<24;i++){
        if((i+row)%7===0)continue;
        const a=i*2*Math.PI/24;
        point(Math.cos(a)*spread,.16-.20*row-.15*turn+Math.sin(a)*.09,Math.sin(a)*spread*.74,.09,row===0);
      }
    }
    return;
  }
  if(kind==='wheat'){
    for(let x=0;x<13;x++){
      const t=age-x*.085;
      if(t<=0)continue;
      const lift=Math.sin(Math.min(1,t/2.8)*Math.PI)*(.7-.12*Math.cos(x*1.1));
      for(let p=0;p<5;p++){
        const along=p/4;
        point((x-6)*.145+.045*Math.sin(along*Math.PI),.30*along*lift-.16,along*.16-.08,.079,p===4);
      }
    }
    return;
  }
  if(kind==='swallow'){
    for(const wing of [-1,1])for(const branch of [0,.10]){
      const knee=at(wing*.36*turn,.37*turn+branch,.13*wing);
      const tip=at(wing*.89*turn,.13*turn+branch,.24*wing);
      const root=at(0,-.20+branch,0);
      trailSegment(branch?accent:output,root,knee,.065*fade);
      trailSegment(branch?accent:output,knee,tip,.047*fade);
      ember(accent,tip,.085*fade);
    }
    return;
  }
  if(kind==='pine'){
    for(let tier=0;tier<3;tier++)for(let needle=0;needle<8;needle++){
      const x=(needle-3.5)*(.09+tier*.025);
      const y=(.48-.17*tier)*turn;
      const root=at(0,-.28+tier*.15,0);
      const tip=at(x*turn,y+.08*Math.sin(needle*1.2),.14*Math.sin(needle));
      trailSegment(tier===2?accent:output,root,tip,.052*fade);
    }
    return;
  }
  if(kind==='moon'){
    for(let i=0;i<31;i++){
      const t=i/30;
      if(t>turn)break;
      const a=(.55+t*1.55)*Math.PI;
      point(Math.cos(a)*.66,Math.sin(a)*.66,Math.sin(a)*.14,.093+.038*Math.sin(Math.PI*t),i%5===0);
      if(i>3&&i<27)point(Math.cos(a)*.54+.09,Math.sin(a)*.57,.045,.066,true);
    }
    return;
  }
  for(let i=0;i<69;i++){
    const t=i/68;
    const a=t*7.3*Math.PI+age*.16;
    const stretch=t*.78*turn;
    point(Math.cos(a)*stretch,.56-t*.72+.16*Math.sin(a),Math.sin(a)*stretch,.085-.032*t,t>.66);
  }
}
