// The landing page's top bar: wordmark at the left, page links flush right. "Live map" is the always-visible skip to
// the app. Fixed over the hero and story; the page's sections scroll under it.

import { memo, type MouseEvent } from "react";
import Link from "next/link";
import Wordmark from "../Wordmark";

const link = "focus-ring inline-flex min-h-11 items-center text-ink-2 transition-colors hover:text-ink";
// In-page links scroll in place: a hash navigation would add a history entry the Next router does not own, and Back
// from /app would then land on it without restoring the landing page. The href stays for no-JS and assistive tech.
function scrollTo(e: MouseEvent<HTMLAnchorElement>) {
  const el = document.getElementById((e.currentTarget.getAttribute("href") ?? "").slice(1));
  if (!el) return;
  e.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

function TopBar({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <header className="pointer-events-auto fixed inset-x-0 top-0 z-30 border-b border-rule bg-[rgb(239_230_212/0.96)]">
      <div className="relative flex h-14 items-center justify-between px-4 md:h-[72px] md:px-8 lg:px-16">
        <span className="md:hidden"><Wordmark size="sm" /></span>
        <span className="max-md:hidden"><Wordmark /></span>
        <nav aria-label="Page" className="flex gap-6 text-sm max-md:hidden">
          <Link href="/app" onClick={onOpenApp} className={link}>Live map</Link>
          <a href="#how-it-works" onClick={scrollTo} className={link}>How it works</a>
        </nav>
        <Link href="/app" onClick={onOpenApp}
          className="focus-ring inline-flex min-h-11 items-center gap-2 border border-ink/25 px-4 text-[13px] font-medium text-ink transition-colors hover:border-ink-3 md:hidden">
          Live map <Arrow />
        </Link>
      </div>
    </header>
  );
}

export function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <path d="M2 7h9M7.5 3.5 11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default memo(TopBar);
