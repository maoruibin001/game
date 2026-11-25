import type { Vec3 } from './world-layout.ts';
import type { DetailBox } from './scene-details.ts';

export const AFTERNOON_STOPS = {
  pineBag: { id: 'afternoon-pine-bag', title: '松针邮袋架', position: [-9, 14.33, -215.6] as Vec3, radius: 2.45 },
  townBag: { id: 'afternoon-town-bag', title: '屋脊邮袋架', position: [-12.6, 14.58, -216] as Vec3, radius: 2.25 },
  shoes: { id: 'afternoon-shoes', title: '桥头拓印摊', position: [159.65, 24.83, 20.15] as Vec3, radius: 2.5 },
  window: { id: 'afternoon-window', title: '禅院客堂', position: [159.12, 34.58, 93.7] as Vec3, radius: 2.15 },
} as const;

export const SWALLOW_RIDGE = { position: [165.74, 31.81, 21] as Vec3, size: [1.78, .87, 0] as Vec3, right: [0, 0, 1] as Vec3 };
export const HALL_WINDOW = { position: [159.50, 36.08, 92.12] as Vec3, size: [1.48, 1.38, 0] as Vec3, right: [1, 0, 0] as Vec3 };
export const HALL_GATE_ROOF = { position: [158, 30.24, 63] as Vec3, size: [6.7, 1.25, 0] as Vec3, right: [1, 0, 0] as Vec3 };

// The top of each rendered stone is also the exact standing surface. The
// gap keeps ordinary bridge traffic clear and is low enough to walk out of.
export const BRIDGE_STONES = [
  {x:159.42,z:16.10,width:1.42,depth:1.44,top:24.78,bottom:23.95},
  {x:159.55,z:13.28,width:1.72,depth:1.94,top:25.72,bottom:23.95},
] as const;

export function bridgeStoneTop(x: number,z: number): number {
  return BRIDGE_STONES.find(s=>Math.abs(s.x-x)<=s.width/2&&Math.abs(s.z-z)<=s.depth/2)?.top ?? -Infinity;
}

export function afternoonProps(): DetailBox[] {
  const items: DetailBox[] = [];
  const add = (id: string, center: Vec3, size: Vec3, material: string, solid = false) =>
    items.push({ id: 'afternoon/' + id, center, size, material, solid });
  for (const [name, place, cloth] of [
    ['pine', AFTERNOON_STOPS.pineBag.position, 'pine'], ['town', AFTERNOON_STOPS.townBag.position, 'temple-lacquer'],
  ] as const) {
    const [x,y,z] = place;
    add(name + '/rack', [x, y+.61, z], [.97,1.22,.49], 'wood', true);
    add(name + '/bag', [x, y+1.22, z], [1.03,.87,.58], cloth);
    add(name + '/sign', [x,y+1.83,z], [1.10,.42,.16], 'cream');
    for (const front of [-1, 1]) {
      const face = z + front*.31;
      for (const [row, width] of [[0,.30],[1,.22],[2,.13]] as const)
        add(name + '/mark-' + front + '-' + row, [x, y+1.17+row*.086,face], [width,.065,.026], 'cream');
      if (name === 'pine') add(name + '/stem-' + front, [x,y+1.09,face], [.055,.14,.026], 'cream');
    }
  }
  for (const [i, stone] of BRIDGE_STONES.entries()) {
    const height=stone.top-stone.bottom;
    add('bridge-stone-'+i,[stone.x,stone.bottom+height/2,stone.z],[stone.width,height,stone.depth],'rock');
    add('bridge-stone-lichen-'+i,[stone.x+.18,stone.top-.045,stone.z+.22],[.42,.08,.36],'stone-lichen');
  }
  const [sx,sy,sz] = AFTERNOON_STOPS.shoes.position;
  add('rubbing-desk', [sx,sy+.45,sz], [1.02,.90,.76], 'wood', true);
  add('rubbing-paper', [sx,sy+.934,sz], [.68,.065,.55], 'cream');
  for (const sign of [-1,1]) {
    add('grass-shoe-'+sign, [sx+sign*.24,sy+1.005,sz+.10], [.19,.115,.32], 'paper-light');
    add('rubbing-mark-'+sign, [sx+sign*.215,sy+.972,sz-.12], [.20,.024,.036], 'temple-lacquer');
  }
  // The swallow-tail finial caps the ridge cap of the existing east house, whose native top is y=31.50.
  const [rx,ry,rz] = SWALLOW_RIDGE.position;
  add('roof-crest', [rx,ry-.22,rz], [.29,.26,1.88], 'temple-tile');
  for (const side of [-1,1]) {
    add('crest-tip-'+side,[rx,ry-.04,rz+side*.68],[.24,.29,.45],'tile-cap');
    add('crest-tip-high-'+side,[rx,ry+.15,rz+side*.90],[.20,.20,.24],'wood-light');
  }
  const [wx,wy,wz] = HALL_WINDOW.position;
  for (const side of [-1,1]) {
    add('old-window-post-'+side,[wx+side*.85,wy-.29,wz],[.20,2.22,.25],'temple-wood',true);
    add('old-window-cap-'+side,[wx+side*.89,wy+.78,wz],[.27,.18,.31],'wood-light');
  }
  add('old-window-head',[wx,wy+.76,wz],[1.96,.18,.26],'temple-wood',true);
  add('old-window-sill',[wx,wy-.76,wz],[2.00,.16,.31],'wood-light',true);
  add('old-window-lamp',[wx+.67,wy-.60,wz],[.19,.20,.19],'paper-light');
  // The gate ridge is what the window was built to frame, but the hall's own lower
  // roof hides its native top from the sill: a stacked crest rises above that roof
  // edge so the pale line and raised ends read as the ridge itself.
  const [gx,gy,gz] = HALL_GATE_ROOF.position;
  const span = HALL_GATE_ROOF.size[0];
  add('gate-ridge-base',[gx,gy+.78,gz],[span+.3,.38,.56],'tile-cap');
  add('gate-ridge-crest',[gx,gy+1.22,gz],[span+.4,.50,.60],'cream');
  add('gate-ridge-band',[gx,gy+1.52,gz],[span+.2,.10,.48],'tile-cap');
  for (const side of [-1,1]) add('gate-ridge-end-'+side,[gx+side*(span/2+.22),gy+1.55,gz],[.50,.90,.62],'tile-cap');
  return items;
}
