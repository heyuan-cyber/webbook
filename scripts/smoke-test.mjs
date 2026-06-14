#!/usr/bin/env node
/**
 * WebBook 冒烟检查：验证 API 可达 + 输出手动 E2E 清单。
 *
 * 用法：
 *   VITE_API_BASE_URL=https://xxx.workers.dev node scripts/smoke-test.mjs
 *   npm run smoke
 */
const BASE = process.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

async function check(path, label) {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  try {
    const res = await fetch(url);
    const ok = res.ok;
    console.log(`${ok ? '✓' : '✗'} ${label}: ${res.status} ${url}`);
    if (ok && res.headers.get('content-type')?.includes('json')) {
      const data = await res.json();
      if (path.includes('tree')) {
        const count = JSON.stringify(data).match(/"kind":"note"/g)?.length ?? 0;
        console.log(`    公开树中约 ${count} 篇笔记节点`);
      }
    }
    return ok;
  } catch (err) {
    console.log(`✗ ${label}: ${(err).message}`);
    return false;
  }
}

console.log('WebBook smoke test');
console.log(`API_BASE = ${BASE}\n`);

const results = await Promise.all([
  check('/api/public/tree', 'GET /api/public/tree'),
  check('/api/link-preview?url=https://example.com', 'GET /api/link-preview'),
]);

console.log('\n--- 手动 E2E 清单（浏览器）---');
console.log('1. 游客：打开 /app → 新建笔记 → 写几段 → 确认本地可保存');
console.log('2. 预览：点「预览」→ Markdown 渲染正常');
console.log('3. 搜索：侧边栏搜索刚写的关键词');
console.log('4. 登录：/login → 登录后笔记同步到 GitHub 数据仓');
console.log('5. 公开：将笔记设为「公开」→ /blog 列表出现 → 点开文章');
console.log('6. AI：保存后等待数秒 → 笔记顶部出现 AI 摘要（需 Worker 配置 AI_API_KEY）');
console.log('7. 入口：https://heyuan-cyber.github.io/ → 链到笔记本与博客');

const passed = results.filter(Boolean).length;
console.log(`\n自动检查: ${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
