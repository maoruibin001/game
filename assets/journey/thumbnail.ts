import { THUMBNAIL_MAX_LENGTH } from './content.ts';

const be16 = (b: Uint8Array, p: number) => b[p]! * 256 + b[p + 1]!;
const be32 = (b: Uint8Array, p: number) => b[p]! * 0x1000000 + b[p + 1]! * 0x10000 + b[p + 2]! * 256 + b[p + 3]!;
const le32 = (b: Uint8Array, p: number) => b[p]! + b[p + 1]! * 256 + b[p + 2]! * 0x10000 + b[p + 3]! * 0x1000000;
const tag = (b: Uint8Array, p: number) => String.fromCharCode(...b.subarray(p, p + 4));

function png(b: Uint8Array): boolean {
  if (b.length < 57 || ![137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)) return false;
  let p = 8, header = false, data = false;
  while (p + 12 <= b.length) {
    const size = be32(b, p), kind = tag(b, p + 4), end = p + 12 + size;
    if (end > b.length) return false;
    if (!header) {
      if (kind !== 'IHDR' || size !== 13 || be32(b, p + 8) === 0 || be32(b, p + 12) === 0) return false;
      const depths: Record<number, number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
      if (!depths[b[p + 17]!] ?.includes(b[p + 16]!) || b[p + 18] !== 0 || b[p + 19] !== 0 || b[p + 20]! > 1) return false;
      header = true;
    } else if (kind === 'IHDR') return false;
    if (kind === 'IDAT' && size > 0) data = true;
    if (kind === 'IEND') return size === 0 && data && end === b.length;
    p = end;
  }
  return false;
}

function jpeg(b: Uint8Array): boolean {
  if (b.length < 20 || b[0] !== 0xff || b[1] !== 0xd8) return false;
  let p = 2, frame = false, scan = false, entropy = false;
  while (p < b.length) {
    if (b[p++] !== 0xff) return false;
    while (b[p] === 0xff) p++;
    const marker = b[p++];
    if (marker === 0xd9) return frame && scan && entropy && p === b.length;
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || p + 2 > b.length) return false;
    const size = be16(b, p), end = p + size;
    if (size < 2 || end > b.length) return false;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const components = b[p + 7]!;
      if (size < 11 || components < 1 || components > 4 || size !== 8 + 3 * components || be16(b, p + 3) === 0 || be16(b, p + 5) === 0) return false;
      frame = true;
    }
    p = end;
    if (marker === 0xda) {
      const components = b[end - size + 2]!;
      if (!frame || components < 1 || components > 4 || size !== 6 + 2 * components) return false;
      scan = true;
      // Check scan framing, including escaped FF bytes and restart markers. The
      // compressed entropy stream is intentionally not decoded in game rules.
      while (p < b.length) {
        if (b[p] !== 0xff) { entropy = true; p++; continue; }
        if (b[p + 1] === 0 || (b[p + 1]! >= 0xd0 && b[p + 1]! <= 0xd7)) { entropy = true; p += 2; continue; }
        break;
      }
    }
  }
  return false;
}

function webp(b: Uint8Array): boolean {
  if (b.length < 26 || tag(b, 0) !== 'RIFF' || tag(b, 8) !== 'WEBP' || le32(b, 4) + 8 !== b.length) return false;
  let p = 12, image = false;
  while (p + 8 <= b.length) {
    const kind = tag(b, p), size = le32(b, p + 4), start = p + 8, end = start + size;
    if (end > b.length) return false;
    if (kind === 'VP8 ') {
      if (size < 10 || b[start + 3] !== 0x9d || b[start + 4] !== 1 || b[start + 5] !== 0x2a
        || ((b[start + 6]! + b[start + 7]! * 256) & 0x3fff) === 0 || ((b[start + 8]! + b[start + 9]! * 256) & 0x3fff) === 0) return false;
      image = true;
    } else if (kind === 'VP8L') {
      if (size < 5 || b[start] !== 0x2f || (b[start + 4]! >> 5) !== 0) return false;
      image = true;
    }
    p = end + (size & 1);
  }
  return image && p === b.length;
}

/** Minimum container structure only, not a full image decoder or proof of scene pixels.
 * The frontend capture boundary still owns successful rendering and actual pixel checks.
 */
export function cleanThumbnail(value: unknown, maxLength = THUMBNAIL_MAX_LENGTH): string | null {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(match[2]!), c => c.charCodeAt(0)); }
  catch { return null; }
  const valid = match[1] === 'png' ? png(bytes) : match[1] === 'jpeg' ? jpeg(bytes) : webp(bytes);
  return valid ? value : null;
}
