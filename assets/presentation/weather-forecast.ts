import type { WeatherId } from '../shared/photography-contract';
import type { WeatherForecastView } from './types';

const WEATHER_IDS: readonly WeatherId[] = ['morning', 'rain', 'afterglow'];
const SHORT_LABELS: Record<WeatherId, string> = { morning: '晴朗', rain: '细雨', afterglow: '多云' };
export interface ForecastDisplay {
  minutes: number;
  likely: WeatherId[];
  probabilities: Record<WeatherId, number>;
}

/** Display validated rule probabilities as supplied; never sample, infer or normalize them. */
export function forecastDisplay(forecast?: WeatherForecastView): ForecastDisplay | undefined {
  if (!forecast || !Number.isFinite(forecast.observedAtSeconds) || forecast.observedAtSeconds < 0
    || !Number.isFinite(forecast.changeInSeconds) || forecast.changeInSeconds < 0) return;
  const probabilities = forecast.probabilities;
  if (!probabilities || typeof probabilities !== 'object' || Object.keys(probabilities).length !== 3) return;
  const values = WEATHER_IDS.map(id => probabilities[id]);
  if (!values.every(value => Number.isInteger(value) && value >= 0 && value <= 100)
    || values.reduce((sum, value) => sum + value, 0) !== 100) return;
  const highest = Math.max(...values);
  return { minutes: Math.ceil(forecast.changeInSeconds / 60),
    likely: WEATHER_IDS.filter(id => probabilities[id] === highest),
    probabilities: { morning: probabilities.morning, rain: probabilities.rain, afterglow: probabilities.afterglow } };
}

export function forecastMarkup(display: ForecastDisplay, expanded: boolean): string {
  const timing = display.minutes > 0 ? `下一轮天气约 ${display.minutes} 分钟后（现实）` : '下一轮天气即将到来';
  const likely = display.likely.map(id => SHORT_LABELS[id]).join(' / ');
  return `<aside class="sy-forecast" aria-label="山谷天气预报"><button type="button" class="sy-forecast-toggle" data-action="toggle-forecast" aria-expanded="${expanded}" aria-controls="sy-forecast-details"><span>${timing}</span><span>可能${likely}</span><i aria-hidden="true">${expanded ? '−' : '+'}</i></button>${expanded ? `<section id="sy-forecast-details" class="sy-forecast-details" aria-label="下一轮天气概率"><p>风里的消息</p><ul>${WEATHER_IDS.map(id => `<li data-weather-probability="${id}"${display.likely.includes(id) ? ' class="likely"' : ''}><span>${SHORT_LABELS[id]}</span><strong>${display.probabilities[id]}%</strong><span class="sy-forecast-bar" aria-hidden="true"><i style="width:${display.probabilities[id]}%"></i></span></li>`).join('')}</ul><small>这是概率预报，也可能保持现在的天色。<br>天气与时刻分别变化，小憩也不保证晴天。</small></section>` : ''}</aside>`;
}

export const WEATHER_FORECAST_CSS = String.raw`
.sy-forecast{position:absolute;left:50%;top:80px;transform:translateX(-50%);pointer-events:auto;color:var(--paper);font-size:10px;max-width:calc(100vw - 580px)}
.sy-forecast-toggle{display:flex;align-items:center;justify-content:center;gap:11px;padding:7px 11px;background:#17382de8;color:inherit;border:1px solid #e9e1c044!important;border-radius:2px;font-size:10px;line-height:1.4;white-space:nowrap}
.sy-forecast-toggle:hover{background:#395443}.sy-forecast-toggle>span:nth-child(2){color:#f1d79e}.sy-forecast-toggle i{font-style:normal;opacity:.65}
.sy-forecast-details{position:absolute;right:calc(50% + 120px);left:auto;top:35px;transform:none;width:220px;padding:15px;background:#17382df5;border:1px solid #e9e1c055;box-shadow:0 5px 24px #10271955}
.sy-forecast-details>p{margin:0 0 12px!important;letter-spacing:.16em;font-size:11px}.sy-forecast-details ul{list-style:none;padding:0;margin:0}.sy-forecast-details li{display:grid;grid-template-columns:1fr auto;gap:5px;margin-bottom:10px;font-size:11px;opacity:.7}.sy-forecast-details li.likely{opacity:1;color:#f1d79e}.sy-forecast-details strong{font-weight:500}.sy-forecast-bar{grid-column:1/-1;height:3px;background:#f2e5c122}.sy-forecast-bar i{display:block;height:100%;background:currentColor}.sy-forecast-details small{display:block;font-size:10px;line-height:1.8;opacity:.65;margin-top:3px}
@media(max-height:650px){.sy-forecast{top:82px}.sy-forecast-details{padding:12px}}
`;
