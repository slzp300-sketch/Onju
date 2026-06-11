import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import { GROUP_CATEGORIES, COVER_ICONS, COVER_ICON_KEYS, GROUP_COLORS, GROUP_RULES } from '../utils/groupMeta';
import type { SmallGroup, GroupCategory } from '../types';
import { newId } from '../utils/id';

interface FormState {
  coverIcon: string;
  color: string;
  title: string;
  goal: string;
  category: GroupCategory;
  maxMembers: number;
  durationDays: number;
  rules: string[];
  isPublic: boolean;
}

export default function GroupNew() {
  const navigate = useNavigate();
  const { addGroup } = useGroupStore();
  const { user } = useAuthStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormState>({
    coverIcon: COVER_ICON_KEYS[0],
    color: GROUP_COLORS[0],
    title: '',
    goal: '',
    category: 'faith',
    maxMembers: 6,
    durationDays: 28,
    rules: [GROUP_RULES[0], GROUP_RULES[1]],
    isPublic: true,
  });

  const patch = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }));
  const step1Valid = form.title.trim() && form.goal.trim();

  const toggleRule = (rule: string) =>
    patch({ rules: form.rules.includes(rule) ? form.rules.filter(r => r !== rule) : [...form.rules, rule] });

  const handleCreate = () => {
    if (!step1Valid) return;
    const now = new Date();
    const group: SmallGroup = {
      id: newId(),
      creatorId: user?.id ?? '',
      title: form.title.trim(),
      goal: form.goal.trim(),
      startDate: now.toISOString(),
      endDate: addDays(now, form.durationDays).toISOString(),
      maxMembers: form.maxMembers,
      currentMemberCount: 1,
      status: 'recruiting',
      isPublic: form.isPublic,
      createdAt: now.toISOString(),
      category: form.category,
      coverIcon: form.coverIcon,
      color: form.color,
      rules: form.rules,
    };
    addGroup(group);
    navigate(`/groups/${group.id}`, { replace: true });
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3 bg-surface border-b border-line-soft">
        <div className="flex items-center">
          <motion.button whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
            onClick={() => (step === 1 ? navigate(-1) : setStep(1))} className="p-1 -ml-1 text-label-alt">
            <ChevronLeft size={24} />
          </motion.button>
          <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">소모임 만들기</h1>
          <span className="w-8 text-caption1 font-bold text-label-assistive text-right">{step}/2</span>
        </div>
        {/* 진행 바 */}
        <div className="flex gap-1.5 mt-3">
          {[1, 2].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-fill-strong">
              <motion.div className="h-full bg-primary rounded-full"
                initial={false} animate={{ width: step >= s ? '100%' : '0%' }} transition={{ duration: 0.3 }} />
            </div>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-32">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-6">
              {/* 커버 */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center border border-line"
                  style={{ backgroundColor: `${form.color}1a` }}>
                  {(() => { const Icon = COVER_ICONS[form.coverIcon]; return <Icon size={34} strokeWidth={1.8} style={{ color: form.color }} />; })()}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {COVER_ICON_KEYS.map(key => {
                    const Icon = COVER_ICONS[key];
                    const active = form.coverIcon === key;
                    return (
                      <motion.button key={key} whileTap={{ scale: 0.85 }} onClick={() => patch({ coverIcon: key })}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                          active ? 'bg-primary-soft ring-2 ring-primary text-primary' : 'bg-surface border border-line text-label-alt'
                        }`}>
                        <Icon size={18} strokeWidth={1.9} />
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex gap-2.5">
                  {GROUP_COLORS.map(c => (
                    <motion.button key={c} whileTap={{ scale: 0.85 }} onClick={() => patch({ color: c })}
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: c }}>
                      {form.color === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </motion.button>
                  ))}
                </div>
              </div>

              <Field label="소모임 이름">
                <input value={form.title} onChange={e => patch({ title: e.target.value })}
                  placeholder="예: 새벽 5시 기상 챌린지" className="input-base" />
              </Field>

              <Field label="소모임 목표">
                <textarea value={form.goal} onChange={e => patch({ goal: e.target.value })}
                  placeholder="어떤 목표를 향해 함께 나아갈지 작성해 주세요" rows={3}
                  className="input-base resize-none py-3" style={{ height: 'auto' }} />
              </Field>

              <Field label="카테고리">
                <div className="flex flex-wrap gap-2">
                  {GROUP_CATEGORIES.map(c => (
                    <motion.button key={c.key} whileTap={{ scale: 0.96 }} onClick={() => patch({ category: c.key })}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-label1 font-semibold transition-colors ${
                        form.category === c.key ? 'bg-primary text-white' : 'bg-surface border border-line text-label-alt'
                      }`}>
                      <c.Icon size={15} strokeWidth={1.9} /> {c.label}
                    </motion.button>
                  ))}
                </div>
              </Field>
            </motion.div>
          ) : (
            <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-6">
              <Field label={`최대 인원: ${form.maxMembers}명`}>
                <input type="range" min={2} max={10} value={form.maxMembers}
                  onChange={e => patch({ maxMembers: Number(e.target.value) })} className="w-full accent-primary" />
              </Field>

              <Field label={`기간: ${form.durationDays}일 · ${format(addDays(new Date(), form.durationDays), 'M월 d일')} 종료`}>
                <input type="range" min={7} max={90} step={7} value={form.durationDays}
                  onChange={e => patch({ durationDays: Number(e.target.value) })} className="w-full accent-primary" />
              </Field>

              <Field label="우리의 약속">
                <div className="flex flex-col gap-2">
                  {GROUP_RULES.map(rule => {
                    const on = form.rules.includes(rule);
                    return (
                      <motion.button key={rule} whileTap={{ scale: 0.99 }} onClick={() => toggleRule(rule)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                          on ? 'bg-primary-soft border border-primary/30' : 'bg-surface border border-line'
                        }`}>
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                          on ? 'bg-primary' : 'bg-fill-strong'
                        }`}>
                          {on && <Check size={13} className="text-white" strokeWidth={3} />}
                        </span>
                        <span className={`text-body2 font-medium ${on ? 'text-label-strong' : 'text-label-alt'}`}>{rule}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </Field>

              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-body2 font-medium text-label-strong">공개 소모임</p>
                  <p className="text-caption1 text-label-alt">누구든 검색해서 참여할 수 있어요</p>
                </div>
                <button onClick={() => patch({ isPublic: !form.isPublic })}
                  className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${form.isPublic ? 'bg-primary' : 'bg-fill-strong'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${form.isPublic ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 푸터 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {step === 1 ? (
          <Button fullWidth className="mt-3" disabled={!step1Valid} onClick={() => setStep(2)}>다음</Button>
        ) : (
          <div className="flex gap-2 mt-3">
            <Button variant="assistive" className="flex-1" onClick={() => setStep(1)}>이전</Button>
            <Button className="flex-[2]" onClick={handleCreate}>소모임 만들기</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-caption1 font-bold text-label-alt mb-2 block">{label}</label>
      {children}
    </div>
  );
}
