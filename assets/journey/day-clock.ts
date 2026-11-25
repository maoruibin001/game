/** Valley civil time. The caller owns pause/active-time policy; this module never
 * advances weather, playSeconds, camera state or progression. */
export interface JourneyClock { day:number; minute:number }
export type RestTarget='morning'|'golden'|'sunset';

export const DAY_MINUTES=1440;
export const GAME_MINUTES_PER_REAL_SECOND=40/60;
export const SUNRISE_MINUTE=360;
export const GOLDEN_START_MINUTE=1000;
export const SUNSET_WINDOW_START=1060;
export const SUNSET_MINUTE=1100;
export const DAYLIGHT=Object.freeze({sunrise:SUNRISE_MINUTE,goldenStart:GOLDEN_START_MINUTE,sunsetStart:SUNSET_WINDOW_START,sunset:SUNSET_MINUTE});
export const REST_MINUTES:Readonly<Record<RestTarget,number>>=Object.freeze({morning:380,golden:GOLDEN_START_MINUTE,sunset:SUNSET_WINDOW_START});
export const MAX_JOURNEY_DAY=1_000_000;
const DEFAULT_MINUTE=13*60;
const MAX_TOTAL_MINUTES=MAX_JOURNEY_DAY*DAY_MINUTES-.001;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);

export function createDayClock():JourneyClock{return{day:1,minute:DEFAULT_MINUTE};}

function fromTotalMinutes(total:number):JourneyClock{
 const safe=Math.min(MAX_TOTAL_MINUTES,Math.max(0,total));
 const days=Math.floor(safe/DAY_MINUTES);return{day:days+1,minute:safe-days*DAY_MINUTES};
}

/** Invalid fields fall back independently. Finite minute overflow/underflow is
 * normalized across days; malformed negative dates cannot precede day one. */
export function cleanDayClock(value:unknown):JourneyClock{
 const p=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const day=finite(p.day)?Math.min(MAX_JOURNEY_DAY,Math.max(1,Math.floor(p.day))):1;
 const minute=finite(p.minute)?p.minute:DEFAULT_MINUTE;
 return fromTotalMinutes((day-1)*DAY_MINUTES+minute);
}

export function advanceDayClock(clock:JourneyClock,realSeconds:number):JourneyClock{
 const current=cleanDayClock(clock);
 if(!Number.isFinite(realSeconds)||realSeconds<=0)return current;
 return fromTotalMinutes((current.day-1)*DAY_MINUTES+current.minute+realSeconds*GAME_MINUTES_PER_REAL_SECOND);
}

/** Strictly the next occurrence, including tomorrow when already at the target.
 * A rest skips valley time without claiming that the player actively played it. */
export function restDayClock(clock:JourneyClock,target:RestTarget):{clock:JourneyClock;skippedMinutes:number;weatherSeconds:number}{
 const current=cleanDayClock(clock),minute=REST_MINUTES[target];
 if(minute===undefined)throw new RangeError('Unknown rest target');
 const nextDay=minute<=current.minute;
 if(nextDay&&current.day>=MAX_JOURNEY_DAY)throw new RangeError('Journey clock day limit reached');
 const skippedMinutes=(nextDay?DAY_MINUTES:0)+minute-current.minute;
 return{clock:{day:current.day+(nextDay?1:0),minute},skippedMinutes,weatherSeconds:skippedMinutes/GAME_MINUTES_PER_REAL_SECOND};
}

export function formatClock(clock:JourneyClock):string{
 const current=cleanDayClock(clock),wholeMinute=Math.min(DAY_MINUTES-1,Math.floor(current.minute+1e-8));
 return `第 ${current.day} 天 · ${String(Math.floor(wholeMinute/60)).padStart(2,'0')}:${String(wholeMinute%60).padStart(2,'0')}`;
}
