import puppeteer from 'puppeteer';

const base = process.argv[2] ?? 'http://localhost:5173';
const noteId = 'probe-note-46b';
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`${base}/app`, { waitUntil: 'networkidle2', timeout: 20000 });

await page.evaluate((id) => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('keyval-store');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('keyval', 'readwrite');
      const store = tx.objectStore('keyval');
      const tree = { schemaVersion: 1, roots: [{ id, kind: 'note', title: '探测', noteId: id }] };
      store.put(tree, 'webbook:tree');
      const note = {
        schemaVersion: 3,
        id,
        title: '探测',
        blocks: [
          { id: 'h1', type: 'heading', level: 1, text: '第一章' },
          { id: 'p1', type: 'paragraph', text: '段落' },
        ],
        stage: { viewCenterX: 0, viewCenterY: 0 },
        visibility: 'private',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.put(note, 'webbook:note:' + id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    };
  });
}, noteId);

await page.reload({ waitUntil: 'networkidle2' });
await page.goto(`${base}/app/note/${noteId}`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise((r) => setTimeout(r, 3000));

const ui = await page.evaluate(() => ({
  error: document.querySelector('.error-fallback p')?.textContent ?? null,
  hasEditor: !!document.querySelector('.stage-viewport'),
}));
console.log(JSON.stringify(ui));
await browser.close();
