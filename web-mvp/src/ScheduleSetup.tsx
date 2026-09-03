import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
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
import { emptyGoalCard, type GoalCard } from "./goalAgent";
import { generateWeeklyPlan, type GeneratedPlanItem } from "./planAgent";
import AgentText from "./AgentText";
import { talkToOnju } from "./unifiedAgent";

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
    hint: "평일과 주말이 다르다면 나누어 알려주세요. 특정 요일만 다르거나 시간이 일정하지 않은 경우도 자세히 말해 주실수록 더 현실적인 계획을 만들 수 있어요.\n\n예: “평일은 6시 기상·23시 취침, 토요일은 8시 기상, 일요일은 일정하지 않아.”",
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
    [goalResponseId, setGoalResponseId] = useState<string>(),
    [generatedPlan, setGeneratedPlan] = useState<GeneratedPlanItem[]>([]),
    [planResponseId, setPlanResponseId] = useState<string>(),
    [goalReady, setGoalReady] = useState(false),
    [loading, setLoading] = useState(false),
    [needsClarification, setNeedsClarification] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">(
      "saved"
    );
  const [suggestions, setSuggestions] = useState<string[]>([]),
    current = stages[stage],
    available = useMemo(() => Math.max(5, 30 - blocks.length * 2), [blocks]);
  useEffect(() => {
    let active = true;
    loadAgentState(sessionId.current)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          setStage(saved.dayBounds.length ? saved.stage : 0);
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
          setGeneratedPlan(saved.generatedPlan ?? []);
          setPlanResponseId(saved.planResponseId);
          setGoalReady(isGoalReady(saved.goalCard));
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
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      saveAgentState(sessionId.current, {
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
      })
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("offline"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
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
  const send = async (text = input) => {
    const message = text.trim();
    if (!message || loading) return;
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: message },
    ]);
    setInput("");
    setSuggestions([]);
    setLoading(true);
    setNeedsClarification(false);
    try {
      const result = await talkToOnju(sessionId.current, message);
      setResponseId(result.response_id);
      setNeedsClarification(result.needs_clarification);
      setSuggestions(result.suggestions ?? []);
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.assistant_message,
        },
      ]);
      setBlocks(result.state.blocks.map((block) => ({...block,id:crypto.randomUUID(),pending:false})));
      setDayBounds(result.state.dayBounds);
      setGoalCard(result.state.goalCard);
      setGoal(result.state.goalCard.outcome);
      setReason(result.state.goalCard.identity || reason);
      setObstacle(result.state.goalCard.recoveryRule || obstacle);
      setGoalReady(isGoalReady(result.state.goalCard));
      setPending([]);
      if (result.state.stage !== stage) {
        setSuggestions([]);
        setStage(result.state.stage);
      }
    } catch (error) {
      console.error(error);
      setPending([]);
      setSuggestions([]);
      const detail = error instanceof Error ? error.message : "";
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: detail.includes("Failed to send a request")
            ? "온주 서버에 접속하지 못했어요. 인터넷 연결을 확인해 주세요."
            : detail.includes("non-2xx")
            ? "AI 서버가 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
            : "잠시 연결이 불안정해요. 방금 내용을 한 번만 다시 말해 주세요.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  const skip = () => {
    setPending([]);
    if (stage < 5) setStage(stage + 1);
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
        dayBounds,
      });
      setGeneratedPlan(result.items);
      setPlanResponseId(result.response_id);
      const profile = {
        goal: goalCard.outcome || goal,
        reason: goalCard.identity || reason,
        obstacle: goalCard.recoveryRule || obstacle,
        availableTime: `${available}분`,
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
        <button onClick={() => (stage ? setStage(stage - 1) : nav("/"))}>
          <ArrowLeft />
        </button>
        <div>
          <b>온주와 시간 지도 만들기</b>
          <span>
            한국시간(KST) · {stage + 1} / 6 ·{" "}
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
          <div className="conversation-history">
            <div className="assistant-question">
              <span>{current.title}</span>
              <h1>{current.question}</h1>
              <p>{current.hint}</p>
            </div>
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
              </div>
            )}
          </div>
          {suggestions.length > 0 && (
            <div className="suggestions agent-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  disabled={loading}
                  key={suggestion}
                  onClick={() => send(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          <div className="composer large">
            <textarea
              disabled={loading}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                needsClarification
                  ? "온주의 질문에 답해 주세요"
                  : "일정을 편하게 이야기해 주세요"
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
          {stage < 5 &&
            !needsClarification &&
            messages.length > 0 &&
            !loading && (
              <button className="skip-link" onClick={skip}>
                이 단계는 충분해요 · 다음으로
              </button>
            )}
          {stage === 5 && goalCard.outcome && (
            <GoalDraft card={goalCard} ready={goalReady} onFinish={finish} />
          )}
        </section>
        <WeekMap
          blocks={blocks}
          dayBounds={dayBounds}
          remove={(id) => setBlocks(blocks.filter((b) => b.id !== id))}
        />
      </div>
    </main>
  );
}

function GoalDraft({
  card,
  ready,
  onFinish,
}: {
  card: GoalCard;
  ready: boolean;
  onFinish: () => void;
}) {
  const filled = [
    card.targetMetric,
    card.weeklyActions.length ? card.weeklyActions[0].title : "",
    card.tinyStart,
    card.cue,
  ].filter(Boolean).length;
  return (
    <section className="goal-draft">
      <div className="goal-draft-head">
        <span>{card.category}</span>
        <b>목표 설계 {filled}/4</b>
      </div>
      <h2>{card.outcome}</h2>
      {card.durationWeeks > 0 && (
        <p className="goal-period">
          {card.durationWeeks}주 · {card.deadline || "종료일 협의 중"}
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
        {card.tinyStart && (
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
        {card.fallbackAction && (
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
      {ready ? (
        <button className="button full" onClick={onFinish}>
          이 목표로 주간 계획 만들기 <ArrowRight size={18} />
        </button>
      ) : (
        <p className="goal-draft-note">
          온주와 대화하면 비어 있는 항목이 하나씩 채워져요.
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
function isGoalReady(card?: GoalCard) {
  return Boolean(
    card?.category &&
      card.outcome &&
      card.durationWeeks &&
      card.baselineMetric &&
      card.targetMetric &&
      card.identity &&
      card.weeklyActions.length &&
      card.tinyStart &&
      card.cue &&
      card.fallbackAction &&
      card.recoveryRule
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
          {dayBounds.length ? "생활 리듬 반영됨" : "생활 리듬 확인 전"}
        </span>
      </div>
      <div className="kst-notice">
        <Clock3 />
        {dayBounds.length
          ? "기상·취침 시간을 기준으로 빈 시간을 계산해요."
          : "기상·취침 시간을 먼저 알려주세요."}
      </div>
      {dayBounds.length > 0 && (
        <div className="rhythm-summary">
          {dayBounds.map((bound, index) => (
            <span key={`${bound.days.join("-")}-${index}`}>
              <b>{bound.days.map((day) => week[day]).join("·")}</b> {bound.wake}{" "}
              기상 · {bound.bedtime} 취침 {bound.variable && <em>변동</em>}
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
                    ? "일정 없음"
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
