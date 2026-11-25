import { describe,expect,it } from 'vitest';
import { articulateCourierShoe } from '../courier-ankle.ts';

describe('shoe articulation',()=>{
  it('aligns both independent shoe axes with a continuous diagonal grade',()=>{
    const surface=(x:number,z:number)=>8+.16*x+.34*z;
    for(const side of [-1,1] as const) {
      const shoe=articulateCourierShoe([0,8,0],0,side,0,0,surface);
      expect(Math.tan(shoe.pitch)).toBeCloseTo(-.34,6);
      expect(Math.tan(shoe.roll)*Math.hypot(1,.34)).toBeCloseTo(.16,6);
      expect(shoe.clearance).toBeCloseTo(.005,8);
      expect(shoe.center[1]-surface(shoe.center[0],shoe.center[2])).toBeCloseTo(.005,8);
    }
  });
  it('rejects a discontinuous step instead of angling the sole through its riser',()=>{
    const shoe=articulateCourierShoe([0,8,0],0,1,0,0,(_x,z)=>z>.01?8:7.77);
    expect(shoe.pitch).toBe(0);
    expect(shoe.roll).toBe(0);
    expect(shoe.contact[1]).toBe(8);
    expect(shoe.clearance).toBeCloseTo(.005,6);
  });
  it('keeps airborne joint motion and does not lift the character at the ankles',()=>{
    const shoe=articulateCourierShoe([0,8,0],0,1,.38,0);
    expect(shoe.pitch).toBe(.38);
    expect(shoe.adjustment).toBe(0);
  });
});
