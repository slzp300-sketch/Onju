import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  loadState,
  makePlan,
  saveState,
  type OnjuState,
  type PlanItem,
} from "./model";
import ScheduleSetup from "./ScheduleSetup";
import {
  getAgentSessionId,
  loadAgentState,
  savePlanRevision,
  type PlanRevisionRecord,
} from "./agentMemory";
import { reviseWeeklyPlan, type PlanChange } from "./planRevisionAgent";
import { emptyGoalCard, type GoalCard } from "./goalAgent";
import type { AiScheduleBlock } from "./aiSchedule";
import AgentText from "./AgentText";

export default function App() {
  const [state, setState] = useState<OnjuState>(loadState);
  useEffect(() => saveState(state), [state]);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/setup"
          element={
            <ScheduleSetup
              onComplete={(profile, plan) =>
                setState({
                  profile,
                  plan: plan.length ? plan : makePlan(profile),
                  approved: false,
                })
              }
            />
          }
        />
        <Route
          path="/plan"
          element={
            state.plan.length ? (
              <Plan state={state} onChange={setState} />
            ) : (
              <Navigate to="/setup" replace />
            )
          }
        />
        <Route
          path="/today"
          element={
            state.approved ? (
              <Today state={state} />
            ) : (
              <Navigate to="/plan" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function Header() {
  return (
    <header className="nav shell compact">
      <Link className="brand" to="/">
        <span className="brand-mark">온</span>온주
      </Link>
      <nav className="nav-links">
        <a href="/#how">작동 방식</a>
        <Link to="/setup">계획 만들기</Link>
      </nav>
      <Link className="button button-small" to="/setup">
        대화 시작
      </Link>
    </header>
  );
}

function Landing() {
  return (
    <main>
      <Header />
      <section className="hero shell">
        <div className="eyebrow">
          <Sparkles size={16} /> 완벽한 계획보다, 다시 이어지는 하루
        </div>
        <h1>
          계획은 온주와 대화로.
          <br />
          <em>오늘은 가능한 만큼.</em>
        </h1>
        <p className="hero-copy">
          목표와 현실 사이에서 자꾸 멈췄나요? 온주가 당신의 시간과 컨디션을
          듣고, 오늘 할 수 있는 한 가지부터 함께 정리해요.
        </p>
        <div className="hero-actions">
          <Link className="button" to="/setup">
            내 계획 만들어 보기 <ArrowRight size={18} />
          </Link>
          <a className="text-link" href="#how">
            어떻게 다른가요?
          </a>
        </div>
        <div className="demo-card">
          <div className="demo-intro">
            <div className="assistant-avatar">온</div>
            <div>
              <span className="status">
                <i /> 온주가 듣고 있어요
              </span>
              <h2>
                잘 세우는 것보다
                <br />
                다시 시작하기 쉬운 계획
              </h2>
              <p>
                처음 목표를 정하는 순간부터 실패한 다음 날까지, 실제 하루에 맞춰
                함께 조정해요.
              </p>
              <Link className="button" to="/setup">
                실제로 시작하기 <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section id="how" className="section shell">
        <div className="section-heading">
          <span>온주가 하는 일</span>
          <h2>
            당신은 하루를 말하고,
            <br />
            온주는 흐름을 이어가요.
          </h2>
        </div>
        <div className="feature-grid">
          <Feature
            icon={<MessageCircle />}
            n="01 · 대화"
            title="목표보다 먼저 삶을 들어요"
          >
            가능한 시간과 반복된 실패, 지키고 싶은 이유를 하나씩 물어요.
          </Feature>
          <Feature
            icon={<Clock3 />}
            n="02 · 실행"
            title="오늘 가능한 크기로 줄여요"
          >
            지금의 시간과 에너지에 맞게 계획을 조정해요.
          </Feature>
          <Feature
            icon={<RotateCcw />}
            n="03 · 복귀"
            title="놓친 다음 날을 도와요"
          >
            나무라지 않고 다시 시작할 가장 작은 행동을 찾아요.
          </Feature>
        </div>
      </section>
    </main>
  );
}
function Feature({
  icon,
  n,
  title,
  children,
}: {
  icon: ReactNode;
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article>
      {icon}
      <small>{n}</small>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function Plan({
  state,
  onChange,
}: {
  state: OnjuState;
  onChange: (s: OnjuState) => void;
}) {
  const nav = useNavigate(),
    sessionId = getAgentSessionId(),
    [input, setInput] = useState(""),
    [loading, setLoading] = useState(false),
    [assistant, setAssistant] = useState(
      "바꾸고 싶은 부분을 말해 주세요. 예: “목요일 운동을 토요일 오전 10시로 옮겨줘.”"
    ),
    [pending, setPending] = useState<PlanItem[]>([]),
    [changes, setChanges] = useState<PlanChange[]>([]),
    [warnings, setWarnings] = useState<string[]>([]),
    [responseId, setResponseId] = useState<string>(),
    [history, setHistory] = useState<PlanRevisionRecord[]>([]),
    [blocks, setBlocks] = useState<AiScheduleBlock[]>([]),
    [goalCard, setGoalCard] = useState<GoalCard>(emptyGoalCard),
    [lastRequest, setLastRequest] = useState("");
  useEffect(() => {
    loadAgentState(sessionId)
      .then((saved) => {
        if (!saved) return;
        setBlocks(
          saved.blocks.map(({ days, title, start, end, kind }) => ({
            days,
            title,
            start,
            end,
            kind,
          }))
        );
        setGoalCard(saved.goalCard);
        setPending(saved.pendingPlan ?? []);
        setHistory(saved.planRevisionHistory ?? []);
        setResponseId(saved.planRevisionResponseId);
      })
      .catch(() => {});
  }, [sessionId]);
  const update = (id: string, key: "title" | "fallback", value: string) =>
    onChange({
      ...state,
      plan: state.plan.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    });
  const requestRevision = async () => {
    const message = input.trim();
    if (!message || loading) return;
    setLoading(true);
    setInput("");
    setLastRequest(message);
    setWarnings([]);
    try {
      const result = await reviseWeeklyPlan({
        message,
        currentPlan: state.plan,
        scheduleBlocks: blocks,
        goalCard,
        previousResponseId: responseId,
      });
      setAssistant(result.assistant_message);
      setResponseId(result.response_id);
      setPending(result.proposed_plan);
      setChanges(result.changes);
      setWarnings(result.warnings);
      await savePlanRevision(sessionId, {
        plan: state.plan,
        pendingPlan: result.proposed_plan,
        history,
        responseId: result.response_id,
      });
    } catch {
      setAssistant(
        "잠시 연결이 불안정해요. 수정 내용을 한 번만 다시 말해 주세요."
      );
    } finally {
      setLoading(false);
    }
  };
  const applyRevision = async () => {
    if (!pending.length) return;
    const record: PlanRevisionRecord = {
      id: crypto.randomUUID(),
      requestedAt: new Date().toISOString(),
      request: lastRequest,
      changes,
      plan: pending,
    };
    const nextHistory = [...history, record].slice(-50);
    onChange({ ...state, plan: pending, approved: false });
    setHistory(nextHistory);
    setPending([]);
    setChanges([]);
    setAssistant(
      "수정안을 계획에 반영했어요. 더 바꾸고 싶은 부분이 있으면 이어서 말해 주세요."
    );
    const savedMap = localStorage.getItem("onju-week-map");
    if (savedMap) {
      try {
        localStorage.setItem(
          "onju-week-map",
          JSON.stringify({ ...JSON.parse(savedMap), plan: pending })
        );
      } catch {
        /* 기존 지도는 그대로 둠 */
      }
    }
    await savePlanRevision(sessionId, {
      plan: pending,
      pendingPlan: [],
      history: nextHistory,
      responseId,
    });
  };
  return (
    <main className="app-page">
      <Header />
      <div className="flow-shell wide">
        <div className="plan-title">
          <div>
            <span className="section-label">온주의 첫 번째 제안</span>
            <h1>지치지 않게 시작하는 7일</h1>
            <p>확정된 일정과 겹치지 않는 시간에 목표 행동을 배치했어요.</p>
          </div>
          <div className="plan-badge">
            <CalendarDays />
            <span>{state.plan.length}회 계획</span>
          </div>
        </div>
        <div className="alpha-plan-list">
          {state.plan.map((item) => (
            <PlanRow item={item} update={update} key={item.id} />
          ))}
        </div>
        <section className="revision-agent">
          <div className="revision-head">
            <div className="assistant-avatar small">온</div>
            <div>
              <b>계획 수정 비서</b>
              <span>확정 일정과 충돌을 다시 확인해요</span>
            </div>
          </div>
          <div className="revision-message">
            <AgentText text={loading ? "수정 가능한 시간을 확인하고 있어요…" : assistant} />
          </div>
          <div className="revision-composer">
            <textarea
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  requestRevision();
                }
              }}
              placeholder="바꾸고 싶은 계획을 편하게 말해 주세요"
              rows={2}
            />
            <button
              aria-label="수정 요청 보내기"
              disabled={!input.trim() || loading}
              onClick={requestRevision}
            >
              <Send />
            </button>
          </div>
          {warnings.map((warning) => (
            <p className="revision-warning" key={warning}>
              {warning}
            </p>
          ))}
          {pending.length > 0 && (
            <div className="revision-preview">
              <div className="revision-preview-title">
                <b>반영 전 비교</b>
                <span>아직 현재 계획은 바뀌지 않았어요.</span>
              </div>
              {changes.map((change, index) => (
                <div className="change-row" key={`${change.summary}-${index}`}>
                  <span>{change.summary}</span>
                  <del>{change.before}</del>
                  <ArrowRight />
                  <ins>{change.after}</ins>
                </div>
              ))}
              <div className="revision-actions">
                <button
                  onClick={() => {
                    setPending([]);
                    setChanges([]);
                    setAssistant(
                      "수정안을 취소했어요. 원하는 변경을 다시 말해 주세요."
                    );
                  }}
                >
                  <X />
                  취소
                </button>
                <button className="button" onClick={applyRevision}>
                  <Check />이 수정안 적용
                </button>
              </div>
            </div>
          )}
          {history.length > 0 && (
            <small className="revision-history">
              지금까지 승인한 수정 {history.length}회 · Supabase에 기록됨
            </small>
          )}
        </section>
        <div className="approval">
          <div>
            <b>완벽하지 않아도 괜찮아요.</b>
            <p>정상 실행이 어려우면 2분 시작이나 축소 실행으로 이어가요.</p>
          </div>
          <button
            className="button"
            onClick={() => {
              onChange({ ...state, approved: true });
              nav("/today");
            }}
          >
            이 계획으로 시작하기 <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
function PlanRow({
  item,
  update,
}: {
  item: PlanItem;
  update: (id: string, key: "title" | "fallback", value: string) => void;
}) {
  return (
    <div className="alpha-plan-row generated">
      <span>
        {item.day}
        <small>
          {item.start && item.end ? `${item.start}–${item.end}` : ""}
        </small>
      </span>
      <div>
        <input
          value={item.title}
          aria-label={`${item.day}요일 계획`}
          onChange={(e) => update(item.id, "title", e.target.value)}
        />
        {item.tinyStart && (
          <p className="tiny-start">2분 시작 · {item.tinyStart}</p>
        )}
        <input
          className="fallback"
          value={item.fallback}
          aria-label={`${item.day}요일 축소 계획`}
          onChange={(e) => update(item.id, "fallback", e.target.value)}
        />
        {item.rationale && (
          <small className="plan-reason">{item.rationale}</small>
        )}
      </div>
      <Check />
    </div>
  );
}
function Today({ state }: { state: OnjuState }) {
  const today = state.plan[(new Date().getDay() + 6) % 7];
  return (
    <main className="app-page">
      <Header />
      <div className="flow-shell">
        <section className="today-card">
          <span className="section-label">오늘의 한 가지</span>
          <h1>{today?.title}</h1>
          <p>{today?.fallback}</p>
          <button className="button full">
            <Check size={19} /> 오늘 완료했어요
          </button>
          <div className="coming-soon">
            다음 단계에서 아침·마감 점검 대화가 연결됩니다.
          </div>
        </section>
      </div>
    </main>
  );
}
