/** Presentation-only routing. The browser model's generic plume value is not an engine ID. */
export function exhaustLevels(state: {
  running: boolean; phase: string; plume: number; etAttached: boolean;
  srbAttached: boolean; doorsOpen: boolean; omsProp: number;
}) {
  const power = state.running && Number.isFinite(state.plume) ? Math.max(0, Math.min(1, state.plume)) : 0;
  const ascent = state.phase === "ascent";
  return {
    main: ascent && state.etAttached ? power : 0,
    booster: ascent && state.srbAttached ? power : 0,
    oms: state.phase === "orbit" && !state.doorsOpen && state.omsProp > 0.02 ? power : 0,
  };
}
