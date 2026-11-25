/** Real roadside chime and ordinary walking/photo stations. No scoring-only frame. */
type ForestVec3 = readonly [number, number, number];
export const FOREST_TIMBER = Object.freeze({
  x:-177.4,z:-41,base:38.08,height:3.72,postWidth:.22,
  armStart:[-177.4,41.78,-41] as ForestVec3,
  armEnd:[-175.1,42.02,-41] as ForestVec3,
});
export const FOREST_CHIME=Object.freeze({position:[-175.4,41.35,-41] as ForestVec3,size:[.6,.52,.6] as ForestVec3});
/** Only the actual bronze shell is a photographic subject; no empty opening or invisible backdrop. */
export const FOREST_CHIME_PROXY_IDS=new Set(['forest-chime-top','forest-chime-shoulder','forest-chime-body','forest-chime-lip']);
export const FOREST_PHOTO = Object.freeze({
  // A short step off the existing path shows the chime beside, rather than on, the sails.
  view: [-171, 39.72, -52] as ForestVec3,
  target: [-175.5, 45, -25] as ForestVec3,
  zone: [-170, 38, -63] as ForestVec3,
  zoneRadius: 22,
  anchors: {
    chime: {...FOREST_CHIME,radius:.4},
    // Unchanged real sail sweep, shared with the existing moving windmill entity.
    windmill: { position: [-170, 46.5, -25] as ForestVec3, radius: 6.75, size: [13.5, 13.5, 1.25] as ForestVec3 },
  },
});

/** QA uses this same station; movement still walks there and reads actual ground Y. */
export const FOREST_PHOTO_STATION = Object.freeze({
  feet: [FOREST_PHOTO.view[0], FOREST_PHOTO.view[2]] as readonly [number, number],
  target: FOREST_PHOTO.target,
});

// Top of the dressed stone beside the sign, shared by the receiver's tin and its E prompt.
export const LUNCH_STONE: ForestVec3 = [-174.85, 38.70, -41.50];
export const POSTAL_ARROW = {position: [-177.16,40.33,-41] as ForestVec3, size: [1.63,.44,.292] as ForestVec3};
export const POSTAL_ARROW_PROXIES = new Set(['postal-sign-enamel','postal-sign-board']);
