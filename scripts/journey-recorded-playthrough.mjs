// A recording wrapper around the unchanged normal-input acceptance route.
// The 3-second probe is QA overhead, not player content or a 75-second final edit.
import { mkdir, open, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runFullJourney } from './journey-full-playthrough.mjs';
import { beginNativeRecording, waitRecordingProbe, NATIVE_RECORDING_CONTRACT } from './native-recording.mjs';

const OUTPUT = fileURLToPath(new URL('../artifacts/video/', import.meta.url));

export async function runRecordedJourney(play, { runJourney = runFullJourney,
  outputDir = OUTPUT, probeDurationMs = 3_000 } = {}) {
  const metadataPath = join(outputDir, 'recording.json');
  const metadata = { schema: 1, status: 'not-started', source: 'official project play owner page',
    contract: NATIVE_RECORDING_CONTRACT, startedAfterStep: 'full-normal-start',
    requestedProbeSeconds: probeDurationMs / 1000, probeQaOverheadSeconds: 0,
    probe: null, full: null, gameplay: { outcome: 'running' },
    deliverable: 'raw full normal gameplay; final 75-second edit and media acceptance are pending',
    recordedAcceptance: false, errors: [] };
  let full, hooked = false, ownsMetadata = false, gameplayResult, gameplayError;
  const log = (event) => console.log(JSON.stringify({ name: 'native-video', ...event }));
  async function persist() {
    if (!ownsMetadata) return;
    try { await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`); }
    catch (error) { log({ status: 'metadata-write-failed', message: String(error) }); }
  }
  async function startAfterNormalStart() {
    if (hooked) return;
    hooked = true;
    const overheadStart = Date.now();
    try {
      await mkdir(outputDir, { recursive: true });
      const reserved = await open(metadataPath, 'wx');
      await reserved.close(); ownsMetadata = true;
      await persist();
      const probe = await beginNativeRecording({ page: play.page, signal: play.signal,
        outputPath: join(outputDir, 'probe.mp4'), purpose: '3-second QA capability probe, not content duration' });
      metadata.probe = probe.report;
      if (!probe.ok) { metadata.status = `video-${probe.report.status}`; return; }
      try { await waitRecordingProbe(probeDurationMs, play.signal); }
      finally { metadata.probe = await probe.finish(play.signal?.aborted ? 'aborted' : 'probe-completed'); }
      if (metadata.probe.status !== 'captured-structure-valid') {
        metadata.status = 'video-probe-failed'; return;
      }
      if (play.signal?.aborted) { metadata.status = 'video-aborted'; return; }
      full = await beginNativeRecording({ page: play.page, signal: play.signal,
        outputPath: join(outputDir, 'full-journey.mp4'), purpose: 'raw full normal-input journey' });
      metadata.full = full.report;
      metadata.status = full.ok ? 'recording-full-journey' : `video-${full.report.status}`;
    } catch (error) {
      metadata.errors.push({ stage: 'recording-hook', message: String(error) });
      metadata.status = play.signal?.aborted ? 'video-aborted' : 'video-failed';
    } finally {
      metadata.probeQaOverheadSeconds = (Date.now() - overheadStart) / 1000;
      log({ status: metadata.status, probeQaOverheadSeconds: metadata.probeQaOverheadSeconds,
        probe: metadata.probe, errors: metadata.errors });
      await persist();
    }
  }

  // Only this facade's step changes. The real PlayContext and all original route
  // inputs, state reads, assertions, reloads and screenshots remain unchanged.
  const facade = Object.create(play);
  Object.defineProperty(facade, 'step', { value: async (name, run) => {
    const result = await play.step(name, run);
    if (name === 'full-normal-start') await startAfterNormalStart();
    return result;
  } });
  try {
    gameplayResult = await runJourney(facade);
    metadata.gameplay = { outcome: 'completed', result: gameplayResult };
  } catch (error) {
    gameplayError = error;
    metadata.gameplay = { outcome: play.signal?.aborted ? 'aborted' : 'failed', message: String(error) };
  } finally {
    if (full?.ok) {
      metadata.full = await full.finish(play.signal?.aborted ? 'aborted' : gameplayError ? 'gameplay-failed' : 'completed');
      metadata.status = metadata.full.status === 'captured-structure-valid' ? 'raw-video-captured-unverified'
        : metadata.full.status === 'partial-structure-valid' ? 'partial-video-captured-unverified' : 'video-failed';
    }
    if (!hooked) metadata.status = 'not-started-normal-start-did-not-complete';
    await persist();
    log({ status: metadata.status, gameplay: metadata.gameplay.outcome,
      metadataPath: ownsMetadata ? metadataPath : null, full: metadata.full });
  }
  if (gameplayError) throw gameplayError; // Preserve the original acceptance failure.
  return { ...gameplayResult, video: { status: metadata.status,
    metadataPath: ownsMetadata ? metadataPath : null, probeQaOverheadSeconds: metadata.probeQaOverheadSeconds,
    acceptance: 'pending media decoding/listening and final 75-second edit; gameplay verdict is independent' } };
}

export default async function recordedJourneyPlaythrough(play) { return runRecordedJourney(play); }
