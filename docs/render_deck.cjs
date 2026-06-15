// 온주 피치덱 HTML → 슬라이드별 고해상도 PNG 렌더 (puppeteer-core + Edge)
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SLIDES = 13;

(async () => {
  const outDir = path.resolve(__dirname, 'deck_slides');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 820, deviceScaleFactor: 2 });

  const htmlPath = path.resolve(__dirname, '온주_피치덱.html').replace(/\\/g, '/');
  await page.goto('file:///' + htmlPath, { waitUntil: 'networkidle0', timeout: 60000 });

  // 렌더 모드: 캡션/컨트롤 숨김, 네이티브 1280×720, 테두리·전환 제거
  await page.addStyleTag({
    content:
      'body{padding:0!important;background:#fff!important}' +
      '.deck-cap,#odeck .ctrl{display:none!important}' +
      '#odeck{max-width:none!important;width:1280px!important;margin:0!important}' +
      '#odeck .scaler{border:none!important;border-radius:0!important;box-shadow:none!important}' +
      '#odeck .slide{transition:none!important}',
  });

  // 폰트 로딩 대기 + 스케일 재계산
  await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await new Promise(r => setTimeout(r, 1200));
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await new Promise(r => setTimeout(r, 300));

  const el = await page.$('#odeck .scaler');
  for (let i = 0; i < SLIDES; i++) {
    await page.evaluate(n => window.onjuShow(n), i);
    await new Promise(r => setTimeout(r, 450));
    const num = String(i + 1).padStart(2, '0');
    await el.screenshot({ path: path.join(outDir, `slide_${num}.png`) });
    console.log('captured slide', num);
  }

  await browser.close();
  console.log('DONE → ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
