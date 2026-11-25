// Test-side capture of the borrowed official owner Page. No browser launch,
// page evaluation, game commands, or ownership of Page/Context/Browser lifetime.
import { open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const NATIVE_RECORDING_CONTRACT = Object.freeze({
  transport: 'same-owner Playwright CDPSession / Page.startScreenRecording',
  request: { audio: true, maxWidth: 1280, maxHeight: 720, frameRate: 30 },
  codecExpectation: { container: 'MP4', video: 'AV1', audio: 'Opus' },
  codecEvidence: 'Chromium source contract only; actual file codecs are not yet probed',
  actualMediaProbe: 'pending: codecs, decoded frames, audio audibility, media duration and playback',
});

const message = (error) => error instanceof Error ? error.message : String(error);
function bounded(promise, ms, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms} ms`)), ms);
  })]).finally(() => clearTimeout(timer));
}

/** A 3-second wall-clock QA probe, never a game clock or experience-duration claim. */
export async function waitRecordingProbe(ms, signal) {
  if (signal?.aborted) throw new Error('recording-probe-aborted');
  await new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const abort = () => finish(new Error('recording-probe-aborted'));
    const timer = setTimeout(() => finish(), ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** Container structure only. This does not prove decoding, sound or duration. */
export async function inspectMp4Structure(path) {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const counts = {}, firstBoxes = [];
    let offset = 0, mediaBytes = 0, majorBrand = null;
    while (offset < size) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await file.read(header, 0, Math.min(16, size - offset), offset);
      if (bytesRead < 8) throw new Error(`truncated MP4 box at ${offset}`);
      let length = header.readUInt32BE(0), headerBytes = 8;
      const type = header.toString('ascii', 4, 8);
      if (length === 1) {
        if (bytesRead < 16) throw new Error('truncated extended MP4 box');
        const extended = header.readBigUInt64BE(8);
        if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MP4 box too large');
        length = Number(extended); headerBytes = 16;
      } else if (length === 0) length = size - offset;
      if (length < headerBytes || offset + length > size) throw new Error(`invalid ${type} box extent`);
      counts[type] = (counts[type] ?? 0) + 1;
      if (firstBoxes.length < 12) firstBoxes.push({ type, offset, bytes: length });
      if (type === 'ftyp') {
        if (length < headerBytes + 8) throw new Error('incomplete MP4 ftyp');
        const brand = Buffer.alloc(4);
        await file.read(brand, 0, 4, offset + headerBytes);
        majorBrand = brand.toString('ascii');
      }
      if (type === 'mdat') mediaBytes += length - headerBytes;
      offset += length;
    }
    if (!counts.ftyp || !counts.moov || mediaBytes === 0) {
      throw new Error('MP4 requires ftyp, moov and nonempty mdat');
    }
    return { valid: true, bytes: size, majorBrand, counts, firstBoxes, mediaBytes,
      scope: 'top-level MP4 boxes and nonempty encoded media only; not decoded acceptance' };
  } finally { await file.close(); }
}

/**
 * Returns {ok, report, finish?}. finish is idempotent and never throws: recording
 * failures are evidence beside gameplay, never a replacement gameplay verdict.
 * Existing output files are protected with wx. Cleanup owns only its CDP session,
 * returned IO stream handles and filesystem handle, never the borrowed page.
 */
export async function beginNativeRecording({ page, outputPath, signal, purpose }) {
  const report = { purpose, outputPath, status: 'starting', contract: NATIVE_RECORDING_CONTRACT,
    startedAt: null, stoppedAt: null, wallRecordingSeconds: null, streamEof: false,
    bytes: 0, sha256: null, structure: null, errors: [], cleanup: {} };
  let cdp, file, accepted = false, uncertainStart = false, finishing;
  let stream, startedMs;
  const handles = new Set();
  const digest = createHash('sha256');
  const send = (method, params = {}, ms = 15_000) => bounded(cdp.send(method, params), ms, method);
  const recordError = (stage, error) => report.errors.push({ stage, message: message(error) });
  const onAbort = () => { void finish('aborted'); };

  async function cleanup() {
    signal?.removeEventListener('abort', onAbort);
    for (const handle of handles) {
      try { await send('IO.close', { handle }, 5_000); }
      catch (error) { recordError('IO.close', error); }
    }
    report.cleanup.streamHandles = handles.size;
    if (file) {
      try { await file.close(); report.cleanup.fileClosed = true; }
      catch (error) { recordError('file.close', error); }
      file = undefined;
    }
    if (cdp) {
      try { await bounded(cdp.detach(), 5_000, 'CDPSession.detach'); report.cleanup.detached = true; }
      catch (error) { recordError('CDPSession.detach', error); }
    }
  }

  async function finishOnce(reason) {
    report.endReason = reason;
    report.stoppedAt = new Date().toISOString();
    report.wallRecordingSeconds = startedMs === undefined ? 0 : (Date.now() - startedMs) / 1000;
    try {
      if (accepted || uncertainStart) {
        try {
          const stopped = await send('Page.stopScreenRecording', {}, 30_000);
          if (stopped.stream) { stream = stopped.stream; handles.add(stream); }
        } catch (error) {
          recordError('Page.stopScreenRecording', error);
          // Preserve any already-produced bytes through the start handle when
          // possible, but a failed stop can never pass the capability probe.
        }
      }
      if (!stream) throw new Error('recording returned no IO stream handle');
      const deadline = Date.now() + 60_000;
      let emptyReads = 0;
      while (!report.streamEof) {
        if (Date.now() > deadline) throw new Error('IO stream drain exceeded 60 seconds');
        const chunk = await send('IO.read', { handle: stream, size: 1024 * 1024 }, 10_000);
        if (typeof chunk.data !== 'string') throw new Error('IO.read missing data');
        const bytes = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
        if (bytes.length) {
          emptyReads = 0;
          if (report.bytes + bytes.length > 2 * 1024 ** 3) throw new Error('recording exceeds 2 GiB drain bound');
          await file.writeFile(bytes);
          digest.update(bytes); report.bytes += bytes.length;
        } else if (!chunk.eof && ++emptyReads > 3) throw new Error('IO stream made no progress');
        report.streamEof = chunk.eof === true;
      }
      report.sha256 = digest.digest('hex');
      await file.sync();
      report.structure = await inspectMp4Structure(outputPath);
      report.status = reason === 'completed' || reason === 'probe-completed'
        ? 'captured-structure-valid' : 'partial-structure-valid';
    } catch (error) {
      recordError('finish', error); report.status = 'failed';
    } finally { await cleanup(); }
    // A leaked stream/session is not a passing probe even if its bytes were valid.
    if (report.errors.length) report.status = 'failed';
    return report;
  }
  function finish(reason = 'completed') {
    finishing ??= finishOnce(reason);
    return finishing;
  }

  try {
    if (signal?.aborted) throw new Error('recording-start-aborted');
    await mkdir(dirname(outputPath), { recursive: true });
    file = await open(outputPath, 'wx');
    let attachExpired = false;
    const attachment = page.context().newCDPSession(page).then(async (session) => {
      if (attachExpired) {
        // A late attach after the deadline must not leak our owned session.
        try { await session.detach(); } catch (error) { recordError('late-CDPSession.detach', error); }
        throw new Error('newCDPSession resolved after its deadline');
      }
      return session;
    });
    try { cdp = await bounded(attachment, 15_000, 'newCDPSession'); }
    catch (error) { attachExpired = true; throw error; }
    if (signal?.aborted) throw new Error('recording-start-aborted');
    let started;
    try { started = await send('Page.startScreenRecording', NATIVE_RECORDING_CONTRACT.request); }
    catch (error) {
      uncertainStart = message(error).includes('Page.startScreenRecording: timed out');
      throw error;
    }
    accepted = true;
    stream = started.stream;
    if (stream) handles.add(stream);
    if (!stream) throw new Error('Page.startScreenRecording accepted without a stream');
    startedMs = Date.now(); report.startedAt = new Date(startedMs).toISOString();
    report.status = 'recording';
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    return { ok: true, report, finish };
  } catch (error) {
    recordError('start', error);
    if (accepted || uncertainStart) await finish('start-failed');
    else await cleanup();
    report.status = signal?.aborted ? 'aborted' : /wasn.t found|not found|not supported|unknown method|Screencast is already active/i.test(message(error))
      ? 'unsupported' : 'failed';
    return { ok: false, report };
  }
}
