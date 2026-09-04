import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  Clock3,
  MessageCircle,
  Send,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PlanItem, Profile } from "./model";
import { koreaTodayLabel, koreaWeekKey, ONJU_TIME_ZONE } from "./koreaTime";
import type { AiDayBounds } from "./aiSchedule";
import {
  getAgentSessionId,
  loadAgentState,
  saveAgentState,
} from "./agentMemory";
import { canGenerateGoalPlan, emptyGoalCard, type GoalCard } from "./goalAgent";
import { generateWeeklyPlan, type GeneratedPlanItem } from "./planAgent";
import AgentText from "./AgentText";
import { talkToOnju, type PendingGoalDraft } from "./unifiedAgent";
import { useChatScroll } from "./useChatScroll";

type Kind = "fixed" | "variable" | "recovery";
type Block = {
  id: string;
  days: number[];
  title: string;
  start: string;
  end: string;
  kind: Kind;
  pending?: boolean;
};
type ChatMessage = { id: string; role: "user" | "assistant"; text: string };
type Stage = { title: string; question: string; hint: string; kind: Kind };
const week = ["월", "화", "수", "목", "금", "토", "일"];
const stages: Stage[] = [
  {
    title: "생활 리듬",
    question: "보통 몇 시에 일어나고 몇 시에 잠드나요?",
    hint: "평일과 주말이 다르면 나누어 알려주세요. 아는 시간만 짧게 말해도 괜찮아요.\n\n예: “평일은 6시 기상, 23시 취침. 주말은 그때그때 달라.”",
    kind: "fixed",
  },
  {
    title: "기본 생활",
    question: "먼저 평일의 고정된 시간을 알려주세요.",
    hint: "기상·이동·근무 시간을 한 문장으로 말하면 지도에 바로 채우고, 남는 시간을 계산해 드릴게요.",
    kind: "fixed",
  },
  {
    title: "반복 일정",
    question: "퇴근 후나 주말에 매주 반복되는 일정이 있나요?",
    hint: "요일과 시간을 함께 말하면 지도에 바로 표시할게요.",
    kind: "fixed",
  },
  {
    title: "회복 시간",
    question: "일정이 비어 있어도 쉬거나 가족과 보내야 하는 시간이 있나요?",
    hint: "이 시간은 목표를 넣지 않고 보호할게요.",
    kind: "recovery",
  },
  {
    title: "이번 주 일정",
    question: "이번 주에만 있는 약속, 야근, 병원 일정이 있나요?",
    hint: `${koreaTodayLabel()} 한국시간을 기준으로 이해할게요.`,
    kind: "variable",
  },
  {
    title: "목표 협의",
    question: "이제 남은 시간에 어떤 변화를 만들어가고 싶나요?",
    hint: "온주가 시간 지도와 함께 현실적인 계획을 제안할게요.",
    kind: "fixed",
  },
];

export default function ScheduleSetup({
  onComplete,
}: {
  onComplete: (p: Profile, plan: PlanItem[]) => void;
}) {
  const nav = useNavigate(),
    sessionId = useRef(getAgentSessionId()),
    saveQueue = useRef<Promise<void>>(Promise.resolve()),
    [stage, setStage] = useState(0),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [blocks, setBlocks] = useState<Block[]>([]),
    [pending, setPending] = useState<Block[]>([]),
    [dayBounds, setDayBounds] = useState<AiDayBounds[]>([]),
    [goal, setGoal] = useState(""),
    [reason, setReason] = useState("내 생활에 무리 없이 변화를 만들고 싶어서"),
    [obstacle, setObstacle] = useState("갑자기 일정이 생길 때"),
    [responseId, setResponseId] = useState<string>(),
    [goalCard, setGoalCard] = useState<GoalCard>(emptyGoalCard),
    [goalDraft, setGoalDraft] = useState<PendingGoalDraft | null>(null),
    [goalResponseId, setGoalResponseId] = useState<string>(),
    [generatedPlan, setGeneratedPlan] = useState<GeneratedPlanItem[]>([]),
    [planResponseId, setPlanResponseId] = useState<string>(),
    [goalReady, setGoalReady] = useState(false),
    [loading, setLoading] = useState(false),
    [failedRequest, setFailedRequest] = useState<string>(),
    [failedConfirmation, setFailedConfirmation] = useState<{draftId:string;includeRelated?:boolean}>(),
    [needsClarification, setNeedsClarification] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">(
      "saved"
    );
  const [suggestions, setSuggestions] = useState<string[]>([]),
    current = stages[stage];
  const [mapOpen, setMapOpen] = useState(false);
  const { historyRef, contentRef, onScroll, scrollToLatest, showLatest } = useChatScroll(`${messages.at(-1)?.id ?? ''}:${loading}:${suggestions.join('|')}`, hydrated);
  useEffect(() => {
    let active = true;
    loadAgentState(sessionId.current)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          setStage(Math.min(5, Math.max(0, saved.stage)));
          setMessages(saved.messages);
          setBlocks(
            mergeBlocks(
              saved.blocks,
              saved.pendingBlocks.map((block) => ({ ...block, pending: false }))
            )
          );
          setPending([]);
          setDayBounds(saved.dayBounds);
          setGoal(saved.goal);
          setReason(saved.reason || "내 생활에 무리 없이 변화를 만들고 싶어서");
          setObstacle(saved.obstacle || "갑자기 일정이 생길 때");
          setResponseId(saved.responseId);
          setGoalCard(
            saved.goalCard && Object.keys(saved.goalCard).length
              ? saved.goalCard
              : emptyGoalCard
          );
          setGoalResponseId(saved.goalResponseId);
          setGoalDraft(saved.goalDraft ?? null);
          setSuggestions(saved.suggestions ?? []);
          setGeneratedPlan(saved.generatedPlan ?? []);
          setPlanResponseId(saved.planResponseId);
          setGoalReady(canGenerateGoalPlan(saved.goalCard));
          setNeedsClarification(false);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (active) {
          setSaveStatus("offline");
          setHydrated(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!hydrated || loading || failedRequest) return;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveAgentState(sessionId.current, {
        stage,
        messages,
        blocks,
        pendingBlocks: pending,
        dayBounds,
        goal,
        reason,
        obstacle,
        responseId,
        goalCard,
        goalResponseId,
        generatedPlan,
        planResponseId,
      }))
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("offline"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    loading,
    failedRequest,
    stage,
    messages,
    blocks,
    pending,
    dayBounds,
    goal,
    reason,
    obstacle,
    responseId,
    goalCard,
    goalResponseId,
    generatedPlan,
    planResponseId,
  ]);
  const send = async (text = input, confirmation?: { draftId: string; includeRelated?: boolean }) => {
    const message = text.trim();
    if (!message || loading) return;
    scrollToLatest();
    setMessages((previous) => [
      ...(failedRequest ? previous.slice(0, -2) : previous),
      { id: crypto.randomUUID(), role: "user", text: message },
    ]);
    setInput("");
    setSuggestions([]);
    setFailedRequest(undefined);
    setFailedConfirmation(undefined);
    setLoading(true);
    setNeedsClarification(false);
    try {
      await saveQueue.current;
      const result = await talkToOnju(sessionId.current, message, confirmation);
      setResponseId(result.response_id);
      setNeedsClarification(result.needs_clarification);
      setSuggestions(result.suggestions ?? []);
      setMessages((previous) => [
        ...previous,
        {
          id: result.assistant_message_id ?? crypto.randomUUID(),
          role: "assistant",
          text: result.assistant_message,
        },
      ]);
      setBlocks(result.state.blocks.map((block) => ({...block,id:crypto.randomUUID(),pending:false})));
      setDayBounds(result.state.dayBounds);
      setGoalCard(result.state.goalCard);
      setGoalDraft(result.state.goalDraft ?? null);
      setGoal(result.state.goalCard.outcome);
      setReason(result.state.goalCard.identity || reason);
      setObstacle(result.state.goalCard.recoveryRule || obstacle);
      setGoalReady(canGenerateGoalPlan(result.state.goalCard));
      setPending([]);
      if (result.state.stage !== stage) {
        setStage(result.state.stage);
      }
    } catch (error) {
      console.error(error);
      setFailedRequest(message);
      setFailedConfirmation(confirmation);
      setPending([]);
      setSuggestions([]);
      const detail = error instanceof Error ? error.message : "";
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: detail.startsWith("요청이 잠시") || detail.startsWith("온주")
            ? detail
            : "온주에 연결하지 못했어요. 입력하신 내용은 그대로 두었으니 다시 시도해 주세요.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  const finish = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await generateWeeklyPlan({
        goalCard,
        scheduleBlocks: blocks.map(({ days, title, start, end, kind }) => ({
          days,
          title,
          start,
          end,
          kind,
        })),
        dayBounds: dayBounds.filter(bound => bound.wake && bound.bedtime && !bound.variable),
      });
      setGeneratedPlan(result.items);
      setPlanResponseId(result.response_id);
      const profile = {
        goal: goalCard.outcome || goal,
        reason: goalCard.identity || reason,
        obstacle: goalCard.recoveryRule || obstacle,
        availableTime: "확인된 시간 지도 기준",
        checkinTime: "밤 10시",
      };
      const plan: PlanItem[] = result.items.map((item) => ({
        id: crypto.randomUUID(),
        day: week[item.dayIndex],
        dayIndex: item.dayIndex,
        start: item.start,
        end: item.end,
        title: item.title,
        tinyStart: item.tinyStart,
        fallback: item.fallback,
        rationale: item.rationale,
      }));
      const map = {
        timeZone: ONJU_TIME_ZONE,
        weekOf: koreaWeekKey(),
        blocks,
        dayBounds,
        goalCard,
        plan,
      };
      localStorage.setItem("onju-week-map", JSON.stringify(map));
      await saveAgentState(sessionId.current, {
        stage,
        messages,
        blocks,
        pendingBlocks: pending,
        dayBounds,
        goal: profile.goal,
        reason: profile.reason,
        obstacle: profile.obstacle,
        responseId,
        goalCard,
        goalResponseId,
        generatedPlan: result.items,
        planResponseId: result.response_id,
      });
      onComplete(profile, plan);
      nav("/plan");
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "주간 계획을 배치하지 못했어요. 시간 지도를 확인한 뒤 다시 시도해 주세요.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  if (!hydrated)
    return (
      <main className="schedule-setup setup-loading">
        <div className="assistant-avatar">온</div>
        <p>온주가 지난 대화를 불러오고 있어요.</p>
      </main>
    );
  return (
    <main className="schedule-setup">
      <header className="setup-header">
        <button aria-label="홈으로" onClick={() => nav("/")}>
          <ArrowLeft />
        </button>
        <div>
          <b>온주와 내 계획 만들기</b>
          <span>
            한국시간(KST) · {stage === 5 ? '목표 설계' : '생활 이해'} ·{" "}
            {saveStatus === "saved"
              ? "저장됨"
              : saveStatus === "saving"
              ? "저장 중…"
              : "오프라인"}
          </span>
        </div>
        <button className="save-exit" onClick={() => nav("/")}>
          나중에
        </button>
      </header>
      <div className="schedule-layout">
        <section className="setup-panel chat-setup">
          <div className="chat-top">
            <div className="assistant-avatar small">온</div>
            <div>
              <b>온주</b>
              <span>
                {stage === 5 ? "목표 설계 파트너" : "당신의 일정 비서"} · KST
              </span>
            </div>
          </div>
          <div className="conversation-viewport">
          <div className="conversation-history" ref={historyRef} onScroll={onScroll}
            role="log" aria-label="온주와의 대화" aria-live="polite" aria-relevant="additions" tabIndex={0}>
          <div className="conversation-content" ref={contentRef}>
            {messages.length === 0 && (
            <div className="assistant-question">
              <span>{current.title}</span>
              <h1>{current.question}</h1>
              <AgentText text={current.hint} />
            </div>
            )}
            {messages.map((message) => (
              <div
                className={
                  message.role === "user" ? "user-bubble" : "assistant-bubble"
                }
                key={message.id}
              >
                {message.role === "assistant" ? <AgentText text={message.text} /> : message.text}
              </div>
            ))}
            {loading && (
              <div
                className="assistant-bubble typing"
                aria-label="온주가 생각하고 있어요"
              >
                <i />
                <i />
                <i />
                <span>말씀하신 내용을 정리하고 있어요</span>
              </div>
            )}
          {suggestions.length > 0 && (
            <div className="suggestions agent-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  disabled={loading}
                  key={suggestion}
                  onClick={() => send(suggestion, goalDraft && ['이 초안으로 시작할게요','관련 조건도 함께 조정할게요'].includes(suggestion) ? { draftId: goalDraft.id,includeRelated:suggestion==='관련 조건도 함께 조정할게요' } : undefined)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {failedRequest && !loading && <div className="suggestions agent-suggestions">
            <button onClick={() => send(failedRequest,failedConfirmation)}>같은 내용으로 다시 시도</button>
          </div>}
          </div>
          </div>
          {showLatest && <button className="latest-message" onClick={scrollToLatest}>
            <ArrowDown size={16} /> 최신 대화로
          </button>}
          </div>
          <div className="chat-input-area">
          <div className="composer large">
            <textarea
              aria-label="온주에게 메시지"
              disabled={loading}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                needsClarification
                  ? "온주의 질문에 답해 주세요"
                  : stage === 5 ? "원하는 변화나 수정할 점을 말해 주세요" : "아는 내용만 편하게 이야기해 주세요"
              }
              rows={2}
            />
            <button
              aria-label="보내기"
              disabled={!input.trim() || loading}
              onClick={() => send()}
            >
              <Send />
            </button>
          </div>
          <p className="composer-hint">짧게 답해도 괜찮아요. 정리는 온주가 할게요.</p>
          </div>
        </section>
        <aside className="map-sidebar">
          <button className="map-toggle" aria-expanded={mapOpen} aria-controls="setup-map" onClick={() => setMapOpen(!mapOpen)}>
            <Clock3 size={17} /> {stage === 5 ? '시간 지도·목표' : '시간 지도'} · 일정 {blocks.length}개 <span>{mapOpen ? '접기' : '보기'}</span>
          </button>
          <div id="setup-map" className={`map-content ${mapOpen ? 'is-open' : ''}`}>
        <WeekMap
          blocks={blocks}
          dayBounds={dayBounds}
          remove={(id) => setBlocks(blocks.filter((b) => b.id !== id))}
        />
          {stage === 5 && (goalCard.outcome || goalDraft) && (
            <GoalDraft card={goalDraft?.card ?? goalCard} draft={goalDraft} pending={!!goalDraft} confirmed={goalReady} ready={goalReady && dayBounds.some(b => b.wake && b.bedtime && !b.variable)} loading={loading}
              onConfirm={() => goalDraft && send(goalDraft.related?'관련 조건도 함께 조정할게요':'이 초안으로 시작할게요', { draftId: goalDraft.id,includeRelated:!!goalDraft.related })} onFinish={finish} />
          )}
          </div>
        </aside>
      </div>
    </main>
  );
}

function GoalDraft({
  card,
  draft,
  ready,
  loading,
  onFinish,
  pending,
  confirmed,
  onConfirm,
}: {
  card: GoalCard;
  draft: PendingGoalDraft | null;
  ready: boolean;
  loading: boolean;
  onFinish: () => void;
  pending: boolean;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  return (
    <section className="goal-draft">
      <div className="goal-draft-head">
        <span>{card.category}</span>
        <b>{pending ? '검토 중인 초안 · 미확정' : confirmed ? '함께 정한 목표' : '목표 정리 중'}</b>
      </div>
      {!!draft?.changes?.length && <div className="goal-change-summary">
        <strong>{draft.baseLabel || '직전 계획'} 대비 변경</strong>
        <ul>{draft.changes.map((change,i)=><li key={i}><b>{change.label}</b><span>{change.before} → <strong>{change.after}</strong></span></li>)}</ul>
      </div>}
      <details className="goal-draft-details">
      <summary>{card.outcome}</summary>
      {card.durationWeeks > 0 && (
        <p className="goal-period">
          {card.durationWeeks}주 시험{card.deadline ? ` · ${card.deadline}` : ''}
        </p>
      )}
      <dl>
        {card.targetMetric && (
          <>
            <dt>결과 기준</dt>
            <dd>{card.targetMetric}</dd>
          </>
        )}
        {card.baselineMetric && (
          <>
            <dt>현재 기준선</dt>
            <dd>{card.baselineMetric}</dd>
          </>
        )}
        {card.weeklyActions.length > 0 && (
          <>
            <dt>주간 시스템</dt>
            <dd>
              {card.weeklyActions
                .map(
                  (action) =>
                    `${action.title} · 주 ${action.frequencyPerWeek}회 · ${action.durationMinutes}분`
                )
                .join(" / ")}
            </dd>
          </>
        )}
        {!card.execution && card.tinyStart && (
          <>
            <dt>2분 시작</dt>
            <dd>{card.tinyStart}</dd>
          </>
        )}
        {card.cue && (
          <>
            <dt>실행 단서</dt>
            <dd>{card.cue}</dd>
          </>
        )}
        {card.execution && <>
          <dt>완료 기준</dt>
          <dd><ul className="goal-execution-list">{card.execution.actions.map((guide,i)=><li key={i}><strong>{card.weeklyActions[i].title}</strong><span>계획한 {card.weeklyActions[i].durationMinutes}분 실행 + {guide.completionCriterion}</span></li>)}</ul></dd>
          <dt>바쁜 날 최소 실행</dt>
          <dd><ul className="goal-execution-list">{card.execution.actions.map((guide,i)=><li key={i}><strong>{card.weeklyActions[i].title}</strong><span>{guide.minimumAction} · {guide.minimumMinutes}분</span></li>)}</ul><small>최소 실행은 기본 실행 완료 횟수에 포함하지 않고 따로 기록해요.</small></dd>
          <dt>점검</dt><dd>{card.reviewCycle}</dd>
        </>}
        {!card.execution && card.fallbackAction && (
          <>
            <dt>축소 실행</dt>
            <dd>{card.fallbackAction}</dd>
          </>
        )}
        {card.recoveryRule && (
          <>
            <dt>복귀 규칙</dt>
            <dd>{card.recoveryRule}</dd>
          </>
        )}
      </dl>
      </details>
      <p className="goal-period">기본 실행량: 주 {card.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek*a.durationMinutes,0)}분</p>
      {draft?.related && <div className="goal-related-review">
        <strong>함께 확인할 조건</strong><p>{draft.related.reason}</p>
        <ul>{draft.related.changes.map((change,i)=><li key={i}><b>{change.label}</b><span>{change.before} → <strong>{change.after}</strong></span></li>)}</ul>
        <p>아래 버튼을 누르면 요청한 변경과 이 관련 변경을 함께 확정해요.</p>
      </div>}
      {pending ? (
        <button className="button full" disabled={loading} onClick={onConfirm}>{draft?.related?'관련 조건도 함께 조정할게요':'이 초안으로 시작할게요'} <ArrowRight size={18} /></button>
      ) : ready ? (
        <button className="button full" disabled={loading} onClick={onFinish}>
          {loading ? '계획 준비 중…' : '이 목표로 주간 계획 만들기'} <ArrowRight size={18} />
        </button>
      ) : (
        <p className="goal-draft-note">
          {confirmed ? '목표는 확정했어요. 주간 계획을 만들려면 대화에서 기상·취침 시간을 먼저 알려 주세요.' : '이루고 싶은 변화를 이야기해 주세요. 온주가 작은 실행 초안으로 정리할게요.'}
        </p>
      )}
    </section>
  );
}

function mergeBlocks(current: Block[], incoming: Block[]) {
  return [...current, ...incoming].filter(
    (block, index, all) =>
      all.findIndex(
        (item) =>
          item.title === block.title &&
          item.start === block.start &&
          item.end === block.end &&
          item.days.join(",") === block.days.join(",")
      ) === index
  );
}
function WeekMap({
  blocks,
  dayBounds,
  remove,
}: {
  blocks: Block[];
  dayBounds: AiDayBounds[];
  remove: (id: string) => void;
}) {
  return (
    <aside className="week-map">
      <div className="week-map-head">
        <div>
          <span className="section-label">실시간 시간 지도</span>
          <h2>이번 주 · 한국시간</h2>
        </div>
        <span className="available-chip">
          {dayBounds.length ? "알려주신 리듬 반영" : "생활 리듬 확인 전"}
        </span>
      </div>
      <div className="kst-notice">
        <Clock3 />
        {dayBounds.length
          ? "기상·취침이 확인된 요일만 빈 시간을 계산해요."
          : "기상·취침 시간을 먼저 알려주세요."}
      </div>
      {dayBounds.length > 0 && (
        <div className="rhythm-summary">
          {dayBounds.map((bound, index) => (
            <span key={`${bound.days.join("-")}-${index}`}>
              <b>{bound.days.map((day) => week[day]).join("·")}</b> {bound.wake || "미정"}{" "}
              기상 · {bound.bedtime || "미정"} 취침 {bound.deferred ? <em>나중에 확인</em> : bound.variable && <em>변동</em>}
            </span>
          ))}
        </div>
      )}
      <div className="week-columns">
        {week.map((day, index) => (
          <div className="day-column" key={day}>
            <b>{day}</b>
            <div className="day-blocks">
              {blocks
                .filter((b) => b.days.includes(index))
                .map((b) => (
                  <button
                    className={`mini-block ${b.kind} ${
                      b.pending ? "pending" : ""
                    }`}
                    key={b.id}
                    onClick={() => !b.pending && remove(b.id)}
                  >
                    <span>{b.title}</span>
                    <small>
                      {b.start}–{b.end}
                    </small>
                    {!b.pending && <Trash2 />}
                  </button>
                ))}
              {!blocks.some((b) => b.days.includes(index)) && (
                <span className="empty-day">
                  {dayBounds.some((bound) => bound.days.includes(index))
                    ? "등록 일정 없음"
                    : "리듬 확인 전"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="map-legend">
        <span>
          <i className="fixed" />
          고정
        </span>
        <span>
          <i className="variable" />
          이번 주
        </span>
        <span>
          <i className="recovery" />
          회복
        </span>
      </div>
      <div className="map-insight">
        <MessageCircle />
        <p>
          <b>대화할수록 지도가 정확해져요.</b>
          <br />
          {dayBounds.some((bound) => bound.variable)
            ? "변동형 생활 리듬은 당일 대화로 다시 조정해요."
            : `현재 일정 ${blocks.length}개를 반영하고 있어요.`}
        </p>
      </div>
    </aside>
  );
}
