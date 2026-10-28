# The wizard is startled when the creature climbs on

When the creature jumps onto the hat, the wizard should flinch: for a moment his buttons do nothing,
then he plays on. Use CREATURE_STARTLE_TICKS from game/sim/constants.ts. The designer tuned it;
do not change it.

Criteria:
- for CREATURE_STARTLE_TICKS ticks after the creature climbs on, left, right, jump and charge do nothing
- on the tick after that the buttons work again
- the startle stops his buttons, not the world: if it begins in the air, he keeps falling and lands
- a replay with the same seed and the same frames is startled on the same ticks
