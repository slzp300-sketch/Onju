import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ko = JSON.parse(readFileSync('node_modules/emoji-picker-react/src/data/emojis-ko.json', 'utf8'));
const en = JSON.parse(readFileSync('node_modules/emoji-picker-react/src/data/emojis-en.json', 'utf8'));

const sourceCategories = [
  'smileys_people', 'animals_nature', 'food_drink', 'travel_places',
  'activities', 'objects', 'symbols',
];

const toEmoji = (unicode) => unicode.split('-')
  .map((part) => String.fromCodePoint(Number.parseInt(part, 16)))
  .join('');

const enByUnicode = new Map(
  sourceCategories.flatMap((category) => en.emojis[category] ?? []).map((item) => [item.u, item]),
);

const all = sourceCategories.flatMap((category) =>
  (ko.emojis[category] ?? []).map((item, order) => {
    const english = enByUnicode.get(item.u);
    return {
      sourceCategory: category,
      sourceCategoryKo: ko.categories[category].name,
      sourceOrder: order,
      unicode: item.u,
      emoji: toEmoji(item.u),
      nameKo: item.n.at(-1) ?? item.n[0] ?? '',
      keywordsKo: item.n,
      keywordsEn: english?.n ?? [],
      version: item.a,
    };
  }),
);

const normalize = (values) => values.join(' ').toLowerCase();
const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// 온주의 핵심 사용 맥락. 앞쪽 단어일수록 선택 점수가 높다.
const groups = [
  {
    id: 'faith_reflection', name: '신앙과 묵상', quota: 30,
    terms: ['pray', 'prayer', 'bible', 'book', 'church', 'cross', 'heart', 'peace', 'dove', 'angel', 'blessing', 'worship', 'candle', 'light', 'star', 'sparkles', 'hands', 'meditation', 'gratitude', 'love', '기도', '성경', '교회', '십자가', '평화', '감사', '묵상', '천사', '촛불'],
    preferred: ['objects', 'symbols', 'smileys_people'],
    pinned: ['1f64f', '1f4d6', '26ea', '271d-fe0f', '1f54a-fe0f', '1f56f-fe0f', '1f4dd', '1f90d', '1f49b', '1f496'],
  },
  {
    id: 'work_study', name: '업무와 배움', quota: 45,
    terms: ['work', 'office', 'briefcase', 'computer', 'laptop', 'keyboard', 'calendar', 'memo', 'pencil', 'pen', 'book', 'study', 'school', 'student', 'teacher', 'write', 'writing', 'read', 'reading', 'chart', 'target', 'idea', 'light bulb', 'folder', 'file', 'email', 'phone', 'meeting', 'presentation', 'science', 'calculator', 'magnifying', '공부', '업무', '회사', '책', '독서', '필기', '달력', '목표', '컴퓨터'],
    preferred: ['objects', 'symbols', 'activities'],
    pinned: ['1f4bc', '1f4bb', '1f4da', '1f4d3', '270f-fe0f', '1f4dd', '1f4c5', '1f3af', '1f4a1', '1f4ca'],
  },
  {
    id: 'health_exercise', name: '건강과 운동', quota: 55,
    terms: ['run', 'running', 'walk', 'walking', 'exercise', 'fitness', 'gym', 'sport', 'yoga', 'meditation', 'swim', 'swimming', 'bike', 'cycling', 'hiking', 'climb', 'stretch', 'strength', 'weight', 'ball', 'tennis', 'golf', 'soccer', 'basketball', 'baseball', 'sleep', 'bed', 'health', 'medical', 'medicine', 'doctor', 'hospital', 'heart', 'tooth', 'shower', 'bath', '운동', '건강', '걷기', '달리기', '수영', '자전거', '등산', '잠', '수면'],
    preferred: ['activities', 'smileys_people', 'objects'],
    pinned: ['1f3c3', '1f6b6', '1f9d8', '1f3cb-fe0f', '1f6b4', '1f3ca', '1f97e', '1f4aa', '1f634', '1f6cc'],
  },
  {
    id: 'daily_life', name: '생활과 돌봄', quota: 45,
    terms: ['home', 'house', 'clean', 'cleaning', 'broom', 'laundry', 'wash', 'shower', 'bath', 'toothbrush', 'cook', 'cooking', 'shopping', 'bag', 'money', 'family', 'baby', 'child', 'pet', 'dog', 'cat', 'plant', 'flower', 'trash', 'repair', 'tool', 'clothes', 'shirt', 'shoe', 'routine', 'check', 'check mark', 'alarm', '일상', '생활', '집', '청소', '빨래', '쇼핑', '가족', '반려', '양치'],
    preferred: ['objects', 'smileys_people', 'animals_nature'],
    pinned: ['1f3e0', '1f9f9', '1f9fa', '1f6bf', '1faa5', '1f6d2', '1f415', '1f408', '2705', '23f0'],
  },
  {
    id: 'food_drink', name: '식사와 수분', quota: 35,
    terms: ['water', 'drink', 'tea', 'coffee', 'milk', 'juice', 'breakfast', 'lunch', 'dinner', 'meal', 'food', 'fruit', 'vegetable', 'salad', 'rice', 'bread', 'egg', 'cook', 'healthy', 'apple', 'banana', 'carrot', 'bowl', 'cup', 'fork', 'spoon', '물', '음료', '차', '커피', '식사', '과일', '채소', '샐러드', '밥'],
    preferred: ['food_drink'],
    pinned: ['1f4a7', '1f95b', '2615', '1fad6', '1f34e', '1f34c', '1f957', '1f35a', '1f35e', '1f95a'],
  },
  {
    id: 'nature_growth', name: '자연과 성장', quota: 30,
    terms: ['seedling', 'plant', 'tree', 'leaf', 'flower', 'blossom', 'sun', 'moon', 'star', 'cloud', 'rain', 'rainbow', 'mountain', 'forest', 'nature', 'earth', 'fire', 'water', 'growth', 'garden', '새싹', '식물', '나무', '잎', '꽃', '해', '달', '별', '구름', '무지개', '산'],
    preferred: ['animals_nature', 'travel_places'],
    pinned: ['1f331', '1f333', '1f33f', '1f343', '1f33b', '2600-fe0f', '1f319', '2b50', '1f308', '26f0-fe0f'],
  },
  {
    id: 'emotion_reward', name: '감정과 격려', quota: 35,
    terms: ['smile', 'happy', 'joy', 'laugh', 'love', 'heart', 'thanks', 'gratitude', 'celebrate', 'celebration', 'party', 'clap', 'thumbs up', 'cheer', 'strong', 'win', 'winner', 'medal', 'trophy', 'gift', 'sparkles', 'fire', 'sad', 'tired', 'calm', 'relief', 'thinking', 'hug', '응원', '축하', '기쁨', '웃음', '사랑', '감사', '메달', '트로피'],
    preferred: ['smileys_people', 'activities', 'symbols'],
    pinned: ['1f60a', '1f604', '1f970', '1f44d', '1f44f', '1f389', '1f3c6', '1f3c5', '1f381', '2728'],
  },
  {
    id: 'time_places', name: '시간과 이동', quota: 25,
    terms: ['clock', 'time', 'alarm', 'morning', 'night', 'sunrise', 'sunset', 'map', 'location', 'place', 'travel', 'car', 'bus', 'train', 'subway', 'bicycle', 'walk', 'office', 'school', 'church', 'hospital', 'park', 'camp', '시간', '시계', '아침', '밤', '지도', '장소', '자동차', '버스', '기차'],
    preferred: ['travel_places', 'objects'],
    pinned: ['23f0', '231a', '1f305', '1f307', '1f5fa-fe0f', '1f4cd', '1f697', '1f68c', '1f686', '1f6b2'],
  },
];

const used = new Set();
const usedNames = new Set();
const selected = [];

const undesirable = [
  'flag', 'country', 'zodiac', 'blood type', 'keycap', 'button', 'currency exchange',
  'passport control', 'customs', 'baggage claim', 'prohibited', 'no one under',
];

function qualityPenalty(item) {
  const text = normalize(item.keywordsEn);
  let penalty = 0;
  if (undesirable.some((term) => text.includes(term))) penalty += 200;
  if (item.unicode.includes('1f3fb') || item.unicode.includes('1f3fc') || item.unicode.includes('1f3fd') || item.unicode.includes('1f3fe') || item.unicode.includes('1f3ff')) penalty += 200;
  // 성별·가족·직업 ZWJ 변형이 목록을 잠식하지 않도록 강하게 감점한다.
  if (item.unicode.includes('200d')) penalty += 90;
  // 1시~12시 및 30분 단위 시계 24종은 자체 아이콘 하나로 충분하다.
  if (/^1f55[0-9a-f]$/.test(item.unicode)) penalty += 200;
  if (item.unicode.split('-').length > 5) penalty += 30;
  return penalty;
}

function score(item, group) {
  const text = normalize([...item.keywordsKo, ...item.keywordsEn]);
  let termScore = 0;
  group.terms.forEach((term, index) => {
    if (text.includes(term.toLowerCase())) termScore += Math.max(4, 28 - Math.floor(index / 3));
  });
  // 카테고리가 맞는다는 이유만으로 DVD·기호 같은 무관 항목이 들어오지 않게 한다.
  if (termScore === 0) return -1000;
  let value = termScore;
  const preferredIndex = group.preferred.indexOf(item.sourceCategory);
  if (preferredIndex >= 0) value += 20 - preferredIndex * 5;
  value -= qualityPenalty(item);
  return value;
}

for (const group of groups) {
  const groupItems = [];
  for (const unicode of group.pinned) {
    const item = all.find((candidate) => candidate.unicode === unicode);
    if (item && !used.has(item.unicode) && !usedNames.has(item.nameKo)) groupItems.push(item);
  }

  const ranked = all
    .filter((item) => !used.has(item.unicode) && !usedNames.has(item.nameKo)
      && !groupItems.some((chosen) => chosen.unicode === item.unicode || chosen.nameKo === item.nameKo))
    .map((item) => ({ item, value: score(item, group) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value || a.item.sourceOrder - b.item.sourceOrder);

  for (const { item } of ranked) {
    if (groupItems.length >= group.quota) break;
    groupItems.push(item);
  }

  if (groupItems.length !== group.quota) {
    throw new Error(`${group.name}: wanted ${group.quota}, got ${groupItems.length}`);
  }

  groupItems.forEach((item, index) => {
    used.add(item.unicode);
    usedNames.add(item.nameKo);
    selected.push({ ...item, groupId: group.id, groupName: group.name, groupOrder: index + 1 });
  });
}

if (selected.length !== 300) throw new Error(`Expected 300 icons, got ${selected.length}`);

mkdirSync('docs/emoji-inventory', { recursive: true });

const csvRows = [
  ['group', 'group_ko', 'order', 'emoji', 'unicode', 'name_ko', 'keywords_ko', 'source_category'],
  ...selected.map((item) => [
    item.groupId, item.groupName, item.groupOrder, item.emoji, item.unicode.toUpperCase(),
    item.nameKo, item.keywordsKo.join(', '), item.sourceCategory,
  ]),
];
writeFileSync(
  'docs/emoji-inventory/onju-curated-300.csv',
  `\uFEFF${csvRows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`,
);
writeFileSync(
  'docs/emoji-inventory/onju-curated-300.json',
  `${JSON.stringify(selected.map((item, index) => ({
    index,
    group: item.groupId,
    groupName: item.groupName,
    emoji: item.emoji,
    unicode: item.unicode.toUpperCase(),
    name: item.nameKo,
    keywords: item.keywordsKo,
  })), null, 2)}\n`,
);

const sections = groups.map((group) => {
  const items = selected.filter((item) => item.groupId === group.id);
  return `<section id="${group.id}"><h2>${group.name} <small>${items.length}개</small></h2><div class="grid">${items.map((item) => `
    <article><span class="emoji">${item.emoji}</span><strong>${escapeHtml(item.nameKo)}</strong><code>${item.unicode.toUpperCase()}</code></article>`).join('')}</div></section>`;
}).join('');

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>온주 아이콘 후보 300</title><style>
body{margin:0;background:#f7f3e8;color:#34312b;font-family:system-ui,sans-serif}header{position:sticky;top:0;z-index:2;padding:18px 24px;background:#f7f3e8ee;backdrop-filter:blur(12px);border-bottom:1px solid #d8d0bd}h1{margin:0 0 8px;font-size:24px}nav{display:flex;gap:10px;overflow:auto}nav a{white-space:nowrap;color:#3f7454}main{padding:10px 24px 48px}h2{margin-top:36px}small{color:#817969;font-weight:400}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:8px}article{min-height:112px;padding:12px;background:#fffdf6;border:1px solid #ded7c6;border-radius:14px;display:flex;flex-direction:column;align-items:center;text-align:center}.emoji{font-size:36px}strong{font-size:12px;margin-top:8px;line-height:1.3}code{font-size:9px;color:#8e8574;margin-top:auto}</style></head><body><header><h1>온주 아이콘 제작 후보 · 300개</h1><nav>${groups.map((group) => `<a href="#${group.id}">${group.name}</a>`).join('')}</nav></header><main>${sections}</main></body></html>`;
writeFileSync('docs/emoji-inventory/onju-curated-300.html', html);

const summary = groups.map((group) => `- ${group.name}: ${group.quota}개`).join('\n');
writeFileSync('docs/emoji-inventory/CURATED_300.md', `# 온주 자체 아이콘 제작 후보 300\n\n${summary}\n\n선정 원칙:\n- 루틴·습관·신앙·직장생활에서 실제 사용 가능성이 높은 항목 우선\n- 국기, 국가 기호, 과도한 성별·피부색 변형 제외\n- 현재 저장값과 호환되도록 각 아이콘의 유니코드를 유지\n\n- \`onju-curated-300.html\`: 시각 검토용\n- \`onju-curated-300.csv\`: 제작 관리용\n- 다시 생성: \`node scripts/curate-onju-icons.mjs\`\n`);

console.log(groups.map((group) => `${group.name}: ${group.quota}`).join('\n'));
console.log(`Total: ${selected.length}`);
