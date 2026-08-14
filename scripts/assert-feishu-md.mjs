/**
 * 最小断言：路径编解码 + markdown 图/视频识别 + 导出对齐飞书方言。
 * 用法：npm run build --workspace packages/shared && node scripts/assert-feishu-md.mjs
 */
import {
  decodeFeishuMediaPath,
  encodeFeishuMediaPath,
  escapeFeishuAlt,
  markdownToBlocks,
  noteToFeishuMarkdown,
  FEISHU_MEDIA_DIR,
} from '../packages/shared/dist/index.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  decodeFeishuMediaPath('图片和附件/image%2012.png') === `${FEISHU_MEDIA_DIR}/image 12.png`,
  'decode %20',
);

assert(
  decodeFeishuMediaPath('图片和附件/image.png') === `${FEISHU_MEDIA_DIR}/image.png`,
  'decode plain image.png',
);

assert(
  encodeFeishuMediaPath(`${FEISHU_MEDIA_DIR}/image 1.png`) === `${FEISHU_MEDIA_DIR}/image%201.png`,
  'encode space only, keep CJK dir',
);

assert(
  !encodeFeishuMediaPath(`${FEISHU_MEDIA_DIR}/a.png`).includes('%E5'),
  'encode must not percent-encode 图片和附件',
);

assert(escapeFeishuAlt('image.png') === 'image\\.png', 'escape alt dots');

const blocks = markdownToBlocks(`
# 标题

正文

![image\\.png](图片和附件/image%2012.png)

[20260522115531_rec_.mp4](图片和附件/20260522115531_rec_.mp4)

![x.gif](图片和附件/x.gif)

![image.png](图片和附件/image.png)

- 父项

    - 子项A

    - 子项B
`);

assert(blocks.some((b) => b.type === 'heading' && b.text === '标题'), 'heading');
assert(
  blocks.some((b) => b.type === 'image' && b.src.endsWith('image 12.png')),
  'image path decoded',
);
assert(
  blocks.some((b) => b.type === 'video' && b.src.includes('20260522115531_rec_.mp4')),
  'video link',
);
assert(blocks.some((b) => b.type === 'image' && b.src.endsWith('x.gif')), 'gif as image');
assert(
  blocks.some((b) => b.type === 'image' && b.src === `${FEISHU_MEDIA_DIR}/image.png`),
  'plain image.png relative src',
);
assert(
  blocks.some((b) => b.type === 'paragraph' && b.text.includes('    - 子项A')),
  'preserve nested list indent',
);

const mergedLists = markdownToBlocks(`
- 第一条

- 第二条

- 第三条
`);
const listParas = mergedLists.filter((b) => b.type === 'paragraph');
assert(listParas.length === 1, 'blank lines must not split same-type lists');
assert(
  listParas[0].text.includes('第一条') &&
    listParas[0].text.includes('第二条') &&
    listParas[0].text.includes('第三条'),
  'merged list keeps all items',
);

const note = {
  title: '测试',
  blocks: [
    { id: '1', type: 'paragraph', text: 'hello' },
    { id: '2', type: 'image', src: '/api/assets/vol-01/a.png', alt: 'image.png' },
    {
      id: '3',
      type: 'image',
      src: '/api/assets/vol-01/de5ba180-97be-4578-b6d3-604e35006c5c.png',
      alt: 'image.png',
    },
    { id: '4', type: 'video', src: '/api/assets/vol-01/b.mp4', caption: 'clip' },
  ],
};
const exp = noteToFeishuMarkdown(note);
assert(exp.markdown.includes('hello'), 'export text');
assert(exp.media.length === 3, 'export media count');
assert(exp.media.every((m) => m.relativePath.startsWith(`${FEISHU_MEDIA_DIR}/`)), 'media dir');
assert(exp.markdown.includes(`](${FEISHU_MEDIA_DIR}/`), 'export href keeps CJK media dir');
assert(!exp.markdown.includes('%E5%9B%BE'), 'export must not encode CJK dir');
assert(exp.markdown.includes('![image\\.png]'), 'export escaped alt');
assert(
  exp.media.some((m) => m.relativePath === `${FEISHU_MEDIA_DIR}/image.png`),
  'uuid asset → image.png',
);
assert(exp.markdown.includes('](') && exp.markdown.includes('.mp4'), 'export video md');

console.log('assert-feishu-md: ok');
