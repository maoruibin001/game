// Real rendered presentation component; album shrinkage comes from its view prop.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from '../../../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
const game = fileURLToPath(new URL('../../../', import.meta.url));
const bundle = await build({ stdin:{resolveDir:game,loader:'ts',contents:`
import {createPresentation} from './assets/presentation/presentation.ts';
import {initialPresentationView} from './assets/presentation/types.ts';
const ui = createPresentation(document.querySelector('#ui'), {onAction() {}});
window.renderAlbum = length => ui.render({...initialPresentationView(),screen:'journal',
  album:Array.from({length}, (_, i) => ({id:'photo-'+i,title:'第 '+(i+1)+' 张照片',location:'回归照片'}))});
window.renderAlbum(0);
`}, bundle:true,format:'iife',platform:'browser',write:false});
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  await page.setContent('<main id="ui"></main>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.locator('[data-tab="album"]').click();
  await page.locator('[data-collection="album"]').click();
  const tiles = page.locator('.sy-album button.sy-photo-tile');
  const next = page.getByRole('button',{name:'下一页',exact:true});
  const prev = page.getByRole('button',{name:'上一页',exact:true});
  for (const n of [0,1,8,9,12]) {
    await page.evaluate(n=>window.renderAlbum(n),n);
    assert.equal(await tiles.count(),Math.min(8,n));
    assert.equal(await prev.isDisabled(),true);
    assert.equal(await next.isDisabled(),n<=8);
    assert.equal(await page.getByText(n<=8?'1 / 1':'1 / 2',{exact:true}).count(),1);
    if(n>8){
      await next.click();
      assert.equal(await tiles.count(),n-8);
      assert.equal(await next.isDisabled(),true);
      assert.equal(await page.getByText('2 / 2',{exact:true}).count(),1);
      if(n===12){
        await page.evaluate(()=>window.renderAlbum(8));
        assert.equal(await tiles.count(),8);
        assert.equal(await page.getByText('1 / 1',{exact:true}).count(),1);
      } else await prev.click();
    }
  }
  console.log('Album component: 0/1/8/9/12 items and automatic return to page 1 when the data shrinks.');
} finally { await browser.close(); }
