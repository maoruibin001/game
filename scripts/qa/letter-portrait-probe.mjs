// Independent short portrait owner. Normal controls only; no photography command injection.
import assert from 'node:assert/strict';
import {cameraActive,walking,createLetterHarness,loadLetterBinding,photoFacts} from './letter-normal-input.mjs';

const BINDING=await loadLetterBinding('portrait');
export const PLAN={id:'letter-portrait-probe',revision:'letter-portrait-normal-01',viewport:[1920,1080],
  coverage:'normal portrait controls for look/wave/letter; actual native camera prop zero scale; three real captures; one original JPEG download; handheld restore; ordinary reload'};
const TITLE=[1772,162]; // Inside the frozen 1920×1080 closed field-tools title.
// Product component geometry at 1920×1080, no weather-transition extra line.
// Genuine pointer actions return canvas focus; do not assume title keyboard focus.
const MODE={landscape:[1717,225],portrait:[1827,225]};
const POSE={look:[1699,390],wave:[1772,390],letter:[1845,390]};
const hasScale=s=>Array.isArray(s.cameraPropScale)&&s.cameraPropScale.length===3&&s.cameraPropScale.every(Number.isFinite);

export default async function portraitProbe(play){
  const h=await createLetterHarness(play,PLAN,BINDING),photos=[];let error,originalScale;
  async function chooseOption(point,key,value){
    const before=await h.wait(cameraActive);assert.ok(!before.view.weather?.transitioning,'fixed control geometry requires the normal stable weather header');
    // Every sequence starts with the tools closed and ends closed. No relative
    // Tab continuation across screenshot canvas-witness focus changes.
    await h.click(...TITLE);await h.wait(cameraActive);await h.click(...point);
    await h.wait(s=>cameraActive(s)&&s.state.durable.photography[key]===value&&s.controller.photography.settings[key]===value);
    await h.click(...TITLE);await h.wait(cameraActive);
  }
  async function checkPortrait(pose){
    const s=await h.wait(s=>cameraActive(s)&&s.controller.photography.settings.mode==='portrait'
      &&s.controller.photography.settings.pose===pose&&s.controller.photography.candidateAvailable&&s.controller.photography.subjectVisible);
    assert.ok(s.controller.avatarVisible,'the actual portrait subject must be visible');assert.ok(hasScale(s),'native camera prop transform is required');
    assert.deepEqual(s.cameraPropScale,[0,0,0],`${pose}: the hand-held camera prop must be hidden`);return s;
  }
  try{
    assert.ok(BINDING.budgetMs<=90000,'portrait probe is bounded to ninety seconds');
    await h.step('normal-menu-camera-and-portrait-controls',async()=>{
      const walkingStart=await h.startFresh();assert.ok(hasScale(walkingStart));originalScale=[...walkingStart.cameraPropScale];assert.ok(originalScale.some(n=>n!==0));
      await h.key('KeyC');await h.wait(cameraActive);
      await chooseOption(MODE.portrait,'mode','portrait');await checkPortrait('look');
    });
    await h.step('three-real-poses-without-hand-camera',async()=>{
      for(const pose of ['look','wave','letter']){
        await chooseOption(POSE[pose],'pose',pose);const before=await checkPortrait(pose);h.record(`${pose}-actual-native-hidden-camera`,before);
        const photo=await h.photograph(`portrait-${pose}-real-photo`);assert.equal(photo.scene.mode,'portrait');assert.equal(photo.scene.pose,pose);assert.equal(photo.scene.subject.visible,true);
        await checkPortrait(pose);photos.push(photo);
      }
    });
    await h.step('restore-handheld-and-download-one-actual-portrait',async()=>{
      await chooseOption(MODE.landscape,'mode','landscape');const handheld=await h.wait(cameraActive);
      assert.deepEqual(handheld.cameraPropScale,originalScale,'handheld mode must restore the original prop transform scale');await h.shot('handheld-prop-restored');
      // Normal recent-photo detail: close, keep, ending, large, original export.
      const photo=photos.at(-1);assert.ok(!handheld.view.replies.items.some(letter=>letter.candidates.some(p=>p.id===photo.id)),'spawn portrait must open recent detail, not a reply candidate');
      await h.click(80,120);await h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused);
      await h.download('portrait-letter-original',async()=>{await h.tabs(5);await h.key('Enter');},[1920,1080],{photoId:photo.id,bytes:photo.original.bytes});
      await h.key('Escape');await h.key('Escape');await h.wait(cameraActive);
      await h.key('KeyC');const returned=await h.wait(walking);assert.deepEqual(returned.cameraPropScale,originalScale);
    });
    await h.step('ordinary-reload-preserves-three-real-portraits',async()=>{
      await h.key('Escape');await h.wait(s=>s.state.runtime.screen==='paused');await h.wait(s=>s.view?.saveStatus==='saved');
      const before=await h.shot('three-portraits-normal-save'),retained=before.state.durable.film.map(photoFacts);
      await play.reload();const menu=await h.wait(s=>s.restored&&s.state.runtime.screen==='menu');
      assert.equal(menu.state.durable.started,true);assert.equal(menu.state.durable.totalPhotos,3);assert.deepEqual(menu.state.durable.film.map(photoFacts),retained);
      await h.key('Tab');await h.key('Enter');const restored=await h.wait(walking);assert.deepEqual(restored.cameraPropScale,originalScale);
      await h.shot('three-portrait-originals-retained-after-reload');assert.equal(h.report.downloads.length,1);
    });
  }catch(e){error=e;throw e;}finally{await h.finish(error);}
}
