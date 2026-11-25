import type {AABB,Vec3} from './world-layout.ts';

export const CX=160.125,CZ=51.25,HALF_X=4.42,HALF_Z=2.42;
export const XS=[-1,-.89,-.73,-.52,0,.52,.73,.89,1];
export const TS=[0,.18,.36,.53,.70,.86,1];
export const eaveY=(x:number,t:number)=>28.82+1.58*(.26*t+.74*t*t)+.62*Math.max(0,(Math.abs(x)-.63)/.37)**1.6*(1-.52*t);
export const roofPoint=(x:number,t:number,side:number):Vec3=>[CX+HALF_X*x,eaveY(x,t),CZ+side*HALF_Z*(1-t)];
export const sections=<T,>(a:readonly T[])=>a.slice(1).map((end,i)=>[a[i]!,end] as const);

/** Query the triangles between the same purlin stations used by the visible roof. */
export function bellRoofHeight(x:number,z:number):number|undefined{
 const u=(x-CX)/HALF_X,t=1-Math.abs(z-CZ)/HALF_Z;
 if(Math.abs(u)>1||t<0)return;
 const xx=sections(XS).find(([,b])=>u<=b)!,tt=sections(TS).find(([,b])=>t<=b)!;
 const [a,b]=xx,[c,d]=tt,s=(u-a)/(b-a),v=(t-c)/(d-c);
 return v<=s ? eaveY(a,c)*(1-s)+eaveY(b,c)*(s-v)+eaveY(b,d)*v
             : eaveY(a,c)*(1-v)+eaveY(a,d)*(v-s)+eaveY(b,d)*s;
}

// Broad-phase solids enclose only the thin pitched roof, well above head height.
export const bellRoofSolids:AABB[]=[];
for(const side of [-1,1])for(const [a,b] of sections(XS))for(const [c,d] of sections(TS)){
 const points=[roofPoint(a,c,side),roofPoint(b,c,side),roofPoint(b,d,side),roofPoint(a,d,side)];
 bellRoofSolids.push({id:`courtyard/upper-roof/${side}/${a}/${c}`,
  min:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))-.19,Math.min(...points.map(p=>p[2]))],
  max:[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))+.075,Math.max(...points.map(p=>p[2]))]});
}

// The two timber gables close the end walls from the tie beam up to the tiled verge.
for(const x of [CX-HALF_X,CX+HALF_X])for(const side of [-1,1])for(const [a,b] of sections(TS)){
 const p=roofPoint(1,a,side),q=roofPoint(1,b,side);
 bellRoofSolids.push({id:`courtyard/gable/${x}/${side}/${a}`,
  min:[x-.046,28.68,Math.min(p[2],q[2])],max:[x+.046,Math.max(p[1],q[1]),Math.max(p[2],q[2])]});
}

export const MOON_WINDOW={x:168.45,y:26.58,z:57.5,r:.89};
// All four edges sit inside the same level approach terrace.
export const LANTERN_POS=[162.85,45.82] as const;
