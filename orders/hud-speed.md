# The F1 debug line shows the wizard's speed

Behind F1 the HUD line shows the room, the player state, the position, the tick and the deaths.
When we tune a jump we also want his speed on the screen, next to the rest.

Criteria:
- behind F1 the line ends with `vx <n> vy <n>`: both speeds in whole units per second, after the deaths
- standing still, the line ends with `vx 0 vy 0`
- without F1 the line stays empty
