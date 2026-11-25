import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Clock3, MessageCircle, RotateCcw, Sparkles } from 'lucide-react';
import { loadState, saveState, type OnjuState } from './model';
import { useRegionalContext } from './useRegionalContext';
import { applyDocumentLocale, translator } from './i18n';
import RegionalSettings from './RegionalSettings';
import DataControls from './DataControls';
import BetaInfo from './BetaInfo';
import SessionDataBoundary from './SessionDataBoundary';
import Header from './Header';
const ProductApp = lazy(() => import('./ProductApp'));

export default function App() {
  const [storedState, setState] = useState<OnjuState>(loadState);
  const [regionalContext] = useRegionalContext();
  const state = useMemo(() => ({ ...storedState, regionalContext }), [storedState, regionalContext]);
  useEffect(() => { saveState(state); applyDocumentLocale(state.regionalContext); }, [state]);
  return <BrowserRouter><SessionDataBoundary><Routes>
    <Route path="/" element={<Landing state={state} />} />
    <Route path="/about" element={<BetaInfo />} />
    <Route path="/data" element={<DataControls />} />
    <Route path="/settings" element={<RegionalSettings />} />
    <Route path="/*" element={<Suspense fallback={<main className="shell" role="status">{regionalContext.locale.startsWith('en') ? 'Loading your plan…' : '계획을 불러오고 있어요…'}</main>}><ProductApp state={state} onChange={setState} /></Suspense>} />
  </Routes></SessionDataBoundary></BrowserRouter>;
}

function Landing({ state }: { state: OnjuState }) {
  const t = translator(state.regionalContext);
  return (
    <main>
      <Header state={state} />
      <section className="hero shell">
        <div className="eyebrow">
          <Sparkles size={16} /> {t('landing.eyebrow')}
        </div>
        <h1>
          {t('landing.title')}
          <br />
          <em>{t('landing.titleEmphasis')}</em>
        </h1>
        <p className="hero-copy">
          {t('landing.copy')}
        </p>
        <div className="hero-actions">
          <Link className="button" to="/setup">
            {t('landing.makeMine')} <ArrowRight size={18} />
          </Link>
          <a className="text-link" href="#how">
            {t('landing.difference')}
          </a>
        </div>
        <div className="demo-card">
          <div className="demo-intro">
            <div className="assistant-avatar">{t('app.mark')}</div>
            <div>
              <span className="status">
                <i /> {t('landing.listening')}
              </span>
              <h2>
                {t('landing.demoTitle1')}
                <br />
                {t('landing.demoTitle2')}
              </h2>
              <p>
                {t('landing.demoCopy')}
              </p>
              <Link className="button" to="/setup">
                {t('landing.start')} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section id="how" className="section shell">
        <div className="section-heading">
          <span>{t('landing.whatOnjuDoes')}</span>
          <h2>
            {t('landing.flowTitle1')}
            <br />
            {t('landing.flowTitle2')}
          </h2>
        </div>
        <div className="feature-grid">
          <Feature
            icon={<MessageCircle />}
            n={t('landing.feature1Number')}
            title={t('landing.feature1Title')}
          >
            {t('landing.feature1Copy')}
          </Feature>
          <Feature
            icon={<Clock3 />}
            n={t('landing.feature2Number')}
            title={t('landing.feature2Title')}
          >
            {t('landing.feature2Copy')}
          </Feature>
          <Feature
            icon={<RotateCcw />}
            n={t('landing.feature3Number')}
            title={t('landing.feature3Title')}
          >
            {t('landing.feature3Copy')}
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
