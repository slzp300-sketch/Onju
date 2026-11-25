import {
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Moon,
  Send,
  Sparkles,
  Sunrise,
  X,
} from "lucide-react";
import {
  makePlan,
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
import { readSessionLocalState, writeSessionLocalState } from './agentSession';
import { emptyGoalCardFor, type GoalCard } from "./goalAgent";
import type { AiScheduleBlock } from "./aiSchedule";
import AgentText from "./AgentText";
import { calendarDateLabel, orderWeeklyItems, regionalTimeZoneLabel } from "./regionalContext";
import { useRegionalDate } from './useRegionalContext';
import { translator, weekdayLabels } from "./i18n";
import {
  answerDailyCheckIn,
  completeDailyItem,
  reviewDailyRuleTrial,
  startDailyRuleTrial,
  startDailyCheckIn,
  syncDailyPlan,
  updateDailyPreferences,
  updateDailyRoutineDependencies,
  updateDailyRoutineGrade,
  type DailyCheckInSession,
  type DailyDashboard,
  type DailyDependencyKind,
  type DailyRoutineGrade,
  type DailyItemStatus,
  type DailyTrialDecision,
} from "./dailyAgent";

import Header from './Header';

export default function ProductApp({state,onChange:setState}:{state:OnjuState;onChange:(state:OnjuState)=>void}) {
 return <Routes>
        <Route
          path="/setup"
          element={
            <ScheduleSetup
              onComplete={(profile, plan, regionalContext) =>
                setState({
                  profile,
                  plan: plan.length ? plan : makePlan(profile, regionalContext),
                  approved: false,
                  regionalContext,
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
</Routes>;
}

function Plan({
  state,
  onChange,
}: {
  state: OnjuState;
  onChange: (s: OnjuState) => void;
}) {
  const t = translator(state.regionalContext);
  const nav = useNavigate(),
    [sessionId] = useState(getAgentSessionId),
    [input, setInput] = useState(""),
    [loading, setLoading] = useState(false),
    [assistant, setAssistant] = useState(() => t('plan.initialAssistant')),
    [pending, setPending] = useState<PlanItem[]>([]),
    [changes, setChanges] = useState<PlanChange[]>([]),
    [warnings, setWarnings] = useState<string[]>([]),
    [responseId, setResponseId] = useState<string>(),
    [history, setHistory] = useState<PlanRevisionRecord[]>([]),
    [blocks, setBlocks] = useState<AiScheduleBlock[]>([]),
    [goalCard, setGoalCard] = useState<GoalCard>(() => emptyGoalCardFor(state.regionalContext)),
    [lastRequest, setLastRequest] = useState("");
  const [revealingReply, setRevealingReply] = useState(false);
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
    setRevealingReply(false);
    setLoading(true);
    setInput("");
    setLastRequest(message);
    setWarnings([]);
    try {
      const result = await reviseWeeklyPlan({
        sessionId,
        message,
        currentPlan: state.plan,
        scheduleBlocks: blocks,
        goalCard,
        previousResponseId: responseId,
        regionalContext: state.regionalContext,
      });
      setAssistant(result.assistant_message);
      setRevealingReply(true);
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
      setRevealingReply(false);
      setAssistant(t('plan.connectionError'));
    } finally {
      setLoading(false);
    }
  };
  const applyRevision = async () => {
    if (!pending.length) return;
    setRevealingReply(false);
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
    setAssistant(t('plan.applied'));
    const savedMap = readSessionLocalState("onju-week-map", sessionId);
    if (savedMap) {
      try {
        writeSessionLocalState(
          "onju-week-map",
          sessionId,
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
      <Header state={state} />
      <div className="flow-shell wide">
        <div className="plan-title">
          <div>
            <span className="section-label">{t('plan.label')}</span>
            <h1>{t('plan.title')}</h1>
            <p>{t('plan.copy')}</p>
          </div>
          <div className="plan-badge">
            <CalendarDays />
            <span>{t('plan.count', { count: state.plan.length })}</span>
          </div>
        </div>
        <div className="alpha-plan-list">
          {orderWeeklyItems(state.plan, state.regionalContext).map((item) => (
            <PlanRow item={item} update={update} state={state} key={item.id} />
          ))}
        </div>
        <section className="revision-agent">
          <div className="revision-head">
            <div className="assistant-avatar small">{t('app.mark')}</div>
            <div>
              <b>{t('plan.revisionAssistant')}</b>
              <span>{t('plan.revisionCopy')}</span>
            </div>
          </div>
          <div className="revision-message">
            <AgentText text={loading ? t('plan.checking') : assistant}
              animate={!loading && revealingReply} onRevealComplete={() => setRevealingReply(false)} />
            {!loading && revealingReply && <button className="reveal-skip" onClick={() => setRevealingReply(false)}>{t('plan.showAll')}</button>}
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
              placeholder={t('plan.placeholder')}
              rows={2}
            />
            <button
              aria-label={t('plan.sendRevision')}
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
                <b>{t('plan.compare')}</b>
                <span>{t('plan.notChanged')}</span>
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
                    setAssistant(t('plan.cancelled'));
                  }}
                >
                  <X />
                  {t('plan.cancel')}
                </button>
                <button className="button" onClick={applyRevision}>
                  <Check />{t('plan.apply')}
                </button>
              </div>
            </div>
          )}
          {history.length > 0 && (
            <small className="revision-history">
              {t('plan.history', { count: history.length })}
            </small>
          )}
        </section>
        <div className="approval">
          <div>
            <b>{t('plan.encouragement')}</b>
            <p>{t('plan.fallbackCopy')}</p>
          </div>
          <button
            className="button"
            onClick={() => {
              onChange({ ...state, approved: true });
              nav("/today");
            }}
          >
            {t('plan.start')} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
function PlanRow({
  item,
  update,
  state,
}: {
  item: PlanItem;
  update: (id: string, key: "title" | "fallback", value: string) => void;
  state: OnjuState;
}) {
  const t = translator(state.regionalContext);
  const day = typeof item.dayIndex === 'number' ? weekdayLabels(state.regionalContext)[item.dayIndex] : item.day;
  return (
    <div className="alpha-plan-row generated">
      <span>
        {day}
        <small>
          {item.start && item.end ? `${item.start}–${item.end}` : ""}
        </small>
      </span>
      <div>
        <input
          value={item.title}
          aria-label={t('plan.itemLabel', { day })}
          onChange={(e) => update(item.id, "title", e.target.value)}
        />
        {item.tinyStart && (
          <p className="tiny-start">{t('plan.tinyStart', { action: item.tinyStart })}</p>
        )}
        <input
          className="fallback"
          value={item.fallback}
          aria-label={t('plan.fallbackLabel', { day })}
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
  const t = translator(state.regionalContext);
  const todayDate = useRegionalDate(state.regionalContext);
  const [sessionId] = useState(getAgentSessionId);
  const [dashboard, setDashboard] = useState<DailyDashboard | null>(null);
  const [activeCheckIn, setActiveCheckIn] = useState<DailyCheckInSession | null>(null);
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setLoading] = useState(true);
  const dashboardKey = JSON.stringify([todayDate, state.regionalContext, state.plan]);
  const [loadedKey, setLoadedKey] = useState('');
  const loading = busy || dashboardKey !== loadedKey;
  const [error, setError] = useState("");
  const [preferences, setPreferences] = useState<DailyDashboard["preferences"] | null>(null);

  useEffect(() => {
    let active = true;
    syncDailyPlan(sessionId, state.plan)
      .then((next) => {
        if (!active) return;
        setError('');
        setDashboard(next);
        setPreferences(next.preferences);
        setActiveCheckIn(next.checkIns.find((item) => item.status === "active") ?? null);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) { setLoading(false); setLoadedKey(dashboardKey); }
      });
    return () => {
      active = false;
    };
  }, [sessionId, state.plan, state.regionalContext, todayDate, dashboardKey]);

  const beginCheckIn = async (type: "morning" | "closing") => {
    if (loading) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await startDailyCheckIn(sessionId, type);
      setDashboard(result.dashboard);
      setActiveCheckIn(result.session?.status === "active" ? result.session : null);
      setMessage(result.message ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.startError'));
    } finally {
      setLoading(false);
    }
  };

  const answer = async (value = input) => {
    const text = value.trim();
    if (!activeCheckIn || !text || loading) return;
    setLoading(true);
    setError("");
    setInput("");
    try {
      const result = await answerDailyCheckIn(sessionId, activeCheckIn, text);
      setDashboard(result.dashboard);
      setMessage(result.message ?? "");
      setActiveCheckIn(result.session?.status === "active" ? result.session : null);
    } catch (cause) {
      setInput(text);
      setError(cause instanceof Error ? cause.message : t('today.answerError'));
    } finally {
      setLoading(false);
    }
  };

  const recordItem = async (itemId: string, status: DailyItemStatus) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const routine = dashboard?.items.find((item) => item.id === itemId);
      const next = await completeDailyItem(sessionId, itemId, status);
      setDashboard(next);
      const baseMessage = status === "completed"
        ? t('today.recordedCompleted')
        : status === "exception"
          ? t('today.recordedException')
          : routine?.grade === "observation"
            ? t('today.recordedObservation')
            : routine?.grade === "strong"
              ? t('today.recordedStrongMiss')
              : t('today.recordedMiss');
      const signal = next.weekly.signals[0];
      setMessage(signal ? `${baseMessage}\n\n**${t('today.weeklySignal')}**\n${signal.title}\n\n${signal.detail}` : baseMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.recordError'));
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!preferences || loading) return;
    setLoading(true);
    setError("");
    try {
      const next = await updateDailyPreferences(sessionId, preferences);
      setDashboard(next);
      setPreferences(next.preferences);
      setMessage(t('today.preferencesSaved', { timezone: regionalTimeZoneLabel(state.regionalContext) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.preferencesError'));
    } finally {
      setLoading(false);
    }
  };

  const changeRoutineGrade = async (routineItemId: string, grade: DailyRoutineGrade) => {
    if (loading) return;
    const strongCount = dashboard?.routines.filter((routine) => routine.grade === "strong").length ?? 0;
    const current = dashboard?.routines.find((routine) => routine.id === routineItemId);
    if (grade === "strong" && current?.grade !== "strong" && strongCount >= 2) {
      setError(t('today.strongLimit'));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await updateDailyRoutineGrade(sessionId, routineItemId, grade);
      setDashboard(next);
      const label = grade === "observation" ? t('today.gradeObservation') : grade === "normal" ? t('today.gradeNormal') : grade === "strong" ? t('today.gradeStrong') : t('today.gradeExcluded');
      setMessage(t('today.gradeSaved', { routine: current?.title ?? t('today.routineFallback'), grade: label }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.gradeError'));
    } finally {
      setLoading(false);
    }
  };

  const toggleDependency = async (routineItemId: string, kind: DailyDependencyKind) => {
    if (loading) return;
    const current = dashboard?.routines.find((routine) => routine.id === routineItemId);
    if (!current) return;
    const dependencyKinds = current.dependencyKinds.includes(kind)
      ? current.dependencyKinds.filter((item) => item !== kind)
      : [...current.dependencyKinds, kind].slice(0, 3);
    setLoading(true);
    setError("");
    try {
      const next = await updateDailyRoutineDependencies(sessionId, routineItemId, dependencyKinds);
      setDashboard(next);
      setMessage(t('today.dependenciesSaved', { routine: current.title }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.dependenciesError'));
    } finally {
      setLoading(false);
    }
  };

  const startRuleTrial = async (routineKey: string, optionId: string) => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const next = await startDailyRuleTrial(sessionId, routineKey, optionId);
      setDashboard(next);
      const trial = next.activeTrials.find((item) => item.routineKey === routineKey);
      setMessage(trial
        ? t('today.trialStarted', { routine: trial.routineTitle, strategy: trial.strategy, start: trial.startedOn, end: trial.trialUntil })
        : t('today.trialSaved'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.trialStartError'));
    } finally {
      setLoading(false);
    }
  };

  const reviewRuleTrial = async (trialId: string, decision: DailyTrialDecision, optionId = "") => {
    if (loading) return;
    const current = dashboard?.activeTrials.find((trial) => trial.id === trialId);
    if (!current) return;
    setLoading(true);
    setError("");
    try {
      const next = await reviewDailyRuleTrial(sessionId, trialId, decision, optionId);
      setDashboard(next);
      if (decision === "extend") {
        const extended = next.activeTrials.find((trial) => trial.id === trialId);
        setMessage(t('today.trialExtended', { ending: extended ? t('today.trialNewEnding', { date: extended.trialUntil }) : '' }));
      } else if (decision === "keep") {
        setMessage(t('today.trialKept', { routine: current.routineTitle }));
      } else if (decision === "stop") {
        setMessage(t('today.trialStopped', { routine: current.routineTitle }));
      } else {
        const restarted = next.activeTrials.find((trial) => trial.routineKey === current.routineKey);
        setMessage(t('today.trialRestarted', { detail: restarted ? t('today.trialRestartDetail', { strategy: restarted.strategy, start: restarted.startedOn, end: restarted.trialUntil }) : '' }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('today.trialReviewError'));
    } finally {
      setLoading(false);
    }
  };

  const itemLog = (itemId: string) => dashboard?.itemLogs.find((log) => log.routineItemId === itemId);
  const checkIn = (type: "morning" | "closing") => dashboard?.checkIns.find((entry) => entry.type === type);
  const statusLabel = (status: DailyItemStatus | undefined, grade: DailyRoutineGrade) => status === "completed" ? t('today.statusCompleted') : status === "missed" ? grade === "observation" ? t('today.statusSkipped') : t('today.statusMissed') : status === "exception" ? t('today.statusException') : t('today.statusUnrecorded');
  const gradeLabel = (grade: DailyRoutineGrade) => grade === "observation" ? t('today.gradeObservation') : grade === "normal" ? t('today.gradeNormal') : grade === "strong" ? t('today.gradeStrong') : t('today.gradeExcluded');
  const dependencyLabels: Record<DailyDependencyKind, string> = { wake: t('today.dependencyWake'), sleep: t('today.dependencySleep'), schedule: t('today.dependencySchedule'), energy: t('today.dependencyEnergy') };
  const dayLabels = weekdayLabels(state.regionalContext);
  const weekly = dashboard?.weekly;

  return (
    <main className="app-page">
      <Header state={state} />
      <div className="flow-shell daily-shell">
        <div className="daily-heading">
          <div>
            <span className="section-label">{t('today.label', { timezone: regionalTimeZoneLabel(state.regionalContext) })}</span>
            <h1>{t('today.title')}</h1>
            <p>{t('today.copy', { date: dashboard?.date ? calendarDateLabel(state.regionalContext, dashboard.date) : t('today.recordLabel') })}</p>
          </div>
          {dashboard?.dailyLog?.energy && <span className="energy-badge">{t('today.energy', { value: dashboard.dailyLog.energy })}</span>}
        </div>

        {loading && !dashboard ? <div className="daily-loading">{t('today.loading')}</div> : null}
        {error && <p className="daily-error">{error}</p>}

        <section className="today-card daily-plan-card">
          <span className="section-label">{t('today.actions')}</span>
          {dashboard?.items.length ? dashboard.items.map((item) => {
            const log = itemLog(item.id);
            return (
              <article className={`daily-item grade-${item.grade} ${log ? `is-${log.status}` : ""}`} key={item.id}>
                <div className="daily-item-copy">
                  <div className="daily-item-meta">
                    {item.start && item.end ? `${item.start}–${item.end}` : t('today.flexibleTime')}
                    <span>{statusLabel(log?.status, item.grade)}</span>
                    <span className={`routine-grade-badge grade-${item.grade}`}>{gradeLabel(item.grade)}</span>
                  </div>
                  <h2>{item.title}</h2>
                  {item.minimumAction && <p>{t('today.minimumAction', { action: item.minimumAction })}</p>}
                  {item.activeStrategy && <p className={`active-strategy ${item.strategyState}`}><b>{item.strategyState === "adopted" ? t('today.adopted') : t('today.twoWeekTrial')}</b> · {item.activeStrategy} {item.strategyTrialUntil && <small>{t('today.until', { date: item.strategyTrialUntil.replaceAll("-", ".") })}</small>}</p>}
                </div>
                <div className="daily-item-actions">
                  <button className="button" disabled={loading || log?.status === "completed"} onClick={() => recordItem(item.id, "completed")}>
                    <Check size={18} /> {t('today.didIt')}
                  </button>
                  <button disabled={loading} onClick={() => recordItem(item.id, "missed")}>{item.grade === "observation" ? t('today.didNotObservation') : t('today.didNot')}</button>
                  <button disabled={loading} onClick={() => recordItem(item.id, "exception")}>{t('today.isException')}</button>
                </div>
              </article>
            );
          }) : <div className="daily-empty"><b>{t('today.emptyTitle')}</b><span>{t('today.emptyCopy')}</span></div>}
        </section>

        {weekly && <section className="daily-weekly">
          <div className="daily-section-title">
            <div>
              <span className="section-label">{t('today.lastSevenDays')}</span>
              <h2>{t('today.trendTitle')}</h2>
            </div>
            <small>{calendarDateLabel(state.regionalContext, weekly.startDate)}–{calendarDateLabel(state.regionalContext, weekly.endDate)}</small>
          </div>
          <div className="weekly-summary">
            <div className="weekly-score" aria-label={weekly.adherenceRate === null ? t('today.noAdherence') : t('today.adherence', { value: weekly.adherenceRate })}>
              <BarChart3 aria-hidden="true" />
              <strong>{weekly.adherenceRate === null ? "—" : `${weekly.adherenceRate}%`}</strong>
              <span>{t('today.recordedBasis')}</span>
            </div>
            <ol className="weekly-days" aria-label={t('today.weeklyAria')}>
              {weekly.days.map((day) => {
                const recorded = day.completed + day.missed + day.exception;
                const fill = day.scheduled ? Math.round((day.completed / day.scheduled) * 100) : 0;
                const stateClass = day.completed ? "has-completed" : day.missed ? "has-missed" : day.exception ? "has-exception" : "";
                return <li className={`${day.isToday ? "is-today" : ""} ${stateClass}`} key={day.date} title={t('today.daySummary', { date: day.date, completed: day.completed, missed: day.missed, exception: day.exception })}>
                  <span>{dayLabels[day.dayIndex]}</span>
                  <div className="weekly-day-bar"><i style={{ height: `${Math.max(fill, recorded ? 12 : 0)}%` }} /></div>
                  <b>{day.scheduled ? `${day.completed}/${day.scheduled}` : t('today.rest')}</b>
                </li>;
              })}
            </ol>
          </div>
          <div className="weekly-counts" aria-label={t('today.weeklySummary')}>
            <span><i className="completed" />{t('today.statusCompleted')} <b>{weekly.completed}</b></span>
            <span><i className="missed" />{t('today.statusMissed')} <b>{weekly.missed}</b></span>
            {!!weekly.observedSkipped && <span><i className="observed" />{t('today.observedSkipped')} <b>{weekly.observedSkipped}</b></span>}
            <span><i className="exception" />{t('today.statusException')} <b>{weekly.exception}</b></span>
            <span><i className="unrecorded" />{t('today.statusUnrecorded')} <b>{weekly.unrecorded}</b></span>
          </div>
          <div className={`weekly-insight ${weekly.signals.length ? "has-signal" : ""}`}>
            <Sparkles aria-hidden="true" />
            <div>
              <b>{weekly.signals[0]?.title ?? t('today.pendingJudgment')}</b>
              <p>{weekly.signals[0]?.detail ?? weekly.note}</p>
            </div>
          </div>
          {dashboard.yesterday && (dashboard.yesterday.adjustment || dashboard.yesterday.blocker) && <p className="weekly-yesterday">
            <b>{t('today.yesterday')}</b>
            {dashboard.yesterday.adjustment || dashboard.yesterday.blocker}
          </p>}
        </section>}

        {dashboard?.structureProposal && <section className="structure-proposal">
          <div className="structure-proposal-head">
            <Sparkles aria-hidden="true" />
            <div>
              <span className="section-label">{t('today.structureLabel')}</span>
              <h2>{t('today.structureTitle', { routine: dashboard.structureProposal.routineTitle })}</h2>
            </div>
          </div>
          <p className="structure-evidence"><b>{t('today.evidence')}</b>{dashboard.structureProposal.evidence}</p>
          <AgentText text={dashboard.structureProposal.diagnosis} />
          <div className="structure-options">
            {dashboard.structureProposal.options.map((option) => <button disabled={loading} key={option.id} onClick={() => startRuleTrial(dashboard.structureProposal!.routineKey, option.id)}>
              <b>{option.title}</b>
              <span>{option.description}</span>
              <small>{option.tradeoff}</small>
              <i>{t('today.try14Days')} <ArrowRight size={15} /></i>
            </button>)}
          </div>
          <p className="structure-consent">{t('today.structureConsent', { date: dashboard.structureProposal.trialUntil.replaceAll("-", ".") })}</p>
        </section>}

        {!!dashboard?.activeTrials.length && <section className="active-trials">
          <div className="daily-section-title">
            <div><span className="section-label">{t('today.inProgress')}</span><h2>{t('today.twoWeekTrial')}</h2></div>
            <small>{t('today.activeTrials', { count: dashboard.activeTrials.length })}</small>
          </div>
          {dashboard.activeTrials.map((trial) => <article className={trial.review.due ? "is-due" : ""} key={trial.id}>
            <div className="trial-overview">
              <div><b>{trial.routineTitle}</b><span>{t('today.prerequisite', { dependency: dependencyLabels[trial.dependencyKind] })}</span></div>
              <p>{trial.strategy}</p>
              <small>{trial.startedOn.replaceAll("-", ".")}–{trial.trialUntil.replaceAll("-", ".")}</small>
            </div>
            <div className="trial-progress" aria-label={t('today.trialProgress', { elapsed: trial.review.elapsedDays, total: trial.review.totalDays })}><i style={{ width: `${Math.min(100, Math.round((trial.review.elapsedDays / trial.review.totalDays) * 100))}%` }} /></div>
            <div className="trial-metrics">
              <span><b>{trial.review.adherenceRate === null ? "—" : `${trial.review.adherenceRate}%`}</b> {t('today.adherenceShort')}</span>
              <span><b>{trial.review.completed}</b> {t('today.statusCompleted')}</span>
              <span><b>{trial.review.missed}</b> {t('today.statusMissed')}</span>
              <span><b>{trial.review.unrecorded}</b> {t('today.statusUnrecorded')}</span>
            </div>
            <p className="trial-summary"><b>{trial.review.due ? t('today.onjuDecision') : t('today.dayNumber', { count: trial.review.elapsedDays })}</b>{trial.review.summary}</p>
            {trial.review.due && <div className="trial-review-actions">
              {trial.review.recommendation === "extend" ? <>
                <button className="button" disabled={loading} onClick={() => reviewRuleTrial(trial.id, "extend")}>{t('today.extendSeven')}</button>
                <button disabled={loading} onClick={() => reviewRuleTrial(trial.id, "stop")}>{t('today.endNow')}</button>
              </> : trial.review.outcomeCount < 3 ? <button className="button" disabled={loading} onClick={() => reviewRuleTrial(trial.id, "stop")}>{t('today.endMethod')}</button> : <>
                <button className={trial.review.recommendation === "keep" ? "button" : ""} disabled={loading} onClick={() => reviewRuleTrial(trial.id, "keep")}>{t('today.keepMethod')}</button>
                <button className={trial.review.recommendation === "stop" ? "recommended-stop" : ""} disabled={loading} onClick={() => reviewRuleTrial(trial.id, "stop")}>{t('today.stopMethod')}</button>
                <div className="trial-alternatives">
                  <b>{trial.review.recommendation === "modify" ? t('today.modifyRecommended') : t('today.modify')}</b>
                  {trial.review.alternativeOptions.map((option) => <button disabled={loading} key={option.id} onClick={() => reviewRuleTrial(trial.id, "modify", option.id)}><span>{option.title}</span><small>{option.tradeoff}</small><ArrowRight size={15} /></button>)}
                </div>
              </>}
            </div>}
          </article>)}
        </section>}

        {!!dashboard?.routines.length && <details className="daily-settings routine-grade-settings">
          <summary>{t('today.gradeSettings')} <small>{t('today.strongCount', { count: dashboard.routines.filter((routine) => routine.grade === "strong").length })}</small></summary>
          <p>{t('today.gradeSettingsCopy')}</p>
          <div className="routine-grade-list">
            {dashboard.routines.map((routine) => {
              const strongCount = dashboard.routines.filter((item) => item.grade === "strong").length;
              return <div className="routine-grade-row" key={routine.key}>
                <div className="routine-grade-main">
                  <span><b>{routine.title}</b><small>{t('today.weekdaySuffix', { days: routine.days.map((day) => dayLabels[day]).join("·") })}</small></span>
                <select aria-label={t('today.gradeAria', { routine: routine.title })} disabled={loading} value={routine.grade} onChange={(event) => changeRoutineGrade(routine.id, event.target.value as DailyRoutineGrade)}>
                  <option value="observation">{t('today.gradeObservationOption')}</option>
                  <option value="normal">{t('today.gradeNormalOption')}</option>
                  <option value="strong" disabled={routine.grade !== "strong" && strongCount >= 2}>{t('today.gradeStrongOption')}</option>
                  <option value="excluded">{t('today.gradeExcludedOption')}</option>
                </select>
                </div>
                <div className="dependency-picker" aria-label={t('today.dependencyAria', { routine: routine.title })}>
                  <small>{t('today.dependencyPrompt')}</small>
                  <div>{(Object.entries(dependencyLabels) as [DailyDependencyKind, string][]).map(([kind, label]) => <button className={routine.dependencyKinds.includes(kind) ? "selected" : ""} disabled={loading} key={kind} onClick={() => toggleDependency(routine.id, kind)}>{label}</button>)}</div>
                </div>
              </div>;
            })}
          </div>
        </details>}

        <section className="daily-checkins">
          <div className="daily-section-title">
            <div>
              <span className="section-label">{t('today.checkInLabel')}</span>
              <h2>{t('today.checkInTitle')}</h2>
            </div>
            <small>{t('today.twiceDaily')}</small>
          </div>
          <div className="checkin-grid">
            <button className={`checkin-card ${checkIn("morning")?.status === "completed" ? "done" : ""}`} disabled={loading || preferences?.morningEnabled === false} onClick={() => beginCheckIn("morning")}>
              <Sunrise />
              <span><b>{t('today.morningCheckIn')}</b><small>{preferences?.morningTime ?? "06:30"} · {checkIn("morning")?.status === "completed" ? t('today.statusCompleted') : checkIn("morning") ? t('today.continue') : t('today.begin')}</small></span>
              {checkIn("morning")?.status === "completed" && <Check />}
            </button>
            <button className={`checkin-card ${checkIn("closing")?.status === "completed" ? "done" : ""}`} disabled={loading || preferences?.closingEnabled === false} onClick={() => beginCheckIn("closing")}>
              <Moon />
              <span><b>{t('today.closingCheckIn')}</b><small>{preferences?.closingTime ?? "22:00"} · {checkIn("closing")?.status === "completed" ? t('today.statusCompleted') : checkIn("closing") ? t('today.continue') : t('today.begin')}</small></span>
              {checkIn("closing")?.status === "completed" && <Check />}
            </button>
          </div>
        </section>

        {(activeCheckIn || message) && <section className="daily-conversation">
          <div className="revision-head">
            <div className="assistant-avatar small">{t('app.mark')}</div>
            <div><b>{t('app.name')}</b><span>{activeCheckIn?.type === "closing" ? t('today.closingCheckIn') : activeCheckIn?.type === "morning" ? t('today.morningCheckIn') : t('today.recordLabel')}</span></div>
          </div>
          {message && <div className="daily-receipt"><AgentText text={message} /></div>}
          {activeCheckIn && <>
            <div className="checkin-progress"><span>{activeCheckIn.step + 1} / 3</span><i style={{ width: `${((activeCheckIn.step + 1) / 3) * 100}%` }} /></div>
            <AgentText text={`**${activeCheckIn.pendingQuestion}**`} />
            {!!activeCheckIn.choices.length && <div className="daily-choices">
              {activeCheckIn.choices.map((choice) => <button disabled={loading} key={choice} onClick={() => answer(choice)}>{choice}</button>)}
            </div>}
            <div className="revision-composer daily-composer">
              <textarea value={input} disabled={loading} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); answer(); }
              }} placeholder={t('today.talkPlaceholder')} rows={2} />
              <button aria-label={t('today.sendAnswer')} disabled={loading || !input.trim()} onClick={() => answer()}><Send /></button>
            </div>
          </>}
        </section>}

        {preferences && <details className="daily-settings">
          <summary>{t('today.checkInSettings')}</summary>
          <div className="daily-setting-grid">
            <label><span><input type="checkbox" checked={preferences.morningEnabled} onChange={(event) => setPreferences({ ...preferences, morningEnabled: event.target.checked })} /> {t('today.morningCheckIn')}</span><input type="time" value={preferences.morningTime} onChange={(event) => setPreferences({ ...preferences, morningTime: event.target.value })} /></label>
            <label><span><input type="checkbox" checked={preferences.closingEnabled} onChange={(event) => setPreferences({ ...preferences, closingEnabled: event.target.checked })} /> {t('today.closingCheckIn')}</span><input type="time" value={preferences.closingTime} onChange={(event) => setPreferences({ ...preferences, closingTime: event.target.value })} /></label>
          </div>
          <button className="button button-small" disabled={loading} onClick={savePreferences}>{t('today.saveForTimezone', { timezone: regionalTimeZoneLabel(state.regionalContext) })}</button>
        </details>}
      </div>
    </main>
  );
}
