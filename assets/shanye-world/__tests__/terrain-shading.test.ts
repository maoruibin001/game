import { describe, expect, it } from 'vitest';
import { buildWorldContent, terrainChunk } from '../world.pack.ts';
import { voxelHeight, columnHeight, meadowCorner, roadSample, terrainCellSize, pavedSurfaceHeight } from '../world-layout.ts';
import { worldAsset } from '../world-refs.ts';


describe('terrace face definition',()=>{
 it('keeps native mesh side normals distinct from tops and closes every riser against both terrain columns',()=>{
  let tops=0,sides=0,smallSteps=0,cliffs=0,slopedTops=0;
  const failures:string[]=[],sharedNormals=new Map<string,number[]>();
  const close=(a:number,b:number)=>Math.abs(a-b)<1e-4;
  for(let z=-400;z<400;z+=100)for(let x=-400;x<400;x+=100){
   // Inspect the actual native mesh attributes sent to the renderer, including
   // Float32 conversion; do not infer shading from a helper's chosen constants.
   const source=terrainChunk(x,z),faceMaterials=new Map<number,string>();
   for(const[name,indices]of source.groups)for(const vertex of indices)faceMaterials.set(Math.floor(vertex/4),name);
   const mesh=source.build(name=>worldAsset(`material/${name}`));
   const p=mesh.attributes.position,n=mesh.attributes.normal;
   if(!(p instanceof Float32Array)||!(n instanceof Float32Array))throw Error('native terrain attributes missing');
   let topMaterial='';
   for(let i=0;i<p.length;i+=12){
    const point=(v:number,axis:number)=>p[i+v*3+axis]!;
    const nx=n[i]!,ny=n[i+1]!,nz=n[i+2]!;
    const label=`chunk ${x},${z}, face ${i/12}`;
    if(!close(Math.hypot(nx,ny,nz),1))failures.push(`${label}: non-unit normal`);
    const low=Math.min(...[0,1,2,3].map(v=>point(v,1))),high=Math.max(...[0,1,2,3].map(v=>point(v,1)));
    const topSpanX=Math.abs(point(2,0)-point(0,0)),topSpanZ=Math.abs(point(2,2)-point(0,2));
    for(let v=0;v<4;v++){
     const sx=point(v,0),sz=point(v,2),normal=[n[i+v*3]!,n[i+v*3+1]!,n[i+v*3+2]!];
     if(!close(Math.hypot(...normal),1))failures.push(label+': non-unit vertex normal');
     if(topSpanX>0&&topSpanZ>0&&sz>=128&&sz<=292&&Math.abs(sx)<=248){
      const key=sx+'/'+sz,shared=sharedNormals.get(key);
      if(shared&&shared.some((value,k)=>!close(value,normal[k]!)))failures.push(label+': ridge lighting seam');
      sharedNormals.set(key,normal);
      if(normal[1]!<=0)failures.push(label+': inward ridge normal');
     }else if(!(topSpanX>0&&topSpanZ>0) || !(point(0,2)<=292&&point(2,2)>=128&&point(0,0)<=248&&point(2,0)>=-248)){
      if(!close(normal[0]!,nx)||!close(normal[1]!,ny)||!close(normal[2]!,nz))failures.push(label+': inconsistent flat face');
     }
    }
    if(topSpanX>0 && topSpanZ>0){
     tops++; if(high-low>1e-4)slopedTops++;
     topMaterial=faceMaterials.get(i/12)!;
     if(ny<=0)failures.push(`${label}: inward top`);
     // Independently interpolate inside BOTH native mesh triangles, including the diagonal.
     for(const [u,v] of [[.50,.50],[.72,.18],[.21,.79]] as const){
      const y=v<=u?(1-u)*point(0,1)+(u-v)*point(1,1)+v*point(2,1):(1-v)*point(0,1)+(v-u)*point(3,1)+u*point(2,1);
      if(!close(y,voxelHeight(point(0,0)+u*topSpanX,point(0,2)+v*topSpanZ)))failures.push(`${label}: rendered surface differs from footing`);
     }
     continue;
    }
    sides++;if(high-low<=1)smallSteps++;if(high-low>5.5)cliffs++;
    const horizontal=faceMaterials.get(i/12)!.endsWith('-side')?1:.85;
    // Check the emitted mesh independently so an upward grass normal cannot slip back in.
    if(!close(ny,Math.sqrt(1-horizontal**2))||!close(Math.hypot(nx,nz),horizontal))
     failures.push(`${label}: shading normal does not match the exposed surface`);
    if(faceMaterials.get(i/12)!.endsWith('-side')&&faceMaterials.get(i/12)!==`${topMaterial}-side`)
     failures.push(`${label}: side loses the matching meadow hue`);
    if((Math.abs(nx)>1e-5)===(Math.abs(nz)>1e-5))failures.push(`${label}: non-axis-aligned riser`);
    const ox=Math.sign(nx)*.01,oz=Math.sign(nz)*.01;
    const width=Math.hypot(point(1,0)-point(0,0),point(1,2)-point(0,2));
    for(let section=0;section<width;section++){
     const t=(section+.5)/width,cx=point(0,0)+(point(1,0)-point(0,0))*t,cz=point(0,2)+(point(1,2)-point(0,2))*t;
     const own=columnHeight(cx-ox,cz-oz),outsideX=cx+ox,outsideZ=cz+oz;
     const outside=outsideX< -400||outsideX>=400||outsideZ< -400||outsideZ>=400;
     const neighbour=outside?Math.min(-5,own-30):columnHeight(outsideX,outsideZ);
     const edgeAt=(h:number)=>(1-t)*meadowCorner(point(0,0),point(0,2),h)+t*meadowCorner(point(1,0),point(1,2),h);
     if(!close(edgeAt(own),(1-t)*point(3,1)+t*point(2,1))||!close(edgeAt(neighbour),(1-t)*point(0,1)+t*point(1,1)))failures.push(`${label}: crack in terrain boundary`);

    }
   }
  }
  expect(sharedNormals.size).toBeGreaterThan(5000);
  expect(tops).toBeGreaterThan(0);expect(sides).toBeGreaterThan(0);
  // These neighbouring open corners cross the former quantized cutoff on the
  // west hillside visible from spawn. Both sides of each corner must coincide.
  for(let x=-368;x<=-324;x+=4){
   expect(meadowCorner(x,-48,50)).toBe(meadowCorner(x,-48,100));
  }
  expect(slopedTops).toBeGreaterThan(10000);expect(smallSteps).toBeGreaterThan(0);expect(cliffs).toBeGreaterThan(0);
  expect(failures.slice(0,20),`${failures.length} invalid terrain faces`).toEqual([]);
 });
 it('joins both sides of the east ridge approach across fine and coarse cells without burying the paving',()=>{
  let mixedEdges=0,grassEdges=0,ribbonSamples=0,maxJump=0,minPavingClearance=Infinity;
  for(let x=49;x<110;x++)for(let z=177;z<219;z++){
   const road=roadSample(x,z);
   if(road.route!=='town-high'||road.distance>12)continue;
   for(const t of [.25,.75]){
    for(const [ax,az,bx,bz] of [[x-.0001,z+t,x+.0001,z+t],[x+t,z-.0001,x+t,z+.0001]] as const){
     maxJump=Math.max(maxJump,Math.abs(voxelHeight(ax,az)-voxelHeight(bx,bz)));
     if(terrainCellSize(ax,az)!==terrainCellSize(bx,bz))mixedEdges++;
     grassEdges++;
    }
    const px=x+t,pz=z+t,paved=pavedSurfaceHeight(px,pz);
    if(Number.isFinite(paved)){
     minPavingClearance=Math.min(minPavingClearance,paved-voxelHeight(px,pz));ribbonSamples++;
    }
   }
  }
  expect(grassEdges).toBeGreaterThan(3000);
  expect(mixedEdges).toBeGreaterThan(100);
  expect(ribbonSamples).toBeGreaterThan(200);
  expect(maxJump).toBeLessThan(.005);
  expect(minPavingClearance).toBeGreaterThan(.01);
 });
 it('uses the same slight linear-light darkening and surface treatment for every grass top/side pair',()=>{
  const resources=buildWorldContent();let commonRatio:number|undefined;
  for(const name of ['grass','grass-light','grass-dark']){
   const top=resources[`material/${name}`],side=resources[`material/${name}-side`];
   if(top?.kind!=='material'||side?.kind!=='material')throw Error(`missing grass pair ${name}`);
   const a=top.values?.baseColor as readonly number[],b=side.values?.baseColor as readonly number[];
   for(let channel=0;channel<3;channel++){
    const ratio=b[channel]!/a[channel]!;
    expect(ratio).toBeCloseTo(.96,6);
    commonRatio??=ratio;expect(ratio).toBeCloseTo(commonRatio,6);
   }
   expect(b[3]).toBe(a[3]);
   for(const field of ['roughness','metallic','baseColorTexture','triplanar'])expect(side.values?.[field]).toEqual(top.values?.[field]);
  }
 });
 it('lets low grass faces darken with the time of day without giving up stepped silhouettes',()=>{
  const resources=buildWorldContent();
  for(const name of ['grass','grass-light','grass-dark','grass-slope']){
   const material=resources['material/'+(name==='grass-slope'?name:name+'-side')];
   if(material?.kind!=='material')throw Error('missing grass surface');
   const emissive=(material.values?.emissive ?? [0,0,0]) as readonly number[];
   expect(emissive.slice(0,3)).toEqual([0,0,0]);
  }
 });
});
