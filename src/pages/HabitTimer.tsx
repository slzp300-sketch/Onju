import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useHabitStore } from '../store/habitStore';
import HabitFocusMode from '../components/routines/HabitFocusMode';
import TwoMinuteMode from '../components/routines/TwoMinuteMode';

/**
 * 위젯 딥링크용 습관 타이머 호스트 페이지.
 * /habit-timer/:id?mode=focus|twomin — 집중 타이머 또는 2분 트리거 모드를 전체화면으로 띄운다.
 */
export default function HabitTimer() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));

  if (!habit) {
    navigate('/', { replace: true });
    return null;
  }

  const close = () => navigate('/', { replace: true });
  return params.get('mode') === 'twomin'
    ? <TwoMinuteMode habit={habit} onClose={close} />
    : <HabitFocusMode habit={habit} onClose={close} />;
}
