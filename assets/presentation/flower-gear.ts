import { FLOWERS, FLOWER_ORDER } from '../journey/flower-catalog';
import type { PhotoView, PresentationViewModel } from './types';

const escape = (text:string) => text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]!);

function actionButton(action:'flower-gear'|'flower-photo'|'night-gear',operation:string,label:string,attributes='') {
  return `<button type="button" class="sy-button" data-action="${action}" data-operation="${operation}" ${attributes}>${escape(label)}</button>`;
}

function selectPhoto(photos:PhotoView[],label:string,operation:string,selected?:string) {
  return `<label class="sy-flower-select"><span>${escape(label)}</span>
    <select data-flower-photo="${operation}" ${photos.length?'':'disabled'}>
      <option value="">${photos.length?'选择一张底片':'还没有符合的原片'}</option>
      ${photos.map(photo=>`<option value="${escape(photo.id)}"${photo.id===selected?' selected':''}>${escape(photo.title+' · '+photo.dateLabel)}</option>`).join('')}
    </select></label>`;
}

export function flowerGear(view:PresentationViewModel,photoArt:(photo?:PhotoView)=>string){
  const flowers=view.flowers;
  if(!flowers)return '';
  const {party,next,pair,repeat}=flowers;
  const commission=next?`<article class="sy-letter-card"><h3>${escape(next.title)}</h3><p>${escape(next.brief)}</p></article>`:'';
  const diptych=pair?`<article class="sy-letter-card"><h3>白日与夜色</h3>
    <div class="sy-flower-diptych">
      <div>${selectPhoto(pair.day,'白日行迹','day',pair.selectedDay)}${pair.selectedDay?photoArt(pair.day.find(photo=>photo.id===pair.selectedDay)):''}</div>
      <div>${selectPhoto(pair.night,'夜色记忆','night',pair.selectedNight)}${pair.selectedNight?photoArt(pair.night.find(photo=>photo.id===pair.selectedNight)):''}</div>
    </div>
    <p>选好后合上行囊，在邮格前按 E 寄出。</p></article>`:'';
  const revisit=repeat?`<article class="sy-letter-card"><h3>缺月灯重访</h3>
    ${repeat.reviewed?`<p>选一盒带走，可以选已经有的花样。</p><div class="sy-button-row">${FLOWER_ORDER.map(kind=>actionButton('flower-photo','redeem',FLOWERS[kind],`data-firework="${kind}"`)).join('')}</div>`
      :selectPhoto(repeat.photos,'交出新底片','repeat')}</article>`:'';
  if(!party)return commission+diptych+revisit;
  const canPlace=party.litSite&&party.here&&!view.night?.playing;
  const mayFill=canPlace&&party.boxes.length<party.capacity;
  const stock=party.slots.map(({kind,name,count,available,sample})=>`<li><strong>${escape(name)}</strong><span>实物 ${count}</span>
      ${mayFill&&available>0&&!party.invitationActive?actionButton('flower-gear','take',`取出${name}`,`data-firework="${kind}" data-source="stock"`):''}
      ${mayFill&&sample?actionButton('flower-gear','take',`取出${name}留样`,`data-firework="${kind}" data-source="sample"`):''}</li>`).join('');
  const placed=party.boxes.length?`<ul class="sy-flower-piles">${party.boxes.map(({name,nearby},i)=>
    `<li><span>${escape(name)} · 已摆</span>${nearby?actionButton('flower-gear','retrieve',`收回${name}`,`data-index="${i}"`):''}</li>`).join('')}</ul>`:'';
  const invitation=party.invitation?`<article class="sy-letter-card"><h3>满山赴约${party.witnessed?' · 已盖戳':''}</h3>
    <p>${party.invitationActive?'从十种留样中选三盒，定下主花和两处侧花。':'下回把它们都带来吧。你挑地方，我替你留着灯。'}</p>
    ${canPlace&&!party.boxes.length&&!party.invitationActive?actionButton('flower-gear','invite',party.started?'再次赴约':'赴阿禾的约'):''}</article>`:'';
  return commission+diptych+revisit+invitation+`<article class="sy-letter-card"><h3>花谱 · ${party.slots.length}/10</h3>
    <p>${party.capacity?`场地可摆 ${party.capacity} 盒，已摆 ${party.boxes.length} 盒。`:'持火把到镇外晒谷场或半山松台，打开行囊布置烟花。'}</p>
    <ul class="sy-flower-piles">${stock}</ul>${placed}
    <div class="sy-button-row">
    ${canPlace&&party.maySample&&!party.boxes.length&&!party.invitationActive?actionButton('flower-gear','sample','请阿禾留样'):''}
    ${party.here&&party.boxes.length?actionButton('flower-gear','clear','收回全部'):''}
    ${view.night?.placing?actionButton('night-gear','cancel','先不摆这一盒'):''}
    </div></article>`;
}
