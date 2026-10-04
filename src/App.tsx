import ConsoleApp from '@/ConsoleApp';
import { Home } from '@/pages/Home';
import { Evidence } from '@/pages/Evidence';
import { SITE } from '@/config/site';
import { go, useRoute, type Route } from '@/ui/route';
import { cx } from '@/ui/format';



function TopNav({ route }: { route: Route }) {
  const link = (r: Route, label: string) => (
    <button onClick={() => go(r)} className={cx('rounded-md px-3 py-1.5 text-[13px] font-semibold', route === r ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-ink')}>
      {label}
    </button>
  );
  return (
    <nav className="flex items-center gap-1 border-b border-line bg-white/90 px-5 py-2 backdrop-blur">
      <button onClick={() => go('home')} className="mr-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
            <circle cx="5" cy="12" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="19" cy="18" r="2.2" />
            <path d="M7 11l10-4M7 13l10 4" />
          </svg>
        </span>
        <span className="text-[16px] font-bold tracking-tight">{SITE.name}</span>
      </button>
      {link('home', 'Home')}
      {link('console', 'Console')}
      {link('evidence', 'Evidence')}
      <a href={SITE.githubUrl} target="_blank" rel="noreferrer" className="ml-auto text-[13px] font-semibold text-slate-600 hover:text-ink">
        GitHub ↗
      </a>
    </nav>
  );
}

export default function App() {
  const route = useRoute();
  if (route !== 'console')
    return (
      <div className="min-h-full">
        <TopNav route={route} />
        {route === 'home' ? <Home /> : <Evidence />}
        <footer className="bg-slate-900 px-5 py-2 text-center text-[11px] text-slate-300">
          <b className="text-white">Prototype — not for clinical use.</b>
        </footer>
      </div>
    );
  return (
    <div className="flex h-full flex-col">
      <TopNav route="console" />
      <div className="min-h-0 flex-1">
        <ConsoleApp />
      </div>
    </div>
  );
}

