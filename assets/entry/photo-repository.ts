import type { OriginalPhoto } from '../shared/photography-contract.ts';

const DATABASE = 'shanye-laixin.photo-originals.v1';
const STORE = 'originals';
interface PhotoRecord extends OriginalPhoto { blob: Blob; createdAt: number }
const validKey = (key: string) => /^photo-original:[a-z0-9-]{16,80}$/i.test(key);

/** Photo keys also work on non-secure LAN deployments without randomUUID. */
export function photoOriginalKey(crypto: Pick<Crypto, 'getRandomValues'>): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `photo-original:${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Browser-owned original photographs. Progress JSON holds only small references. */
export function createPhotoRepository(owner: Window) {
  let opening: Promise<IDBDatabase> | undefined;
  let disposed = false;
  const urls = new Map<string, string>();
  const loading = new Map<string, Promise<{ url: string; photo: OriginalPhoto } | null>>();
  let writes = Promise.resolve();
  function write<T>(operation: () => Promise<T>): Promise<T> {
    const pending = writes.then(operation);
    writes = pending.then(() => undefined, () => undefined);
    return pending;
  }
  const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!owner.indexedDB) { reject(new Error('浏览器未提供本地原照存储。')); return; }
    let settled = false;
    const request = owner.indexedDB.open(DATABASE, 1);
    const fail = (message: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); opening = undefined; reject(new Error(message));
    };
    const timer = setTimeout(() => fail('原照仓库打开超时，请关闭其它旧版页面后重试。'), 6000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    request.onerror = () => fail('无法打开原照仓库，请检查浏览器存储权限。');
    request.onblocked = () => fail('原照仓库被另一页面占用，请关闭旧页面后重试。');
    request.onsuccess = () => {
      if (settled || disposed) { request.result.close(); if (!settled) fail('原照仓库已关闭。'); return; }
      settled = true; clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
  });
  async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, value: (v: T) => void) => void): Promise<T> {
    if (disposed) throw new Error('原照仓库已关闭。');
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      const tx = db.transaction(STORE, mode);
      const timer = setTimeout(() => { try { tx.abort(); } catch { /* Already complete. */ } reject(new Error('原照存储超时，尚未确认保存。')); }, 6000);
      tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
      tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(new Error('原照片未能保存，请检查可用存储空间。')); };
      try { run(tx.objectStore(STORE), value => { result = value; }); }
      catch (error) { clearTimeout(timer); try { tx.abort(); } catch { /* Already aborted. */ } reject(error); }
    });
  }
  async function get(key: string): Promise<PhotoRecord | null> {
    if (!validKey(key)) return null;
    return transaction<PhotoRecord | null>('readonly', (store, set) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const p = request.result as PhotoRecord | undefined;
        set(p && p.key === key && p.blob instanceof Blob && p.blob.type === 'image/jpeg'
          && p.blob.size === p.bytes && p.width > 0 && p.height > 0 ? p : null);
      };
    });
  }
  async function put(key: string, blob: Blob, width: number, height: number): Promise<OriginalPhoto> {
    if (!validKey(key) || blob.type !== 'image/jpeg' || blob.size === 0 || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('原照片格式无效，尚未保存。');
    const photo: OriginalPhoto = { key, width, height, mime: 'image/jpeg', bytes: blob.size };
    // A photograph key is immutable: another frame must get its own UUID.
    await write(() => transaction<void>('readwrite', store => { store.add({ ...photo, blob, createdAt: Date.now() } satisfies PhotoRecord); }));
    return photo;
  }
  function resolve(key: string): Promise<{ url: string; photo: OriginalPhoto } | null> {
    const inFlight = loading.get(key); if (inFlight) return inFlight;
    const pending = get(key).then(record => {
      if (!record || disposed) return null;
      let url = urls.get(key);
      if (!url) { url = URL.createObjectURL(record.blob); urls.set(key, url); }
      const { blob: _blob, createdAt: _createdAt, ...photo } = record;
      return { url, photo };
    }).finally(() => loading.delete(key));
    loading.set(key, pending); return pending;
  }
  async function remove(key: string) {
    await write(() => transaction<void>('readwrite', store => { store.delete(key); }));
    const url = urls.get(key); if (url) URL.revokeObjectURL(url); urls.delete(key);
  }
  /** Release this page's decoded URLs only; another page may retain the blobs. */
  function releaseUnused(retained: ReadonlySet<string>) {
    for (const [key, url] of urls) if (!retained.has(key)) { URL.revokeObjectURL(url); urls.delete(key); }
  }
  async function download(key: string, filename: string) {
    const record = await get(key);
    if (!record) throw new Error('这张原照片在当前浏览器中不可用，预览仍已保留。');
    const url = URL.createObjectURL(record.blob), link = owner.document.createElement('a');
    link.href = url; link.download = filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
    owner.document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function destroy() {
    disposed = true;
    for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear();
    void opening?.then(db => db.close()).catch(() => undefined);
  }
  return { put, get, resolve, remove, releaseUnused, download, destroy };
}
