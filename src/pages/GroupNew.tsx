import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createGroup } from '../api/groups';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { format, addDays } from 'date-fns';

export default function GroupNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    goal: '',
    maxMembers: 6,
    durationDays: 28,
    isPublic: true,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createGroup({
        title: form.title,
        goal: form.goal,
        maxMembers: form.maxMembers,
        startDate: new Date().toISOString(),
        endDate: addDays(new Date(), form.durationDays).toISOString(),
        isPublic: form.isPublic,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      navigate('/groups');
    },
  });

  const isValid = form.title.trim() && form.goal.trim();

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 p-1">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-base font-bold text-gray-900">소모임 만들기</h1>
      </div>

      <Card className="mx-4">
        <div className="flex flex-col gap-4">
          <Field label="소모임 이름">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="예: 새벽 5시 기상 챌린지"
              className="input-base"
            />
          </Field>

          <Field label="소모임 목표">
            <textarea
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              placeholder="어떤 목표를 향해 함께 나아갈지 작성해 주세요"
              rows={3}
              className="input-base resize-none"
            />
          </Field>

          <Field label={`최대 인원: ${form.maxMembers}명`}>
            <input
              type="range"
              min={2}
              max={10}
              value={form.maxMembers}
              onChange={e => setForm(f => ({ ...f, maxMembers: Number(e.target.value) }))}
              className="w-full accent-indigo-600"
            />
          </Field>

          <Field label={`기간: ${form.durationDays}일 (${format(addDays(new Date(), form.durationDays), 'M월 d일')} 종료)`}>
            <input
              type="range"
              min={7}
              max={90}
              step={7}
              value={form.durationDays}
              onChange={e => setForm(f => ({ ...f, durationDays: Number(e.target.value) }))}
              className="w-full accent-indigo-600"
            />
          </Field>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-gray-800">공개 소모임</p>
              <p className="text-xs text-gray-400">누구든 검색해서 참여할 수 있어요</p>
            </div>
            <button
              onClick={() => setForm(f => ({ ...f, isPublic: !f.isPublic }))}
              className={`w-11 h-6 rounded-full transition-colors ${form.isPublic ? 'bg-indigo-500' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isPublic ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <Button
            fullWidth
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '생성 중...' : '소모임 만들기'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
