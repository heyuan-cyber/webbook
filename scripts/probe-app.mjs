import puppeteer from 'puppeteer';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
});

async function snapshot(label) {
  const ui = await page.evaluate(() => ({
    error: document.querySelector('.error-fallback p')?.textContent ?? null,
    title: document.querySelector('.error-fallback h2')?.textContent ?? null,
    path: location.pathname,
    hasEditor: !!document.querySelector('.stage-viewport'),
    hasOutline: !!document.querySelector('.outline-panel'),
  }));
  console.log(label, JSON.stringify(ui));
  return ui;
}

await page.goto(`${base}/app`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise((r) => setTimeout(r, 2000));
await snapshot('after /app');

// 点击第一篇笔记（若有）
const clicked = await page.evaluate(() => {
  const row = document.querySelector('.tree-row .tree-label');
  if (!row) return false;
  (row).click();
  return true;
});
if (clicked) {
  await new Promise((r) => setTimeout(r, 2500));
  await snapshot('after note click');
}

// 直接访问一个常见测试 id（若路由存在）
await page.goto(`${base}/app/note/test-note-probe`, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise((r) => setTimeout(r, 2000));
await snapshot('after /app/note/test');

if (errors.length) {
  console.log('--- captured errors ---');
  errors.forEach((e) => console.log(e));
}
await browser.close();
