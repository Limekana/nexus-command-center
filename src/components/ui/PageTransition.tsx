import { useLocation } from 'react-router-dom';
import { type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * PageTransition — keyed fade+lift between routes.
 *
 * Wraps the AppShell <Outlet/> body so every navigation gets a 240ms cross
 * fade with an 8px upward lift on the incoming page. No exit animation —
 * the old page snaps out, the new one springs in. Trying to time both ends
 * up with either a jarring overlap or a perceptible blank frame; the
 * one-sided spring reads as faster + more responsive.
 *
 * Key strategy: we key on the route's first path segment, not the full
 * pathname. That way deep navigations within a section (Finance overview →
 * Add Transaction → Manage Holdings) don't all re-trigger the page-in
 * animation. Only inter-section jumps (Finance → Studies) do. Avoids
 * "everything flutters when I tap a button" syndrome.
 *
 * Motion respects `prefers-reduced-motion` via CSS — the .animate-fade-in-up
 * keyframe is small enough that we don't currently strip it, but the
 * intent is documented for a future audit.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Use first segment as the animation key. Falls back to '/' for the root.
  const section = pathname.split('/').filter(Boolean)[0] ?? 'root';

  const [animKey, setAnimKey] = useState(section);
  const lastSection = useRef(section);

  useEffect(() => {
    if (section !== lastSection.current) {
      lastSection.current = section;
      setAnimKey(section);
    }
  }, [section]);

  return (
    <div key={animKey} className="animate-fade-in-up">
      {children}
    </div>
  );
}
