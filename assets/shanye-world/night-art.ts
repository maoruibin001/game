import { LAUNCH_SITES, MARKET_GATE, NIGHT_MARKET, NIGHT_STOPS, WILLOW_PROMISE_WINDOW, WILLOW_LAMP_MAST } from './night-layout.ts';
import { VoxelMesh } from './voxel-mesh.ts';
import type { AABB, Vec3 } from './world-layout.ts';

type Ground = (x:number,z:number)=>number;
export const NIGHT_SPARK_COLORS=['gold','pearl','coral','amber','indigo','mist','leaf','willow-ivory','willow-honey','willow-copper'] as const;
export const NIGHT_GLOW_PALETTE = {
  'night-spark-gold': {color:[1,.56,.15], intensity:2.85},
  'night-spark-amber': {color:[1,.28,.063], intensity:1.8},
  'night-spark-pearl': {color:[.53,.75,1], intensity:1.65},
  'night-spark-coral': {color:[1,.047,.038], intensity:1.62},
  'night-spark-indigo': {color:[.23,.32,1], intensity:2.15},
  'night-spark-mist': {color:[.21,.93,1], intensity:1.75},
  'night-spark-willow-ivory': {color:[1,.68,.23], intensity:1.42},
  'night-spark-willow-honey': {color:[1,.39,.022], intensity:1.02},
  'night-spark-willow-copper': {color:[.80,.28,.016], intensity:.70},
  'night-spark-leaf': {color:[.39,.91,.24], intensity:1.86},
  'night-willow-paper': {color:[1,.51,.19], intensity:1.22},
  'night-paper': {color:[1,.56,.23], intensity:1.55},
  'night-fish-paper': {color:[1,.34,.12], intensity:1.8},
  'night-flame': {color:[1,.38,.074], intensity:1.85},
} as const;

export function nightMarketObstacles(ground:Ground): AABB[] {
  const [west,east,south,north]=NIGHT_MARKET;
  const base=ground(138,-16.5);
  return [
    {id:'night-market-west',min:[west-.28,base-.3,south],max:[west+.28,base+1.75,north]},
    {id:'night-market-south',min:[west,base-.3,south-.28],max:[east,base+1.75,south+.28]},
    {id:'night-market-north',min:[west,base-.3,north-.28],max:[east,base+1.75,north+.28]},
    {id:'night-market-entry-south',min:[east-.28,base-.3,south],max:[east+.28,base+1.75,MARKET_GATE[2]-2.05]},
    {id:'night-market-entry-north',min:[east-.28,base-.3,MARKET_GATE[2]+2.05],max:[east+.28,base+1.75,north]},
  ];
}

export function nightMeshes(ground:Ground) {
  const base=ground(138,-16.5);
  const fences=new VoxelMesh(), gate=new VoxelMesh(), stalls=new VoxelMesh(), fish=new VoxelMesh();
  const lantern=(x:number,y:number,z:number,mesh=stalls)=>{
    mesh.box([x,y,z],[.43,.64,.43],'night-paper');
    for(const dy of [-.34,.34])mesh.box([x,y+dy,z],[.50,.07,.50],'temple-lacquer');
    mesh.box([x,y+.48,z],[.035,.26,.035],'wood-light');
  };
  for(const {min,max} of nightMarketObstacles(ground)){
    const center=min.map((v,i)=>(v+max[i]!)*.5) as unknown as Vec3;
    fences.box(center,max.map((v,i)=>v-min[i]!) as unknown as Vec3,'stone-pale');
    fences.box([center[0],max[1]+.08,center[2]],[max[0]-min[0]+.09,.17,max[2]-min[2]+.09],'tile-edge');
  }
  const [x,,z]=MARKET_GATE;
  for(const d of [-2.17,2.17])fences.box([x,base+1.79,z+d],[.43,3.64,.39],'temple-lacquer');
  fences.box([x,base+3.48,z],[.71,.39,4.98],'temple-lacquer');
  for(let i=0;i<5;i++)fences.box([x,base+3.75+i*.09,z],[1.6-i*.26,.17,5.4-i*.11],'temple-tile');
  for(const d of [-1.56,1.56])lantern(x+.15,base+2.60,z+d,stalls);
  for(let i=0;i<12;i++)gate.box([x,base+1.20,z-1.87+i*.34],[.18,2.4,.27],'temple-wood');
  for(const dy of [.48,1.55])gate.box([x+.07,base+dy,z],[.25,.18,3.95],'temple-lacquer');

  for(const [cx,cz,color] of [[140.8,-22.2,'temple-lacquer'],[135,-22.0,'temple-tile'],[129.5,-22.1,'temple-lacquer'],[140.2,-11.8,'temple-tile']] as const){
    const y=ground(cx,cz);
    for(const dx of [-1.55,1.55])for(const dz of [-.65,.65])stalls.box([cx+dx,y+1.19,cz+dz],[.13,2.4,.13],'temple-wood');
    stalls.box([cx,y+1.00,cz],[3.35,.17,1.40],'temple-wood');
    for(let i=0;i<6;i++)stalls.box([cx-1.42+i*.56,y+2.45,cz],[.57,.11,1.75],i%2?color:'cream');
    lantern(cx+1.22,y+1.93,cz+.67);lantern(cx-1.22,y+1.93,cz+.67);
    for(let j=0;j<3;j++)stalls.box([cx+(j-1)*.70,y+1.17,cz+.12],[.37,.23,.33],j===1?'dye-blue':'basket');
  }
  for(const [cx,cz] of [[132.9,-15.1],[138.8,-16.3],[144,-16.3]])lantern(cx!,base+2.7,cz!);
  const {x:repairX,z:repairZ}=NIGHT_STOPS.repair;
  const repairY=ground(repairX,repairZ);
  stalls.box([repairX,repairY+1.15,repairZ+.92],[.14,2.30,.15],'temple-wood');
  stalls.box([repairX,repairY+2.27,repairZ+.57],[.22,.12,.78],'temple-wood');
  stalls.box([repairX,repairY+1.91,repairZ+.26],[.13,.62,.62],'tile-edge');
  const crescent=['0110','1100','1100','0111'];
  for (let row=0;row<crescent.length;row++) {
    for (let col=0;col<crescent[row]!.length;col++) {
      if(crescent[row]![col]==='1')
        stalls.box([repairX+.08,repairY+2.106-row*.125,repairZ+.08+col*.124],[.035,.127,.126],'night-paper');
    }
  }
  const {x:letterX,z:letterZ}=NIGHT_STOPS.letter;
  const letterY=ground(letterX,letterZ);
  stalls.box([letterX,letterY+.77,letterZ-.3],[.13,1.55,.15],'temple-wood');
  stalls.box([letterX,letterY+1.39,letterZ-.3],[.62,.42,.13],'cream');
  stalls.box([letterX,letterY+1.39,letterZ-.22],[.115,.105,.032],'red');
  const yy=ground(NIGHT_STOPS.fish.x,NIGHT_STOPS.fish.z)+1.8;
  stalls.box([129.05,yy-.68,-17.4],[.22,2.48,5.1],'cream');
  for(const f of [{ mesh:fish, color:'night-fish-paper' }]){
    f.mesh.box([0,0,0],[1.16,.58,.28],f.color);
    f.mesh.box([.29,.04,0],[.72,.76,.24],f.color);
    f.mesh.box([-.68,.24,0],[.47,.20,.17],f.color,.2);
    f.mesh.box([-.68,-.24,0],[.47,.20,.17],f.color,-.2);
    f.mesh.box([.47,.12,.16],[.09,.09,.035],'iron');
    f.mesh.box([.47,.12,-.16],[.09,.09,.035],'iron');
    for(const dx of [-.24,.04,.26])f.mesh.box([dx,0,0],[.042,.54,.31],'red');
  }
  const racks = new VoxelMesh(), markers = new VoxelMesh();
  for(const {x,z} of [NIGHT_STOPS.footTorch,NIGHT_STOPS.upperTorch]){
    const y=ground(x,z);
    racks.box([x+.58,y+.12,z],[.83,.24,.72],'stone-blue');
    racks.box([x+.58,y+.68,z],[.13,1.38,.13],'temple-wood');
    racks.box([x+.58,y+1.35,z],[.58,.12,.47],'temple-wood');
    racks.box([x+.36,y+1.58,z],[.09,.55,.09],'wood-light');
    racks.box([x+.36,y+1.83,z],[.14,.15,.14],'bell-bronze');
  }
  for(const {bounds:[w,e,s,n]} of LAUNCH_SITES){
    for(const xx of [w,e])for(const zz of [s,n])markers.box([xx,ground(xx,zz)+.14,zz],[.34,.28,.34],'stone-pale');
    const cx=(w+e)/2,cz=(s+n)/2;
    markers.box([cx,ground(cx,cz)+.036,cz],[.83,.045,.83],'stone-lichen');
  }
  const bundle = new VoxelMesh(), scarlet = new VoxelMesh(), ghost = new VoxelMesh(), torch = new VoxelMesh();
  for (const [box,primary,secondary,band] of [
    [bundle,'bell-bronze','gold','bell-gold'], [scarlet,'red','temple-lacquer','night-spark-coral'],
  ] as const) {
    box.box([0,.09,0],[.87,.18,.73],'temple-wood');
    for(let i=0;i<3;i++)for(let j=0;j<2;j++){
      const cx=(i-1)*.25,cz=(j-.5)*.27;
      box.box([cx,.37,cz],[.18,.45,.18],(i+j)%2?primary:secondary);
      box.box([cx,.62,cz],[.20,.07,.20],band);
    }
    box.box([0,.34,0],[.78,.09,.63],band);
  }
  ghost.box([0,.043,0],[1.02,.043,1.02],'night-paper');
  torch.box([0,-.19,0],[.081,.61,.088],'temple-wood');
  torch.box([0,.05,0],[.13,.13,.13],'bell-bronze');
  torch.box([0,.17,0],[.16,.19,.16],'night-flame');
  torch.box([.023,.30,-.007],[.082,.14,.089],'night-paper');
  const promise=new VoxelMesh();
  const [windowX,windowY,windowZ]=WILLOW_PROMISE_WINDOW;
  fences.box([windowX,windowY,windowZ],[.15,.85,1.54],'temple-wood');
  for(const yd of [-.174,.174]) for(const zd of [-.328,.328]){
    fences.box([windowX-.084,windowY+yd,windowZ+zd],[.018,.275,.58],'window-shadow');
  }
  const {x:mastX,z:mastZ,foot,drop}=WILLOW_LAMP_MAST;
  const pole=new VoxelMesh();
  // Brackets carry the base into the original gable's timber.
  for (const y of [27.86,28.88]) {
    fences.beam([mastX,y,17.79],[mastX,y,mastZ],.15,.16,'temple-wood');
    fences.box([mastX,y,mastZ],[.27,.18,.27],'iron');
  }
  fences.beam([mastX,27.92,17.79],[mastX,28.88,mastZ],.13,.13,'temple-wood');
  fences.box([mastX,foot+.80,mastZ],[.22,1.61,.22],'temple-wood');
  // Three nested bamboo sections, with a return at the tip for the hook.
  pole.box([0,.19,0],[.18,.38,.18],'wood-light');
  pole.box([0,.54,0],[.137,.36,.137],'wood-light');
  pole.box([0,.83,0],[.105,.34,.105],'wood-light');
  pole.box([0,1,-.18],[.12,.022,.40],'temple-wood');

  // This is a single paper lantern with a cap, a foot and visible suspension.
  // Local origin at the suspension lets it hang and swing around that point.
  promise.box([0,-drop,0],[.67,.72,.67],'night-willow-paper');
  for(const y of [-.94,-.18])promise.box([0,y,0],[.76,.085,.76],'temple-lacquer');
  for(const x of [-.335,.335])for(const z of [-.335,.335])
    promise.box([x,-drop,z],[.030,.72,.030],'wood-light');
  promise.box([0,-.095,0],[.052,.17,.052],'iron');
  return { fences,gate,stalls,fish,racks,markers,bundle,scarlet,ghost,torch,promise,pole };
}
