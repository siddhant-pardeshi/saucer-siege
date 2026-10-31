# QA notes - Saucer Siege

## What was tested

**Build agent verification (dedicated browser tab):**
- Menu over live attract scene; engageable within ~2s of Play (1.65s countdown).
- Combat: kills, score, combo chain to x5 with Pip cheering, pods (S/T/E), boss health chip on wave 3.
- Pause freeze via Escape; results screen with a "New personal best!" (localStorage saucer.best).
- 390px HUD readability; touch elements bound; zero console errors across load, gameplay, results, sequencer and full SFX bank.
- Fixed during the agent's verify: a scale-unit bug (ship/enemies rendered sub-pixel) and edge-spawn margins; balance pass on scout bolts.

**Reviewer verification:** menu + combat screenshots captured, learn layer wired (between-wave debrief with wave-scaled bonus), song data linted, syntax clean, all scripts execute in-page without errors.

## What was NOT tested (honest gaps)

- Full 6-wave completion to the win path (verified by code review; the agent exercised boss damage and shake code without carrying a scripted run to completion).
- Physical mobile devices; FIRE/joystick verified via kit bindings since synthetic pointer events cannot pass setPointerCapture in automation.
- Audio judged by error-free synth engine paths; no human listened in this pass.
- Firefox/Safari untested.

## Known limitations

- The ship auto-aims by design (desktop mouse-steer is an aim assist, not mandatory).
- The debrief appears once per intermission by design - it is a briefing, not a quiz gate.
