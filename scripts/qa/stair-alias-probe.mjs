// Deterministic fixed-view diagnostic for terrace riser aliasing.
// Ordinary menu start and fixed-duration forward holds only; no mouse drag,
// no state injection, no saved-game writes. Each capture records the real
// controller position/yaw so two runs can be proven comparable.
import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const OUT = fileURLToPath(new URL('../../../production/stair-alias/', import.meta.url));

export default async function stairAliasProbe(play) {
  await mkdir(OUT, {recursive: true});
  const read = 'shan.journey';
  await play.waitFor(s => s.restored && s.state.runtime.screen === 'menu', {read, timeoutMs: 15000});
  await play.keyboard.press('Tab');
  await play.keyboard.press('Enter');
  await play.waitFor(s => s.state.runtime.screen === 'play' && s.controller.mode === 'walk', {read, timeoutMs: 10000});
  await play.wait(600);
  const shots = [];
  const shot = async name => {
    const s = await play.state(read);
    const cap = await play.screenshot(name);
    const file = join(OUT, `${name}.png`);
    await copyFile(cap.path, file);
    shots.push({name, file, rendered: cap.rendered,
      position: s.controller.position, yaw: s.controller.yaw, pitch: s.controller.pitch});
  };
  await shot('01-spawn');
  for (let i = 1; i <= 3; i++) {
    await play.keyboard.hold('KeyW', 1800);
    await play.wait(250);
    await shot(`02-walk-${i}`);
  }
  await writeFile(join(OUT, 'capture.json'), JSON.stringify({capturedAt: new Date().toISOString(), shots}, null, 2) + '\n');
  return {status: 'captured', shots: shots.length};
}
