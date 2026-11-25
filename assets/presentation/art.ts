import { MAP_DATA } from './map-data';
/** Original vector illustrations, drawn for this game. No external requests/assets. */
export function icon(name: string, size = 24): string {
  const paths: Record<string, string> = {
    camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
    letter: '<path d="M3 5h18v14H3zM3 6l9 7 9-7"/>',
    book: '<path d="M12 5v15M12 6C8 3 4 4 2 5v14c3-1 6-1 10 1 4-2 7-2 10-1V5c-2-1-6-2-10 1z"/>',
    map: '<path d="M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3zM8 2v17M16 5v17"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>',
    arrow: '<path d="M4 12h16M14 6l6 6-6 6"/>',
    sound: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8q6 4 0 8M19 4q10 8 0 16"/>',
    mountain: '<path d="M2 20L10 4l5 9 3-5 5 12zM7 10l3 2 3-3"/>',
    trail: '<path d="M3 22c0-8 14-6 14-12S8 9 8 5s6-3 9-4"/>',
    stamp: '<path d="M3 2h18v20H3zM6 5h12v14H6zM8 14l4-6 4 6"/>',
    check: '<path d="M4 12l5 5L21 5"/>',
    wind: '<path d="M2 9h15q5 0 5-4t-6 0M2 14h12q7 0 7 5t-6 0M2 19h6"/>',
    settings: '<circle cx="12" cy="12" r="4"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4M4 4l3 3M17 17l3 3M4 20l3-3M17 7l3-3"/>',
    pause: '<path d="M7 5v14M17 5v14"/>',
    pin: '<path d="M12 22s8-9 8-14A8 8 0 0 0 4 8c0 5 8 14 8 14z"/><circle cx="12" cy="8" r="3"/>',
    fullscreen: '<path d="M2 9V2h7M15 2h7v7M22 15v7h-7M9 22H2v-7"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.letter}</svg>`;
}

export function postcardArt(kind: 'forest' | 'town' | 'free', completed = false): string {
  const ink = completed ? '#536347' : '#72766a';
  const sky = completed ? '#d4dfd1' : '#dce0d3';
  const landscape = `<path d="M0 110L32 66l26 20 40-51 37 37 40-27 55 71 45-30 45 43v61H0z" fill="${ink}" opacity=".24"/><path d="M0 142l43-27 51 21 45-28 58 32 61-28 62 29v49H0z" fill="${ink}" opacity=".46"/>`;
  const content = kind === 'forest'
    ? `<path d="M142 153l5-62h27l9 62z" fill="#b8b69a" stroke="#747c60" stroke-width="1.2"/>
      <path d="M141 92l20-22 23 22z" fill="#98745e"/><path d="M146 101h31M144 132h36M157 113v40" stroke="#59634d" stroke-width="3"/>
      <path d="M157 69h6v85h-6zM116 104h91v7h-91z" fill="#8d8163"/>
      <path d="M146 70h11v28h-11zM164 111h11v35h-11zM116 111h31v11h-31zM174 93h30v11h-30z" fill="#eadfba" stroke="#747c60" stroke-width=".8"/>
      <path d="M155 101h10v13h-10z" fill="#59634d"/><path d="M136 153h51v6h-51z" fill="#778362"/>
      <path d="M40 173l-10-28 12-31 16 34-5 25zM280 172l-13-39 16-33 13 37-7 35z" fill="#627254"/>
      <path d="M244 175V82h6v93z" fill="#68715a" stroke="#4b5b49" stroke-width="1.5"/>
      <path d="M246 84l-31-4-2 5 35 5zM246 105l-22-20" fill="#8d8163" stroke="#59634d" stroke-width="3"/>
      <path d="M219 85v10" stroke="#4b5b49" stroke-width="1.5"/>
      <path d="M214 95h10l4 14h-18z" fill="#b4a16c" stroke="#59634d" stroke-width="1.5"/>
      <path d="M210 109h18v3h-18zM218 112h2v5h-2z" fill="#59634d"/>
      <path d="M219 117v8" stroke="#59634d"/><path d="M216 125h6v12h-6z" fill="#eadfba"/>
      <path d="M239 175h16v7h-16z" fill="#929a83"/>`
    : kind === 'town'
      ? '<path d="M33 190V39h54v17h146V39h54v151h-55V95c0-36-144-36-144 0v95z" fill="#948a71"/><path d="M37 44h44M39 67h40M243 48h39M243 76h39M40 106h38M243 106h38M40 140h38M243 142h38" stroke="#d3c6a5" stroke-width="3"/><path d="M135 190v-38h28v38" fill="#9b4c3c"/><path d="M132 151l17-10 17 10z" fill="#b65845"/><path d="M141 162h15" stroke="#f4e9d1" stroke-width="3"/>'
      : '<path d="M0 168l61-20 38 10 40-24 41 22 51-16 89 28v22H0z" fill="#7e8a60"/><circle cx="245" cy="46" r="19" fill="#e9bc73"/><path d="M90 190v-61h5v61M93 131l37 5-36 14" fill="#ac5747"/>';
  return `<svg viewBox="0 0 320 190" role="img" aria-label="${kind === 'forest' ? '风铃与风车的旧明信片' : kind === 'town' ? '石拱框住山峰的旧明信片' : '山谷明信片'}"><rect width="320" height="190" fill="${sky}"/>${landscape}${content}<path d="M0 182h320" stroke="#f0e6ca" opacity=".3" stroke-width="16"/></svg>`;
}

/** A deliberately schematic camera aid, never a substitute for a captured photograph. */
export function valleyLetterGuideArt(): string {
  return `<svg viewBox="0 0 320 168" role="img" aria-label="取景示意：将风车与小镇红屋顶放进同一张照片，不限左右顺序">
    <rect width="320" height="168" fill="#eee7d4"/><path d="M16 39V17h27M277 17h27v22M16 113v22h27M277 135h27v-22" fill="none" stroke="#6f8068" stroke-width="1.5"/>
    <path d="M32 123l43-22 40 11 46-28 46 30 31-14 50 23" fill="none" stroke="#a8af93" stroke-width="1.2"/>
    <g stroke="#536b58" stroke-linejoin="round"><path d="M70 112l5-38h24l6 38z" fill="#d4ccb0"/><path d="M72 75l15-14 15 14z" fill="#9d7f65"/><path d="M85 44h4v63h-4zM56 72h63v4H56z" fill="#8c8164"/><path d="M77 44h8v23h-8zM89 81h8v24h-8zM56 76h23v8H56zM96 64h23v8H96z" fill="#f6f0de"/></g>
    <g stroke="#816a52" stroke-width="1.1" stroke-linejoin="round"><path d="M211 91h31v22h-31zM248 82h27v31h-27z" fill="#d8ceb4"/><path d="M206 92l21-19 21 19zM243 83l18-17 19 17z" fill="#b76f58"/><path d="M219 100h7v13M255 94h7v9" fill="#6e7b61"/></g>
    <path d="M139 73h42M145 69l-6 4 6 4M175 69l6 4-6 4" fill="none" stroke="#a09575" stroke-width="1.2" stroke-dasharray="3 3"/>
    <g fill="#536b58" font-size="12" font-family="serif" text-anchor="middle"><text x="87" y="153">风车</text><text x="244" y="153">小镇红屋顶</text></g>
  </svg>`;
}

export const MAP_ART = `<svg viewBox="0 0 720 500" class="sy-map-art" role="img" aria-label="山谷地图，标出旧邮局、风来林地、石巷旧镇和山脊观景站">
<defs><pattern id="sy-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#8c9673" opacity=".11"/></pattern></defs>
<rect width="720" height="500" fill="#e8e1c9"/><rect width="720" height="500" fill="url(#sy-map-grid)"/>
<g fill="none" stroke="#a9ad8a" opacity=".65"><path d="M-20 200Q70 20 210 44T470 13T750 118M-30 228Q60 45 200 67T480 40T750 142M-20 250Q80 70 210 94T470 67T750 170M20 276Q80 100 219 117T470 91T720 190M49 300Q102 130 229 143T476 124T693 218M70 325Q115 164 238 169T480 149T660 242"/>
<path d="M39 500Q65 374 182 359T367 407T588 322T749 368M67 500Q89 404 187 385T371 434T597 346T749 400M93 500Q114 431 194 414T381 462T604 375T748 431"/></g>
<g fill="#8d9b75" opacity=".5"><path d="M75 170l15-32 15 32zM103 188l20-42 20 42zM132 162l16-33 16 33zM147 198l20-42 20 42zM179 162l15-30 15 30zM87 213l17-35 17 35zM202 207l21-44 21 44zM228 165l16-31 16 31zM256 196l16-33 16 33z"/></g>
<g fill="#a39b7e" opacity=".56"><path d="M368 109l36-67 43 67zM421 103l33-63 37 63zM467 110l34-64 43 64zM528 122l31-58 40 58z"/></g>
<g transform="translate(-30 -50)" fill="#b09c82" opacity=".8"><path d="M486 279h21v27h-21zM513 264h25v34h-25zM543 281h23v25h-23zM488 315h28v19h-28zM525 309h21v34h-21zM554 316h27v22h-27z"/></g>
<g fill="none" stroke-linejoin="round" stroke-linecap="round">${MAP_DATA.routes.map(route => `<polyline points="${route.points.map(p=>p.join(',')).join(' ')}" stroke="#faf4e4" stroke-width="10"/><polyline points="${route.points.map(p=>p.join(',')).join(' ')}" stroke="#a79878" stroke-width="2" stroke-dasharray="5 6"/>`).join('')}</g>
${MAP_DATA.landmarks.map(mark=>`<circle cx="${mark.point[0]}" cy="${mark.point[1]}" r="9" fill="#315547" stroke="#f7f0de" stroke-width="4"/><text x="${mark.point[0]+(mark.id==='forest'?-100:17)}" y="${mark.point[1]+(mark.id==='post'?28:mark.id==='forest'?28:-13)}" fill="#365043" font-size="17" font-family="serif">${mark.title}</text>`).join('')}
<g class="sy-map-pointer" data-map-position="" transform="translate(360 396.875)" aria-label="红箭头指向按 W 前进的方向"><path d="M0-12L8 9 0 5-8 9z" fill="#b85844" stroke="#fff6dd" stroke-width="2"/></g>
<g transform="translate(654 59)" fill="#5f7157"><path d="M0-26l8 30-8-5-8 5z"/><text y="-32" text-anchor="middle" font-size="14">N</text><path d="M-15 9h30" stroke="currentColor"/></g>
</svg>`;
