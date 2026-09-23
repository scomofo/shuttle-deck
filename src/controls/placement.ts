/**
 * Cockpit placement check. Gemini builds nodes from controls.csv.
 * Shuttle Deck has no cabin mesh yet, so this only checks that a breaker
 * the electrical topology names is the same row a panel drawing would place.
 *
 * nx_mm / ny_mm stay empty until a dimensioned panel source exists.
 * Filling them under confidence "described" is rejected.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import catalog from "../../assets/data/cockpit/controls.json" with { type: "json" };
import topology from "../../assets/data/spacecraft/electrical.json" with { type: "json" };

export type PlacementRow = {
  id: string;
  panel: string;
  kind: string;
  channel: string;
  nx_mm: string;
  ny_mm: string;
  confidence: string;
  source: string;
};

const HERE = dirname(fileURLToPath(import.meta.url));

export function load_placement(csv = readFileSync(join(HERE, "../../assets/data/cockpit/placement.csv"), "utf8")): PlacementRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).filter((line) => line.trim()).map((line) => {
    const cell = line.split(",");
    const row = Object.fromEntries(header.map((key, i) => [key, cell[i] ?? ""])) as PlacementRow;
    return row;
  });
}

export function validate_placement(rows = load_placement()): string[] {
  const errs: string[] = [];
  const by_id = new Map(rows.map((row) => [row.id, row]));
  const controls = new Map((catalog.controls as Array<{ id: string; kind: string; channel: string }>).map((c) => [c.id, c]));
  if (by_id.size !== rows.length) errs.push("placement ids must be unique");

  for (const load of topology.loads) {
    const row = by_id.get(load.breaker_id);
    if (!row) {
      errs.push(`${load.breaker_id} is in the electrical topology but has no placement row`);
      continue;
    }
    if (row.panel !== load.panel) errs.push(`${load.breaker_id} panel ${row.panel} does not match topology ${load.panel}`);
    if (row.channel !== load.breaker_channel) errs.push(`${load.breaker_id} channel does not match the topology`);
    if (row.kind !== "breaker") errs.push(`${load.breaker_id} must be placed as a breaker`);
    if (!row.source) errs.push(`${load.breaker_id} placement needs a source`);
    const control = controls.get(load.breaker_id);
    if (!control) errs.push(`${load.breaker_id} is not a control`);
    else if (control.kind !== "breaker" || control.channel !== load.breaker_channel) {
      errs.push(`${load.breaker_id} control kind or channel does not match placement`);
    }
    const has_mm = row.nx_mm !== "" || row.ny_mm !== "";
    if (has_mm && row.confidence !== "drawing" && row.confidence !== "measured") {
      errs.push(`${load.breaker_id} millimetres require confidence drawing or measured, not ${row.confidence || "empty"}`);
    }
    if (!has_mm && row.confidence === "drawing") {
      errs.push(`${load.breaker_id} claims a drawing station but has no millimetres`);
    }
  }

  for (const row of rows) {
    if (!topology.loads.some((load) => load.breaker_id === row.id)) {
      errs.push(`${row.id} is placed but no electrical load names that breaker`);
    }
  }
  return errs;
}
