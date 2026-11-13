"use client";

// Shared by / and /app: one provider and one map that survive client navigation between them (Task 1 ruling).
// The map must live here, never in a page: hidden pages are kept by <Activity> with their effects torn down.

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import ReplayProvider from "@/components/ReplayProvider";

// MapLibre touches window at import time, so the stage loads in the browser only.
const MapStage = dynamic(() => import("@/components/MapStage"), { ssr: false });

export default function MapLayout({ children }: { children: ReactNode }) {
  return (
    <ReplayProvider>
      <MapStage />
      {/* Pages sit above the map. The wrapper lets clicks through to the map; pages opt their own UI back in. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col">{children}</div>
    </ReplayProvider>
  );
}
