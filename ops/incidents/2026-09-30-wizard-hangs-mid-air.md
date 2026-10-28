# INC-2026-09-30: The wizard hangs in the air after a mid-air beacon touch

- Severity: SEV-3 (the glade could not be finished cleanly)
- Modules: sim
- Fixed: 2026-10-01 in #126, HWP-090 (ORCH-118)
- Found by: playing the glade; the beacon's trigger box is four tiles tall

## What happened

The beacon's trigger box is four tiles tall, so a jump beside it touches it well above the
ground. Victory stopped the whole player step. That took gravity away together with the input,
and left the wizard hanging in the air for the rest of the run. The change that introduced it
was short and read well, and the replay tests of the day never touched the beacon mid-air.

## What we changed

1. Victory holds the input only. The step after the touch applies gravity and sweeps him down
   to the ground he was over; `props.ts` stopped zeroing his vertical speed every tick.
2. `tests/sim/victory.test.ts` plays a mid-air touch through to the ground.
3. Anything that holds the wizard still holds his input, never the physics step (ADR-011).
