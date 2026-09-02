import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const manifest = JSON.parse(readFileSync('docs/icon-inventory/onju-ui-icons.json', 'utf8'));
const sheetDir = 'assets/onju-ui-icons/sheets';
const outputDir = 'public/icons/onju-ui';
mkdirSync(outputDir, { recursive: true });

function slug(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

async function transparentCell(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = [data[0], data[1], data[2]];
  const output = Buffer.from(data);
  for (let i = 0; i < info.width * info.height; i += 1) {
    const o = i * 4;
    const distance = Math.hypot(data[o] - bg[0], data[o + 1] - bg[1], data[o + 2] - bg[2]);
    const paper = distance < 34 && data[o] > 218 && data[o + 1] > 214 && data[o + 2] > 202;
    if (paper) output[o + 3] = 0;
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .png().toBuffer();
}

for (let sheetIndex = 0; sheetIndex < 3; sheetIndex += 1) {
  const sheetPath = `${sheetDir}/sheet-${String(sheetIndex + 1).padStart(2, '0')}.png`;
  const metadata = await sharp(sheetPath).metadata();
  const cellWidth = Math.floor(metadata.width / 5);
  const cellHeight = Math.floor(metadata.height / 5);

  for (let cellIndex = 0; cellIndex < 25; cellIndex += 1) {
    const item = manifest[sheetIndex * 25 + cellIndex];
    const column = cellIndex % 5;
    const row = Math.floor(cellIndex / 5);
    const rawCell = await sharp(sheetPath).extract({
      left: column * cellWidth,
      top: row * cellHeight,
      width: column === 4 ? metadata.width - column * cellWidth : cellWidth,
      height: row === 4 ? metadata.height - row * cellHeight : cellHeight,
    }).png().toBuffer();
    const trimmed = await transparentCell(rawCell);
    const meta = await sharp(trimmed).metadata();
    const scale = Math.min(208 / meta.width, 208 / meta.height, 1);
    const width = Math.max(1, Math.round(meta.width * scale));
    const height = Math.max(1, Math.round(meta.height * scale));
    const resized = await sharp(trimmed).resize(width, height).png().toBuffer();
    const filename = `${slug(item.key)}.webp`;
    await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left: Math.floor((256 - width) / 2), top: Math.floor((256 - height) / 2) }])
      .webp({ quality: 88, alphaQuality: 100 })
      .toFile(`${outputDir}/${filename}`);
    item.src = `/icons/onju-ui/${filename}`;
  }
}

writeFileSync(`${outputDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const cards = manifest.map(item => `<article><img src="../../public${item.src}" alt="${item.name}"><strong>${item.name}</strong><code>${item.key}</code></article>`).join('');
writeFileSync('docs/icon-inventory/onju-ui-icons.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>온주 UI 아이콘</title><style>body{margin:0;background:#f8f4e9;color:#34312b;font-family:system-ui,sans-serif}header{position:sticky;top:0;padding:20px 24px;background:#f8f4e9ee;border-bottom:1px solid #ded4bf}main{padding:24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}h1{margin:0;color:#174f3c;font-size:24px}article{padding:10px;background:#fffdf7;border:1px solid #e4dac6;border-radius:16px;display:flex;flex-direction:column;align-items:center}img{width:88px;height:88px;object-fit:contain}strong{font-size:12px}code{font-size:9px;color:#918674}</style></head><body><header><h1>온주 손그림 UI 아이콘 · ${manifest.length}개</h1></header><main>${cards}</main></body></html>`);
console.log(`wrote ${manifest.length} UI icons to ${outputDir}`);
