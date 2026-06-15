// 렌더된 슬라이드 PNG → 16:9 PPTX 풀블리드 조립
const pptxgen = require('pptxgenjs');
const path = require('path');
const fs = require('fs');

const dir = path.resolve(__dirname, 'deck_slides');
const SLIDES = 13;

const pptx = new pptxgen();
pptx.defineLayout({ name: 'W16x9', width: 13.333, height: 7.5 });
pptx.layout = 'W16x9';
pptx.author = '온주(Onju)';
pptx.title = '온주(Onju) 투자 피치덱';

for (let i = 1; i <= SLIDES; i++) {
  const num = String(i).padStart(2, '0');
  const img = path.join(dir, `slide_${num}.png`);
  if (!fs.existsSync(img)) throw new Error('missing ' + img);
  const slide = pptx.addSlide();
  slide.background = { color: '0B2818' };
  slide.addImage({ path: img, x: 0, y: 0, w: 13.333, h: 7.5 });
}

const out = path.resolve(__dirname, '온주_피치덱.pptx');
pptx.writeFile({ fileName: out }).then(f => console.log('WROTE → ' + f)).catch(e => { console.error(e); process.exit(1); });
