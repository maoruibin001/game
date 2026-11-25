import type { Vec3 } from './world-layout.ts';
import type { VoxelMesh } from './voxel-mesh.ts';

const groups = [
  { center: [141, 212, 350], cell: 17, rise: 9,
    levels: ['0001210000','0123542100','0235664320','0124544320','0012332210','0000121000'] },
  { center: [-174, 228, 606], cell: 24, rise: 9,
    levels: ['0001221000','0012442310','0124564421','1234653310','0123542100','0001120000'] },
  { center: [29, 224, 798], cell: 23, rise: 7,
    levels: ['000112000','001233110','012344321','012443210','001221100'] },
] as const;

/** Voxel columns form the visible shell. Shared interior walls never draw. */
export function appendValleyCumulus(mesh: VoxelMesh): void {
  for (const { center: [cx, cy, cz], cell, rise, levels } of groups) {
    const width = levels[0].length;
    const column = (x: number, z: number) => {
      const height = Number(levels[z]?.[x] ?? 0);
      return height ? { low: cy + (.49 - Math.min(height, 3) * .18) * rise, high: cy + height * rise } : undefined;
    };
    for (let z = 0; z < levels.length; z++) for (let x = 0; x < width; x++) {
      const own = column(x, z);
      if (!own) continue;
      const left = cx + (x - width / 2) * cell, right = left + cell;
      const front = cz + (z - levels.length / 2) * cell, back = front + cell;
      const corners = (y: number): Vec3[] => [[left,y,front], [right,y,front], [right,y,back], [left,y,back]];
      mesh.quad(corners(own.high), [0,1,0], 'cloud');
      mesh.quad(corners(own.low), [0,-1,0], 'cloud-base');
      for (const [dx, dz, ax, az, bx, bz] of [
        [-1,0,left,front,left,back], [1,0,right,front,right,back],
        [0,-1,left,front,right,front], [0,1,left,back,right,back],
      ] as const) {
        const neighbor = column(x + dx, z + dz);
        const edge = (low: number, high: number, material: string) => {
          if (low >= high) return;
          mesh.quadShaded([[ax,low,az],[bx,low,bz],[bx,high,bz],[ax,high,az]],
            [dx,0,dz], [dx * .97,.243,dz * .97], material);
        };
        edge(Math.max(neighbor?.high ?? own.low, own.low), own.high, 'cloud');
        if (neighbor) edge(own.low, Math.min(neighbor.low, own.high), 'cloud-base');
      }
    }
  }
}
