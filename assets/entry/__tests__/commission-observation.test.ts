import { describe, expect, it } from 'vitest';
import type { CameraPose, Vec3 } from '../../controller/types.ts';
import { commissionSite, commissionSiteIds, commissionTimeAllows, type CommissionSiteId } from '../../journey/commission-sites.ts';
import { observeCommissionSites } from '../commission-observation.ts';
import { traceSegment } from '../../shanye-world/world-layout.ts';

// Walk-height camera poses sampled on the authored ground and checked against
// the real scene's blocker proxies. These fixtures do not stand in for player photos.
const compositions = {
  'old-post': [[[-3, 15.7, -230.7], [0, -0.048331, -0.998831], 1.047198], [[-0.22836, 15.7, -230.85195], [-0.892585, -0.024153, -0.450231], 1.047198]],
  'post-porch': [[[2, 15.7, -214], [-0.289577, 0.066344, -0.954853], 1.047198], [[2, 15.7, -212.7], [-0.269991, 0.061562, -0.960893], 1.047198]],
  'forest-clearing': [[[-170, 39.7, -35], [-0.655413, 0.200265, -0.728236], 1.047198], [[-169.08076, 39.7, -34.08076], [-0.664149, 0.173414, -0.727209], 1.047198]],
  'forest-windmill': [[[-170, 39.7, -49.5], [-0.275414, 0.223346, 0.935021], 1.047198], [[-169.08076, 39.7, -48.58076], [-0.352896, 0.233052, 0.906174], 1.047198]],
  'old-town': [[[155, 25.7, -19], [0, 0.054306, 0.998524], 1.047198], [[155.91924, 25.7, -18.08076], [-0.033258, 0.056079, 0.997872], 1.047198]],
  'town-arch': [[[155, 25.7, -3], [-0.00179, 0.187476, 0.982268], 0.8], [[155.91924, 25.7, -2.08076], [-0.042761, 0.19255, 0.980355], 0.8]],
  'ridge-station': [[[0, 98.12, 235], [0.987954, -0.047926, -0.147142], 1.047198], [[0, 98.12, 236.3], [0.966857, -0.046903, -0.250972], 1.047198]],
  'ridge-arrow': [[[64, 85.7, 204], [0.653633, -0.145141, -0.742764], 1.047198], [[64, 85.90018, 205.3], [0.565986, -0.151429, -0.810389], 1.047198]],
  'ridge-mail-road': [[[64, 85.7, 204], [-0.851508, 0.079313, -0.518309], 1.047198], [[64, 85.90018, 205.3], [-0.835423, 0.072221, -0.544841], 1.047198]],
  'courtyard-bell': [[[155.4, 25.7, 38], [0.421169, 0.126782, 0.898077], 1.047198], [[156.31924, 26.2, 38.91924], [0.389957, 0.099945, 0.915393], 1.047198]],
  'monastery': [[[158, 35.975, 93.25], [0.797475, 0.055823, -0.600764], 1.047198], [[158.49749, 36.205, 94.45104], [0.394603, -0.049202, -0.917533], 1.047198]],
  'flower-market': [[[145.79896, 25.67419, -16.99749], [-0.946731, 0.035837, -0.320026], 1.047198], [[144.87868, 25.68928, -18.62132], [-0.977729, 0.03888, -0.206237], 1.047198]],
  'night-torch-foot': [[[160.6, 25.2, 61.9], [0, -0.371391, -0.928477], 1.047198], [[161.9, 25.2, 60.6], [-0.928477, -0.371391, 0], 1.047198]],
  'night-torch-upper': [[[160.96924, 35.285, 91.81924], [-0.564641, -0.601964, -0.564641], 1.047198], [[160.54749, 34.365, 89.69896], [-0.382276, -0.046105, 0.922897], 1.047198]],
  'pine-firework': [[[160.2, 30.685, 79.45], [-0.543263, 0.041926, -0.838515], 1.047198], [[160.69749, 30.685, 80.65104], [-0.522942, 0.036419, -0.85159], 1.047198]],
  'field-firework': [[[133.5, 23.7, -43.5], [0.973336, 0.029074, 0.227533], 1.047198], [[134.41924, 23.7, -42.58076], [0.991109, 0.033618, 0.128736], 1.047198]],
  'sixth-room': [[[180.17, 26.54, 24.64], [-0.705289, 0.212553, -0.676305], 1.047198], [[181.47, 26.54, 24.64], [-0.882948, 0.14076, -0.447872], 1.047198]],
} as const satisfies Record<CommissionSiteId, readonly (readonly [Vec3, Vec3, number])[]>;
const cameraFor = ([position, forward, verticalFovRadians]: readonly [Vec3, Vec3, number]): CameraPose =>
  ({position, forward, verticalFovRadians, up:[0,1,0], aspect:16/9});

describe('scenic commissions use what is in the recorded frame', () => {
  it.each(commissionSiteIds)('%s accepts two views and rejects a reverse view or a blocked subject', id => {
    const minute = commissionSite(id).window === 'night' ? 1170 : 800;
    const [first, second] = compositions[id].map(cameraFor);
    expect(first!.position).not.toEqual(second!.position);
    for (const camera of [first!, second!]) {
      expect(observeCommissionSites(camera,[id],minute,id).matched).toEqual([id]);
    }
    const opposite: CameraPose = {...first!,forward:first!.forward.map(x=>-x) as unknown as Vec3};
    expect(observeCommissionSites(opposite,[id],minute,id)).toMatchObject({matched:[],hint:{ready:false,text:expect.stringContaining('画框')}});
    const wall = (from: Vec3) => ({hit:true, distance:0, fraction:0, point:from, obstacle:'test-wall'});
    expect(observeCommissionSites(first!,[id],minute,id,undefined,wall)).toMatchObject({matched:[],hint:{ready:false,text:expect.stringContaining('被挡住')}});
  });

  it('rejects a missing second subject with feedback about that subject', () => {
    const id = 'forest-windmill';
    const camera = cameraFor(compositions[id][0]);
    const blockMill = (from: Vec3,to: Vec3,clearance?: number) =>
      Math.abs(to[2] - commissionSite(id).subjects[1]!.shape.position[2]) < 1 ? {hit:true,distance:0,fraction:0,point:from,obstacle:'test-wall'} : traceSegment(from,to,clearance);
    expect(observeCommissionSites(camera,[id],800,id,undefined,blockMill)).toMatchObject(
      {matched:[],hint:{ready:false,text:expect.stringContaining('风车叶片')}});
  });

  it('uses the shutter time including the night-market and day-hall boundary', () => {
    const market = cameraFor(compositions['flower-market'][0]);
    expect(observeCommissionSites(market,['flower-market'],1119,'flower-market').hint?.text).toContain('开市');
    expect(observeCommissionSites(market,['flower-market'],1120).matched).toEqual(['flower-market']);
    expect(commissionTimeAllows('monastery',379)).toBe(false);
    expect(commissionTimeAllows('monastery',380)).toBe(true);
    expect(commissionTimeAllows('monastery',1120)).toBe(false);
  });
});
