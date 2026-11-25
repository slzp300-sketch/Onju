import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormBoundary from '../components/FormBoundary';
import Button from '../components/ui/Button';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { useFormProtection } from '../hooks/useFormProtection';
import { writeDraft } from '../lib/localDrafts';
import { isInviteCode, previewGroupInvite, type InvitePreview } from '../data/groupInvites';
import { useAuthStore } from '../store/authStore';
import { useGroupStore } from '../store/groupStore';
import { isUuid } from '../utils/id';

interface JoinDraft { code: string; groupId: string; attempted: boolean }
const isDraft = (v: unknown): v is JoinDraft => !!v && typeof v === 'object' &&
  typeof (v as JoinDraft).code === 'string' && typeof (v as JoinDraft).groupId === 'string' && typeof (v as JoinDraft).attempted === 'boolean' &&
  (!(v as JoinDraft).attempted || (isUuid((v as JoinDraft).groupId) && isInviteCode((v as JoinDraft).code)));
const messages: Record<InvitePreview['state'], string> = {
  available: '아래 모임과 약속을 확인하고 참여해주세요.', joined: '이미 참여 중인 소모임이에요.',
  full: '정원이 가득 찼어요. 방장에게 확인해주세요.', closed: '모집이 끝났거나 종료된 소모임이에요.',
  invalid: '초대 코드를 확인할 수 없어요. 입력 내용을 확인하거나 방장에게 새 코드를 받아주세요.',
  expired: '초대 기간이 지났어요. 방장에게 새 코드를 받아주세요.', revoked: '폐기된 초대 코드예요. 방장에게 새 코드를 받아주세요.',
  used: '이미 사용된 초대 코드예요. 방장에게 나만의 새 코드를 받아주세요.',
};
export default function GroupInviteJoin() { return <FormBoundary exists><JoinEditor /></FormBoundary>; }
function JoinEditor() {
  const owner = useAuthStore(s => s.user?.id)!;
  const navigate = useNavigate();
  const [values, setValues] = useState<JoinDraft>({ code: '', groupId: '', attempted: false });
  const [preview, setPreview] = useState<InvitePreview>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const working = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && useAuthStore.getState().user?.id === owner;
  const draft = useLocalDraft({ document: 'group:invite-join', values, validate: isDraft, restore: setValues, canDiscard: v => !v.attempted });
  const protection = useFormProtection(values, draft.leaveMessage);
  const enter = (id: string) => { if (protection.save(() => draft.clear())) navigate(`/groups/${id}`, { replace: true }); };
  const act = async (action: 'preview' | 'join' | 'refresh') => {
    if (working.current || draft.awaitingChoice) return;
    if (!navigator.onLine) { setMessage('인터넷에 연결한 뒤 다시 확인해주세요. 입력한 코드는 이 기기에 남아요.'); return; }
    working.current = true; setBusy(true); setMessage('');
    try {
      if (action === 'preview') {
        const result = await previewGroupInvite(owner, values.code);
        if (current()) { setPreview(result); setValues(v => ({ ...v, groupId: result.groupId ?? '' })); }
      } else {
        const id = values.groupId;
        if (!id) return;
        if (action === 'join') {
          if (preview?.state !== 'available' || values.attempted) return;
          const next = { ...values, attempted: true };
          writeDraft(owner, 'group:invite-join', next); setValues(next);
        }
        const store = useGroupStore.getState();
        const success = action === 'join' ? await store.changeMembership(id, true, undefined, values.code) : await store.refreshMembership(id);
        if (!current()) return;
        const confirmed = useGroupStore.getState();
        if (success && confirmed.myGroupIds.includes(id)) { enter(id); return; }
        const uncertain = confirmed.membershipStatus[id]?.phase === 'unknown' || confirmed.membershipStatus[id]?.phase === 'pending';
        if (!uncertain) {
          setValues(v => ({ ...v, attempted: false }));
          const result = await previewGroupInvite(owner, values.code);
          if (current()) setPreview(result);
        }
        if (current()) setMessage(confirmed.membershipStatus[id]?.message ?? '아직 참여하지 않았어요. 초대 상태를 확인한 뒤 다시 참여해주세요.');
      }
    } catch {
      if (current()) setMessage('처리 결과를 확인하지 못했어요. 연결 상태와 기기 저장 공간을 확인한 뒤 다시 시도해주세요.');
    } finally { working.current = false; if (current()) setBusy(false); }
  };
  return <div className="form-paper min-h-dvh p-4 pb-10">
    {protection.guard}
    <Button variant="ghost" onClick={() => protection.requestLeave(() => navigate('/groups'))}>소모임 목록으로</Button>
    <h1 className="my-4 text-heading2 font-bold">초대로 소모임 참여하기</h1>
    <p className="mb-4 text-body2 text-label-alt">방장에게 받은 코드를 붙여넣어주세요. 코드는 한 명만 사용할 수 있으며, 가입 전에는 멤버와 기록이 공개되지 않아요.</p>
    {draft.banner}
    <label className="block text-body2 font-bold">초대 코드
      <input aria-label="초대 코드" className="input-base mt-2 w-full font-mono" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80}
        value={values.code} disabled={busy || draft.awaitingChoice || values.attempted}
        onChange={e => { setValues({code:e.target.value,groupId:'',attempted:false}); setPreview(undefined); setMessage(''); }} />
    </label>
    {message && <p role="alert" className="mt-3 text-body2 text-label-alt">{message}</p>}
    {values.attempted ? <div className="mt-4 rounded-xl bg-surface p-4">
      <p className="mb-3 text-body2">전송한 참여 요청이 있어요. 자동 재전송하지 않으며 현재 참여 상태를 먼저 확인해요.</p>
      <Button fullWidth disabled={busy || draft.awaitingChoice} onClick={() => void act('refresh')}>{busy ? '확인 중…' : '현재 참여 상태 확인'}</Button>
    </div> : <Button fullWidth className="mt-4" disabled={busy || draft.awaitingChoice || !isInviteCode(values.code)} onClick={() => void act('preview')}>{busy ? '확인 중…' : '초대 확인'}</Button>}
    {preview && !draft.awaitingChoice && <section className="mt-4 rounded-2xl border border-line bg-surface p-4" aria-label="초대받은 소모임">
      {preview.title && <><h2 className="text-headline1 font-bold">{preview.title}</h2><p className="my-2 text-body2">{preview.goal}</p>
        <p className="text-caption1 text-label-alt">{preview.memberCount}/{preview.maxMembers}명 · {preview.endDate}까지</p>
        {!!preview.rules?.length && <ul className="my-3 list-disc pl-5 text-body2">{preview.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>}</>}
      <p className="my-3 text-body2" role="status">{messages[preview.state]}</p>
      {preview.state === 'available' && <Button fullWidth disabled={busy || values.attempted} onClick={() => void act('join')}>약속 확인하고 참여하기</Button>}
      {preview.state === 'joined' && !values.attempted && <Button fullWidth disabled={busy} onClick={() => void act('refresh')}>현재 참여 상태 확인</Button>}
    </section>}
  </div>;
}
