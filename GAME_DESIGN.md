# Viking Raiders Returns — Initial Game Design Brief

## High concept

A colourful, light-hearted, turn-based Viking strategy game for one to four local players. Players buy a small force, move units across a compact top-down board, and attempt to capture their rivals' castles. Matches should be easy to begin, full of small surprises, and usually conclude within 20–30 minutes.

This document is a starting point. Rules marked **Open** require prototyping or an explicit decision.

## Intended experience

- Audience: casual players, including people with little strategy-game experience.
- Tone: playful and characterful, with room for gentle Viking humour.
- Session length: approximately 20–30 minutes.
- Complexity: a small number of distinct units and actions, with information visible on the board.
- Presentation: a top-down board with polished retro pixel art and modern interface clarity.

## Players and turns

- 1–4 player slots.
- Each slot can be human or computer controlled.
- Human multiplayer initially uses hot-seat play on one device.
- Play is turn based.
- Online multiplayer is a possible later feature, not part of the first prototype.

To support hot-seat privacy, the interface may use a brief “Pass to the next player” screen between turns. Whether any information is secret is **Open**.

## Objective

The main goal is to attack and capture opposing castles. The exact victory rule is **Open**:

- eliminate every rival;
- capture a designated winning castle;
- or be the last player retaining a castle.

The result must be immediately understandable and should avoid extending a decided match unnecessarily.

## Board and movement

- Top-down battlefield, materially larger than the original game's board but still readable as a whole on a typical desktop display.
- Units travel in straight lines.
- Soldiers may voluntarily move 0–9 spaces in a straight line. They may travel farther only as a forced run to the first object, board edge, or impassable terrain; the clear 10th, 11th, 12th, and later intermediate squares are not selectable. Longboats and Catapults may move up to nine spaces under the same stopping rules.
- Movement should require very few inputs and make legal destinations obvious.
- Static board objects interrupt straight-line travel. A Drinking Horn is a compulsory stopping square for a Soldier, which immediately drinks and becomes drunk; Catapults cannot enter or roll through it. Defeated castles remain on the board as impassable structures rather than becoming empty terrain. Chest, horn, castle, and future saga-obstacle blocking is routed through one shared rules check so later obstacle cards cannot accidentally be bypassed.
- Square grid versus hexagonal grid is **Open**. Prototype both using placeholder graphics and compare clarity, tactical variety, map size, and ease of touch input.

### Winter Is Coming

Winter is an optional match rule, enabled by default on the setup screen. Its seeded start is chosen at setup and occurs after the completion of a random round from 4 through 10. The first northern band freezes at that round boundary, accompanied by a brief **Winter Is Coming** board announcement. Ice and snow then advance from north to south in six phases. Each newly affected band fades gradually from water and grass into ice and snow over a short presentation pause, accompanied by a subtle procedural wind gust when sound effects are enabled. Player input and computer actions wait until this presentation finishes. A phase advances only at the end of a complete round, so every surviving faction receives one turn before the next band freezes.

Each phase converts the water in its north-to-south band into ice and whitens land in the same rows. Ice follows normal land-unit movement rules for Soldiers and Catapults. Longboats require water, so a boat caught by the advancing ice remains where it is, visibly trapped and unable to move or accept new passengers. Its existing passengers immediately disembark onto available adjacent ice or land; if the shore is completely blocked, any passenger without a legal exit stays aboard until space opens and may then disembark normally. After phase six, all original water is frozen. No later thaw is currently specified—the word “thawing” in the initial brief is interpreted as “freezing phase” because the requested mechanic describes only advancing winter. The headless balance benchmark keeps Winter off by default so existing difficulty comparisons remain directly comparable; dedicated winter balance runs can enable it explicitly.
- Terrain and map effects should remain sparse enough that the board can be read at a glance.
- Exact dimensions are **Open**. Begin with a moderately enlarged square-grid map and keep dimensions configurable so playtesting can compare travel time, congestion, and match length.
- Prefer zooming and a small overview indicator over forcing frequent scrolling. On mobile, limited panning may still be necessary.
- About two-thirds of maps use one connected, irregular fjord. The remaining roughly one-third use a classic-style central land mass with deliberately separate, broad waterways; these are intentional boat routes rather than accidental lakes. Every water component must be wide enough for a three-square Longboat, and boat-inaccessible one-square pockets are not permitted. The unfrozen fjords use broad, angular channels inspired by the reference game's readable geometry, without reproducing a reference layout. Individual maps may be asymmetric, and the fixed map recipe must not systematically weight water toward either side of the board across many seeds. At the left and right edge, water remains two to four squares from the board boundary, leaving usable land banks; one-square edge strips are prohibited. Every castle is placed on the main shared landmass, ensuring each player has a land route to at least one opponent and a directly adjacent centre square for a usable three-square horizontal Longboat berth. Castle placement also checks every usable starting courtyard square and rejects a position if it creates an unobstructed horizontal, vertical, or diagonal first-turn Soldier attack on another castle. This preserves long forced runs while making the fjord and approach geometry matter. Each faction starts with one Longboat and three Soldiers, all directly adjacent to its castle; Catapults must be purchased. Consequently, the initial Longboat may need to move before another can be bought.
- Castle home regions are deliberately asymmetric. Each new match uses seeded randomness to shuffle faction colours between the selected regions, then applies a small seed-based variation to the authored anchors. In a two-player match the chosen home regions are always diagonally opposite, never adjacent. Three-player matches do not use an L-shaped subset of three corners: they use a triangular arrangement with one home near the centre of a long board edge and two spread across the opposite edge, with the triangle inverted seedably between matches. This keeps all three pairwise castle distances broadly similar and avoids making one faction the obvious squeezed middle target. Four-player matches use every corner region. Land access, mooring, formation-space, and first-turn attack protections remain mandatory for every final placement. No faction—including Blue—owns a permanent position.

## Factions and readability

Players are identified by bold primary colours. Each faction should also have a distinctive emblem or pattern so colour is never the only identifier. Units use simple silhouettes and icons, with restrained animation and personality.

Board movement is now presented as short, smooth travel rather than an instant jump. Soldiers bob forward with a light dust trail, Longboats leave a wake, and Catapults leave small wheel-and-dust marks. Embarking and disembarking are also shown as movement. Direct Soldier-or-Veteran combat now holds both fighters at the contact square for roughly twice the earlier duration, amid crossed weapons and sparks, then shows the existing anchored Victory or Repelled result; a procedural cheer plays for an attacking victory and a short groan for a repelled attacker. A quick coin chime confirms treasure banking, a comic hiccup confirms a Viking becoming drunk, and a soft rising exhale confirms sobering from any visible game effect. Brief anchored markers call out treasure collection and banking, boarding, combat victory or defeat, and castle capture. These are deliberately lightweight placeholder effects: they clarify cause and effect now, while remaining independent of the later sprite and art-style overhaul. Computer animation duration follows the existing play-speed control and the headless benchmark skips presentation entirely.

The start button now calls a substantial procedural Viking battle horn after browser audio is unlocked. On victory, exactly one faction-specific triumph horn plays: Blue rises from a sturdy mid-register call, Red uses a lower martial phrase, Pink uses a brighter flourish, and Green uses a deep, earthy cadence. The horns use an original layered brass body, breath, detuning, natural swell, compression, and a faint echo to feel weightier than simple tones. These cues respect the setup sound-effects toggle and supplement the visible victory state rather than replacing it.

When sound effects are enabled, the opening horn is a short pre-turn ceremony. While it plays, controls, purchases, automated opening moves, and computer turns are deliberately paused; the board explains that the first turn begins as its final echo fades. With sound disabled, the match begins immediately.

Catapult fire uses the same presentation layer: a stone travels in a pronounced arc from the throwing arm to the rules engine's actual scattered landing square. The impact square receives a brief flash, debris spokes, smoke, a temporary fading crater, and an anchored result when a unit is actually struck. A destroyed Catapult becomes a short-lived broken icon—collapsed frame, snapped throwing arms and scattered stones—before fading away; this also appears after a Soldier destroys one directly. The scatter-area preview gives aiming feedback without a yellow intended-target circle. A stone landing in water instead creates a brief ripple and splash, while empty land is simply reported as a miss; neither is described as a hit. Computer shots use the same sequence at the selected computer play speed.

Although combat rules resolve immediately, the presentation retains a private visual snapshot of any casualty until the attacker or projectile reaches the contact square. The casualty then disappears, sinks, or becomes wreckage at the moment of impact. It is already absent from authoritative game state, so computer targeting and later Catapult shots cannot select or report another hit on that unit. This prevents the earlier “phantom target” effect where a victim vanished before the incoming shot was shown.

The first audio pass covers Catapult fire with original procedural browser audio rather than downloaded samples: a wooden release and restrained descending stone whistle, followed by a ground impact only on land or ice. A water impact uses the supplied short splash sample only when the actual landing square is water. Longboats destroyed by Catapult fire or ramming use the supplied bubble sample beneath an original hull-break layer. Side-on rams are detected across both complete three-square hull footprints. A destroyed boat remains visible through the approach or projectile flight, then sinks with bubbles and fading ripples instead of disappearing before its sound plays. The supplied wooden-collapse sound plays whenever a Catapult is destroyed, whether by a Soldier or another Catapult, while the supplied comic cry plays only when a Catapult projectile removes a Soldier or Veteran. The setup screen enables or disables sound effects for the match, with sound on by default. Audio reinforces the existing animation and result text but never carries essential information by itself.

## Core units

- **Viking Soldiers and Veterans:** Soldiers are the standard land force and primary castle-capturing unit. They choose a measured move of up to nine squares or a committed run to the next obstruction. A Soldier that survives a direct victory over another Soldier or Veteran is promoted to Veteran; Veterans cannot be purchased. Soldier-versus-Soldier and Veteran-versus-Veteran combat is 50/50, while a Veteran has a 55/45 advantage against an ordinary Soldier. A Soldier captures a castle on a 40% attack roll and a Veteran on a 45% roll; failure removes the attacker, while success leaves the attacker adjacent to the captured castle. This promotion mechanic is experimental and intentionally straightforward to remove after playtesting. Veterans use a distinct bare-chested, axe-bearing silhouette.
- **Longboats:** three-square-long vessels that are always displayed and positioned horizontally, even when travelling vertically or diagonally. They can carry up to three Viking Soldiers. A Soldier beside a friendly boat embarks by moving onto it; Soldiers cannot otherwise enter or occupy water. Enemy Longboats are impassable to Soldiers: they cannot be boarded or attacked, so the Soldier remains in place. Selecting a crewed boat allows one Soldier at a time to disembark onto an open neighbouring land or ice square. Embarked Soldiers travel with the boat and are lost if it sinks. A Longboat that rams an enemy Longboat always wins and sinks it.
- **Catapults:** occupy two horizontal squares and are always displayed horizontally. They move up to nine spaces and may fire once per turn at any intended square within an eleven-space radius. Moving opens an immediate firing opportunity: the player must aim before beginning another action or the shot is lost for that round. A Catapult that fires without first moving remains stationary for the rest of the round. Projectiles arc over units, castles, and terrain, so line of sight does not block a shot. The interface previews a scatter area around the intended square. A friendly unit cannot be chosen as the intended target, preventing an ordinary selection click from becoming a deliberate friendly-fire order; scatter can still land on an ally. Nearby shots may deviate by one square and distant shots by two; in the five-by-five long-range scatter pattern, an outer-ring square is half as likely as a square in the inner three-by-three. The seeded random landing square determines whether an enemy, ally, castle, or empty ground is hit; an impact sinks a Longboat. A Soldier that directly attacks a Catapult always wins. Castle damage and interaction with future map objects remain to be designed.
- **Drinking Horns:** two neutral Drinking Horns appear per participating faction at setup. A Soldier who steps onto one becomes permanently drunk, immediately drops any chest, and can no longer collect treasure or board a Longboat. At the start of that owner’s every turn, all of their drunk Soldiers move before any other action under computer control: each chooses a random legal direction, then makes a random legal move up to nine squares 75% of the time or runs to the furthest legal stopping point 25% of the time. Drunk Soldiers can still attack Catapults and castles; their attacks use ordinary combat. If an enemy attacks a drunk Soldier, the defender switches to the attacker’s faction rather than being removed, sobers up, and stays where they are; the attacker has spent its action. This deliberately comic conversion rule also applies to enemy Catapult hits.

Exact costs, movement, combat values, and special abilities are **Open**. New unit types should only be introduced when they add an easily explained role that the three core units do not provide.

## Economy and purchasing

Buying units remains a core mechanic. Each team starts with 50 gold and gains 1 gold at the beginning of each later turn. A Soldier costs 2 gold, a Longboat costs 5 gold, and a Catapult costs 8 gold. Catapults are intentionally absent from the starting force, making their ranged power a deliberate investment rather than an automatic opening advantage. Initial purchasing remains generous while passive income stays modest.

Purchases appear only in one of the eight squares directly adjacent to the buyer's home castle; Longboats use the adjacent square as their centre and still require their complete horizontal hull to fit in water, while Catapults use that square as their left-hand anchor and require a second land or ice square immediately to the right. If no suitable adjacent square is free, that purchase is unavailable. The turn-order decision remains open: the prototype currently allows units in any order and allows buying during a turn, while newly purchased pieces cannot move or fire that turn. The original category-based order ended with purchasing. For the casual version, test an explicit end-of-turn purchase phase once the core rules settle, but avoid adding several mandatory movement sub-phases unless playtesting proves they help.

Treasure chests restore a small objective from the original game's spirit: setup adds one neutral chest per participating player at a random unoccupied land square, each worth 10–50 gold in ten-gold steps. A Soldier collects a chest by entering its square, then on a later turn ends movement in any adjacent square beside its own castle to bank the gold while remaining there. If a game effect directly places a carrier beside home, it banks the chest at once rather than trapping the carrier in the courtyard. A dropped chest remains on the ground if its carrier dies on land; one carried aboard a sunken boat is lost. Chest ownership is intentionally neutral—any faction may recover any chest.

## Shared event deck

The setup screen includes a match-wide **Saga event cards** toggle, enabled by default. When disabled, the deck remains empty and no card is drawn or shown; all other rules remain unchanged. When enabled, draw and resolve one shared saga card at the end of every player turn before the next turn begins. The first playable deck contains seventeen cards: **Royal Ransom** (+8 gold), **Treasure Hunter** (improves a nearby unclaimed chest), **Veteran’s Tale** (promotes an ordinary Soldier), **Sobering Thought** (sobers the nearest drunk Viking), **Ale Delivery** (places a horn near an enemy Soldier), **Hidden Hoard** (creates a 10-gold chest at least five squares from home), **Army Upkeep** (costs up to 10 gold), **Harbour Dues** (costs up to 5 gold when the player owns a Longboat), **Catapult Repairs** (costs up to 4 gold when the player owns a Catapult), **The Persuader** (recruits the nearest one or two enemy Soldiers), and **Called Home** (brings a distant friendly Soldier beside home). Six deliberate no-effect cards—**Raven's Counsel**, **The Jarl's Beard**, **A Perfectly Ordinary Rock**, **Longboat Laundry**, **The Mead Inspector**, and **Axe-Shaped Cloud**—resolve visibly with gentle humour but alter no rule or resource. No penalty can reduce gold below zero. The deck is seeded, uses a draw and discard pile, skips an unavailable effect in favour of the next eligible card, and reshuffles the discard pile after it is exhausted. Every result appears in a clear illustrated placeholder card panel before play continues. Expand toward roughly 20–30 event types only after this foundation has been playtested.

The setup screen also includes **Random starting player** and **Random player order**, both enabled by default. The first rotates the turn sequence so any participating faction may begin; the second seedably shuffles the entire sequence once. The resulting order stays fixed for the match and is announced in the game log. Either option can be disabled independently, while disabling both retains the setup-screen faction order. Castle locations and faction identities are not changed by these controls.

Suggested distribution:

- Most cards: small, clear changes to income, movement, terrain, or a limited set of units.
- Some cards: conditional benefits that can help a player who is behind.
- A few cards: memorable, high-impact events that alter the immediate balance without deciding the match automatically.

Design rules:

- Resolve cards quickly and describe the outcome in one or two short sentences.
- Avoid making a player miss an entire turn.
- Avoid destroying a large force without warning or counterplay.
- Prefer events that create a decision over events that merely add or subtract a number.
- Weight catch-up effects using visible game state where appropriate, rather than secretly favouring a particular player position.
- Make draws reproducible through seeded randomness.

Example themes—not final cards—include favourable winds, fog, a travelling merchant, a royal tax, an enthusiastic bard, a wandering goat, a washed-out crossing, or unexpectedly sturdy castle repairs.

## Computer players

Computer-controlled factions should take quick turns and behave in ways casual players can understand. Initial behaviour can prioritise:

1. defending a threatened castle;
2. making an affordable purchase;
3. capturing useful nearby positions;
4. advancing toward an attainable rival castle;
5. attacking when the expected outcome is reasonable.

Difficulty should eventually change decision quality or strategic priorities more than it changes hidden numerical advantages.

Each computer-controlled slot has an independent difficulty selection with five understandable levels:

- **Very Easy — Lost Raider:** uses weak routing, short threat detection, broad variation, and frequently accepts merely legal movement.
- **Easy — Raider-in-Training:** understands basic roles and nearby danger but still makes occasional poor route and target choices.
- **Normal — Seasoned Raider:** uses terrain-aware routes, persistent roles, sensible transport, basic defence, and short attack plans; this is the default casual challenge.
- **Hard — Jarl:** retains campaign targets, coordinates multiple roles, detects threats earlier, protects useful positions, and selects the strongest scored action without deliberate variation.
- **Expert — Saga Legend:** retains plans longest, uses the widest defensive horizon, demands the clearest improvement before moving, and applies the strongest strategic weights and friendly-fire caution.

Difficulty is implemented through controllable capabilities rather than arbitrary cheating. Candidate controls include:

- number of legal actions examined;
- number of turns considered when scoring a plan;
- quality of threat and opportunity detection;
- memory of opponent behaviour and recent events;
- coordination between Soldiers, Longboats, and Catapults;
- willingness to take combat risks;
- economy and purchase planning;
- skill at evaluating event-card choices;
- frequency and size of deliberate, believable imperfections.

All computer players obey the same movement, range, purchasing, income, and combat rules as humans by default. Optional visible handicaps may later adjust starting gold or income for players who want finer control, but they are separate from AI intelligence.

Computer turns should be reproducible from the game seed during testing. The interface should briefly indicate the apparent intention behind important AI actions—for example, defending a castle or preparing transport—without exposing private calculations.

The current strategic prototype stores a serializable plan for every computer faction. A plan names its objective, chosen rival castle, creation and retention rounds, and every surviving unit's role. Urgent defence, treasure delivery, and immediate castle captures may override an ordinary campaign; otherwise Normal, Hard, and Expert retain targets for increasingly long periods. Target selection weighs real terrain routes, nearby defenders, committed allies, and enemy army size. Distant enemies are observed without recalling the army. A defensive objective begins when an enemy Soldier is within roughly six route steps of the home courtyard. The AI assigns no more defenders than there are approaching threats, and those defenders prefer a loose interception ring two to four squares from the castle. Adjacent courtyard defence is reserved for an attacker already at the gate. Treasure carriers and a single designated hunter retain their specialist roles; other Soldiers raid the chosen castle, Catapults provide siege support, and Longboats transport or intercept.

Every legal move is compared with the value of holding the current square. Stronger computers refuse moves that do not improve their plan, allowing a well-positioned Catapult or defender to remain useful rather than wandering. Very Easy accepts a wide pool of weak but legal choices; Easy narrows that pool; Normal usually selects the best of two; Hard and Expert select the best scored action. Immediate castle-attack likelihood is 65% on Very Easy, 80% on Easy, 90% on Normal, and 100% on Hard and Expert. All difficulties have the same rules, gold, starting forces, and two purchase opportunities per computer turn.

Combat judgement scales without changing combat probabilities. Very Easy mostly responds to the attraction of an available target, while Easy applies light caution. Normal, Hard, and Expert increasingly compare the attacker’s value, the defender’s value, actual win chance, nearby friendly support, and nearby enemy support. Hard and Expert recognise and exploit a local numerical advantage; Expert applies the largest incentive. Hard and Expert preserve isolated Veterans in marginal fights, while an Expert Veteran with meaningful friendly support accepts sensible risk. Guaranteed Soldier victories against Catapults and recruitment of attacked drunk Soldiers are recognised as particularly valuable opportunities.

Raiders assigned to the same enemy castle now form simple attack waves. Normal, Hard, and Expert launch when two eligible raiders are committed near the target. Hard and Expert move the committed pair before unrelated units. Expert applies the strongest mutual-support scoring, gives high priority to an enemy Soldier blocking the final castle approach, and treats a third raider as reinforcement rather than a reason to delay. A forward raider may hold in a staging band five to eight squares from the target while another catches up. Once enough raiders are committed within nine squares, they receive stronger forward and mutual-support incentives. Hard and especially Expert accelerate against a lightly defended castle. Target selection also increasingly rewards exposed castles as difficulty rises. This coordination affects the approach only: a Soldier with an immediate castle attack still follows the established difficulty-based likelihood rather than waiting beside the castle.

Normal and stronger levels use a lightweight eight-direction terrain route map. Longboats require an explicit mission: empty vessels collect a nearby sober, non-carrier Soldier or pursue a reachable enemy Longboat, while crewed vessels navigate toward a usable enemy shore and retain passengers until a landing lies within eight spaces of an enemy castle. Catapults adopt situational defence, counter-battery, naval-interdiction, or siege priorities. Normal values the intended target and basic risk; Hard and Expert calculate the expected value across every weighted scatter square, including likely friendly losses, crewed-Longboat value, Veterans, treasure carriers, castle defenders, and enemy Catapults. They prefer firing positions around six to nine squares from the mission target, value a nearby Soldier escort, hold an already effective position, fire before committing a coordinated assault, and reassess after every impact so multiple Catapults do not waste shots on a destroyed target. Expert applies the strongest friendly-safety weighting. Every treasure carrier is assessed independently. A legal deposit beside home outranks combat and defence, while a fully occupied courtyard is cleared once any carrier is estimated within two turns. A carrier already beside home deposits automatically without having to move away and return. Distant treasure does not restrict ordinary purchasing or movement. The AI also penalises needless clustering and edge drift. Hard and Expert use lower acceptance thresholds than the earlier prototype so their better judgement does not paradoxically make them less active than Normal. Hard keeps a four-gold idle reserve and Expert keeps two. Expert applies the strongest home-congestion penalty when no immediate attacker threatens its castle, encourages spare units to join useful missions, favours limited siege support against substantial enemy land forces, and avoids buying Longboats that have no transport route or enemy fleet to answer. Prices, income, unit limits, and purchase opportunities remain identical across difficulties.

Computer purchasing is need-based rather than a fixed list. It scores Soldiers for basic army strength, treasure recovery, and emergency defence; Catapults for ranged support against enemy Soldiers and an under-supplied siege arm; and Longboats for sea-only routes or enemy naval activity. It strongly discourages buying another Longboat while an existing one is empty. Unless threatened or materially outnumbered, a computer faction stops purchasing at a soft limit of twelve total units. Every difficulty keeps the same prices, income, rules, starting forces, and maximum of two purchase opportunities per turn; stronger settings are better at choosing among the same legal options.

### Automated computer-player evaluation

The development build includes a headless computer-versus-computer tournament invoked with `npm run benchmark`. It uses the same complete computer-turn executor as visible play but skips Phaser rendering, interface updates, animation delays, and card panels. The default deterministic round-robin pairs all five difficulties, swaps faction colours for mixed pairings, disables saga cards to reduce noise, and applies a 60-round safety limit. Reports include win rate, average rounds, stalls, treasure deposits, purchases by unit type, Catapult shots, Longboat landings and rams, Veteran promotions, combat and castle activity, average units near home, ending gold, unused purchase opportunities, turns with blocked placement, and turns spent at the soft unit cap. Results are balance evidence rather than game rules: larger multi-seed samples are required before changing difficulty parameters.

## Proposed milestones

1. **Rules sandbox:** a plain grid, castles, turns, purchasing, the three units, movement, basic combat, and a victory condition.
2. **Playable hot-seat match:** setup for 1–4 players, computer opponents, event draws, pass screen, restart, and a full 20–30 minute game loop.
3. **Presentation pass:** polished pixel art, animation, sound, music, humour, accessibility, and touch-friendly layout.
4. **Web release candidate:** saved settings, rule explanations, tested browser support, performance and balance passes.
5. **Standalone exploration:** package the stable web build with Tauri.
6. **Mobile exploration:** adapt interaction and layout, then package with Capacitor if testing supports it.

## Reference study checklist

When source material is provided, record observations about:

- board layout and match flow;
- turn sequence and available actions;
- buying, prices, and income;
- movement and transport rules;
- combat and castle capture;
- unit roles and balance;
- what remains charming and intuitive;
- what is confusing, slow, or unnecessarily limited;
- audiovisual motifs that can inspire an original direction without being copied.

## Findings from the supplied instruction transcription

These are observations about the historical game, not automatically requirements for the new game.

### Original match structure

- Supported one to four participants in any mixture of human and computer control.
- Used a fixed faction order: blue, red, pink, then green.
- Activated a player's forces by category: land forces, crewed boats, catapults, catapult firing, and finally purchasing.
- Ended when only one castle remained; the victor also took control of defeated forces.

### Original movement and units

- The eight-direction controls indicate a square grid with diagonal movement.
- Default movement continued as far as possible in a chosen direction.
- An alternate order allowed both direction and a distance from one to nine spaces.
- A unit could remain still.
- Boats transported land forces and could ram opponents.
- Catapults moved and then fired separately. Human-controlled catapults had a nine-space firing limit, while computer catapults had an unlimited range.

### Original economy and map systems

- Human players began with 50 gold.
- Each turn, a human could buy at most one boat and one catapult, plus as many land forces as available castle space allowed.
- Treasure had to be carried from a chest back to a castle before increasing spending power.
- Computer opponents ignored spending limits and bought the maximum, giving them an opaque numerical advantage.
- Winter progressively froze the waterway from north to south.
- Drinking horns caused affected land forces to become uncontrollable.
- Catapults could interact with at least some map objects, including hazards and treasure.

### Design implications for the new game

- The strong mixture of simple orders and emergent map interactions is worth preserving.
- Longboats should support transport and may retain a clearly explained ramming action.
- Treasure delivery is a more engaging income source than passive income alone and deserves prototyping.
- Advancing winter ice is a thematic board-changing system and could become either a match timer, an event-card family, or a map rule.
- Drinking-horn chaos captures the desired humour, but the player should retain some meaningful response rather than losing control for an excessive period.
- The original activation sequence provides a useful prototype baseline, although selecting units in any order may feel more natural to modern players.
- The original computer advantages should not be copied. Computer difficulty should primarily come from better choices, with any explicit handicap visible to players.
- Taking all defeated pieces may accelerate the conclusion, but it could also produce a runaway leader. Prototype it alongside simpler castle elimination.
- The original square-grid movement is now the baseline against which a hex-grid experiment should be judged.

## Findings from the short demo recording

The supplied clip is a brief emulator demonstration in which Blue is largely inactive. It is useful visual evidence, but not a representative balance or strategy sample.

### Visual observations

- The battlefield is presented as one broad top-down play area rather than as individual decorated tiles.
- Land and water use large, flat, high-contrast regions. The fjord is immediately recognisable from its colour and shape.
- Faction colour does most of the work of identifying ownership.
- Unit symbols are extremely compact and abstract, allowing many pieces on screen but requiring prior knowledge to distinguish their roles.
- Groups can become visually tangled near castles and shorelines, especially where several same-colour pieces overlap or sit very close together.
- Selection and action feedback is economical, relying on small sprite changes or flashing rather than panels or elaborate effects.
- The recording includes emulator setup and is tightly framed, so it should not be treated as a complete interface or audio reference.

### Modernisation implications

- Retain the instant readability of flat land, water, and faction colours, while adding texture sparingly.
- Give Soldiers, Longboats, Catapults, castles, treasure, hazards, and projectiles unmistakable silhouettes at normal play size.
- Prevent unreadable unit piles through occupancy rules, compact formation markers, stack counters, or carefully spaced sprites.
- Highlight the active player, currently selected unit, legal path, destination, and attack result without filling the board with interface clutter.
- Use short movement and combat animations to clarify cause and effect, but keep turns brisk.
- Pair every faction colour with an emblem or sprite detail so ownership survives colour-vision differences and small mobile screens.
- Do not infer Blue's strength, pacing, or intended strategy from this clip because the owner explicitly notes that Blue barely participates.

## Findings from the longer YouTube gameplay recording

The 36-minute `zxspectrumgames4` video supplies longer raw gameplay with no narration, description, chapters, or captions. Visible behaviour is useful evidence, but ambiguous rules remain cross-checked against the instruction transcription.

### Interface and turn communication

- A persistent command strip occupies the bottom of the screen while leaving most space to the board.
- The strip combines the active chief's portrait, the currently acting unit icon, short prompts, direction guidance, and compact faction values.
- Normal and special movement orders are displayed directly in the command area.
- Catapult firing is a distinct prompted action after movement.
- Combat outcomes appear as text over the affected board area.
- The winner receives a prominent named-chief announcement rather than only a generic victory message.

### Match progression

- The opening board is easy to recognise from its large continuous fjord and four corner regions.
- Armies spread into open land while boats and shorelines create natural routes and bottlenecks.
- Unit concentrations grow substantially over the match, reinforcing the need for clear formation or stack presentation in the new game.
- Winter visibly transforms large connected areas of water, leaving fragmented channels and changing where boats and land units can operate.
- Late-game combat messages can overlap units and terrain, making simultaneous outcomes difficult to parse.
- A named chief helps a colour-coded faction feel more characterful despite the abstract pieces.

### Modernisation implications

- Preserve a compact, persistent turn-status area, but make every prompt clickable or touchable as well as readable.
- Show the entire normal turn sequence and current phase so casual players understand what happens next.
- Replace text drawn over active battles with short anchored result markers, animation, and an optional event log.
- Make seasonal freezing visually gradual and unambiguous, with warning states before a water tile becomes impassable or changes function.
- Use the chiefs as faction personalities for setup, reactions, humour, event cards, and victory presentation without copying the original names or portraits.
- Keep board-state changes dramatic while ensuring units remain visually distinct against both water and frozen terrain.

## Immediate design questions

These should be answered through reference study or a small prototype rather than prolonged speculation:

1. Are squares preferable to hexes after testing the current nine-space, eight-direction prototype?
2. What is the precise turn sequence?
3. How are income and unit purchasing calculated?
4. How does combat resolve, and how much randomness does it use?
5. What exactly captures a castle and wins the game?
6. When is an event drawn, and can a player make choices while resolving it?
7. What role do water, Longboats, and transported Soldiers play?
8. How much information, if any, is hidden during hot-seat play?
9. Should treasure require delivery to a castle, and can opponents intercept it?
10. Is progressive winter ice a standard rule, a map-specific rule, or part of the event deck?
11. When a castle falls, are its surviving pieces captured, removed, or left neutral?
12. What board dimensions keep travel meaningful without pushing matches beyond the 20–30 minute target?
13. Should players eventually be able to customise individual AI traits in addition to choosing one of the five difficulty levels?

