// Original Shanshui DSP and fixed-score arrangement. I/O removed; equations unchanged.
// Upstream MIT license: README.md (Shanshui MIT).
function bridge(ch,n=12000){for(const x of ch){const mid=(x[0]+x[x.length-1])/2;for(let i=0;i<n;i++){const w=0.5+0.5*Math.cos(Math.PI*i/n);x[i]=x[i]*(1-w)+mid*w;x[x.length-1-i]=x[x.length-1-i]*(1-w)+mid*w;}}return ch;}
export function synthesize(recipe,key){
const oneShot=recipe.oneShot===true,isBridge=key.startsWith('bridge-'),SR=48000,LOOP=isBridge?4.5:recipe.loopSeconds,FRAMES=Math.round(LOOP*SR),LEN=FRAMES*2,DURATION=LOOP*2;
// ------------------------------------------------------------------ utils
function rngOf(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const dbToLin = (db) => Math.pow(10, db / 20);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// piecewise-linear automation from [[t, v], ...]
function envOf(points) {
  return (t) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i][0]) { const [t0, v0] = points[i - 1], [t1, v1] = points[i]; const u = (t - t0) / (t1 - t0); return v0 + (v1 - v0) * (u * u * (3 - 2 * u)); }
    }
    return points[points.length - 1][1];
  };
}

class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) { this.set(type, f, q, gainDb); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = 2 * Math.PI * clamp(f, 10, SR * 0.49) / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === 'hs') { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
  run(buf) { for (let i = 0; i < buf.length; i++) buf[i] = this.p(buf[i]); return buf; }
}

function pinkGen(rnd) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => { const w = rnd() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926; return o * 0.11; };
}
// smooth random LFO in [-1, 1]
function lfoGen(rnd, rate) {
  const pts = Array.from({ length: Math.ceil(DURATION * rate) + 4 }, () => rnd() * 2 - 1);
  return (t) => { const x = t * rate, i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return pts[i] + (pts[i + 1] - pts[i]) * u; };
}

// stereo bus
const bus = () => [new Float32Array(LEN), new Float32Array(LEN)];
// add a mono buffer at time t with gain and constant-power pan (-1..1); 6 ms fade at its end
function place(dst,buf,t,gain=1,pan=0){const base=Math.round(t*SR),a=(clamp(pan,-1,1)+1)*Math.PI/4;for(let k=0;k<buf.length;k++){let i=base+k;if(isBridge||oneShot){if(i<0||i>=FRAMES)continue;}else i=((i%FRAMES)+FRAMES)%FRAMES;const tail=Math.min(1,(buf.length-k)/(.006*SR));dst[0][i]+=buf[k]*tail*gain*Math.cos(a);dst[1][i]+=buf[k]*tail*gain*Math.sin(a);}}

function addBus(dst, src, gain = 1) { for (let c = 0; c < 2; c++) for (let i = 0; i < LEN; i++) dst[c][i] += src[c][i] * gain; }

// ------------------------------------------------------------------ reverb (Freeverb)
class Comb { constructor(n) { this.b = new Float32Array(n); this.i = 0; this.s = 0; } p(x, fb, d) { const y = this.b[this.i]; this.s = y * (1 - d) + this.s * d; this.b[this.i] = x + this.s * fb; if (++this.i >= this.b.length) this.i = 0; return y; } }
class AP { constructor(n) { this.b = new Float32Array(n); this.i = 0; } p(x) { const b = this.b[this.i]; const y = -x + b; this.b[this.i] = x + b * 0.5; if (++this.i >= this.b.length) this.i = 0; return y; } }
function reverb(src, { room = 0.86, damp = 0.35, predelay = 0.025, hp = 220, width = 1 } = {}) {
  const k = SR / 44100, CT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AT = [556, 441, 341, 225];
  const out = bus();
  const fb = room * 0.28 + 0.7, d = damp * 0.4;
  const pd = Math.round(predelay * SR);
  for (let c = 0; c < 2; c++) {
    const sp = c ? 23 : 0;
    const combs = CT.map((n) => new Comb(Math.round((n + sp) * k)));
    const aps = AT.map((n) => new AP(Math.round((n + sp) * k)));
    const h = new Biquad('hp', hp, 0.7);
    const mono = src[0].map((v, i) => (v + src[1][i]) * 0.5);
    for (let i = 0; i < LEN; i++) {
      const x = h.p(i >= pd ? mono[i - pd] : 0) * 0.015;
      let y = 0;
      for (const cb of combs) y += cb.p(x, fb, d);
      for (const ap of aps) y = ap.p(y);
      out[c][i] = y;
    }
  }
  if (width < 1) for (let i = 0; i < LEN; i++) { const m = (out[0][i] + out[1][i]) / 2, s = (out[0][i] - out[1][i]) / 2 * width; out[0][i] = m + s; out[1][i] = m - s; }
  return out;
}

// ------------------------------------------------------------------ instruments
let seedCounter = 1;

// Guzheng string: variable-delay Karplus-Strong (bends + vibrato), nail-pick transient, body resonances.
function guzheng(midi, { vel = 0.5, T60 = 3.5, bend = [], vib = 0, vibDelay = 0.35, bright = 0.5, dur } = {}) {
  const rnd = rngOf(seedCounter++ * 7919);
  const f0 = mtof(midi);
  const len = Math.ceil((dur ?? Math.min(T60 * 1.05, 9)) * SR);
  const out = new Float32Array(len);
  const M = 1 << Math.ceil(Math.log2(SR / (f0 * 0.7) + 8));
  const d = new Float32Array(M);
  const P0 = SR / f0;
  // excitation: noise burst through a velocity lowpass and a pluck-position comb
  const exLen = Math.round(P0);
  const ex = new Float32Array(exLen + Math.round(P0 * 0.15) + 2);
  const lpA = 0.25 + 0.65 * clamp(vel * bright * 1.6, 0, 1);
  let lp = 0;
  for (let i = 0; i < exLen; i++) { lp += lpA * ((rnd() * 2 - 1) - lp); ex[i] = lp; }
  const pp = Math.max(1, Math.round(P0 * 0.13));
  for (let i = ex.length - 1; i >= pp; i--) ex[i] -= 0.92 * ex[i - pp];
  const g = Math.pow(10, -3 / (T60 * f0));            // loop gain per period
  const a = 0.42 + 0.5 * bright;                        // one-pole loop lowpass (higher = brighter)
  const filtDelay = (1 - a) / a;
  let w = 0, prev = 0;
  const semisAt = (t) => {
    let s = 0;
    for (const b of bend) {                            // {at, to (semitones), dur, back (time to release), backDur}
      const up = clamp((t - b.at) / (b.dur || 0.2), 0, 1);
      let v = b.to * (up * up * (3 - 2 * up));
      if (b.back !== undefined) { const dn = clamp((t - b.back) / (b.backDur || 0.3), 0, 1); v *= 1 - dn * dn * (3 - 2 * dn); }
      s += v;
    }
    if (vib > 0) { const vd = clamp((t - vibDelay) / 0.4, 0, 1); s += vib * vd * Math.sin(2 * Math.PI * 5.4 * t + 0.7 * Math.sin(2 * Math.PI * 0.6 * t)); }
    return s;
  };
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const P = SR / (f0 * Math.pow(2, semisAt(t) / 12)) - filtDelay;
    // cubic Hermite read at w - P
    const rp = w - P + M * 4;
    const i1 = Math.floor(rp), fr = rp - i1;
    const y0 = d[(i1 - 1) & (M - 1)], y1 = d[i1 & (M - 1)], y2 = d[(i1 + 1) & (M - 1)], y3 = d[(i1 + 2) & (M - 1)];
    const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    const y = ((c3 * fr + c2) * fr + c1) * fr + y1;
    prev += a * (y - prev);
    d[w & (M - 1)] = (n < ex.length ? ex[n] * vel : 0) + g * prev;
    out[n] = y;
    w++;
  }
  // nail/plectrum transient
  const tick = Math.round(0.004 * SR);
  const th = new Biquad('hp', 2500, 0.7);
  for (let i = 0; i < tick && i < len; i++) out[i] += th.p(rnd() * 2 - 1) * vel * 0.12 * (1 - i / tick);
  // body: resonances + direct
  const r1 = new Biquad('bp', 190, 3), r2 = new Biquad('bp', 540, 2.5), r3 = new Biquad('bp', 1450, 2), hs = new Biquad('hs', 4500, 0.7, -3);
  for (let i = 0; i < len; i++) { const x = out[i]; out[i] = hs.p(x * 0.75 + r1.p(x) * 0.5 + r2.p(x) * 0.35 + r3.p(x) * 0.2); }
  // gentle overall decay envelope so nothing ends abruptly
  for (let i = 0; i < len; i++) { const r = (len - i) / SR; if (r < 0.15) out[i] *= r / 0.15; }
  return out;
}

// Guzheng harmonic (fanyin): pure, bell-like.
function harmonic(midi, { vel = 0.5, T60 = 4 } = {}) {
  const f = mtof(midi), len = Math.ceil(T60 * SR);
  const out = new Float32Array(len);
  const k = -6.9 / T60;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const att = Math.min(1, t / 0.004);
    out[i] = vel * att * (Math.sin(2 * Math.PI * f * t) * Math.exp(k * t) + 0.18 * Math.sin(2 * Math.PI * f * 2.003 * t) * Math.exp(k * 2.4 * t) + 0.06 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(k * 4 * t));
  }
  return out;
}

// Xiao (end-blown flute): one continuous voice over a phrase [{t, m, d}] with portamento, breath and vibrato.
function xiao(notes, { vel = 0.5, breath = 1 } = {}) {
  const rnd = rngOf(seedCounter++ * 104729);
  const t0 = notes[0].t - 0.05, t1 = notes[notes.length - 1].t + notes[notes.length - 1].d + 0.6;
  const len = Math.ceil((t1 - t0) * SR);
  const out = new Float32Array(len);
  const bp1 = new Biquad('bp', 600, 6), bp2 = new Biquad('bp', 1200, 5), chiffHP = new Biquad('hp', 2200, 0.7), hiss = new Biquad('lp', 5000, 0.7);
  const jitP = lfoGen(rngOf(seedCounter * 13), 2.6), jitA = lfoGen(rngOf(seedCounter * 17), 1.7);
  let phase = 0, pitch = notes[0].m - 0.4;
  for (let n = 0; n < len; n++) {
    const t = t0 + n / SR;
    // active note
    let cur = null, amp = 0, sinceOn = 0;
    for (let i = 0; i < notes.length; i++) {
      const no = notes[i];
      const nx = notes[i + 1], pv = notes[i - 1];
      const legato = nx && nx.t - (no.t + no.d) < 0.06;
      const legIn = pv && no.t - (pv.t + pv.d) < 0.06;
      const on = t - no.t;
      const end = no.t + no.d;
      if (t < no.t - 0.001) continue;
      if (t > end + 0.35) continue;
      let e;
      if (legIn) e = 1.0;
      else if (on < 0.14) e = Math.sin((on / 0.14) * Math.PI / 2) * 1.06;
      else e = 1.06 - 0.06 * clamp((on - 0.14) / 0.2, 0, 1);
      e *= 1 + 0.08 * Math.sin(Math.PI * clamp(on / Math.max(no.d, 0.2), 0, 1)); // swell through the note
      if (t > end) e *= legato ? 0 : Math.max(0, 1 - (t - end) / 0.32);
      if (e > amp) { amp = e; cur = no; sinceOn = on; }
      if (legato && t > end - 0.03 && t < end + 0.04) amp *= 0.86;  // tongue between legato notes
    }
    if (cur) {
      const target = cur.m + (sinceOn < 0.09 ? -0.35 * (1 - sinceOn / 0.09) : 0);
      pitch += (target - pitch) * (1 - Math.exp(-1 / (0.035 * SR)));
    }
    const vd = clamp((sinceOn - 0.35) / 0.5, 0, 1);
    // breath is never perfectly steady: slow random drift in pitch and level
    const drift = jitP(t) * 0.035, swell = 1 + jitA(t) * 0.05;
    amp *= swell;
    const p = pitch + drift + vd * 0.19 * Math.sin(2 * Math.PI * 4.9 * t + 0.4 * Math.sin(2 * Math.PI * 0.37 * t));
    const f = mtof(p);
    phase += 2 * Math.PI * f / SR;
    if (n % 64 === 0) { bp1.set('bp', f, 7); bp2.set('bp', f * 2, 6); }
    const tone = Math.sin(phase) + 0.16 * Math.sin(2 * phase) + 0.055 * Math.sin(3 * phase) + 0.02 * Math.sin(4 * phase);
    const w = rnd() * 2 - 1;
    const br = (bp1.p(w) * 0.55 + bp2.p(w) * 0.3) * breath * 0.9 + hiss.p(w) * 0.025 * breath;
    const chiff = sinceOn < 0.05 ? chiffHP.p(w) * 0.06 * (1 - sinceOn / 0.05) : 0;
    out[n] = (tone * 0.78 + br) * amp * vel + chiff * vel;
  }
  return { buf: out, t: t0 };
}

// Temple singing bowl: beating modal partials.
function bowl(midi, { vel = 0.5, T60 = 9 } = {}) {
  const rnd = rngOf(seedCounter++ * 31);
  const f = mtof(midi), len = Math.ceil(T60 * SR);
  const R = [1, 2.71, 5.12, 8.21, 11.9], A = [1, 0.42, 0.22, 0.1, 0.05], D = [1, 0.62, 0.42, 0.28, 0.18];
  const out = new Float32Array(len);
  const ph = R.map(() => rnd() * 6.28);
  for (let i = 0; i < len; i++) {
    const t = i / SR; let s = 0;
    for (let k = 0; k < R.length; k++) {
      const e = Math.exp(-6.9 * t / (T60 * D[k]));
      const fk = f * R[k];
      s += A[k] * e * 0.5 * (Math.sin(2 * Math.PI * fk * (1 - 0.0012) * t + ph[k]) + Math.sin(2 * Math.PI * fk * (1 + 0.0012) * t + ph[k] * 1.3));
    }
    const att = Math.min(1, t / 0.006);
    out[i] = s * att * vel * 0.6;
  }
  const lp = new Biquad('lp', 900, 0.7);
  for (let i = 0; i < Math.round(0.01 * SR); i++) out[i] += lp.p(rnd() * 2 - 1) * vel * 0.25 * (1 - i / (0.01 * SR));
  return out;
}

// Low frame drum.
function drum({ vel = 0.5, pitch = 52 } = {}) {
  const rnd = rngOf(seedCounter++ * 977);
  const len = Math.ceil(1.2 * SR), out = new Float32Array(len);
  const base = mtof(pitch - 12);
  let ph = 0; const lp = new Biquad('lp', 380, 0.8);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = base + 70 * Math.exp(-t / 0.028);
    ph += 2 * Math.PI * f / SR;
    out[i] = (Math.sin(ph) * Math.exp(-t / 0.42) + lp.p(rnd() * 2 - 1) * 0.45 * Math.exp(-t / 0.045)) * vel;
    out[i] = Math.tanh(out[i] * 1.4) / 1.4;
  }
  return out;
}

// Seal pressed onto paper: a soft, short wooden knock.
function knock({ vel = 0.5 } = {}) {
  const rnd = rngOf(4242);
  const len = Math.ceil(0.35 * SR), out = new Float32Array(len);
  const M = [[210, 0.07, 1], [470, 0.045, 0.6], [1050, 0.025, 0.35], [2300, 0.012, 0.15]];
  const lp = new Biquad('lp', 1800, 0.7);
  for (let i = 0; i < len; i++) {
    const t = i / SR; let s = 0;
    for (const [f, d, a] of M) s += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d);
    if (i < 0.003 * SR) s += lp.p(rnd() * 2 - 1) * 0.5;
    out[i] = s * vel * Math.min(1, t / 0.0015);
  }
  return out;
}

// Whoosh: 1/f-ish noise through a band that sweeps f0 -> f1 (at the apex) -> f2, swelling to the apex.
// rustle > 0 adds a burst of dry leaf grains following the same envelope.
function whoosh(dur, { f0 = 250, f1 = 1100, f2 = 450, apex = 0.45, q = 0.9, rustle = 0, seed = 5 } = {}) {
  const rnd = rngOf(seed * 7717);
  const len = Math.ceil(dur * SR), out = new Float32Array(len);
  const pink = pinkGen(rnd), bp = new Biquad('bp', f0, q), hp = new Biquad('hp', 2400, 0.7);
  let grain = 0, gd = 0.99;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const f = u < apex ? f0 * Math.pow(f1 / f0, u / apex) : f1 * Math.pow(f2 / f1, (u - apex) / (1 - apex));
    if (i % 64 === 0) bp.set('bp', f, q);
    const env = u < apex ? Math.pow(u / apex, 2) : Math.exp(-4.2 * (u - apex) / (1 - apex));
    let s = bp.p(pink()) * env * 2.2;
    if (rustle > 0) {
      if (rnd() < (40 + 260 * env) / SR) { grain = 0.5 + rnd() * 0.5; gd = Math.exp(-1 / ((0.006 + rnd() * 0.02) * SR)); }
      s += hp.p(rnd() * 2 - 1) * grain * env * rustle; grain *= gd;
    }
    out[i] = s;
  }
  return out;
}


const dry=bus();
function seedFor(s){let h=2166136261;for(const c of s){h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;}return h%1000000+1;}
if(key==='bed'){
 const segs=recipe.roots.map((root,i)=>({t0:i*6-1,t1:(i+1)*6+1,notes:[root,root+7]}));
 for(let c=0;c<2;c++){const rnd=rngOf(77+c),ph=segs.map(s=>s.notes.map(()=>rnd())),lp=new Biquad('lp',420,.6);for(let i=0;i<FRAMES;i++){const t=i/SR;let sum=0;for(let j=0;j<segs.length;j++){const s=segs[j],e=clamp((t-s.t0)/1.4,0,1)*clamp((s.t1-t)/1.6,0,1);for(let k=0;k<2;k++){const f=mtof(s.notes[k])*(1+(c?.0018:-.0018)*(k+1));ph[j][k]=(ph[j][k]+f/SR)%1;sum+=((2*ph[j][k]-1)*.35+Math.sin(2*Math.PI*ph[j][k])*.65)*.055*e;}}dry[c][i]=lp.p(sum)*(1+.08*Math.sin(2*Math.PI*.11*t+c));}}
 bridge(dry.map(x=>x.subarray(0,FRAMES)),12000);
}else{
 const events=recipe.tracks[key];if(!events)throw new Error('Unknown fixed asset '+key);
 for(let i=0;i<events.length;i++){const e=events[i];seedCounter=seedFor(key+'/'+i);let signal,t=e.time,gain=.9,pan=0;
 if(e.instrument==='guzheng'){signal=guzheng(e.midi,{vel:e.velocity,...e.options});pan=clamp((e.midi-66)/30,-.55,.55);for(let j=0;j<72&&j<signal.length;j++)signal[j]*=j/72;}
 else if(e.instrument==='harmonic'){signal=harmonic(e.midi,{vel:e.velocity,...e.options});gain=.7;pan=.25;}
 else if(e.instrument==='bowl'){signal=bowl(e.midi,{vel:e.velocity,...e.options});gain=.65;pan=.05;}
 else if(e.instrument==='drum'){signal=drum({vel:e.velocity,pitch:e.midi});gain=.8;for(let j=0;j<72&&j<signal.length;j++)signal[j]*=j/72;}
 else if(e.instrument==='knock'){signal=knock({vel:e.velocity});gain=.45;pan=-.15;}
 else if(e.instrument==='xiao'){const x=xiao(e.notes,{vel:e.velocity});signal=x.buf;t=x.t;gain=.55;pan=-.2;}
 else throw new Error(e.instrument);
 place(dry,signal,t,gain,pan);
 }
}
if(!isBridge&&!oneShot)for(let c=0;c<2;c++)dry[c].set(dry[c].subarray(0,FRAMES),FRAMES);
const wet=key==='bed'?null:reverb(dry,{room:.88,damp:.32,predelay:.03,hp:240}),out=[new Float32Array(FRAMES),new Float32Array(FRAMES)];
for(let c=0;c<2;c++){const hp=new Biquad('hp',28,.7);for(let i=0;i<LEN;i++){const value=hp.p(dry[c][i]+(wet?wet[c][i]*.55:0));if((isBridge||oneShot)&&i<FRAMES)out[c][i]=value;else if(!isBridge&&!oneShot&&i>=FRAMES)out[c][i-FRAMES]=value;}}
if(isBridge)for(const x of out)for(let i=0;i<960;i++)x[FRAMES-1-i]*=i/960;
return out;

}
