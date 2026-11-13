"use client";

// Phone bottom sheet with three stops (collapsed, half, full). Drag the grip, tap it to step up, or use the two
// buttons. The sheet is moved with a transform (no layout per frame); its scrolling body gets bottom padding equal to
// the part pushed off screen, so the last rows can always be reached. It publishes its visible height as --dw-sheet-h
// so the map attribution can sit above it.

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export type SheetState = "collapsed" | "half" | "full";

type Props = {
  state: SheetState;
  onState: (s: SheetState) => void;
  top: number;          // px kept clear at the top of the screen (the top bar) when full
  header: ReactNode;    // always visible under the grip
  children: ReactNode;  // scrolls
};

const NEXT: Record<SheetState, SheetState> = { collapsed: "half", half: "full", full: "collapsed" };
const DRAG_SLOP = 6;

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
      <path d={up ? "M1 7l5-5 5 5" : "M1 1l5 5 5-5"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Sheet({ state, onState, top, header, children }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(0);
  const [headH, setHeadH] = useState(0);
  const drag = useRef<{ y0: number; v0: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const measure = () => { setVh(window.innerHeight); setHeadH(head.current?.offsetHeight ?? 0); };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (head.current) ro.observe(head.current);
    return () => { window.removeEventListener("resize", measure); ro.disconnect(); };
  }, []);

  const full = Math.max(vh - top, headH);
  const stops: Record<SheetState, number> = { collapsed: headH, half: Math.min(full, Math.max(headH, Math.round(vh * 0.5))), full };
  const visible = stops[state];
  const offset = (v: number) => `translateY(${full - v}px)`;

  useEffect(() => {
    document.documentElement.style.setProperty("--dw-sheet-h", `${visible}px`);
    return () => { document.documentElement.style.removeProperty("--dw-sheet-h"); };
  }, [visible]);

  const nearest = (v: number): SheetState => {
    let best: SheetState = "collapsed";
    for (const s of ["collapsed", "half", "full"] as const) if (Math.abs(stops[s] - v) < Math.abs(stops[best] - v)) best = s;
    return best;
  };

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    drag.current = { y0: e.clientY, v0: visible, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || !sheet.current) return;
    const dy = e.clientY - d.y0;
    if (!d.moved && Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    sheet.current.style.transition = "none";
    sheet.current.style.transform = offset(Math.min(full, Math.max(headH, d.v0 - dy)));
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved || !sheet.current) return;
    suppressClick.current = true;
    const target = nearest(Math.min(full, Math.max(headH, d.v0 - (e.clientY - d.y0))));
    sheet.current.style.transition = "";
    sheet.current.style.transform = offset(stops[target]);   // React may not re-apply an unchanged style
    onState(target);
  }

  return (
    <div
      ref={sheet}
      className="panel pointer-events-auto fixed inset-x-0 bottom-0 z-20 flex flex-col border-x-0 border-b-0 transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
      style={{ height: full || undefined, transform: offset(visible), visibility: vh ? undefined : "hidden" }}
    >
      <div ref={head} className="shrink-0">
        <div className="flex items-center">
          <button type="button" aria-label="Collapse panel" disabled={state === "collapsed"}
            onClick={() => onState(state === "full" ? "half" : "collapsed")}
            className="focus-ring-inset grid h-11 w-11 place-items-center text-ink-2 disabled:opacity-30">
            <Chevron up={false} />
          </button>
          <button
            type="button"
            aria-label="Resize panel"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onState(NEXT[state]); }}
            className="focus-ring-inset grid h-11 flex-1 touch-none place-items-center"
          >
            <span className="block h-1 w-10 rounded-full bg-ink-3/60" />
          </button>
          <button type="button" aria-label="Expand panel" disabled={state === "full"}
            onClick={() => onState(state === "collapsed" ? "half" : "full")}
            className="focus-ring-inset grid h-11 w-11 place-items-center text-ink-2 disabled:opacity-30">
            <Chevron up />
          </button>
        </div>
        {header}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto" style={{ paddingBottom: full - visible }}>
        {children}
      </div>
    </div>
  );
}
