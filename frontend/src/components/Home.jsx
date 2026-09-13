import { useSession } from '../session';
import { useT } from '../preferences/context';
import { VIEWS, isViewAllowed } from '../views';
import Icon from './Icon';

const CARDS = ['overview', 'network', 'people', 'timemachine', 'ai', 'quality', 'profile', 'reviews', 'users', 'help'];
export default function Home({ risks, quality }) {
  const session = useSession();
  const t = useT();
  const canOpen = (id) => isViewAllowed(session, id);
  return <div className="home-workspace">
    <section className="panel home-welcome">
      <h2>{t('home.greeting', { name: session.user.displayName })}</h2>
      <p>{t('home.purpose')}</p>
    </section>
    <nav className="home-cards" aria-label={t('home.destinations')}>
      {CARDS.filter(canOpen).map((id) => <a className="panel home-card" href={`#/${id}`} key={id}>
        <Icon name={VIEWS.find((view) => view.id === id).icon} size={24} />
        <strong>{t(`home.cards.${id}`)}</strong><Icon name="arrow" size={16} />
      </a>)}
      {canOpen('profile') && <a className="panel home-card" href="#/profile?section=development"><Icon name="ai" size={24} /><strong>{t('home.development')}</strong><Icon name="arrow" size={16} /></a>}
    </nav>
    <section className="panel home-signals" aria-label={t('home.signals')}>
      <h2>{t('home.signals')}</h2>
      {canOpen('overview') && risks && <>
        <a href="#/overview?coverage=uncovered">{t('home.uncovered')} <strong>{risks.uncovered}</strong></a>
        <a href="#/overview?coverage=single">{t('home.single')} <strong>{risks.singleHolder}</strong></a>
      </>}
      {canOpen('quality') && quality && !quality.error && <a href="#/quality">{t('home.quality')} <strong>{quality.summary.open}</strong></a>}
      {session.user.role === 'employee' && <p className="muted">{t('home.personal')}</p>}
      {canOpen('overview') && !risks && <p className="muted" role="status">{t('home.unavailable')}</p>}
      {canOpen('overview') && <a className="btn btn-secondary" href="#/overview">{t('home.detailed')}</a>}
    </section>
  </div>;
}
