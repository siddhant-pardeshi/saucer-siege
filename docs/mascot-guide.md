# Pip — the mascot guide

Pip is the mission controller on comms: the deck's shared layered-SVG character — chibi kid in the pale-blue fox hoodie with the gold star charm — rebuilt from the studio's reference sheet as vector layers with a real animation state machine.

## Character invariants

- Pale-blue fox hoodie, cream lining and belly, gold four-point star charm, navy shorts, blue boots, cream-tipped tail.
- Wide-set angled fox ears, big brown eyes, soft blush.
- The reference sheet wins over any written description.

## States used in this game

| Trigger | Performance | Line |
| --- | --- | --- |
| First visit | Entrance + wave | "Pip on comms. Scopes lit up the moment you docked." |
| Return visit | Wave | "Sector is quiet... too quiet." |
| Run start | Alert | "Waves inbound. Shield tight, trigger loose." |
| Wave cleared | Wave | "Wave down. Regen a breath — next one is forming." |
| Boss wave | Alert | "Mothership on scope. Kill its escort first!" |
| Combo x4+ | Cheer | "Chain is live — keep the streak burning!" |
| Last hull point | Alert | "Hull is critical — dodge, do not trade." |
| Run won | Cheer | "Sector secured. Command owes you a drink." |
| Run lost | Sad | "Grid is overrun... reboot and go again." |
| Pause | Sleep (z's) | — |

Lines rotate without back-to-back repeats; cooldowns gate rapid events.

## Where Pip lives

Bottom-right dock on desktop, bottom-left on touch, scaled down on small screens — never over the arena or the joystick. Settings → **Show Pip** hides them; reduced motion keeps only slow blinks.

## Replacing the art

The character is one SVG string + one stylesheet in `js/mascot.js`. Keep the element ids (`m-armR`, `m-earL`, `m-eyeL`, `m-mouth`, `m-tail`, `m-charm`…), keep the layer order, swap colors in the palette object, and preview every state via `?mascot=gallery` on any game URL.
