/**
 * Placement is data. A breaker the topology names must be the same row
 * a panel would place, and millimetres cannot be smuggled in as described.
 */

import { validate_placement, type PlacementRow } from "../src/controls/placement.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function test_panel_o14_breakers_are_placed_without_fake_millimetres() {
  const errs = validate_placement();
  assert(errs.length === 0, errs.join("\n"));
}

function test_described_confidence_cannot_carry_millimetres() {
  const rows: PlacementRow[] = [
    {
      id: "CbMnaSmokeDetnFltDk",
      panel: "O14",
      kind: "breaker",
      channel: "ctl.elec.cb.mna_smoke_detn_flt_dk",
      nx_mm: "12",
      ny_mm: "4",
      confidence: "described",
      source: "USA006019 Rev. A §3.3.4.2",
    },
    {
      id: "CbMnaAnnunFwdAca1",
      panel: "O14",
      kind: "breaker",
      channel: "ctl.elec.cb.mna_annun_fwd_aca_1",
      nx_mm: "",
      ny_mm: "",
      confidence: "described",
      source: "USA006019 Rev. A §3.3.4.2",
    },
  ];
  const errs = validate_placement(rows);
  assert(errs.some((e) => e.includes("millimetres")), `got ${errs}`);
}

const tests = [test_panel_o14_breakers_are_placed_without_fake_millimetres, test_described_confidence_cannot_carry_millimetres];

let failed = 0;
for (const t of tests) {
  try {
    t();
    console.log("ok ", t.name);
  } catch (err) {
    failed += 1;
    console.error("FAIL", t.name, err);
  }
}
if (failed) {
  console.error(failed, "failed");
  process.exit(1);
}
console.log(tests.length, "passed");
