import type { FaithRoutineTemplate } from '../../types';

export const faithRoutineTemplates: FaithRoutineTemplate[] = [
  {
    id: 'ft-1',
    title: '기도',
    description: '오늘 하루를 하나님께 맡기는 아침 기도',
    isDefault: true,
    category: 'prayer',
    icon: 'Sparkles',
  },
  {
    id: 'ft-2',
    title: '말씀',
    description: '오늘의 말씀 읽기 및 묵상',
    isDefault: true,
    category: 'bible',
    icon: 'BookOpen',
  },
  {
    id: 'ft-3',
    title: '감사 일기',
    description: '오늘 하루 감사한 것 3가지 기록',
    isDefault: false,
    category: 'reflection',
    icon: 'Heart',
  },
  {
    id: 'ft-4',
    title: '정체성 점검',
    description: '"오늘 그리스도인으로서 어떤 선택을 했는가?"',
    isDefault: false,
    category: 'reflection',
    icon: 'CheckCircle',
  },
  {
    id: 'ft-5',
    title: '중보기도 메모',
    description: '오늘의 기도 제목을 짧게 기록',
    isDefault: false,
    category: 'prayer',
    icon: 'Users',
  },
  {
    id: 'ft-6',
    title: '저녁 되돌아보기',
    description: '하루를 마치며 선한 영향력 실천 여부 체크',
    isDefault: false,
    category: 'reflection',
    icon: 'Moon',
  },
];
