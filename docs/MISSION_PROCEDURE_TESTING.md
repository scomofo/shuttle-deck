# Mission and procedure testing

Same contract as [gemini-capsule `docs/MISSION_PROCEDURE_TESTING.md`](https://github.com/scomofo/gemini-capsule/blob/main/docs/MISSION_PROCEDURE_TESTING.md).

- Procedures live under `assets/data/missions/<id>/procedures/`.
- `src/mission/procedures.ts` is the Gemini runner in TypeScript.
- Actions go through `Controls` and `MissionSequencer`, never private fields.
- Time moves only through `SimClock`.
- `set_channel` is synthetic and `ctl.*` only.
- Fidelity tags: structural / functional / timing / dynamic / historical / synthetic.

Current inventory:

| ID | Fidelity | What it proves |
|---|---|---|
| STS-LAUNCH-INSERTION-001 | structural | pad → SRB sep → MECO → crew ET sep → orbit |
| STS-ELEC-PROTECT-001 | functional | three fuel cells off kills the main bus |
| STS-ELEC-FC-MNA-001 | functional | panel R1 FC1/MN A momentary switch latches the contactor; talkback is not the switch; one tie does not repower MN A; both ties do; opening the tie drops it again |
| STS-SYNTH-REJECT-001 | schema | a procedure cannot write `dyn.*` |
