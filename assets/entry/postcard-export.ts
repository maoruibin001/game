/** A player-authored keepsake, composed from the retained original, never a thumbnail. */
export interface PostcardText { title: string; location: string; date: string; weather: string; note: string }
async function loadOriginal(document: Document, originalUrl: string) {
  const image = document.createElement('img');
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ''; reject(new Error('原照解码超时，请稍后重试。')); }, 6000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('原照无法读取，未用缩略图替代。')); };
    image.src = originalUrl;
  });
  if (image.naturalWidth < 1 || image.naturalHeight < 1) throw new Error('原照尺寸无效，尚未生成明信片。');
  return image;
}
export async function composePostcard(document: Document, originalUrl: string, text: PostcardText): Promise<Blob> {
  const image = await loadOriginal(document,originalUrl);
  const canvas = document.createElement('canvas'); canvas.width = 2160; canvas.height = 1500;
  const c = canvas.getContext('2d'); if (!c) throw new Error('浏览器未提供明信片绘制能力。');
  c.fillStyle = '#f1ead7'; c.fillRect(0, 0, 2160, 1500);
  // Fit the entire native image into the print; preserve the player's composition.
  const scale = Math.min(2016 / image.naturalWidth, 1134 / image.naturalHeight);
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
  c.fillStyle = '#ded8c7'; c.fillRect(72, 72, 2016, 1134);
  c.drawImage(image, 72 + (2016 - w) / 2, 72 + (1134 - h) / 2, w, h);
  c.fillStyle = '#274a42'; c.font = '36px "Songti SC", "Noto Serif CJK SC", serif';
  c.fillText(text.title.slice(0, 32), 82, 1276, 1480);
  c.font = '23px sans-serif'; c.fillStyle = '#647365';
  c.fillText([text.location, text.date, text.weather].filter(Boolean).join(' · '), 84, 1327, 1550);
  c.font = '28px "Songti SC", "Noto Serif CJK SC", serif'; c.fillStyle = '#344e43';
  let line = '', y = 1383;
  for (const char of text.note.trim().slice(0, 120)) {
    if (c.measureText(line + char).width > 1490) { c.fillText(line, 84, y); y += 44; line = ''; }
    if (y > 1430) break;
    line += char;
  }
  if (line) c.fillText(line, 84, y);
  c.save(); c.translate(1915, 1342); c.rotate(-.12); c.strokeStyle = '#a95d45'; c.fillStyle = '#a95d45'; c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 91, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(0, 0, 81, 0, Math.PI * 2); c.stroke();
  c.textAlign = 'center'; c.font = '25px "Songti SC", serif'; c.fillText('拍一卷山色', 0, -5);
  c.font = '14px sans-serif'; c.fillText('A MOMENT TO KEEP', 0, 27); c.restore();
  c.fillStyle = '#819080'; c.font = '15px sans-serif'; c.fillText('拍一卷山色  /  MOUNTAIN PHOTOGRAPHY', 84, 1462);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('明信片没有成功编码，请保留原照重试。')), 'image/jpeg', .94));
}

/** Print both original landscape frames uncropped, with their actual recipient's reply. */
export async function composeRouteLetter(doc:Document, turn:string, destination:string, response:string):Promise<Blob> {
  const images = await Promise.all([loadOriginal(doc,turn),loadOriginal(doc,destination)]);
  const canvas=doc.createElement('canvas'); canvas.width=2400; canvas.height=1360;
  const c=canvas.getContext('2d'); if(!c) throw new Error('浏览器无法绘制信纸。');
  c.fillStyle='#f4efdf'; c.fillRect(0,0,2400,1360);
  c.fillStyle='#385246'; c.font='64px "Songti SC", serif'; c.fillText('东岭指路',80,130);
  c.fillStyle='#765e46'; c.font='30px serif'; c.fillText('阿禾收  ·  山口邮局',1770,125);
  const labels=['①  在哪拐 · 东岭长椅旁的红箭头','②  走到哪 · 西坡脚下的风车'];
  images.forEach((img,i)=>{
    const x=80+i*1140, y=205, w=1100, h=619, scale=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const iw=img.naturalWidth*scale, ih=img.naturalHeight*scale;
    c.fillStyle='#ded8c8'; c.fillRect(x,y,w,h); c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
    c.fillStyle='#654e3b'; c.font='36px "Songti SC", serif'; c.fillText(labels[i]!,x,895);
  });
  c.fillStyle='#b4a58c'; c.fillRect(80,955,2240,2);
  c.fillStyle='#924c3a'; c.font='32px serif'; c.fillText('阿禾的回信',80,1030);
  c.fillStyle='#364c42'; c.font='38px "Songti SC", serif';
  let line='', y=1110;
  for(const char of response){if(c.measureText(line+char).width>2200){c.fillText(line,80,y);line='';y+=60;}line+=char;}
  if(line)c.fillText(line,80,y);
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('双照回信编码失败。')),'image/jpeg',.95));
}
