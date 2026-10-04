import { useEffect, useState } from 'react';

export type Route = 'home' | 'console' | 'evidence';

function parse(): Route {
  // Hash routes (#/console) work on any static host; path routes (/console) where the host rewrites to index.html.
  const fromHash = location.hash.replace(/^#\/?/, '').split('?')[0];
  const fromPath = location.pathname.replace(/^\/+|\/+$/g, '');
  const r = fromHash || fromPath;
  return r === 'console' || r === 'evidence' ? r : 'home';
}

/** Minimal hash router: works on any static host (Lovable, Vercel, GitHub Pages) without rewrites. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (r: Route) => {
  location.hash = r === 'home' ? '/' : `/${r}`;
};
