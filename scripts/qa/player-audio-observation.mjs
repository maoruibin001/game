import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { walking } from './letter-normal-input.mjs';

export default async function playerAudioObservation(play) {
  const page = play.page;
  const wait = (condition, timeoutMs = 10000) => play.waitFor(condition, { read: 'shan.journey', timeoutMs });
  // Observe the output of the existing effects/ambience compressor through a
  // parallel analyser and retain Web Audio's real oscillator start arguments.
  // No source, volume, input path or destination is replaced.
  await page.evaluate(() => {
    const starts = [];
    const frequencies = new WeakMap();
    const setFrequency = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function (value, time) {
      frequencies.set(this, value);
      return setFrequency.call(this, value, time);
    };
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (time) {
      const result = start.call(this, time);
      const frequency = frequencies.get(this.frequency);
      if (frequency >= 2100 && frequency <= 2700) starts.push({ frequency, time, contextTime: this.context.currentTime });
      return result;
    };
    const connect = AudioNode.prototype.connect;
    let meter;
    AudioNode.prototype.connect = function (...args) {
      const result = Reflect.apply(connect, this, args);
      if (this instanceof DynamicsCompressorNode && args[0] === this.context.destination && !meter) {
        meter = this.context.createAnalyser();
        Reflect.apply(connect, this, [meter]);
      }
      return result;
    };
    window.__shanyeAudioObservation = () => {
      if (!meter) return { starts: [], peak: 0, time: 0 };
      const values = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(values);
      return { starts: [...starts], peak: Math.max(...values.map(Math.abs)), time: meter.context.currentTime };
    };
  });
  const readAudio = () => page.evaluate(() => window.__shanyeAudioObservation());
  const record = {};
  await play.step('Start from the menu and keep making normal UI gestures while the ambience plays', async () => {
    await page.getByRole('button', { name: '背上行囊，出发', exact: true }).click();
    await wait(walking);
    const started = await readAudio();
    const pocket = page.locator('[data-action="pocket-map-toggle"]');
    let count = 0, sample = started, quietPeak = 0, maxGap = 0;
    while (sample.time - started.time < 5 && count < 40) {
      await pocket.click();
      await play.wait(220);
      const previous = sample;
      sample = await readAudio();
      maxGap = Math.max(maxGap, sample.time - previous.time);
      if (sample.starts.length === 0) quietPeak = Math.max(quietPeak, sample.peak);
      count++;
    }
    const music = (await wait(s => s.frontend?.music.phase === 'playing' && s.frontend.music.cue === 'normal')).frontend.music;
    assert.equal(started.starts.length, 0);
    assert.ok(count >= 5 && maxGap < 2.8, 'gestures must occur more often than the old bird postponement window');
    assert.ok(sample.starts.length >= 1, 'the first bird must still start while gestures keep arriving');
    assert.ok(quietPeak > .00005, 'the original ambience compressor must output sound before the first bird');
    record.morning = { gestures: count, maxGap, started, sample, quietPeak, music };
    await play.screenshot('post-office-native-music-and-natural-sound');
  });
  await play.step('Hear a different environmental mix after using the normal rain controls', async () => {
    await page.getByRole('button', { name: '打开摄影日程' }).click();
    await page.locator('[data-action="set-creative-mode"][data-enabled="true"]').click();
    await page.getByRole('button', { name: '细雨', exact: true }).click();
    await page.locator('button.sy-close:visible').click();
    await play.advance(12, { read: 'shan.journey' });
    const rain = await wait(s => walking(s) && s.environment.weather === 'rain' && s.environment.settled);
    assert.ok(rain.environment.rain > .5);
    await play.wait(300);
    const sample = await readAudio();
    assert.ok(sample.peak > record.morning.quietPeak, 'rain should add energy to the same environmental output');
    assert.equal(rain.frontend.music.cue, 'normal');
    record.rain = { amount: rain.environment.rain, wind: rain.environment.wind, sample, music: rain.frontend.music };
    await play.screenshot('rain-changes-ambience-but-keeps-the-music-cue');
  });
  const directory = fileURLToPath(new URL('../../.forgeax/diag/player-audio/', import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/live-audio.json', JSON.stringify(record, null, 2) + '\n');
}
