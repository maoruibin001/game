// Same official owner, normal fresh profile, --headless false.
// This extends the passed primary route for newly authored SFX/bench and scenic
// evidence. It does not replace full-02 or establish 15 minutes of player content.
import { fileURLToPath } from 'node:url';
import { FULL_ROUTE_PLAN, runFullJourney } from './journey-full-playthrough.mjs';
import { runRecordedJourney } from './journey-recorded-playthrough.mjs';

export const SCENIC_ROUTE_PLAN = {
  ...FULL_ROUTE_PLAN,
  revision: 'scenic-route-2026-11-16-visible-alley-valley-letter',
  forest: [[0, -220], [-35, -192], [-65, -154], [-102, -120],
    [-125, -156], [-176, -153], [-202, -112], [-204, 6], [-170, -35], [-170, -49.5]],
  forestToZipline: [[-170, -35], [-182, -27], [-170, -35], [-204, 6], [-229, 61],
    [-204, 6], [-170, -35], [-185, -17]],
  // Follow the authored, visible side alley from the main slope. Independent
  // controller/mesh checks cover both directions and the normal 1.1m stop disk.
  // Never reuse scenic-01's blocked off-road crossing at z=32.
  courtyardReturn: [[158.5, 32], [155, 23], [155, 20], [166, 31], [168, 29], [172, 27], [176, 26],
    [172, 27], [168, 29], [166, 31], [155, 20]],
  // Inherit the corrected normal ridge route: enter and leave the pavilion at
  // its visible eastern opening before taking the southern valley photograph.
  scenic: {
    expectedDiscoveries: ['hidden-trail', 'old-stamp', 'wind-song', 'last-letter', 'lost-postcard', 'sunset-seat'],
    // Authored ordinary waypoints, never written into the game. route() only
    // presses E after the readonly nearby identity agrees at the actual position.
    sites: [
      { id: 'hidden-trail', point: [-176, -153] },
      { id: 'old-stamp', point: [-182, -27] },
      { id: 'wind-song', point: [-229, 61], view: [-170, 46.5, -25], keepPhoto: true, replay: true },
      { id: 'lost-postcard', point: [176, 26] },
      // Actual new scene-bundle bench centre; its original discovery stays [64,204].
      { id: 'sunset-seat', point: [64, 204], view: [61.75, 84.8, 201.5] },
    ],
    memory: {
      id: 'valley-letter', clueSite: 'lost-postcard', completionSite: 'sunset-seat',
      // Authored world-space look target independently checked against the real
      // windmill and town-house mesh. cameraAt derives RMB input from actual eye.
      photo: { feet: [64, 204], target: [48.56960738676625, 61.789655755902594, 108.13946793304109] },
    },
    postgameReturn: [[0, 200]],
  },
};

const OUTPUT = fileURLToPath(new URL('../artifacts/video/scenic-headed-02/', import.meta.url));

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function scenicRecordedJourney(play) {
  return runRecordedJourney(play, {
    runJourney: (owner) => runFullJourney(owner, SCENIC_ROUTE_PLAN),
    outputDir: OUTPUT,
  });
}
