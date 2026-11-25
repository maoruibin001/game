import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadPolicy(html, url = 'http://localhost:59566/') {
  const marker = 'const startupCache = ';
  const start = html.indexOf(marker);
  const end = html.indexOf('let phase = gamePage', start);
  assert.ok(start >= 0 && end > start, 'expected the generated ForgeAX startup cache policy');
  const code = html.slice(start + marker.length, end).trim().replace(/;$/, '');
  const requests = [];
  const navigations = [];
  const warnings = [];
  const policy = runInNewContext(code, {
    host: undefined,
    gamePage: true,
    query: new URL(url).searchParams,
    location: { href: url, protocol: 'http:', replace: href => navigations.push(href) },
    document: { baseURI: url, querySelectorAll: () => [] },
    AbortController, AbortSignal, URL,
    localStorage: { getItem: () => 'previous-build' },
    sessionStorage: { getItem: () => 'first failure', setItem: () => undefined },
    fetch: async target => {
      requests.push(String(target));
      throw new DOMException('signal timed out', 'TimeoutError');
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    console: { warn: message => warnings.push(message) },
  });
  return { policy, requests, navigations, warnings };
}

const candidate = readFileSync(process.argv[2] ?? 'dist/index.html', 'utf8');
const oldBuild = process.argv[3];
if (oldBuild) {
  const baseline = loadPolicy(readFileSync(oldBuild, 'utf8'));
  await assert.rejects(baseline.policy.ready(), { name: 'TimeoutError' });
  assert.equal(baseline.requests.length, 1);
}

const current = loadPolicy(candidate);
await current.policy.ready();
assert.equal(current.requests.length, 0, 'ordinary startup must not request an HTTP cache reset');
assert.equal((await current.policy.recover('initial failure')).status, 'reloaded');
assert.equal(current.requests.length, 1, 'recovery must still try cache refresh');
assert.equal(current.warnings.length, 1);
assert.equal(current.navigations.length, 1);
assert.match(current.navigations[0], /forgeax-startup-retry=1$/);

const retry = loadPolicy(candidate, current.navigations[0]);
await retry.policy.ready();
assert.equal((await retry.policy.recover('retry failure')).status, 'exhausted');
assert.equal(retry.navigations.length, 0);

console.log(JSON.stringify({
  baseline: oldBuild ? 'startup rejected on cache refresh timeout' : 'not supplied',
  update: 'startup proceeded without HTTP cache reset',
  recoveryAfterTimeout: 'one reload',
  secondFailure: 'retry exhausted',
}, null, 2));
