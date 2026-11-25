import assert from 'node:assert/strict';

export default async function endingLayoutCheck(play) {
  await play.waitFor(s => s.restored && s.state.runtime.screen === 'menu', { read: 'shan.journey', timeoutMs: 15000 });
  await play.keyboard.press('Tab');
  await play.keyboard.press('Enter');
  await play.waitFor(s => s.state.runtime.screen === 'play' && s.controller.mode === 'walk', { read: 'shan.journey', timeoutMs: 10000 });
  // Take one normal photo at spawn, open journal, check stamp layout, then return to play
  await play.keyboard.press('KeyC');
  await play.waitFor(s => s.state.runtime.screen === 'photo' && s.controller.mode === 'photo', { read: 'shan.journey', timeoutMs: 10000 });
  await play.keyboard.press('Space');
  const after = await play.waitFor(s => s.state.durable.totalPhotos === 1, { read: 'shan.journey', timeoutMs: 12000 });
  assert.equal(after.state.durable.film.length, 1);
  // Open journal to inspect .sy-stamp layout on postcards & replies
  await play.keyboard.press('KeyJ');
  await play.waitFor(s => s.state.runtime.screen === 'journal', { read: 'shan.journey', timeoutMs: 5000 });
  await play.screenshot('journal-stamp-check');
}
