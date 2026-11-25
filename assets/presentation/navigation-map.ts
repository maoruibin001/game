import { forwardFor } from '../controller/geometry.ts';
import { MAP_DATA } from './map-data.ts';
import type { MapPoint, NavigationView, PresentationViewModel } from './types.ts';

const width = 720, height = 500;
const { minX, maxX, minZ, maxZ } = MAP_DATA.bounds;
const unit = (value: number) => Math.max(0, Math.min(1, value));
const paperPoint = (point: MapPoint) => [unit(point.x) * width, unit(point.y) * height] as const;
const escape = (text: string) => text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

export function mapForwardAngle(heading: number): number {
  const [x, , z] = forwardFor(heading, 0);
  const dx = x * width / (maxX - minX), dy = -z * height / (maxZ - minZ);
  return Math.atan2(dx, -dy) * 180 / Math.PI;
}

export function mapMarkerTransform(player: NonNullable<PresentationViewModel['playerMap']>, scale = 1): string {
  const [x, y] = paperPoint(player);
  return `translate(${x} ${y}) rotate(${mapForwardAngle(player.heading)})${scale === 1 ? '' : ` scale(${scale})`}`;
}

export function navigationRouteArt(destination: NavigationView['destination'], small = false, project = paperPoint): string {
  if (!destination) return '';
  const [x, y] = project(destination.point);
  const stroke = small ? '#f4cf7c' : '#a94935';
  const next = destination.nextPoint ? project(destination.nextPoint) : undefined;
  const stop = next ? `<circle data-navigation-stop cx="${next[0]}" cy="${next[1]}" r="${small ? 4 : 6}" fill="${stroke}" stroke="#fcf0ce" stroke-width="2"><title>先到这里</title></circle>` : '';
  return `<g aria-label="当前路线">${destination.points.length > 1 ? `<polyline data-navigation-route points="${destination.points.map(point => project(point).join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${small ? 3 : 4}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}<circle cx="${x}" cy="${y}" r="${small ? 5 : 10}" fill="#fcf0ce" stroke="${stroke}" stroke-width="2"><title>目的地</title></circle>${stop}</g>`;
}

const publicRoads = MAP_DATA.routes.map(route=>route.points.map(([x,y])=>({x:x/width,y:y/height})));
const pocketScale = .8;

export function pocketMapProjection(player:NonNullable<PresentationViewModel['playerMap']>) {
  const [forwardX,,forwardZ]=forwardFor(player.heading,0);
  return (point:MapPoint) => {
    const east=(unit(point.x)-unit(player.x))*(maxX-minX);
    const north=(unit(player.y)-unit(point.y))*(maxZ-minZ);
    // Match the camera's right vector and W's forward vector in world units.
    return [(-forwardZ*east+forwardX*north)*pocketScale,
      -(forwardX*east+forwardZ*north)*pocketScale] as const;
  };
}

export function pocketMapContent(player: NonNullable<PresentationViewModel['playerMap']>, navigation: NavigationView): string {
  const project = pocketMapProjection(player);
  const roads = [...publicRoads,...navigation.postalRoads].map(points =>
    `<polyline points="${points.map(point => project(point).join(',')).join(' ')}"/>`).join('');
  return `<div class="sy-pocket-map-frame"><svg viewBox="-65 -39 130 78" role="img" aria-label="附近邮路，当前视角的前方朝上"><g fill="none" stroke="#a8b49a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${roads}</g>${navigationRouteArt(navigation.destination, true, project)}<g data-pocket-player transform="scale(.6)"><path d="M0-12L8 9 0 5-8 9z" fill="#d56d57" stroke="#fff6dd" stroke-width="2"/></g></svg><span class="sy-pocket-direction" aria-hidden="true">前方 ↑</span></div>${navigation.destination ? `<strong>${escape(navigation.destination.title)}</strong>` : ''}${navigation.hint ? `<p>${escape(navigation.hint)}</p>` : ''}`;
}

export const NAVIGATION_CSS = String.raw`
.sy-pocket-map{position:absolute;top:148px;right:44px;width:184px;border:1px solid #e9e1c055;background:#17382def;color:var(--paper);border-radius:3px;font-size:11px;line-height:1.45;pointer-events:auto}
.sy-pocket-map[data-collapsed=true]{width:auto}.sy-pocket-map>button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:6px 9px;background:transparent;color:inherit;text-align:left;font-size:11px}.sy-pocket-map>button span:last-child{font-size:10px;color:#e7cc97}
.sy-pocket-body{padding:0 8px 8px}.sy-pocket-map-frame{position:relative;background:#254b3b;border:1px solid #e9e1c02b}.sy-pocket-map-frame svg{display:block;width:100%;height:auto;aspect-ratio:5/3}.sy-pocket-direction{position:absolute;top:3px;right:5px;color:#f3dfb3;font-size:9px}.sy-pocket-body strong{display:block;margin-top:5px;color:#f4d193;font-weight:500}.sy-pocket-body p{margin:3px 0 0!important;color:#f1e8d2}
.sy-pocket-map[data-guide=true]{border-color:#f4cf7c;box-shadow:0 0 0 3px #f4cf7c55;animation:sy-guide-pulse 1.15s ease-in-out 2}
.sy-pocket-guide{padding:6px 9px;border-top:1px solid #f4cf7c80;background:#f4cf7c;color:#263d31;font-weight:600}
@keyframes sy-guide-pulse{50%{box-shadow:0 0 0 6px #f4cf7c99}}
@media(prefers-reduced-motion:reduce){.sy-pocket-map[data-guide=true]{animation:none}}
.sy-ui[data-reduced-motion=true] .sy-pocket-map[data-guide=true]{animation:none}
.sy-map-navigation-caption{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;line-height:1.5}.sy-map-navigation-caption .sy-button{padding:5px 9px;font-size:11px}
.sy-map-navigation-caption p{margin:3px 0 0}.sy-map-navigation-caption .sy-button{flex-shrink:0}
.sy-scenic-entry{display:flex;justify-content:flex-end;margin:0 0 8px}.sy-scenic-entry .sy-button{padding:6px 12px}
.sy-scenic-spots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0;margin:0;list-style:none}
.sy-scenic-spots button{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;height:100%;padding:9px 13px;background:#eae5cf;color:#294737;border-radius:3px;text-align:left}
.sy-scenic-spots button:is(:hover,:focus-visible){background:#dde1c9}.sy-scenic-spots button[aria-pressed=true]{background:#355b43;color:#fff3d2}
.sy-scenic-spots strong,.sy-scenic-spots small{display:block}.sy-scenic-spots small{margin-top:3px;font-size:11px}.sy-scenic-spots button>span:last-child{flex-shrink:0;font-size:11px}
.sy-reply-paths button[data-action=choose-story-route],.sy-reply-free{display:block;margin-top:8px;padding:5px 8px;background:#dce3cc;color:#1e4936;font-size:11px;border-radius:2px}.sy-reply-paths button[aria-pressed=true]{background:#355b43;color:#fff3d2}
@media(max-height:650px){.sy-pocket-map{top:130px;right:25px;width:158px}.sy-pocket-body{padding:0 7px 6px}}
@media(max-width:700px){.sy-pocket-map{top:148px;right:16px;width:144px}}
@media(max-width:480px){.sy-scenic-spots{grid-template-columns:1fr}}
`;
