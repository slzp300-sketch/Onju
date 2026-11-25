import { Link } from 'react-router-dom';
import type { OnjuState } from './model';
import { translator } from './i18n';
import { RegionalSettingsLink } from './RegionalSettings';
export default function Header({ state }: { state: OnjuState }) {
  const t = translator(state.regionalContext);
  return (
    <header className="nav shell compact">
      <Link className="brand" to="/">
        <span className="brand-mark">{t('app.mark')}</span>{t('app.name')}
      </Link>
      <nav className="nav-links">
        <RegionalSettingsLink />
        <a href="/#how">{t('header.how')}</a>
        <Link to="/setup">{t('header.makePlan')}</Link>
      </nav>
      <Link className="button button-small" to="/setup">
        {t('header.startChat')}
      </Link>
    </header>
  );
}
