// 온주 앱 아이콘/스플래시/스토어 그래픽 생성 (@capacitor/assets 입력용)
// 브랜드 마크: 미니멀 새싹 — "작은 루틴을 심으면 자라난다"
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('assets', { recursive: true });

const FONT = "Malgun Gothic, 'Apple SD Gothic Neo', 'Noto Sans CJK KR', sans-serif";

// 새싹 마크 — viewBox 0 0 512 512 기준. stem/잎 색을 인자로.
const sprout = (stem, leafL, leafR, shadow = null) => `
  ${shadow ? `<ellipse cx="256" cy="442" rx="120" ry="18" fill="${shadow}" opacity="0.3"/>` : ''}
  <path d="M256 430 C256 340 256 300 256 262" stroke="${stem}" stroke-width="26" stroke-linecap="round" fill="none"/>
  <path d="M256 278 C256 200 196 150 118 150 C118 232 178 282 256 278 Z" fill="${leafL}"/>
  <path d="M256 250 C256 186 306 144 394 144 C394 214 340 258 256 250 Z" fill="${leafR}"/>`;

const GREEN_BG = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#45c581"/><stop offset="1" stop-color="#1c7d4b"/>
  </linearGradient>`;

// 스토어/런처 아이콘: 그린 그라디언트 + 화이트 새싹
const iconOnly = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
     <defs>${GREEN_BG}</defs>
     <rect width="512" height="512" fill="url(#bg)"/>
     ${sprout('#f6efe2', '#ffffff', '#dff2e5', '#0e5c33')}
   </svg>`;

// 어댑티브 전경: 중앙 안전영역(~66%) 안에 새싹만 + 투명 배경
const foreground = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
     <g transform="translate(256 256) scale(0.6) translate(-256 -256)">
       ${sprout('#f6efe2', '#ffffff', '#dff2e5')}
     </g>
   </svg>`;

// 어댑티브 배경: 그린 그라디언트
const background = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
     <defs>${GREEN_BG}</defs>
     <rect width="512" height="512" fill="url(#bg)"/>
   </svg>`;

// 스플래시: 배경 + 중앙 새싹 + 워드마크 (라이트: 그린 새싹 / 다크: 화이트 새싹)
const splash = (s, bg, mark, textColor) => {
  const box = s * 0.26;
  const x = (s - box) / 2;
  const y = (s - box) / 2 - s * 0.02;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
     <rect width="${s}" height="${s}" fill="${bg}"/>
     <g transform="translate(${x} ${y}) scale(${box / 512})">${mark}</g>
     <text x="50%" y="${y + box + s * 0.05}" font-size="${s * 0.036}" font-weight="700" text-anchor="middle" font-family="${FONT}" fill="${textColor}">온주</text>
   </svg>`;
};

// 플레이스토어 그래픽 이미지 (1024×500): 그린 그라디언트 + 화이트 새싹 + 워드마크
const featureGraphic = () => {
  const w = 1024, h = 500, box = 320;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
     <defs>${GREEN_BG}</defs>
     <rect width="${w}" height="${h}" fill="url(#bg)"/>
     <g transform="translate(120 ${(h - box) / 2}) scale(${box / 512})">${sprout('#f6efe2', '#ffffff', '#dff2e5')}</g>
     <text x="480" y="222" font-size="76" font-weight="800" font-family="${FONT}" fill="#ffffff">온주</text>
     <text x="480" y="294" font-size="34" font-weight="500" font-family="${FONT}" fill="#dff2e5">크리스천 직장인의 루틴 파트너</text>
   </svg>`;
};

async function render(svg, file, w, h = w) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(w, h).png().toFile(`assets/${file}`);
  console.log('  wrote assets/' + file);
}

const greenSprout = sprout('#2f9e60', '#37a061', '#57b97c', '#2f9e60');
const whiteSprout = sprout('#f6efe2', '#ffffff', '#dff2e5');

await render(iconOnly(), 'icon-only.png', 1024);
await render(iconOnly(), 'store-icon-512.png', 512);
await render(foreground(), 'icon-foreground.png', 1024);
await render(background(), 'icon-background.png', 1024);
await render(splash(2732, '#f3f7f1', greenSprout, '#24332b'), 'splash.png', 2732);
await render(splash(2732, '#0f1115', whiteSprout, '#e6efe8'), 'splash-dark.png', 2732);
await render(featureGraphic(), 'feature-graphic-1024x500.png', 1024, 500);
console.log('done');
