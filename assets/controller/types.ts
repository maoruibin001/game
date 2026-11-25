import type { PhotographySettings } from '../shared/photography-contract.ts';
/** Game-space coordinates are feet positions in metres. +Y is up; yaw 0 faces -Z. */
export type Vec3 = readonly [number, number, number];
export type TravelMode = 'walk' | 'photo' | 'zipline';
export interface SegmentHit { hit: boolean; point: Vec3; distance: number; fraction: number }
export type TraceSegment = (origin: Vec3, destination: Vec3, clearance?: number) => SegmentHit;
export interface PortraitStage { heading: number; distance: number; aimRight: number }
export interface CameraPose {
  position: Vec3; forward: Vec3; up: Vec3; verticalFovRadians: number; aspect: number;
  bufferSize?: { width: number; height: number };
}
export type PortraitReason = 'ready' | 'camera-blocked' | 'subject-occluded' | 'outside-frame';
export interface PhotographyCandidate { index: number; available: boolean; reason: PortraitReason; position: Vec3 }
export interface PhotographyStatus {
  /** Settings already applied to the native view, not a queued menu request. */
  settings: PhotographySettings;
  candidates: PhotographyCandidate[];
  selectedViewpoint: number;
  availableViewpoints: number[];
  candidateAvailable: boolean;
  candidateStatus: string;
  subjectVisible: boolean;
}
export interface InputFrame {
  horizontal: number; vertical: number; turn?: number; steerCharacter?: boolean; orbitOnly?: boolean; run: boolean; jump: boolean;
  lookX: number; lookY: number; lookActive: boolean;
  camera: boolean; shutter: boolean; interact: boolean; pause: boolean; map: boolean; journal: boolean;
}
export type TravelAction = 'camera-enter' | 'camera-exit' | 'shutter' | 'interact' | 'pause' | 'map' | 'journal' | 'zipline-start' | 'zipline-land';
export interface WalkingCameraState {
  focus: Vec3;
  intentPitch: number;
  orbitDistance: number;
  safeDistance: number;
  lift: number;
}
export interface TravelStatus {
  position: Vec3; yaw: number; pitch: number; facingYaw: number; mode: TravelMode;
  paused: boolean; grounded: boolean; running: boolean; verticalVelocity: number; speed: number; distanceWalked: number; stepPhase: number; posePhase: number;
  ziplineProgress: number; camera: CameraPose; photoRaising?: true;
  photography: PhotographyStatus; avatarVisible: boolean; walkingCamera?: WalkingCameraState;
}
export interface TravelActionEvent { type: TravelAction; state: TravelStatus }
export interface ZiplineRoute { start: Vec3; end: Vec3; points?: readonly Vec3[]; speed?: number; sag?: number; mountRadius?: number }
export interface ControllerOptions {
  spawn: Vec3; initialYaw?: number; initialPitch?: number; aspect?: number;
  terrainHeight: (x: number, z: number) => number;
  restoreGround?: (x: number, z: number) => number;
  resolveMove?: (position: Vec3, displacement: Vec3, radius?: number, height?: number) => Vec3;
  traceSegment?: TraceSegment;
  portraitTraceSegment?: TraceSegment;
  alternatePortraitAngles?: (position:Vec3) => boolean;
  portraitStage?: (position:Vec3) => PortraitStage | undefined;
  onAction?: (event: TravelActionEvent) => void;
  walkSpeed?: number; runSpeed?: number; photoWalkSpeed?: number; radius?: number; height?: number;
  cameraDistance?: number; verticalFovRadians?: number; photoFovRadians?: number;
  landscapeEyeHeight?: (position: Vec3) => number;
  walkingCameraFrame?: (position: Vec3) => { height: number; distance: number; pitchOffset: number; raiseSeconds?: number } | undefined;
}
export interface AnchorShape { position: Vec3; size?: Vec3; radius?: number; right?: Vec3 }
export interface ProjectedAnchor {
  x: number; y: number; width: number; height: number; depth: number;
  visibleFraction: number; occluded: boolean; visible: boolean; screenRadius: number;
}
export const EMPTY_INPUT: Readonly<InputFrame> = Object.freeze({horizontal: 0, vertical: 0, turn: 0, steerCharacter: false, run: false, jump: false, lookX: 0, lookY: 0, lookActive: false, camera: false, shutter: false, interact: false, pause: false, map: false, journal: false});
