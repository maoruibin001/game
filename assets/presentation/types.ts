import type { PhotographySettings, WeatherId } from '../shared/photography-contract';
import type { FlowerKind } from '../journey/flower-catalog';
import type { StoryRoute } from '../journey/types';
export type RegionId = 'post' | 'forest' | 'town' | 'ridge';
export type Screen = 'menu' | 'play' | 'paused' | 'journal' | 'map' | 'photo' | 'ending';
export type CardId = 'forest' | 'town';
export type JournalTab = 'letters' | 'discoveries' | 'album' | 'gear';
export type PresentationAction =
  | 'start' | 'continue' | 'new-game' | 'resume' | 'pause' | 'open-journal' | 'recover-path'
  | 'open-map' | 'close-panel' | 'camera-toggle' | 'shutter' | 'interact' | 'night-gear'
  | 'sixth' | 'flower-gear' | 'flower-photo' | 'submit-commission' | 'claim-commission-round'
  | 'save-photo' | 'discard-photo' | 'replace-photo' | 'select-ending-photo'
  | 'navigate-commission' | 'send-letter' | 'keep-exploring' | 'settings' | 'fullscreen' | 'back-to-menu'
  | 'replace-memory-photo' | 'set-weather' | 'set-photography' | 'cancel-countdown'
  | 'send-opening-photo' | 'skip-opening-photo' | 'open-film' | 'delete-film-photo' | 'export-photo'
  | 'attach-route-photo' | 'send-route-pair' | 'export-route-letter' | 'open-replies' | 'select-reply-photo' | 'export-postcard'
  | 'track-photo-spot' | 'rest-until' | 'set-creative-mode' | 'set-time'
  | 'read-ahe-route' | 'choose-story-route' | 'set-pocket-map' | 'track-scenic-spot';

export interface MapPoint { x: number; y: number }
export interface NavigationView {
  canChooseStory: boolean;
  preview?: 'ridge-arrow' | 'arch-courtyard' | null;
  storyRoute: StoryRoute | null;
  scenicSpotId: string | null;
  scenicSpots: readonly { id: string; title: string; regionLabel: string }[];
  collapsed: boolean;
  hint: string;
  postalRoads: readonly (readonly MapPoint[])[];
  destination?: { title: string; point: MapPoint; points: readonly MapPoint[]; nextPoint?: MapPoint };
}

export interface PhotoView {
  id: string;
  /** Engine-produced URL, never HTML. data:image, blob or local same-origin URLs are accepted. */
  imageUrl?: string;
  title: string;
  location: string;
  dateLabel?: string;
  card?: CardId | 'free';
  isEnding?: boolean;
  originalKey?: string;
  /** Actual native image dimensions, never an upscaled preview's size. */
  width?: number;
  height?: number;
  sceneDescription?: string;
  caption?: string;
  /** Presets projected from this photograph's capture snapshot, never live weather. */
  noteOptions?: readonly string[];
  /** Frontend hydration status. Without a value the image may still be a thumbnail. */
  originalState?: 'loading' | 'ready' | 'missing';
}

export interface RouteLetterView {
  slots: { id: 'turn' | 'destination'; photo?: PhotoView; choices: PhotoView[] }[];
  sent: boolean;
  expanded?: boolean;
}
export interface ReplyLetterView {
  route?: RouteLetterView;
  id: CardId; title: string; body: string; response?: string;
  status: 'searching' | 'choose' | 'answered';
  photo?: PhotoView; candidates: PhotoView[]; note: string;
  noteOptions?: readonly string[];
  carriedOver?: boolean;
  /** Existing progress can survive even if an old save has lost its picture. */
  legacyUnlocked?: boolean;
}
export interface ReplyLettersView {
  items: ReplyLetterView[];
  final: { title: string; body: string; response: string; ready: boolean; photo?: PhotoView; note: string; noteOptions?: readonly string[] };
}

export interface WeatherForecastView {
  /** Game clock of the observation. No selected future outcome is exposed. */
  observedAtSeconds: number;
  changeInSeconds: number;
  /** Integer percentages for all three weather IDs, totaling exactly 100. */
  probabilities: Record<WeatherId, number>;
}
export interface WeatherView { id: WeatherId; label: string; options: { id: WeatherId; label: string }[]; transitioning?: boolean; forecast?: WeatherForecastView; }
export interface PhotoViewpointView { index: number; label: string; available: boolean; reason?: string; }

/** All recommendation, time and route decisions are projected by journey/engine. */
export interface DayClockView {
  day: number; minute: number; timeLabel: string; sunsetLabel: string;
}
export interface PhotoOutingView {
  spotId: string; spotTitle: string; regionLabel: string;
  slot: 'morning' | 'afternoon' | 'sunset'; slotTitle: string;
  status: 'upcoming' | 'active' | 'missed' | 'completed';
  windowLabel: string; nextWindowLabel?: string;
  weatherProbability: number; weatherLabel: string;
  /** Distance in meters and estimated REAL walking seconds; arrivalLabel uses valley time. */
  distanceMeters: number; etaSeconds: number; arrivalLabel: string;
  canArriveInWindow: boolean;
  preparation: string; facingHint: string; compositionHint: string;
  photo?: PhotoView;
  /** Existing world-route geometry normalized to the same [0,1] space as playerMap. */
  mapTarget?: { x: number; y: number };
  routePoints?: readonly { x: number; y: number }[];
}
export interface PhotoOutingsView {
  day: number; slots: PhotoOutingView[];
  /** An explicitly tracked spot remains independent of changing daily recommendations. */
  tracked?: PhotoOutingView;
  currentSpotId?: string; nextSpotId?: string;
}
export interface RestPointView {
  id: string; title: string; available: boolean; reason?: string;
  /** Monotonic session-only interaction pulse. A new value opens the local choices once. */
  requestOpen?: number;
  targets: { target: 'morning' | 'golden' | 'sunset'; label: string; arrivalLabel: string; weatherSummary?: string }[];
}

export interface DiscoveryView { id: string; title: string; description: string; found: boolean; icon?: string; }
export interface MemoryView {
  id: 'valley-letter';
  title: string;
  status: 'unseen' | 'tracing' | 'ready' | 'completed';
  clueFound: boolean;
  seatFound: boolean;
  hint: string;
  letter?: string;
  /** Independent retained player photograph; never resolve this through the album. */
  photo?: PhotoView;
  /** Rule-approved, still retained photographs, excluding the currently selected image. */
  replacementPhotos: PhotoView[];
}
export interface MemoryCameraView {
  id: 'valley-letter';
  title: string;
  alignment: number;
  ready: boolean;
  feedback: string;
}
export interface SettingsView {
  masterVolume: number;
  musicVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  sensitivity: number;
  quality: 'high' | 'balanced' | 'low';
  reducedMotion: boolean;
}
export interface PresentationViewModel {
  screen: Screen;
  hasSave: boolean;
  area: RegionId;
  areaName: string;
  objective: string;
  objectiveDetail?: string;
  hint?: string;
  boundaryNotice?: string;
  interaction?: { label: string; detail?: string; key?: string; disabled?: boolean };
  completed: Record<CardId, boolean>;
  discoveries: DiscoveryView[];
  memories?: MemoryView[];
  replies?: ReplyLettersView;
  album: PhotoView[];
  film?: PhotoView[];
  mountainLetter?: {
    title: string; body: string; initial: boolean;
    candidates: (PhotoView & { result: string; mountains?: 0 | 1 | 2 })[];
    photo?: PhotoView; response?: string;
    request?: string; oldPhotoBack?: readonly string[]; canChooseRidge?: boolean;
  };
  opening?: { step: 'camera' | 'frame' | 'shutter' };
  weather?: WeatherView;
  dayClock?: DayClockView;
  outings?: PhotoOutingsView;
  restPoint?: RestPointView;
  creativeMode?: boolean;
  skills?: {run:boolean; jump:boolean};
  fireworks?: PhotoView;
  night?: {
    open: boolean; torch: boolean; lit: boolean; placing: boolean; spent: boolean; playing: boolean;
    gold: { available: boolean; placed: boolean; borrowed: boolean };
    scarlet: { claimed: boolean; available: boolean; placed: boolean; spent: boolean };
    fishLetter: 'unread' | 'carrying' | 'delivered'; goldInvitation: boolean; inviteAtThisSite: boolean; repriseActive: boolean; repriseHere: boolean;
  };
  sixth?: {panel:'window'|'enlarger'|'room';tin:boolean;revealed:boolean;displayed:boolean;portrait?:PhotoView;choices:PhotoView[]};
  commissions?: {
    round: number;
    reward: string;
    canClaim: boolean;
    previous?: string;
    entries: { title: string; hint: string; site?: string; done: boolean; photos: PhotoView[] }[];
  };
  flowers?: {
    party?: {
      litSite: boolean; capacity: number; invitation: boolean; invitationActive: boolean; started: boolean; witnessed: boolean;
      slots: {kind:FlowerKind; name:string; count:number; available:number; sample:boolean}[];
      boxes: {name:string; nearby:boolean}[];
      maySample:boolean; here:boolean;
    };
    next?: {title:string;brief:string};
    pair?: {day:PhotoView[];night:PhotoView[];selectedDay?:string;selectedNight?:string};
    repeat?: {reviewed:boolean; photos:PhotoView[]};
  };
  movement?: { running: boolean; grounded: boolean };
  settings: SettingsView;
  camera: {
    active: boolean; target?: CardId; alignment: number; ready: boolean; feedback?: string;
    referenceVisible?: boolean; memory?: MemoryCameraView;
    replyGuide?: 'forest-sign' | 'ridge-pair';
    photography?: PhotographySettings;
    /** Native frame bounds in fractions of the displayed drawing surface. */
    frame?: { left: number; top: number; width: number; height: number };
    countdownSeconds?: number | null;
    viewpoints?: PhotoViewpointView[];
    candidateStatus?: string;
    captureState?: 'idle' | 'capturing' | 'saving' | 'failed';
    captureMessage?: string;
  };
  pendingPhoto?: PhotoView;
  endingPhoto?: PhotoView;
  canSendLetter: boolean;
  sentLetter: boolean;
  /** Session-only request from a real mailbox interaction; never itself sends a letter. */
  mailRequest?: number;
  /** Normalized map location and the world yaw for an ordinary forward step. */
  playerMap?: MapPoint & { heading: number };
  navigation?: NavigationView;
  saveStatus?: 'saving' | 'saved' | 'failed';
  saveMessage?: string;
  elapsedMinutes?: number;
  cinematic?: { title?: string; subtitle?: string; progress?: number };
  toast?: { id: string | number; title: string; message?: string; kind?: 'discovery' | 'success' | 'info' | 'error' };
}

export interface PresentationCallbacks {
  onAction(action: PresentationAction, payload?: unknown): void;
  /** Fire in the original trusted user event to satisfy browser audio activation. */
  onUserGesture?(): void;
  onSettingChange?(key: keyof SettingsView, value: SettingsView[keyof SettingsView]): void;
  /** True while a modal owns keyboard/mouse. A compositor callback, not gameplay mutation. */
  onModalChange?(open: boolean): void;
  /** Last modal has been removed and play is visible. Host focuses its current canvas.
   * Never emitted while another modal remains, during ordinary renders, or on destroy. */
  onReturnToGame?(): void;
  /** Pointer activation of a nonmodal tool, or Escape from its keyboard controls.
   * Host clears producer input and focuses its canvas; never pauses/resumes gameplay. */
  onRequestGameFocus?(): void;
}

export interface Presentation {
  render(view: PresentationViewModel): void;
  flash(): void;
  destroy(): void;
}

export const DEFAULT_SETTINGS: SettingsView = {
  masterVolume: 0.72, musicVolume: 0.52, ambienceVolume: 0.7, effectsVolume: 0.78,
  sensitivity: 1, quality: 'high', reducedMotion: false,
};

export const DEFAULT_DISCOVERIES: DiscoveryView[] = [
  { id: 'hidden-trail', title: '树影里的小路', description: '地图没有画出的地方，也许藏着最好的风景。', found: false, icon: 'trail' },
  { id: 'old-stamp', title: '旧日的邮戳', description: '小小一枚印记，曾经走过很远的路。', found: false, icon: 'stamp' },
  { id: 'lost-postcard', title: '没有寄出的卡片', description: '纸角已经泛黄，写信的人仍在这里等风。', found: false, icon: 'letter' },
  { id: 'sunset-seat', title: '山谷的另一面', description: '换一个位置，熟悉的山也会变得陌生。', found: false, icon: 'mountain' },
  { id: 'wind-song', title: '林间的合奏', description: '停下来听一会儿。风也有自己的旋律。', found: false, icon: 'sound' },
  { id: 'last-letter', title: '院子里的短笺', description: '有些话很短，却值得带回去。', found: false, icon: 'letter' },
];

export function initialPresentationView(): PresentationViewModel {
  return {
    screen: 'menu', hasSave: false, area: 'post', areaName: '山口旧邮局',
    objective: '让今天的风景，成为一封来信。', completed: { forest: false, town: false },
    discoveries: DEFAULT_DISCOVERIES.map(d => ({ ...d })), memories: [], album: [], film: [], settings: { ...DEFAULT_SETTINGS },
    camera: { active: false, alignment: 0, ready: false }, canSendLetter: false, sentLetter: false,
  };
}
