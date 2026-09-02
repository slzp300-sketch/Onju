import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  project: ['src/**/*.{ts,tsx}'],
  // 스펙 기능 후보로 의도적 보존 (CLAUDE.md 참고) — 도달 코드가 되면 여기서 제거할 것
  ignore: [
    'src/components/groups/MemberProgressCard.tsx',
    'src/components/ui/HeatMap.tsx',
    'src/components/ui/MonthlyCalendar.tsx',
    'src/utils/routineRecommendation.ts',
  ],
  // autoprefixer: 빌드 체인 외부 참조 / @capacitor/assets: npx capacitor-assets로 수동 실행
  ignoreDependencies: ['autoprefixer', '@capacitor/assets'],
  // @preserved 태그가 붙은 export는 보존 파일 전용이므로 미사용 보고에서 제외
  tags: ['-preserved'],
};

export default config;
