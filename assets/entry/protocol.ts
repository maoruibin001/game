import type { GameProjectionValue } from '@forgeax/engine/app';
import type { JourneyAction, JourneyEvent, JourneyState, PhotoObservation, Pose } from '../journey/types.ts';
import type { PresentationAction, PresentationViewModel } from '../presentation/types.ts';
import type { CameraPose, TravelStatus } from '../controller/types.ts';
import type { OriginalPhoto, PhotoFraming, PhotoSceneRecord } from '../shared/photography-contract.ts';
import type { EnvironmentSnapshot } from '../environment/weather.ts';

/** App owns both borrowed MessagePorts. All cross-realm data is structured-clone safe. */
export const JOURNEY_CHANNEL = 'shan-journey' as const;
/** Observed frontend facts only; never commands or durable journey state. */
export interface FrontendStatus {
  music: {
    phase: 'loading' | 'ready' | 'playing' | 'paused' | 'unavailable' | 'failed' | 'disposed';
    cue?: 'normal' | 'vista' | 'outro';
    code?: string;
  };
  focus: { target: 'canvas' | 'ui' | 'other' };
}
export type FrontendMessage =
  | { channel: typeof JOURNEY_CHANNEL; kind: 'inspect' }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'restore'; serialized: string | null }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'presentation'; action: PresentationAction; payload?: unknown }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'command'; action: JourneyAction }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'capture-result'; requestId: string; thumbnail?: string | null; original?: OriginalPhoto; error?: string; capturedAt?: number }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'save-status'; status: 'saved' | 'failed'; message?: string }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'photo-inspection-result'; requestId: string; snapshot?: GameProjectionValue; error?: string }
  | ({ channel: typeof JOURNEY_CHANNEL; kind: 'frontend-status' } & FrontendStatus);
// JourneyState/ViewModel carry the optional valley memory through this same
// channel. A capture result remains the only way to commit a new real photo;
// there is no message that grants a memory or fabricates an observation.
export type EngineMessage =
  | { channel: typeof JOURNEY_CHANNEL; kind: 'ready'; version: '0.5.0' }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'state'; state: JourneyState; view: PresentationViewModel; controller: TravelStatus; environment: EnvironmentSnapshot; events: JourneyEvent[]; saveRevision: number; restored: boolean }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'capture-request'; requestId: string; observation: PhotoObservation; pose: Pose; camera: CameraPose; scene: PhotoSceneRecord; framing?: PhotoFraming }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'photo-inspection-request'; requestId: string }
  | { channel: typeof JOURNEY_CHANNEL; kind: 'capture-cancelled'; requestId: string; reason: string };
export function isJourneyMessage(value: unknown): value is { channel: typeof JOURNEY_CHANNEL; kind: string; [key: string]: unknown } {
  return value !== null && typeof value === 'object' && (value as { channel?: unknown }).channel === JOURNEY_CHANNEL && typeof (value as { kind?: unknown }).kind === 'string';
}
/** Validate the boundary and copy only the small serializable observation schema. */
export function readFrontendStatus(value: unknown): FrontendStatus | null {
  const record=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(!record(value)||!record(value.music)||!record(value.focus))return null;
  const {phase,cue,code}=value.music,target=value.focus.target;
  if(typeof phase!=='string'||!['loading','ready','playing','paused','unavailable','failed','disposed'].includes(phase))return null;
  if(cue!==undefined&&(typeof cue!=='string'||!['normal','vista','outro'].includes(cue)))return null;
  if(code!==undefined&&(typeof code!=='string'||code.length>160))return null;
  if(typeof target!=='string'||!['canvas','ui','other'].includes(target))return null;
  return {
    music:{phase:phase as FrontendStatus['music']['phase'],...(cue===undefined?{}:{cue:cue as NonNullable<FrontendStatus['music']['cue']>}),...(code===undefined?{}:{code})},
    focus:{target:target as FrontendStatus['focus']['target']},
  };
}
