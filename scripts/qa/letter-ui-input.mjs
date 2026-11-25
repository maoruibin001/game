// Keyboard traversal of the normal three-letter UI. No selectors or DOM access.
import assert from 'node:assert/strict';
import {walking} from './letter-normal-input.mjs';
const distinct=photos=>[...new Map(photos.map(p=>[p.id,p])).values()];
const candidates=letter=>distinct([...(letter.photo?[letter.photo]:[]),...letter.candidates]);
const recordPhoto=(s,id)=>id==='final'?s.state.durable.endingPhoto:s.state.durable.replyPhotos[id]?.photo??null;
const recordNote=(s,id)=>id==='final'?s.state.durable.endingNote:s.state.durable.replyPhotos[id]?.note??'';
const buttonsBeforeLetter=letter=>letter.photo?3:letter.status!=='answered'?candidates(letter).length:0;
const allPhotos=v=>distinct([...(v.replies?.items.flatMap(l=>[...l.candidates,...(l.photo?[l.photo]:[])])??[]),
  ...(v.replies?.final.photo?[v.replies.final.photo]:[]),...(v.endingPhoto?[v.endingPhoto]:[]),
  ...(v.memories?.flatMap(m=>[...m.replacementPhotos,...(m.photo?[m.photo]:[])])??[]),...v.album,...(v.film??[]),
  ...(v.pendingPhoto?[v.pendingPhoto]:[]),...(v.outings?.slots.flatMap(s=>s.photo?[s.photo]:[])??[]),...(v.outings?.tracked?.photo?[v.outings.tracked.photo]:[])]).filter(p=>Boolean(p.imageUrl));

export function createLetterUi(h){
  async function open(){await h.wait(walking);await h.key('KeyJ');return h.wait(s=>s.state.runtime.screen==='journal'&&s.controller.paused&&s.view?.replies);}
  const close=async()=>{await h.key('Escape');return h.wait(walking);};
  async function pickAndConfirm({id,photoId,photos,index,noteOptions,before}){
    assert.ok(index>=0&&index<photos.length);const notes=['',...new Set(noteOptions.filter(Boolean))];assert.ok(notes.length>1,'this actual photograph must offer a nonempty preset');
    await h.key('Enter');let selected=await h.read();
    assert.equal(recordPhoto(selected,id)?.id??null,recordPhoto(before,id)?.id??null,'candidate click must not commit a reply');
    h.record(`${id}-${photoId}-normal-preview-before-confirm`,selected);
    // Keep relative keyboard traversal uninterrupted: official 0.5.0 screenshot
    // canvas-witness hides UI and moves its active control focus to BODY.
    // Readonly precommit evidence stays here; screenshot follows confirmation.
    await h.tabs(photos.length-1-index+2);await h.key('Enter');selected=await h.read();
    assert.equal(recordPhoto(selected,id)?.id??null,recordPhoto(before,id)?.id??null,'note click must not commit a reply');
    assert.equal(recordNote(selected,id),recordNote(before,id),'note choice remains local until confirmation');
    // First nonempty note is index 1; the confirm button follows all notes.
    await h.tabs(notes.length-1);await h.key('Enter');
    const confirmed=await h.wait(s=>recordPhoto(s,id)?.id===photoId&&recordNote(s,id)===notes[1]);
    await h.shot(`${id}-${photoId}-explicitly-confirmed`);await close();return{photoId,note:notes[1],original:recordPhoto(confirmed,id).original};
  }
  async function selectReply(id,photoId){
    assert.ok(id==='forest'||id==='town');const before=await open(),items=before.view.replies.items,index=items.findIndex(l=>l.id===id);assert.ok(index>=0);
    const letter=items[index],photos=candidates(letter),photoIndex=photos.findIndex(p=>p.id===photoId),photo=photos[photoIndex];assert.ok(photo?.originalKey);
    // Dialog close + three journal tabs precede the normal letter controls.
    const preceding=4+items.slice(0,index).reduce((sum,l)=>sum+buttonsBeforeLetter(l),0);
    if(letter.status==='answered'){
      assert.ok(letter.photo);await h.tabs(preceding+3);await h.key('Enter'); // picture, export, edit
      await h.tabs(photoIndex+1); // from edit to this candidate
    }else await h.tabs(preceding+photoIndex+1);
    return pickAndConfirm({id,photoId,photos,index:photoIndex,noteOptions:photo.noteOptions??[],before});
  }
  async function selectFinal(photoId){
    const before=await open(),v=before.view;assert.ok(v.replies.final.ready);assert.equal(v.replies.final.photo,undefined,'fresh story final choice is expected');
    const photos=allPhotos(v),index=photos.findIndex(p=>p.id===photoId);assert.ok(index>=0&&photos[index].originalKey);
    assert.ok(v.replies.items.every(l=>l.status==='answered'&&l.photo));
    await h.tabs(4+v.replies.items.reduce((sum,l)=>sum+buttonsBeforeLetter(l),0)+1);await h.key('Enter'); // final edit
    await h.tabs(index+1);
    return pickAndConfirm({id:'final',photoId,photos,index,noteOptions:v.replies.final.noteOptions??[],before});
  }
  return {open,close,selectReply,selectFinal};
}
