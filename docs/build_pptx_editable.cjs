// 온주 피치덱 — 편집 가능한 네이티브 PPTX (텍스트박스 + 도형, 이미지 아님)
// 폰트: 맑은 고딕(윈도우 기본). 색: 앱 숲 테마.
const pptxgen = require('pptxgenjs');
const path = require('path');

const F = 'Malgun Gothic';
const INK = '182420', SEC = '5C6E63', TER = '9AAB9F';
const GREEN = '2F9E60', GREEND = '1F7A48', GREENL = '57B97C', GREENXL = '8FD3A3';
const MINT = 'E6F4EA', MINTBG = 'EDF6EC', CREAM = 'F7FAF4', PAPER = 'FFFFFF', LINE = 'E2EBE1';
const GOLD = 'CF8F1C', GOLDL = 'ECC14E', GOLDSOFT = 'F7EDD6';
const DARK = '10301F', DARKCARD = '1B4631', DARKLINE = '2E6347', TRUNK = '8A6A4A';

const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.333, height: 7.5 });
pptx.layout = 'W';
pptx.author = '온주(Onju)';
pptx.title = '온주(Onju) 투자 피치덱 (편집본)';

const T = (s, t, o) => s.addText(t, Object.assign({ fontFace: F }, o));
const R = (s, x, y, w, h, o) => s.addShape('rect', Object.assign({ x, y, w, h }, o));
const RR = (s, x, y, w, h, o) => s.addShape('roundRect', Object.assign({ x, y, w, h, rectRadius: 0.1 }, o));
const EL = (s, x, y, w, h, fill) => s.addShape('ellipse', { x, y, w, h, fill: { color: fill } });
const LN = (s, x, y, w, h, c, wd) => s.addShape('line', { x, y, w, h, line: { color: c, width: wd || 1 } });

function kicker(s, txt, dark) {
  T(s, txt, { x: 0.85, y: 0.5, w: 9, h: 0.4, fontFace: F, fontSize: 13, bold: true, color: dark ? GOLDL : GREEN, charSpacing: 2 });
}
function footer(s, n, dark) {
  T(s, '온주 ｜ Onju', { x: 0.85, y: 7.0, w: 4, h: 0.3, fontSize: 9, color: dark ? '6F9B80' : TER });
  T(s, n + ' / 13', { x: 8.5, y: 7.0, w: 3.98, h: 0.3, align: 'right', fontSize: 9, color: dark ? '5F8A72' : TER });
}
function card(s, x, y, w, h, fill, line) {
  RR(s, x, y, w, h, { fill: { color: fill || PAPER }, line: { color: line || LINE, width: 1 }, rectRadius: 0.12 });
}
function tree(s, cx, cy, sc) {
  R(s, cx - 0.045 * sc, cy, 0.09 * sc, 0.55 * sc, { fill: { color: TRUNK } });
  EL(s, cx - 0.92 * sc, cy - 0.42 * sc, 0.66 * sc, 0.66 * sc, GREENL);
  EL(s, cx + 0.26 * sc, cy - 0.5 * sc, 0.72 * sc, 0.72 * sc, GREEN);
  EL(s, cx - 0.5 * sc, cy - 0.78 * sc, 1.0 * sc, 1.0 * sc, GREENXL);
  EL(s, cx - 0.18 * sc, cy - 0.34 * sc, 0.5 * sc, 0.5 * sc, GREENL);
}

// ───────── 1. 표지 ─────────
let s = pptx.addSlide(); s.background = { color: DARK };
T(s, 'INVESTMENT PITCH · 2026', { x: 6.5, y: 0.5, w: 6, h: 0.4, align: 'right', fontSize: 12, bold: true, color: GOLDL, charSpacing: 2 });
tree(s, 6.667, 1.55, 0.95);
T(s, '온주', { x: 0, y: 2.75, w: 13.333, h: 1.0, align: 'center', fontSize: 60, bold: true, color: PAPER });
T(s, 'Onju', { x: 0, y: 3.85, w: 13.333, h: 0.5, align: 'center', fontSize: 22, color: 'A9CDB6' });
T(s, '삶이 곧 예배 — 매 순간, 그리스도인답게', { x: 0, y: 4.5, w: 13.333, h: 0.5, align: 'center', fontSize: 18, bold: true, color: 'CFE6D6' });
T(s, '신앙·일상·공동체를 하나로 잇는 크리스천 라이프 매니지먼트 앱', { x: 0, y: 5.05, w: 13.333, h: 0.4, align: 'center', fontSize: 13, color: '86B095' });

// ───────── 2. 문제 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '02 · 문제');
T(s, '신앙은 주일에 멈추고,\n삶은 평일에 흩어집니다.', { x: 0.85, y: 0.95, w: 11.6, h: 1.4, fontSize: 31, bold: true, color: INK, lineSpacingMultiple: 1.1 });
T(s, '1,349만 크리스천이 매주 겪는 단절 — 신앙과 일상을 잇는 도구가 없습니다.', { x: 0.85, y: 2.45, w: 11.6, h: 0.5, fontSize: 14, color: SEC });
const p2 = [
  ['신앙과 삶의 분리', '주일의 결심은 월요일이면 사라진다. 일상엔 신앙을 붙잡을 장치가 없다.', MINT],
  ['파편화된 도구', '일정은 캘린더, 습관은 루틴앱, 공동체는 단톡방 — 따로 흩어져 논다.', MINT],
  ['신앙 특화 통합 부재', '크리스천의 삶 전체를 신앙 중심으로 담아내는 앱이 시장에 없다.', GOLDSOFT],
];
p2.forEach((c, i) => {
  const x = 0.85 + i * 3.96;
  card(s, x, 3.15, 3.71, 2.95);
  RR(s, x + 0.35, 3.5, 0.55, 0.55, { fill: { color: c[2] }, line: { type: 'none' }, rectRadius: 0.1 });
  T(s, c[0], { x: x + 0.35, y: 4.25, w: 3.0, h: 0.5, fontSize: 17, bold: true, color: INK });
  T(s, c[1], { x: x + 0.35, y: 4.8, w: 3.05, h: 1.2, fontSize: 13, color: SEC, lineSpacingMultiple: 1.2 });
});
footer(s, '02');

// ───────── 3. 솔루션 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '03 · 솔루션');
T(s, [{ text: '온주 — 신앙·일상·공동체를\n하나의 ' }, { text: '숲', options: { color: GREEN } }, { text: '으로.' }], { x: 0.85, y: 0.95, w: 11.6, h: 1.3, fontSize: 28, bold: true, color: INK, lineSpacingMultiple: 1.1 });
T(s, '나무가 자라듯, 당신의 신앙이 자랍니다. 루틴을 지킬수록 나의 나무가 성장합니다.', { x: 0.85, y: 2.35, w: 11.6, h: 0.5, fontSize: 14, color: SEC });
const p3 = [
  ['신앙 루틴 → 나무 성장', 'QT·기도·말씀 루틴이 나무를 키우고, 단계마다 새로운 숲 테마가 열린다.', GOLDSOFT],
  ['일상 관리', '오늘의 말씀·일정·할 일·목표를 하루 대시보드 한 화면에서.', MINT],
  ['공동체 소모임', '교회 셀·구역을 앱으로 — 일정 공유, 출석, 나눔까지 함께.', MINT],
];
p3.forEach((c, i) => {
  const x = 0.85 + i * 3.96;
  card(s, x, 2.95, 3.71, 2.5);
  RR(s, x + 0.35, 3.25, 0.55, 0.55, { fill: { color: c[2] }, line: { type: 'none' }, rectRadius: 0.1 });
  T(s, c[0], { x: x + 0.35, y: 4.0, w: 3.05, h: 0.5, fontSize: 16, bold: true, color: INK });
  T(s, c[1], { x: x + 0.35, y: 4.5, w: 3.05, h: 0.9, fontSize: 13, color: SEC, lineSpacingMultiple: 1.2 });
});
RR(s, 0.85, 5.75, 8.7, 0.55, { fill: { color: MINT }, line: { type: 'none' }, rectRadius: 0.27 });
T(s, '마이루틴의 UX × 예수동행일기의 신앙 깊이 = 온주', { x: 0.85, y: 5.75, w: 8.7, h: 0.55, align: 'center', valign: 'middle', fontSize: 15, bold: true, color: GREEND });
footer(s, '03');

// ───────── 4. 제품 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '04 · 제품');
T(s, '3개의 탭, 하나의 신앙 라이프.', { x: 0.85, y: 0.95, w: 11.6, h: 0.7, fontSize: 28, bold: true, color: INK });
// 폰 목업
RR(s, 0.85, 2.1, 2.7, 4.3, { fill: { color: '0E3D25' }, line: { type: 'none' }, rectRadius: 0.3 });
RR(s, 1.0, 2.25, 2.4, 4.0, { fill: { color: MINTBG }, line: { type: 'none' }, rectRadius: 0.22 });
T(s, '오늘의 나무 · 14일째', { x: 1.15, y: 2.4, w: 2.1, h: 0.3, fontSize: 10, bold: true, color: SEC });
tree(s, 2.2, 3.15, 0.5);
RR(s, 1.15, 4.2, 2.1, 0.5, { fill: { color: PAPER }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
T(s, '아침 QT', { x: 1.3, y: 4.2, w: 1.5, h: 0.5, valign: 'middle', fontSize: 11, bold: true, color: INK });
T(s, '✓', { x: 2.85, y: 4.2, w: 0.3, h: 0.5, valign: 'middle', align: 'center', fontSize: 11, bold: true, color: GREEN });
RR(s, 1.15, 4.8, 2.1, 0.5, { fill: { color: PAPER }, line: { color: LINE, width: 1 }, rectRadius: 0.08 });
T(s, '중보 기도', { x: 1.3, y: 4.8, w: 1.5, h: 0.5, valign: 'middle', fontSize: 11, bold: true, color: INK });
T(s, '✓', { x: 2.85, y: 4.8, w: 0.3, h: 0.5, valign: 'middle', align: 'center', fontSize: 11, bold: true, color: GREEN });
T(s, '홈        소모임        루틴', { x: 1.15, y: 5.7, w: 2.1, h: 0.3, align: 'center', fontSize: 9, color: TER });
// 우측 카드
const p4 = [
  [[{ text: '홈', options: { color: GREEN, bold: true } }, { text: ' · 하루 대시보드', options: { bold: true } }], '오늘의 말씀, 일정, 루틴 달성률, 기도 제목을 한눈에.'],
  [[{ text: '신앙 루틴', options: { color: GOLD, bold: true } }, { text: ' · 나무 성장', options: { bold: true } }], '지킬수록 나무가 자라는 게임화 — 스트릭·뱃지·테마 보상으로 지속률을 끌어올린다.'],
  [[{ text: '소모임', options: { color: GREEN, bold: true } }, { text: ' · 공동체', options: { bold: true } }], '교회 셀·구역을 앱으로 운영 — 다중 사용자 동기화까지 구현 완료.'],
];
p4.forEach((c, i) => {
  const y = 2.15 + i * 1.05;
  card(s, 3.95, y, 8.5, 0.92);
  T(s, c[0], { x: 4.2, y: y + 0.1, w: 8.0, h: 0.4, fontSize: 16, color: INK });
  T(s, c[1], { x: 4.2, y: y + 0.46, w: 8.0, h: 0.4, fontSize: 12.5, color: SEC });
});
RR(s, 3.95, 5.5, 8.5, 0.6, { fill: { color: GOLDSOFT }, line: { type: 'none' }, rectRadius: 0.3 });
T(s, '✓  이미 동작하는 PWA — 안드로이드 빌드·백엔드 동기화 검증 완료', { x: 3.95, y: 5.5, w: 8.5, h: 0.6, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: '9A6A10' });
footer(s, '04');

// ───────── 5. Why Now ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '05 · Why Now');
T(s, '지금이 유일한 타이밍입니다.', { x: 0.85, y: 0.95, w: 11.6, h: 0.7, fontSize: 28, bold: true, color: INK });
const p5 = [
  ['96.5%', GREEN, '스마트폰 보급률', '크리스천 약 1,255만 명이 이미 손 안에 — 도달 비용 0.'],
  ['+14%', GOLD, '라이프스타일 앱 성장률', '생산성·구독 카테고리 연 14% 성장, 월 5천~1.2만원 결제 정착.'],
  ['레거시 UI', GREEN, '기존 신앙 앱의 공백', '예수동행일기는 2012년 UI에 멈춰 있고, 일정·루틴 관리가 없다.'],
  ['신앙 0', GOLD, '생산성 앱의 공백', '마이루틴은 UX 최고지만 신앙·공동체 기능이 전무하다.'],
];
p5.forEach((c, i) => {
  const x = 0.85 + (i % 2) * 5.96, y = 2.35 + Math.floor(i / 2) * 1.95;
  card(s, x, y, 5.66, 1.7);
  T(s, c[0], { x: x + 0.3, y: y, w: 1.9, h: 1.7, valign: 'middle', fontSize: c[0].length > 4 ? 22 : 30, bold: true, color: c[1] });
  T(s, c[2], { x: x + 2.25, y: y + 0.32, w: 3.1, h: 0.5, fontSize: 16, bold: true, color: INK });
  T(s, c[3], { x: x + 2.25, y: y + 0.78, w: 3.15, h: 0.8, fontSize: 12.5, color: SEC, lineSpacingMultiple: 1.15 });
});
footer(s, '05');

// ───────── 6. 시장 규모 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '06 · 시장 규모');
T(s, '1,349만 크리스천,\n380만 결제 의향층.', { x: 0.85, y: 0.95, w: 6, h: 1.3, fontSize: 28, bold: true, color: INK, lineSpacingMultiple: 1.1 });
EL(s, 1.5, 2.55, 3.8, 3.8, MINT);
EL(s, 1.95, 3.45, 2.9, 2.9, 'BFE6CD');
EL(s, 2.5, 4.35, 1.8, 1.8, GREEN);
T(s, 'TAM', { x: 1.5, y: 2.7, w: 3.8, h: 0.3, align: 'center', fontSize: 13, bold: true, color: GREEND });
T(s, '1,255만', { x: 1.5, y: 2.98, w: 3.8, h: 0.5, align: 'center', fontSize: 22, bold: true, color: '143723' });
T(s, 'SAM', { x: 1.95, y: 3.85, w: 2.9, h: 0.3, align: 'center', fontSize: 12, bold: true, color: GREEND });
T(s, '380만', { x: 1.95, y: 4.12, w: 2.9, h: 0.4, align: 'center', fontSize: 18, bold: true, color: '143723' });
T(s, 'SOM  15만', { x: 2.5, y: 5.05, w: 1.8, h: 0.4, align: 'center', fontSize: 13, bold: true, color: PAPER });
const p6 = [
  ['TAM · 전체 시장', '스마트폰 보유 크리스천 1,255만 (개신교 967만 + 천주교 382만, 전 국민 26.1%)'],
  ['SAM · 유효 시장', '생산성·구독 앱 결제 의향층 380만 명'],
  ['SOM · 3년 목표', 'SAM의 4% = 15만 사용자, 단계별 달성'],
];
p6.forEach((c, i) => {
  const y = 2.9 + i * 1.2;
  T(s, c[0], { x: 6.2, y: y, w: 6.2, h: 0.35, fontSize: 16, bold: true, color: GREEND });
  T(s, c[1], { x: 6.2, y: y + 0.38, w: 6.2, h: 0.7, fontSize: 14, color: SEC, lineSpacingMultiple: 1.15 });
});
footer(s, '06');

// ───────── 7. 경쟁 포지셔닝 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '07 · 경쟁 포지셔닝');
T(s, [{ text: '두 시장 사이, 비어 있는 ' }, { text: '우상단', options: { color: GOLD } }, { text: '.' }], { x: 0.85, y: 0.95, w: 11.6, h: 0.7, fontSize: 28, bold: true, color: INK });
RR(s, 0.95, 2.5, 6.0, 3.9, { fill: { color: 'F0F6EE' }, line: { type: 'none' }, rectRadius: 0.1 });
LN(s, 3.95, 2.5, 0, 3.9, 'DBE7DA', 1);
LN(s, 0.95, 4.45, 6.0, 0, 'DBE7DA', 1);
T(s, '일상 · 생산성 관리 →', { x: 0.95, y: 6.45, w: 6.0, h: 0.3, align: 'center', fontSize: 13, bold: true, color: SEC });
T(s, '신앙 깊이 →', { x: 0.0, y: 4.3, w: 2.5, h: 0.3, align: 'center', fontSize: 13, bold: true, color: SEC, rotate: 270 });
// 경쟁사 버블
EL(s, 5.2, 4.95, 0.95, 0.95, 'CDE8D8'); T(s, '마이루틴', { x: 5.0, y: 5.18, w: 1.35, h: 0.3, align: 'center', fontSize: 11, bold: true, color: GREEND });
EL(s, 1.95, 2.95, 0.95, 0.95, 'F1E3C4'); T(s, '예수동행', { x: 1.75, y: 3.18, w: 1.35, h: 0.3, align: 'center', fontSize: 11, bold: true, color: '8A5A12' });
EL(s, 1.7, 4.95, 0.75, 0.75, 'E6DDC8'); T(s, '갓피플', { x: 1.55, y: 5.12, w: 1.05, h: 0.3, align: 'center', fontSize: 10, bold: true, color: '7A6A3A' });
EL(s, 2.85, 3.15, 0.7, 0.7, 'E6DDC8'); T(s, 'Glorify', { x: 2.7, y: 3.32, w: 1.0, h: 0.3, align: 'center', fontSize: 10, bold: true, color: '7A6A3A' });
EL(s, 4.9, 2.7, 1.25, 1.25, GREEN);
T(s, '★', { x: 4.9, y: 2.85, w: 1.25, h: 0.5, align: 'center', fontSize: 26, color: GOLDL });
T(s, '온주', { x: 4.9, y: 3.4, w: 1.25, h: 0.4, align: 'center', fontSize: 15, bold: true, color: PAPER });
T(s, [{ text: '생산성 UX와 신앙 깊이를\n동시에 잡은 앱은 ' }, { text: '온주', options: { color: GREEN } }, { text: '가 유일합니다.' }], { x: 7.4, y: 3.0, w: 5.0, h: 1.2, fontSize: 21, bold: true, color: INK, lineSpacingMultiple: 1.15 });
T(s, '마이루틴 사용자도, 예수동행일기 사용자도 모두 온주의 잠재 고객입니다. 두 시장을 한 번에 가져갑니다.', { x: 7.4, y: 4.4, w: 5.0, h: 1.2, fontSize: 14, color: SEC, lineSpacingMultiple: 1.3 });
footer(s, '07');

// ───────── 8. 수익 모델 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '08 · 수익 모델');
T(s, '커피 두 잔으로 시작하는 구독.', { x: 0.85, y: 0.95, w: 11.6, h: 0.7, fontSize: 28, bold: true, color: INK });
const tiers = [
  ['Free', GREEN, '무료', '탐색·신규 유입', false],
  ['Basic', '1976D2', '4,900원', '연 39,900원 · 32%↓', false],
  ['Premium ★', GOLD, '9,900원', 'AI 코칭 · 무제한', true],
  ['Church', '7B1FA2', '49,000원', '교회·사역 단체', false],
];
tiers.forEach((t, i) => {
  const x = 0.85 + i * 2.97;
  card(s, x, 2.55, 2.72, 2.1, t[4] ? GOLDSOFT : PAPER, t[4] ? GOLD : LINE);
  if (t[4]) s.addShape('roundRect', { x, y: 2.55, w: 2.72, h: 2.1, fill: { type: 'none' }, line: { color: GOLD, width: 2 }, rectRadius: 0.12 });
  T(s, t[0], { x: x, y: 2.8, w: 2.72, h: 0.35, align: 'center', fontSize: 15, bold: true, color: t[1] });
  T(s, t[2], { x: x, y: 3.25, w: 2.72, h: 0.6, align: 'center', fontSize: 26, bold: true, color: INK });
  T(s, t[3], { x: x, y: 4.0, w: 2.72, h: 0.4, align: 'center', fontSize: 12.5, color: t[4] ? '9A6A10' : SEC });
});
card(s, 0.85, 5.0, 5.66, 1.4);
T(s, 'B2C — 개인 구독', { x: 1.15, y: 5.25, w: 5.0, h: 0.4, fontSize: 18, bold: true, color: GREEN });
T(s, 'ARPU 6,500 → 7,800원, 연 구독 32% 할인으로 LTV 극대화', { x: 1.15, y: 5.72, w: 5.1, h: 0.6, fontSize: 13, color: SEC });
card(s, 6.81, 5.0, 5.66, 1.4);
T(s, 'B2B — 교회 플랜', { x: 7.11, y: 5.25, w: 5.0, h: 0.4, fontSize: 18, bold: true, color: GOLD });
T(s, '교회 단위 결제 — 높은 객단가 + 낮은 이탈의 듀얼 엔진', { x: 7.11, y: 5.72, w: 5.1, h: 0.6, fontSize: 13, color: SEC });
footer(s, '08');

// ───────── 9. 성장 곡선 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '09 · 성장 곡선');
T(s, [{ text: '3년 차 ' }, { text: '13.2억', options: { color: GREEN } }, { text: ' 매출,\n흑자 전환은 출시 9개월 후.' }], { x: 0.85, y: 0.95, w: 11.6, h: 1.3, fontSize: 27, bold: true, color: INK, lineSpacingMultiple: 1.1 });
// 막대 (도형)
const bars = [['2026', '2,900만', 0.45, 'BFE6CD'], ['2027', '3.4억', 1.5, GREENL], ['2028', '13.2억', 3.0, GREEN]];
const baseY = 6.2;
bars.forEach((b, i) => {
  const x = 1.1 + i * 1.5;
  R(s, x, baseY - b[2], 1.0, b[2], { fill: { color: b[3] } });
  T(s, b[1], { x: x - 0.3, y: baseY - b[2] - 0.45, w: 1.6, h: 0.4, align: 'center', fontSize: 16, bold: true, color: i === 2 ? GREEND : INK });
  T(s, b[0], { x: x - 0.3, y: baseY + 0.05, w: 1.6, h: 0.35, align: 'center', fontSize: 14, bold: true, color: SEC });
});
const kpi = [['손익분기 시점', '2027 Q1 · 유료 958명'], ['유료 전환율', '10% → 18%'], ['월 활성 사용자', '5천 → 7만 (3년)']];
kpi.forEach((k, i) => {
  const y = 2.7 + i * 1.15;
  card(s, 6.9, y, 5.55, 0.95);
  T(s, k[0], { x: 7.2, y: y + 0.14, w: 5.0, h: 0.35, fontSize: 13, color: SEC });
  T(s, k[1], { x: 7.2, y: y + 0.48, w: 5.0, h: 0.4, fontSize: 19, bold: true, color: INK });
});
footer(s, '09');

// ───────── 10. 시장 진입 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '10 · 시장 진입');
T(s, [{ text: '교회가 곧 ' }, { text: '유통망', options: { color: GREEN } }, { text: '입니다.' }], { x: 0.85, y: 0.95, w: 11.6, h: 0.7, fontSize: 28, bold: true, color: INK });
T(s, '소모임 기능을 교회 셀·구역에 무료 제공 → 공동체 단위 오거닉 확산 (B2C2C, 낮은 CAC)', { x: 0.85, y: 1.75, w: 11.6, h: 0.5, fontSize: 14, color: SEC });
const p10 = [
  ['교회 네트워크', '리더 데모 → 셀 단위 도입, 청년집회·교단 행사 부스', MINT],
  ['인플루언서', '크리스천 인플루언서 1~10만 티어 집중 협업', GOLDSOFT],
  ['기독교 미디어', 'CBS·CGN·갓피플 배너 + 앱 리뷰 기사', MINT],
  ['7일 챌린지', '유튜브 쇼츠 신앙 챌린지로 바이럴, 베타 500명', GOLDSOFT],
];
p10.forEach((c, i) => {
  const x = 0.85 + i * 2.97;
  card(s, x, 2.6, 2.72, 2.7);
  RR(s, x + 0.3, 2.9, 0.55, 0.55, { fill: { color: c[2] }, line: { type: 'none' }, rectRadius: 0.1 });
  T(s, c[0], { x: x + 0.3, y: 3.65, w: 2.2, h: 0.4, fontSize: 16, bold: true, color: INK });
  T(s, c[1], { x: x + 0.3, y: 4.1, w: 2.2, h: 1.0, fontSize: 12.5, color: SEC, lineSpacingMultiple: 1.2 });
});
footer(s, '10');

// ───────── 11. 로드맵 ─────────
s = pptx.addSlide(); s.background = { color: CREAM }; kicker(s, '11 · 로드맵');
T(s, '출시까지 6개월, 흑자까지 12개월.', { x: 0.85, y: 0.95, w: 11.6, h: 0.7, fontSize: 28, bold: true, color: INK });
LN(s, 1.5, 3.4, 10.3, 0, LINE, 2);
const phases = [
  ['Phase 1 · 2026 Q3', '네이티브 앱 출시', 'iOS·Android 전환, 스토어 등록', GREEN],
  ['Phase 2 · 2026 Q4', '인앱 구독 도입', '유료 전환율 10% · MAU 5천', GREEN],
  ['Phase 3 · 2027 H1', '커뮤니티 강화', '교회 관리자·AI 큐티 · MAU 3만', GREEN],
  ['Phase 4 · 2027 H2', '확장', '웹 대시보드·사역자 플랜 · MAU 8만', GOLD],
];
phases.forEach((p, i) => {
  const cx = 2.0 + i * 2.85;
  EL(s, cx - 0.35, 3.05, 0.7, 0.7, MINT);
  tree(s, cx, 3.25, 0.18);
  T(s, p[0], { x: cx - 1.4, y: 3.95, w: 2.8, h: 0.35, align: 'center', fontSize: 13, bold: true, color: p[3] });
  T(s, p[1], { x: cx - 1.4, y: 4.32, w: 2.8, h: 0.4, align: 'center', fontSize: 17, bold: true, color: INK });
  T(s, p[2], { x: cx - 1.4, y: 4.78, w: 2.8, h: 0.6, align: 'center', fontSize: 12.5, color: SEC, lineSpacingMultiple: 1.15 });
});
footer(s, '11');

// ───────── 12. 투자 요청 ─────────
s = pptx.addSlide(); s.background = { color: DARK }; kicker(s, '12 · 투자 요청', true);
T(s, '7,260만 원으로\n출시부터 흑자 전환까지.', { x: 0.85, y: 0.95, w: 11.6, h: 1.3, fontSize: 28, bold: true, color: PAPER, lineSpacingMultiple: 1.1 });
const funds = [
  ['제품 개발 · 출시 준비', '3,000만 원', '모바일 앱 개발 (iOS+Android) · UI/UX 디자인 · 인앱결제 시스템 · 인프라 세팅'],
  ['12개월 운영 런웨이', '4,260만 원', '서버·인프라 · 마케팅·런칭 · 인건비 — 손익분기까지의 런웨이 확보'],
];
funds.forEach((f, i) => {
  const x = 0.85 + i * 5.96;
  RR(s, x, 2.75, 5.66, 2.0, { fill: { color: DARKCARD }, line: { color: DARKLINE, width: 1 }, rectRadius: 0.12 });
  T(s, f[0], { x: x + 0.35, y: 3.0, w: 5.0, h: 0.35, fontSize: 15, bold: true, color: GOLDL });
  T(s, f[1], { x: x + 0.35, y: 3.4, w: 5.0, h: 0.6, fontSize: 30, bold: true, color: PAPER });
  T(s, f[2], { x: x + 0.35, y: 4.1, w: 5.0, h: 0.6, fontSize: 13, color: 'BCD9C6', lineSpacingMultiple: 1.2 });
});
const pills = [['2026 Q4 출시', GOLDL], ['2027 Q1 손익분기', GOLDL], ['2027 흑자 전환', GREENXL]];
pills.forEach((p, i) => {
  const x = 0.85 + i * 3.0;
  RR(s, x, 5.1, 2.8, 0.55, { fill: { color: DARKCARD }, line: { type: 'none' }, rectRadius: 0.27 });
  T(s, p[0], { x: x, y: 5.1, w: 2.8, h: 0.55, align: 'center', valign: 'middle', fontSize: 14, bold: true, color: p[1] });
});
footer(s, '12', true);

// ───────── 13. 비전 ─────────
s = pptx.addSlide(); s.background = { color: DARK };
T(s, '13 · 비전', { x: 0, y: 1.6, w: 13.333, h: 0.4, align: 'center', fontSize: 13, bold: true, color: GOLDL, charSpacing: 2 });
T(s, [{ text: '한 그루의 나무가,\n' }, { text: '숲', options: { color: GOLDL } }, { text: '이 됩니다.' }], { x: 0, y: 2.3, w: 13.333, h: 1.7, align: 'center', fontSize: 44, bold: true, color: PAPER, lineSpacingMultiple: 1.1 });
T(s, '크리스천 1,349만의 일상을 신앙으로 —\n삶이 곧 예배가 되는 세상을 온주가 만듭니다.', { x: 0, y: 4.3, w: 13.333, h: 1.0, align: 'center', fontSize: 18, color: 'CFE6D6', lineSpacingMultiple: 1.3 });
T(s, '온주 · Onju  ｜  함께 심으시겠습니까?', { x: 0, y: 5.7, w: 13.333, h: 0.4, align: 'center', fontSize: 16, bold: true, color: GOLDL });

const out = path.resolve(__dirname, '온주_피치덱_편집본.pptx');
pptx.writeFile({ fileName: out }).then(f => console.log('WROTE → ' + f)).catch(e => { console.error(e); process.exit(1); });
