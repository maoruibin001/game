// Reproducible regression for the ending postmark "已经寄出" / "见山 · 见风"
// text-overlap warning. Mirrors the SDK play-layout rule: two text line boxes
// warn when they share >= 4px horizontally and >= max(4px, 0.35 * lineHeight)
// vertically. Uses the real presentation CSS and the real ending DOM shape.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import {chromium} from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';

const game = fileURLToPath(new URL('../../../', import.meta.url));
const out = new URL('../../../../production/ui-checks/ending-stamp-layout/', import.meta.url);
await mkdir(out, {recursive: true});

const source = [
  "import {PRESENTATION_CSS,SHORT_VIEWPORT_CSS,ENDING_VIEWPORT_CSS} from './assets/presentation/style.ts';",
  "const style=document.createElement('style');style.textContent=[PRESENTATION_CSS,SHORT_VIEWPORT_CSS,ENDING_VIEWPORT_CSS].join('\\n');document.head.append(style);",
  "document.body.style.margin='0';",
  "document.body.innerHTML='<div class=\"sy-ui\"><div class=\"sy-overlay sy-ending\"><section class=\"sy-ending-sheet\"><div class=\"sy-ending-top\"><div><div class=\"sy-eyebrow\">THREE LETTERS FROM THE VALLEY</div><h2>山野已经回信</h2></div><div class=\"sy-stamp\"><span>已经寄出</span><small>见山 · 见风</small></div></div></section></div></div>';",
  "const rects=el=>{const r=document.createRange();r.selectNodeContents(el);return [...r.getClientRects()].map(x=>({x:x.x,y:x.y,width:x.width,height:x.height}));};",
  "window.stampOverlap=()=>{",
  " const a=rects(document.querySelector('.sy-stamp span')),b=rects(document.querySelector('.sy-stamp small'));",
  " const lineHeight=Math.min(...[...a,...b].map(r=>r.height));",
  " let sharedWidth=0,sharedHeight=0;",
  " for(const x of a)for(const y of b){sharedWidth=Math.max(sharedWidth,Math.min(x.x+x.width,y.x+y.width)-Math.max(x.x,y.x));sharedHeight=Math.max(sharedHeight,Math.min(x.y+x.height,y.y+y.height)-Math.max(x.y,y.y));}",
  " const threshold=Math.max(4,.35*lineHeight);",
  " return {span:a,small:b,sharedWidth,sharedHeight,threshold,warning:sharedWidth>=4&&sharedHeight>=threshold};",
  "};",
].join('\n');

const built = await build({stdin: {resolveDir: game, loader: 'ts', contents: source},
  bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent'});
const browser = await chromium.launch({headless: true, args: ['--disable-gpu']});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
const checks = [];
try {
  await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
  await page.addScriptTag({content: built.outputFiles[0].text});
  for (const [width, height] of [[1920, 1080], [1280, 720], [1280, 600]]) {
    await page.setViewportSize({width, height});
    const r = await page.evaluate(() => window.stampOverlap());
    assert.equal(r.span.length, 1, 'postmark headline must stay on one line');
    assert.equal(r.small.length, 1, 'postmark caption must stay on one line');
    assert.equal(r.warning, false, `postmark text overlaps at ${width}x${height}: shared height ${r.sharedHeight}`);
    checks.push({viewport: [width, height], sharedWidth: Math.round(r.sharedWidth * 100) / 100,
      sharedHeight: Math.round(r.sharedHeight * 100) / 100, threshold: Math.round(r.threshold * 100) / 100});
    await page.screenshot({path: fileURLToPath(new URL(`stamp-${width}x${height}.png`, out))});
  }
  await writeFile(new URL('RESULT.json', out), JSON.stringify({
    scope: 'real presentation CSS and ending postmark DOM; SDK text-overlap geometry reproduced locally',
    passed: true, checks}, null, 2) + '\n');
  console.log(JSON.stringify({passed: true, viewports: checks.length, checks}));
} finally {
  await browser.close();
}
