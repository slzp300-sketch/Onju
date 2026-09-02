import { readFileSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import sharp from 'sharp';

const manifest = JSON.parse(readFileSync('docs/emoji-inventory/onju-curated-300.json', 'utf8'));
const sheetDir = 'assets/onju-emoji/sheets';
const outputDir = 'public/icons/onju';
mkdirSync(outputDir, { recursive: true });
for (const file of readdirSync(outputDir)) {
  if (/^[0-9a-f-]+\.(png|webp)$/.test(file)) unlinkSync(`${outputDir}/${file}`);
}

function detectGridBoundaries(data, width, height, channels) {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const bg = [0, 1, 2].map((channel) => Math.round(
    corners.reduce((sum, pixel) => sum + data[pixel * channels + channel], 0) / corners.length,
  ));
  const xProjection = new Uint32Array(width);
  const yProjection = new Uint32Array(height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const distance = Math.hypot(
        data[offset] - bg[0], data[offset + 1] - bg[1], data[offset + 2] - bg[2],
      );
      if (distance > 32) {
        xProjection[x] += 1;
        yProjection[y] += 1;
      }
    }
  }

  const findCuts = (projection, length, orthogonalLength) => {
    const cuts = [0];
    const cell = length / 5;
    for (let index = 1; index < 5; index += 1) {
      const ideal = index * cell;
      const start = Math.max(cuts.at(-1) + Math.round(cell * 0.55), Math.round(ideal - cell * 0.28));
      const end = Math.min(length - 1, Math.round(ideal + cell * 0.28));
      const quietThreshold = Math.max(2, Math.round(orthogonalLength * 0.006));
      let bestStart = -1;
      let bestEnd = -1;
      let runStart = -1;
      for (let position = start; position <= end + 1; position += 1) {
        const quiet = position <= end && projection[position] <= quietThreshold;
        if (quiet && runStart < 0) runStart = position;
        if (!quiet && runStart >= 0) {
          if (position - runStart > bestEnd - bestStart) {
            bestStart = runStart;
            bestEnd = position - 1;
          }
          runStart = -1;
        }
      }
      if (bestStart >= 0) {
        cuts.push(Math.round((bestStart + bestEnd) / 2));
      } else {
        let minimum = start;
        for (let position = start + 1; position <= end; position += 1) {
          if (projection[position] < projection[minimum]) minimum = position;
        }
        cuts.push(minimum);
      }
    }
    cuts.push(length);
    return cuts;
  };

  return {
    xCuts: findCuts(xProjection, width, height),
    yCuts: findCuts(yProjection, height, width),
  };
}

function removeConnectedBackground(data, width, height, channels) {
  const output = Buffer.from(data);
  const cornerIndexes = [0, width - 1, (height - 1) * width, height * width - 1];
  const bg = [0, 1, 2].map((channel) => Math.round(
    cornerIndexes.reduce((sum, pixel) => sum + data[pixel * channels + channel], 0) / cornerIndexes.length,
  ));
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const similarToPaper = (pixel) => {
    const offset = pixel * channels;
    const dr = data[offset] - bg[0];
    const dg = data[offset + 1] - bg[1];
    const db = data[offset + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db) < 34
      && data[offset] > 220 && data[offset + 1] > 216 && data[offset + 2] > 205;
  };

  const enqueue = (pixel) => {
    if (pixel < 0 || pixel >= width * height || visited[pixel] || !similarToPaper(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    output[pixel * 4 + 3] = 0;
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }

  return output;
}

for (let sheetIndex = 0; sheetIndex < 12; sheetIndex += 1) {
  const sheetPath = `${sheetDir}/sheet-${String(sheetIndex + 1).padStart(2, '0')}.png`;
  const metadata = await sharp(sheetPath).metadata();
  const width = metadata.width;
  const height = metadata.height;
  const { data: sheetData, info: sheetInfo } = await sharp(sheetPath).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { xCuts, yCuts } = detectGridBoundaries(
    sheetData, sheetInfo.width, sheetInfo.height, sheetInfo.channels,
  );

  for (let cellIndex = 0; cellIndex < 25; cellIndex += 1) {
    const item = manifest[sheetIndex * 25 + cellIndex];
    const column = cellIndex % 5;
    const row = Math.floor(cellIndex / 5);
    const left = xCuts[column];
    const top = yCuts[row];
    const right = xCuts[column + 1];
    const bottom = yCuts[row + 1];
    const cellWidth = right - left;
    const cellHeight = bottom - top;

    const { data, info } = await sharp(sheetPath)
      .extract({ left, top, width: cellWidth, height: cellHeight })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const transparent = removeConnectedBackground(data, info.width, info.height, info.channels);
    const trimmed = await sharp(transparent, {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).png().toBuffer();

    const trimmedMeta = await sharp(trimmed).metadata();
    const scale = Math.min(208 / trimmedMeta.width, 208 / trimmedMeta.height, 1);
    const resizedWidth = Math.max(1, Math.round(trimmedMeta.width * scale));
    const resizedHeight = Math.max(1, Math.round(trimmedMeta.height * scale));
    const resized = await sharp(trimmed).resize(resizedWidth, resizedHeight).png().toBuffer();

    const filename = item.unicode.toLowerCase();
    await sharp({
      create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{
      input: resized,
      left: Math.floor((256 - resizedWidth) / 2),
      top: Math.floor((256 - resizedHeight) / 2),
    }]).webp({ quality: 86, alphaQuality: 100, smartSubsample: true })
      .toFile(`${outputDir}/${filename}.webp`);
  }

  console.log(`split sheet ${sheetIndex + 1}/12`);
}

const appManifest = manifest.map((item) => ({
  ...item,
  src: `/icons/onju/${item.unicode.toLowerCase()}.webp`,
}));
writeFileSync(`${outputDir}/manifest.json`, `${JSON.stringify(appManifest, null, 2)}\n`);
const groups = [...new Map(appManifest.map(item => [item.group, item.groupName])).entries()];
const previewSections = groups.map(([group, groupName]) => {
  const icons = appManifest.filter(item => item.group === group);
  return `<section><h2>${groupName} <small>${icons.length}개</small></h2><div class="grid">${icons.map(icon => `
    <article><img src="../../public${icon.src}" alt="${icon.name}"><strong>${icon.name}</strong><code>${icon.unicode}</code></article>`).join('')}</div></section>`;
}).join('');
writeFileSync('docs/emoji-inventory/onju-handdrawn-300.html', `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>온주 손그림 아이콘 300</title><style>
body{margin:0;background:#f8f4e9;color:#34312b;font-family:system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:20px 24px;background:#f8f4e9eF;backdrop-filter:blur(10px);border-bottom:1px solid #ded4bf}main{padding:8px 24px 48px}h1{margin:0;font-size:24px;color:#174f3c}h2{margin-top:36px;color:#174f3c}small{font-weight:400;color:#817969}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px}article{min-height:148px;padding:10px;background:#fffdf7;border:1px solid #e4dac6;border-radius:16px;display:flex;flex-direction:column;align-items:center;text-align:center}img{width:88px;height:88px;object-fit:contain}strong{font-size:12px;line-height:1.3}code{font-size:9px;color:#918674;margin-top:auto}</style></head><body><header><h1>온주 손그림 아이콘 라이브러리 · 300개</h1></header><main>${previewSections}</main></body></html>`);
mkdirSync('src/data', { recursive: true });
writeFileSync(
  'src/data/onjuIcons.generated.ts',
  `// Generated by scripts/split-onju-icon-sheets.mjs — do not edit manually.\n`
    + `export const ONJU_ICONS = ${JSON.stringify(appManifest, null, 2)} as const;\n`,
);
console.log(`wrote ${manifest.length} icons to ${outputDir}`);
