import {gateBinding,createGate1Run} from './gate1-four-sites.mjs';
import {withPassivePointerAudit} from './passive-pointer-audit.mjs';
const binding=await gateBinding('gate1-east');
export default withPassivePointerAudit(createGate1Run('east',binding),binding);
