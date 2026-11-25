import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowDown,
  ArrowRight,
  Clock3,
  MessageCircle,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { PlanItem, Profile } from "./model";
import type { AiDayBounds } from "./aiSchedule";
import {
  getAgentSessionId,
  forgetAgentMemory,
  loadAgentState,
  saveAgentFeedback,
  saveAgentState,
  savePlanRevision,
  deleteAgentSession,
} from "./agentMemory";
import { clearAgentSession, resetAgentSession, sessionFailureMessage, readSessionLocalState, writeSessionLocalState } from './agentSession';
import { canGenerateGoalPlan, emptyGoalCardFor, type GoalCard } from "./goalAgent";
import { generateWeeklyPlan, type GeneratedPlanItem } from "./planAgent";
import AgentText from "./AgentText";
import { talkToOnju, type DailyCheckInView, type DialogueView, type PendingGoalDraft } from "./unifiedAgent";
import { useChatScroll } from "./useChatScroll";
import {
  loadRegionalContext,
  orderedWeekdayIndices,
  regionalDateKey,
  regionalTimeZoneLabel,
  type UserRegionalContext,
} from "./regionalContext";
import { goalCategoryLabel, translator, uiLocale, weekdayLabels } from "./i18n";
import { useRegionalContext } from './useRegionalContext';
import { RegionalSettingsLink } from './RegionalSettings';

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

export default function ScheduleSetup({
  onComplete,
}: {
  onComplete: (p: Profile, plan: PlanItem[], regionalContext: UserRegionalContext) => void;
}) {
  const nav = useNavigate(),
    [initialSessionId] = useState(getAgentSessionId),
    sessionId = useRef(initialSessionId),
    saveQueue = useRef<Promise<void>>(Promise.resolve()),
    [regionalContext] = useRegionalContext(),
    [stage, setStage] = useState(0),
    [input, setInput] = useState(() => readSessionLocalState('onju-chat-input', initialSessionId) ?? ''),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [blocks, setBlocks] = useState<Block[]>([]),
    [pending, setPending] = useState<Block[]>([]),
    [dayBounds, setDayBounds] = useState<AiDayBounds[]>([]),
    [goal, setGoal] = useState(""),
    [reason, setReason] = useState(() => translator(loadRegionalContext())('setup.defaultReason')),
    [obstacle, setObstacle] = useState(() => translator(loadRegionalContext())('setup.defaultObstacle')),
    [responseId, setResponseId] = useState<string>(),
    [goalCard, setGoalCard] = useState<GoalCard>(() => emptyGoalCardFor(loadRegionalContext())),
    [goalDraft, setGoalDraft] = useState<PendingGoalDraft | null>(null),
    [dialogue, setDialogue] = useState<DialogueView>(),
    [dailyCheckIns, setDailyCheckIns] = useState<DailyCheckInView[]>([]),
    [goalResponseId, setGoalResponseId] = useState<string>(),
    [generatedPlan, setGeneratedPlan] = useState<GeneratedPlanItem[]>([]),
    [planResponseId, setPlanResponseId] = useState<string>(),
    [goalReady, setGoalReady] = useState(false),
    [loading, setLoading] = useState(false),
    [failedRequest, setFailedRequest] = useState<string>(),
    [failedTurnId, setFailedTurnId] = useState<string>(),
    [failedConfirmation, setFailedConfirmation] = useState<{draftId:string;includeRelated?:boolean}>(),
    [needsClarification, setNeedsClarification] = useState(false),
    [hydrated, setHydrated] = useState(false),
    [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">(
      "saved"
    );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState(() => translator(loadRegionalContext())('setup.loadingOrganize'));
  const [feedback, setFeedback] = useState<Record<string, -1 | 1>>({});
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const t = translator(regionalContext);
  const week = weekdayLabels(regionalContext);
  const opening = {
    title: t('setup.openingTitle'),
    question: t('setup.openingQuestion'),
    hint: t('setup.openingHint'),
  };
  const { historyRef, contentRef, onScroll, scrollToLatest, showLatest } = useChatScroll(`${messages.at(-1)?.id ?? ''}:${loading}:${suggestions.join('|')}`, hydrated);
  useEffect(() => {
    let active = true;
    loadAgentState(sessionId.current)
      .then((saved) => {
        if (!active) return;
        if (saved) {
          // Server rows may contain migration defaults, not a user's selection.
          // Device preferences remain authoritative for this browser.
          const savedRegionalContext = loadRegionalContext();
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
          const savedT = translator(savedRegionalContext);
          setReason(saved.reason || savedT('setup.defaultReason'));
          setObstacle(saved.obstacle || savedT('setup.defaultObstacle'));
          setResponseId(saved.responseId);
          setGoalCard(
            saved.goalCard && Object.keys(saved.goalCard).length
              ? saved.goalCard
              : emptyGoalCardFor(savedRegionalContext)
          );
          setGoalResponseId(saved.goalResponseId);
          setGoalDraft(saved.goalDraft ?? null);
          setDialogue(saved.dialogue);
          setDailyCheckIns(saved.dailyCheckIns ?? []);
          setSuggestions(saved.suggestions ?? []);
          setGeneratedPlan(saved.generatedPlan ?? []);
          setPlanResponseId(saved.planResponseId);
          setGoalReady(canGenerateGoalPlan(saved.goalCard));
          setNeedsClarification(false);
        }
        setHydrated(true);
      })
      .catch((error: unknown) => {
        if (active) {
          setSaveStatus("offline");
          const code = error instanceof Error ? error.message : '';
          setLoadError(sessionFailureMessage(code, regionalContext.locale) || (uiLocale(regionalContext) === 'en-US' ? 'Could not load your conversation. Your input is kept; please retry.' : '대화를 불러오지 못했어요. 입력은 보존했어요. 다시 불러와 주세요.'));
          setHydrated(false);
        }
      });
    return () => {
      active = false;
    };
  // Rehydrate only on explicit retry, not whenever the region is restored.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAttempt]);
  useEffect(() => {
    try { writeSessionLocalState('onju-chat-input', sessionId.current, input); } catch { /* Keep the in-memory input. */ }
  }, [input]);
  useEffect(() => {
    if (!hydrated || loading || failedRequest) return;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveAgentState(sessionId.current, {
        regionalContext,
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
    regionalContext,
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
  const sendInFlight = useRef(false);
  const lastRegionalRequest = useRef<{ turnId: string; context: typeof regionalContext } | null>(null);
  const send = async (text = input, confirmation?: { draftId: string; includeRelated?: boolean }, retryTurnId?: string) => {
    const message = text.trim();
    if (!message || loading || !hydrated || sendInFlight.current) return;
    sendInFlight.current = true;
    const turnId = retryTurnId ?? crypto.randomUUID();
    const turnContext = retryTurnId && lastRegionalRequest.current?.turnId === retryTurnId ? lastRegionalRequest.current.context : regionalContext;
    lastRegionalRequest.current = { turnId, context: turnContext };
    setRevealingId(null);
    setStreamingMessageId(null);
    setLoadingLabel(t('setup.loadingUnderstand'));
    scrollToLatest();
    setMessages((previous) => [
      ...(failedRequest ? previous.slice(0, -2) : previous),
      { id: crypto.randomUUID(), role: "user", text: message },
    ]);
    setInput("");
    setSuggestions([]);
    setFailedRequest(undefined);
    setFailedTurnId(undefined);
    setFailedConfirmation(undefined);
    setLoading(true);
    setNeedsClarification(false);
    try {
      await saveQueue.current;
      let streamed = "";
      let liveReplyId: string = crypto.randomUUID();
      const result = await talkToOnju(sessionId.current, message, confirmation, {
        turnId,
        regionalContext: turnContext,
        onEvent: event => {
          if (event.type === "status") setLoadingLabel(event.message || t('setup.loadingReply'));
          if (event.type === "meta" && event.assistantMessageId) liveReplyId = event.assistantMessageId;
          if (event.type === "delta") {
            streamed += event.text;
            setStreamingMessageId(liveReplyId);
            setMessages(previous => {
              const index = previous.findIndex(item => item.id === liveReplyId);
              if (index < 0) return [...previous, { id: liveReplyId, role: "assistant", text: streamed }];
              return previous.map((item, itemIndex) => itemIndex === index ? { ...item, text: streamed } : item);
            });
          }
        },
      });
      setResponseId(result.response_id);
      setNeedsClarification(result.needs_clarification);
      setSuggestions(result.suggestions ?? []);
      const replyId = result.assistant_message_id ?? crypto.randomUUID();
      if (!streamed) setRevealingId(replyId);
      setMessages(previous => {
        const liveIndex = previous.findIndex(item => item.id === liveReplyId);
        if (liveIndex >= 0) return previous.map((item, index) => index === liveIndex ? { id: replyId, role: "assistant", text: result.assistant_message } : item);
        return [...previous, { id: replyId, role: "assistant", text: result.assistant_message }];
      });
      setBlocks(result.state.blocks.map((block) => ({...block,id:crypto.randomUUID(),pending:false})));
      setDayBounds(result.state.dayBounds);
      setGoalCard(result.state.goalCard);
      setGoalDraft(result.state.goalDraft ?? null);
      setDialogue(result.state.dialogue);
      setDailyCheckIns(result.state.dailyCheckIns ?? []);
      // A response may have started before a setting change. It cannot change preferences.
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
      setInput(message);
      setFailedRequest(message);
      setFailedTurnId(turnId);
      setFailedConfirmation(confirmation);
      setPending([]);
      setSuggestions([]);
      const detail = error instanceof Error ? error.message : "";
      const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: sessionFailureMessage(errorCode, regionalContext.locale) || sessionFailureMessage(detail, regionalContext.locale) || (uiLocale(regionalContext) === 'ko-KR' && (detail.startsWith("요청이 잠시") || detail.startsWith("온주") || detail.startsWith('이 대화') || detail.startsWith('만료되거나'))
            ? detail
            : t('setup.connectionError')),
        },
      ]);
    } finally {
      setStreamingMessageId(null);
      sendInFlight.current = false;
      setLoading(false);
    }
  };
  const rateMessage = async (messageId: string, rating: -1 | 1) => {
    const previous = feedback[messageId];
    setFeedback(current => ({ ...current, [messageId]: rating }));
    try {
      await saveAgentFeedback(sessionId.current, messageId, rating);
    } catch {
      setFeedback(current => {
        const next = { ...current };
        if (previous) next[messageId] = previous;
        else delete next[messageId];
        return next;
      });
    }
  };
  const removeMemory = async (memoryId: string) => {
    const next = await forgetAgentMemory(sessionId.current, memoryId);
    setDialogue(next);
  };
  const finish = async () => {
    if (loading || !hydrated) return;
    setLoading(true);
    try {
      const result = await generateWeeklyPlan({
        sessionId: sessionId.current,
        goalCard,
        scheduleBlocks: blocks.map(({ days, title, start, end, kind }) => ({
          days,
          title,
          start,
          end,
          kind,
        })),
        dayBounds: dayBounds.filter(bound => bound.wake && bound.bedtime && !bound.variable),
        regionalContext,
      });
      setGeneratedPlan(result.items);
      setPlanResponseId(result.response_id);
      const profile = {
        goal: goalCard.outcome || goal,
        reason: goalCard.identity || reason,
        obstacle: goalCard.recoveryRule || obstacle,
        availableTime: t('setup.availableTime'),
        checkinTime: t('setup.checkInTime'),
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
      // Explicit plan saving remains available when conversation auto-save is
      // server-managed. Never depend on a pending component effect on navigation.
      await saveQueue.current;
      await savePlanRevision(sessionId.current, { plan, pendingPlan: [], history: [], responseId: result.response_id });
      const map = {
        locale: regionalContext.locale,
        countryCode: regionalContext.countryCode,
        currencyCode: regionalContext.currencyCode,
        weekStartsOn: regionalContext.weekStartsOn,
        timeZone: regionalContext.timeZone,
        weekOf: regionalDateKey(regionalContext),
        blocks,
        dayBounds,
        goalCard,
        plan,
      };
      writeSessionLocalState("onju-week-map", sessionId.current, JSON.stringify(map));
      await saveAgentState(sessionId.current, {
        regionalContext,
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
      onComplete(profile, plan, regionalContext);
      nav("/plan");
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: t('setup.planError'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };
  if (!hydrated && !loadError)
    return (
      <main className="schedule-setup setup-loading">
        <div className="assistant-avatar">{t('app.mark')}</div>
        <p>{t('setup.hydrating')}</p>
      </main>
    );
  return (
    <main className="schedule-setup">
      <header className="setup-header">
        <button aria-label={t('setup.home')} onClick={() => nav("/")}>
          <ArrowLeft />
        </button>
        <div>
          <b>{t('setup.title')}</b>
          <span>
            <RegionalSettingsLink /> · {regionalTimeZoneLabel(regionalContext)} · {t('setup.organizing')} ·{" "}
            {saveStatus === "saved"
              ? t('setup.saved')
              : saveStatus === "saving"
              ? t('setup.saving')
              : t('setup.offline')}
          </span>
        </div>
        <button className="save-exit" onClick={() => nav("/")}>
          {t('setup.later')}
        </button>
      </header>
      <div className="schedule-layout">
        <section className="setup-panel chat-setup">
          <div className="chat-top">
            <div className="assistant-avatar small">{t('app.mark')}</div>
            <div>
              <b>{t('app.name')}</b>
              <span>
                {t('setup.partner', { timezone: regionalTimeZoneLabel(regionalContext) })}
              </span>
            </div>
          </div>
          {loadError && <div role="alert" className="assistant-question">
            <p>{loadError}</p>
            <button onClick={() => { setLoadError(''); setHydrated(false); setLoadAttempt(value => value + 1); }}>{uiLocale(regionalContext) === 'en-US' ? 'Retry loading' : '다시 불러오기'}</button>
            <button onClick={() => {
              if (!window.confirm(uiLocale(regionalContext) === 'en-US' ? 'Start a new conversation? The previous conversation will not be deleted.' : '이전 대화는 삭제하지 않고 새 대화를 시작할까요?')) return;
              const nextId = resetAgentSession();
              writeSessionLocalState('onju-chat-input', nextId, input);
              window.location.assign('/setup');
            }}>{uiLocale(regionalContext) === 'en-US' ? 'Start new conversation' : '새 대화로 시작'}</button>
          </div>}
          <button disabled={loading} className="save-exit" onClick={async () => {
            if (!window.confirm(uiLocale(regionalContext) === 'en-US' ? 'Delete this session and its linked records? This cannot be undone.' : '이 대화와 연결된 기록을 삭제할까요? 삭제하면 복구할 수 없어요.')) return;
            setLoading(true);
            setHydrated(false);
            try {
              await saveQueue.current.catch(() => {});
              await deleteAgentSession(sessionId.current);
              for (const key of ['onju-web-alpha', 'onju-week-map', 'onju-chat-input']) {
                localStorage.removeItem(`${key}:${sessionId.current}`);
                if (localStorage.getItem(`${key}:legacy-owner`) === sessionId.current) {
                  localStorage.removeItem(key);
                  localStorage.removeItem(`${key}:legacy-owner`);
                }
              }
              clearAgentSession();
              window.location.assign('/setup');
            } catch {
              setLoadError(uiLocale(regionalContext) === 'en-US' ? 'Deletion was not confirmed. Saving is paused. Retry the delete action.' : '삭제 완료를 확인하지 못했어요. 저장을 중지했어요. 삭제 버튼으로 다시 시도해 주세요.');
              setLoading(false);
            }
          }}>{uiLocale(regionalContext) === 'en-US' ? 'Delete this conversation' : '이 대화 삭제'}</button>
          <p className="setup-purpose">
            {t('setup.purpose')}
          </p>
          <div className="conversation-viewport">
          <div className="conversation-history" ref={historyRef} onScroll={onScroll}
            role="log" aria-label={t('setup.chatAria')} aria-live="polite" aria-relevant="additions" tabIndex={0}>
          <div className="conversation-content" ref={contentRef}>
            {messages.length === 0 && (
            <div className="assistant-question">
              <span>{opening.title}</span>
              <h1>{opening.question}</h1>
              <AgentText text={opening.hint} />
            </div>
            )}
            {messages.map((message) => (
              <div
                className={
                  message.role === "user" ? "user-bubble" : "assistant-bubble"
                }
                key={message.id}
                aria-busy={message.id === revealingId || undefined}
              >
                {message.role === "assistant" ? <AgentText text={message.text} animate={message.id === revealingId}
                  onRevealComplete={() => setRevealingId(id => id === message.id ? null : id)} /> : message.text}
                {message.role === "assistant" && message.id !== streamingMessageId && message.text !== t('setup.connectionError') && (
                  <div className="agent-feedback" aria-label={t('setup.feedbackAria')}>
                    <button className={feedback[message.id] === 1 ? "selected" : ""} aria-label={t('setup.helpful')} onClick={() => rateMessage(message.id, 1)}><ThumbsUp size={14} /></button>
                    <button className={feedback[message.id] === -1 ? "selected" : ""} aria-label={t('setup.notHelpful')} onClick={() => rateMessage(message.id, -1)}><ThumbsDown size={14} /></button>
                  </div>
                )}
              </div>
            ))}
            {loading && !streamingMessageId && (
              <div
                className="assistant-bubble typing"
                aria-label={t('setup.thinking')}
              >
                <i />
                <i />
                <i />
                <span>{loadingLabel}</span>
              </div>
            )}
          {suggestions.length > 0 && !revealingId && (
            <div className="suggestions agent-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  disabled={loading}
                  key={suggestion}
                  onClick={() => send(suggestion, goalDraft && [t('setup.confirmDraft'), t('setup.confirmRelated'), '이 초안으로 시작할게요', '관련 조건도 함께 조정할게요'].includes(suggestion) ? { draftId: goalDraft.id, includeRelated: [t('setup.confirmRelated'), '관련 조건도 함께 조정할게요'].includes(suggestion) } : undefined)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {failedRequest && !loading && <div className="suggestions agent-suggestions">
            <button onClick={() => send(failedRequest,failedConfirmation,failedTurnId)}>{t('setup.retry')}</button>
          </div>}
          </div>
          </div>
          {showLatest && <button className="latest-message" onClick={scrollToLatest}>
            <ArrowDown size={16} /> {t('setup.latest')}
          </button>}
          </div>
          <div className="chat-input-area">
          {revealingId && <button className="reveal-skip" onClick={() => setRevealingId(null)}>{t('setup.showAll')}</button>}
          <div className="composer large">
            <textarea
              aria-label={t('setup.messageAria')}
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
                  ? t('setup.clarificationPlaceholder')
                  : t('setup.placeholder')
              }
              rows={2}
            />
            <button
              aria-label={t('setup.send')}
              disabled={!input.trim() || loading || !hydrated}
              onClick={() => send()}
            >
              <Send />
            </button>
          </div>
          <p className="composer-hint">{t('setup.composerHint')}</p>
          </div>
        </section>
        <aside className="map-sidebar">
          <button className="map-toggle" aria-expanded={mapOpen} aria-controls="setup-map" onClick={() => setMapOpen(!mapOpen)}>
            <Clock3 size={17} /> {goalCard.outcome || goalDraft ? t('setup.mapAndGoal') : t('setup.timeMap')} · {t('setup.scheduleCount', { count: blocks.length })} <span>{mapOpen ? t('setup.collapse') : t('setup.view')}</span>
          </button>
          <div id="setup-map" className={`map-content ${mapOpen ? 'is-open' : ''}`}>
        <WeekMap
          blocks={blocks}
          dayBounds={dayBounds}
          regionalContext={regionalContext}
          remove={(id) => setBlocks(blocks.filter((b) => b.id !== id))}
        />
          {(goalCard.outcome || goalDraft) && (
            <GoalDraft regionalContext={regionalContext} card={goalDraft?.card ?? goalCard} draft={goalDraft} pending={!!goalDraft} confirmed={goalReady} ready={goalReady && dayBounds.some(b => b.wake && b.bedtime && !b.variable)} loading={loading || !!revealingId}
              onConfirm={() => goalDraft && send(goalDraft.related ? t('setup.confirmRelated') : t('setup.confirmDraft'), { draftId: goalDraft.id,includeRelated:!!goalDraft.related })} onFinish={finish} />
          )}
          {!!dialogue?.memory.length && <AgentMemoryPanel regionalContext={regionalContext} memory={dialogue.memory} onForget={removeMemory} />}
          {!!dailyCheckIns.length && <DailyCheckInPanel regionalContext={regionalContext} items={dailyCheckIns} />}
          </div>
        </aside>
      </div>
    </main>
  );
}

function GoalDraft({
  regionalContext,
  card,
  draft,
  ready,
  loading,
  onFinish,
  pending,
  confirmed,
  onConfirm,
}: {
  regionalContext: UserRegionalContext;
  card: GoalCard;
  draft: PendingGoalDraft | null;
  ready: boolean;
  loading: boolean;
  onFinish: () => void;
  pending: boolean;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const t = translator(regionalContext);
  return (
    <section className="goal-draft">
      <div className="goal-draft-head">
        <span>{goalCategoryLabel(regionalContext, card.category)}</span>
        <b>{pending ? t('goal.pending') : confirmed ? t('goal.confirmed') : t('goal.organizing')}</b>
      </div>
      {!!draft?.changes?.length && <div className="goal-change-summary">
        <strong>{t('goal.changesFrom', { base: draft.baseLabel || t('goal.previous') })}</strong>
        <ul>{draft.changes.map((change,i)=><li key={i}><b>{change.label}</b><span>{change.before} → <strong>{change.after}</strong></span></li>)}</ul>
      </div>}
      <details className="goal-draft-details">
      <summary>{card.outcome}</summary>
      {card.durationWeeks > 0 && (
        <p className="goal-period">
          {t('goal.trialWeeks', { count: card.durationWeeks })}{card.deadline ? ` · ${card.deadline}` : ''}
        </p>
      )}
      <dl>
        {card.targetMetric && (
          <>
            <dt>{t('goal.resultMetric')}</dt>
            <dd>{card.targetMetric}</dd>
          </>
        )}
        {card.baselineMetric && (
          <>
            <dt>{t('goal.baseline')}</dt>
            <dd>{card.baselineMetric}</dd>
          </>
        )}
        {card.weeklyActions.length > 0 && (
          <>
            <dt>{t('goal.weeklySystem')}</dt>
            <dd>
              {card.weeklyActions
                .map(
                  (action) =>
                    t('goal.actionSummary', { title: action.title, frequency: action.frequencyPerWeek, minutes: action.durationMinutes })
                )
                .join(" / ")}
            </dd>
          </>
        )}
        {!card.execution && card.tinyStart && (
          <>
            <dt>{t('goal.tinyStart')}</dt>
            <dd>{card.tinyStart}</dd>
          </>
        )}
        {card.cue && (
          <>
            <dt>{t('goal.cue')}</dt>
            <dd>{card.cue}</dd>
          </>
        )}
        {card.execution && <>
          {card.execution.progressStrategy && <><dt>{t('goal.progressStrategy')}</dt><dd>{card.execution.progressStrategy}</dd></>}
          {card.execution.actions.some(guide=>guide.steps?.length) && <><dt>{t('goal.dayGuide')}</dt><dd>{card.execution.actions.map((guide,i)=>guide.steps?.length ? <div key={i}><strong>{card.weeklyActions[i].title}</strong><p>{t('goal.goalLabel', { goal: guide.goalResult ?? '' })}</p><ol>{guide.steps.map((step,j)=><li key={j}>{step}</li>)}</ol></div> : null)}</dd></>}
          <dt>{t('goal.completion')}</dt>
          <dd><ul className="goal-execution-list">{card.execution.actions.map((guide,i)=><li key={i}><strong>{card.weeklyActions[i].title}</strong><span>{t('goal.plannedCompletion', { minutes: card.weeklyActions[i].durationMinutes, criterion: guide.completionCriterion })}</span></li>)}</ul></dd>
          <dt>{t('goal.minimum')}</dt>
          <dd><ul className="goal-execution-list">{card.execution.actions.map((guide,i)=><li key={i}><strong>{card.weeklyActions[i].title}</strong><span>{t('goal.minimumSummary', { action: guide.minimumAction, minutes: guide.minimumMinutes })}</span></li>)}</ul><small>{t('goal.minimumNote')}</small></dd>
          <dt>{t('goal.review')}</dt><dd>{card.reviewCycle}</dd>
        </>}
        {!card.execution && card.fallbackAction && (
          <>
            <dt>{t('goal.fallback')}</dt>
            <dd>{card.fallbackAction}</dd>
          </>
        )}
        {card.recoveryRule && (
          <>
            <dt>{t('goal.recovery')}</dt>
            <dd>{card.recoveryRule}</dd>
          </>
        )}
      </dl>
      </details>
      <p className="goal-period">{t('goal.weeklyMinutes', { minutes: card.weeklyActions.reduce((sum,a)=>sum+a.frequencyPerWeek*a.durationMinutes,0) })}</p>
      {draft?.related && <div className="goal-related-review">
        <strong>{t('goal.related')}</strong><p>{draft.related.reason}</p>
        <ul>{draft.related.changes.map((change,i)=><li key={i}><b>{change.label}</b><span>{change.before} → <strong>{change.after}</strong></span></li>)}</ul>
        <p>{t('goal.relatedCopy')}</p>
      </div>}
      {pending ? (
        <button className="button full" disabled={loading} onClick={onConfirm}>{draft?.related ? t('setup.confirmRelated') : t('setup.confirmDraft')} <ArrowRight size={18} /></button>
      ) : ready ? (
        <button className="button full" disabled={loading} onClick={onFinish}>
          {loading ? t('goal.preparing') : t('goal.makeWeekly')} <ArrowRight size={18} />
        </button>
      ) : (
        <p className="goal-draft-note">
          {confirmed ? t('goal.needsRhythm') : t('goal.tellChange')}
        </p>
      )}
    </section>
  );
}

function AgentMemoryPanel({ regionalContext, memory, onForget }: {
  regionalContext: UserRegionalContext;
  memory: DialogueView["memory"];
  onForget: (id: string) => Promise<void>;
}) {
  const t = translator(regionalContext);
  return <details className="agent-memory-panel">
    <summary>{t('memory.title')} <span>{memory.length}</span></summary>
    <p>{t('memory.copy')}</p>
    <ul>{memory.map(item => <li key={item.id}>
      <span><b>{item.note}</b><small>{item.scope === "temporary" ? t('memory.temporary') : t('memory.durable')}</small></span>
      <button aria-label={t('memory.remove', { note: item.note })} onClick={() => onForget(item.id)}><Trash2 size={15} /></button>
    </li>)}</ul>
  </details>;
}

function DailyCheckInPanel({ regionalContext, items }: { regionalContext: UserRegionalContext; items: DailyCheckInView[] }) {
  const t = translator(regionalContext);
  const latest = items.at(-1);
  if (!latest) return null;
  return <details className="daily-checkin-panel">
    <summary>{t('checkIn.recent')} <span>{latest.date}</span></summary>
    {!!latest.completed.length && <p><b>{t('checkIn.completed')}</b> {latest.completed.join(" · ")}</p>}
    {!!latest.missed.length && <p><b>{t('checkIn.adjustNext')}</b> {latest.missed.join(" · ")}</p>}
    {latest.energy && <p><b>{t('checkIn.energy')}</b> {latest.energy}/5</p>}
    {latest.blocker && <p><b>{t('checkIn.blocker')}</b> {latest.blocker}</p>}
    {latest.adjustment && <p><b>{t('checkIn.adjustment')}</b> {latest.adjustment}</p>}
  </details>;
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
  regionalContext,
  remove,
}: {
  blocks: Block[];
  dayBounds: AiDayBounds[];
  regionalContext: UserRegionalContext;
  remove: (id: string) => void;
}) {
  const t = translator(regionalContext);
  const week = weekdayLabels(regionalContext);
  return (
    <aside className="week-map">
      <div className="week-map-head">
        <div>
          <span className="section-label">{t('map.realtime')}</span>
          <h2>{t('map.thisWeek', { timezone: regionalTimeZoneLabel(regionalContext) })}</h2>
        </div>
        <span className="available-chip">
          {dayBounds.length ? t('map.rhythmApplied') : t('map.beforeRhythm')}
        </span>
      </div>
      <div className="kst-notice">
        <Clock3 />
        {dayBounds.length
          ? t('map.knownOnly')
          : t('map.tellRhythm')}
      </div>
      {dayBounds.length > 0 && (
        <div className="rhythm-summary">
          {dayBounds.map((bound, index) => (
            <span key={`${bound.days.join("-")}-${index}`}>
              <b>{bound.days.map((day) => week[day]).join("·")}</b>{" "}
              {t('map.wakeSleep', { wake: bound.wake || t('map.unknown'), bedtime: bound.bedtime || t('map.unknown') })}{" "}
              {bound.deferred ? <em>{t('map.later')}</em> : bound.variable && <em>{t('map.variable')}</em>}
            </span>
          ))}
        </div>
      )}
      <div className="week-columns">
        {orderedWeekdayIndices(regionalContext).map((index) => (
          <div className="day-column" key={index}>
            <b>{week[index]}</b>
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
                    ? t('map.noSchedule')
                    : t('map.beforeRhythm')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="map-legend">
        <span>
          <i className="fixed" />
          {t('map.fixed')}
        </span>
        <span>
          <i className="variable" />
          {t('map.currentWeek')}
        </span>
        <span>
          <i className="recovery" />
          {t('map.recovery')}
        </span>
      </div>
      <div className="map-insight">
        <MessageCircle />
        <p>
          <b>{t('map.insightTitle')}</b>
          <br />
          {dayBounds.some((bound) => bound.variable)
            ? t('map.variableCopy')
            : t('map.scheduleCopy', { count: blocks.length })}
        </p>
      </div>
    </aside>
  );
}
