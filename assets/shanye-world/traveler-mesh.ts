import {COURIER_PALETTE,courierBody,courierHat,courierLimbs} from './courier-costume.ts';
import { VoxelMesh } from './voxel-mesh.ts';

export const TRAVELER_PALETTE:Record<string,string>={
 ...COURIER_PALETTE,
 'traveler-coat':'#c89649','traveler-coat-light':'#e1b766','traveler-coat-shade':'#a4763c',
 'traveler-scarf':'#b74c41','traveler-scarf-light':'#da7960','traveler-skin':'#e8bb92','traveler-blush':'#ce9275',
 'traveler-hair':'#49382d','traveler-ink':'#353b38','traveler-hat':'#c9ae7b','traveler-hat-light':'#e4cd99',
 'traveler-pack':'#4e706b','traveler-pack-light':'#6d8b7a','traveler-leather':'#684e3d','traveler-trousers':'#455d63',
};
/** Feet remain at zero; existing shoulder/head/hip pivots are unchanged. Face points toward local -Z. */
export function travelerMeshes(postmaster=false,articulated=false):Record<string,VoxelMesh>{
 const body=new VoxelMesh();
 body.box([0,1.055,0],[.48,.55,.32],'traveler-coat');body.box([0,.80,0],[.5,.10,.34],'traveler-coat-shade');
 body.box([0,1.31,0],[.42,.09,.31],'traveler-coat-light');body.box([0,1.35,-.01],[.19,.12,.20],'traveler-skin');
 body.box([0,.74,0],[.43,.15,.30],'traveler-trousers');
 // Seams, deep pockets and a small postal pin read in the portrait without covering the coat in noise.
 body.box([0,1.04,-.165],[.018,.46,.012],'traveler-coat-shade');
 for(const x of[-.15,.15]){body.box([x,.91,-.183],[.13,.12,.035],'traveler-coat-light');body.box([x,.976,-.197],[.14,.024,.025],'traveler-leather');}
 for(const y of[1.19,1.08,.97])body.box([.027,y,-.177],[.021,.021,.012],'traveler-leather');
 body.box([-.15,1.19,-.181],[.065,.052,.018],'cream');body.box([-.15,1.19,-.193],[.033,.016,.008],'traveler-scarf');
 // Canvas backpack has a rolled blanket, separate flap, leather straps and side pockets.
 body.box([0,1.045,.278],[.38,.43,.24],'traveler-pack');body.box([0,1.25,.28],[.42,.10,.26],'traveler-pack-light');
 body.box([0,.94,.407],[.25,.18,.034],'traveler-pack-light');
 body.box([0,1.34,.27],[.43,.10,.17],'cream');
 for(const x of[-.115,.115]){body.box([x,1.345,.27],[.032,.115,.19],'traveler-leather');body.box([x,1.12,.408],[.037,.25,.026],'traveler-leather');body.box([x,1.035,.426],[.055,.04,.012],'traveler-hat');body.box([x,1.105,-.18],[.044,.36,.026],'traveler-pack');}
 body.box([-.235,1.02,.25],[.085,.23,.17],'traveler-pack-light');body.box([.235,1.03,.25],[.085,.20,.17],'traveler-leather');
 // A red neckerchief provides the clear human accent against the green valley.
 body.box([0,1.315,-.025],[.43,.10,.36],'traveler-scarf');body.box([.085,1.27,-.219],[.115,.11,.075],'traveler-scarf-light');
 body.box([.09,1.145,-.216],[.105,.23,.04],'traveler-scarf');body.box([.09,1.027,-.218],[.11,.025,.045],'traveler-scarf-light');
 const head=new VoxelMesh();
 head.box([0,.025,0],[.34,.31,.32],'traveler-skin');head.box([0,-.135,-.01],[.27,.055,.27],'traveler-skin');
 for(const x of[-.18,.18])head.box([x,-.005,0],[.05,.09,.07],'traveler-skin');
 head.box([0,.155,.025],[.36,.095,.33],'traveler-hair');head.box([0,.02,.145],[.36,.23,.05],'traveler-hair');
 for(const x of[-.16,.16])head.box([x,.07,-.02],[.045,.17,.28],'traveler-hair');
 head.box([-.09,.125,-.167],[.12,.045,.025],'traveler-hair');
 for(const x of[-.078,.078]){head.box([x,.035,-.166],[.029,.034,.015],'traveler-ink');head.box([x-.006,.044,-.176],[.009,.009,.004],'cream');head.box([x,.077,-.168],[.047,.014,.012],'traveler-hair');head.box([x*1.3,-.025,-.165],[.045,.024,.009],'traveler-blush');}
 head.box([0,-.008,-.184],[.045,.052,.054],'traveler-skin');head.box([0,-.072,-.164],[.062,.014,.011],'traveler-blush');
 // Stepped brim and crown stay within 1.86m at the unchanged head pivot.
 if(postmaster){
 head.box([0,.215,-.01],[.58,.045,.45],'traveler-hat');head.box([0,.235,-.01],[.50,.025,.47],'traveler-hat-light');
 head.box([0,.285,.01],[.36,.09,.31],'traveler-hat');head.box([0,.345,.015],[.30,.04,.27],'traveler-hat-light');
 head.box([0,.267,-.149],[.36,.045,.018],'traveler-pack');head.box([-.189,.285,-.04],[.025,.07,.085],'traveler-leather');
 }else{courierHat(head);}
 const arm=new VoxelMesh();
 arm.box([0,-.16,0],[.19,.32,.22],'traveler-coat');arm.box([0,-.337,-.006],[.17,.055,.21],'traveler-coat-light');
 arm.box([0,-.435,-.015],[.145,.145,.17],'traveler-skin');arm.box([.078,-.425,-.026],[.035,.07,.09],'traveler-skin');
 const leg=new VoxelMesh();
 leg.box([0,.055,0],[.19,.13,.23],'traveler-trousers');
 leg.box([0,-.195,0],[.19,.39,.23],'traveler-trousers');leg.box([0,-.39,0],[.20,.05,.25],'traveler-leather');
 leg.box([0,-.465,-.045],[.22,.13,.34],'traveler-leather');leg.box([0,-.55,-.045],[.23,.04,.35],'traveler-ink');
 leg.box([0,-.43,-.145],[.14,.04,.09],'traveler-hat');
 const camera=new VoxelMesh();camera.box([0,0,0],[.24,.16,.14],'camera');camera.box([0,0,-.10],[.11,.11,.08],'traveler-leather');camera.box([0,0,-.148],[.075,.075,.018],'glass');camera.box([.07,.10,0],[.07,.04,.05],'red');camera.box([-.075,.035,-.075],[.035,.035,.012],'cream');
 const letter=new VoxelMesh();letter.box([0,0,0],[.42,.012,.28],'cream');
 for(let i=0;i<3;i++)letter.box([-.035,.008,-.06+i*.05],[.22-i*.025,.003,.009],'wood-light');letter.box([.14,.008,-.08],[.055,.003,.05],'red');
 if(postmaster)return{body,head,arm,leg,camera,letter};
 const sleeve=new VoxelMesh(),shin=new VoxelMesh(),shoe=articulated?new VoxelMesh():undefined;
 courierLimbs(sleeve,shin,shoe);
 return{body:courierBody(),head,arm:sleeve,leg:shin,camera,letter,...(shoe?{shoe}:{})};
}
