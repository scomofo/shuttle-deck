import { useSyncExternalStore } from "react";
import { COCKPIT_TARGETS, getCockpitInspection, inspectCockpit, subscribeCockpitInspection } from "./cockpit-navigation";
import { setPanelLight, usePanelLight } from "./panel-lighting";

export function CockpitTools({ controlsOpen, onControls }: { controlsOpen: boolean; onControls: () => void }) {
  const { target } = useSyncExternalStore(subscribeCockpitInspection, getCockpitInspection, getCockpitInspection);
  const panelLight = usePanelLight();
  return <nav className="cockpit-tools" aria-label="Cockpit navigation">
    <div className="cockpit-view-buttons">
      <button type="button" aria-pressed={!target} onClick={() => inspectCockpit(null)}>Forward view</button>
      <button type="button" aria-pressed={target === "displays"} onClick={() => inspectCockpit("displays")}>Flight displays</button>
      <button type="button" aria-pressed={target === "overhead"} onClick={() => inspectCockpit("overhead")}>Overhead</button>
      <button type="button" aria-pressed={target === "aft"} onClick={() => inspectCockpit("aft")}>Aft station</button>
      <button type="button" aria-expanded={controlsOpen} aria-controls="cockpit-controls" onClick={onControls}>Controls [X]</button>
    </div>
    <div className="cockpit-tools-detail">
      <span>{target ? `${COCKPIT_TARGETS[target].label} · Esc returns forward` : "Commander seat · drag to look · double-click to recenter"}</span>
      <label className="panel-light">PANEL LIGHT
        <input aria-label="Panel lighting" type="range" min="25" max="100" step="5" value={Math.round(panelLight * 100)}
          onChange={event => setPanelLight(Number(event.target.value) / 100)} />
        <output>{Math.round(panelLight * 100)}%</output>
      </label>
    </div>
  </nav>;
}
