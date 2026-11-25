/** Small source-authored letter states on the existing sunset bench; no new model assets. */
import { VoxelMesh } from './voxel-mesh.ts';

export const VALLEY_LETTER_ORIGIN = [67.6,84,206.4] as const;
export function valleyLetterMeshes():{folded:VoxelMesh;opened:VoxelMesh}{
 const folded=new VoxelMesh();
 folded.box([0,.013,0],[.55,.026,.35],'cream');
 folded.quad([[-.26,.028,-.16],[.26,.028,-.16],[.035,.042,.04],[-.035,.042,.04]],[0,1,0],'flower');
 folded.box([0,.049,.035],[.065,.018,.065],'red');
 const opened=new VoxelMesh();
 opened.box([0,.013,0],[.9,.026,.5],'cream');
 opened.box([0,.027,0],[.009,.002,.45],'wood-light');
 for(const[z,width]of [[-.12,.48],[-.04,.54],[.04,.39],[.12,.45]]as const)opened.box([-.05,.029,z],[width,.004,.012],'wood-light');
 opened.box([.32,.029,-.16],[.12,.004,.09],'red');
 return{folded,opened};
}
