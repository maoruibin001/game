// New raw recording from the final art candidate, using the same official owner.
// Three-discovery visual recheck only; scenic-02 remains the full-six proof.
// Bound to the final world-source station receipt; root owns candidate/runtime gates.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { FULL_ROUTE_PLAN, runFullJourney, validateFullRoute } from './journey-full-playthrough.mjs';
import { runRecordedJourney } from './journey-recorded-playthrough.mjs';

// World author froze these public positions in CANDIDATE-VISUAL-READABILITY.
// Y is intentionally not supplied to movement: actual ground determines feet Y.
export const VISUAL_STATIONS = {
  frozen: true,
  evidence: 'production/staging/world/CANDIDATE-VISUAL-READABILITY-20261116.json#qa',
  worldDigest: 'a09c5f91fdfa51ea52367939b82931b3de2e25327fe02aac985cc304892a0b74',
  forestPhoto: { feet: [-170, -49.5], target: [-170, 46.5, -25] },
  townPhoto: { feet: [155, -6], target: [155, 29, 10] },
  paper: { feet: [67.25, 204.5], target: [67.6, 84.03, 206.4] },
  memoryPhoto: { feet: [64, 204], target: [48.568, 61.842, 108.132] },
  ridgePhoto: { feet: [0, 200], target: [3.5324, 68.1906, 104.3585] },
  paperApproachFromTrail: [[67.25, 204.5]],
  memoryApproach: [[64, 204]],
  paperReturn: [[67.25, 204.5]],
  returnToTrail: [[64, 204]],
};

export function createVisualRoute(stations = VISUAL_STATIONS) {
  assert.ok(stations?.frozen === true && typeof stations.evidence === 'string' && stations.evidence.length > 0,
    'visual-route-not-frozen: waiting for final world geometry, safe ordinary connections and viewing evidence');
  for (const key of ['forestPhoto', 'townPhoto', 'paper', 'memoryPhoto', 'ridgePhoto']) {
    const view = stations[key];
    assert.ok(view?.feet?.length === 2 && view.feet.every(Number.isFinite), `missing final feet: ${key}`);
    assert.ok(view?.target?.length === 3 && view.target.every(Number.isFinite), `missing final target: ${key}`);
  }
  const plan = {
    ...FULL_ROUTE_PLAN,
    revision: 'visual-route-2026-11-16-final-art-three-discoveries',
    budgetMs: 10 * 60 * 1000,
    forestPhoto: stations.forestPhoto,
    townPhoto: stations.townPhoto,
    ridgePhoto: stations.ridgePhoto,
    // The ordinary primary forest/zipline route is inherited unchanged: no hidden
    // trail detour, old-stamp pickup, wind-song detour, extra free photo or reread.
    courtyardReturn: [[158.5, 32], [155, 23], [155, 20], [166, 31], [168, 29], [172, 27], [176, 26],
      [172, 27], [168, 29], [166, 31], [155, 20]],
    scenic: {
      coverage: 'visual-three',
      expectedDiscoveries: ['last-letter', 'lost-postcard', 'sunset-seat'],
      sites: [
        { id: 'lost-postcard', point: [176, 26] },
        { id: 'sunset-seat', point: [64, 204], viewPoint: stations.paper,
          viewApproach: stations.paperApproachFromTrail, returnPath: stations.returnToTrail },
      ],
      memory: {
        id: 'valley-letter', clueSite: 'lost-postcard', completionSite: 'sunset-seat',
        photo: stations.memoryPhoto, photoApproach: stations.memoryApproach,
        paperApproach: stations.paperReturn,
      },
      postgameReturn: [stations.ridgePhoto.feet],
    },
    visualEvidence: stations.evidence,
  };
  return validateFullRoute(plan);
}

const OUTPUT = fileURLToPath(new URL('../artifacts/video/visual-headed-01/', import.meta.url));

/** @param {import('@forgeax/engine/devkit').PlayContext} play */
export default async function visualRecordedJourney(play) {
  const plan = createVisualRoute(); // Validate before any owner input/recording.
  return runRecordedJourney(play, {
    runJourney: (owner) => runFullJourney(owner, plan),
    outputDir: OUTPUT,
  });
}
