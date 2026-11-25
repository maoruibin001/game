import assert from 'node:assert/strict';
import { createP0Harness } from './p0-normal-input.mjs';
import { P0_ROUTE as route } from './p0-route-plan.mjs';

export const PLAN={id:'batch3-visuals',revision:'p0-20261116-normal-input-01',budgetMs:720000,
  viewport:[1920,1080],coverage:'three hero views plus town side/back, same view in three weather states, 15 real JPEG exports, two approach-road screenshots',
  limitation:'authored route and normal weather UI remain P0; no substitute for P1 weather design or two independent first plays'};

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function visuals(play){
  const h=await createP0Harness(play,PLAN);let error;
  async function threeSkies(label,view,matchedCard=null){
    await h.cameraAt(view,label);let fixed;
    for(const weather of ['morning','rain','afterglow']){
      await h.weather(weather);await h.shot(`${label}-${weather}-viewfinder`);
      const p=await h.photograph(`${label}-${weather}-film`,{matchedCard});
      const facts={position:p.scene.camera.position,forward:p.scene.camera.forward,lens:p.scene.lens,exposure:p.scene.exposure};
      if(fixed){
        assert.equal(facts.lens,fixed.lens);assert.equal(facts.exposure,fixed.exposure);
        for(const key of ['position','forward'])facts[key].forEach((n,i)=>assert.ok(Math.abs(n-fixed[key][i])<1e-4,
          `${label}: weather comparison must retain the actual viewpoint`));
      }else fixed=facts;
      await h.exportLatest(p,`${label}-${weather}`);
    }
    await h.lowerCamera();
  }
  try{
    await h.step('forest-approach-road-and-three-skies',async()=>{
      await h.startFresh();await h.shot('fresh-spawn-final-art');
      await h.route(route.forest.slice(0,4),'forest-mid-road');await h.turnTo(-2.32,.08);await h.shot('forest-road-node-medium');
      await h.route(route.forest.slice(4),'forest-final-approach');
      await threeSkies('forest',route.forestPhoto,'forest');
    });
    await h.step('town-road-gate-and-front-three-skies',async()=>{
      await h.route(route.forestReturn,'forest-main-road-return');
      await h.route(route.town.slice(1,4),'town-mid-road');await h.turnTo(2.65,.08);await h.shot('town-road-node-medium');
      await h.route(route.town.slice(4),'town-final-approach');
      await h.route(route.lever,'town-winch');await h.wait(s=>s.state.runtime.nearby==='town-gate');
      await h.shot('final-winch-affordance');await h.key('KeyE');await h.wait(s=>s.world.gateOpen);
      await h.route(route.gateToPhoto,'town-photo-approach');await threeSkies('town-front',route.townPhoto,'town');
      await h.wait(s=>s.world.bridgeWalkable,10000);
    });
    await h.step('town-side-back-three-skies',async()=>{
      await h.route([[155,5],...route.eastBack,[176,29]],'town-rear');await threeSkies('town-back',route.townBackPhoto);
      await h.route([[176,26],[176,23],[175,19]],'town-east-side');await threeSkies('town-side',route.townSidePhoto);
      await h.route([[176,23],[176,26],...route.eastBackReturn],'town-rear-exit');
    });
    await h.step('ridge-three-skies-and-final-catalog',async()=>{
      await h.route(route.ridge,'ridge-normal-path');await threeSkies('ridge',route.ridgePhoto);
      assert.equal(h.report.downloads.length,15,'five independently reached stations times three actual weather captures');
      for(const station of ['forest','town-front','town-side','town-back','ridge']){
        const files=h.report.downloads.filter(d=>d.name.startsWith(`${station}-`));assert.equal(files.length,3);
        assert.equal(new Set(files.map(d=>d.sha256)).size,3,`${station}: different lighting must produce different real image bytes`);
      }
      await h.shot('final-ridge-normal-gameplay');
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
