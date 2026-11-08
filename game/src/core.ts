import type {
  GameState,
  DrinkingHorn,
  EventCardId,
  EventDraw,
  GameOptions,
  Player,
  PlayerBattleStats,
  PlayerId,
  PlayerSetup,
  Position,
  Terrain,
  TreasureChest,
  Unit,
  UnitType,
} from "./types";

export const BOARD_WIDTH = 32;
export const BOARD_HEIGHT = 24;
export const TURN_INCOME = 1;
export const CATAPULT_FIRE_RANGE = 11;
export const WINTER_PHASES = 6;
export const WINTER_EARLIEST_ROUND = 4;
export const WINTER_LATEST_ROUND = 10;

export const UNIT_RULES: Record<
  UnitType,
  { name: string; cost: number; range: number; power: number; terrain: Terrain[] }
> = {
  soldier: { name: "Soldier", cost: 2, range: Number.MAX_SAFE_INTEGER, power: 3, terrain: ["land", "ice"] },
  longboat: { name: "Longboat", cost: 4, range: 9, power: 4, terrain: ["water"] },
  catapult: { name: "Catapult", cost: 8, range: 9, power: 2, terrain: ["land", "ice"] },
};

const PLAYER_DEFINITIONS: Record<
  PlayerId,
  Omit<Player, "controller" | "gold" | "sturdyLongboatProtection" | "castle" | "eliminated">
> = {
  blue: {
    id: "blue",
    name: "Blue",
    title: "Astrid the Audacious",
    color: 0x2d6cdf,
    cssColor: "#2d6cdf",
    emblem: "Wave",
  },
  red: {
    id: "red",
    name: "Red",
    title: "Ragnar the Reasonably Cross",
    color: 0xe34d44,
    cssColor: "#e34d44",
    emblem: "Flame",
  },
  pink: {
    id: "pink",
    name: "Pink",
    title: "Freya the Fearsome-ish",
    color: 0xf58ac6,
    cssColor: "#f58ac6",
    emblem: "Raven",
  },
  green: {
    id: "green",
    name: "Green",
    title: "Leif the Loud",
    color: 0x3d9b63,
    cssColor: "#3d9b63",
    emblem: "Pine",
  },
};

function emptyBattleStats(): PlayerBattleStats {
  return {
    unitsPurchased: { soldier: 0, longboat: 0, catapult: 0 },
    treasureChestsBanked: 0,
    goldBanked: 0,
    combatVictories: 0,
    unitsLost: 0,
    longboatsLost: 0,
    longboatsSunk: 0,
    catapultShots: 0,
    catapultHits: 0,
    friendlyFireHits: 0,
    castleAttacks: 0,
    castlesCaptured: 0,
    promotions: 0,
    drunkenIncidents: 0,
    sagaCardsDrawn: 0,
    sturdyLongboatSaves: 0,
  };
}

function battleStatsFor(state: GameState, playerId: PlayerId): PlayerBattleStats {
  return state.battleStats[playerId] ??= emptyBattleStats();
}

const CASTLE_ANCHORS: Position[] = [
  { x: 3, y: 5 },
  { x: BOARD_WIDTH - 6, y: 2 },
  { x: 6, y: BOARD_HEIGHT - 4 },
  { x: BOARD_WIDTH - 3, y: BOARD_HEIGHT - 7 },
];

export const EVENT_CARDS: readonly EventCardId[] = [
  "royal-ransom",
  "treasure-hunter",
  "veterans-tale",
  "sobering-thought",
  "ale-delivery",
  "hidden-hoard",
  "army-upkeep",
  "harbour-dues",
  "catapult-repairs",
  "the-persuader",
  "called-home",
  "man-overboard",
  "bad-viking",
  "bad-viking",
  "bandits",
  "inside-job",
  "loose-change",
  "the-deserter",
  "new-recruit",
  "wrong-address",
  "jarls-feast",
  "sturdy-longboat",
  "sturdy-longboat",
  "yule-festival",
  "berserker-rage",
  "berserker-rage",
  "high-winds",
  "shield-wall",
  "favourable-tide",
  "forgotten-rations",
];

/** The live deck samples ten of these harmless cards for each match. */
export const BENIGN_SAGA_CARD_POOL: readonly EventCardId[] = [
  "ravens-counsel", "jarls-beard", "ordinary-rock", "longboat-laundry", "mead-inspector", "axe-shaped-cloud",
  "tactical-goat", "helmet-inspection", "missing-spoon", "rune-misread", "missing-boot", "raven-union",
  "porridge-emergency", "axe-seminar", "jarls-new-hat", "legendary-nap", "suspicious-seagull", "beard-braiding",
  "herring-debate", "helgas-cabbage", "longhouse-draft", "runic-typo", "viking-yoga", "wrong-saga",
  "spare-helmet", "fjord-fashion", "taxidermy-workshop", "unhelpful-map", "thors-lost-sock", "quiet-battle-cry",
  "axe-polishing", "ferocious-duck",
];

export const BENIGN_SAGA_CARDS_PER_MATCH = 10;

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`;
}

export function terrainAt(state: GameState, position: Position): Terrain {
  return state.terrain[position.y * state.width + position.x] ?? "land";
}

export function isInside(state: GameState, position: Position): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < state.width && position.y < state.height;
}

function seededValue(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

/** Break up the correlations visible when nearby numeric seeds are inspected. */
function mixSeed(seed: number): number {
  let mixed = seed >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function generateTerrain(width: number, height: number, seed: number): Terrain[] {
  const terrain = Array.from<Terrain>({ length: width * height }).fill("land");
  const setTerrain = (x: number, y: number, value: Terrain) => {
    if (x >= 0 && y >= 0 && x < width && y < height) terrain[y * width + x] = value;
  };
  const stampWater = (centreX: number, centreY: number, radius = 2) => {
    for (let y = centreY - radius; y <= centreY + radius; y += 1) {
      for (let x = centreX - radius; x <= centreX + radius; x += 1) setTerrain(x, y, "water");
    }
  };

  const nextRandom = seededValue(mixSeed(seed ^ 0x464a4f52));
  // A one-square edge bank traps Soldiers against the map boundary. This
  // recipe always leaves a genuinely usable two-to-four-square land bank.
  const sideMargin = () => 2 + Math.floor(nextRandom() * 3);
  const subtleShelf = (length: number): { start: number; end: number } => {
    // Keep both ends straight so adjoining channels retain broad corners.
    // The middle shelf is deliberately modest: enough to break up a ruler-
    // straight bank without turning a readable classic map into a maze.
    const shelfLength = Math.max(3, Math.min(6, Math.floor(length / 5)));
    const earliest = 3;
    const latest = Math.max(earliest, length - shelfLength - 3);
    const start = earliest + Math.floor(nextRandom() * (latest - earliest + 1));
    return { start, end: start + shelfLength - 1 };
  };
  const stampBentHorizontal = (fromX: number, toX: number, y: number, inwardY: number) => {
    const length = toX - fromX + 1;
    const shelf = subtleShelf(length);
    for (let step = 0; step < length; step += 1) {
      stampWater(fromX + step, y + (step >= shelf.start && step <= shelf.end ? inwardY : 0), 1);
    }
  };
  const stampBentVertical = (x: number, fromY: number, toY: number, inwardX: number) => {
    const length = toY - fromY + 1;
    const shelf = subtleShelf(length);
    for (let step = 0; step < length; step += 1) {
      stampWater(x + (step >= shelf.start && step <= shelf.end ? inwardX : 0), fromY + step, 1);
    }
  };

  // One map in three uses a deliberately classic-looking island layout.  It
  // includes a separate inner waterway, but both waterways are broad enough
  // for Longboats: there are no decorative, unusable puddles.
  // Deliberately select by the seed rather than the first value of the small
  // random sequence.  The latter makes neighbouring diagnostic seeds cluster
  // into the same family, which looks suspiciously repetitive during testing.
  if ((seed >>> 0) % 3 === 0) {
    // Classic maps reserve a proper side bank for their fixed harbour regions.
    // This still meets the no-one-square-strip rule; edge-touching water is
    // supplied by the connected-fjord family below.
    const leftMargin = 2 + Math.floor(nextRandom() * 3);
    const rightMargin = 2 + Math.floor(nextRandom() * 3);
    const left = leftMargin + 1;
    const right = width - 2 - rightMargin;
    const top = 3 + Math.floor(nextRandom() * 2);
    const bottom = height - 5 - Math.floor(nextRandom() * 2);

    // An open, asymmetric outer fjord creates a central land mass rather than
    // the same central river on every match. Each long channel has one small
    // inward shelf, breaking up the rectangular banks while the overlapping
    // three-by-three stamps preserve a continuous route for horizontal boats.
    stampBentHorizontal(left, right, top, 1);
    stampBentVertical(right, top + 2, bottom, -1);
    stampBentHorizontal(left + 2, right, bottom, -1);
    stampBentVertical(left, top + 5, bottom - 3, 1);

    // A detached internal inlet varies in length and position.  Keeping two
    // clear land squares from the outer fjord makes the separation intentional.
    const inletX = Math.max(left + 6, Math.min(right - 6, Math.floor(width / 2) + (nextRandom() > 0.5 ? 2 : -2)));
    const inletTop = top + 5 + Math.floor(nextRandom() * 3);
    const inletLength = 4 + Math.floor(nextRandom() * 4);
    for (let y = inletTop; y <= Math.min(bottom - 4, inletTop + inletLength); y += 1) stampWater(inletX, y, 1);
    if (nextRandom() > 0.45) {
      const inletDirection = nextRandom() > 0.5 ? 1 : -1;
      const inletY = inletTop + 1 + Math.floor(nextRandom() * Math.max(1, inletLength - 1));
      for (let step = 1; step <= 3 + Math.floor(nextRandom() * 3); step += 1) stampWater(inletX + step * inletDirection, inletY, 1);
    }
  } else {
    // A connected braided fjord.  The trunk and branches vary in count,
    // direction, reach and bend, so water is sometimes much closer to either
    // side of the map without acquiring a fixed left/right bias.
    const centres = new Map<number, number>();
    // Keep the *water*, rather than just the centre line, two to four tiles
    // in from either side. Never leave a one-tile land strip.
    const leftWaterEdge = sideMargin();
    const rightWaterEdge = width - 1 - sideMargin();
    const leftCentreLimit = leftWaterEdge + 1;
    const rightCentreLimit = rightWaterEdge - 1;
    let centreX = 7 + Math.floor(nextRandom() * Math.max(1, width - 14));
    const trunkTop = 3 + Math.floor(nextRandom() * 3);
    const trunkBottom = height - 4 - Math.floor(nextRandom() * 3);
    for (let y = trunkTop; y <= trunkBottom; y += 1) {
      if (y > trunkTop && nextRandom() > 0.44) centreX += nextRandom() > 0.5 ? 1 : -1;
      centreX = Math.max(leftCentreLimit, Math.min(rightCentreLimit, centreX));
      centres.set(y, centreX);
      stampWater(centreX, y, 1);
    }

    // Each home region gets a connected, boat-wide reach of the fjord.  This
    // keeps castle moorings dependable without pinning water to one side of
    // the board.  The exact height and the wandering trunk still vary.
    const harbourBranches = [
      { y: 7, direction: -1, endX: leftCentreLimit },
      { y: 4, direction: 1, endX: rightCentreLimit },
      { y: height - 6, direction: -1, endX: leftCentreLimit },
      { y: height - 5, direction: 1, endX: rightCentreLimit },
    ];
    for (const branch of harbourBranches) {
      const branchY = Math.max(trunkTop + 1, Math.min(trunkBottom - 1, branch.y + Math.floor(nextRandom() * 3) - 1));
      const originX = centres.get(branchY) ?? centreX;
      for (let x = originX; branch.direction < 0 ? x >= branch.endX : x <= branch.endX; x += branch.direction) {
        stampWater(x, branchY, 1);
      }
    }

    const branchCount = 3 + Math.floor(nextRandom() * 3);
    for (let branch = 0; branch < branchCount; branch += 1) {
      const branchY = trunkTop + 1 + Math.floor(nextRandom() * Math.max(1, trunkBottom - trunkTop - 1));
      const originX = centres.get(branchY) ?? centreX;
      const direction = nextRandom() > 0.5 ? 1 : -1;
      const length = 5 + Math.floor(nextRandom() * 10);
      let branchLine = branchY;
      for (let step = 0; step <= length; step += 1) {
        if (step > 1 && nextRandom() > 0.66) branchLine += nextRandom() > 0.5 ? 1 : -1;
        branchLine = Math.max(2, Math.min(height - 3, branchLine));
        const x = originX + step * direction;
        if (x < leftCentreLimit || x > rightCentreLimit) break;
        stampWater(x, branchLine, 1);
      }
    }
  }

  return terrain;
}

/** Whether a Soldier can travel from start to target in one unobstructed straight line. */
function hasOpenSoldierLine(
  terrain: Terrain[],
  width: number,
  height: number,
  start: Position,
  target: Position,
): boolean {
  const differenceX = target.x - start.x;
  const differenceY = target.y - start.y;
  if (differenceX === 0 && differenceY === 0) return false;
  if (differenceX !== 0 && differenceY !== 0 && Math.abs(differenceX) !== Math.abs(differenceY)) return false;
  const stepX = Math.sign(differenceX);
  const stepY = Math.sign(differenceY);
  let x = start.x + stepX;
  let y = start.y + stepY;
  while (x !== target.x || y !== target.y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (!(["land", "ice"] as Terrain[]).includes(terrain[y * width + x]!)) return false;
    x += stepX;
    y += stepY;
  }
  return true;
}

/** Prevent a starting courtyard from becoming a first-turn launch rail into another castle. */
function hasImmediateCastleLane(
  terrain: Terrain[],
  width: number,
  height: number,
  home: Position,
  enemyCastle: Position,
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const launch = { x: home.x + dx, y: home.y + dy };
      if (
        launch.x < 0 || launch.y < 0 || launch.x >= width || launch.y >= height ||
        terrain[launch.y * width + launch.x] !== "land"
      ) continue;
      if (hasOpenSoldierLine(terrain, width, height, launch, enemyCastle)) return true;
    }
  }
  return false;
}

/**
 * Choose home regions before assigning faction colours to them. Two-player
 * games use diagonally opposite regions. Three-player games use one of two
 * broad triangular arrangements: one home near the centre of a long board
 * edge and two homes spread across the opposite edge. This avoids making one
 * faction the middle castle in an L-shaped selection of three corners.
 */
function chooseCastleAnchors(playerCount: number, nextRandom: () => number): Position[] {
  let indices: number[];
  let anchors: Position[];
  if (playerCount === 2) {
    const oppositePairs = [[0, 3], [1, 2]];
    indices = [...oppositePairs[Math.floor(nextRandom() * oppositePairs.length)]!];
    anchors = indices.map((index) => ({ ...CASTLE_ANCHORS[index]! }));
  } else if (playerCount === 3) {
    const triangularSets: Position[][] = [
      [
        { x: Math.floor(BOARD_WIDTH / 2) - 1, y: 2 },
        { ...CASTLE_ANCHORS[2]! },
        { ...CASTLE_ANCHORS[3]! },
      ],
      [
        { ...CASTLE_ANCHORS[0]! },
        { ...CASTLE_ANCHORS[1]! },
        { x: Math.floor(BOARD_WIDTH / 2) + 1, y: BOARD_HEIGHT - 3 },
      ],
    ];
    anchors = triangularSets[Math.floor(nextRandom() * triangularSets.length)]!
      .map((anchor) => ({ ...anchor }));
  } else {
    indices = CASTLE_ANCHORS.map((_, index) => index);
    anchors = indices.map((index) => ({ ...CASTLE_ANCHORS[index]! }));
  }

  // Faction identity remains independently seed-randomized within the chosen
  // regions, so no colour gains a permanent corner or pairing.
  for (let index = anchors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [anchors[index], anchors[swapIndex]] = [anchors[swapIndex]!, anchors[index]!];
  }
  return anchors;
}

function chooseCastlePositions(
  terrain: Terrain[],
  width: number,
  height: number,
  playerIds: PlayerId[],
  seed: number,
): Record<PlayerId, Position> {
  const nextRandom = seededValue(seed ^ 0x43415354);
  const positions = {} as Record<PlayerId, Position>;
  const used = new Set<string>();
  const sharedLand = largestLandComponent(terrain, width, height);
  const shuffledAnchors = chooseCastleAnchors(playerIds.length, nextRandom);

  const isLand = (position: Position) =>
    position.x >= 1 &&
    position.y >= 1 &&
    position.x < width - 1 &&
    position.y < height - 1 &&
    terrain[position.y * width + position.x] === "land" &&
    sharedLand.has(positionKey(position)) &&
    hasCastleMooring(terrain, width, height, position) &&
    hasStartingFormationSpace(terrain, width, height, position) &&
    adjacentLandCount(terrain, width, height, position) >= 3 &&
    Object.values(positions).every((existing) =>
      !hasImmediateCastleLane(terrain, width, height, position, existing) &&
      !hasImmediateCastleLane(terrain, width, height, existing, position),
    ) &&
    !used.has(positionKey(position));

  playerIds.forEach((playerId, playerIndex) => {
    const anchor = shuffledAnchors[playerIndex]!;
    const varied = {
      x: anchor.x + Math.floor(nextRandom() * 3) - 1,
      y: anchor.y + Math.floor(nextRandom() * 3) - 1,
    };
    let chosen = isLand(varied) ? varied : undefined;
    for (let radius = 1; !chosen && radius <= 14; radius += 1) {
      for (let dy = -radius; dy <= radius && !chosen; dy += 1) {
        for (let dx = -radius; dx <= radius && !chosen; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const candidate = { x: varied.x + dx, y: varied.y + dy };
          if (isLand(candidate)) chosen = candidate;
        }
      }
    }
    if (!chosen) throw new Error(`Unable to place ${playerId} castle on seed ${seed}.`);
    positions[playerId] = chosen;
    used.add(positionKey(chosen));
  });
  return positions;
}

function adjacentLandCount(terrain: Terrain[], width: number, height: number, origin: Position): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x >= 0 && y >= 0 && x < width && y < height && terrain[y * width + x] === "land") count += 1;
    }
  }
  return count;
}

/** A castle must have an adjacent centre square for a full horizontal Longboat berth. */
function hasCastleMooring(terrain: Terrain[], width: number, height: number, castle: Position): boolean {
  for (let y = Math.max(0, castle.y - 2); y <= Math.min(height - 1, castle.y + 2); y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const boatCells = [{ x: x - 1, y }, { x, y }, { x: x + 1, y }];
      if (
        boatCells.every((cell) => terrain[cell.y * width + cell.x] === "water") &&
        Math.max(Math.abs(x - castle.x), Math.abs(y - castle.y)) <= 1
      ) return true;
    }
  }
  return false;
}

/**
 * Starting forces are deliberately clustered around their home castle.  Check
 * that a horizontal two-tile Catapult, a horizontal Longboat and two Soldiers
 * can all be placed there without sharing a square.
 */
function hasStartingFormationSpace(terrain: Terrain[], width: number, height: number, castle: Position): boolean {
  const adjacent = (position: Position) =>
    Math.max(Math.abs(position.x - castle.x), Math.abs(position.y - castle.y)) === 1;
  const isLand = (position: Position) =>
    position.x >= 0 && position.y >= 0 && position.x < width && position.y < height &&
    terrain[position.y * width + position.x] === "land";
  const isWater = (position: Position) =>
    position.x >= 0 && position.y >= 0 && position.x < width && position.y < height &&
    terrain[position.y * width + position.x] === "water";

  for (let catapultY = castle.y - 1; catapultY <= castle.y + 1; catapultY += 1) {
    for (let catapultX = castle.x - 1; catapultX <= castle.x + 1; catapultX += 1) {
      const catapult = { x: catapultX, y: catapultY };
      const catapultCells = [catapult, { x: catapult.x + 1, y: catapult.y }];
      if (!adjacent(catapult) || !catapultCells.every(isLand)) continue;
      if (catapultCells.some((cell) => cell.x === castle.x && cell.y === castle.y)) continue;

      for (let boatY = castle.y - 1; boatY <= castle.y + 1; boatY += 1) {
        for (let boatX = castle.x - 1; boatX <= castle.x + 1; boatX += 1) {
          const boat = { x: boatX, y: boatY };
          const boatCells = [{ x: boat.x - 1, y: boat.y }, boat, { x: boat.x + 1, y: boat.y }];
          if (!adjacent(boat) || !boatCells.every(isWater)) continue;
          const occupied = new Set([...catapultCells, ...boatCells].map(positionKey));
          const freeSoldierSquares = [-1, 0, 1].flatMap((dy) =>
            [-1, 0, 1].map((dx) => ({ x: castle.x + dx, y: castle.y + dy })),
          ).filter((position) =>
            !(position.x === castle.x && position.y === castle.y) &&
            isLand(position) &&
            !occupied.has(positionKey(position)),
          );
          if (freeSoldierSquares.length >= 2) return true;
        }
      }
    }
  }
  return false;
}

function largestLandComponent(terrain: Terrain[], width: number, height: number): Set<string> {
  const unseen = new Set<string>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (terrain[y * width + x] === "land") unseen.add(positionKey({ x, y }));
    }
  }
  let largest = new Set<string>();
  while (unseen.size > 0) {
    const first = unseen.values().next().value as string;
    const component = new Set([first]);
    const queue = [first];
    unseen.delete(first);
    while (queue.length > 0) {
      const [x, y] = queue.shift()!.split(",").map(Number) as [number, number];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const key = `${x + dx},${y + dy}`;
        if (unseen.delete(key)) {
          component.add(key);
          queue.push(key);
        }
      }
    }
    if (component.size > largest.size) largest = component;
  }
  return largest;
}

export function createGame(
  setups: PlayerSetup[],
  seed = 0x56494b49,
  options: GameOptions = {},
): GameState {
  const activeSetups = setups.filter(
    (setup): setup is PlayerSetup & { controller: Exclude<PlayerSetup["controller"], "off"> } =>
      setup.controller !== "off",
  );
  if (activeSetups.length < 2) throw new Error("At least two factions are required.");

  const terrain = generateTerrain(BOARD_WIDTH, BOARD_HEIGHT, seed);
  const castlePositions = chooseCastlePositions(
    terrain,
    BOARD_WIDTH,
    BOARD_HEIGHT,
    activeSetups.map((setup) => setup.id),
    seed,
  );
  let players = activeSetups.map((setup) => ({
    ...PLAYER_DEFINITIONS[setup.id],
    controller: setup.controller,
    gold: 50,
    sturdyLongboatProtection: 0,
    castle: { ...castlePositions[setup.id] },
    eliminated: false,
  }));

  const randomPlayerOrder = options.randomPlayerOrder ?? false;
  const randomStartingPlayer = options.randomStartingPlayer ?? false;
  if (randomPlayerOrder) {
    const nextOrderRandom = seededValue(mixSeed(seed ^ 0x4f524445));
    players = players.slice();
    for (let index = players.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(nextOrderRandom() * (index + 1));
      [players[index], players[swapIndex]] = [players[swapIndex]!, players[index]!];
    }
  }
  if (randomStartingPlayer) {
    const nextStarterRandom = seededValue(mixSeed(seed ^ 0x53544152));
    const startingIndex = Math.floor(nextStarterRandom() * players.length);
    players = [...players.slice(startingIndex), ...players.slice(0, startingIndex)];
  }

  const turnOrder = players.map((player) => player.name).join(" → ");
  const winterEnabled = options.winterEnabled ?? true;
  const winterRandom = seededValue(mixSeed(seed ^ 0x57494e54));
  const winterStartRound = WINTER_EARLIEST_ROUND + Math.floor(
    winterRandom() * (WINTER_LATEST_ROUND - WINTER_EARLIEST_ROUND + 1),
  );
  const eventCardFrequency = options.eventCardFrequency
    ?? (options.eventDeckEnabled === false ? "off" : "every-two-turns");

  const state: GameState = {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    terrain,
    players,
    units: [],
    treasures: [],
    drinkingHorns: [],
    eventCardFrequency,
    eventDeckEnabled: eventCardFrequency !== "off",
    randomStartingPlayer,
    randomPlayerOrder,
    winterEnabled,
    winterStartRound,
    winterPhase: 0,
    eventDeck: [],
    eventDiscard: [],
    eventSequence: 0,
    completedTurns: 0,
    battleStats: Object.fromEntries(players.map((player) => [player.id, emptyBattleStats()])),
    aiPlans: {},
    activePlayerIndex: 0,
    turnPhase: "movement",
    nextUnitSequence: 1,
    round: 1,
    seed: seed >>> 0,
    log: [
      `${players[0]!.name} takes the first turn. Order: ${turnOrder}.`,
      "The horns sound. The castle borrowing season has begun.",
    ],
  };

  for (const player of players) {
    if (!placeStartingForces(state, player)) throw new Error(`Unable to place ${player.name}'s starting forces.`);
  }

  createTreasures(state, seed);
  createDrinkingHorns(state, seed);
  if (state.eventDeckEnabled) {
    const benignCards = shuffleEventCards(state, BENIGN_SAGA_CARD_POOL).slice(0, BENIGN_SAGA_CARDS_PER_MATCH);
    state.eventDeck = shuffleEventCards(state, [...EVENT_CARDS, ...benignCards]);
  }

  return state;
}

/** Find a complete nearby starting formation, so a first legal piece cannot block the rest. */
function placeStartingForces(state: GameState, player: Player): boolean {
  const types: UnitType[] = ["longboat", "soldier", "soldier", "soldier"];
  const placeNext = (index: number): boolean => {
    if (index === types.length) return true;
    const type = types[index]!;
    const positions = adjacentStartingPositions(state, player, type);
    for (const position of positions) {
      state.units.push({
        id: nextUnitId(state, player.id, type),
        playerId: player.id,
        type,
        position,
        moved: false,
        fired: false,
        facing: type === "longboat" ? { x: 1, y: 0 } : undefined,
      });
      if (placeNext(index + 1)) return true;
      state.units.pop();
    }
    return false;
  };
  return placeNext(0);
}

function adjacentStartingPositions(state: GameState, player: Player, type: UnitType): Position[] {
  const positions: Position[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const position = { x: player.castle.x + dx, y: player.castle.y + dy };
      if (!isInside(state, position) || unitAt(state, position) || playerAtCastle(state, position)) continue;
      if (
        type === "longboat"
          ? canPlaceLongboat(state, position, { x: 1, y: 0 })
          : type === "catapult"
            ? canPlaceCatapult(state, position)
          : UNIT_RULES[type].terrain.includes(terrainAt(state, position))
      ) positions.push(position);
    }
  }
  return positions;
}

function createTreasures(state: GameState, seed: number): void {
  const nextRandom = seededValue(seed ^ 0x54524541);
  const candidates: Position[] = [];
  for (let y = 1; y < state.height - 1; y += 1) {
    for (let x = 1; x < state.width - 1; x += 1) {
      const position = { x, y };
      const nearCastle = state.players.some(
        (player) => Math.max(Math.abs(player.castle.x - x), Math.abs(player.castle.y - y)) < 4,
      );
      if (terrainAt(state, position) === "land" && !unitAt(state, position) && !playerAtCastle(state, position) && !nearCastle) {
        candidates.push(position);
      }
    }
  }
  for (let index = 0; index < state.players.length && candidates.length > 0; index += 1) {
    const chosenIndex = Math.floor(nextRandom() * candidates.length);
    const position = candidates.splice(chosenIndex, 1)[0]!;
    state.treasures.push({
      id: `chest-${index + 1}`,
      value: 10 + Math.floor(nextRandom() * 5) * 10,
      position,
    });
  }
}

/** Two neutral horns per participating faction keep the mischief present without overwhelming the board. */
function createDrinkingHorns(state: GameState, seed: number): void {
  const nextRandom = seededValue(seed ^ 0x484f524e);
  const candidates: Position[] = [];
  for (let y = 1; y < state.height - 1; y += 1) {
    for (let x = 1; x < state.width - 1; x += 1) {
      const position = { x, y };
      const nearCastle = state.players.some(
        (player) => Math.max(Math.abs(player.castle.x - x), Math.abs(player.castle.y - y)) < 4,
      );
      if (
        terrainAt(state, position) === "land" &&
        !unitAt(state, position) &&
        !playerAtCastle(state, position) &&
        !treasureAt(state, position) &&
        !nearCastle
      ) candidates.push(position);
    }
  }
  const hornCount = state.players.length * 2;
  for (let index = 0; index < hornCount && candidates.length > 0; index += 1) {
    const chosenIndex = Math.floor(nextRandom() * candidates.length);
    const position = candidates.splice(chosenIndex, 1)[0]!;
    state.drinkingHorns.push({ id: `horn-${index + 1}`, position });
  }
}

function nextUnitId(state: GameState, playerId: PlayerId, type: UnitType): string {
  const sequence = state.nextUnitSequence;
  state.nextUnitSequence += 1;
  return `${playerId}-${type}-${sequence}`;
}

export function activePlayer(state: GameState): Player {
  const player = state.players[state.activePlayerIndex];
  if (!player) throw new Error("Game has no active player.");
  return player;
}

export function unitAt(state: GameState, position: Position): Unit | undefined {
  return state.units.find((unit) => {
    if (unit.embarkedOn) return false;
    return unitFootprint(unit).some((cell) => cell.x === position.x && cell.y === position.y);
  });
}

export function treasureAt(state: GameState, position: Position): TreasureChest | undefined {
  return state.treasures.find(
    (treasure) =>
      !treasure.carriedBy && treasure.position.x === position.x && treasure.position.y === position.y,
  );
}

export function carriedTreasure(state: GameState, unitId: string): TreasureChest | undefined {
  return state.treasures.find((treasure) => treasure.carriedBy === unitId);
}

/**
 * Bank a carried chest whenever its Soldier arrives beside their own castle.
 * This is deliberately shared by ordinary movement and special placement
 * effects, so an event cannot leave a treasure carrier blocking the castle.
 */
function bankTreasureAtHome(state: GameState, soldier: Unit): number | undefined {
  if (soldier.type !== "soldier" || soldier.drunk) return undefined;
  const treasure = carriedTreasure(state, soldier.id);
  const player = state.players.find((candidate) => candidate.id === soldier.playerId);
  if (!treasure || !player) return undefined;
  if (Math.max(
    Math.abs(soldier.position.x - player.castle.x),
    Math.abs(soldier.position.y - player.castle.y),
  ) !== 1) return undefined;

  player.gold += treasure.value;
  const stats = battleStatsFor(state, soldier.playerId);
  stats.treasureChestsBanked += 1;
  stats.goldBanked += treasure.value;
  state.treasures = state.treasures.filter((candidate) => candidate.id !== treasure.id);
  state.log.unshift(`${capitalize(soldier.playerId)} deposits treasure beside the castle and banks ${treasure.value} gold!`);
  return treasure.value;
}

/** Bank every carried chest already standing beside its owner's home castle. */
function bankWaitingTreasure(state: GameState, playerId: PlayerId): void {
  for (const unit of state.units.filter((candidate) =>
    candidate.playerId === playerId && candidate.type === "soldier" && !candidate.embarkedOn,
  )) {
    bankTreasureAtHome(state, unit);
  }
}

export function drinkingHornAt(state: GameState, position: Position): DrinkingHorn | undefined {
  return state.drinkingHorns.find(
    (horn) => horn.position.x === position.x && horn.position.y === position.y,
  );
}

export function unitFootprint(unit: Unit, position = unit.position): Position[] {
  if (unit.type === "soldier") return [{ ...position }];
  if (unit.type === "catapult") return [{ ...position }, { x: position.x + 1, y: position.y }];
  return [-1, 0, 1].map((offset) => ({ x: position.x + offset, y: position.y }));
}

export function longboatPassengers(state: GameState, boatId: string): Unit[] {
  return state.units.filter((unit) => unit.type === "soldier" && unit.embarkedOn === boatId);
}

export function longboatIsFrozen(state: GameState, boat: Unit): boolean {
  return boat.type === "longboat" && unitFootprint(boat).some((cell) => terrainAt(state, cell) === "ice");
}

function unitAtExcept(state: GameState, position: Position, ignoredId: string): Unit | undefined {
  return state.units.find(
    (unit) =>
      unit.id !== ignoredId &&
      !unit.embarkedOn &&
      unitFootprint(unit).some((cell) => cell.x === position.x && cell.y === position.y),
  );
}

function canPlaceLongboat(
  state: GameState,
  position: Position,
  facing: Position,
  ignoredId = "",
): boolean {
  const mock: Unit = {
    id: ignoredId,
    playerId: activePlayer(state).id,
    type: "longboat",
    position,
    facing,
    moved: false,
    fired: false,
  };
  return unitFootprint(mock).every(
    (cell) =>
      isInside(state, cell) &&
      terrainAt(state, cell) === "water" &&
      !unitAtExcept(state, cell, ignoredId) &&
      !movementObstacleAt(state, cell),
  );
}

/** Returns the sole enemy Longboat the moving boat would strike, if it has a clean ram. */
function rammableLongboatAt(state: GameState, attacker: Unit, position: Position): Unit | undefined {
  if (attacker.type !== "longboat") return undefined;
  const movingFootprint = unitFootprint(attacker, position);
  if (
    !movingFootprint.every(
      (cell) => isInside(state, cell) && terrainAt(state, cell) === "water" && !playerAtCastle(state, cell),
    )
  ) return undefined;

  const collisions = new Map<string, Unit>();
  for (const cell of movingFootprint) {
    const occupant = unitAtExcept(state, cell, attacker.id);
    if (occupant) collisions.set(occupant.id, occupant);
  }
  if (collisions.size !== 1) return undefined;
  const target = [...collisions.values()][0];
  return target?.type === "longboat" && target.playerId !== attacker.playerId ? target : undefined;
}

function canPlaceCatapult(state: GameState, position: Position, ignoredId = ""): boolean {
  const mock: Unit = {
    id: ignoredId,
    playerId: activePlayer(state).id,
    type: "catapult",
    position,
    moved: false,
    fired: false,
  };
  return unitFootprint(mock).every(
    (cell) =>
      isInside(state, cell) &&
      UNIT_RULES.catapult.terrain.includes(terrainAt(state, cell)) &&
      !unitAtExcept(state, cell, ignoredId) &&
      !movementObstacleAt(state, cell),
  );
}

export function playerAtCastle(state: GameState, position: Position): Player | undefined {
  return state.players.find(
    (player) =>
      player.castle.x === position.x && player.castle.y === position.y,
  );
}

/**
 * Static board objects stop multi-square movement. Interactive Soldiers may
 * still enter a chest or horn square, but must end their move there. Add
 * future saga-card obstacles here so every unit type inherits the same rule.
 */
function movementObstacleAt(state: GameState, position: Position): "castle" | "treasure" | "drinking-horn" | undefined {
  if (playerAtCastle(state, position)) return "castle";
  if (treasureAt(state, position)) return "treasure";
  if (drinkingHornAt(state, position)) return "drinking-horn";
  return undefined;
}

export function getLegalMoves(state: GameState, unitId: string): Position[] {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.embarkedOn || unit.moved || state.winnerId || state.turnPhase !== "movement") return [];
  if (unit.playerId !== activePlayer(state).id) return [];
  const pendingCatapult = getPendingCatapult(state);
  if (pendingCatapult && pendingCatapult.id !== unit.id) return [];

  const rule = UNIT_RULES[unit.type];
  const moves: Position[] = [];
  const directions = [-1, 0, 1].flatMap((dx) =>
    [-1, 0, 1]
      .filter((dy) => dx !== 0 || dy !== 0)
      .map((dy) => ({ dx, dy })),
  );
  const addForcedSoldierStop = (dx: number, dy: number, distance: number) => {
    if (unit.type !== "soldier" || distance <= 10) return;
    const stop = {
      x: unit.position.x + dx * (distance - 1),
      y: unit.position.y + dy * (distance - 1),
    };
    if (!moves.some((position) => position.x === stop.x && position.y === stop.y)) moves.push(stop);
  };

  for (const { dx, dy } of directions) {
    for (let distance = 1; distance <= rule.range; distance += 1) {
      const destination = {
        x: unit.position.x + dx * distance,
        y: unit.position.y + dy * distance,
      };
      if (unit.type === "longboat") {
        if (rammableLongboatAt(state, unit, destination)) {
          moves.push(destination);
          break;
        }
        if (!canPlaceLongboat(state, destination, { x: dx, y: dy }, unit.id)) break;
        moves.push(destination);
        continue;
      }
      if (unit.type === "catapult") {
        if (!canPlaceCatapult(state, destination, unit.id)) break;
        moves.push(destination);
        continue;
      }

      if (!isInside(state, destination)) {
        addForcedSoldierStop(dx, dy, distance);
        break;
      }

      const occupyingUnit = unitAt(state, destination);
      const castle = playerAtCastle(state, destination);
      if (occupyingUnit) {
        if (
          unit.type === "soldier" &&
          !unit.drunk &&
          occupyingUnit.type === "longboat" &&
          occupyingUnit.playerId === unit.playerId &&
          !longboatIsFrozen(state, occupyingUnit) &&
          longboatPassengers(state, occupyingUnit.id).length < 3
        ) {
          moves.push(occupyingUnit.position);
        }
        // A Longboat is transport, never a target for a Soldier.  This keeps
        // the boarding rule unambiguous: only a friendly boat with a free
        // seat can be entered.  Enemy Longboats stop the Soldier like any
        // other impassable object.
        if (
          occupyingUnit.playerId !== unit.playerId &&
          !(unit.type === "soldier" && occupyingUnit.type === "longboat")
        ) {
          moves.push(destination);
        } else {
          addForcedSoldierStop(dx, dy, distance);
        }
        break;
      }
      if (!rule.terrain.includes(terrainAt(state, destination))) {
        addForcedSoldierStop(dx, dy, distance);
        break;
      }
      if (castle) {
        if (!castle.eliminated && castle.id !== unit.playerId && unit.type === "soldier") moves.push(destination);
        else addForcedSoldierStop(dx, dy, distance);
        break;
      }
      if (unit.type === "soldier" && treasureAt(state, destination)) {
        moves.push(destination);
        break;
      }
      if (unit.type === "soldier" && drinkingHornAt(state, destination)) {
        moves.push(destination);
        break;
      }
      if (unit.type !== "soldier" || distance <= 9) moves.push(destination);
    }
  }
  return moves;
}

function random(state: GameState): number {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 0x100000000;
}

function shuffleEventCards(state: GameState, cards: readonly EventCardId[]): EventCardId[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random(state) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

function eventDistance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function eventOpenPosition(state: GameState, position: Position, allowIce = false): boolean {
  const permittedTerrain: Terrain[] = allowIce ? ["land", "ice"] : ["land"];
  return (
    isInside(state, position) &&
    permittedTerrain.includes(terrainAt(state, position)) &&
    !unitAt(state, position) &&
    !playerAtCastle(state, position) &&
    !treasureAt(state, position) &&
    !drinkingHornAt(state, position)
  );
}

function eventOpenPositionsNear(
  state: GameState,
  origin: Position,
  radius: number,
  allowIce = false,
): Position[] {
  const positions: Position[] = [];
  for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
    for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
      const position = { x, y };
      if (eventDistance(origin, position) > radius || !eventOpenPosition(state, position, allowIce)) continue;
      positions.push(position);
    }
  }
  return positions.sort((a, b) => eventDistance(origin, a) - eventDistance(origin, b) || a.y - b.y || a.x - b.x);
}

function eventOpenPositionsAtLeast(
  state: GameState,
  origin: Position,
  minimumDistance: number,
): Position[] {
  const positions: Position[] = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const position = { x, y };
      if (eventDistance(origin, position) < minimumDistance || !eventOpenPosition(state, position)) continue;
      positions.push(position);
    }
  }
  return positions;
}

/** Find the nearest square where a loose chest can exist as its own board object. */
function nearestLooseTreasurePosition(state: GameState, origin: Position): Position | undefined {
  return eventOpenPositionsNear(state, origin, Math.max(state.width, state.height), true)[0];
}

/**
 * Normally a moving Viking collects the chest it enters. This fallback keeps
 * the one-object-per-square invariant when an ineligible unit (for example a
 * drunk Viking) finishes on treasure dropped during combat.
 */
function relocateLooseTreasureUnderUnit(state: GameState, unit: Unit): void {
  const footprintKeys = new Set(unitFootprint(unit).map(positionKey));
  for (const treasure of state.treasures) {
    if (treasure.carriedBy || !footprintKeys.has(positionKey(treasure.position))) continue;
    const position = nearestLooseTreasurePosition(state, treasure.position);
    if (position) treasure.position = { ...position };
  }
}

const BENIGN_SAGA_OUTCOMES: Partial<Record<EventCardId, string>> = {
  "ravens-counsel": "A raven offers excellent advice, but declines to explain any of it.",
  "jarls-beard": "The Jarl's beard is admired from every possible angle. It accepts the praise graciously.",
  "ordinary-rock": "A perfectly ordinary rock is found to be exactly where it was left. Suspicious.",
  "longboat-laundry": "Longboat laundry flaps bravely in the fjord breeze. One sock remains unclaimed.",
  "mead-inspector": "The mead inspector declares the barrel 'adequately meady' and requests another sample.",
  "axe-shaped-cloud": "An axe-shaped cloud drifts past without attacking anyone. This time.",
  "tactical-goat": "A goat studies the battle map, eats the northern coastline, and is promoted to cartographer.",
  "helmet-inspection": "Every helmet passes inspection except the inspector's, which appears to be a cooking pot.",
  "missing-spoon": "The royal spoon is missing. Everyone is searched. The goat is offended.",
  "rune-misread": "The runes promise glory, fog, and a suspiciously large turnip. Interpretation is postponed.",
  "missing-boot": "One boot is missing. Its owner claims this makes running away from danger less tempting.",
  "raven-union": "The ravens demand better seeds, shorter hours, and tiny helmets. Negotiations continue.",
  "porridge-emergency": "The porridge is too thick to stir. Three axes are offered. None improve the situation.",
  "axe-seminar": "A travelling expert explains the sharp end of an axe. Attendance is enthusiastic and unhelpful.",
  "jarls-new-hat": "The Jarl unveils a new hat. It is very tall, very furry, and entirely unsuitable for battle.",
  "legendary-nap": "A warrior takes a legendary nap and wakes with no useful tactical insight whatsoever.",
  "suspicious-seagull": "A seagull watches the battle with alarming confidence, then steals somebody's biscuit.",
  "beard-braiding": "An emergency beard-braiding contest ends in a draw and several knots of diplomacy.",
  "herring-debate": "The war council debates whether herring is a fish or a strategy. No consensus is reached.",
  "helgas-cabbage": "Helga's prize cabbage is inspected, admired, and ruled completely irrelevant to the campaign.",
  "longhouse-draft": "A draught sweeps through the longhouse. Every cloak flaps heroically for a full minute.",
  "runic-typo": "A rune is discovered to say 'raid at dawnish'. The timetable is politely ignored.",
  "viking-yoga": "The warband practises Viking yoga: downward raven, angry bear, and the forbidden folding longboat.",
  "wrong-saga": "The storyteller opens the wrong saga. It is mostly about sheep and a surprisingly brave spoon.",
  "spare-helmet": "A spare helmet is found. Nobody fits it, but it makes an excellent fruit bowl.",
  "fjord-fashion": "Fjord Fashion Week begins. Capes are judged, boots are admired, and no territory changes hands.",
  "taxidermy-workshop": "A taxidermist offers battlefield souvenirs. The offer is unanimously declined after the demonstration.",
  "unhelpful-map": "A new map labels every enemy castle 'somewhere over there'. It is filed under optimism.",
  "thors-lost-sock": "Thor's lost sock is found in the mead hall. It crackles faintly and smells of thunder.",
  "quiet-battle-cry": "The warband rehearses a quiet battle cry for stealth. Nobody can hear it, including the warband.",
  "axe-polishing": "Axe polishing reaches such a shine that several Vikings pause to admire their own eyebrows.",
  "ferocious-duck": "A ferocious duck patrols the shoreline. Even the Longboats agree to give it plenty of room.",
};

type ResolvedEventCard = Pick<EventDraw, "outcome" | "effects">;

function sagaCardHasNoEffect(_state: GameState, outcome: string): ResolvedEventCard {
  return {
    outcome,
    effects: [],
  };
}

function resolveEventCard(state: GameState, player: Player, cardId: EventCardId): ResolvedEventCard | undefined {
  const benignOutcome = BENIGN_SAGA_OUTCOMES[cardId];
  if (benignOutcome) {
    return {
      outcome: benignOutcome,
      effects: [],
    };
  }

  if (cardId === "royal-ransom") {
    player.gold += 8;
    return {
      outcome: `${player.name} receives 8 gold.`,
      effects: [{ kind: "gold", position: { ...player.castle }, label: "+8 gold", amount: 8 }],
    };
  }

  if (cardId === "treasure-hunter") {
    const chest = state.treasures
      .filter((candidate) => !candidate.carriedBy && candidate.value < 50)
      .sort((a, b) => eventDistance(a.position, player.castle) - eventDistance(b.position, player.castle))[0];
    if (!chest) return undefined;
    const gained = Math.min(20, 50 - chest.value);
    chest.value += gained;
    return {
      outcome: `A nearby treasure chest gains ${gained} gold and is now worth ${chest.value}.`,
      effects: [{ kind: "treasure", entityId: chest.id, position: { ...chest.position }, label: `+${gained} gold`, amount: gained }],
    };
  }

  if (cardId === "veterans-tale") {
    const soldier = state.units
      .filter((unit) => unit.playerId === player.id && unit.type === "soldier" && !unit.veteran && !unit.embarkedOn)
      .sort((a, b) => eventDistance(a.position, player.castle) - eventDistance(b.position, player.castle))[0];
    if (!soldier) return undefined;
    soldier.veteran = true;
    return {
      outcome: `A loyal Viking is promoted to Veteran.`,
      effects: [{ kind: "unit", unitId: soldier.id, position: { ...soldier.position }, label: "Promoted to Veteran!" }],
    };
  }

  if (cardId === "sobering-thought") {
    const soldier = state.units
      .filter((unit) => unit.type === "soldier" && unit.drunk && !unit.embarkedOn)
      .sort((a, b) => eventDistance(a.position, player.castle) - eventDistance(b.position, player.castle))[0];
    if (!soldier) return undefined;
    const previousUnit = { ...soldier, position: { ...soldier.position } };
    soldier.drunk = false;
    return {
      outcome: `The nearest drunk Viking sobers up.`,
      effects: [{
        kind: "unit",
        unitId: soldier.id,
        position: { ...soldier.position },
        label: "Sobered up!",
        previousUnit,
      }],
    };
  }

  if (cardId === "ale-delivery") {
    const enemy = state.units
      .filter((unit) => unit.playerId !== player.id && unit.type === "soldier" && !unit.embarkedOn)
      .sort((a, b) => eventDistance(a.position, player.castle) - eventDistance(b.position, player.castle))[0];
    const position = enemy && eventOpenPositionsNear(state, enemy.position, 2)[0];
    if (!enemy || !position) return undefined;
    const hornId = `event-horn-${state.eventSequence + 1}`;
    state.drinkingHorns.push({ id: hornId, position });
    return {
      outcome: `A fresh drinking horn appears near an enemy Viking.`,
      effects: [{ kind: "horn", entityId: hornId, position: { ...position }, label: "Ale delivered!" }],
    };
  }

  if (cardId === "hidden-hoard") {
    const positions = eventOpenPositionsAtLeast(state, player.castle, 5);
    const position = positions[Math.floor(random(state) * positions.length)];
    if (!position) return undefined;
    const chestId = `event-chest-${state.eventSequence + 1}`;
    state.treasures.push({ id: chestId, value: 10, position });
    return {
      outcome: `A 10-gold chest is hidden at least five squares from ${player.name}'s castle.`,
      effects: [{ kind: "treasure", entityId: chestId, position: { ...position }, label: "10-gold chest appears!", amount: 10 }],
    };
  }

  if (cardId === "army-upkeep") {
    if (player.gold <= 0) return undefined;
    const paid = Math.min(10, player.gold);
    player.gold -= paid;
    return {
      outcome: `${player.name} pays ${paid} gold in army upkeep.`,
      effects: [{ kind: "gold", position: { ...player.castle }, label: `-${paid} gold`, amount: -paid }],
    };
  }

  if (cardId === "harbour-dues") {
    const hasLongboat = state.units.some((unit) => unit.playerId === player.id && unit.type === "longboat");
    if (!hasLongboat || player.gold <= 0) return undefined;
    const paid = Math.min(5, player.gold);
    player.gold -= paid;
    const boats = state.units.filter((unit) => unit.playerId === player.id && unit.type === "longboat");
    return {
      outcome: `${player.name} pays ${paid} gold in harbour dues.`,
      effects: [
        { kind: "gold", position: { ...player.castle }, label: `-${paid} gold`, amount: -paid },
        ...boats.map((boat) => ({ kind: "unit" as const, unitId: boat.id, position: { ...boat.position }, label: "Harbour dues" })),
      ],
    };
  }

  if (cardId === "catapult-repairs") {
    const hasCatapult = state.units.some((unit) => unit.playerId === player.id && unit.type === "catapult");
    if (!hasCatapult || player.gold <= 0) return undefined;
    const paid = Math.min(4, player.gold);
    player.gold -= paid;
    const catapults = state.units.filter((unit) => unit.playerId === player.id && unit.type === "catapult");
    return {
      outcome: `${player.name} pays ${paid} gold for catapult repairs.`,
      effects: [
        { kind: "gold", position: { ...player.castle }, label: `-${paid} gold`, amount: -paid },
        ...catapults.map((catapult) => ({ kind: "unit" as const, unitId: catapult.id, position: { ...catapult.position }, label: "Repairs paid" })),
      ],
    };
  }

  if (cardId === "man-overboard") {
    const passengers = state.units.filter((unit) =>
      unit.playerId === player.id && unit.type === "soldier" && Boolean(unit.embarkedOn),
    );
    const passenger = passengers[Math.floor(random(state) * passengers.length)];
    if (!passenger) {
      return sagaCardHasNoEffect(state, `${player.name} has no crew at sea. Everyone stays safely aboard.`);
    }
    const boat = state.units.find((unit) => unit.id === passenger.embarkedOn);
    const removedUnit = { ...passenger, position: { ...(boat?.position ?? passenger.position) } };
    const carried = carriedTreasure(state, passenger.id);
    removeUnitAndCargo(state, passenger);
    return {
      outcome: `${player.name} loses one ${passenger.veteran ? "Veteran" : "crew member"} overboard${carried ? `, along with ${carried.value} gold` : ""}.`,
      effects: [{
        kind: "unit",
        unitId: passenger.id,
        position: { ...removedUnit.position },
        label: "Man overboard!",
        removedUnit,
      }],
    };
  }

  if (cardId === "bad-viking") {
    const veterans = state.units.filter((unit) => unit.playerId === player.id && unit.type === "soldier" && unit.veteran);
    const veteran = veterans[Math.floor(random(state) * veterans.length)];
    if (!veteran) {
      return sagaCardHasNoEffect(state, `${player.name} has no Veteran to demote. The disciplinary hearing is cancelled.`);
    }
    veteran.veteran = false;
    const boat = veteran.embarkedOn ? state.units.find((unit) => unit.id === veteran.embarkedOn) : undefined;
    return {
      outcome: `One of ${player.name}'s Veterans is demoted to an ordinary Viking.`,
      effects: [{
        kind: "unit",
        unitId: veteran.id,
        position: { ...(boat?.position ?? veteran.position) },
        label: "Demoted to Viking!",
      }],
    };
  }

  if (cardId === "bandits") {
    const available = state.treasures.filter((treasure) => !treasure.carriedBy);
    const treasure = available[Math.floor(random(state) * available.length)];
    if (!treasure) {
      return sagaCardHasNoEffect(state, "The bandits find no unattended treasure and leave disappointed.");
    }
    const removedTreasure = { ...treasure, position: { ...treasure.position } };
    state.treasures = state.treasures.filter((candidate) => candidate.id !== treasure.id);
    return {
      outcome: `Bandits steal an unattended ${treasure.value}-gold chest from the map.`,
      effects: [{
        kind: "treasure",
        entityId: treasure.id,
        position: { ...treasure.position },
        label: "Stolen by bandits!",
        amount: -treasure.value,
        removedTreasure,
      }],
    };
  }

  if (cardId === "inside-job") {
    const rivals = state.players.filter((candidate) => candidate.id !== player.id && !candidate.eliminated);
    const rival = rivals[Math.floor(random(state) * rivals.length)];
    const stolen = Math.floor(player.gold / 2);
    if (!rival || stolen <= 0) {
      return sagaCardHasNoEffect(state, `${player.name}'s treasury is too empty for the inside job to pay off.`);
    }
    player.gold -= stolen;
    rival.gold += stolen;
    return {
      outcome: `An inside job transfers ${stolen} gold from ${player.name} to ${rival.name}.`,
      effects: [
        { kind: "gold", position: { ...player.castle }, label: `-${stolen} gold stolen`, amount: -stolen },
        { kind: "gold", position: { ...rival.castle }, label: `+${stolen} stolen gold`, amount: stolen },
      ],
    };
  }

  if (cardId === "loose-change") {
    player.gold += 3;
    return {
      outcome: `${player.name} finds 3 gold down the back of the longhall bench.`,
      effects: [{ kind: "gold", position: { ...player.castle }, label: "+3 loose gold", amount: 3 }],
    };
  }

  if (cardId === "the-deserter") {
    const candidates = state.units.filter((unit) =>
      unit.playerId === player.id &&
      unit.type === "soldier" &&
      !unit.veteran &&
      !unit.embarkedOn &&
      !carriedTreasure(state, unit.id),
    );
    const deserter = candidates[Math.floor(random(state) * candidates.length)];
    if (!deserter) {
      return sagaCardHasNoEffect(state, `${player.name} has no eligible ordinary Viking willing to desert.`);
    }
    const removedUnit = { ...deserter, position: { ...deserter.position } };
    removeUnitAndCargo(state, deserter);
    return {
      outcome: `One of ${player.name}'s ordinary Vikings slips away from the army.`,
      effects: [{
        kind: "unit",
        unitId: deserter.id,
        position: { ...deserter.position },
        label: "The Deserter!",
        removedUnit,
      }],
    };
  }

  if (cardId === "new-recruit") {
    const destinations = eventOpenPositionsNear(state, player.castle, 1, true);
    const position = destinations[Math.floor(random(state) * destinations.length)];
    if (!position) {
      return sagaCardHasNoEffect(state, `${player.name}'s new recruit cannot find a legal space beside the castle.`);
    }
    const recruit: Unit = {
      id: nextUnitId(state, player.id, "soldier"),
      playerId: player.id,
      type: "soldier",
      position: { ...position },
      moved: true,
      fired: true,
    };
    state.units.push(recruit);
    return {
      outcome: `A new Viking volunteers for ${player.name}'s army.`,
      effects: [{
        kind: "unit",
        unitId: recruit.id,
        from: { ...player.castle },
        position: { ...position },
        label: "New recruit!",
      }],
    };
  }

  if (cardId === "wrong-address") {
    const horn = state.drinkingHorns[Math.floor(random(state) * state.drinkingHorns.length)];
    if (!horn) {
      return sagaCardHasNoEffect(state, "There are no Drinking Horns available for the confused delivery crew.");
    }
    const destinations = eventOpenPositionsNear(state, horn.position, 4);
    const destination = destinations[Math.floor(random(state) * destinations.length)];
    if (!destination) {
      return sagaCardHasNoEffect(state, "The Drinking Horn is already at the only address the delivery crew can reach.");
    }
    const from = { ...horn.position };
    horn.position = { ...destination };
    return {
      outcome: "A Drinking Horn is delivered to the wrong address nearby.",
      effects: [{
        kind: "horn",
        entityId: horn.id,
        from,
        position: { ...destination },
        label: "Wrong address!",
      }],
    };
  }

  if (cardId === "jarls-feast") {
    const paid = Math.min(3, player.gold);
    if (paid <= 0) {
      return sagaCardHasNoEffect(state, `${player.name} has no gold for the Jarl's feast, so everyone brings sandwiches.`);
    }
    player.gold -= paid;
    return {
      outcome: `${player.name} contributes ${paid} gold to the Jarl's feast.`,
      effects: [{ kind: "gold", position: { ...player.castle }, label: `-${paid} feast gold`, amount: -paid }],
    };
  }

  if (cardId === "sturdy-longboat") {
    player.sturdyLongboatProtection += 1;
    return {
      outcome: `${player.name}'s next Longboat struck by a Catapult or enemy ram will survive.`,
      effects: [{
        kind: "protection",
        position: { ...player.castle },
        label: "Next Longboat protected!",
        amount: 1,
      }],
    };
  }

  if (cardId === "yule-festival") {
    const targets = state.players
      .filter((faction) => !faction.eliminated)
      .map((faction) => {
        const eligible = state.units.filter((unit) =>
          unit.playerId === faction.id &&
          unit.type === "soldier" &&
          !unit.drunk &&
          !unit.embarkedOn,
        );
        return eligible[Math.floor(random(state) * eligible.length)];
      })
      .filter((unit): unit is Unit => Boolean(unit));
    if (targets.length === 0) {
      return sagaCardHasNoEffect(state, "The Yule Festival begins, but every available Viking is already drunk or at sea.");
    }
    for (const target of targets) intoxicateSoldier(state, target);
    return {
      outcome: `The Yule Festival leaves ${targets.length} Viking${targets.length === 1 ? "" : "s"} gloriously drunk — one from each eligible faction.`,
      effects: targets.map((target) => ({
        kind: "unit" as const,
        unitId: target.id,
        position: { ...target.position },
        label: "Yule merriment!",
      })),
    };
  }

  if (cardId === "berserker-rage") {
    const eligible = state.units.filter((unit) =>
      unit.playerId === player.id &&
      unit.type === "soldier" &&
      !unit.rage &&
      !unit.embarkedOn,
    );
    const target = eligible[Math.floor(random(state) * eligible.length)];
    if (!target) {
      return sagaCardHasNoEffect(state, `${player.name} has no available Viking or Veteran to enter a Berserker Rage.`);
    }
    target.rage = true;
    return {
      outcome: `One of ${player.name}'s ${target.veteran ? "Veterans" : "Vikings"} enters a Berserker Rage and will win their next direct Viking clash.`,
      effects: [{
        kind: "unit",
        unitId: target.id,
        position: { ...target.position },
        label: "BERSERKER RAGE!",
      }],
    };
  }

  if (cardId === "high-winds") {
    const directions = [-1, 0, 1].flatMap((dx) =>
      [-1, 0, 1]
        .filter((dy) => dx !== 0 || dy !== 0)
        .map((dy) => ({ dx, dy })),
    );
    const movableBoats = state.units
      .filter((unit) => unit.playerId === player.id && unit.type === "longboat" && !longboatIsFrozen(state, unit))
      .map((boat) => {
        const driftDirections = directions.map(({ dx, dy }) => {
          const destinations: Position[] = [];
          for (let distance = 1; distance <= 3; distance += 1) {
            const destination = {
              x: boat.position.x + dx * distance,
              y: boat.position.y + dy * distance,
            };
            if (!canPlaceLongboat(state, destination, { x: 1, y: 0 }, boat.id)) break;
            destinations.push(destination);
          }
          return destinations;
        }).filter((destinations) => destinations.length > 0);
        return { boat, driftDirections };
      })
      .filter((candidate) => candidate.driftDirections.length > 0);
    const chosen = movableBoats[Math.floor(random(state) * movableBoats.length)];
    if (!chosen) {
      return sagaCardHasNoEffect(state, `${player.name} has no Longboat that the high winds can move safely.`);
    }
    const chosenDirection = chosen.driftDirections[Math.floor(random(state) * chosen.driftDirections.length)]!;
    const destination = chosenDirection[Math.floor(random(state) * chosenDirection.length)]!;
    const from = { ...chosen.boat.position };
    chosen.boat.position = { ...destination };
    chosen.boat.facing = { x: 1, y: 0 };
    for (const passenger of longboatPassengers(state, chosen.boat.id)) passenger.position = { ...destination };
    const distance = Math.max(Math.abs(destination.x - from.x), Math.abs(destination.y - from.y));
    return {
      outcome: `High winds blow one of ${player.name}'s Longboats ${distance} square${distance === 1 ? "" : "s"} off course.`,
      effects: [{
        kind: "unit",
        unitId: chosen.boat.id,
        from,
        position: { ...destination },
        label: "Blown off course!",
      }],
    };
  }

  if (cardId === "shield-wall") {
    const eligible = state.units.filter((unit) =>
      unit.playerId === player.id && unit.type === "soldier" && !unit.embarkedOn && !unit.shieldWall,
    );
    const target = eligible[Math.floor(random(state) * eligible.length)];
    if (!target) {
      return sagaCardHasNoEffect(state, `${player.name} has no available Viking or Veteran to form a Shield Wall.`);
    }
    target.shieldWall = true;
    return {
      outcome: `One of ${player.name}'s ${target.veteran ? "Veterans" : "Vikings"} forms a Shield Wall and will survive the next Catapult impact.`,
      effects: [{ kind: "unit", unitId: target.id, position: { ...target.position }, label: "SHIELD WALL!" }],
    };
  }

  if (cardId === "favourable-tide") {
    const enemyCastles = state.players
      .filter((candidate) => candidate.id !== player.id && !candidate.eliminated)
      .map((candidate) => candidate.castle);
    const directions = [-1, 0, 1].flatMap((dx) =>
      [-1, 0, 1].filter((dy) => dx !== 0 || dy !== 0).map((dy) => ({ dx, dy })),
    );
    const movableBoats = state.units
      .filter((unit) => unit.playerId === player.id && unit.type === "longboat" && !longboatIsFrozen(state, unit))
      .map((boat) => {
        const currentDistance = Math.min(...enemyCastles.map((castle) => eventDistance(boat.position, castle)));
        const driftDirections = directions.map(({ dx, dy }) => {
          const destinations: Position[] = [];
          for (let distance = 1; distance <= 3; distance += 1) {
            const destination = { x: boat.position.x + dx * distance, y: boat.position.y + dy * distance };
            if (!canPlaceLongboat(state, destination, { x: 1, y: 0 }, boat.id)) break;
            const destinationDistance = Math.min(...enemyCastles.map((castle) => eventDistance(destination, castle)));
            if (destinationDistance < currentDistance) destinations.push(destination);
          }
          return destinations;
        }).filter((destinations) => destinations.length > 0);
        return { boat, driftDirections };
      })
      .filter((candidate) => candidate.driftDirections.length > 0);
    const chosen = movableBoats[Math.floor(random(state) * movableBoats.length)];
    if (!chosen) {
      return sagaCardHasNoEffect(state, `${player.name} has no Longboat that can ride a safe tide toward an enemy castle.`);
    }
    const chosenDirection = chosen.driftDirections[Math.floor(random(state) * chosen.driftDirections.length)]!;
    const destination = chosenDirection[Math.floor(random(state) * chosenDirection.length)]!;
    const from = { ...chosen.boat.position };
    chosen.boat.position = { ...destination };
    chosen.boat.facing = { x: 1, y: 0 };
    for (const passenger of longboatPassengers(state, chosen.boat.id)) passenger.position = { ...destination };
    const distance = Math.max(Math.abs(destination.x - from.x), Math.abs(destination.y - from.y));
    return {
      outcome: `A favourable tide carries one of ${player.name}'s Longboats ${distance} square${distance === 1 ? "" : "s"} toward the nearest enemy castle.`,
      effects: [{ kind: "unit", unitId: chosen.boat.id, from, position: { ...destination }, label: "Favourable tide!" }],
    };
  }

  if (cardId === "forgotten-rations") {
    const paid = Math.min(2, player.gold);
    if (paid <= 0) {
      return sagaCardHasNoEffect(state, `${player.name}'s cupboards and treasury are both empty, so no rations can be replaced.`);
    }
    player.gold -= paid;
    return {
      outcome: `${player.name} spends ${paid} gold replacing the rations somebody definitely remembered packing.`,
      effects: [{ kind: "gold", position: { ...player.castle }, label: `-${paid} ration gold`, amount: -paid }],
    };
  }

  if (cardId === "the-persuader") {
    const targets = state.units
      .filter((unit) => unit.playerId !== player.id && unit.type === "soldier" && !unit.embarkedOn)
      .sort((a, b) => eventDistance(a.position, player.castle) - eventDistance(b.position, player.castle))
      .slice(0, 2);
    if (targets.length === 0) return undefined;
    const effects = targets.map((target) => ({
      kind: "unit" as const,
      unitId: target.id,
      position: { ...target.position },
      label: `Joined ${player.name}`,
      previousPlayerId: target.playerId,
      previousUnit: { ...target, position: { ...target.position } },
    }));
    for (const target of targets) {
      target.playerId = player.id;
      target.drunk = false;
    }
    return {
      outcome: `${targets.length} enemy Viking${targets.length === 1 ? " is" : "s are"} persuaded to join ${player.name}.`,
      effects,
    };
  }

  const courtyardDestinations = eventOpenPositionsNear(state, player.castle, 1, true);
  // Called Home must never overwrite a unit or any part of a multi-square
  // unit. If the courtyard is full, expand outwards and use the nearest clear
  // land or ice square instead of cancelling the card or stacking pieces.
  const destinations = courtyardDestinations.length > 0
    ? courtyardDestinations
    : eventOpenPositionsNear(state, player.castle, Math.max(state.width, state.height), true);
  const soldier = state.units
    .filter((unit) => unit.playerId === player.id && unit.type === "soldier" && !unit.embarkedOn && eventDistance(unit.position, player.castle) > 1)
    .sort((a, b) => eventDistance(b.position, player.castle) - eventDistance(a.position, player.castle))[0];
  if (!soldier || destinations.length === 0) return undefined;
  const from = { ...soldier.position };
  const destination = destinations[0]!;
  soldier.position = { ...destination };
  const banked = bankTreasureAtHome(state, soldier);
  const arrivedBesideCastle = eventDistance(destination, player.castle) === 1;
  return {
    outcome: banked
      ? `A distant Viking emerges beside ${player.name}'s castle and banks ${banked} gold.`
      : arrivedBesideCastle
        ? `A distant Viking emerges beside ${player.name}'s castle.`
        : `A distant Viking is called home to the nearest clear square around ${player.name}'s crowded castle.`,
    effects: [{
      kind: "unit",
      unitId: soldier.id,
      from,
      position: { ...soldier.position },
      label: banked ? `Called home — ${banked} gold banked!` : "Called home!",
      amount: banked || undefined,
    }],
  };
}

/** Draw one resolving card, skipping unavailable effects without breaking the deck cycle. */
export function drawEndTurnEvent(state: GameState, playerId: PlayerId) {
  if (!state.eventDeckEnabled) return undefined;
  const player = state.players.find((candidate) => candidate.id === playerId && !candidate.eliminated);
  if (!player) return undefined;
  let reshuffled = false;
  if (state.eventDeck.length === 0) {
    state.eventDeck = shuffleEventCards(state, state.eventDiscard);
    state.eventDiscard = [];
    if (state.eventDeck.length > 0) {
      reshuffled = true;
      state.log.unshift("The saga deck is reshuffled.");
    }
  }

  const cardsToCheck = state.eventDeck.length;
  for (let index = 0; index < cardsToCheck; index += 1) {
    const cardId = state.eventDeck.pop();
    if (!cardId) break;
    const resolution = resolveEventCard(state, player, cardId);
    state.eventDiscard.push(cardId);
    if (!resolution) continue;
    state.eventSequence += 1;
    state.lastEvent = { sequence: state.eventSequence, cardId, playerId, reshuffled, ...resolution };
    battleStatsFor(state, playerId).sagaCardsDrawn += 1;
    state.log.unshift(`${player.name} draws a saga card: ${resolution.outcome}`);
    return state.lastEvent;
  }
  return undefined;
}

/** The attacker's direct-combat chance, kept explicit for balance tests and UI explanations. */
export function getCombatWinChance(attacker: Unit, defender: Unit): number {
  if (attacker.type === "soldier" && defender.type === "soldier") {
    if (Boolean(attacker.rage) !== Boolean(defender.rage)) return attacker.rage ? 1 : 0;
    if (Boolean(attacker.veteran) === Boolean(defender.veteran)) return 0.5;
    return attacker.veteran ? 0.55 : 0.45;
  }
  const attackPower = UNIT_RULES[attacker.type].power;
  const defencePower = UNIT_RULES[defender.type].power;
  return Math.max(0.25, Math.min(0.8, attackPower / (attackPower + defencePower)));
}

/** Castles favour the defender; Veterans receive only a modest improvement. */
export function getCastleCaptureChance(attacker: Unit): number {
  return attacker.type === "soldier" && attacker.veteran ? 0.45 : 0.4;
}

function promoteWarriorAfterVictory(state: GameState, winner: Unit, loser: Unit): void {
  if (winner.type !== "soldier" || loser.type !== "soldier" || winner.veteran) return;
  winner.veteran = true;
  battleStatsFor(state, winner.playerId).promotions += 1;
  state.log.unshift(`${capitalize(winner.playerId)}'s victorious Soldier becomes a Veteran!`);
}

/**
 * A sober Viking who wins a direct clash claims the defeated Viking's chest.
 * The data model deliberately allows one carried chest per Viking, so when
 * both combatants brought treasure their loot is combined without losing any
 * gold. Drunk Vikings remain unable to carry treasure.
 */
function claimDefeatedWarriorTreasure(state: GameState, winner: Unit, loser: Unit): number {
  if (winner.type !== "soldier" || winner.drunk || loser.type !== "soldier") return 0;
  const captured = state.treasures.filter((treasure) => treasure.carriedBy === loser.id);
  if (captured.length === 0) return 0;

  const capturedValue = captured.reduce((total, treasure) => total + treasure.value, 0);
  const winnerTreasure = carriedTreasure(state, winner.id);
  if (winnerTreasure) {
    winnerTreasure.value += capturedValue;
    const capturedIds = new Set(captured.map((treasure) => treasure.id));
    state.treasures = state.treasures.filter((treasure) => !capturedIds.has(treasure.id));
  } else {
    const [claimedChest, ...extraChests] = captured;
    claimedChest!.carriedBy = winner.id;
    claimedChest!.position = { ...winner.position };
    claimedChest!.value += extraChests.reduce((total, treasure) => total + treasure.value, 0);
    const extraIds = new Set(extraChests.map((treasure) => treasure.id));
    state.treasures = state.treasures.filter((treasure) => !extraIds.has(treasure.id));
  }

  state.log.unshift(`${capitalize(winner.playerId)} claims ${capturedValue} gold from the defeated Viking!`);
  return capturedValue;
}

/** Consume one faction-wide Saga protection when a Longboat would be destroyed. */
function sturdyLongboatSaves(state: GameState, boat: Unit): boolean {
  if (boat.type !== "longboat") return false;
  const owner = state.players.find((player) => player.id === boat.playerId);
  if (!owner || owner.sturdyLongboatProtection <= 0) return false;
  owner.sturdyLongboatProtection -= 1;
  battleStatsFor(state, owner.id).sturdyLongboatSaves += 1;
  state.log.unshift(`Sturdy Longboat! ${owner.name}'s Longboat survives the attack.`);
  return true;
}

function resolveCombat(state: GameState, attacker: Unit, defender: Unit): boolean {
  if (defender.type === "soldier" && defender.drunk && defender.playerId !== attacker.playerId) {
    const newOwner = state.players.find((player) => player.id === attacker.playerId);
    defender.playerId = attacker.playerId;
    defender.drunk = false;
    defender.moved = true;
    state.log.unshift(`A formerly drunk Viking joins ${newOwner?.name ?? "the attackers"} after a very persuasive scuffle!`);
    return false;
  }
  if (attacker.type === "longboat" && defender.type === "longboat" && sturdyLongboatSaves(state, defender)) {
    return false;
  }
  const automaticWin =
    (attacker.type === "soldier" && defender.type === "catapult") ||
    (attacker.type === "longboat" && defender.type === "longboat");
  if (automaticWin) {
    removeUnitAndCargo(state, defender);
    const stats = battleStatsFor(state, attacker.playerId);
    stats.combatVictories += 1;
    if (attacker.type === "longboat") stats.longboatsSunk += 1;
    const action = attacker.type === "longboat" ? "rams and sinks" : "overruns";
    state.log.unshift(`${capitalize(attacker.type)} ${action} the ${defender.type}!`);
    return true;
  }
  const directVikingClash = attacker.type === "soldier" && defender.type === "soldier";
  const attackerWasRaging = directVikingClash && Boolean(attacker.rage);
  const defenderWasRaging = directVikingClash && Boolean(defender.rage);
  const chance = getCombatWinChance(attacker, defender);
  // Rage is spent only by entering a direct Soldier/Veteran clash. Castle
  // attacks, Catapults, boats and drunk conversions never consume it.
  if (directVikingClash) {
    attacker.rage = false;
    defender.rage = false;
  }
  const attackerWins = random(state) < chance;
  const winner = attackerWins ? attacker : defender;
  const loser = attackerWins ? defender : attacker;
  claimDefeatedWarriorTreasure(state, winner, loser);
  removeUnitAndCargo(state, loser);
  battleStatsFor(state, winner.playerId).combatVictories += 1;
  promoteWarriorAfterVictory(state, winner, loser);
  const winnerName = winner.type === "soldier" && winner.veteran ? "Veteran" : capitalize(winner.type);
  const loserName = loser.type === "soldier" && loser.veteran ? "Veteran" : capitalize(loser.type);
  state.log.unshift(
    `${attackerWasRaging || defenderWasRaging ? "Berserker Rage! " : ""}${winnerName} wins a clash against ${loserName}.`,
  );
  return attackerWins;
}

function captureCastle(state: GameState, attacker: Unit, defender: Player): void {
  defender.eliminated = true;
  const victor = state.players.find((player) => player.id === attacker.playerId);
  if (!victor) return;
  for (const unit of state.units) {
    if (unit.playerId === defender.id) unit.playerId = victor.id;
  }
  state.log.unshift(`${victor.title} captures ${defender.name}'s castle and recruits the survivors!`);

  const remaining = state.players.filter((player) => !player.eliminated);
  if (remaining.length === 1) {
    state.winnerId = remaining[0]?.id;
    state.log.unshift(`${remaining[0]?.title ?? "A remarkably smug Viking"} wins the fjord!`);
  }
}

function resolveCastleAttack(state: GameState, attacker: Unit, defender: Player): boolean {
  const stats = battleStatsFor(state, attacker.playerId);
  stats.castleAttacks += 1;
  const chance = getCastleCaptureChance(attacker);
  if (random(state) < chance) {
    stats.castlesCaptured += 1;
    captureCastle(state, attacker, defender);
    return true;
  }
  const rank = attacker.veteran ? "Veteran" : "Soldier";
  removeUnitAndCargo(state, attacker);
  state.log.unshift(`${capitalize(defender.name)}'s castle repels the attacking ${rank}.`);
  return false;
}

export function moveUnit(state: GameState, unitId: string, destination: Position): boolean {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return false;
  const legal = getLegalMoves(state, unitId).some(
    (position) => position.x === destination.x && position.y === destination.y,
  );
  if (!legal) return false;

  // Beginning another legal action closes any moved Catapult's one immediate
  // firing window. The Catapult may not save that shot for later in the turn.
  forfeitPendingCatapultFire(state, unitId);

  const defender =
    (unit.type === "longboat" ? rammableLongboatAt(state, unit, destination) : undefined) ??
    // Multi-square units may move across part of their own old footprint.
    // Never interpret that overlap as a defender: a one-square horizontal
    // Longboat move previously made the boat "ram" and remove itself, while
    // a Catapult could similarly fight itself when moving to the right.
    unitAtExcept(state, destination, unit.id);
  // Keep this guard alongside legal-move generation so an accidental UI
  // target, stale selection, or future caller cannot turn a Soldier's move
  // into combat with an enemy boat.  Soldiers only ever embark friendly
  // Longboats; they never attack or board enemy ones.
  if (unit.type === "soldier" && defender?.type === "longboat" && defender.playerId !== unit.playerId) {
    return false;
  }
  if (
    unit.type === "soldier" &&
    !unit.drunk &&
    defender?.type === "longboat" &&
    defender.playerId === unit.playerId &&
    !longboatIsFrozen(state, defender)
  ) {
    unit.embarkedOn = defender.id;
    unit.position = { ...defender.position };
    unit.moved = true;
    state.log.unshift(`${capitalize(unit.playerId)} embarks a Viking (${longboatPassengers(state, defender.id).length}/3 aboard).`);
    return true;
  }
  const convertingDrunkDefender = Boolean(
    unit.type === "soldier" &&
    defender?.type === "soldier" &&
    defender.drunk &&
    defender.playerId !== unit.playerId,
  );
  if (convertingDrunkDefender && defender) {
    // The attacker cannot share the converted Viking's square. A long
    // approach therefore ends on the last clear square beside the defender,
    // exactly as a castle charge ends beside the walls.
    unit.position = {
      x: destination.x - Math.sign(destination.x - unit.position.x),
      y: destination.y - Math.sign(destination.y - unit.position.y),
    };
    resolveCombat(state, unit, defender);
    unit.moved = true;
    bankTreasureAtHome(state, unit);
    return true;
  }
  if (defender && !resolveCombat(state, unit, defender)) {
    unit.moved = true;
    return true;
  }

  const castle = playerAtCastle(state, destination);
  if (castle && castle.id !== unit.playerId && unit.type === "soldier") {
    // The castle square itself is never occupied. A long straight charge
    // finishes on the last clear square before the walls; an adjacent attack
    // therefore finishes exactly where it began.
    const approach = {
      x: destination.x - Math.sign(destination.x - unit.position.x),
      y: destination.y - Math.sign(destination.y - unit.position.y),
    };
    // Resolve the battle at the approach square as well, so a defeated
    // treasure carrier drops the chest where the player saw them fall.
    unit.position = approach;
    resolveCastleAttack(state, unit, castle);
    unit.moved = true;
    return true;
  }

  unit.position = { ...destination };
  if (unit.type === "longboat") {
    unit.facing = { x: 1, y: 0 };
    for (const passenger of longboatPassengers(state, unit.id)) passenger.position = { ...destination };
  }
  unit.moved = true;
  if (unit.type === "catapult") unit.pendingFireAfterMove = true;
  if (unit.type === "soldier") {
    const horn = drinkingHornAt(state, destination);
    if (horn) makeSoldierDrunk(state, unit, horn);
    const treasure = treasureAt(state, destination);
    if (treasure && !unit.drunk && !carriedTreasure(state, unit.id)) {
      treasure.carriedBy = unit.id;
      state.log.unshift(`${capitalize(unit.playerId)} picks up a ${treasure.value} gold treasure chest.`);
    }
  }
  relocateLooseTreasureUnderUnit(state, unit);
  if (unit.type === "soldier") bankTreasureAtHome(state, unit);
  return true;
}

function intoxicateSoldier(state: GameState, soldier: Unit): void {
  if (!soldier.drunk) battleStatsFor(state, soldier.playerId).drunkenIncidents += 1;
  soldier.drunk = true;
  const treasure = carriedTreasure(state, soldier.id);
  if (treasure) {
    const position = nearestLooseTreasurePosition(state, soldier.position);
    if (position) {
      treasure.carriedBy = undefined;
      treasure.position = { ...position };
      state.log.unshift("The treasure chest is dropped nearby as the drinking begins.");
    }
  }
}

function makeSoldierDrunk(state: GameState, soldier: Unit, horn: DrinkingHorn): void {
  intoxicateSoldier(state, soldier);
  state.drinkingHorns = state.drinkingHorns.filter((candidate) => candidate.id !== horn.id);
  state.log.unshift(`${capitalize(soldier.playerId)}'s Viking drinks from a horn and becomes gloriously drunk!`);
}

/** Resolve the uncontrolled opening move for one drunk Soldier. */
export function moveDrunkSoldier(state: GameState, unitId: string): boolean {
  const soldier = state.units.find(
    (unit) => unit.id === unitId && unit.type === "soldier" && unit.drunk && !unit.embarkedOn && !unit.moved,
  );
  if (!soldier || soldier.playerId !== activePlayer(state).id) return false;
  const legalMoves = getLegalMoves(state, soldier.id);
  if (legalMoves.length === 0) {
    soldier.moved = true;
    state.log.unshift(`${capitalize(soldier.playerId)}'s drunk Viking sways in place.`);
    return true;
  }

  const directions = new Map<string, Position[]>();
  for (const destination of legalMoves) {
    const dx = Math.sign(destination.x - soldier.position.x);
    const dy = Math.sign(destination.y - soldier.position.y);
    const key = `${dx},${dy}`;
    const group = directions.get(key) ?? [];
    group.push(destination);
    directions.set(key, group);
  }
  const directionGroups = [...directions.values()];
  const group = directionGroups[Math.floor(random(state) * directionGroups.length)]!;
  const maximumRun = random(state) < 0.25;
  const withinNine = group.filter((destination) => distanceBetween(soldier.position, destination) <= 9);
  const choices = maximumRun || withinNine.length === 0 ? group : withinNine;
  const destination = maximumRun
    ? choices.slice().sort((a, b) => distanceBetween(soldier.position, b) - distanceBetween(soldier.position, a))[0]!
    : choices[Math.floor(random(state) * choices.length)]!;
  const ownerName = capitalize(soldier.playerId);
  const didMove = moveUnit(state, soldier.id, destination);
  const survivingSoldier = state.units.find((unit) => unit.id === soldier.id);
  if (survivingSoldier) survivingSoldier.moved = true;
  if (didMove) {
    state.log.unshift(`${ownerName}'s drunk Viking ${maximumRun ? "charges until something stops them" : "staggers unpredictably"}.`);
  }
  return didMove;
}

function distanceBetween(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function removeUnitAndCargo(state: GameState, unit: Unit): void {
  const removed = new Set([unit.id]);
  if (unit.type === "longboat") {
    for (const passenger of longboatPassengers(state, unit.id)) removed.add(passenger.id);
    if (removed.size > 1) state.log.unshift(`${removed.size - 1} embarked Viking${removed.size === 2 ? "" : "s"} go down with the longboat.`);
  }
  for (const casualty of state.units.filter((candidate) => removed.has(candidate.id))) {
    const stats = battleStatsFor(state, casualty.playerId);
    stats.unitsLost += 1;
    if (casualty.type === "longboat") stats.longboatsLost += 1;
  }
  const sunkTreasureIds = new Set<string>();
  for (const treasure of state.treasures) {
    if (!treasure.carriedBy || !removed.has(treasure.carriedBy)) continue;
    const carrier = state.units.find((candidate) => candidate.id === treasure.carriedBy);
    if (carrier?.embarkedOn) {
      sunkTreasureIds.add(treasure.id);
      state.log.unshift("A treasure chest sinks beneath the fjord.");
    } else if (carrier) {
      treasure.carriedBy = undefined;
      treasure.position = { ...carrier.position };
      state.log.unshift("A dropped treasure chest lands where its carrier fell.");
    }
  }
  state.treasures = state.treasures.filter((treasure) => !sunkTreasureIds.has(treasure.id));
  state.units = state.units.filter((candidate) => !removed.has(candidate.id));
}

function disembarkCellsForBoat(state: GameState, boat: Unit): Position[] {
  const cells = new Map<string, Position>();
  for (const part of unitFootprint(boat)) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const cell = { x: part.x + dx, y: part.y + dy };
        if (
          isInside(state, cell) &&
          ["land", "ice"].includes(terrainAt(state, cell)) &&
          !unitAt(state, cell) &&
          !movementObstacleAt(state, cell)
        ) cells.set(positionKey(cell), cell);
      }
    }
  }
  return [...cells.values()];
}

export function getDisembarkCells(state: GameState, boatId: string): Position[] {
  if (state.turnPhase !== "movement" || getPendingCatapult(state)) return [];
  const boat = state.units.find((unit) => unit.id === boatId && unit.type === "longboat");
  if (!boat || boat.playerId !== activePlayer(state).id || longboatPassengers(state, boatId).length === 0) return [];
  return disembarkCellsForBoat(state, boat);
}

/** Winter automatically sends as much of a trapped crew ashore as space permits. */
function evacuateFrozenLongboats(state: GameState): void {
  for (const boat of state.units.filter((unit) => unit.type === "longboat" && longboatIsFrozen(state, unit))) {
    let evacuated = 0;
    for (const passenger of [...longboatPassengers(state, boat.id)]) {
      const destination = disembarkCellsForBoat(state, boat)[0];
      if (!destination) break;
      passenger.embarkedOn = undefined;
      passenger.position = { ...destination };
      passenger.moved = true;
      bankTreasureAtHome(state, passenger);
      evacuated += 1;
    }
    if (evacuated > 0) {
      const owner = state.players.find((player) => player.id === boat.playerId);
      state.log.unshift(
        `Winter forces ${evacuated} Viking${evacuated === 1 ? "" : "s"} ashore from ${owner?.name ?? "a"} frozen Longboat.`,
      );
    }
  }
}

export function disembarkSoldier(
  state: GameState,
  boatId: string,
  destination: Position,
  passengerId?: string,
): boolean {
  const legal = getDisembarkCells(state, boatId).some(
    (cell) => cell.x === destination.x && cell.y === destination.y,
  );
  if (!legal) return false;
  forfeitPendingCatapultFire(state);
  const passengers = longboatPassengers(state, boatId);
  const passenger = passengerId
    ? passengers.find((candidate) => candidate.id === passengerId)
    : passengers[0];
  if (!passenger) return false;
  passenger.embarkedOn = undefined;
  passenger.position = { ...destination };
  passenger.moved = true;
  state.log.unshift(`${capitalize(passenger.playerId)} disembarks a Viking (${longboatPassengers(state, boatId).length}/3 remain aboard).`);
  bankTreasureAtHome(state, passenger);
  return true;
}

function catapultCanFire(state: GameState, unitId: string): Unit | undefined {
  const catapult = state.units.find((unit) => unit.id === unitId);
  if (
    !catapult ||
    catapult.type !== "catapult" ||
    catapult.fired ||
    catapult.playerId !== activePlayer(state).id ||
    state.winnerId ||
    state.turnPhase !== "movement"
  ) {
    return undefined;
  }
  return catapult;
}

export function getPendingCatapult(state: GameState): Unit | undefined {
  const playerId = activePlayer(state).id;
  return state.units.find(
    (unit) => unit.playerId === playerId && unit.type === "catapult" && unit.pendingFireAfterMove,
  );
}

/** Explicitly decline the compulsory firing opportunity after moving. */
export function skipPendingCatapultFire(state: GameState, unitId: string): boolean {
  if (state.turnPhase !== "movement") return false;
  const catapult = getPendingCatapult(state);
  if (!catapult || catapult.id !== unitId) return false;
  catapult.pendingFireAfterMove = false;
  catapult.fired = true;
  state.log.unshift(`${capitalize(catapult.playerId)}'s catapult holds its fire.`);
  return true;
}

export function forfeitPendingCatapultFire(state: GameState, exceptUnitId?: string): void {
  for (const unit of state.units) {
    if (
      unit.type !== "catapult" ||
      unit.id === exceptUnitId ||
      !unit.pendingFireAfterMove
    ) continue;
    unit.pendingFireAfterMove = false;
    unit.fired = true;
    state.log.unshift(`${capitalize(unit.playerId)}'s catapult misses its immediate firing opportunity.`);
  }
}

export function getCatapultFireCells(state: GameState, unitId: string): Position[] {
  const catapult = catapultCanFire(state, unitId);
  if (!catapult) return [];

  const cells: Position[] = [];
  for (let dy = -CATAPULT_FIRE_RANGE; dy <= CATAPULT_FIRE_RANGE; dy += 1) {
    for (let dx = -CATAPULT_FIRE_RANGE; dx <= CATAPULT_FIRE_RANGE; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const position = { x: catapult.position.x + dx, y: catapult.position.y + dy };
      if (isInside(state, position)) cells.push(position);
    }
  }
  return cells;
}

export function getCatapultTargets(state: GameState, unitId: string): Position[] {
  const catapult = catapultCanFire(state, unitId);
  if (!catapult) return [];
  return getCatapultFireCells(state, unitId).filter((position) => {
    const target = unitAt(state, position);
    return target && target.playerId !== catapult.playerId;
  });
}

export function catapultScatterRadius(distance: number): number {
  return distance <= 4 ? 1 : 2;
}

/**
 * At a 5×5 spread, the outer ring is half as likely per square as the inner
 * 3×3. This retains uncertainty while making distant shots meaningfully less wild.
 */
function catapultScatterOffset(state: GameState, radius: number): Position {
  const options: Array<{ offset: Position; weight: number }> = [];
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const outerRing = radius === 2 && Math.max(Math.abs(x), Math.abs(y)) === 2;
      options.push({ offset: { x, y }, weight: outerRing ? 0.5 : 1 });
    }
  }
  let roll = random(state) * options.reduce((total, option) => total + option.weight, 0);
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.offset;
  }
  return options[options.length - 1]!.offset;
}

export function fireCatapult(state: GameState, unitId: string, target: Position): boolean {
  const catapult = state.units.find((unit) => unit.id === unitId);
  if (!catapult) return false;
  const intendedUnit = unitAt(state, target);
  if (intendedUnit?.playerId === catapult.playerId) return false;
  const legal = getCatapultFireCells(state, unitId).some(
    (position) => position.x === target.x && position.y === target.y,
  );
  if (!legal) return false;

  forfeitPendingCatapultFire(state, unitId);

  const distance = Math.max(
    Math.abs(target.x - catapult.position.x),
    Math.abs(target.y - catapult.position.y),
  );
  const scatterRadius = catapultScatterRadius(distance);
  const scatter = catapultScatterOffset(state, scatterRadius);
  const scatterX = scatter.x;
  const scatterY = scatter.y;
  const landedAt = {
    x: Math.max(0, Math.min(state.width - 1, target.x + scatterX)),
    y: Math.max(0, Math.min(state.height - 1, target.y + scatterY)),
  };
  const impact = unitAt(state, landedAt);
  const castleImpact = playerAtCastle(state, landedAt);

  catapult.fired = true;
  // Firing without moving is the Catapult's action for the round; it cannot
  // shoot first and then relocate to bypass the immediate-fire rule.
  catapult.moved = true;
  catapult.pendingFireAfterMove = false;
  state.lastShot = { aimedAt: { ...target }, landedAt, scatterRadius };
  const attacker = state.players.find((player) => player.id === catapult.playerId);
  const firingStats = battleStatsFor(state, catapult.playerId);
  firingStats.catapultShots += 1;
  if (impact) {
    firingStats.catapultHits += 1;
    if (impact.playerId === catapult.playerId) firingStats.friendlyFireHits += 1;
  }
  const offset = Math.max(Math.abs(scatterX), Math.abs(scatterY));
  const accuracyText = offset === 0 ? "dead on target" : `${offset} square${offset === 1 ? "" : "s"} off target`;
  if (impact?.type === "soldier" && impact.shieldWall) {
    impact.shieldWall = false;
    const allegiance = impact.playerId === catapult.playerId ? "friendly" : "enemy";
    state.log.unshift(`${attacker?.name ?? "A"} catapult lands ${accuracyText}, but the ${allegiance} Viking's Shield Wall holds!`);
  } else if (impact?.type === "soldier" && impact.drunk && impact.playerId !== catapult.playerId) {
    impact.playerId = catapult.playerId;
    impact.drunk = false;
    impact.moved = true;
    state.log.unshift(`${attacker?.name ?? "A"} catapult lands ${accuracyText} and convinces a formerly drunk Viking to change sides!`);
  } else if (impact?.type === "longboat" && sturdyLongboatSaves(state, impact)) {
    const allegiance = impact.playerId === catapult.playerId ? "friendly" : "enemy";
    state.log.unshift(`${attacker?.name ?? "A"} catapult lands ${accuracyText}, but a Sturdy Longboat saves the ${allegiance} vessel!`);
  } else if (impact) {
    removeUnitAndCargo(state, impact);
    if (impact.type === "longboat") firingStats.longboatsSunk += 1;
    const allegiance = impact.playerId === catapult.playerId ? "friendly" : "enemy";
    const outcome = impact.type === "longboat" ? "sinks" : "hits";
    state.log.unshift(`${attacker?.name ?? "A"} catapult lands ${accuracyText} and ${outcome} a ${allegiance} ${impact.type}!`);
  } else if (castleImpact) {
    state.log.unshift(`${attacker?.name ?? "A"} catapult lands ${accuracyText} and rattles ${castleImpact.name}'s stonework.`);
  } else {
    state.log.unshift(`${attacker?.name ?? "A"} catapult lands ${accuracyText}; no unit is struck.`);
  }
  return true;
}

function purchasePositions(state: GameState, player: Player, type: UnitType): Position[] {
  const positions: Position[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const position = { x: player.castle.x + dx, y: player.castle.y + dy };
      if (!isInside(state, position) || unitAt(state, position)) continue;
      if (playerAtCastle(state, position)) continue;
      if (
        type === "longboat"
          ? canPlaceLongboat(state, position, { x: 1, y: 0 })
          : type === "catapult"
            ? canPlaceCatapult(state, position)
          : UNIT_RULES[type].terrain.includes(terrainAt(state, position)) && !movementObstacleAt(state, position)
      ) positions.push(position);
    }
  }
  return positions;
}

export function canBuyUnit(state: GameState, playerId: PlayerId, type: UnitType): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return Boolean(
    player &&
      !player.eliminated &&
      activePlayer(state).id === playerId &&
      state.turnPhase === "purchase" &&
      player.gold >= UNIT_RULES[type].cost &&
      purchasePositions(state, player, type).length > 0,
  );
}

export function buyUnit(state: GameState, playerId: PlayerId, type: UnitType): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !canBuyUnit(state, playerId, type)) return false;
  const position = purchasePositions(state, player, type)[0];
  if (!position) return false;
  forfeitPendingCatapultFire(state);
  player.gold -= UNIT_RULES[type].cost;
  state.units.push({
    id: nextUnitId(state, playerId, type),
    playerId,
    type,
    position,
    moved: true,
    fired: true,
    facing: type === "longboat" ? { x: 1, y: 0 } : undefined,
  });
  battleStatsFor(state, playerId).unitsPurchased[type] += 1;
  state.log.unshift(`${player.name} hires a ${UNIT_RULES[type].name.toLowerCase()}.`);
  return true;
}

/** Commit all movement and combat before opening the castle market. */
export function completeManoeuvres(state: GameState): boolean {
  if (state.winnerId || state.turnPhase !== "movement" || getPendingCatapult(state)) return false;
  state.turnPhase = "purchase";
  state.log.unshift(`${activePlayer(state).name} completes Viking manoeuvres and opens the war chest.`);
  return true;
}

export function endTurn(state: GameState): boolean {
  if (state.winnerId || state.turnPhase !== "purchase") return false;
  forfeitPendingCatapultFire(state);
  const endingPlayer = activePlayer(state);
  // A carrier does not need to step away and back again. This also repairs a
  // delivery if an older game state left the Soldier waiting beside home.
  bankWaitingTreasure(state, endingPlayer.id);
  state.completedTurns += 1;
  // Round 1 is deliberately card-free so every faction can establish itself
  // before fate begins meddling. Thereafter, Every turn draws each round and
  // Every two turns draws only during even-numbered rounds.
  const sagaDue = state.round >= 2 && (
    state.eventCardFrequency === "every-turn"
    || (state.eventCardFrequency === "every-two-turns" && state.round % 2 === 0)
  );
  if (sagaDue) drawEndTurnEvent(state, endingPlayer.id);
  const currentIndex = state.activePlayerIndex;
  let nextIndex = currentIndex;
  do {
    nextIndex = (nextIndex + 1) % state.players.length;
  } while (state.players[nextIndex]?.eliminated && nextIndex !== currentIndex);

  if (nextIndex <= currentIndex) {
    const completedRound = state.round;
    state.round += 1;
    advanceWinter(state, completedRound);
  }
  state.activePlayerIndex = nextIndex;
  state.turnPhase = "movement";
  const nextPlayer = activePlayer(state);
  bankWaitingTreasure(state, nextPlayer.id);
  nextPlayer.gold += TURN_INCOME;
  for (const unit of state.units) {
    if (unit.playerId === nextPlayer.id) {
      unit.moved = false;
      unit.fired = false;
      unit.pendingFireAfterMove = false;
    }
  }
  state.log.unshift(`${nextPlayer.name} begins a turn and collects ${TURN_INCOME} gold.`);
  return true;
}

/** Advance at most one north-to-south ice band after every faction has moved. */
export function advanceWinter(state: GameState, completedRound: number): boolean {
  if (!state.winterEnabled || state.winterPhase >= WINTER_PHASES) return false;
  if (state.winterPhase === 0 && completedRound < state.winterStartRound) return false;

  state.winterPhase += 1;
  const frozenRows = Math.ceil((state.height * state.winterPhase) / WINTER_PHASES);
  for (let y = 0; y < frozenRows; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const index = y * state.width + x;
      if (state.terrain[index] === "water") state.terrain[index] = "ice";
    }
  }
  evacuateFrozenLongboats(state);

  if (state.winterPhase === 1) {
    state.log.unshift("Winter Is Coming! The northern fjord begins to freeze.");
  } else if (state.winterPhase === WINTER_PHASES) {
    state.log.unshift("Winter seals the southern fjord. Every waterway is now frozen.");
  } else {
    state.log.unshift(`Winter advances southward (${state.winterPhase}/${WINTER_PHASES}).`);
  }
  return true;
}

export function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

