"use client";

import { POPULATION_ATTRIBUTION, POPULATION_BREAKS, POPULATION_HEATMAP_STOPS, POPULATION_OVERLAY_MODE } from "@/lib/population";
import { useReplay } from "./ReplayProvider";

export default function PopulationPanel() {
  const { populationEnabled, setPopulationEnabled, populationError } = useReplay();
  return (
    <section className="space-y-4 text-[13px] leading-relaxed">
      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={populationEnabled} onChange={(event) => setPopulationEnabled(event.target.checked)}
            className="h-4 w-4 accent-[#44a6b5]" />
          Population density
        </label>
        {populationEnabled && (
          <div className="space-y-1.5 text-xs text-ink-2">
            {populationError ? <p role="status">Population tiles could not be loaded. Toggle the layer to retry.</p> : (
              <>
                {POPULATION_OVERLAY_MODE === "heatmap" ? (
                  <>
                    <p>Population density (relative)</p>
                    <div aria-label="Population density legend" className="space-y-1">
                      <div className="h-[10px] rounded-sm opacity-60" style={{
                        background: `linear-gradient(to right, transparent 0%, ${POPULATION_HEATMAP_STOPS
                          .map(({ color, stop }) => `${color} ${stop * 100}%`).join(", ")})`,
                      }} />
                      <div className="flex justify-between"><span>Lower</span><span>Higher</span></div>
                    </div>
                    <p>Shows where people cluster. No unit. Indonesia only.</p>
                  </>
                ) : (
                  <>
                    <p>People per hectare (modelled residential population)</p>
                    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Population density legend">
                      {POPULATION_BREAKS.map(({ label, color }) => (
                        <li key={label} className="flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded-sm opacity-60" style={{ backgroundColor: color }} />
                          {label}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p>{POPULATION_ATTRIBUTION}</p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
