import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const source = JSON.parse(
  readFileSync('node_modules/emoji-picker-react/src/data/emojis-ko.json', 'utf8'),
);

const codepointsToEmoji = (value) =>
  value
    .split('-')
    .map((part) => String.fromCodePoint(Number.parseInt(part, 16)))
    .join('');

const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const categoryOrder = [
  'smileys_people',
  'animals_nature',
  'food_drink',
  'travel_places',
  'activities',
  'objects',
  'symbols',
  'flags',
];

const rows = categoryOrder.flatMap((category) =>
  (source.emojis[category] ?? []).map((item, index) => ({
    category,
    categoryName: source.categories[category].name,
    order: index + 1,
    emoji: codepointsToEmoji(item.u),
    unicode: item.u.toUpperCase(),
    name: item.n.at(-1) ?? item.n[0] ?? '',
    keywords: item.n.join(', '),
    version: item.a,
  })),
);

mkdirSync('docs/emoji-inventory', { recursive: true });

const csv = [
  ['category', 'category_ko', 'order', 'emoji', 'unicode', 'name_ko', 'keywords_ko', 'emoji_version'],
  ...rows.map((row) => [
    row.category,
    row.categoryName,
    row.order,
    row.emoji,
    row.unicode,
    row.name,
    row.keywords,
    row.version,
  ]),
].map((row) => row.map(escapeCsv).join(',')).join('\n');

writeFileSync('docs/emoji-inventory/emoji-picker-ko.csv', `\uFEFF${csv}`);

const sections = categoryOrder.map((category) => {
  const categoryRows = rows.filter((row) => row.category === category);
  return `
    <section id="${category}">
      <h2>${escapeHtml(source.categories[category].name)} <small>${categoryRows.length}개</small></h2>
      <div class="grid">
        ${categoryRows.map((row) => `
          <article title="${escapeHtml(row.keywords)}">
            <span class="emoji">${row.emoji}</span>
            <strong>${escapeHtml(row.name)}</strong>
            <code>${escapeHtml(row.unicode)}</code>
          </article>`).join('')}
      </div>
    </section>`;
}).join('');

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>온주 이모지 인벤토리</title>
<style>
body{margin:0;background:#f7f3e8;color:#34312b;font-family:system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:20px 24px;background:#f7f3e8ee;backdrop-filter:blur(12px);border-bottom:1px solid #d8d0bd}h1{margin:0 0 8px;font-size:24px}nav{display:flex;gap:8px;overflow:auto}nav a{white-space:nowrap;color:#3f7454}main{padding:12px 24px 48px}h2{margin-top:36px}small{color:#817969;font-weight:400}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px}article{min-height:116px;padding:12px;background:#fffdf6;border:1px solid #ded7c6;border-radius:14px;display:flex;flex-direction:column;align-items:center;text-align:center}.emoji{font-size:34px}strong{font-size:12px;margin-top:8px;line-height:1.3}code{font-size:9px;color:#8e8574;margin-top:auto}
</style></head><body><header><h1>온주 이모지 인벤토리 · ${rows.length}개</h1><nav>${categoryOrder.map((category) => `<a href="#${category}">${escapeHtml(source.categories[category].name)}</a>`).join('')}</nav></header><main>${sections}</main></body></html>`;

writeFileSync('docs/emoji-inventory/emoji-picker-ko.html', html);

const summary = categoryOrder.map((category) =>
  `- ${source.categories[category].name}: ${(source.emojis[category] ?? []).length}개`,
).join('\n');

writeFileSync(
  'docs/emoji-inventory/README.md',
  `# 온주 이모지 인벤토리\n\nemoji-picker-react 4.19.1의 한국어 데이터에서 추출한 목록입니다.\n\n총 ${rows.length}개\n\n${summary}\n\n- \`emoji-picker-ko.html\`: 시각 카탈로그\n- \`emoji-picker-ko.csv\`: 제작·선별용 전체 데이터\n- 다시 생성: \`node scripts/export-emoji-inventory.mjs\`\n`,
);

console.log(`Exported ${rows.length} emojis.`);
