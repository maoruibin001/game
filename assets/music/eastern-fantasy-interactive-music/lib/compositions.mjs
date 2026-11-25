// Original composition written for 山野来信 on 2026-11-16 with AI assistance.
// No pre-existing melody, score, recording or MIDI was used as composition input.
// Pitches, onset rhythms, voicings, phrasing and form below are the editable source.

const D = [50, 57, 64, 66], Bm = [47, 54, 62, 66], G = [43, 50, 59, 66];
const A = [45, 52, 62, 64], Em = [40, 47, 55, 62];

export const COMPOSITIONS = {
  normal: {
    title: '山野来信 · 邮路微光', bpm: 88, bars: 20, oneShot: false,
    form: 'A / answered A / open B / descending reply / empty road',
    harmony: [D, D, Bm, G, D, Bm, G, A, Em, G, D, A, Bm, G, Em, A, D, A, D, D],
    phrases: [
      { bar: 1, velocity: .30, notes: [[1,74,1.25],[3,69,.75],[4,76,1.25],[6,78,.75],[7.25,74,1.5]] },
      { bar: 5, velocity: .27, notes: [[0,71,1.5],[2.5,74,.75],[3.5,78,1.25],[5.25,76,1.75],[7.5,69,.75]] },
      { bar: 9, velocity: .32, notes: [[0,76,1.25],[1.75,78,.75],[3,81,1.25],[4.75,78,1],[6.5,74,1.75]] },
      { bar: 14, velocity: .26, notes: [[.5,78,1],[2,76,1.5],[4,71,1.25],[6,69,1],[7.5,74,2]] },
    ],
    pluckReplies: [[3,2,69,.17],[3,3.25,76,.13],[7,2,66,.13],[7,3,69,.12],[12,2.25,74,.16],[12,3.25,71,.12],[18,.5,74,.18],[18,2.25,69,.12],[19,.75,66,.10]],
    harmonics: [[0,1.5,78,.12],[4,3,81,.10],[8,2,78,.11],[13,1.5,81,.12],[17,2,76,.10]],
  },
  vista: {
    title: '山野来信 · 风把山展开', bpm: 96, bars: 12, oneShot: false,
    form: 'ascending opening / high answer / broad return',
    harmony: [D,G,Bm,A,G,D,Em,A,Bm,G,A,D],
    phrases: [
      { bar: 0, velocity: .31, notes: [[1,74,1.5],[3,81,.75],[4.5,76,1.25],[6,78,1.5],[8,81,1.75]] },
      { bar: 4, velocity: .33, notes: [[0,78,1.5],[2,81,1],[3.5,83,.75],[5,81,1.5],[7,76,1.5]] },
      { bar: 8, velocity: .29, notes: [[0,78,1.75],[2.5,76,1.25],[4.5,74,1.5],[6.5,69,.75],[8,74,2.25]] },
    ],
    pluckReplies: [[3,1,78,.16],[3,2.5,76,.13],[7,.75,81,.16],[7,2.25,78,.14],[11,.5,76,.12]],
    harmonics: [[0,0,86,.12],[2,3,81,.11],[4,1,83,.10],[6,3,81,.11],[9,0,86,.11]],
  },
  outro: {
    title: '山野来信 · 寄给明天', bpm: 88, bars: 4, oneShot: true,
    form: 'motif returned quietly / suspended note / home',
    harmony: [G,A,D,D],
    phrases: [
      { bar: 0, velocity: .26, notes: [[.75,74,1.25],[2.5,78,1],[4,76,1.5],[6,69,1],[8,74,3]] },
    ],
    pluckReplies: [[0,.25,66,.13],[1,3,64,.12],[2,.25,62,.15]],
    harmonics: [[2,1,78,.12]],
  },
};

export function compose(cue) {
  const source = COMPOSITIONS[cue];
  if (!source) throw new Error(`Unknown original cue: ${cue}`);
  const beatSeconds = 60 / source.bpm, tracks = { [cue]: [] }, events = tracks[cue];
  const add = (instrument, beat, midi, velocity, options) => events.push({ instrument, time: beat * beatSeconds, midi, velocity, ...(options ? { options } : {}) });
  source.harmony.forEach((chord, bar) => {
    // The final four normal bars deliberately leave more air; no mechanical beat loop.
    const quiet = cue === 'normal' && bar >= 16;
    const finalOutro = cue === 'outro' && bar >= 3;
    if (finalOutro) return;
    add('guzheng', bar * 4 + .08, chord[0], quiet ? .075 : .10, { T60: 2.6, bright: .24 });
    const offsets = cue === 'vista' ? [.75, 1.75, 3.1] : (bar % 3 === 1 ? [1.5] : [1.25, 3]);
    for (let i = 0; i < offsets.length; i++) {
      if (quiet && i > 0) continue;
      add('guzheng', bar * 4 + offsets[i], chord[1 + ((bar + i) % 3)], (quiet ? .08 : .115) + (i === 0 ? .012 : 0), { T60: 2.1, bright: .32 });
    }
  });
  for (const phrase of source.phrases) {
    const notes = phrase.notes.map(([offset, midi, duration]) => ({ t: (phrase.bar * 4 + offset) * beatSeconds, m: midi, d: duration * beatSeconds }));
    events.push({ instrument: 'xiao', time: notes[0].t, midi: notes[0].m, velocity: phrase.velocity, notes });
  }
  for (const [bar, offset, midi, velocity] of source.pluckReplies) add('guzheng', bar * 4 + offset, midi, velocity, { T60: 2.8, bright: .34, vib: .04 });
  for (const [bar, offset, midi, velocity] of source.harmonics) add('harmonic', bar * 4 + offset, midi, velocity, { T60: 3.2 });
  events.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return { id: `shanye-original-${cue}-20261116`, title: source.title, bpm: source.bpm, bars: source.bars, loopSeconds: source.bars * 4 * beatSeconds, oneShot: source.oneShot, tracks };
}
