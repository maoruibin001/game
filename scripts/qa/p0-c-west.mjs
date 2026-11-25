import assert from 'node:assert/strict';
import {createP0C,forestReady,loadP0CPreflight} from './p0-c-normal-input.mjs';
import {P0_C_LANDMARKS as landmarks,P0_C_ROUTES as routes,P0_C_VIEWS as views} from './p0-c-route-plan.mjs';

// Refuse before the official CLI launches its browser if source binding is absent.
const PREFLIGHT=await loadP0CPreflight('A');
export const PLAN={id:'p0c-west',revision:'p0c-normal-exterior-and-stable-weather-01',budgetMs:480000,viewport:[1920,1080],
  coverage:'16 distinct exterior-direction photo-mode PNGs; 1 real forest setup photo excluded; 3 forest fixed-view fixed-world weather JPEGs'};
export default async function west(play){
  const h=await createP0C(play,PLAN,PREFLIGHT);let error;
  try{
    await h.step('post-office-eight-ordinary-exterior-stations',async()=>{
      await h.startFresh();await h.route(routes.postEntry,'post-normal-road-entry');await h.exteriorRing(landmarks.post);
      await h.route(routes.postExit,'post-normal-road-exit');
    });
    await h.step('forest-normal-road-and-actual-main-card-setup',async()=>{
      await h.route(routes.forestEntry,'forest-normal-road-entry');await h.setupCard('forest',views.forest,forestReady);
    });
    await h.step('forest-three-weathers-with-stable-unlocked-world',()=>h.weatherOriginals('forest-stable-world',views.forest,forestReady));
    await h.step('forest-eight-ordinary-exterior-stations-and-return',async()=>{
      await h.exteriorRing(landmarks.forest);assert.equal(h.report.exteriorSamples.length,16);
      assert.equal(h.report.downloads.length,3);assert.equal(h.report.setupPhotos.length,1);assert.equal(h.report.photos.length,4);
      await h.shot('west-final-normal-gameplay');
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
