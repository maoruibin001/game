import { SIXTH_NAMES, sixthPortraitMarkup } from '../shanye-world/sixth-portrait';
import { flowerGear } from './flower-gear';
import { icon, MAP_ART, postcardArt, valleyLetterGuideArt } from './art';
import { ENDING_VIEWPORT_CSS, MEMORY_VIEW_CSS, PHOTO_ACCESSIBILITY_CSS, PRESENTATION_CSS, SHORT_VIEWPORT_CSS } from './style';
import { initialPresentationView } from './types';
import { replyLettersContent, endingReplyContent, postcardButton, distinctPhotos, replyCandidates, replyNotes, REPLY_LETTERS_CSS, type ReplyDrafts } from './reply-letters';
import { photographyTools, photographyGuidance, photoFramingChoices, portraitFramingStatus, PHOTOGRAPHY_TOOLS_CSS } from './photography-tools';
import { forecastDisplay, forecastMarkup, WEATHER_FORECAST_CSS } from './weather-forecast';
import { fieldClock, outingsContent, restContent, mapOutingOverlay, mapOutingCaption, FIELD_DIARY_CSS } from './field-diary';
import { mapMarkerTransform, navigationRouteArt, NAVIGATION_CSS, pocketMapContent } from './navigation-map';
import {DEFAULT_PHOTOGRAPHY,MAX_ZOOM,clampZoom,magnificationForFov,photographyFov} from '../shared/photography-contract';
import type { PhotographySettings, WeatherId } from '../shared/photography-contract';
import type { CardId, JournalTab, MemoryView, PhotoView, Presentation, PresentationAction, PresentationCallbacks, PresentationViewModel, SettingsView } from './types';

const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, Number.isFinite(n) ? n : a));
const cardText = {
  forest: { number: '01', title: '风铃与风车的合影', place: '风来林地', copy: '在风来林地，让近处风铃和远处风车同框。重现旧卡，会让风车再转起来。', done: '风车又开始转了。往日的回声，沿着风铃回到了山谷。' },
  town: { number: '02', title: '门里的山，才是归处', place: '石巷旧镇', copy: '找到木屏旁系红绳的绞盘，走近后按 E 转动摇柄。再从石拱外望向双峰，把红邮筒留在画面下方。', done: '木桥重新落下，院子亮起了灯。山镇又多了一条回家的路。' },
};

/** UI only. Attach to the Engine-owned frontend uiRoot; all gameplay remains in the Engine. */
export function createPresentation(uiRoot: HTMLElement, callbacks: PresentationCallbacks): Presentation {
  const doc = uiRoot.ownerDocument;
  const win = doc.defaultView;
  const root = doc.createElement('div');
  root.className = 'sy-ui';
  root.dataset.syPresentation = '';
  root.setAttribute('aria-label', '拍一卷山色');
  root.innerHTML = `<style>${PRESENTATION_CSS}${PHOTO_ACCESSIBILITY_CSS}${SHORT_VIEWPORT_CSS}${ENDING_VIEWPORT_CSS}${MEMORY_VIEW_CSS}${PHOTOGRAPHY_TOOLS_CSS}${WEATHER_FORECAST_CSS}${FIELD_DIARY_CSS}${REPLY_LETTERS_CSS}${NAVIGATION_CSS}</style><div data-layer="hud"></div><div data-layer="camera"></div><div data-layer="tools"></div><label class="sy-lens-zoom" data-layer="zoom" hidden><span>变焦</span><input type="range" min="1" max="${MAX_ZOOM}" step="0.1" value="1" data-photo-zoom aria-label="相机变焦倍率" title="拖动或滚轮调节倍率"><output>1.0×</output></label><div data-layer="forecast"></div><div data-layer="diary"></div><div data-layer="pocket-map" hidden><aside class="sy-pocket-map" aria-label="随身地图"><button type="button" data-action="pocket-map-toggle" aria-expanded="true" aria-label="收起随身地图"><span>随身地图</span><span>收起</span></button><div class="sy-pocket-body"></div></aside></div><div data-layer="modal"></div><div data-layer="cinematic"></div><div data-layer="toast" aria-live="polite" aria-atomic="true"></div><div class="sy-flash" aria-hidden="true"></div>`;
  uiRoot.appendChild(root);
  const layer = (name: string) => root.querySelector<HTMLElement>(`[data-layer="${name}"]`)!;
  const hud = layer('hud'), camera = layer('camera'), modal = layer('modal'), cinematic = layer('cinematic'), toast = layer('toast');
  const toolsLayer = layer('tools');
  const zoomLayer=layer('zoom'),zoomInput=zoomLayer.querySelector('input')!,zoomOutput=zoomLayer.querySelector('output')!;
  let previousZoom=-1,requestedZoom:number|undefined;
  const forecastLayer = layer('forecast');
  const diaryLayer = layer('diary');
  const pocketLayer = layer('pocket-map');
  const pocket = pocketLayer.querySelector<HTMLElement>('aside')!;
  const pocketToggle = pocket.querySelector('button')!;
  const pocketBody = pocket.querySelector<HTMLElement>('.sy-pocket-body')!;
  const pocketGuide = doc.createElement('div');
  pocketGuide.className = 'sy-pocket-guide';
  pocketGuide.setAttribute('role', 'status');
  pocketGuide.textContent = '沿小地图上的亮线走';
  pocketGuide.hidden = true;
  pocket.appendChild(pocketGuide);
  const flashLayer = root.querySelector<HTMLElement>('.sy-flash')!;
  let view = initialPresentationView();
  let destroyed = false, modalOpen = false, settingsOpen = false, controlsOpen = false, restartConfirm = false;
  let firstFilmSeen = false;
  const albumPageSize = 8;
  const albumPageCount = () => Math.max(1, Math.ceil(view.album.length / albumPageSize));
  let tab: JournalTab = 'letters', albumPage = 0, selectedPhoto = '', referenceOpen = true;
  let selectedMemory = '', memoryPhotoPicker = false, memoryReplacementId = '';
  let photoCollection: 'album' | 'film' = 'album', largePhoto = false, deleteFilmConfirm = false;
  let weatherOpen = false, photoToolsOpen = false, framePreview = false, toolsKey = '', sessionKey = '';
  let outingsOpen = false, restOpen = false, lastRestRequest = 0, diaryKey = '';
  let mailConfirmOpen = false, lastMailRequest = 0;
  let forecastOpen = false, forecastKey = '';
  let pointerInput = false;
  let pocketKey = '', requestedStoryDefault = false, scenicListOpen = false;
  let pendingOutingGuide = false, outingGuideShown = false, outingMapForcedOpen = false;
  let outingGuideTimer: ReturnType<typeof setTimeout> | undefined;
  let photoReplyContext: CardId | 'final' | undefined;
  const replyDrafts: ReplyDrafts = {}, pendingReplies = new Set<CardId | 'final'>();
  let hudKey = '', cameraKey = '', modalKey = '', cinematicKey = '', lastToast: string | number | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined, flashTimer: ReturnType<typeof setTimeout> | undefined;

  const action = (name: PresentationAction, payload?: unknown) => { if (!destroyed) callbacks.onAction(name, payload); };
  const button = (name: string, text: string, variant = '', ico?: string, attrs = '') => `<button type="button" class="sy-button ${variant}" data-action="${esc(name)}" ${attrs}>${ico ? icon(ico, 18) : ''}<span>${esc(text)}</span></button>`;
  const closeButton = (label = '收起') => `<button type="button" class="sy-close" data-action="close" aria-label="${label}" title="${label} · Esc">${icon('close', 20)}</button>`;
  const heading = (eyebrow: string, title: string) => `<div class="sy-modal-head"><div><div class="sy-eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2></div>${closeButton()}</div>`;
  const wrap = (content: string, className = '', label = '旅行册') => `<div class="sy-overlay"><section class="sy-modal ${className}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><div class="sy-modal-inner">${content}</div></section></div>`;
  function endOutingGuide() {
    if (outingGuideTimer === undefined) return;
    clearTimeout(outingGuideTimer);
    outingGuideTimer = undefined;
    delete pocket.dataset.guide;
    pocketGuide.hidden = true;
  }
  function safeImage(url?: string): string | undefined {
    if (!url) return undefined;
    if (/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(url)) return url;
    try {
      const parsed = new URL(url, doc.baseURI);
      const origin = new URL(doc.baseURI).origin;
      if (parsed.protocol === 'blob:' && parsed.origin === origin) return parsed.href;
      if (/^https?:$/.test(parsed.protocol) && parsed.origin === origin) return parsed.href;
    } catch { /* Bad image URLs render an explicit unavailable-photo placeholder. */ }
    return undefined;
  }
  function photoArt(photo?: PhotoView) {
    const url = safeImage(photo?.imageUrl);
    return url ? `<img src="${esc(url)}" alt="${esc(photo?.title ?? '旅途照片')}" decoding="async">` : `<div class="sy-photo-unavailable">${icon('camera', 30)}<span>照片还未显影</span><small>请稍等片刻，或回到风景里再拍一次。</small></div>`;
  }
  function tile(photo: PhotoView, command = 'view-photo', selection = selectedPhoto) {
    return `<button type="button" class="sy-photo-tile${selection === photo.id ? ' selected' : ''}" data-action="${command}" data-id="${esc(photo.id)}" ${command === 'choose-opening-photo' ? `aria-pressed="${selection === photo.id}"` : ''} aria-label="${esc(photo.title)}，${esc(photo.location)}"><div class="sy-photo-thumb">${photoArt(photo)}</div>${photo.isEnding || view.endingPhoto?.id === photo.id ? '<span class="sy-photo-star" title="寄给远方的照片">✦</span>' : ''}<p>${esc(photo.title)}</p><small>${esc(photo.location)}</small></button>`;
  }
  const memoryStatus = (memory: MemoryView) => ({ unseen: '一封还没读完的信', tracing: '沿着信里的线索', ready: '等一张今天的风景', completed: '来信已完整' }[memory.status]);
  function memorySteps(memory: MemoryView) {
    if (memory.status === 'unseen') return '<p class="sy-small-note">沿路遇见的只言片语，也许会连成一封信。</p>';
    return `<ol class="sy-memory-steps" aria-label="来信线索"><li data-found="${memory.clueFound}">${icon(memory.clueFound ? 'check' : 'letter', 15)}旧镇残信</li><li data-found="${memory.seatFound}">${icon(memory.seatFound ? 'check' : 'mountain', 15)}山脊长椅</li><li data-found="${memory.status === 'completed'}">${icon(memory.status === 'completed' ? 'check' : 'camera', 15)}同框的风景</li></ol>`;
  }
  function memoryCard(memory: MemoryView) {
    const complete = memory.status === 'completed';
    return `<article class="sy-memory-card" data-memory-id="${esc(memory.id)}" data-memory-status="${memory.status}"><div class="sy-memory-card-mark">${complete ? photoArt(memory.photo) : `<div class="sy-memory-fold">${icon('letter', 34)}<span>沿信寻景</span></div>`}</div><div class="sy-memory-card-copy"><div class="sy-card-number">一封可选的来信 · ${memoryStatus(memory)}</div><h3>${esc(memory.title)}</h3><p>${esc(memory.hint)}</p>${memorySteps(memory)}${button('view-memory', complete ? '翻开完整来信' : '看看信里的线索', 'text', 'letter', `data-memory="${esc(memory.id)}"`)}</div></article>`;
  }
  function memoryContent(memory: MemoryView) {
    const complete = memory.status === 'completed';
    const replacements = memory.replacementPhotos.filter(photo => photo.id !== memory.photo?.id && safeImage(photo.imageUrl));
    const chosen = replacements.find(photo => photo.id === memoryReplacementId);
    const paragraphs = complete && memory.letter ? memory.letter.split(/\n\s*\n/).filter(Boolean).map(text => `<p>${esc(text)}</p>`).join('') : `<p>${esc(memory.hint)}</p>`;
    const picture = complete ? `<div class="sy-photo-print sy-memory-photo"><div class="sy-photo-print-image">${photoArt(memory.photo)}</div><div class="sy-photo-print-label">${esc(memory.photo?.location ?? '山脊的风景')} · 你留下的这一刻</div></div>` : `<div class="sy-memory-clue-sheet"><div class="sy-eyebrow">残信里的约定</div>${memory.clueFound || memory.seatFound ? valleyLetterGuideArt() : `<div class="sy-memory-fold">${icon('letter', 54)}<span>路边的小事，也会连成一封信。</span></div>`}<p>${memory.clueFound || memory.seatFound ? '让风车和小镇红屋顶留在同一张照片里。<br>示意图只作提示，不限左右顺序。' : '不必特意寻找，先沿着喜欢的小路走走。'}</p></div>`;
    const picker = complete && memoryPhotoPicker ? `<div class="sy-memory-picker"><h3 class="sy-section-title">换一张，记住此刻的山谷</h3><p class="sy-small-note">这里只列出你仍保留的合格实拍。挑选后确认，原照片才会从这封信中换下。</p>${replacements.length ? `<div class="sy-album">${replacements.map(photo => tile(photo, 'pick-memory-photo', memoryReplacementId)).join('')}</div><div class="sy-button-row">${button('cancel-memory-replace', '保留原来的照片', 'text')}${button('replace-memory-photo', chosen ? `用「${chosen.title}」更新来信` : '先选一张照片', 'primary', 'camera', chosen ? `data-id="${esc(chosen.id)}" data-memory="${esc(memory.id)}"` : 'disabled')}</div>` : `<p class="sy-memory-empty">暂时没有另一张合格照片。回到长椅附近，再拍一张风车与红屋顶同框的风景吧。</p>${button('cancel-memory-replace', '回到来信', 'text')}`}</div>` : '';
    return wrap(`${heading('A LETTER FOUND ALONG THE WAY · 沿信寻景', memory.title)}<div class="sy-memory-detail"><div>${picture}</div><div class="sy-memory-letter"><div class="sy-eyebrow">${memoryStatus(memory)}</div><div class="sy-memory-letter-body">${paragraphs}</div>${memorySteps(memory)}<p class="sy-small-note">${complete ? '这张照片会留在信里，相册换页或删除照片都不会带走它。' : '这是路上的另一封信，不影响两张旧卡片与最后的寄信。'}</p></div></div>${picker}<div class="sy-button-row">${complete && !memoryPhotoPicker ? button('choose-memory-photo', '换一张自己的照片', '', 'camera') : ''}${button('close-memory', '回到旅途拾遗', 'text', 'book')}</div>`, 'sy-memory-modal', '沿信寻景');
  }
  const allPhotos = () => distinctPhotos([...(view.fireworks ? [view.fireworks] : []),...(view.mountainLetter?.candidates ?? []), ...(view.mountainLetter?.photo ? [view.mountainLetter.photo] : []),...(view.replies?.items.flatMap(letter => [...letter.candidates, ...(letter.route?.slots.flatMap(s=>[...s.choices,...(s.photo?[s.photo]:[])]) ?? []), ...(letter.photo ? [letter.photo] : [])]) ?? []), ...(view.replies?.final.photo ? [view.replies.final.photo] : []), ...(view.endingPhoto ? [view.endingPhoto] : []), ...(view.memories?.flatMap(memory => [...memory.replacementPhotos, ...(memory.photo ? [memory.photo] : [])]) ?? []), ...view.album, ...(view.film ?? []), ...(view.pendingPhoto ? [view.pendingPhoto] : []), ...(view.outings?.slots.flatMap(spot => spot.photo ? [spot.photo] : []) ?? []), ...(view.outings?.tracked?.photo ? [view.outings.tracked.photo] : [])]);
  const findPhoto = (id: string) => allPhotos().find(photo => photo.id === id);
  const photoMetadata = (photo: PhotoView) => `<p class="sy-photo-metadata">${esc(photo.sceneDescription ?? '旧照片 · 未记录当时的天气与镜头')}<br>${photo.originalKey ? `${photo.width ?? '—'} × ${photo.height ?? '—'} 像素 · ${photo.originalState === 'ready' ? '正在查看原图' : photo.originalState === 'missing' ? '本机原图暂不可用' : '当前显示预览图'}` : '旧照片只有预览图，没有独立原图'}</p>`;
  const exportCaption = (photo: PhotoView) => {
    const letter = photoReplyContext === 'final' ? view.replies?.final : view.replies?.items.find(item => item.id === photoReplyContext);
    return letter?.photo?.id === photo.id ? { note: letter.note, title: letter.title } : { note: photo.caption ?? '', title: photo.title };
  };
  const exportButton = (photo: PhotoView) => `${photo.originalKey ? button('export-photo', '导出原图', '', 'arrow', `data-id="${esc(photo.id)}" ${photo.originalState === 'missing' ? 'disabled' : ''}`) : ''}${view.replies ? postcardButton(photo, exportCaption(photo).note, exportCaption(photo).title) : ''}`;
  function largePhotoContent(photo: PhotoView) {
    return wrap(`${heading('YOUR PHOTOGRAPH · 原来的这一刻', photo.title)}<div class="sy-large-photo-image">${photoArt(photo)}</div>${photoMetadata(photo)}<div class="sy-button-row">${exportButton(photo)}${button('close-large-photo', '回到照片', 'text', 'arrow')}</div>`, 'sy-large-photo', '照片大图');
  }
  const keys = () => `<div class="sy-key-guide"><div><span>移动并转身朝向行进方向</span><span><kbd>W A S D</kbd></span></div><div><span>转动视角（按住右键可平移）</span><span><kbd>左键/右键拖动</kbd><kbd>← →</kbd></span></div><div><span>沿路跑起来</span><span><kbd>Shift</kbd></span></div><div><span>走路时跳一下</span><span><kbd>Space</kbd></span></div><div><span>举起相机 · 取景时可慢走</span><span><kbd>C</kbd><kbd>Q</kbd></span></div><div><span>举机后按快门（不跳跃）</span><span><kbd>左键</kbd><kbd>F</kbd><kbd>Space</kbd></span></div><div><span>交谈与互动</span><span><kbd>E</kbd></span></div><div><span>翻开旅行册</span><span><kbd>J</kbd><kbd>Tab</kbd></span></div><div><span>地图 / 暂歇</span><span><kbd>M</kbd><kbd>Esc</kbd></span></div></div>`;
  function settingsContent() {
    const ranges: [keyof SettingsView, string, number, number, number][] = [
      ['masterVolume', '整段旅途的音量', 0, 1, .01], ['musicVolume', '音乐', 0, 1, .01],
      ['ambienceVolume', '山风与鸟鸣', 0, 1, .01], ['effectsVolume', '脚步与快门', 0, 1, .01], ['sensitivity', '视角转动速度', .3, 2, .05],
    ];
    return wrap(`${heading('PACK LIGHT · TRAVEL WELL', '设置')}<div class="sy-settings">${ranges.map(([key, label, min, max, step]) => `<div class="sy-setting"><label for="sy-${key}">${label}<output data-output="${key}">${key === 'sensitivity' ? Number(view.settings[key]).toFixed(2) + ' ×' : Math.round(Number(view.settings[key]) * 100) + '%'}</output></label><input id="sy-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${view.settings[key]}" data-setting="${key}"></div>`).join('')}<div class="sy-setting"><label for="sy-quality">风景的细腻程度</label><select id="sy-quality" data-setting="quality"><option value="high" ${view.settings.quality === 'high' ? 'selected' : ''}>精致 · 完整光影</option><option value="balanced" ${view.settings.quality === 'balanced' ? 'selected' : ''}>均衡 · 轻装出发</option><option value="low" ${view.settings.quality === 'low' ? 'selected' : ''}>轻盈 · 流畅优先</option></select></div><div class="sy-setting toggle"><label for="sy-motion">减少界面动效</label><input id="sy-motion" type="checkbox" data-setting="reducedMotion" ${view.settings.reducedMotion ? 'checked' : ''}></div></div><div class="sy-rule"></div><p class="sy-small-note">设置会随旅程一起保存。第一次出发时，声音会在你点击后响起。</p><div class="sy-button-row">${button('fullscreen', '全屏看风景', '', 'fullscreen')}${button('close', '装好，继续走', 'primary', 'arrow')}</div>`, '', '旅途设置');
  }
  let openingPhotoChoice = '', openingFilm = false;
  function mountainLetterContent(letter: NonNullable<PresentationViewModel['mountainLetter']>) {
    const available = letter.candidates.filter(photo => photo.originalState !== 'missing');
    if (!letter.photo && !available.some(photo => photo.id === openingPhotoChoice)) {
      const preferred = [...available].reverse().reduce<typeof available[number] | undefined>(
        (best, photo) => !best || (photo.mountains ?? 0) > (best.mountains ?? 0) ? photo : best, undefined);
      openingPhotoChoice = preferred?.id ?? '';
    }
    const choice = letter.candidates.find(photo => photo.id === openingPhotoChoice);
    const sendLabel = letter.photo ? '改寄这张' : choice?.mountains === 2 ? '两座都寄给阿禾'
      : choice?.mountains === 1 ? '把这座山寄给阿禾' : '就寄这张，看看阿禾怎么回';
    const missed = !letter.photo && available.length > 0 && available.every(photo => !photo.mountains);
    const options = letter.candidates.map(photo => tile({ ...photo, title: photo.result, location: photo.title }, 'choose-opening-photo', openingPhotoChoice)).join('');
    const attachment = letter.photo ? `<div class="sy-button-row">${button('view-photo','查看寄出的照片','','camera',`data-id="${esc(letter.photo.id)}"`)}${exportButton(letter.photo)}</div>` : '';
    const request = letter.request ? `<section class="sy-opening-request">
      <h4>阿公那张旧合影</h4><div class="sy-opening-pair">
        ${letter.photo ? `<figure>${photoArt(letter.photo)}<figcaption>你寄来的山色</figcaption></figure>` : ''}
        <figure>${sixthPortraitMarkup(false)}<figcaption>阿禾留下的旧照片</figcaption></figure>
      </div><details class="sy-opening-back" open><summary>旧照背面</summary>${(letter.oldPhotoBack ?? []).map(line=>`<p>${esc(line)}</p>`).join('')}</details>
      <p>${esc(letter.request)}</p><div class="sy-button-row">${letter.canChooseRidge ? button('choose-story-route','沿东岭古道找旧窗','primary','trail','data-route="ridge"') : ''}${button('open-map','在地图上看东岭','text','map','data-letter-route="ridge-arrow"')}</div>
    </section>` : '';
    const picker = options ? `<div class="sy-album" role="group" aria-label="选一张山色寄给阿禾">${options}</div>
      ${missed ? '<p class="sy-opening-tip">不完美也能寄，阿禾会回信。想装进山，就让山尖落在信封开口上沿下面、两只纸角之间。偏左偏右就横移（A/D），高了低了就前后挪一步。</p>' : ''}
      <div class="sy-button-row">${button('send-opening-photo', sendLabel, 'primary', 'letter',
        choice && choice.id !== letter.photo?.id && choice.originalState !== 'missing' ? `data-id="${esc(choice.id)}"` : 'disabled')}${choice && choice.id !== letter.photo?.id ? exportButton(choice) : ''}</div>`
      : '<p class="sy-small-note">举起相机，让信封和山都入画，再按快门。</p>';
    return `<article class="sy-letter-card sy-opening-letter"><h3>${esc(letter.title)}</h3><p>${esc(letter.body)}</p>
      ${letter.response ? `<blockquote class="sy-reply-note" aria-label="阿禾的回话">${esc(letter.response)}</blockquote>` : ''}${request}${attachment}${picker}
      ${letter.initial ? `<div class="sy-button-row">${button('close', '回去拍山', '', 'camera')}${button('skip-opening-photo', '先上路', 'text', 'arrow')}</div>` : ''}</article>`;
  }
  function reunitedWindow(photo: PhotoView) {
    return `<section class="sy-letter-card sy-old-window-receipt"><h3>同一扇窗，今天的山门</h3>
      <div class="sy-opening-pair"><figure>${sixthPortraitMarkup(false)}<figcaption>阿公当年留下的一角</figcaption></figure>
      <figure>${photoArt(photo)}<figcaption>你从老窗拍下的山门屋脊</figcaption></figure></div>
      <p>「是这扇窗。你看，窗格、横梁和背面记的那道屋檐，一处都没错。」</p>
      <p>客堂把第一盒金柳交给你。阿禾在信下又添一行「阿公说，你挑个喜欢的地方放。他看见金柳，就从老窗边把那盏灯挑过屋脊。」</p>
      <div class="sy-button-row">${button('view-photo','查看今天的原照','','camera',`data-id="${esc(photo.id)}"`)}${exportButton(photo)}</div>
    </section>`;
  }
  function commissionLetters() {
    const round = view.commissions;
    if (!round) return '';
    const entries = round.entries.map(item => {
      const photos = item.photos.map(photo => photo.originalState === 'missing' ? '' :
        `<div class="sy-commission-choice">${photoArt(photo)}${button('submit-commission',`交这张 · ${photo.title}`,'primary','letter',
          `data-round="${round.round}" data-site="${esc(item.site ?? '')}" data-id="${esc(photo.id)}"`)}</div>`).join('');
      const point = item.site && !item.done ? button('navigate-commission','在地图上看','','map',`data-site="${esc(item.site)}"`) : '';
      return `<article class="sy-letter-card"><h4>${esc(item.title)}</h4><p>${item.done ? '已收件' : esc(item.hint)}</p>${point}
        ${photos ? `<div class="sy-commission-photos">${photos}</div>` : ''}</article>`;
    }).join('');
    return `<section class="sy-commission-round" data-round="${round.round}" aria-label="摄影委托">
      <h3>第 ${round.round} 轮摄影委托 · ${round.entries.filter(item => item.done).length}/3</h3>
      ${round.previous ? `<p class="sy-small-note">${esc(round.previous)}</p>` : ''}
      <div class="sy-commission-grid">${entries}</div>
      ${round.round > 1 ? view.creativeMode ? '<p class="sy-small-note">回到旅途模式后可交照片和领花盒。</p>'
        : round.canClaim ? button('claim-commission-round',`收下${round.reward}，打开下一轮`,'primary','letter',`data-round="${round.round}"`)
        : `<p class="sy-small-note">三处照片都寄到后，可领一盒${esc(round.reward)}。</p>` : ''}
    </section>`;
  }
  function journalContent() {
    const found = view.discoveries.filter(d => d.found).length;
    const nav = `<div class="sy-tabs" role="tablist" aria-label="旅行册章节">${([['letters', view.replies ? '来信' : '两张旧卡片'], ['discoveries', found ? `沿途拾遗 ${found}` : '沿途未读的风景'], ['album', `留住的风景 ${view.album.length}/12`], ['gear', '行囊']] as const).map(([id, label]) => `<button type="button" class="sy-tab${tab === id ? ' active' : ''}" role="tab" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'letters') body = `<div class="sy-journal-spread">${(['forest', 'town'] as CardId[]).map(id => { const c = cardText[id]; return `<article class="sy-letter-card"><div class="sy-letter-art">${postcardArt(id, view.completed[id])}<div class="sy-stamp ${view.completed[id] ? '' : 'muted'}"><span>${view.completed[id] ? '风景已回信' : '等待回声'}</span><small>${c.place}</small></div></div><div class="sy-card-number">POSTCARD ${c.number} / ${c.place}</div><h3>${c.title}</h3><p>${view.completed[id] ? c.done : c.copy}</p></article>`; }).join('')}</div>`;
    if (tab === 'letters' && view.replies) body = replyLettersContent(view, replyDrafts, allPhotos().filter(photo => Boolean(safeImage(photo.imageUrl))), photoArt, id => postcardArt(id));
    if (tab === 'letters' && view.mountainLetter) {
      const letter = view.mountainLetter;
      if (letter.initial || letter.request || letter.candidates.length) {
        body = mountainLetterContent(letter) + (letter.initial ? '' : body);
      }
    }
    if (tab === 'letters' && view.fireworks) body = reunitedWindow(view.fireworks) + body;
    if (tab === 'letters') body = commissionLetters() + body;
    if (tab === 'gear') {
      const night = view.night;
      const fireworkButton = (kind:'gold'|'scarlet', name:string, slot:{available:boolean;placed:boolean}) => {
        if (!slot.available || night?.playing) return '';
        const operation = slot.placed ? 'retrieve' : 'take';
        const attrs = night?.open || slot.placed ? `data-operation="${operation}" data-firework="${kind}"` : 'disabled';
        return button('night-gear', `${slot.placed?'收回':'取出'}${name}`, '', undefined, attrs);
      };
      const gold = view.fireworks && night ? `<article class="sy-letter-card"><h3>金柳</h3><p>${
        night.gold.placed ? '已放在地上。靠近花盒可收回重摆。'
          : night.gold.borrowed ? '阿禾的补拍留样。和朱红布置在同一场地。'
            : night.spent ? night.goldInvitation ? '已收入花谱。到镇外布置点，可请阿禾留一盒金柳。' : '已收入花谱。这一盒已经燃放。'
              : '花谱已记下。18:40 后可去镇外晒谷场或半山松台放花。'
        }</p><div class="sy-button-row">${fireworkButton('gold','金柳',night.gold)}${night.inviteAtThisSite && !night.playing
          ? button('night-gear','请阿禾留一盒金柳','',undefined,'data-operation="invite-gold"') : ''}${
          button('view-photo','查看交件原照','text','camera',`data-id="${esc(view.fireworks.id)}"`)
        }</div></article>` : '<article class="sy-letter-card"><h3>金柳</h3><p>白天到禅院客堂交照领取。</p></article>';
      const scarlet = night?.scarlet.claimed ? `<article class="sy-letter-card"><h3>朱红</h3><p>${
        night.scarlet.placed ? '已放在地上。靠近花盒可收回重摆。' : night.repriseActive ? '阿禾的补拍留样，可与金柳合放。' : night.scarlet.spent ? '已收入花谱。这一盒已经燃放。'
          : '花谱已记下。与金柳放在同一场地，两盒之间留出一步。'
        }</p><div class="sy-button-row">${fireworkButton('scarlet','朱红',night.scarlet)}</div></article>`
        : `<article class="sy-letter-card"><h3>朱红</h3><p>${night?.fishLetter==='delivered'
          ? '夜信已送到。领过金柳后，回缺角月牙的修灯铺领朱红。' : '入夜后，把客栈旁的《鱼灯夜信》送给修灯人。'}</p></article>`;
      const flowers = [view.fireworks ? '金柳' : '', night?.scarlet.claimed ? '朱红' : ''].filter(Boolean);
      const register = flowers.length ? `<article class="sy-letter-card"><h3>花谱</h3><p>${flowers.join(' · ')}</p></article>` : '';
      const replay = night?.repriseHere && !night.playing
        ? `<article class="sy-letter-card"><h3>再放一场</h3><p>用阿禾留下的两盒，换个位置补拍。</p>${button('night-gear','请阿禾再放一场','primary',undefined,'data-operation="reprise"')}</article>` : '';
      const fireworks = flowerGear(view,photoArt) + (view.flowers?.party?'':replay + gold + scarlet + register);
      body = fireworks + `<article class="sy-letter-card"><h3>火把</h3><p>${night?.torch ? '照亮手边的山路，也能用来点烟花。' : '领到烟花后，闭院时可在山门或上院借火把。'}</p>${night?.torch ? button('night-gear',night.lit?'收起火把':'拿起火把','',undefined,'data-operation="torch"') : ''}</article>`;
    }
    if (tab === 'letters' && view.fireworks) body = `<article class="sy-letter-card"><h3>${view.night?.spent?'交件原照':'背包里的一盒烟花'}</h3><p>客堂收下了你的老窗照。这张照片已随交件存好。</p><div class="sy-button-row">${button('view-photo','查看交件原照','','camera',`data-id="${esc(view.fireworks.id)}"`)}</div></article>` + body;
    if (tab === 'discoveries') body = `${(view.memories ?? []).map(memoryCard).join('')}<div class="sy-discoveries">${view.discoveries.map((d, i) => `<article class="sy-discovery ${d.found ? '' : 'locked'}"><div class="sy-discovery-symbol">${icon(d.icon ?? (i % 2 ? 'letter' : 'trail'), 22)}</div><div><div class="sy-card-number">${String(i + 1).padStart(2, '0')} / ${d.found ? '已记入旅行册' : '留意路边的小事'}</div><h3>${esc(d.title)}</h3><p>${esc(d.description)}</p></div></article>`).join('')}</div><p class="sy-small-note" style="margin-top:20px">不必把每一个角落都走遍。遇见什么，就带走什么。</p>`;
    if (tab === 'album') {
      const page = photoCollection === 'film' ? [...(view.film ?? [])].reverse() : view.album.slice(albumPage * albumPageSize, (albumPage + 1) * albumPageSize);
      const collections = `<div class="sy-photo-collections" role="group" aria-label="照片收藏"><button type="button" data-action="photo-collection" data-collection="film" aria-pressed="${photoCollection === 'film'}">底片 ${view.film?.length ?? 0}/8</button><button type="button" data-action="photo-collection" data-collection="album" aria-pressed="${photoCollection === 'album'}">精选 ${view.album.length}/12</button></div>`;
      body = `${collections}${page.length ? `<div class="sy-album">${page.map(photo => tile(photo)).join('')}</div>` : `<div class="sy-film-empty">${photoCollection === 'film' ? '先拍一张喜欢的风景吧。快门之后，底片会留在这里。' : '从底片中选几张，装进这一本旅行册。'}</div>`}${photoCollection === 'album' ? `<div class="sy-button-row">${button('album-prev', '上一页', 'text', undefined, albumPage === 0 ? 'disabled' : '')}<span class="sy-small-note" style="align-self:center">${albumPage + 1} / ${albumPageCount()}</span>${button('album-next', '下一页', 'text', undefined, albumPage + 1 >= albumPageCount() ? 'disabled' : '')}</div>` : ''}<p class="sy-film-note">${photoCollection === 'film' ? '最近八张候选底片。继续拍摄会移除最早的底片；已收入精选、来信与回信的照片会独立保留。' : '最多珍藏十二张。挑一张寄给远方，也可以打开大图、导出原照片。'}</p>`;
    }
    const title = tab === 'album' ? (photoCollection === 'film' ? '摄影底片' : '精选照片') : '路上的来信';
    return wrap(`${heading('A FIELD JOURNAL · 山谷旅行手记', title)}${nav}${body}<div class="sy-journal-footer"><span>山风会记得，你曾经来过。</span><span>${tab === 'letters' ? view.replies ? '01 — 03' : '01 — 02' : tab === 'discoveries' ? '03 — 04' : '05 — 06'}</span></div>`, '', tab === 'album' ? title : '旅行册');
  }
  function photoReview(photo: PhotoView, pending: boolean) {
    const inFilm = view.film?.some(item => item.id === photo.id) ?? false;
    const kept = view.album.some(item => item.id === photo.id);
    const canKeep = (inFilm || pending) && !kept;
    const full = canKeep && view.album.length >= 12;
    const openingLetter = view.replies?.items.find(letter => letter.id === 'forest');
    const canReadOpening = photo.id === 'photo-1' && photo.location === '山口邮局' && openingLetter?.status === 'searching';
    const actions = `${canReadOpening ? button('open-replies', '读阿禾的来信 · J', 'primary', 'letter', 'data-opening-letter') : ''}${canKeep && !full ? button('save-photo', '收入精选', 'primary', 'book', `data-id="${esc(photo.id)}"`) : kept ? '<span class="sy-small-note">已收入精选</span>' : ''}${button('select-ending-photo', view.endingPhoto?.id === photo.id ? '已选作最后一张' : '作为最后一张', '', 'letter', `data-id="${esc(photo.id)}" ${view.sentLetter ? 'disabled' : ''}`)}${button('view-large-photo', '打开大图', 'text', 'camera')}${exportButton(photo)}${view.mountainLetter?.candidates.some(item => item.id === photo.id) || view.replies?.items.some(letter => replyCandidates(letter).some(item => item.id === photo.id)) ? button('open-replies', '去来信里选片', '', 'letter') : ''}${inFilm ? button('ask-delete-film', '移除这张底片', 'text') : ''}${pending ? button('discard-photo', '继续取景', 'text') : button('close-photo-detail', '回到照片册', 'text')}`;
    const removal = deleteFilmConfirm && inFilm ? `<div class="sy-delete-question"><p>只移除这张候选底片；精选、来信与回信中的独立照片会保留。</p><div class="sy-button-row">${button('cancel-delete-film', '先留着', 'text')}${button('delete-film-photo', '移除底片', 'rust', undefined, `data-id="${esc(photo.id)}"`)}</div></div>` : '';
    return wrap(`${heading('FROM YOUR JOURNEY · 留住的风景', photo.title)}<div class="sy-review-layout"><div class="sy-photo-print"><div class="sy-photo-print-image">${photoArt(photo)}</div><div class="sy-photo-print-label">${esc(photo.location)} · ${esc(photo.dateLabel ?? '拍一卷山色')}</div></div><div class="sy-review-copy"><div class="sy-eyebrow">${photo.card && photo.card !== 'free' ? '旧卡片里的回声' : '一张属于你的风景'}</div><h3>${kept ? '这一刻，已经珍藏。' : '把喜欢的，留下来。'}</h3>${photo.caption ? `<p class="sy-reply-note">“${esc(photo.caption)}”</p>` : ''}${photoMetadata(photo)}${view.replies?.items.filter(letter => replyCandidates(letter).some(item => item.id === photo.id)).map(letter => `<p class="sy-reply-match">这张可以回答《${esc(letter.title)}》。选片由你决定，摄影日程不影响这封回信。</p>`).join('') ?? ''}<div class="sy-button-row">${actions}</div>${removal}</div></div>${full ? `<div class="sy-review-replace"><div class="sy-section-title">精选已满，选择一张换下</div><p class="sy-small-note">只替换精选位置；已经夹进来信的独立照片会保留。</p><div class="sy-album">${view.album.map(item => tile(item, 'replace-photo')).join('')}</div></div>` : ''}`, 'sy-review', pending ? '照片确认' : '照片详情');
  }
  function endingContent() {
    if (view.replies) return endingReplyContent(view, photoArt);
    return `<div class="sy-overlay sy-ending"><section class="sy-ending-sheet" role="dialog" aria-modal="true" aria-label="寄给远方的信" tabindex="-1"><div class="sy-ending-top"><div><div class="sy-eyebrow">MOUNTAIN PHOTOGRAPHY</div><h2>${view.sentLetter ? '山野已经回信' : '把风景，寄给远方'}</h2></div><div class="sy-stamp"><span>${view.sentLetter ? '已经寄出' : '山野邮局'}</span><small>见山 · 见风</small></div></div><div class="sy-ending-content"><div class="sy-ending-picture"><div>${photoArt(view.endingPhoto)}</div><p>${esc(view.endingPhoto?.location ?? '这一程的山与风')}</p></div><div class="sy-ending-letter"><div><p class="greeting">致，远方的你：</p><p class="body">今天，我走过一片会唱歌的树林，<br>看见风车慢慢转了起来。<br>山镇的木桥放下了，窗里亮起灯。<br><br>我把最想记住的一刻，放在信的背面。<br>等你有空，我们再一起来。</p><p class="signature">一个还想多走一会儿的人</p></div><div class="sy-ending-address">寄往：你心里想到的那个地方</div></div></div><div class="sy-ending-footer"><p>两枚回声邮戳 · ${view.discoveries.filter(d => d.found).length} 处旅途拾遗 · ${view.album.length} 张珍藏</p><div class="sy-button-row">${!view.sentLetter ? button('send-letter', '盖上邮戳，寄出', 'rust', 'stamp', view.canSendLetter && view.endingPhoto ? '' : 'disabled') : ''}${button('keep-exploring', view.sentLetter ? '再走一会儿' : '再选一张风景', view.sentLetter ? 'primary' : '', 'trail')}</div></div></section></div>`;
  }
  function sixthContent(sixth: NonNullable<PresentationViewModel['sixth']>) {
    const atRoom = sixth.panel === 'room', atWindow = sixth.panel === 'window';
    const full = atRoom ? sixth.displayed : atWindow ? sixth.displayed : sixth.revealed;
    const names = atRoom && sixth.displayed ? `<p class="sy-sixth-names">${SIXTH_NAMES.join('　')}</p>` : '';
    const story = atRoom
      ? sixth.displayed ? '阿公按完快门刚赶回来，只来得及扶住椅背。小阿禾把身旁的位置让给了他。今天，拍照的人也可以站进去。' : '把放大的底片和椅背对上，露在外面的袖口正好接上那只手。'
      : atWindow ? '相框上有一枚缺瓣梅花印。后巷晒台上如果有同样的印，可以找找。'
        : sixth.revealed ? '遮幅外露出一段袖口，还有一处让开的座位。从放大台沿后巷向东，绕到木屋东面。带印样进门，看看那张空椅。'
          : sixth.tin ? '放大台右边还有一片可以拉开的遮幅。' : '需要一张底片。后窗的晒台上放着一个铁皮匣。';
    const controls = atRoom && !sixth.displayed
      ? button('sixth','把印样对上椅背','primary',undefined,'data-operation="display"')
      : sixth.panel === 'enlarger' && sixth.tin && !sixth.revealed
        ? button('sixth','拉开右边遮幅','primary',undefined,'data-operation="reveal"') : '';
    const self = atRoom && sixth.displayed ? `<section class="sy-sixth-clip"><h3>留给拍照人的空位</h3>
      ${sixth.portrait ? photoArt(sixth.portrait) : '<p>站到椅子旁那块方木上，举机用广角选「帮我拍」。让自己和墙上的旧合影留在同一张照片里。</p>'}
      ${sixth.choices.length ? `<label class="sy-flower-select"><span>把今天的一张留在这里</span>
        <select data-sixth-portrait><option value="">选择一张原片</option>${sixth.choices.map(photo =>
          `<option value="${esc(photo.id)}"${photo.id===sixth.portrait?.id?' selected':''}>${esc(photo.title)}</option>`).join('')}</select></label>` : ''}</section>` : '';
    const title = atRoom ? sixth.displayed ? '第六个人' : '照相铺内室' : atWindow ? '橱窗里的老照片' : '照相铺的放大台';
    return wrap(`<div class="sy-modal-head"><h2>${title}</h2>${closeButton()}</div>${atWindow||atRoom||sixth.tin?sixthPortraitMarkup(full, !atRoom)+names:''}<p>${story}</p>
      <div class="sy-button-row">${controls}</div>${self}`, 'sy-sixth',title);
  }
  function makeModal() {
    if(view.sixth&&view.screen==='journal')return sixthContent(view.sixth);
    if (restartConfirm) return wrap(`${heading('A NEW PAGE', '重新出发？')}<p class="sy-pause-description">这会把这台设备上的旧旅程收起，重新领取两张卡片。旧邮戳与相册将不会保留。</p><div class="sy-button-row">${button('cancel-restart', '留在这一程')}${button('confirm-restart', '重新出发', 'rust')}</div>`, 'sy-pause', '重新出发确认');
    if (settingsOpen) return settingsContent();
    if (controlsOpen) return wrap(`${heading('WALK · LOOK · REMEMBER', '走路不用着急')}${keys()}<div class="sy-rule"></div><p class="sy-small-note">举起相机后，鼠标慢慢移动视角。旧卡片只是一点提示；喜欢的风景，都可以拍下来。</p><div class="sy-button-row">${button('close', '记住了', 'primary')}</div>`, '', '键鼠操作');
    if (mailConfirmOpen) return endingContent();
    if (restOpen) return wrap(`${heading('REST ALONG THE WAY', '等一阵天色')}${restContent(view)}<div class="sy-button-row">${button('close', '先继续走', 'text')}</div>`, 'sy-pause', '歇脚候时');
    if (outingsOpen) return wrap(`${heading('TODAY IN THE VALLEY', `第 ${view.outings?.day ?? view.dayClock?.day ?? 1} 天 · 摄影日程`)}${outingsContent(view, photoArt)}`, 'sy-outing-modal', '摄影日程');
    if (view.screen === 'menu') return `<section class="sy-menu" role="dialog" aria-modal="true" aria-label="拍一卷山色开始菜单" tabindex="-1"><div class="sy-menu-content"><div class="sy-menu-kicker">一段不用赶路的旅程</div><h1 class="sy-title">拍一卷山色</h1><div class="sy-title-en">MOUNTAIN PHOTOGRAPHY</div><p class="sy-menu-description">${view.replies ? '“能不能寄我一座山？”<br>背上相机，替阿禾试试。' : '找回两张旧卡片里的风景，<br>再寄出一张，属于你自己的。'}</p><div class="sy-menu-buttons">${button(view.hasSave ? 'continue' : 'start', view.hasSave ? '接着上一次的路' : '背上行囊，出发', 'primary', 'arrow')}${view.hasSave ? button('restart', '重新出发', 'secondary') : ''}${button('controls', '看看怎么走', 'text')}</div>${view.hasSave ? '<p class="sy-local-save">旅程保存在本机浏览器。请用同一浏览器和访问地址继续。</p>' : ''}</div><div class="sy-menu-foot"><span>${view.replies ? '一封来信，从山口出发。' : '两张旧卡片，一整个山谷。'}</span><div><button type="button" data-action="settings">声音与画质</button><button type="button" data-action="fullscreen">全屏</button></div></div></section>`;
    if (view.screen === 'paused') return wrap(`${heading('TAKE A BREATH', '在这里，歇一歇')}<p class="sy-pause-description">山风还在吹。<br>这条路，等你准备好再继续。</p><div class="sy-pause-buttons">${button('resume', '继续走', 'primary', 'arrow')}${button('open-journal', '翻翻旅行册', '', 'book')}${button('open-map', '看看地图', '', 'map')}${button('recover-path', '回到最近小路', '', 'arrow', 'title="被地形困住时回到可走的小路，照片与进度保留"')}</div><div class="sy-pause-actions">${button('settings', '声音与画质', 'text', 'settings')}${button('controls', '键鼠操作', 'text')}${button('back-to-menu', '回到扉页', 'text')}</div>`, 'sy-pause', '旅途暂停');
    if (view.screen === 'journal') {
      const memory = view.memories?.find(item => item.id === selectedMemory);
      if (memory) return memoryContent(memory);
      const photo = findPhoto(selectedPhoto);
      return photo ? largePhoto ? largePhotoContent(photo) : photoReview(photo, false) : journalContent();
    }
    if (view.screen === 'map') {
      const navigation = view.navigation;
      if (scenicListOpen && navigation) {
        const rows = navigation.scenicSpots.map(spot => {
          const selected = spot.id === navigation.scenicSpotId;
          return `<li><button type="button" data-action="track-scenic-spot" data-id="${esc(spot.id)}" aria-label="导航到${esc(spot.title)}" aria-pressed="${selected}"><span><strong>${esc(spot.title)}</strong>${spot.regionLabel ? `<small>${esc(spot.regionLabel)}</small>` : ''}</span><span>${selected ? '正在导航' : '导航 ›'}</span></button></li>`;
        }).join('');
        return wrap(`${heading('THE VALLEY · 手绘山谷图', '景点导航')}<ul class="sy-scenic-spots">${rows}</ul><div class="sy-button-row">${button('toggle-scenic-list', '返回地图', 'text', 'map')}</div>`, '', '景点导航');
      }
      const trail = navigation ? navigationRouteArt(navigation.destination) : mapOutingOverlay(view);
      const map = MAP_ART.replace('<g class="sy-map-pointer"', `${trail}<g class="sy-map-pointer"`);
      const stop = navigation?.preview ? '<small>来信路线预览</small>' : navigation?.scenicSpotId ? button('track-scenic-spot', '停止景点导航', 'text', undefined, 'data-cancel="true"')
        : button('choose-story-route', '自由走', 'text', undefined, 'data-route="free"');
      const guide = navigation?.destination && (navigation.preview || !view.outings?.tracked) ? `<div class="sy-map-navigation-caption"><div><strong>${esc(navigation.destination.title)}</strong><p>${esc(navigation.hint)}</p></div>${stop}</div>` : mapOutingCaption(view);
      const scenicEntry = navigation ? `<div class="sy-scenic-entry">${button('toggle-scenic-list', '景点导航', '', 'map')}</div>` : '';
      return wrap(`${heading('THE VALLEY · 手绘山谷图', '路就在山里')}${scenicEntry}<div class="sy-map-wrap">${map}</div>${guide}<div class="sy-map-caption"><div class="sy-map-legend"><span>记得住的地方</span><span>红箭头朝着按 W 前进的方向</span></div><span>沿小路慢慢走，也留意没有标出的岔路。</span></div><div class="sy-button-row">${button('close', '沿着风，接着走', 'primary', 'arrow')}</div>`, '', '山谷地图');
    }
    if (view.screen === 'photo' && view.pendingPhoto) return photoReview(view.pendingPhoto, true);
    if (view.screen === 'ending') return endingContent();
    return '';
  }
  function refreshModal(force = false) {
    albumPage = Math.min(albumPage, albumPageCount() - 1);
    let closedLastModal = false;
    const navigationKey = view.screen === 'map' ? [view.navigation, scenicListOpen] : view.screen === 'journal' ? [view.navigation?.storyRoute, view.navigation?.scenicSpotId, view.outings?.tracked?.spotId] : undefined;
    const key = JSON.stringify([view.screen, view.night, view.sixth, tab === "gear" ? view.flowers : undefined, settingsOpen, controlsOpen, restartConfirm, tab, albumPage, selectedPhoto, photoCollection, largePhoto, deleteFilmConfirm, selectedMemory, memoryPhotoPicker, memoryReplacementId, view.memories, view.replies, view.commissions, view.fireworks, view.mountainLetter, openingPhotoChoice, replyDrafts, view.hasSave, view.completed, view.discoveries, view.album, view.film, view.pendingPhoto, view.endingPhoto, view.canSendLetter, view.sentLetter, mailConfirmOpen, outingsOpen, restOpen, (outingsOpen || view.screen === 'map') ? view.outings : undefined, (outingsOpen || restOpen) ? view.restPoint : undefined, outingsOpen ? view.dayClock : undefined, view.creativeMode, navigationKey]);
    if (key !== modalKey || force) {
      modalKey = key;
      const focusAction = (doc.activeElement as HTMLElement | null)?.getAttribute('data-action');
      const focusPhotoId = (doc.activeElement as HTMLElement | null)?.getAttribute('data-id');
      const focusLetter = (doc.activeElement as HTMLElement | null)?.getAttribute('data-letter');
      const focusNote = (doc.activeElement as HTMLElement | null)?.getAttribute('data-note');
      const focusedCreativeTime = (doc.activeElement as HTMLElement | null)?.hasAttribute('data-creative-time');
      const scroll = modal.querySelector('.sy-modal')?.scrollTop ?? 0;
      modal.innerHTML = makeModal();
      const open = modal.childElementCount > 0;
      if (open !== modalOpen) {
        closedLastModal = modalOpen && !open;
        modalOpen = open;
        callbacks.onModalChange?.(open);
      }
      const dialog = modal.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) {
        const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('[data-action]'));
        const target = (focusedCreativeTime ? dialog.querySelector<HTMLElement>('[data-creative-time]') : undefined)
          ?? buttons.find(b => b.dataset.action === focusAction && (!focusPhotoId || b.dataset.id === focusPhotoId) && (!focusLetter || b.dataset.letter === focusLetter) && (focusNote === null || focusNote === undefined || b.dataset.note === focusNote)) ?? dialog;
        target.focus({ preventScroll: true });
        const scroller = modal.querySelector('.sy-modal');
        if (scroller) scroller.scrollTop = scroll;
      }
    }
    if (settingsOpen) {
      for (const input of modal.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
        const key = input.dataset.setting as keyof SettingsView;
        if (doc.activeElement !== input) {
          if (input instanceof (win?.HTMLInputElement ?? HTMLInputElement) && input.type === 'checkbox') input.checked = Boolean(view.settings[key]);
          else input.value = String(view.settings[key]);
        }
      }
    }
    const mapPlayer = modal.querySelector<SVGGElement>('[data-map-position]');
    if (mapPlayer && view.playerMap) mapPlayer.setAttribute('transform', mapMarkerTransform(view.playerMap));
    const navigation = view.navigation;
    if (!view.outings?.tracked) { pendingOutingGuide = false; outingMapForcedOpen = false; endOutingGuide(); }
    pocketLayer.hidden = !navigation || !view.playerMap || view.screen !== 'play' || view.camera.active || Boolean(view.cinematic) || modalOpen;
    if (!pocketLayer.hidden && navigation && view.playerMap) {
      if (pendingOutingGuide) {
        pendingOutingGuide = false;
        outingGuideShown = true;
        outingMapForcedOpen = true;
        pocket.dataset.guide = 'true';
        pocketGuide.hidden = false;
        outingGuideTimer = setTimeout(endOutingGuide, 8000);
      }
      const collapsed = navigation.collapsed && !outingMapForcedOpen;
      pocket.dataset.collapsed = String(collapsed);
      pocketBody.hidden = collapsed;
      pocketToggle.setAttribute('aria-expanded', String(!collapsed));
      pocketToggle.setAttribute('aria-label', collapsed ? '展开随身地图' : '收起随身地图');
      pocketToggle.lastElementChild!.textContent = collapsed ? '展开' : '收起';
      if (!collapsed) {
        const content = JSON.stringify([view.playerMap, navigation.destination, navigation.hint, navigation.postalRoads]);
        if (pocketKey !== content) { pocketKey = content; pocketBody.innerHTML = pocketMapContent(view.playerMap, navigation); }
      }
    }
    const readingAhe = view.screen === 'journal' && tab === 'letters' && navigation?.canChooseStory && navigation.storyRoute === null
      && !navigation.scenicSpotId && !view.outings?.tracked && Boolean(modal.querySelector('[data-reply-letter="forest"]'));
    if (!readingAhe) requestedStoryDefault = false;
    else if (!requestedStoryDefault) { requestedStoryDefault = true; action('read-ahe-route'); }
    // The previous focus can be the still-connected shutter/HUD button. Restoring
    // it would make the SDK classify subsequent game keys as UI-owned input.
    // Check again after callbacks: a synchronous host response may open a new modal.
    if (closedLastModal && !destroyed && !modalOpen && modal.childElementCount === 0 && view.screen === 'play') {
      const active = doc.activeElement;
      if (active && root.contains(active) && typeof (active as HTMLElement).blur === 'function') (active as HTMLElement).blur();
      callbacks.onReturnToGame?.();
    }
  }
  function render(next: PresentationViewModel) {
    if (destroyed) return;
    root.dataset.reducedMotion = String(next.settings.reducedMotion);
    const trackedSpot = next.outings?.tracked?.spotId;
    if (!outingGuideShown && next.screen === 'play'
      && trackedSpot && trackedSpot !== view.outings?.tracked?.spotId) pendingOutingGuide = true;
    if (view.screen !== next.screen) {
      settingsOpen = false; controlsOpen = false; restartConfirm = false; outingsOpen = false; restOpen = false; mailConfirmOpen = false; scenicListOpen = false;
      if (next.screen === 'journal') {
        if (next.mountainLetter?.initial && !openingFilm) tab = 'letters';
        openingFilm = false;
      }
      if (next.screen !== 'journal') { selectedPhoto = ''; largePhoto = false; deleteFilmConfirm = false; selectedMemory = ''; memoryPhotoPicker = false; memoryReplacementId = ''; }
    }
    if (memoryReplacementId && next.memories?.find(memory => memory.id === selectedMemory)?.photo?.id === memoryReplacementId) {
      memoryPhotoPicker = false; memoryReplacementId = '';
    }
    if (selectedMemory && !next.memories?.some(memory => memory.id === selectedMemory)) {
      selectedMemory = ''; memoryPhotoPicker = false; memoryReplacementId = '';
    } else if (selectedMemory && next.memories?.find(memory => memory.id === selectedMemory)?.status !== 'completed') {
      memoryPhotoPicker = false; memoryReplacementId = '';
    }
    if (!next.camera.active || !view.camera.active) { photoToolsOpen = false; framePreview = false; }
    root.dataset.framePreview = String(framePreview);
    if (!next.creativeMode) weatherOpen = false;
    if (next.restPoint?.available && (next.restPoint.requestOpen ?? 0) > lastRestRequest) {
      lastRestRequest = next.restPoint.requestOpen!; restOpen = true; outingsOpen = false;
    }
    if ((next.mailRequest ?? 0) > lastMailRequest) {
      lastMailRequest = next.mailRequest!; mailConfirmOpen = !next.sentLetter; outingsOpen = false; restOpen = false;
    }
    if (next.sentLetter || next.screen === 'ending') mailConfirmOpen = false;
    view = next;
    for (const id of pendingReplies) {
      const record = id === 'final' ? next.replies?.final : next.replies?.items.find(letter => letter.id === id);
      const draft = replyDrafts[id];
      if (draft && record?.photo?.id === draft.photoId && record.note === draft.note) { delete replyDrafts[id]; pendingReplies.delete(id); }
    }
    if (selectedPhoto && !findPhoto(selectedPhoto)) { selectedPhoto = ''; largePhoto = false; deleteFilmConfirm = false; }
    root.dataset.screen = next.screen;
    root.dataset.opening = next.opening?.step ?? '';
    root.dataset.dayClock = String(Boolean(next.dayClock));
    root.dataset.reducedMotion = String(next.settings.reducedMotion);
    const isPlaying = next.screen === 'play';
    hud.hidden = !isPlaying || Boolean(next.cinematic);
    hud.inert = next.camera.active;
    const nextHud = JSON.stringify([next.night, next.opening, next.area, next.areaName, next.objective, next.objectiveDetail, next.hint, next.interaction, next.completed, next.camera.active, next.saveStatus, next.saveMessage, next.movement?.running, next.movement?.grounded, next.skills]);
    if (nextHud !== hudKey) {
      hudKey = nextHud;
      hud.innerHTML = `<div class="sy-hud ${next.camera.active ? 'camera-active' : ''}"><div class="sy-hud-top"><div class="sy-place"><div class="sy-place-mark">${icon(next.area === 'forest' ? 'wind' : next.area === 'town' ? 'letter' : 'mountain', 25)}</div><div><div class="sy-place-label">拍一卷山色 / ON THE ROAD</div><div class="sy-place-name">${esc(next.areaName)}</div></div></div><div class="sy-top-actions"><button class="sy-recover-path" type="button" data-action="recover-path" title="被地形困住时回到可走的小路，照片与进度保留">${icon('arrow', 16)}<span>回到最近小路</span></button>${next.fireworks || next.night?.open ? '<button class="sy-recover-path" type="button" data-action="open-gear" aria-label="打开行囊">行囊</button>' : ''}<button class="sy-icon-btn" type="button" data-action="open-journal" title="旅行册 · J" aria-label="打开旅行册">${icon('book')}</button><button class="sy-icon-btn" type="button" data-action="open-map" title="地图 · M" aria-label="打开地图">${icon('map')}</button><button class="sy-icon-btn" type="button" data-action="pause" title="歇一歇 · Esc" aria-label="暂停旅途">${icon('pause')}</button></div></div><div class="sy-hud-bottom"><div class="sy-objective"><div class="sy-progress-dots" aria-label="${Number(next.completed.forest) + Number(next.completed.town)} 枚回声邮戳"><span class="${next.completed.forest ? 'done' : ''}"></span><span class="${next.completed.town ? 'done' : ''}"></span></div><div class="sy-objective-kicker">下一页风景</div><div class="sy-objective-title">${esc(next.objective)}</div>${next.objectiveDetail ? `<div class="sy-objective-detail">${esc(next.objectiveDetail)}</div>` : ''}</div><div class="sy-controls"><span><kbd>W A S D</kbd>走与转身</span><span><kbd>拖拽 / ← →</kbd>视角</span><span data-running="${Boolean(next.movement?.running)}"><kbd>Shift</kbd>${next.skills?.run === false ? '跑 · 未学会' : next.movement?.running ? '正在跑' : '跑'}</span><span><kbd>Space</kbd>${next.skills?.jump === false ? '跳 · 未学会' : next.movement?.grounded === false ? '腾空中' : '跳'}</span><span><kbd>C</kbd>相机</span></div></div>${next.saveStatus ? `<div class="sy-save" data-status="${next.saveStatus}"><i class="sy-save-dot"></i>${esc(next.saveMessage ?? ({ saved: '旅程已记好', saving: '记下这一程…', failed: '这一程暂时未能保存' }[next.saveStatus]))}</div>` : ''}${next.opening?.step === 'camera' ? '<button type="button" class="sy-opening-guide" data-action="interact" aria-keyshortcuts="E C"><strong>帮阿禾把那座山装进信封</strong><span><kbd>E</kbd> / <kbd>C</kbd> 举起相机</span></button>' : ''}${next.interaction && !next.camera.active ? `<button type="button" class="sy-interaction${next.opening?.step === 'camera' ? ' sy-interaction-secondary' : ''}" data-action="interact" ${next.interaction.disabled ? 'disabled' : ''}><kbd>${esc(next.interaction.key ?? 'E')}</kbd><span><strong>${esc(next.interaction.label)}</strong>${next.interaction.detail ? `<small>${esc(next.interaction.detail)}</small>` : ''}</span></button>` : ''}${next.night?.placing ? '<button type="button" class="sy-night-cancel" data-action="night-gear" data-operation="cancel">收起烟花</button>' : ''}${next.hint && !next.camera.active ? `<div class="sy-hint">${esc(next.hint)}</div>` : ''}</div>`;
    }
    camera.hidden = !next.camera.active || !isPlaying || Boolean(next.cinematic);
    const nextCamera = JSON.stringify([next.camera.target, next.camera.ready, next.camera.feedback,
      next.opening?.step, next.camera.replyGuide, next.camera.memory?.id, next.camera.memory?.title, next.camera.memory?.ready, next.camera.memory?.feedback,
      referenceOpen, next.camera.referenceVisible, next.camera.photography?.mode, next.camera.photography?.framing]);
    if (nextCamera !== cameraKey) {
      cameraKey = nextCamera; sessionKey = '';
      const target = next.camera.target;
      const memoryCamera = !target && !next.camera.replyGuide ? next.camera.memory : undefined;
      const guide = next.camera.replyGuide === 'forest-sign'
        ? ['阿禾的林间近路', '把岔口的红箭头和风车拍在一张照片里。']
        : next.camera.replyGuide === 'ridge-pair'
          ? ['阿禾的东岭指路', '拍长椅旁的红箭头，再向西南用望远拍风车。两张分开拍。']
          : undefined;
      camera.innerHTML = `<div class="sy-camera" data-ready="${next.camera.ready}">${photoFramingChoices(next)}<div class="sy-camera-session"></div><div class="sy-hint sy-camera-boundary" role="status" hidden></div><div class="sy-camera-header"><span class="sy-camera-label"><i class="sy-camera-dot"></i>回声相机 / ECHO CAMERA</span><button type="button" class="sy-button text" data-action="camera-toggle" style="color:inherit;padding:0">放下相机 <kbd>C</kbd></button></div><div class="sy-viewfinder"><div class="sy-viewfinder-grid"></div><span class="sy-focus"></span>${next.opening ? '<span class="sy-opening-look"><kbd>拖动鼠标</kbd> 看方向</span>' : ''}</div><div class="sy-alignment" aria-label="构图接近程度"><span></span></div><div class="sy-camera-feedback">${esc(next.camera.feedback ?? (next.camera.ready ? '就是这里。按下快门，听听回声。' : '慢慢看，喜欢的风景都值得留下。'))}</div><div class="sy-camera-bottom"><button type="button" class="sy-shutter" data-action="shutter" aria-label="拍照"></button><div class="sy-shutter-hint">留住这一刻</div></div>${photographyGuidance(next)}${guide && next.camera.referenceVisible !== false ? `<aside class="sy-reference sy-route-reference"><strong>${guide[0]}</strong><p>${guide[1]}</p></aside>` : ''}${target && referenceOpen && next.camera.referenceVisible !== false ? `<aside class="sy-reference">${postcardArt(target)}<p class="sy-reference-label">${cardText[target].title}</p><p class="sy-reference-no">THE OLD POSTCARD · ${cardText[target].number}</p></aside>` : ''}${target ? `<button type="button" class="sy-reference-toggle" data-action="toggle-reference">${referenceOpen ? '收起' : '展开'}旧卡片</button>` : ''}</div>`;
      if (memoryCamera) {
        const cameraRoot = camera.querySelector<HTMLElement>('.sy-camera')!;
        cameraRoot.dataset.ready = String(memoryCamera.ready);
        const feedback = camera.querySelector<HTMLElement>('.sy-camera-feedback')!;
        feedback.textContent = memoryCamera.feedback;
        cameraRoot.insertAdjacentHTML('beforeend', `${referenceOpen && next.camera.referenceVisible !== false ? `<aside class="sy-reference sy-memory-reference">${valleyLetterGuideArt()}<p class="sy-reference-label">${esc(memoryCamera.title)}</p><p class="sy-reference-no">构图示意 · 风车与红屋顶同框</p><p class="sy-memory-reference-note">不限左右顺序，照片会是你眼前的山谷。</p></aside>` : ''}<button type="button" class="sy-reference-toggle" data-action="toggle-reference">${referenceOpen ? '收起' : '展开'}来信提示</button>`);
      }
    }
    const cameraBoundary = camera.querySelector<HTMLElement>('.sy-camera-boundary');
    if (cameraBoundary) {
      cameraBoundary.hidden = !next.boundaryNotice;
      const text = next.boundaryNotice ?? '';
      if (cameraBoundary.textContent !== text) cameraBoundary.textContent = text;
    }
    const alignment = camera.querySelector<HTMLElement>('.sy-alignment span');
    if (alignment) alignment.style.width = `${clamp(!next.camera.target && !next.camera.replyGuide && next.camera.memory ? next.camera.memory.alignment : next.camera.alignment) * 100}%`;
    const countdown = next.camera.countdownSeconds == null ? null : Math.max(0, Math.ceil(next.camera.countdownSeconds));
    const busy = next.camera.captureState === 'capturing' || next.camera.captureState === 'saving';
    const portrait = portraitFramingStatus(next);
    const timed = next.camera.photography?.timerSeconds === 3;
    const cameraRoot = camera.querySelector<HTMLElement>('.sy-camera');
    if (cameraRoot) {
      cameraRoot.dataset.photoMode = portrait ? 'portrait' : 'landscape';
      const frame = next.camera.frame;
      for (const [axis, fraction] of Object.entries(frame ?? { left: 0, top: 0, width: 1, height: 1 })) {
        const value = `${100 * fraction}%`;
        if (cameraRoot.style.getPropertyValue(`--photo-${axis}`) !== value) cameraRoot.style.setProperty(`--photo-${axis}`, value);
      }
      if (portrait) cameraRoot.dataset.portraitReady = String(portrait.available);
      else delete cameraRoot.dataset.portraitReady;
    }
    if (portrait) {
      const feedback = camera.querySelector<HTMLElement>('.sy-camera-feedback');
      const message = `${portrait.message}${timed ? (portrait.available ? ' 3 秒定时会在结束时再次检查入镜。' : ' 可用 3 秒定时走位，结束时须完整入镜。') : ''}`;
      if (feedback) { feedback.setAttribute('role', 'status'); if (feedback.textContent !== message) feedback.textContent = message; }
    }
    const shutter = camera.querySelector<HTMLButtonElement>('.sy-shutter');
    // A timed photograph checks the subject when its countdown ends, so an
    // unavailable current position must not prevent starting time to get ready.
    const invalidImmediatePortrait = Boolean(portrait && !portrait.available && !timed);
    if (shutter) {
      shutter.disabled = busy || countdown !== null || invalidImmediatePortrait;
      shutter.setAttribute('aria-disabled', String(shutter.disabled));
      shutter.setAttribute('aria-label', countdown !== null ? '倒计时进行中' : busy ? (next.camera.captureState === 'saving' ? '正在保存原照' : '正在曝光') : invalidImmediatePortrait ? portrait!.message : timed ? '开始 3 秒倒计时拍照' : '拍照');
      shutter.title = invalidImmediatePortrait ? portrait!.message : timed ? '3 秒倒计时结束时拍照' : '点击快门或按空格拍照';
    }
    const shutterHint = camera.querySelector<HTMLElement>('.sy-shutter-hint');
    if (shutterHint) shutterHint.textContent = timed ? '按下快门 · 3 秒后留住这一刻' : '按下快门 · 留住这一刻';
    const quickTimer = camera.querySelector<HTMLButtonElement>('.sy-photo-quick-timer');
    if (quickTimer) {
      quickTimer.disabled = busy || countdown !== null;
      quickTimer.dataset.value = timed ? '0' : '3';
      quickTimer.setAttribute('aria-pressed', String(timed));
      quickTimer.textContent = `3 秒定时：${timed ? '开' : '关'}`;
      quickTimer.title = timed ? '关闭后，按快门立即拍照。' : '开启后再按快门，倒计时三秒拍照。';
    }
    zoomLayer.hidden=camera.hidden;
    zoomInput.disabled=busy||countdown!==null;
    const zoom=magnificationForFov(photographyFov(next.camera.photography??DEFAULT_PHOTOGRAPHY));
    if(zoomLayer.hidden||next.camera.photography?.zoom===requestedZoom)requestedZoom=undefined;
    // A worker reply can be several physical input events behind the thumb.
    if(requestedZoom===undefined&&zoom!==previousZoom){
      previousZoom=zoom;zoomInput.value=zoom.toFixed(1);zoomOutput.value=zoom.toFixed(1)+'×';
      zoomInput.setAttribute('aria-valuetext',zoomOutput.value);
    }
    const nextSession = JSON.stringify([countdown, next.camera.captureState, next.camera.captureMessage]);
    if (nextSession !== sessionKey) {
      sessionKey = nextSession;
      const session = camera.querySelector<HTMLElement>('.sy-camera-session');
      const counter = session?.querySelector('strong');
      if (counter && countdown !== null) counter.textContent = String(countdown || '·');
      else if (session) session.innerHTML = countdown !== null ? `<div class="sy-countdown" role="status"><strong>${countdown || '·'}</strong><button type="button" data-action="cancel-countdown">取消倒计时</button></div>` : next.camera.captureState && next.camera.captureState !== 'idle' ? `<div class="sy-capture-status" role="status">${esc(next.camera.captureMessage ?? ({ capturing: '正在曝光…', saving: '正在保存原照…', failed: '照片没有保存，请再拍一次。' }[next.camera.captureState]))}</div>` : '';
    }
    toolsLayer.hidden = !isPlaying || Boolean(next.cinematic);
    // Forecast seconds change every game frame; never rebuild the camera controls for them.
    const nextTools = JSON.stringify([firstFilmSeen, next.weather?.id, next.weather?.label, next.weather?.options, next.weather?.transitioning, next.camera.active, next.camera.photography, next.camera.viewpoints, next.camera.candidateStatus, next.creativeMode, busy, (next.film ?? []).map(photo => [photo.id, photo.title]), next.replies?.items.some(letter => letter.candidates.some(photo => photo.id === next.film?.at(-1)?.id)), weatherOpen, photoToolsOpen]);
    if (nextTools !== toolsKey) {
      toolsKey = nextTools;
      const focused = doc.activeElement as HTMLElement | null;
      const ownedFocus = Boolean(focused && toolsLayer.contains(focused));
      const identity = ownedFocus ? ['data-action', 'data-photo-key', 'data-value', 'data-weather'].map(attribute => [attribute, focused!.getAttribute(attribute)] as const) : [];
      toolsLayer.innerHTML = photographyTools(next, weatherOpen, photoToolsOpen, firstFilmSeen);
      if (ownedFocus) {
        const replacement = Array.from(toolsLayer.querySelectorAll<HTMLElement>('button,input')).find(element => identity.every(([attribute, value]) => element.getAttribute(attribute) === value));
        (replacement ?? toolsLayer.querySelector<HTMLElement>('[data-action="toggle-weather"],button'))?.focus({ preventScroll: true });
      }
    }
    forecastLayer.hidden = toolsLayer.hidden || Boolean(next.camera.active && next.dayClock) || settingsOpen || controlsOpen || restartConfirm || outingsOpen || restOpen;
    const forecast = forecastDisplay(next.weather?.forecast);
    if (!forecast) forecastOpen = false;
    const nextForecast = JSON.stringify([forecast, forecastOpen]);
    if (nextForecast !== forecastKey) {
      forecastKey = nextForecast;
      const ownedFocus = forecastLayer.contains(doc.activeElement);
      forecastLayer.innerHTML = forecast ? forecastMarkup(forecast, forecastOpen) : '';
      if (ownedFocus) {
        const toggle = forecastLayer.querySelector<HTMLButtonElement>('button');
        if (toggle) toggle.focus({ preventScroll: true });
        else if (!modalOpen && view.screen === 'play') callbacks.onRequestGameFocus?.();
      }
    }
    diaryLayer.hidden = !isPlaying || Boolean(next.cinematic);
    const tracked = next.outings?.tracked;
    const nextDiary = JSON.stringify([next.dayClock, next.creativeMode, next.camera.active, next.restPoint?.available, next.restPoint?.title, tracked ? [tracked.spotId, tracked.spotTitle, tracked.windowLabel, Math.ceil(tracked.etaSeconds), Math.round(tracked.distanceMeters), tracked.facingHint] : null]);
    if (nextDiary !== diaryKey) {
      const focusedAction = diaryLayer.contains(doc.activeElement) ? (doc.activeElement as HTMLElement)?.dataset.action : undefined;
      diaryKey = nextDiary; diaryLayer.innerHTML = fieldClock(next);
      if (focusedAction) Array.from(diaryLayer.querySelectorAll<HTMLElement>('[data-action]')).find(element => element.dataset.action === focusedAction)?.focus({ preventScroll: true });
    }
    refreshModal();
    const nextCinematic = JSON.stringify(next.cinematic);
    if (nextCinematic !== cinematicKey) { cinematicKey = nextCinematic ?? ''; cinematic.innerHTML = next.cinematic ? `<div class="sy-cinematic"><div><strong>${esc(next.cinematic.title ?? '风景正在回信')}</strong><p>${esc(next.cinematic.subtitle ?? '')}</p></div></div>` : ''; }
    if (next.toast && next.toast.id !== lastToast) {
      lastToast = next.toast.id;
      clearTimeout(toastTimer);
      toast.innerHTML = `<div class="sy-toast" data-kind="${next.toast.kind ?? 'info'}"><div class="sy-toast-icon">${icon(next.toast.kind === 'discovery' ? 'stamp' : next.toast.kind === 'success' ? 'check' : 'letter', 25)}</div><div><div class="sy-toast-title">${esc(next.toast.title)}</div>${next.toast.message ? `<div class="sy-toast-message">${esc(next.toast.message)}</div>` : ''}</div></div>`;
      toastTimer = setTimeout(() => { toast.innerHTML = ''; }, 5500);
    }
  }
  function close() {
    if (restartConfirm) restartConfirm = false;
    else if (settingsOpen) settingsOpen = false;
    else if (controlsOpen) controlsOpen = false;
    else if (mailConfirmOpen) mailConfirmOpen = false;
    else if (restOpen) restOpen = false;
    else if (outingsOpen) outingsOpen = false;
    else if (memoryPhotoPicker) { memoryPhotoPicker = false; memoryReplacementId = ''; }
    else if (selectedMemory) { selectedMemory = ''; tab = 'discoveries'; }
    else if (largePhoto) largePhoto = false;
    else if (deleteFilmConfirm) deleteFilmConfirm = false;
    else if (selectedPhoto) selectedPhoto = '';
    else if (view.screen === 'menu') return;
    else action('close-panel');
    refreshModal(true);
  }
  function onClick(event: MouseEvent) {
    const target = event.target as Element | null;
    const element = target?.closest<HTMLElement>('[data-action],[data-tab]');
    if (!element || !root.contains(element) || (element as HTMLButtonElement).disabled) return;
    event.stopPropagation();
    callbacks.onUserGesture?.();
    if (element.dataset.tab) { tab = element.dataset.tab as JournalTab; selectedPhoto = ''; selectedMemory = ''; memoryPhotoPicker = false; memoryReplacementId = ''; refreshModal(true); return; }
    const name = element.dataset.action!;
    const pointerReturn = event.detail > 0 && !modalOpen && view.screen === 'play';
    try { switch (name) {
      case 'close': close(); return;
      case 'settings': settingsOpen = true; refreshModal(true); return;
      case 'controls': controlsOpen = true; refreshModal(true); return;
      case 'restart': restartConfirm = true; refreshModal(true); return;
      case 'cancel-restart': restartConfirm = false; refreshModal(true); return;
      case 'confirm-restart': firstFilmSeen = false; openingPhotoChoice = ''; restartConfirm = false; lastRestRequest = 0; lastMailRequest = 0; mailConfirmOpen = false; for (const id of ['forest','town','final'] as const) delete replyDrafts[id]; pendingReplies.clear(); action('new-game'); return;
      case 'album-next': albumPage = Math.min(albumPage + 1, albumPageCount() - 1); refreshModal(true); return;
      case 'album-prev': albumPage = Math.max(0, albumPage - 1); refreshModal(true); return;
      case 'view-photo': photoReplyContext = undefined; selectedPhoto = element.dataset.id!; largePhoto = false; deleteFilmConfirm = false; refreshModal(true); return;
      case 'view-large-photo': largePhoto = true; refreshModal(true); return;
      case 'close-large-photo': largePhoto = false; refreshModal(true); return;
      case 'photo-collection': photoCollection = element.dataset.collection === 'film' ? 'film' : 'album'; albumPage = 0; selectedPhoto = ''; refreshModal(true); return;
      case 'keep-exploring':
        if (mailConfirmOpen && !view.sentLetter) { mailConfirmOpen = false; refreshModal(true); return; }
        action('keep-exploring'); return;
      case 'choose-opening-photo':
        openingPhotoChoice = element.dataset.id ?? ''; refreshModal(true); return;
      case 'send-opening-photo':
        if (element.dataset.id) { action('send-opening-photo', element.dataset.id); openingPhotoChoice = ''; }
        return;
      case 'skip-opening-photo':
        openingPhotoChoice = ''; action('skip-opening-photo'); return;
      case 'open-gear':
        tab = 'gear';selectedPhoto = '';largePhoto = false;outingsOpen = false;restOpen = false;
        action('open-journal');refreshModal(true);return;
      case 'sixth':
        if(element.dataset.operation)action('sixth',{operation:element.dataset.operation});
        return;
      case 'flower-gear': case 'flower-photo':
        if(element.dataset.operation)action(name,{
          operation:element.dataset.operation,kind:element.dataset.firework,source:element.dataset.source,
          index:element.dataset.index===undefined?undefined:Number(element.dataset.index),
        });
        return;
      case 'night-gear':
        if (element.dataset.operation) action('night-gear', {
          operation: element.dataset.operation, kind: element.dataset.firework,
        });
        return;
      case 'open-replies':
        mailConfirmOpen = false;
        if (!view.replies) { action('open-journal'); return; }
        tab = 'letters'; selectedPhoto = ''; selectedMemory = ''; largePhoto = false; outingsOpen = false; restOpen = false;
        action('open-replies'); refreshModal(true); return;
      case 'edit-reply': {
        const id = element.dataset.letter;
        if (id === 'final') {
          if (!view.replies?.final.ready || view.sentLetter) return;
          const final = view.replies.final;
          replyDrafts.final = { photoId: final.photo?.id ?? view.endingPhoto?.id ?? '', note: final.note, open: true };
        } else {
          const letter = view.replies?.items.find(item => item.id === id); if (!letter) return;
          replyDrafts[letter.id] = { photoId: letter.photo?.id ?? '', note: letter.note, open: true };
        }
        refreshModal(true); return;
      }
      case 'cancel-reply-edit': {
        const id = element.dataset.letter;
        if (id === 'forest' || id === 'town' || id === 'final') { delete replyDrafts[id]; pendingReplies.delete(id); refreshModal(true); }
        return;
      }
      case 'pick-reply-photo': {
        const id = element.dataset.letter, photoId = element.dataset.id ?? '';
        if (id === 'final') {
          if (!view.replies?.final.ready || view.sentLetter || !safeImage(findPhoto(photoId)?.imageUrl)) return;
          replyDrafts.final = { photoId, note: photoId === view.replies.final.photo?.id ? view.replies.final.note : '', open: true };
        } else {
          const letter = view.replies?.items.find(item => item.id === id);
          if (!letter || !replyCandidates(letter).some(photo => photo.id === photoId)) return;
          replyDrafts[letter.id] = { photoId, note: photoId === letter.photo?.id ? letter.note : '', open: true };
        }
        refreshModal(true); return;
      }
      case 'pick-reply-note': {
        const id = element.dataset.letter, note = element.dataset.note ?? '';
        if (id !== 'forest' && id !== 'town' && id !== 'final') return;
        const draft = replyDrafts[id]; if (!draft) return;
        const letter = view.replies?.items.find(item => item.id === id);
        const allowed = id === 'final' ? view.replies?.final.noteOptions ?? [] : letter ? replyNotes(letter, replyCandidates(letter).find(photo => photo.id === draft.photoId)) : [];
        if (note && !allowed.includes(note)) return;
        draft.note = note; refreshModal(true); return;
      }
      case 'attach-route-photo': action('attach-route-photo',{slot:element.dataset.slot,photoId:element.dataset.id}); return;
      case 'send-route-pair': action('send-route-pair'); return;
      case 'export-route-letter': action('export-route-letter'); return;
      case 'select-reply-photo': {
        const letter = view.replies?.items.find(item => item.id === element.dataset.letter);
        if (!letter) return;
        const draft = replyDrafts[letter.id];
        if (!draft || draft.photoId !== element.dataset.id || !replyCandidates(letter).some(photo => photo.id === draft.photoId)) return;
        pendingReplies.add(letter.id); action('select-reply-photo', { letterId: letter.id, photoId: draft.photoId, note: draft.note }); return;
      }
      case 'confirm-final-photo': {
        const draft = replyDrafts.final;
        if (!view.replies?.final.ready || view.sentLetter || !draft || draft.photoId !== element.dataset.id || !safeImage(findPhoto(draft.photoId)?.imageUrl)) return;
        pendingReplies.add('final'); action('select-ending-photo', { photoId: draft.photoId, note: draft.note }); return;
      }
      case 'view-reply-photo':
        if (!findPhoto(element.dataset.id ?? '')) return;
        photoReplyContext = element.dataset.letter === 'final' ? 'final' : element.dataset.letter === 'forest' || element.dataset.letter === 'town' ? element.dataset.letter : undefined;
        selectedPhoto = element.dataset.id!; largePhoto = true; tab = 'letters'; refreshModal(true); return;
      case 'export-postcard':
        if (findPhoto(element.dataset.id ?? '')) action('export-postcard', { photoId: element.dataset.id, note: element.dataset.note ?? '', title: element.dataset.title });
        return;
      case 'open-film': firstFilmSeen = true; openingFilm = view.screen !== 'journal'; photoReplyContext = undefined; photoCollection = 'film'; tab = 'album'; selectedPhoto = element.dataset.id ?? ''; largePhoto = false; deleteFilmConfirm = false; action('open-film'); return;
      case 'open-outings': outingsOpen = true; restOpen = false; refreshModal(true); return;
      case 'open-rest': if (view.restPoint?.available) { restOpen = true; outingsOpen = false; refreshModal(true); } return;
      case 'track-photo-spot': {
        const spotId = element.dataset.cancel === 'true' ? null : element.dataset.spot;
        const slot = element.dataset.slot;
        if (spotId === null || (spotId && view.outings?.slots.some(spot => spot.spotId === spotId && spot.slot === slot))) {
          if (spotId !== null) outingsOpen = false;
          action('track-photo-spot', { spotId, slot });
          refreshModal(true);
        }
        return;
      }
      case 'rest-until': {
        const target = view.restPoint?.targets.find(item => item.target === element.dataset.target);
        if (view.restPoint?.available && target) { restOpen = false; refreshModal(true); action('rest-until', { target: target.target }); }
        return;
      }
      case 'set-creative-mode': action('set-creative-mode', { enabled: element.dataset.enabled === 'true' }); return;
      case 'view-outing-photo':
        if (!findPhoto(element.dataset.id ?? '')) return;
        photoReplyContext = undefined; outingsOpen = false; selectedPhoto = element.dataset.id!; largePhoto = true; action('open-journal'); refreshModal(true); return;
      case 'open-map': outingsOpen = false; restOpen = false; action('open-map', element.dataset.letterRoute); refreshModal(true); return;
      case 'toggle-scenic-list':
        if (view.screen === 'map' && view.navigation) { scenicListOpen = !scenicListOpen; refreshModal(true); }
        return;
      case 'navigate-commission':
        if (view.commissions?.entries.some(entry => !entry.done && entry.site === element.dataset.site)) {
          action('navigate-commission', element.dataset.site);
          refreshModal(true);
        }
        return;
      case 'submit-commission':
      case 'claim-commission-round':
        action(element.dataset.action as 'submit-commission'|'claim-commission-round', {round:Number(element.dataset.round),site:element.dataset.site,photoId:element.dataset.id});
        return;
      case 'track-scenic-spot': {
        const spotId = element.dataset.cancel === 'true' ? null : element.dataset.id;
        if (view.screen === 'map' && (spotId === null || view.navigation?.scenicSpots.some(spot => spot.id === spotId))) {
          scenicListOpen = false;
          action('track-scenic-spot', spotId);
          refreshModal(true);
        }
        return;
      }
      case 'pocket-map-toggle':
        if (view.navigation) {
          const collapsed = view.navigation.collapsed && !outingMapForcedOpen;
          outingMapForcedOpen = false;
          endOutingGuide();
          action('set-pocket-map', !collapsed);
          refreshModal();
        }
        return;
      case 'choose-story-route': action('choose-story-route', element.dataset.route); return;
      case 'toggle-weather': if (!view.creativeMode) return; weatherOpen = !weatherOpen; toolsKey = ''; render(view); return;
      case 'toggle-forecast': forecastOpen = !forecastOpen; render(view); return;
      case 'toggle-frame-preview': framePreview = !framePreview; if (framePreview) photoToolsOpen = false; render(view); return;
      case 'toggle-photo-tools': photoToolsOpen = !photoToolsOpen; toolsKey = ''; render(view); return;
      case 'set-weather': if (!view.creativeMode) return; weatherOpen = false; action('set-weather', { id: element.dataset.weather as WeatherId }); toolsKey = ''; render(view); return;
      case 'photo-option': {
        const key = element.dataset.photoKey as keyof PhotographySettings;
        if(key==='lens'){requestedZoom=undefined;previousZoom=-1;}
        const value = key === 'viewpoint' || key === 'timerSeconds' ? Number(element.dataset.value) : element.dataset.value;
        action('set-photography', { [key]: value }); return;
      }
      case 'cancel-countdown': action('cancel-countdown'); queueMicrotask(() => { if (!destroyed && !modalOpen) callbacks.onRequestGameFocus?.(); }); return;
      case 'save-photo': action('save-photo', { photoId: element.dataset.id ?? selectedPhoto }); return;
      case 'export-photo': action('export-photo', { photoId: element.dataset.id ?? selectedPhoto }); return;
      case 'ask-delete-film': deleteFilmConfirm = true; refreshModal(true); return;
      case 'cancel-delete-film': deleteFilmConfirm = false; refreshModal(true); return;
      case 'delete-film-photo': action('delete-film-photo', { photoId: element.dataset.id ?? selectedPhoto }); deleteFilmConfirm = false; return;
      case 'view-memory':
        if (!view.memories?.some(memory => memory.id === element.dataset.memory)) return;
        selectedMemory = element.dataset.memory!; selectedPhoto = ''; tab = 'discoveries';
        memoryPhotoPicker = false; memoryReplacementId = ''; refreshModal(true); return;
      case 'close-memory': selectedMemory = ''; memoryPhotoPicker = false; memoryReplacementId = ''; tab = 'discoveries'; refreshModal(true); return;
      case 'choose-memory-photo': memoryPhotoPicker = true; memoryReplacementId = ''; refreshModal(true); return;
      case 'cancel-memory-replace': memoryPhotoPicker = false; memoryReplacementId = ''; refreshModal(true); return;
      case 'pick-memory-photo': {
        const memory = view.memories?.find(item => item.id === selectedMemory);
        if (memory?.status !== 'completed' || !memory.replacementPhotos.some(photo => photo.id === element.dataset.id && safeImage(photo.imageUrl))) return;
        memoryReplacementId = element.dataset.id!; refreshModal(true); return;
      }
      case 'replace-memory-photo': {
        const memory = view.memories?.find(item => item.id === selectedMemory);
        if (memory?.status !== 'completed' || memory.id !== element.dataset.memory
          || memoryReplacementId !== element.dataset.id
          || !memory.replacementPhotos.some(photo => photo.id === memoryReplacementId && safeImage(photo.imageUrl))) return;
        action('replace-memory-photo', { memoryId: memory.id, photoId: memoryReplacementId });
        return; // Only the next rule DTO can commit the replacement or close its picker.
      }
      case 'close-photo-detail': selectedPhoto = ''; largePhoto = false; deleteFilmConfirm = false; refreshModal(true); return;
      case 'toggle-reference': referenceOpen = !referenceOpen; cameraKey = ''; render(view); return;
      case 'select-ending-photo': action(name, element.dataset.id ?? selectedPhoto); selectedPhoto = ''; refreshModal(true); return;
      case 'replace-photo': action(name, { photoId: selectedPhoto || view.pendingPhoto?.id, replaceId: element.dataset.id }); return;
      default: action(name as PresentationAction);
    } } finally {
      if (pointerReturn) queueMicrotask(() => { if (!destroyed && !modalOpen && view.screen === 'play') callbacks.onRequestGameFocus?.(); });
    }
  }
  function onSetting(event: Event) {
    const element = event.target as HTMLInputElement | HTMLSelectElement;
    if(element.hasAttribute('data-sixth-portrait')){
      if(event.type==='change'&&element.value)action('sixth',{operation:'portrait',photoId:element.value});
      return;
    }
    if(element.dataset.flowerPhoto){
      if(event.type==='change'&&element.value)action('flower-photo',{operation:element.dataset.flowerPhoto,photoId:element.value});
      return;
    }
    if(element===zoomInput){
      event.stopPropagation();
      if(event.type==='input'&&!zoomInput.disabled){
        const zoom=clampZoom(Number(zoomInput.value));
        requestedZoom=zoom;zoomInput.setAttribute('aria-valuetext',zoom.toFixed(1)+'×');
        zoomOutput.value=zoom.toFixed(1)+'×';action('set-photography',{zoom});
      }
      return;
    }
    if (element.hasAttribute('data-creative-time')) {
      event.stopPropagation();
      const match = /^(\d{2}):(\d{2})$/.exec(element.value);
      if (event.type === 'change' && view.creativeMode && match && Number(match[1]) < 24 && Number(match[2]) < 60) {
        callbacks.onUserGesture?.(); action('set-time', { minute: Number(match[1]) * 60 + Number(match[2]) });
      }
      return;
    }
    if (element.dataset.photoKey === 'exposure') {
      event.stopPropagation();
      const value = clamp(Number(element.value), -1, 1);
      const output = toolsLayer.querySelector<HTMLOutputElement>('[data-exposure-output]');
      if (output) output.textContent = `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
      if (event.type === 'change') {
        callbacks.onUserGesture?.(); action('set-photography', { exposure: value });
        if (pointerInput) queueMicrotask(() => { if (!destroyed && !modalOpen) callbacks.onRequestGameFocus?.(); });
      }
      return;
    }
    const key = element.dataset.setting as keyof SettingsView | undefined;
    if (!key) return;
    event.stopPropagation();
    callbacks.onUserGesture?.();
    const value = key === 'reducedMotion' ? (element as HTMLInputElement).checked : key === 'quality' ? element.value : Number(element.value);
    const output = root.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
    if (output) output.textContent = key === 'sensitivity' ? Number(value).toFixed(2) + ' ×' : Math.round(Number(value) * 100) + '%';
    callbacks.onSettingChange?.(key, value as SettingsView[keyof SettingsView]);
  }
  function onKey(event: KeyboardEvent) {
    pointerInput = false;
    if(event.target===zoomInput&&event.code==='Space'){
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)camera.querySelector<HTMLButtonElement>('button.sy-shutter:not(:disabled)')?.click();
      return;
    }
    if(event.target===zoomInput&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){
      event.stopPropagation();return;
    }
    if (!modalOpen) {
      if (event.key === 'Escape' && root.contains(doc.activeElement)) {
        event.preventDefault(); event.stopPropagation(); weatherOpen = false; forecastOpen = false; toolsKey = ''; render(view); callbacks.onRequestGameFocus?.();
      }
      return;
    }
    event.stopPropagation();
    if (view.screen === 'map' && event.code === 'KeyM' && !event.repeat && !(event.target instanceof (win?.HTMLInputElement ?? HTMLInputElement))) { event.preventDefault(); close(); return; }
    if (event.code === 'KeyJ' && !event.repeat) {
      const openingLetter = modal.querySelector<HTMLButtonElement>('[data-opening-letter]');
      if (openingLetter) { event.preventDefault(); openingLetter.click(); return; }
    }
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusables = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')).filter(e => !e.hidden);
      if (!focusables.length) { event.preventDefault(); return; }
      const first = focusables[0]!, last = focusables[focusables.length - 1]!;
      if (event.shiftKey && (doc.activeElement === first || !focusables.includes(doc.activeElement as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (doc.activeElement === last || !focusables.includes(doc.activeElement as HTMLElement))) { event.preventDefault(); first.focus(); }
    }
  }
  function onDocumentKey(event: KeyboardEvent) {
    if (destroyed || !modalOpen || event.defaultPrevented || (event.key !== 'Escape' && event.key !== 'Tab' && !(view.screen === 'map' && event.code === 'KeyM'))) return;
    const neutral = (target: EventTarget | null) => target === doc.body || target === doc.documentElement;
    if (!neutral(event.target) || !neutral(doc.activeElement)) return;
    // A backdrop click can leave focus on BODY. Recover only this game's modal;
    // never claim keys from another control or another visible modal in the host.
    const foreignDialog = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"],dialog[open]')).some(element => {
      if (root.contains(element) || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      const style = win?.getComputedStyle(element);
      return style?.display !== 'none' && style?.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
    if (!foreignDialog) onKey(event);
  }
  const stopPointer = (event: Event) => { if (event.type === 'pointerdown' || event.type === 'mousedown') pointerInput = true; event.stopPropagation(); };
  root.addEventListener('click', onClick);
  root.addEventListener('input', onSetting);
  root.addEventListener('change', onSetting);
  root.addEventListener('keydown', onKey);
  doc.addEventListener('keydown', onDocumentKey);
  root.addEventListener('keyup', stopPointer);
  root.addEventListener('pointerdown', stopPointer);
  root.addEventListener('pointerup', stopPointer);
  root.addEventListener('mousedown', stopPointer);
  root.addEventListener('mouseup', stopPointer);
  const releaseZoomFocus=()=>{if(!destroyed&&!modalOpen&&view.camera.active)callbacks.onRequestGameFocus?.();};
  zoomInput.addEventListener('pointerup',()=>queueMicrotask(releaseZoomFocus));
  zoomInput.addEventListener('keyup',event=>{if(event.code==='Space')queueMicrotask(releaseZoomFocus);});
  zoomInput.addEventListener('wheel',event=>{
    if(!event.deltaY||zoomInput.disabled||zoomLayer.hidden)return;
    event.preventDefault();event.stopPropagation();
    zoomInput.value=String(clampZoom(Number(zoomInput.value)-Math.sign(event.deltaY)*.1));
    zoomInput.dispatchEvent(new Event('input',{bubbles:true}));
  },{passive:false});
  root.addEventListener('wheel', stopPointer);
  render(view);
  return {
    render,
    flash() { if (destroyed) return; clearTimeout(flashTimer); flashLayer.classList.remove('active'); void flashLayer.offsetWidth; flashLayer.classList.add('active'); flashTimer = setTimeout(() => flashLayer.classList.remove('active'), 400); },
    destroy() { if (destroyed) return; destroyed = true; clearTimeout(toastTimer); clearTimeout(flashTimer); endOutingGuide(); root.removeEventListener('click', onClick); root.removeEventListener('input', onSetting); root.removeEventListener('change', onSetting); root.removeEventListener('keydown', onKey); doc.removeEventListener('keydown', onDocumentKey); root.removeEventListener('keyup', stopPointer); for (const name of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'wheel']) root.removeEventListener(name, stopPointer); root.remove(); if (modalOpen) callbacks.onModalChange?.(false); },
  };
}
