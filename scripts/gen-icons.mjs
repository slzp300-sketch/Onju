// 온주 앱 아이콘/스플래시 소스 생성 (@capacitor/assets 입력용)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });

const BLUE = '#1f6bff';
const FONT = "Malgun Gothic, 'Apple SD Gothic Neo', 'Noto Sans CJK KR', sans-serif";

const iconOnly = (s) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
     <rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${BLUE}"/>
     <text x="50%" y="50%" dy="0.34em" font-size="${s * 0.5}" font-weight="700" text-anchor="middle" font-family="${FONT}" fill="#ffffff">직</text>
   </svg>`;

// 어댑티브 전경: 중앙 안전영역(~66%) 안에 들어가도록 작게 + 투명 배경
const foreground = (s) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
     <text x="50%" y="50%" dy="0.34em" font-size="${s * 0.33}" font-weight="700" text-anchor="middle" font-family="${FONT}" fill="#ffffff">직</text>
   </svg>`;

const solid = (s, color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><rect width="${s}" height="${s}" fill="${color}"/></svg>`;

// 스플래시: 배경 + 중앙 로고 배지(직)
const splash = (s, bg) => {
  const box = s * 0.16;
  const x = (s - box) / 2;
  const y = (s - box) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
     <rect width="${s}" height="${s}" fill="${bg}"/>
     <rect x="${x}" y="${y}" width="${box}" height="${box}" rx="${box * 0.24}" fill="${BLUE}"/>
     <text x="50%" y="50%" dy="0.34em" font-size="${box * 0.55}" font-weight="700" text-anchor="middle" font-family="${FONT}" fill="#ffffff">직</text>
   </svg>`;
};

async function render(svg, file, size) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`assets/${file}`);
  console.log('  wrote assets/' + file);
}

await render(iconOnly(1024), 'icon-only.png', 1024);
await render(foreground(1024), 'icon-foreground.png', 1024);
await render(solid(1024, BLUE), 'icon-background.png', 1024);
await render(splash(2732, '#ffffff'), 'splash.png', 2732);
await render(splash(2732, '#0f1115'), 'splash-dark.png', 2732);
console.log('done');
