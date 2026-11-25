import assert from 'node:assert/strict';
import {createP0C,townReady,loadP0CPreflight} from './p0-c-normal-input.mjs';
import {P0_C_LANDMARKS as landmarks,P0_C_ROUTES as routes,P0_C_VIEWS as views} from './p0-c-route-plan.mjs';

const PREFLIGHT=await loadP0CPreflight('B');
export const PLAN={id:'p0c-east',revision:'p0c-normal-exterior-and-stable-weather-01',budgetMs:660000,viewport:[1920,1080],
  coverage:'16 distinct town/station exterior PNGs; 1 real town setup photo excluded; 3 town + 3 valley-road fixed-view fixed-world weather JPEGs; valley road is not the original platform hero point'};
export default async function east(play){
  const h=await createP0C(play,PLAN,PREFLIGHT);let error;
  try{
    await h.step('town-normal-arrival-crank-and-actual-bridge-unlock',async()=>{
      await h.startFresh();await h.route(routes.townEntry,'town-normal-road-entry');await h.route(routes.crank,'town-south-crank');
      await h.wait(s=>s.state.runtime.nearby==='town-gate');await h.key('KeyE');await h.wait(s=>s.world.gateOpen);
      await h.route(routes.townPhotoApproach,'town-new-photo-view');await h.setupCard('town',views.town,townReady);
    });
    await h.step('town-three-weathers-after-bridge-and-lights-settle',()=>h.weatherOriginals('town-front-stable-world',views.town,townReady));
    await h.step('town-eight-ordinary-exterior-stations',()=>h.exteriorRing(landmarks.town));
    await h.step('normal-eastern-trail-and-valley-road-three-weathers',async()=>{
      await h.route(routes.townHighEntry,'town-eastern-trail-entry');await h.route(routes.valleyRoad,'valley-road-64-204');
      await h.weatherOriginals('ridge-postal-road-valley-view',views.valleyRoad,townReady);
    });
    await h.step('station-eight-ordinary-exterior-stations-and-return',async()=>{
      await h.route(routes.ridgeOuterEntry,'ridge-normal-exterior-approach');await h.exteriorRing(landmarks.ridge);
      assert.equal(h.report.exteriorSamples.length,16);assert.equal(h.report.downloads.length,6);
      assert.equal(h.report.setupPhotos.length,1);assert.equal(h.report.photos.length,7);
      await h.shot('east-final-normal-gameplay');
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
