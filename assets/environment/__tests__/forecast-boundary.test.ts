import {describe,expect,it,vi} from 'vitest';
import {createJourney,reduceJourney,serializeJourney,type Pose} from '../../journey/index.ts';
import {createFreshJourney,restoreWithWeatherSeed,shutterTransition} from '../forecast-boundary.ts';

const spawn:Pose={position:[0,1,0],yaw:Math.PI,pitch:0,area:'post'};
const photoState=()=>reduceJourney(reduceJourney(createJourney(spawn),{type:'start'}).state,{type:'open-camera'}).state;

describe('forecast entropy and capture boundary',()=>{
  it('takes one runtime seed for a new journey and for an empty-save first visit',()=>{
    const entropy=vi.fn().mockReturnValueOnce(123456).mockReturnValueOnce(789012);
    expect(createFreshJourney(spawn,entropy).durable.weatherCycle.seed).toBe(123456);
    expect(entropy).toHaveBeenCalledTimes(1);
    const empty=restoreWithWeatherSeed(null,spawn,entropy);
    expect(empty.status).toBe('empty');expect(empty.state.durable.weatherCycle.seed).toBe(789012);expect(entropy).toHaveBeenCalledTimes(2);
  });
  it('restores the saved cycle without drawing another random word',()=>{
    const entropy=vi.fn(()=>54321);
    let state=reduceJourney(createFreshJourney(spawn,()=>987654),{type:'start'}).state;
    for(let i=0;i<17;i++)state=reduceJourney(state,{type:'tick',deltaSeconds:1}).state;
    const restored=restoreWithWeatherSeed(serializeJourney(state),spawn,entropy);
    expect(restored.status).toBe('loaded');expect(restored.state.durable.weatherCycle).toEqual(state.durable.weatherCycle);expect(entropy).not.toHaveBeenCalled();
  });
  it('keeps legacy migration deterministic and does not reroll invalid/future saves',()=>{
    const entropy=vi.fn(()=>54321),{weatherCycle:_,...oldDurable}=createJourney(spawn).durable;
    const legacy={...oldDurable,version:3};
    const migrated=restoreWithWeatherSeed(JSON.stringify({game:'shanye-laixin',version:3,journey:legacy}),spawn,entropy);
    expect(migrated.status).toBe('migrated');
    expect(restoreWithWeatherSeed('broken',spawn,entropy).status).toBe('invalid');
    expect(restoreWithWeatherSeed(JSON.stringify({version:99}),spawn,entropy).status).toBe('future-version');
    expect(entropy).not.toHaveBeenCalled();
  });
  it('gives a natural weather boundary priority over a simultaneous timer-ready edge',()=>{
    const state=photoState(),tick={type:'tick',deltaSeconds:1} as const;
    expect(shutterTransition(tick,[{type:'photo:timer-ready'},{type:'weather:changed'}],state)).toBe('cancel');
    expect(shutterTransition(tick,[{type:'photo:timer-cancelled'},{type:'photo:timer-ready'}],state)).toBe('cancel');
    expect(shutterTransition(tick,[{type:'photo:timer-ready'}],state)).toBe('ready');
    expect(shutterTransition({type:'set-weather',weather:state.durable.weather},[],state)).toBe('cancel');
    expect(shutterTransition(tick,[],state)).toBe('unchanged');
    const paused=reduceJourney(state,{type:'pause',reason:'hidden'}).state;
    expect(shutterTransition(tick,[{type:'photo:timer-ready'}],paused)).toBe('cancel');
  });
});
