import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Lock, Check, Eye, X, TreePine, Users, UserCircle, Sparkles } from 'lucide-react';
import { useThemeStore, THEME_TIERS, TIER_LEVEL, type ThemeTier } from '../store/themeStore';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { STAGE_NAMES, STAGE_THRESHOLDS, type TreeGrowth } from '../utils/treeGrowth';
import TreeVisual from '../components/tree/TreeVisual';
import { AmbienceLayer, TierBackdrop } from '../components/tree/ThemeAmbience';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } } as const;
const itemV = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

/** 숲 테마 보상 트랙 — 나무 성장 단계마다 테마가 열리는 여정을 한눈에 */
export default function ThemeRewards() {
  const navigate = useNavigate();
  const growth = useTreeGrowth();
  const { theme, setTheme } = useThemeStore();
  const [previewTier, setPreviewTier] = useState<ThemeTier | null>(null);

  const nextTier = THEME_TIERS.find(t => t.requiredStage === growth.stage + 1);
  const remaining = growth.nextThreshold !== null ? growth.nextThreshold - growth.points : 0;

  return (
    <div className="pb-6">
      <motion.div variants={container} initial="hidden" animate="show">
        {/* 헤더 */}
        <motion.div variants={itemV} className="flex items-center gap-2 px-4 pt-4 pb-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.1 }}
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 text-label-alt"
          >
            <ChevronLeft size={24} />
          </motion.button>
          <h1 className="text-heading2 font-bold text-label-strong font-brand">숲 테마</h1>
        </motion.div>

        {/* 성장 현황 히어로 */}
        <motion.div variants={itemV} className="mx-4 rounded-3xl p-4 flex items-center gap-3" style={{ background: 'var(--gradient-hero)' }}>
          <TreeVisual stage={growth.stage} health={growth.health} size={88} />
          <div className="flex-1 min-w-0">
            <p className="text-caption1 text-label-alt">나의 나무</p>
            <p className="text-body1 font-bold text-label-strong">{growth.stageName} · {growth.points}pt</p>
            {nextTier ? (
              <>
                <div className="h-2 bg-surface rounded-full mt-2 overflow-hidden border border-line-soft">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${growth.progressToNext * 100}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <p className="text-caption2 text-label-alt mt-1.5">
                  다음 보상 '{nextTier.name}'까지 <span className="font-bold text-primary">{remaining}pt</span>
                </p>
              </>
            ) : (
              <p className="text-caption2 text-label-alt mt-1.5">모든 테마를 해금했어요 🎉</p>
            )}
          </div>
        </motion.div>

        {/* 보상 트랙 */}
        <motion.div variants={itemV} className="px-4 mt-6 mb-3">
          <p className="text-body2 font-bold text-label-strong">성장 보상</p>
          <p className="text-caption1 text-label-assistive mt-0.5">나무와 함께 온주의 풍경도 자라요 — 들녘에서 황금숲까지</p>
        </motion.div>

        <motion.div variants={itemV} className="px-4">
          {THEME_TIERS.map((tier, i) => (
            <TierRow
              key={tier.id}
              tier={tier}
              growth={growth}
              isActive={theme === tier.id}
              isLast={i === THEME_TIERS.length - 1}
              onPreview={() => setPreviewTier(tier)}
              onApply={() => setTheme(tier.id)}
            />
          ))}
        </motion.div>
      </motion.div>

      <ThemePreviewModal tier={previewTier} growth={growth} onClose={() => setPreviewTier(null)} />
    </div>
  );
}

/** 보상 트랙 한 칸 — 마커·연결선 + 테마 보상 카드 */
function TierRow({
  tier, growth, isActive, isLast, onPreview, onApply,
}: {
  tier: ThemeTier;
  growth: TreeGrowth;
  isActive: boolean;
  isLast: boolean;
  onPreview: () => void;
  onApply: () => void;
}) {
  const unlocked = growth.stage >= tier.requiredStage;
  const isNext = !unlocked && tier.requiredStage === growth.stage + 1;
  // 이 마커 아래 연결선 채움 비율: 지난 구간 100%, 현재 구간은 진행도만큼
  const segFill = growth.stage > tier.requiredStage ? 1 : growth.stage === tier.requiredStage ? growth.progressToNext : 0;
  const remaining = Math.max(0, STAGE_THRESHOLDS[tier.requiredStage] - growth.points);

  return (
    <div className="flex gap-3">
      {/* 마커 + 연결선 */}
      <div className="flex flex-col items-center">
        {unlocked ? (
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Check size={14} className="text-white" strokeWidth={3} />
          </div>
        ) : isNext ? (
          <div className="w-7 h-7 rounded-full border-2 border-primary bg-surface flex items-center justify-center flex-shrink-0">
            <motion.div
              className="w-2.5 h-2.5 rounded-full bg-primary"
              animate={{ scale: [1, 1.35, 1], opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-fill border border-line flex items-center justify-center flex-shrink-0">
            <Lock size={12} className="text-label-assistive" />
          </div>
        )}
        {!isLast && (
          <div className="w-1 flex-1 my-1.5 rounded-full bg-line/60 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full bg-primary rounded-full" style={{ height: `${segFill * 100}%` }} />
          </div>
        )}
      </div>

      {/* 보상 카드 */}
      <div className={`flex-1 mb-5 rounded-2xl border bg-surface p-4 ${unlocked || isNext ? 'border-line-soft shadow-sm' : 'border-line-soft/70'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption2 font-bold tracking-wide" style={{ color: tier.preview.accent }}>
            {tier.requiredStage === 0 ? '이야기의 시작' : `${STAGE_NAMES[tier.requiredStage]} 보상 · ${STAGE_THRESHOLDS[tier.requiredStage]}pt`}
          </span>
          {isActive ? (
            <span className="text-caption2 font-bold text-white bg-primary px-2 py-0.5 rounded-full flex-shrink-0">적용 중</span>
          ) : unlocked ? (
            <span className="text-caption2 font-bold text-primary bg-primary-soft px-2 py-0.5 rounded-full flex-shrink-0">해금됨</span>
          ) : isNext ? (
            <span className="text-caption2 font-bold text-label-alt bg-fill px-2 py-0.5 rounded-full flex-shrink-0">{remaining}pt 남음</span>
          ) : (
            <span className="text-caption2 font-bold text-label-assistive bg-fill px-2 py-0.5 rounded-full flex-shrink-0">잠김</span>
          )}
        </div>

        <div className={`flex items-center gap-2.5 mt-2.5 ${unlocked ? '' : 'opacity-65'}`}>
          <ThemeSwatch tier={tier} />
          <div className="min-w-0">
            <p className="text-body2 font-bold text-label-strong">{tier.name}</p>
            <p className="text-caption2 text-label-alt">{tier.description.split(' — ')[0]}</p>
          </div>
        </div>

        {/* 이 티어에서 얻는 것 — 효과 칩 */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {tier.perks.map(perk => (
            <span key={perk} className="inline-flex items-center gap-1 text-caption2 font-semibold bg-fill text-label-alt px-2 py-1 rounded-lg">
              <Sparkles size={10} style={{ color: tier.preview.accent }} /> {perk}
            </span>
          ))}
          {tier.requiredStage >= 2 && (
            <span className="text-caption2 font-semibold bg-primary-soft text-primary px-2 py-1 rounded-lg">
              + 이전 효과 포함
            </span>
          )}
        </div>

        {/* 다음 보상까지 진행바 */}
        {isNext && (
          <div className="h-1.5 bg-fill rounded-full overflow-hidden mt-3">
            <div className="h-full bg-primary rounded-full" style={{ width: `${growth.progressToNext * 100}%` }} />
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.1 }}
            onClick={onPreview}
            className="flex-1 flex items-center justify-center gap-1.5 bg-fill rounded-xl py-2.5 text-caption1 font-bold text-label"
          >
            <Eye size={13} /> 미리보기
          </motion.button>
          {unlocked && !isActive && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.1 }}
              onClick={onApply}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-caption1 font-bold"
            >
              적용하기
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 테마 색 견본 타일 */
function ThemeSwatch({ tier }: { tier: ThemeTier }) {
  return (
    <div
      className="w-11 h-11 rounded-xl border flex flex-col items-center justify-center gap-1 flex-shrink-0"
      style={{ backgroundColor: tier.preview.bg, borderColor: `${tier.preview.accent}33` }}
    >
      <div className="w-5 h-1.5 rounded-full" style={{ backgroundColor: tier.preview.leaf }} />
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tier.preview.accent }} />
    </div>
  );
}

/** 테마 미리보기 모달 — data-theme 래퍼로 실제 테마 변수를 입힌 미니 화면 */
function ThemePreviewModal({ tier, growth, onClose }: { tier: ThemeTier | null; growth: TreeGrowth; onClose: () => void }) {
  const { theme, setTheme } = useThemeStore();

  return (
    <AnimatePresence>
      {tier && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="bg-surface rounded-3xl p-5 w-full max-w-xs shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: tier.preview.accent }} />
                <p className="text-body1 font-bold text-label-strong">'{tier.name}' 미리보기</p>
              </div>
              <button onClick={onClose} className="p-1 -mr-1 text-label-assistive">
                <X size={18} />
              </button>
            </div>

            <MockScreen tier={tier} />

            {TIER_LEVEL[tier.id] >= 1 && (
              <p className="text-caption2 text-label-alt text-center mt-2.5">
                ✨ {tier.perks.slice(1).join(' · ')}
                {TIER_LEVEL[tier.id] >= 2 ? ' · 이전 단계 효과 포함' : ''}
              </p>
            )}

            <div className="mt-4">
              {growth.stage >= tier.requiredStage ? (
                theme === tier.id ? (
                  <div className="w-full bg-primary-soft text-primary font-bold py-3 rounded-2xl text-body2 text-center">
                    현재 적용 중인 테마예요
                  </div>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.1 }}
                    onClick={() => { setTheme(tier.id); onClose(); }}
                    className="w-full bg-primary text-white font-bold py-3 rounded-2xl text-body2"
                  >
                    이 테마 적용하기
                  </motion.button>
                )
              ) : (
                <div className="w-full flex items-center justify-center gap-1.5 bg-fill rounded-2xl py-3">
                  <Lock size={13} className="text-label-assistive" />
                  <span className="text-caption1 font-bold text-label-alt">
                    {STAGE_NAMES[tier.requiredStage]} 달성 시 적용 가능 · {Math.max(0, STAGE_THRESHOLDS[tier.requiredStage] - growth.points)}pt 남음
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 미니 앱 화면 목업 — 래퍼의 data-theme이 CSS 변수를 덮어써 실제 색으로 렌더링된다 */
function MockScreen({ tier }: { tier: ThemeTier }) {
  return (
    <div data-theme={tier.id} className="rounded-2xl overflow-hidden border border-line-soft select-none pointer-events-none" aria-hidden>
      <div className="bg-surface-alt relative">
        {/* 콘텐츠 영역 — 하단에 티어 배경 장식(풀숲·실루엣)이 깔린다 */}
        <div className="relative">
          {/* 헤더 + 나무 히어로 */}
          <div className="px-3.5 pt-3.5 pb-3" style={{ background: 'var(--gradient-hero)' }}>
            <p className="text-caption2 font-bold text-label-strong font-brand mb-2">온주</p>
            <div className="bg-surface rounded-xl p-2.5 flex items-center gap-2.5 shadow-sm">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--gradient-canopy)' }}>
                <TreePine size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption2 font-bold text-label-strong">나의 나무 · 새싹</p>
                <div className="h-1.5 bg-fill rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full w-3/5 rounded-full bg-primary" />
                </div>
              </div>
            </div>
          </div>

          {/* 루틴 리스트 + 버튼 */}
          <div className="px-3.5 py-3 flex flex-col gap-2">
            <MockRow label="아침 기도" checked />
            <MockRow label="성경 한 장 읽기" />
            <div className="bg-primary rounded-xl py-2 text-center mt-0.5">
              <span className="text-caption2 font-bold text-white">오늘 루틴 체크하기</span>
            </div>
          </div>

          <TierBackdrop
            level={TIER_LEVEL[tier.id]}
            palette={{ leaf: tier.preview.leaf, accent: tier.preview.accent }}
          />
        </div>

        {/* 하단 네비 */}
        <div className="flex border-t border-line-soft bg-surface py-2">
          <div className="flex-1 flex flex-col items-center gap-0.5 text-primary">
            <TreePine size={15} strokeWidth={2.5} />
            <span className="text-[9px] font-bold">홈</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-0.5 text-label-assistive">
            <Users size={15} strokeWidth={1.8} />
            <span className="text-[9px]">소모임</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-0.5 text-label-assistive">
            <UserCircle size={15} strokeWidth={1.8} />
            <span className="text-[9px]">마이</span>
          </div>
        </div>

        {/* 이 티어의 앰비언스 효과 — 잠긴 테마도 미리 체험 */}
        <AmbienceLayer
          level={TIER_LEVEL[tier.id]}
          palette={{ leaf: tier.preview.leaf, accent: tier.preview.accent }}
          compact
        />
      </div>
    </div>
  );
}

function MockRow({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <div className="bg-surface rounded-xl px-2.5 py-2 flex items-center gap-2">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${checked ? 'bg-primary' : 'border-[1.5px] border-line'}`}>
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <span className={`text-caption2 ${checked ? 'text-label-assistive line-through' : 'text-label font-medium'}`}>{label}</span>
    </div>
  );
}
