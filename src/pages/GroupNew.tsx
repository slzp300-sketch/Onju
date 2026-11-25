import FormBoundary from '../components/FormBoundary';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { useFormProtection } from '../hooks/useFormProtection';
import { writeDraft } from '../lib/localDrafts';
import { groupToRow } from '../data/mappers';
import { isGroupDraft, type GroupForm } from '../utils/groupDraft';
import { toast } from '../store/toastStore';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Check } from '../icons';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { GROUP_CATEGORIES, COVER_ICONS, COVER_ICON_KEYS, GROUP_COLORS, GROUP_RULES } from '../utils/groupMeta';
import type { SmallGroup } from '../types';
import { newId } from '../utils/id';

export default function GroupNew() {
  return <FormBoundary exists><GroupNewEditor /></FormBoundary>;
}
function GroupNewEditor() {
  const navigate = useNavigate();
  const { createGroup, creationStatus } = useGroupStore();
  const { user } = useAuthStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<GroupForm>({
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

  const [entityId, setEntityId] = useState<string>(newId);
  const [attemptedAt, setAttemptedAt] = useState<string>();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const values = { entityId, step, form, attemptedAt };
  const draft = useLocalDraft({ document: 'group:new', values, validate: isGroupDraft, canDiscard: v => !v.attemptedAt,
    restore: v => { setEntityId(v.entityId); setStep(v.step); setForm(v.form); setAttemptedAt(v.attemptedAt); } });
  const protection = useFormProtection(values, draft.leaveMessage);
  const status = creationStatus[entityId];
  const busy = status?.phase === 'pending';
  const locked = draft.awaitingChoice || !!attemptedAt || busy;
  const leave = () => navigate('/groups');
  const patch = (p: Partial<GroupForm>) => setForm(f => ({ ...f, ...p }));
  const step1Valid = form.title.trim() && form.goal.trim();

  const toggleRule = (rule: string) =>
    patch({ rules: form.rules.includes(rule) ? form.rules.filter(r => r !== rule) : [...form.rules, rule] });

  const handleCreate = async () => {
    if (!step1Valid || draft.awaitingChoice || busy || !user) return;
    if (!navigator.onLine) { toast.error('인터넷에 연결한 뒤 소모임을 만들어주세요. 초안은 이 기기에 남아요.'); return; }
    const owner = user.id;
    const requestTime = attemptedAt ?? new Date().toISOString();
    try { writeDraft(owner, 'group:new', { ...values, attemptedAt: requestTime }); }
    catch { toast.error('생성 요청을 기기에 보관하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해주세요.'); return; }
    setAttemptedAt(requestTime);
    const now = new Date(requestTime);
    const group: SmallGroup = {
      id: entityId,
      creatorId: user?.id ?? '',
      title: form.title.trim(),
      goal: form.goal.trim(),
      startDate: format(now, 'yyyy-MM-dd'),
      endDate: format(addDays(now, form.durationDays), 'yyyy-MM-dd'),
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
    if (await createGroup(group.id, groupToRow(group)) && mounted.current && useAuthStore.getState().user?.id === owner) {
      if (protection.save(() => draft.clear())) navigate(`/groups/${group.id}`, { replace: true });
    }
  };

  return (
    <div className="form-paper min-h-dvh flex flex-col">
      {protection.guard}
      {/* 헤더 */}
      <div className="form-paper-header px-4 pt-5 pb-3">
        <div className="flex items-center">
          <motion.button whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
            onClick={() => (step === 1 || attemptedAt ? protection.requestLeave(leave) : setStep(1))} aria-label={attemptedAt ? '소모임 목록으로 돌아가기' : step === 1 ? '뒤로 가기' : '이전 단계'} className="paper-back-button text-label-alt">
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

      <div className="px-4 pt-3">{draft.banner}
        {!draft.awaitingChoice && attemptedAt && <div className="rounded-xl border border-line p-3 mb-3 text-caption1 text-label-alt" aria-live="polite">
          <p className="font-bold text-label-strong mb-2">{form.title}</p>
          <p>{status?.message ?? '전송한 생성 요청이 있어요. 같은 요청으로 결과를 확인하고 누락된 등록을 복구할 수 있어요.'}</p>
          {status?.canEdit && <button className="min-h-11 text-primary font-bold" onClick={() => setAttemptedAt(undefined)}>입력 내용 다시 확인</button>}
        </div>}
      </div>
      <fieldset disabled={locked} className="contents">
      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 py-5 pb-32">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-6">
              <Field label="소모임 이름">
                <input aria-label="소모임 이름" value={form.title} onChange={e => patch({ title: e.target.value })}
                  placeholder="예: 새벽 5시 기상 챌린지" className="input-base" />
              </Field>

              <Field label="소모임 목표">
                <textarea aria-label="소모임 목표" value={form.goal} onChange={e => patch({ goal: e.target.value })}
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
              <details className="quiet-details"><summary>커버 아이콘·색상</summary>
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
                        aria-label={`커버 아이콘 ${key} 선택`} aria-pressed={active}
                        className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center transition-colors ${
                          active ? 'bg-primary-soft ring-2 ring-primary text-primary' : 'bg-surface border border-line text-label-alt'
                        }`}>
                        <Icon size={18} strokeWidth={1.9} />
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {GROUP_COLORS.map(c => (
                    <motion.button key={c} whileTap={{ scale: 0.85 }} onClick={() => patch({ color: c })}
                      aria-label={`소모임 색상 ${c} 선택`} aria-pressed={form.color === c}
                      className="min-w-11 min-h-11 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: c }}>
                      {form.color === c && <Check size={14} className="text-white" strokeWidth={3} />}
                    </motion.button>
                  ))}
                </div>
              </div>

              </details>
            </motion.div>
          ) : (
            <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }} className="flex flex-col gap-6">
              <Field label={`최대 인원: ${form.maxMembers}명`}>
                <input aria-label="최대 인원" type="range" min={2} max={10} value={form.maxMembers}
                  onChange={e => patch({ maxMembers: Number(e.target.value) })} className="w-full accent-primary" />
              </Field>

              <Field label={`기간: ${form.durationDays}일 · ${format(addDays(new Date(), form.durationDays), 'M월 d일')} 종료`}>
                <input aria-label="소모임 기간" type="range" min={7} max={90} step={7} value={form.durationDays}
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
                  <p className="text-caption1 text-label-alt">{form.isPublic ? '누구든 검색해서 참여할 수 있어요' : '탐색에 표시되지 않아요. 만든 뒤 방장이 1인용 초대 코드를 전달해요.'}</p>
                </div>
                <Switch checked={form.isPublic} onCheckedChange={isPublic => patch({ isPublic })}
                  label="공개 소모임" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      </fieldset>
      {/* 푸터 */}
      <div className="form-paper-footer fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4"
        style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
        {step === 1 ? (
          <Button fullWidth className="mt-3" disabled={!step1Valid || draft.awaitingChoice || busy} onClick={() => setStep(2)}>다음</Button>
        ) : (
          <div className="flex gap-2 mt-3">
            <Button variant="assistive" className="flex-1" disabled={locked} onClick={() => setStep(1)}>이전</Button>
            <Button className="flex-[2]" disabled={draft.awaitingChoice || busy} onClick={() => void handleCreate()}>{busy ? '생성 확인 중…' : attemptedAt ? '같은 요청 확인·복구' : '소모임 만들기'}</Button>
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
