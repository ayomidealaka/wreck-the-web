# Changelog

## Unreleased

- Optional analytics: set `ANALYTICS_SCRIPT` and `ANALYTICS_SITE` and the menu page loads a tracker (Umami-style);
  the game reports games started, pages destroyed, rank-ups and saved clips, with nothing that identifies a player.
- Four new characters in Ash's style: Raven, Doc, Kane and Jett. Pick one on the menu; Ash is still the default.
- A page now counts as destroyed at 70% of its letters and 70% of its content (was 90% of each).

## 1.0.0 (2026-10-07)

The first public release.

### Play
- Type in any website and it becomes a level. The server renders it in headless Chrome and the game turns every
  letter, image, button and box into something you can stand on, shoot and knock loose.
- Letters fly off in one hit. Images and controls take damage, crack and fall as slabs, and cards and sections take
  their contents with them when they fall.
- A page counts as destroyed at 90% of its letters and 90% of its content. The results float over the page and you
  can keep wrecking.
- Unlimited jetpack, dash, flips, grenades and an airstrike.
- Desktop and touch controls. Phones get the site's mobile layout.

### Weapons
- Fourteen weapons: Uzi, AK-47, minigun, shotgun, .50 sniper, 40mm launcher, rocket launcher, flamethrower,
  rail laser, gravity well, gatling drone, mini nuke, cluster launcher and pulsar.
- Rounds fly as far as the cursor and punch paper holes where they land. The sniper carves a trench and ricochets
  off images.
- The rail laser charges, then fires one pink beam that cuts a trench to the edge of the page.
- The gravity well tears the page apart like a whirlpool, then collapses into a heavy burst.
- The cluster launcher drifts down under a parachute and splits into eight bomblets. The pulsar's jets sweep a
  widening disc out of the page before it bursts.
- Heavy weapons reload on their own, with a bar over the player and on the weapon slot.

### Fire and effects
- The flamethrower sets the page alight. Fire spreads, chars the page and burns it away.
- Every blast leaves soft scorch, ragged edges and a ring of fire round its crater.
- Hot rims that cool, screen shake, recoil springs and a replay buffer: R saves the last 20 to 40 seconds as a video.

### Worlds
- Four parallax scenes behind the page, seen through the holes: a synthwave city, mountains at dusk, sunny hills
  and deep space. Each site gets one, never the same one twice running.

### Progress
- An anonymous profile with a random name you can change. Nothing to sign up for, and everything stays in your browser.
- XP for letters, smashed elements, destroyed websites and challenges.
- Twelve ranks, from Lurker to Web Wrecker, each with a pixel-art medal. A new rank shows up in the game as you reach it.
- Three daily challenges, easy to hard, about the sites you destroy and the guns you use.

### Characters
- A classic pixel cast, and Ash, a rigged character with proper run and jump cycles, hands on each weapon's grips,
  a shotgun pump and a grenade throw.

### Performance
- The page lives on the GPU. Letters and debris colours come from a copy in memory, so big blasts like the nuke
  no longer stall the game.
