import { describe, expect, it } from "vitest";
import {
  activePlayer,
  advanceWinter,
  BENIGN_SAGA_CARD_POOL,
  BENIGN_SAGA_CARDS_PER_MATCH,
  BOARD_WIDTH,
  buyUnit,
  canBuyUnit,
  carriedTreasure,
  completeManoeuvres,
  createGame,
  disembarkSoldier,
  drawEndTurnEvent,
  drinkingHornAt,
  EVENT_CARDS,
  endTurn,
  fireCatapult,
  getCastleCaptureChance,
  getCatapultFireCells,
  getCatapultTargets,
  getCombatWinChance,
  getDisembarkCells,
  getLegalMoves,
  longboatIsFrozen,
  longboatPassengers,
  moveUnit,
  moveDrunkSoldier,
  positionKey,
  skipPendingCatapultFire,
  terrainAt,
  TURN_INCOME,
  UNIT_RULES,
  WINTER_EARLIEST_ROUND,
  WINTER_LATEST_ROUND,
  WINTER_PHASES,
  unitAt,
  unitFootprint,
} from "../src/core";
import { AI_PURCHASE_LIMIT, chooseAiCatapultTarget, chooseAiDisembark, chooseAiMove, chooseAiPurchase } from "../src/ai";
import { executeComputerTurn } from "../src/simulation";
import { CASTLE_ASSAULT_DURATION_MS, captureMovementContext, completeMovementPresentation } from "../src/movementPresentation";
import { captureShotContext, completeShotPresentation } from "../src/shotPresentation";
import type { Difficulty, GameState, PlayerId, PlayerSetup, Unit } from "../src/types";

const setups: PlayerSetup[] = [
  { id: "blue", controller: "human" },
  { id: "red", controller: "normal" },
  { id: "pink", controller: "off" },
  { id: "green", controller: "off" },
];

const fourPlayerSetups: PlayerSetup[] = [
  { id: "blue", controller: "human" },
  { id: "red", controller: "normal" },
  { id: "pink", controller: "normal" },
  { id: "green", controller: "normal" },
];

/** Catapults are no longer starting units, so focused Catapult tests create their own. */
function testCatapult(state: GameState, playerId: PlayerId): Unit {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  return {
    id: `${playerId}-test-catapult-${state.units.length}`,
    playerId,
    type: "catapult",
    position: { ...player.castle },
    moved: false,
    fired: false,
  };
}

function finishTurn(state: GameState): void {
  expect(completeManoeuvres(state)).toBe(true);
  expect(endTurn(state)).toBe(true);
}

describe("game rules", () => {
  it("creates the enlarged board and requested players", () => {
    const state = createGame(setups);
    expect(state.width).toBe(32);
    expect(state.height).toBe(24);
    expect(state.players).toHaveLength(2);
    expect(activePlayer(state).id).toBe("blue");
    expect(state.players.every((player) => player.gold === 50)).toBe(true);
    expect(state.treasures).toHaveLength(2);
    expect(state.drinkingHorns).toHaveLength(4);
    expect(state.eventCardFrequency).toBe("every-two-turns");
    expect(state.eventDeck).toHaveLength(40);
    expect(EVENT_CARDS).toHaveLength(30);
    expect(BENIGN_SAGA_CARD_POOL).toHaveLength(32);
    expect(state.eventDeck.filter((card) => BENIGN_SAGA_CARD_POOL.includes(card))).toHaveLength(BENIGN_SAGA_CARDS_PER_MATCH);
    expect(state.eventDeck.filter((card) => !BENIGN_SAGA_CARD_POOL.includes(card))).toHaveLength(EVENT_CARDS.length);
    for (const card of EVENT_CARDS) expect(state.eventDeck).toContain(card);
    expect(state.eventDeck.filter((card) => card === "bad-viking")).toHaveLength(2);
    expect(state.eventDeck.filter((card) => card === "sturdy-longboat")).toHaveLength(2);
    expect(state.eventDeck.filter((card) => card === "yule-festival")).toHaveLength(1);
    expect(state.eventDeck.filter((card) => card === "berserker-rage")).toHaveLength(2);
    expect(state.eventDeck.filter((card) => card === "high-winds")).toHaveLength(1);
    expect(state.eventDeck.filter((card) => card === "shield-wall")).toHaveLength(1);
    expect(state.eventDeck.filter((card) => card === "favourable-tide")).toHaveLength(1);
    expect(state.eventDeck.filter((card) => card === "forgotten-rations")).toHaveLength(1);
    const repeated = createGame(setups);
    expect(repeated.eventDeck).toEqual(state.eventDeck);
    expect(state.treasures.every((chest) => chest.value >= 10 && chest.value <= 50 && chest.value % 10 === 0)).toBe(true);
    expect(UNIT_RULES.soldier.cost).toBe(2);
    expect(UNIT_RULES.longboat.cost).toBe(4);
    expect(UNIT_RULES.catapult.cost).toBe(8);
    for (const player of state.players) {
      const startingUnits = state.units.filter((unit) => unit.playerId === player.id);
      expect(startingUnits.filter((unit) => unit.type === "soldier")).toHaveLength(3);
      expect(startingUnits.filter((unit) => unit.type === "longboat")).toHaveLength(1);
      expect(startingUnits.some((unit) => unit.type === "catapult")).toBe(false);
    }
  });

  it("can start a match with the saga event deck disabled", () => {
    const state = createGame(setups, 17, { eventDeckEnabled: false });
    const endingPlayer = activePlayer(state);

    expect(state.eventDeckEnabled).toBe(false);
    expect(state.eventCardFrequency).toBe("off");
    expect(state.eventDeck).toEqual([]);
    expect(drawEndTurnEvent(state, endingPlayer.id)).toBeUndefined();
    finishTurn(state);
    expect(state.lastEvent).toBeUndefined();
    expect(state.eventDeck).toEqual([]);
  });

  it("keeps round 1 card-free, then draws after every faction turn when set to Every turn", () => {
    const state = createGame(fourPlayerSetups, 19, { eventCardFrequency: "every-turn" });
    state.eventDeck = Array.from({ length: 8 }, () => "royal-ransom");

    for (let turn = 0; turn < 4; turn += 1) finishTurn(state);
    expect(state.eventSequence).toBe(0);
    expect(state.lastEvent).toBeUndefined();
    expect(state.round).toBe(2);

    for (let turn = 1; turn <= 4; turn += 1) {
      const endingPlayerId = activePlayer(state).id;
      finishTurn(state);
      expect(state.lastEvent).toMatchObject({ sequence: turn, cardId: "royal-ransom", playerId: endingPlayerId });
    }
    expect(state.round).toBe(3);
  });

  it("draws for every faction in even rounds when saga cards are set to Every two turns", () => {
    const state = createGame(fourPlayerSetups, 19, { eventCardFrequency: "every-two-turns" });
    state.eventDeck = Array.from({ length: 8 }, () => "royal-ransom");

    for (let turn = 0; turn < 4; turn += 1) finishTurn(state);
    expect(state.eventSequence).toBe(0);
    expect(state.lastEvent).toBeUndefined();
    expect(state.round).toBe(2);

    for (let turn = 1; turn <= 4; turn += 1) {
      const endingPlayerId = activePlayer(state).id;
      finishTurn(state);
      expect(state.lastEvent).toMatchObject({ sequence: turn, cardId: "royal-ransom", playerId: endingPlayerId });
    }
    expect(state.round).toBe(3);

    for (let turn = 0; turn < 4; turn += 1) finishTurn(state);
    expect(state.eventSequence).toBe(4);
    expect(state.round).toBe(4);

    for (let turn = 5; turn <= 8; turn += 1) {
      const endingPlayerId = activePlayer(state).id;
      finishTurn(state);
      expect(state.lastEvent).toMatchObject({ sequence: turn, cardId: "royal-ransom", playerId: endingPlayerId });
    }
    expect(state.round).toBe(5);
  });

  it("seedably schedules optional winter after a completed round from 4 to 10", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const state = createGame(setups, seed, { eventDeckEnabled: false, winterEnabled: true });
      expect(state.winterEnabled).toBe(true);
      expect(state.winterStartRound).toBeGreaterThanOrEqual(WINTER_EARLIEST_ROUND);
      expect(state.winterStartRound).toBeLessThanOrEqual(WINTER_LATEST_ROUND);
      expect(state.winterPhase).toBe(0);
    }
  });

  it("freezes one north-to-south band only after every faction has moved", () => {
    const state = createGame(setups, 223, { eventDeckEnabled: false, winterEnabled: true });
    const originalWater = state.terrain
      .map((terrain, index) => terrain === "water" ? { x: index % state.width, y: Math.floor(index / state.width) } : undefined)
      .filter((position): position is { x: number; y: number } => Boolean(position));
    state.winterStartRound = 4;
    state.round = 4;
    expect(WINTER_PHASES).toBe(6);

    finishTurn(state);
    expect(state.winterPhase).toBe(0);
    finishTurn(state);
    expect(state.winterPhase).toBe(1);

    const firstBoundary = Math.ceil(state.height / WINTER_PHASES);
    expect(originalWater.filter((position) => position.y < firstBoundary).every(
      (position) => state.terrain[position.y * state.width + position.x] === "ice",
    )).toBe(true);
    expect(originalWater.filter((position) => position.y >= firstBoundary).some(
      (position) => state.terrain[position.y * state.width + position.x] === "water",
    )).toBe(true);

    for (let phase = 2; phase <= WINTER_PHASES; phase += 1) {
      finishTurn(state);
      expect(state.winterPhase).toBe(phase - 1);
      finishTurn(state);
      expect(state.winterPhase).toBe(phase);
    }
    expect(originalWater.every(
      (position) => state.terrain[position.y * state.width + position.x] === "ice",
    )).toBe(true);

    const boat = state.units.find((unit) => unit.type === "longboat")!;
    state.activePlayerIndex = state.players.findIndex((player) => player.id === boat.playerId);
    boat.moved = false;
    expect(getLegalMoves(state, boat.id)).toEqual([]);
  });

  it("prevents Soldiers from boarding a frozen Longboat", () => {
    const state = createGame(setups, 225, { eventDeckEnabled: false, winterEnabled: true });
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    state.activePlayerIndex = state.players.findIndex((player) => player.id === "blue");
    state.units = [boat, soldier];
    state.terrain.fill("land");
    boat.position = { x: 10, y: 5 };
    soldier.position = { x: 10, y: 4 };
    soldier.moved = false;
    for (const cell of unitFootprint(boat)) {
      state.terrain[cell.y * state.width + cell.x] = "ice";
    }

    expect(longboatIsFrozen(state, boat)).toBe(true);
    expect(getLegalMoves(state, soldier.id)).not.toContainEqual(boat.position);
    expect(moveUnit(state, soldier.id, boat.position)).toBe(false);
    expect(soldier.embarkedOn).toBeUndefined();
  });

  it("automatically disembarks a Longboat's crew when winter traps it", () => {
    const state = createGame(setups, 229, { eventDeckEnabled: false, winterEnabled: true });
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const passengers = state.units
      .filter((unit) => unit.playerId === "blue" && unit.type === "soldier")
      .slice(0, 2);
    state.units = [boat, ...passengers];
    state.treasures = [];
    state.drinkingHorns = [];
    state.terrain.fill("land");
    boat.position = { x: 10, y: 1 };
    for (const cell of unitFootprint(boat)) {
      state.terrain[cell.y * state.width + cell.x] = "water";
    }
    for (const passenger of passengers) {
      passenger.position = { ...boat.position };
      passenger.embarkedOn = boat.id;
    }
    state.winterStartRound = 1;

    expect(advanceWinter(state, 1)).toBe(true);
    expect(longboatIsFrozen(state, boat)).toBe(true);
    expect(longboatPassengers(state, boat.id)).toEqual([]);
    expect(passengers.every((passenger) => passenger.embarkedOn === undefined)).toBe(true);
    expect(passengers.every((passenger) => {
      const terrain = state.terrain[passenger.position.y * state.width + passenger.position.x];
      return terrain === "land" || terrain === "ice";
    })).toBe(true);
    expect(state.log.some((entry) => entry.includes("forces 2 Vikings ashore"))).toBe(true);
  });

  it("lets land units cross frozen water and keeps winter disabled when toggled off", () => {
    const state = createGame(setups, 227, { eventDeckEnabled: false, winterEnabled: false });
    const terrainBefore = [...state.terrain];
    expect(advanceWinter(state, 10)).toBe(false);
    expect(state.terrain).toEqual(terrainBefore);

    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    state.activePlayerIndex = state.players.findIndex((player) => player.id === soldier.playerId);
    state.units = [soldier];
    soldier.position = { x: 10, y: 10 };
    soldier.moved = false;
    state.terrain.fill("land");
    state.terrain[10 * state.width + 11] = "ice";
    expect(getLegalMoves(state, soldier.id)).toContainEqual({ x: 11, y: 10 });
  });

  it("seedably randomizes the starter and fixed player order when enabled", () => {
    const fourPlayers: PlayerSetup[] = [
      { id: "blue", controller: "human" },
      { id: "red", controller: "easy" },
      { id: "pink", controller: "normal" },
      { id: "green", controller: "hard" },
    ];
    const options = {
      eventDeckEnabled: false,
      randomStartingPlayer: true,
      randomPlayerOrder: true,
    };
    const first = createGame(fourPlayers, 811, options);
    const repeated = createGame(fourPlayers, 811, options);
    const initialOrder = first.players.map((player) => player.id);

    expect(repeated.players.map((player) => player.id)).toEqual(initialOrder);
    expect(first.randomStartingPlayer).toBe(true);
    expect(first.randomPlayerOrder).toBe(true);
    expect(first.log[0]).toContain("Order:");

    for (let turn = 0; turn < first.players.length; turn += 1) finishTurn(first);
    expect(first.players.map((player) => player.id)).toEqual(initialOrder);
    expect(activePlayer(first).id).toBe(initialOrder[0]);

    const observedOrders = new Set<string>();
    const observedStarters = new Set<string>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const state = createGame(fourPlayers, seed, options);
      observedOrders.add(state.players.map((player) => player.id).join(","));
      observedStarters.add(activePlayer(state).id);
    }
    expect(observedOrders.size).toBeGreaterThan(1);
    expect(observedStarters.size).toBeGreaterThan(1);
  });

  it("keeps the setup sequence when both random-order options are disabled", () => {
    const state = createGame(setups, 812, {
      randomStartingPlayer: false,
      randomPlayerOrder: false,
    });
    expect(state.players.map((player) => player.id)).toEqual(["blue", "red"]);
    expect(activePlayer(state).id).toBe("blue");
  });

  it("does not let the two random options cancel out in a two-player match", () => {
    const starters = new Set<string>();
    for (let seed = 7000; seed < 7040; seed += 1) {
      const state = createGame(setups, seed, {
        eventDeckEnabled: false,
        randomStartingPlayer: true,
        randomPlayerOrder: true,
      });
      starters.add(activePlayer(state).id);
    }
    expect(starters).toEqual(new Set(["blue", "red"]));
  });

  it("supports four independently configured factions", () => {
    const state = createGame([
      { id: "blue", controller: "human" },
      { id: "red", controller: "easy" },
      { id: "pink", controller: "normal" },
      { id: "green", controller: "hard" },
    ]);
    expect(state.players.map((player) => player.controller)).toEqual([
      "human",
      "easy",
      "normal",
      "hard",
    ]);
    expect(state.units.filter((unit) => unit.type === "longboat")).toHaveLength(4);
  });

  it("randomizes faction starting corners from the game seed", () => {
    const blueCorners = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = createGame(setups, seed);
      const blue = state.players.find((player) => player.id === "blue")!;
      blueCorners.add(`${blue.castle.x < state.width / 2 ? "left" : "right"}-${blue.castle.y < state.height / 2 ? "top" : "bottom"}`);
    }
    expect(blueCorners.size).toBeGreaterThan(1);
  });

  it("places two factions in opposite rather than adjacent home regions", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const state = createGame(setups, seed);
      const [first, second] = state.players;
      expect(first!.castle.x < state.width / 2).not.toBe(second!.castle.x < state.width / 2);
      expect(first!.castle.y < state.height / 2).not.toBe(second!.castle.y < state.height / 2);
    }
  });

  it("uses a widely spaced triangular arrangement for three factions", () => {
    const threeSetups: PlayerSetup[] = [
      ...setups,
      { id: "pink", controller: "normal" },
    ];
    for (let seed = 1; seed <= 80; seed += 1) {
      const state = createGame(threeSetups, seed);
      const castles = state.players.map((player) => player.castle);
      const distances = [
        Math.hypot(castles[0]!.x - castles[1]!.x, castles[0]!.y - castles[1]!.y),
        Math.hypot(castles[0]!.x - castles[2]!.x, castles[0]!.y - castles[2]!.y),
        Math.hypot(castles[1]!.x - castles[2]!.x, castles[1]!.y - castles[2]!.y),
      ];
      expect(Math.min(...distances), `castles too close on seed ${seed}`).toBeGreaterThanOrEqual(14);
      expect(Math.max(...distances) - Math.min(...distances), `uneven triangle on seed ${seed}`).toBeLessThanOrEqual(10);
    }
  });

  it("offers straight-line moves and marks a moved unit", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier");
    expect(soldier).toBeDefined();
    const moves = getLegalMoves(state, soldier!.id);
    expect(moves.length).toBeGreaterThan(0);
    expect(moveUnit(state, soldier!.id, moves[0]!)).toBe(true);
    expect(soldier!.moved).toBe(true);
    expect(getLegalMoves(state, soldier!.id)).toEqual([]);
  });

  it("lets Soldiers choose 0–9 spaces or make a forced run to the next object", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    for (let x = 0; x < state.width; x += 1) state.terrain[1 * state.width + x] = "land";
    soldier.position = { x: 2, y: 1 };
    state.units = [
      soldier,
      {
        ...state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!,
        position: { x: 7, y: 1 },
      },
    ];
    const moves = getLegalMoves(state, soldier.id);
    expect(moves).toContainEqual({ x: 7, y: 1 });
    expect(moves).not.toContainEqual({ x: 8, y: 1 });

    state.units = [soldier];
    const openMoves = getLegalMoves(state, soldier.id);
    expect(openMoves).toContainEqual({ x: 11, y: 1 });
    expect(openMoves).not.toContainEqual({ x: 12, y: 1 });
    expect(openMoves).not.toContainEqual({ x: 13, y: 1 });
    expect(openMoves).toContainEqual({ x: state.width - 1, y: 1 });

    const blocker = { ...soldier, id: "friendly-blocker", position: { x: 15, y: 1 } };
    state.units = [soldier, blocker];
    const blockedMoves = getLegalMoves(state, soldier.id);
    expect(blockedMoves).toContainEqual({ x: 14, y: 1 });
    expect(blockedMoves).not.toContainEqual({ x: 12, y: 1 });
  });

  it("never lets an unembarked Soldier enter water", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    soldier.position = { x: 4, y: 4 };
    state.terrain[4 * state.width + 4] = "land";
    state.terrain[4 * state.width + 5] = "water";
    state.units = [soldier];

    expect(getLegalMoves(state, soldier.id)).not.toContainEqual({ x: 5, y: 4 });
    expect(moveUnit(state, soldier.id, { x: 5, y: 4 })).toBe(false);
  });

  it("makes a Soldier drunk when they reach a Drinking Horn and drops carried treasure", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    soldier.position = { x: 10, y: 10 };
    state.terrain[10 * state.width + 10] = "land";
    state.terrain[10 * state.width + 11] = "land";
    state.units = [soldier];
    state.drinkingHorns = [{ id: "test-horn", position: { x: 11, y: 10 } }];
    state.treasures = [{ id: "carried-chest", value: 20, position: { ...soldier.position }, carriedBy: soldier.id }];

    expect(moveUnit(state, soldier.id, { x: 11, y: 10 })).toBe(true);
    expect(soldier.drunk).toBe(true);
    expect(drinkingHornAt(state, { x: 11, y: 10 })).toBeUndefined();
    expect(carriedTreasure(state, soldier.id)).toBeUndefined();
    expect(state.treasures[0]?.position).not.toEqual(soldier.position);
    expect(unitAt(state, state.treasures[0]!.position)).toBeUndefined();
    expect(drinkingHornAt(state, state.treasures[0]!.position)).toBeUndefined();
  });

  it("retains a consumed Drinking Horn in the movement presentation until contact", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    soldier.position = { x: 10, y: 10 };
    state.terrain[10 * state.width + 10] = "land";
    state.terrain[10 * state.width + 11] = "land";
    state.units = [soldier];
    state.drinkingHorns = [{ id: "visible-horn", position: { x: 11, y: 10 } }];
    const context = captureMovementContext(state, soldier.id, { x: 11, y: 10 })!;

    expect(moveUnit(state, soldier.id, { x: 11, y: 10 })).toBe(true);
    const presentation = completeMovementPresentation(state, context);

    expect(state.drinkingHorns).toHaveLength(0);
    expect(presentation.becameDrunk).toBe(true);
    expect(presentation.consumedHorn).toEqual({ id: "visible-horn", position: { x: 11, y: 10 } });
    expect(presentation.arrival).toBe("drinking");
  });

  it("makes a Drinking Horn stop a Soldier instead of allowing movement through it", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    soldier.position = { x: 2, y: 1 };
    for (let x = 0; x < state.width; x += 1) state.terrain[1 * state.width + x] = "land";
    state.units = [soldier];
    state.drinkingHorns = [{ id: "blocking-horn", position: { x: 6, y: 1 } }];

    const moves = getLegalMoves(state, soldier.id);
    expect(moves).toContainEqual({ x: 6, y: 1 });
    expect(moves).not.toContainEqual({ x: 7, y: 1 });
    expect(moveUnit(state, soldier.id, { x: 6, y: 1 })).toBe(true);
    expect(soldier.drunk).toBe(true);
  });

  it("prevents a Catapult moving onto or through a Drinking Horn", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    catapult.position = { x: 2, y: 2 };
    for (let x = 0; x < state.width; x += 1) state.terrain[2 * state.width + x] = "land";
    state.units = [catapult];
    state.drinkingHorns = [{ id: "blocking-horn", position: { x: 6, y: 2 } }];

    const moves = getLegalMoves(state, catapult.id);
    expect(moves).toContainEqual({ x: 4, y: 2 });
    expect(moves).not.toContainEqual({ x: 5, y: 2 });
    expect(moves).not.toContainEqual({ x: 7, y: 2 });
  });

  it("keeps a defeated castle as a blocking board obstacle", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const defeated = state.players.find((player) => player.id === "red")!;
    soldier.position = { x: 2, y: 1 };
    defeated.castle = { x: 6, y: 1 };
    defeated.eliminated = true;
    for (let x = 0; x < state.width; x += 1) state.terrain[1 * state.width + x] = "land";
    state.units = [soldier];

    const moves = getLegalMoves(state, soldier.id);
    expect(moves).toContainEqual({ x: 5, y: 1 });
    expect(moves).not.toContainEqual({ x: 6, y: 1 });
    expect(moves).not.toContainEqual({ x: 7, y: 1 });
  });

  it("keeps drunk Soldiers out of Longboats and moves them under computer control", () => {
    const state = createGame(setups);
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    boat.position = { x: 15, y: 10 };
    soldier.position = { x: 14, y: 9 };
    soldier.drunk = true;
    for (const cell of unitFootprint(boat)) state.terrain[cell.y * state.width + cell.x] = "water";
    state.terrain[9 * state.width + 14] = "land";
    state.units = [boat, soldier];

    expect(getLegalMoves(state, soldier.id)).not.toContainEqual(boat.position);
    state.units = [soldier];
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    const before = { ...soldier.position };
    expect(moveDrunkSoldier(state, soldier.id)).toBe(true);
    expect(soldier.moved).toBe(true);
    expect(soldier.position).not.toEqual(before);
  });

  it("converts and sobers a drunk defender but lets drunk Soldiers attack Catapults normally", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redSoldier = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blueSoldier.position = { x: 10, y: 10 };
    redSoldier.position = { x: 15, y: 10 };
    redSoldier.drunk = true;
    for (let x = 10; x <= 15; x += 1) state.terrain[10 * state.width + x] = "land";
    state.units = [blueSoldier, redSoldier];

    const conversionContext = captureMovementContext(state, blueSoldier.id, redSoldier.position)!;
    expect(moveUnit(state, blueSoldier.id, redSoldier.position)).toBe(true);
    const conversionPresentation = completeMovementPresentation(state, conversionContext);
    expect(redSoldier.playerId).toBe("blue");
    expect(redSoldier.position).toEqual({ x: 15, y: 10 });
    expect(redSoldier.drunk).toBe(false);
    expect(blueSoldier.moved).toBe(true);
    expect(blueSoldier.position).toEqual({ x: 10, y: 10 });
    expect(conversionPresentation.arrival).toBe("converted");
    expect(conversionPresentation.drunkConversion).toMatchObject({
      attacker: { id: blueSoldier.id, position: { x: 10, y: 10 } },
      defenderBefore: { id: redSoldier.id, playerId: "red", drunk: true, position: { x: 15, y: 10 } },
      defenderAfter: { id: redSoldier.id, playerId: "blue", drunk: false, position: { x: 15, y: 10 } },
    });

    blueSoldier.moved = false;
    blueSoldier.drunk = true;
    const catapult = testCatapult(state, "red");
    catapult.position = { x: 11, y: 10 };
    state.units = [blueSoldier, catapult];
    expect(moveUnit(state, blueSoldier.id, catapult.position)).toBe(true);
    expect(blueSoldier.drunk).toBe(true);
    expect(state.units).not.toContain(catapult);
  });

  it("generates varied boat-navigable fjords, with classic separated waterways about one-third of the time", () => {
    let mapsWithSeparateWaterways = 0;
    const samples = 60;

    for (let seed = 1; seed <= samples; seed += 1) {
      const state = createGame(setups, seed);
      const water = new Set<string>();
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) {
          if (state.terrain[y * state.width + x] === "water") water.add(positionKey({ x, y }));
        }
      }

      const unseen = new Set(water);
      let components = 0;
      while (unseen.size > 0) {
        components += 1;
        const first = unseen.values().next().value as string;
        const queue = [first];
        unseen.delete(first);
        while (queue.length) {
          const [x, y] = queue.shift()!.split(",").map(Number) as [number, number];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const key = `${x + dx},${y + dy}`;
            if (unseen.delete(key)) queue.push(key);
          }
        }
      }
      if (components > 1) mapsWithSeparateWaterways += 1;

      for (const key of water) {
        const [x, y] = key.split(",").map(Number) as [number, number];
        const fitsBoat = [-1, 0, 1].some((centreOffset) =>
          [-1, 0, 1].every((offset) => water.has(`${x + centreOffset + offset},${y}`)),
        );
        expect(fitsBoat, `water square ${key} on seed ${seed} should accommodate part of a longboat`).toBe(true);
      }

      const waterColumns = [...water].map((key) => Number(key.split(",")[0]));
      const leftMargin = Math.min(...waterColumns);
      const rightMargin = state.width - 1 - Math.max(...waterColumns);
      expect([2, 3, 4], `left edge bank on seed ${seed} must be 2–4 tiles`).toContain(leftMargin);
      expect([2, 3, 4], `right edge bank on seed ${seed} must be 2–4 tiles`).toContain(rightMargin);
    }

    // The classic central-island recipe is selected one map in three.  A
    // generous range keeps this durable while still catching accidental loss
    // of the intended disconnected-waterway variant.
    expect(mapsWithSeparateWaterways).toBeGreaterThanOrEqual(14);
    expect(mapsWithSeparateWaterways).toBeLessThanOrEqual(28);
  });

  it("does not impose a systematic left or right bias on water generation", () => {
    let combinedCentre = 0;
    const samples = 32;
    for (let seed = 1; seed <= samples; seed += 1) {
      const state = createGame(setups, seed);
      const waterColumns: number[] = [];
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) {
          if (state.terrain[y * state.width + x] === "water") waterColumns.push(x);
        }
      }
      combinedCentre += waterColumns.reduce((total, x) => total + x, 0) / waterColumns.length;
    }
    const averageCentre = combinedCentre / samples;
    expect(Math.abs(averageCentre - (BOARD_WIDTH - 1) / 2)).toBeLessThan(0.75);
  });

  it("gives classic outer fjords gentle bank variation without breaking Longboat routes", () => {
    for (const seed of [3, 6, 9, 12, 15, 18]) {
      const state = createGame(setups, seed);
      const water = new Set<string>();
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) {
          if (state.terrain[y * state.width + x] === "water") water.add(`${x},${y}`);
        }
      }

      const waterColumns = [...water].map((key) => Number(key.split(",")[0]));
      const left = Math.min(...waterColumns);
      const right = Math.max(...waterColumns);
      const topBank = new Set<number>();
      const bottomBank = new Set<number>();
      for (let x = left + 5; x <= right - 5; x += 1) {
        const columnWater = Array.from({ length: state.height }, (_, y) => y)
          .filter((y) => water.has(`${x},${y}`));
        topBank.add(Math.min(...columnWater));
        bottomBank.add(Math.max(...columnWater));
      }
      expect(topBank.size, `classic top bank on seed ${seed} should not be ruler-straight`).toBeGreaterThan(1);
      expect(bottomBank.size, `classic bottom bank on seed ${seed} should not be ruler-straight`).toBeGreaterThan(1);

      const boatCentres = new Set<string>();
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 1; x < state.width - 1; x += 1) {
          if ([-1, 0, 1].every((offset) => water.has(`${x + offset},${y}`))) boatCentres.add(`${x},${y}`);
        }
      }
      const unseenCentres = new Set(boatCentres);
      const routeSizes: number[] = [];
      while (unseenCentres.size > 0) {
        const first = unseenCentres.values().next().value as string;
        const [startX, startY] = first.split(",").map(Number) as [number, number];
        const reachable = new Set([first]);
        const queue = [{ x: startX, y: startY }];
        unseenCentres.delete(first);
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const dx of [-1, 0, 1]) {
            for (const dy of [-1, 0, 1]) {
              if (dx === 0 && dy === 0) continue;
              const key = `${current.x + dx},${current.y + dy}`;
              if (boatCentres.has(key) && !reachable.has(key)) {
                reachable.add(key);
                unseenCentres.delete(key);
                queue.push({ x: current.x + dx, y: current.y + dy });
              }
            }
          }
        }
        routeSizes.push(reachable.size);
      }
      // The short detached inner inlet is intentional. At a broad corner a
      // few harmless fringe centre positions can also form their own tiny
      // cluster, so assess the actual outer sailing circuit rather than the
      // raw number of possible centre-position clusters.
      expect(Math.max(...routeSizes), `outer Longboat route on seed ${seed} must remain continuous`).toBeGreaterThan(40);
    }
  });

  it("places every castle on shared land with a route to an opponent", () => {
    const state = createGame([
      { id: "blue", controller: "human" },
      { id: "red", controller: "easy" },
      { id: "pink", controller: "normal" },
      { id: "green", controller: "hard" },
    ]);
    for (const player of state.players) {
      const visited = new Set([positionKey(player.castle)]);
      const queue = [{ ...player.castle }];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const next = { x: current.x + dx, y: current.y + dy };
          const key = positionKey(next);
          if (
            next.x >= 0 && next.y >= 0 && next.x < state.width && next.y < state.height &&
            state.terrain[next.y * state.width + next.x] === "land" && !visited.has(key)
          ) {
            visited.add(key);
            queue.push(next);
          }
        }
      }
      expect(
        state.players.some(
          (opponent) => opponent.id !== player.id && visited.has(positionKey(opponent.castle)),
        ),
      ).toBe(true);
    }
  });

  it("places every home castle beside a usable horizontal Longboat berth", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = createGame([
        { id: "blue", controller: "human" },
        { id: "red", controller: "easy" },
        { id: "pink", controller: "normal" },
        { id: "green", controller: "hard" },
      ], seed);
      for (const player of state.players) {
        const hasMooring = Array.from({ length: state.height }, (_, y) => y).some((y) =>
          Array.from({ length: state.width - 2 }, (_, index) => index + 1).some((x) => {
            const boatCells = [{ x: x - 1, y }, { x, y }, { x: x + 1, y }];
            return (
              boatCells.every((cell) => state.terrain[cell.y * state.width + cell.x] === "water") &&
              Math.max(Math.abs(x - player.castle.x), Math.abs(y - player.castle.y)) <= 1
            );
          }),
        );
        expect(hasMooring, `${player.name} should start beside water`).toBe(true);
      }
    }
  });

  it("places every starting unit adjacent to its own castle", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = createGame([
        { id: "blue", controller: "human" },
        { id: "red", controller: "easy" },
        { id: "pink", controller: "normal" },
        { id: "green", controller: "hard" },
      ], seed);
      for (const player of state.players) {
        const startingUnits = state.units.filter((unit) => unit.playerId === player.id);
        expect(startingUnits).toHaveLength(4);
        for (const unit of startingUnits) {
          expect(Math.max(Math.abs(unit.position.x - player.castle.x), Math.abs(unit.position.y - player.castle.y))).toBe(1);
        }
      }
    }
  });

  it("never gives a starting Soldier a straight first-turn attack on another castle", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const state = createGame([
        { id: "blue", controller: "human" },
        { id: "red", controller: "easy" },
        { id: "pink", controller: "normal" },
        { id: "green", controller: "hard" },
      ], seed);
      for (let playerIndex = 0; playerIndex < state.players.length; playerIndex += 1) {
        state.activePlayerIndex = playerIndex;
        const player = state.players[playerIndex]!;
        const enemyCastles = state.players
          .filter((candidate) => candidate.id !== player.id)
          .map((candidate) => candidate.castle);
        for (const soldier of state.units.filter(
          (unit) => unit.playerId === player.id && unit.type === "soldier",
        )) {
          soldier.moved = false;
          const legalMoves = getLegalMoves(state, soldier.id);
          expect(
            legalMoves.some((move) => enemyCastles.some((castle) => positionKey(move) === positionKey(castle))),
            `${player.name} should not have a first-turn castle attack on seed ${seed}`,
          ).toBe(false);
        }
      }
    }
  });

  it("uses three-square longboats that carry and disembark up to three Vikings", () => {
    const state = createGame(setups);
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const soldiers = state.units.filter((unit) => unit.playerId === "blue" && unit.type === "soldier");
    boat.position = { x: 15, y: 10 };
    boat.facing = { x: 1, y: 0 };
    for (const cell of unitFootprint(boat)) state.terrain[cell.y * state.width + cell.x] = "water";
    soldiers[0]!.position = { x: 14, y: 9 };
    state.terrain[9 * state.width + 14] = "land";
    state.units = [boat, ...soldiers];

    expect(unitFootprint(boat)).toEqual([{ x: 14, y: 10 }, { x: 15, y: 10 }, { x: 16, y: 10 }]);
    expect(getLegalMoves(state, soldiers[0]!.id)).toContainEqual(boat.position);
    expect(moveUnit(state, soldiers[0]!.id, boat.position)).toBe(true);
    expect(longboatPassengers(state, boat.id)).toHaveLength(1);
    expect(getLegalMoves(state, soldiers[0]!.id)).toEqual([]);

    const chestShore = getDisembarkCells(state, boat.id)[0]!;
    state.treasures = [{ id: "blocked-shore-chest", value: 10, position: { ...chestShore } }];
    expect(getDisembarkCells(state, boat.id)).not.toContainEqual(chestShore);
    const shore = getDisembarkCells(state, boat.id)[0]!;
    expect(disembarkSoldier(state, boat.id, shore)).toBe(true);
    expect(longboatPassengers(state, boat.id)).toHaveLength(0);
    expect(soldiers[0]!.position).toEqual(shore);
  });

  it("disembarks the chosen treasure-carrying Veteran without losing the chest", () => {
    const state = createGame(setups, 47, { eventDeckEnabled: false });
    const blue = state.players.find((player) => player.id === "blue")!;
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const [ordinary, carrier] = state.units.filter(
      (unit) => unit.playerId === "blue" && unit.type === "soldier",
    );
    blue.castle = { x: 2, y: 2 };
    boat.position = { x: 15, y: 10 };
    boat.facing = { x: 1, y: 0 };
    ordinary!.position = { ...boat.position };
    ordinary!.embarkedOn = boat.id;
    carrier!.position = { ...boat.position };
    carrier!.embarkedOn = boat.id;
    carrier!.veteran = true;
    state.terrain.fill("land");
    for (const cell of unitFootprint(boat)) state.terrain[cell.y * state.width + cell.x] = "water";
    state.units = [boat, ordinary!, carrier!];
    state.treasures = [{
      id: "voyage-chest",
      value: 30,
      position: { ...boat.position },
      carriedBy: carrier!.id,
    }];

    const shore = getDisembarkCells(state, boat.id)[0]!;
    expect(disembarkSoldier(state, boat.id, shore, carrier!.id)).toBe(true);

    expect(carrier!.embarkedOn).toBeUndefined();
    expect(carrier!.position).toEqual(shore);
    expect(ordinary!.embarkedOn).toBe(boat.id);
    expect(carriedTreasure(state, carrier!.id)).toMatchObject({ id: "voyage-chest", value: 30 });
  });

  it("keeps multi-square units on the board when they move across their own old footprint", () => {
    for (const dx of [-1, 1]) {
      const state = createGame(setups);
      const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
      const passenger = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
      state.terrain.fill("water");
      boat.position = { x: 10, y: 10 };
      boat.moved = false;
      passenger.position = { ...boat.position };
      passenger.embarkedOn = boat.id;
      state.units = [boat, passenger];
      const destination = { x: boat.position.x + dx, y: boat.position.y };
      const context = captureMovementContext(state, boat.id, destination)!;

      expect(getLegalMoves(state, boat.id)).toContainEqual(destination);
      expect(moveUnit(state, boat.id, destination)).toBe(true);
      expect(state.units).toContain(boat);
      expect(state.units).toContain(passenger);
      expect(boat.position).toEqual(destination);
      expect(passenger.position).toEqual(destination);
      expect(completeMovementPresentation(state, context).destroyedUnit).toBeUndefined();
      expect(state.log.some((entry) => entry.includes("rams and sinks"))).toBe(false);
    }

    const catapultState = createGame(setups);
    const catapult = testCatapult(catapultState, "blue");
    catapultState.terrain.fill("land");
    catapult.position = { x: 10, y: 10 };
    catapult.moved = false;
    catapultState.units = [catapult];
    const destination = { x: 11, y: 10 };

    expect(getLegalMoves(catapultState, catapult.id)).toContainEqual(destination);
    expect(moveUnit(catapultState, catapult.id, destination)).toBe(true);
    expect(catapultState.units).toContain(catapult);
    expect(catapult.position).toEqual(destination);
  });

  it("never lets a Soldier board or attack an enemy Longboat", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redBoat = state.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    blueSoldier.position = { x: 10, y: 9 };
    redBoat.position = { x: 11, y: 10 };
    redBoat.facing = { x: 1, y: 0 };
    state.terrain[9 * state.width + 10] = "land";
    for (const cell of unitFootprint(redBoat)) state.terrain[cell.y * state.width + cell.x] = "water";
    state.units = [blueSoldier, redBoat];

    expect(getLegalMoves(state, blueSoldier.id)).not.toContainEqual(redBoat.position);
    expect(moveUnit(state, blueSoldier.id, redBoat.position)).toBe(false);
    expect(blueSoldier.position).toEqual({ x: 10, y: 9 });
    expect(state.units).toContain(blueSoldier);
    expect(state.units).toContain(redBoat);
  });

  it("uses two-square Catapults that remain horizontal", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    catapult.position = { x: 12, y: 12 };
    state.terrain[12 * state.width + 12] = "land";
    state.terrain[12 * state.width + 13] = "land";
    state.units = [catapult];

    expect(unitFootprint(catapult)).toEqual([{ x: 12, y: 12 }, { x: 13, y: 12 }]);
    expect(getLegalMoves(state, catapult.id)).not.toContainEqual({ x: 31, y: 12 });
  });

  it("does not let Catapults move onto treasure chest squares", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    catapult.position = { x: 10, y: 10 };
    for (let x = 10; x <= 13; x += 1) state.terrain[10 * state.width + x] = "land";
    state.units = [catapult];
    state.treasures = [{ id: "protected-chest", value: 20, position: { x: 12, y: 10 } }];

    expect(getLegalMoves(state, catapult.id)).not.toContainEqual({ x: 11, y: 10 });
    expect(moveUnit(state, catapult.id, { x: 11, y: 10 })).toBe(false);
  });

  it("requires a moved Catapult to fire before another action", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const enemy = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    catapult.position = { x: 10, y: 10 };
    soldier.position = { x: 5, y: 5 };
    enemy.position = { x: 16, y: 10 };
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    state.units = [catapult, soldier, enemy];

    expect(moveUnit(state, catapult.id, { x: 13, y: 10 })).toBe(true);
    expect(catapult.pendingFireAfterMove).toBe(true);
    expect(fireCatapult(state, catapult.id, enemy.position)).toBe(true);
    expect(catapult.pendingFireAfterMove).toBe(false);

    catapult.moved = false;
    catapult.fired = false;
    expect(moveUnit(state, catapult.id, { x: 10, y: 10 })).toBe(true);
    expect(moveUnit(state, soldier.id, { x: 6, y: 5 })).toBe(false);
    expect(completeManoeuvres(state)).toBe(false);
    expect(skipPendingCatapultFire(state, catapult.id)).toBe(true);
    expect(moveUnit(state, soldier.id, { x: 6, y: 5 })).toBe(true);
    expect(catapult.pendingFireAfterMove).toBe(false);
    expect(catapult.fired).toBe(true);
    expect(fireCatapult(state, catapult.id, { x: 15, y: 10 })).toBe(false);
  });

  it("lets Catapults arc over intervening objects and records scatter", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    const target = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    const blocker = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    catapult.position = { x: 4, y: 4 };
    blocker.position = { x: 7, y: 4 };
    target.position = { x: 10, y: 4 };
    state.units = [catapult, blocker, target];
    expect(getCatapultTargets(state, catapult.id)).toEqual([{ x: 10, y: 4 }]);
    expect(fireCatapult(state, catapult.id, target.position)).toBe(true);
    expect(catapult.fired).toBe(true);
    expect(state.lastShot?.aimedAt).toEqual(target.position);
    expect(state.lastShot?.scatterRadius).toBe(2);
    expect(Math.abs(state.lastShot!.landedAt.x - target.position.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(state.lastShot!.landedAt.y - target.position.y)).toBeLessThanOrEqual(2);
  });

  it("gives Catapults an eleven-square firing range and biased long-range scatter", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    catapult.position = { x: 15, y: 12 };
    state.units = [catapult];
    const target = { x: 22, y: 12 };

    expect(getCatapultFireCells(state, catapult.id)).toContainEqual({ x: 26, y: 12 });
    expect(getCatapultFireCells(state, catapult.id)).not.toContainEqual({ x: 27, y: 12 });

    let outerRingHits = 0;
    for (let shot = 0; shot < 500; shot += 1) {
      catapult.fired = false;
      expect(fireCatapult(state, catapult.id, target)).toBe(true);
      const impact = state.lastShot!.landedAt;
      if (Math.max(Math.abs(impact.x - target.x), Math.abs(impact.y - target.y)) === 2) outerRingHits += 1;
    }
    // Equal-probability 5×5 scatter would yield about 320 outer-ring hits here;
    // weighted scatter favours the inner 3×3 and stays safely below this limit.
    expect(outerRingHits).toBeLessThan(260);
  });

  it("makes Soldiers defeat Catapults and Longboats win rams", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redCatapult = testCatapult(state, "red");
    blueSoldier.position = { x: 10, y: 10 };
    redCatapult.position = { x: 11, y: 10 };
    for (let x = 10; x <= 12; x += 1) state.terrain[10 * state.width + x] = "land";
    state.units = [blueSoldier, redCatapult];

    const catapultContext = captureMovementContext(state, blueSoldier.id, { x: 11, y: 10 });
    expect(moveUnit(state, blueSoldier.id, { x: 11, y: 10 })).toBe(true);
    expect(state.units).not.toContain(redCatapult);
    expect(blueSoldier.position).toEqual({ x: 11, y: 10 });
    expect(completeMovementPresentation(state, catapultContext!).destroyedUnit?.id).toBe(redCatapult.id);

    const boatState = createGame(setups);
    const blueBoat = boatState.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const redBoat = boatState.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    const redPassenger = boatState.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blueBoat.position = { x: 10, y: 14 };
    redBoat.position = { x: 13, y: 14 };
    redPassenger.position = { ...redBoat.position };
    redPassenger.embarkedOn = redBoat.id;
    blueBoat.moved = false;
    for (let x = 9; x <= 14; x += 1) state.terrain[14 * state.width + x] = "water";
    state.units = [blueBoat, redBoat, redPassenger];
    state.treasures = [{ id: "rammed-cargo", value: 20, position: { ...redBoat.position }, carriedBy: redPassenger.id }];
    state.activePlayerIndex = 0;

    expect(getLegalMoves(state, blueBoat.id)).toContainEqual({ x: 11, y: 14 });
    const ramContext = captureMovementContext(state, blueBoat.id, { x: 11, y: 14 });
    expect(moveUnit(state, blueBoat.id, { x: 11, y: 14 })).toBe(true);
    expect(state.units).toContain(blueBoat);
    expect(state.units).not.toContain(redBoat);
    expect(state.units).not.toContain(redPassenger);
    expect(state.treasures).toHaveLength(0);
    const ramPresentation = completeMovementPresentation(state, ramContext!);
    expect(ramPresentation.arrival).toBe("ship-sunk");
    expect(ramPresentation.sunkUnit?.id).toBe(redBoat.id);
  });

  it("lets Catapult impacts sink Longboats", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    const boat = state.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    catapult.position = { x: 4, y: 4 };
    boat.position = { x: 10, y: 3 };
    state.terrain[4 * state.width + 4] = "land";
    state.terrain[4 * state.width + 5] = "land";
    for (let x = 9; x <= 11; x += 1) state.terrain[3 * state.width + x] = "water";
    state.units = [catapult, boat];
    // Seed 0 makes the first weighted 5×5 scatter land one square up: (10, 3).
    state.seed = 0;

    const shotContext = captureShotContext(state, catapult.id, { x: 10, y: 4 });
    expect(fireCatapult(state, catapult.id, { x: 10, y: 4 })).toBe(true);
    expect(state.lastShot?.landedAt).toEqual({ x: 10, y: 3 });
    expect(state.units).not.toContain(boat);
    expect(state.log[0]).toContain("sinks");
    const shotPresentation = completeShotPresentation(state, shotContext!);
    expect(shotPresentation?.impact).toBe("longboat-hit");
    expect(shotPresentation?.sunkUnit?.id).toBe(boat.id);
  });

  it("uses Sturdy Longboat protection on the next ram or Catapult hit", () => {
    const ramState = createGame(setups);
    const blueBoat = ramState.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const redBoat = ramState.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    const red = ramState.players.find((player) => player.id === "red")!;
    ramState.eventDeck = ["sturdy-longboat"];
    const sturdyCard = drawEndTurnEvent(ramState, "red");
    expect(sturdyCard?.effects[0]).toMatchObject({ kind: "protection", label: "Next Longboat protected!" });
    expect(red.sturdyLongboatProtection).toBe(1);

    blueBoat.position = { x: 10, y: 14 };
    redBoat.position = { x: 13, y: 14 };
    blueBoat.moved = false;
    for (let x = 9; x <= 15; x += 1) ramState.terrain[14 * ramState.width + x] = "water";
    ramState.units = [blueBoat, redBoat];
    const ramContext = captureMovementContext(ramState, blueBoat.id, { x: 11, y: 14 });
    expect(moveUnit(ramState, blueBoat.id, { x: 11, y: 14 })).toBe(true);
    expect(ramState.units).toContain(redBoat);
    expect(ramState.units).toContain(blueBoat);
    expect(red.sturdyLongboatProtection).toBe(0);
    expect(ramState.log.some((entry) => entry.includes("Sturdy Longboat!"))).toBe(true);
    expect(completeMovementPresentation(ramState, ramContext!).arrival).toBe("sturdy-longboat");

    const shotState = createGame(setups);
    const catapult = testCatapult(shotState, "blue");
    const targetBoat = shotState.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    const targetOwner = shotState.players.find((player) => player.id === "red")!;
    catapult.position = { x: 4, y: 4 };
    targetBoat.position = { x: 10, y: 3 };
    shotState.terrain[4 * shotState.width + 4] = "land";
    shotState.terrain[4 * shotState.width + 5] = "land";
    for (let x = 9; x <= 11; x += 1) shotState.terrain[3 * shotState.width + x] = "water";
    shotState.units = [catapult, targetBoat];
    shotState.eventDeck = ["sturdy-longboat"];
    drawEndTurnEvent(shotState, "red");
    shotState.seed = 0;
    const shotContext = captureShotContext(shotState, catapult.id, { x: 10, y: 4 });
    expect(fireCatapult(shotState, catapult.id, { x: 10, y: 4 })).toBe(true);
    expect(shotState.units).toContain(targetBoat);
    expect(targetOwner.sturdyLongboatProtection).toBe(0);
    expect(completeShotPresentation(shotState, shotContext!)?.impact).toBe("sturdy-longboat");

    catapult.fired = false;
    catapult.moved = false;
    shotState.seed = 0;
    expect(fireCatapult(shotState, catapult.id, { x: 10, y: 4 })).toBe(true);
    expect(shotState.units).not.toContain(targetBoat);
  });

  it("does not let Catapults deliberately target friendly units", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    catapult.position = { x: 4, y: 4 };
    boat.position = { x: 10, y: 4 };
    state.units = [catapult, boat];

    expect(fireCatapult(state, catapult.id, boat.position)).toBe(false);
    expect(state.units).toContain(boat);
    expect(catapult.fired).toBe(false);
  });

  it("allows a Catapult to fire into an empty space", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    catapult.position = { x: 15, y: 15 };
    state.units = [catapult];
    expect(fireCatapult(state, catapult.id, { x: 15, y: 18 })).toBe(true);
    expect(catapult.fired).toBe(true);
    expect(state.log[0]).toContain("no unit is struck");
    expect(state.log[0]).not.toContain("hits");
  });

  it("shows and consumes Shield Wall when it saves a Viking from one Catapult impact", () => {
    const state = createGame(setups);
    const catapult = testCatapult(state, "blue");
    const target = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    catapult.position = { x: 4, y: 4 };
    target.position = { x: 10, y: 3 };
    state.terrain[4 * state.width + 4] = "land";
    state.terrain[4 * state.width + 5] = "land";
    state.terrain[3 * state.width + 10] = "land";
    state.units = [catapult, target];
    state.eventDeck = ["shield-wall"];
    const event = drawEndTurnEvent(state, "red");
    expect(event?.effects[0]).toMatchObject({ unitId: target.id, label: "SHIELD WALL!" });
    expect(target.shieldWall).toBe(true);

    state.seed = 0;
    const context = captureShotContext(state, catapult.id, { x: 10, y: 4 });
    expect(fireCatapult(state, catapult.id, { x: 10, y: 4 })).toBe(true);
    expect(state.units).toContain(target);
    expect(target.shieldWall).toBe(false);
    expect(completeShotPresentation(state, context!)?.impact).toBe("shield-wall");

    catapult.fired = false;
    catapult.moved = false;
    state.seed = 0;
    expect(fireCatapult(state, catapult.id, { x: 10, y: 4 })).toBe(true);
    expect(state.units).not.toContain(target);
  });

  it("purchases units with gold", () => {
    const state = createGame(setups);
    const goldBefore = activePlayer(state).gold;
    const startingSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    expect(state.turnPhase).toBe("movement");
    expect(endTurn(state)).toBe(false);
    expect(buyUnit(state, "blue", "soldier")).toBe(false);
    expect(completeManoeuvres(state)).toBe(true);
    expect(state.turnPhase).toBe("purchase");
    expect(getLegalMoves(state, startingSoldier.id)).toEqual([]);
    expect(buyUnit(state, "blue", "soldier")).toBe(true);
    expect(activePlayer(state).gold).toBe(goldBefore - 2);
    expect(state.battleStats.blue?.unitsPurchased.soldier).toBe(1);
    const hired = state.units[state.units.length - 1]!;
    const castle = activePlayer(state).castle;
    expect(Math.max(Math.abs(hired.position.x - castle.x), Math.abs(hired.position.y - castle.y))).toBe(1);
    expect(endTurn(state)).toBe(true);
    expect(state.turnPhase).toBe("movement");
    expect(activePlayer(state).id).toBe("red");
  });

  it("never purchases a Viking on top of a treasure chest", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    blue.castle = { x: 10, y: 10 };
    state.units = state.units.filter((unit) => unit.playerId !== blue.id);
    for (let y = 9; y <= 11; y += 1) {
      for (let x = 9; x <= 11; x += 1) state.terrain[y * state.width + x] = "land";
    }
    state.treasures = [{ id: "courtyard-chest", value: 20, position: { x: 9, y: 9 } }];
    state.drinkingHorns = [];

    expect(completeManoeuvres(state)).toBe(true);
    expect(buyUnit(state, blue.id, "soldier")).toBe(true);
    const recruit = state.units.find((unit) => unit.playerId === blue.id)!;
    expect(recruit.position).not.toEqual({ x: 9, y: 9 });
    expect(state.treasures[0]?.position).toEqual({ x: 9, y: 9 });
  });

  it("never reuses a surviving treasure carrier's unit identifier after casualties", () => {
    const state = createGame(setups);
    const survivor = state.units.find(
      (unit) => unit.playerId === "blue" && unit.type === "soldier",
    )!;
    const originalId = survivor.id;
    state.units = [survivor];
    state.treasures = [{
      id: "identity-chest",
      value: 30,
      position: { ...survivor.position },
      carriedBy: survivor.id,
    }];

    expect(completeManoeuvres(state)).toBe(true);
    expect(buyUnit(state, "blue", "soldier")).toBe(true);
    const replacement = state.units[state.units.length - 1]!;

    expect(replacement.id).not.toBe(originalId);
    expect(new Set(state.units.map((unit) => unit.id)).size).toBe(state.units.length);
    expect(carriedTreasure(state, survivor.id)?.id).toBe("identity-chest");
    expect(carriedTreasure(state, replacement.id)).toBeUndefined();
  });

  it("prevents purchases when every adjacent castle square is unavailable", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = blue.castle.x + dx;
        const y = blue.castle.y + dy;
        state.terrain[y * state.width + x] = "water";
      }
    }
    expect(completeManoeuvres(state)).toBe(true);
    expect(canBuyUnit(state, blue.id, "soldier")).toBe(false);
  });

  it("advances to the next player and pays income", () => {
    const state = createGame(setups);
    const red = state.players.find((player) => player.id === "red")!;
    const goldBefore = red.gold;
    finishTurn(state);
    expect(activePlayer(state).id).toBe("red");
    expect(red.gold).toBe(goldBefore + TURN_INCOME);
  });

  it("draws an end-turn saga card, resolves it, and reshuffles when required", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    state.eventDeck = ["royal-ransom"];
    state.eventDiscard = [];
    const goldBefore = blue.gold;

    const ransom = drawEndTurnEvent(state, blue.id);
    expect(ransom?.cardId).toBe("royal-ransom");
    expect(ransom?.effects).toEqual([expect.objectContaining({ kind: "gold", amount: 8, position: blue.castle })]);
    expect(blue.gold).toBe(goldBefore + 8);
    expect(state.eventDiscard).toEqual(["royal-ransom"]);
    expect(state.eventDeck).toEqual([]);

    const secondGoldBefore = blue.gold;
    const reshuffledRansom = drawEndTurnEvent(state, blue.id);
    expect(reshuffledRansom?.cardId).toBe("royal-ransom");
    expect(reshuffledRansom?.reshuffled).toBe(true);
    expect(blue.gold).toBe(secondGoldBefore + 8);
  });

  it("skips saga cards that cannot affect the board and resolves the next valid card", () => {
    const state = createGame(setups);
    state.units = [];
    state.eventDeck = ["royal-ransom", "veterans-tale"];
    state.eventDiscard = [];

    expect(drawEndTurnEvent(state, "blue")?.cardId).toBe("royal-ransom");
    expect(state.eventDiscard).toEqual(["veterans-tale", "royal-ransom"]);
  });

  it("resolves the starter saga-card effects", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redSoldier = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    blue.castle = { x: 5, y: 5 };
    blueSoldier.position = { x: 10, y: 10 };
    redSoldier.position = { x: 13, y: 10 };
    redSoldier.drunk = true;
    state.units = [blueSoldier, redSoldier];
    state.treasures = [{ id: "event-test-chest", value: 30, position: { x: 9, y: 9 } }];
    state.drinkingHorns = [];

    state.eventDeck = ["treasure-hunter"];
    const treasureHunter = drawEndTurnEvent(state, blue.id);
    expect(treasureHunter?.cardId).toBe("treasure-hunter");
    expect(treasureHunter?.effects[0]).toMatchObject({ kind: "treasure", entityId: "event-test-chest", amount: 20 });
    expect(state.treasures[0]?.value).toBe(50);

    state.eventDeck = ["veterans-tale"];
    const veteransTale = drawEndTurnEvent(state, blue.id);
    expect(veteransTale?.cardId).toBe("veterans-tale");
    expect(veteransTale?.effects[0]).toMatchObject({ kind: "unit", unitId: blueSoldier.id });
    expect(blueSoldier.veteran).toBe(true);

    state.eventDeck = ["sobering-thought"];
    const soberingThought = drawEndTurnEvent(state, blue.id);
    expect(soberingThought?.cardId).toBe("sobering-thought");
    expect(soberingThought?.effects[0]).toMatchObject({
      kind: "unit",
      unitId: redSoldier.id,
      previousUnit: { id: redSoldier.id, playerId: "red", drunk: true },
    });
    expect(redSoldier.drunk).toBe(false);

    state.eventDeck = ["ale-delivery"];
    const aleDelivery = drawEndTurnEvent(state, blue.id);
    expect(aleDelivery?.cardId).toBe("ale-delivery");
    expect(aleDelivery?.effects[0]).toMatchObject({ kind: "horn", entityId: expect.stringContaining("event-horn-") });
    expect(state.drinkingHorns).toHaveLength(1);

    state.eventDeck = ["hidden-hoard"];
    const hiddenHoardEvent = drawEndTurnEvent(state, blue.id);
    expect(hiddenHoardEvent?.cardId).toBe("hidden-hoard");
    expect(hiddenHoardEvent?.effects[0]).toMatchObject({ kind: "treasure", entityId: expect.stringContaining("event-chest-"), amount: 10 });
    expect(state.treasures).toHaveLength(2);
    const hiddenHoard = state.treasures.find((chest) => chest.id.startsWith("event-chest-"))!;
    expect(hiddenHoard.value).toBe(10);
    expect(Math.max(Math.abs(hiddenHoard.position.x - blue.castle.x), Math.abs(hiddenHoard.position.y - blue.castle.y))).toBeGreaterThanOrEqual(5);

    state.eventDeck = ["the-persuader"];
    const persuader = drawEndTurnEvent(state, blue.id);
    expect(persuader?.cardId).toBe("the-persuader");
    expect(persuader?.effects[0]).toMatchObject({ kind: "unit", unitId: redSoldier.id, previousPlayerId: "red" });
    expect(redSoldier.playerId).toBe("blue");

    redSoldier.playerId = "red";
    state.eventDeck = ["called-home"];
    const calledHome = drawEndTurnEvent(state, blue.id);
    expect(calledHome?.cardId).toBe("called-home");
    expect(calledHome?.effects[0]).toMatchObject({ kind: "unit", unitId: blueSoldier.id, from: { x: 10, y: 10 } });
    expect(Math.max(Math.abs(blueSoldier.position.x - blue.castle.x), Math.abs(blueSoldier.position.y - blue.castle.y))).toBe(1);
  });

  it("places a Called Home Viking in the nearest clear square when the castle courtyard is full", () => {
    const state = createGame(setups, 211);
    const blue = state.players.find((player) => player.id === "blue")!;
    const traveller = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    blue.castle = { x: 8, y: 8 };
    traveller.position = { x: 20, y: 18 };
    const courtyard = [-1, 0, 1].flatMap((dx) =>
      [-1, 0, 1]
        .filter((dy) => dx !== 0 || dy !== 0)
        .map((dy, index) => ({
          id: `courtyard-blocker-${dx}-${dy}-${index}`,
          playerId: "red" as const,
          type: "soldier" as const,
          position: { x: blue.castle.x + dx, y: blue.castle.y + dy },
          moved: false,
          fired: false,
        })),
    );
    state.units = [traveller, ...courtyard];
    state.treasures = [];
    state.drinkingHorns = [];
    state.eventDeck = ["called-home"];
    const occupiedBefore = new Map(courtyard.map((unit) => [unit.id, { ...unit.position }]));

    const event = drawEndTurnEvent(state, "blue");

    expect(event?.cardId).toBe("called-home");
    expect(Math.max(
      Math.abs(traveller.position.x - blue.castle.x),
      Math.abs(traveller.position.y - blue.castle.y),
    )).toBe(2);
    expect(courtyard.some((unit) =>
      unit.position.x === traveller.position.x && unit.position.y === traveller.position.y,
    )).toBe(false);
    expect(state.units).toHaveLength(9);
    for (const blocker of courtyard) expect(blocker.position).toEqual(occupiedBefore.get(blocker.id));
    expect(event?.outcome).toContain("nearest clear square");
  });

  it("keeps Sturdy Longboat protection when its faction currently has no boat", () => {
    const state = createGame(setups);
    const blue = state.players.find((player) => player.id === "blue")!;
    state.units = state.units.filter((unit) => unit.playerId !== "blue" || unit.type !== "longboat");
    state.eventDeck = ["sturdy-longboat"];

    const event = drawEndTurnEvent(state, "blue");

    expect(event?.cardId).toBe("sturdy-longboat");
    expect(blue.sturdyLongboatProtection).toBe(1);
    expect(event?.outcome).toContain("next Longboat");
  });

  it("makes one available Viking from every faction drunk at the Yule Festival", () => {
    const state = createGame(setups);
    const blue = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blue.veteran = true;
    state.units = [blue, red];
    state.treasures = [{ id: "yule-treasure", value: 20, position: { ...blue.position }, carriedBy: blue.id }];
    state.eventDeck = ["yule-festival"];

    const event = drawEndTurnEvent(state, "blue");

    expect(event?.cardId).toBe("yule-festival");
    expect(event?.effects).toHaveLength(2);
    expect(event?.effects.map((effect) => effect.unitId)).toEqual(expect.arrayContaining([blue.id, red.id]));
    expect(blue.drunk).toBe(true);
    expect(red.drunk).toBe(true);
    expect(state.treasures[0]?.carriedBy).toBeUndefined();
    expect(state.treasures[0]?.position).not.toEqual(blue.position);
    expect(unitAt(state, state.treasures[0]!.position)).toBeUndefined();
  });

  it("gives Berserker Rage a guaranteed next Viking clash without affecting castles", () => {
    const state = createGame(setups);
    const blue = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blue.position = { x: 10, y: 10 };
    red.position = { x: 11, y: 10 };
    for (let x = 9; x <= 12; x += 1) state.terrain[10 * state.width + x] = "land";
    state.units = [blue, red];
    state.eventDeck = ["berserker-rage"];

    const event = drawEndTurnEvent(state, "blue");
    expect(event?.effects[0]).toMatchObject({ kind: "unit", unitId: blue.id, label: "BERSERKER RAGE!" });
    expect(blue.rage).toBe(true);
    expect(getCombatWinChance(blue, red)).toBe(1);
    expect(getCastleCaptureChance(blue)).toBe(0.4);

    expect(moveUnit(state, blue.id, red.position)).toBe(true);
    expect(state.units).toContain(blue);
    expect(state.units).not.toContain(red);
    expect(blue.rage).toBe(false);
    expect(state.log.some((entry) => entry.includes("Berserker Rage!"))).toBe(true);

    const defendingState = createGame(setups);
    const attacker = defendingState.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const ragingDefender = defendingState.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    attacker.position = { x: 10, y: 10 };
    ragingDefender.position = { x: 11, y: 10 };
    ragingDefender.rage = true;
    for (let x = 9; x <= 12; x += 1) defendingState.terrain[10 * defendingState.width + x] = "land";
    defendingState.units = [attacker, ragingDefender];
    expect(moveUnit(defendingState, attacker.id, ragingDefender.position)).toBe(true);
    expect(defendingState.units).not.toContain(attacker);
    expect(defendingState.units).toContain(ragingDefender);
    expect(ragingDefender.rage).toBe(false);
  });

  it("resolves the new loss, demotion, theft, and transfer saga cards visibly", () => {
    const overboardState = createGame(setups);
    const boat = overboardState.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const passengers = overboardState.units.filter((unit) => unit.playerId === "blue" && unit.type === "soldier");
    for (const passenger of passengers) {
      passenger.embarkedOn = boat.id;
      passenger.position = { ...boat.position };
    }
    const passengerIdsBefore = new Set(passengers.map((passenger) => passenger.id));
    overboardState.eventDeck = ["man-overboard"];
    const overboard = drawEndTurnEvent(overboardState, "blue");
    expect(overboard?.cardId).toBe("man-overboard");
    expect(overboard?.effects).toHaveLength(1);
    expect(overboard?.effects[0]).toMatchObject({ kind: "unit", label: "Man overboard!" });
    const remainingPassengers = overboardState.units.filter((unit) => unit.embarkedOn === boat.id);
    expect(remainingPassengers).toHaveLength(passengers.length - 1);
    expect([...passengerIdsBefore].filter((id) => !overboardState.units.some((unit) => unit.id === id))).toHaveLength(1);

    const demotionState = createGame(setups);
    const veteran = demotionState.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    veteran.veteran = true;
    demotionState.eventDeck = ["bad-viking"];
    const demotion = drawEndTurnEvent(demotionState, "blue");
    expect(demotion?.cardId).toBe("bad-viking");
    expect(demotion?.effects[0]).toMatchObject({ kind: "unit", unitId: veteran.id, label: "Demoted to Viking!" });
    expect(veteran.veteran).toBe(false);

    const banditState = createGame(setups);
    banditState.treasures = [{ id: "bandit-target", value: 30, position: { x: 15, y: 12 } }];
    banditState.eventDeck = ["bandits"];
    const bandits = drawEndTurnEvent(banditState, "blue");
    expect(bandits?.cardId).toBe("bandits");
    expect(bandits?.effects[0]).toMatchObject({
      kind: "treasure",
      entityId: "bandit-target",
      amount: -30,
      removedTreasure: expect.objectContaining({ id: "bandit-target" }),
    });
    expect(banditState.treasures).toHaveLength(0);

    const theftState = createGame(setups);
    const blue = theftState.players.find((player) => player.id === "blue")!;
    const red = theftState.players.find((player) => player.id === "red")!;
    blue.gold = 21;
    red.gold = 7;
    theftState.eventDeck = ["inside-job"];
    const insideJob = drawEndTurnEvent(theftState, "blue");
    expect(insideJob?.cardId).toBe("inside-job");
    expect(insideJob?.effects).toEqual([
      expect.objectContaining({ kind: "gold", amount: -10, position: blue.castle }),
      expect.objectContaining({ kind: "gold", amount: 10, position: red.castle }),
    ]);
    expect(blue.gold).toBe(11);
    expect(red.gold).toBe(17);
  });

  it("shows a harmless resolution when a new saga card has no legal target", () => {
    const state = createGame(setups);
    state.units = state.units.filter((unit) => unit.type !== "soldier");
    state.treasures = [];
    state.players.find((player) => player.id === "blue")!.gold = 0;

    for (const cardId of ["man-overboard", "bad-viking", "bandits", "inside-job"] as const) {
      state.eventDeck = [cardId];
      state.eventDiscard = [];
      const event = drawEndTurnEvent(state, "blue");
      expect(event?.cardId).toBe(cardId);
      expect(event?.effects).toEqual([]);
    }
  });

  it("resolves the five minor saga cards and records their board effects", () => {
    const state = createGame(setups);
    const blue = state.players.find((player) => player.id === "blue")!;

    const looseGold = blue.gold;
    state.eventDeck = ["loose-change"];
    expect(drawEndTurnEvent(state, "blue")?.effects[0]).toMatchObject({ kind: "gold", amount: 3 });
    expect(blue.gold).toBe(looseGold + 3);

    const recruitCount = state.units.filter((unit) => unit.playerId === "blue" && unit.type === "soldier").length;
    state.eventDeck = ["new-recruit"];
    const recruitment = drawEndTurnEvent(state, "blue");
    expect(recruitment?.effects[0]).toMatchObject({ kind: "unit", from: blue.castle, label: "New recruit!" });
    expect(state.units.filter((unit) => unit.playerId === "blue" && unit.type === "soldier")).toHaveLength(recruitCount + 1);

    const deserter = state.units.find((unit) =>
      unit.playerId === "blue" && unit.type === "soldier" && !unit.veteran && !unit.embarkedOn && !carriedTreasure(state, unit.id),
    )!;
    state.units = state.units.filter((unit) => unit.id === deserter.id || unit.playerId !== "blue" || unit.type !== "soldier");
    state.eventDeck = ["the-deserter"];
    const desertion = drawEndTurnEvent(state, "blue");
    expect(desertion?.effects[0]).toMatchObject({
      kind: "unit",
      unitId: deserter.id,
      removedUnit: expect.objectContaining({ id: deserter.id }),
    });
    expect(state.units.some((unit) => unit.id === deserter.id)).toBe(false);

    state.drinkingHorns = [{ id: "misdelivered-horn", position: { x: 15, y: 12 } }];
    const hornStart = { ...state.drinkingHorns[0]!.position };
    state.eventDeck = ["wrong-address"];
    const wrongAddress = drawEndTurnEvent(state, "blue");
    expect(wrongAddress?.effects[0]).toMatchObject({ kind: "horn", entityId: "misdelivered-horn", from: hornStart });
    expect(state.drinkingHorns[0]!.position).not.toEqual(hornStart);

    blue.gold = 2;
    state.eventDeck = ["jarls-feast"];
    expect(drawEndTurnEvent(state, "blue")?.effects[0]).toMatchObject({ kind: "gold", amount: -2 });
    expect(blue.gold).toBe(0);
  });

  it("shows no-effect outcomes when the minor target-dependent cards cannot resolve", () => {
    const state = createGame(setups);
    const blue = state.players.find((player) => player.id === "blue")!;
    state.units = state.units.filter((unit) => unit.playerId !== "blue" || unit.type !== "soldier");
    state.drinkingHorns = [];
    blue.gold = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        state.terrain[(blue.castle.y + dy) * state.width + blue.castle.x + dx] = "water";
      }
    }

    for (const cardId of ["the-deserter", "new-recruit", "wrong-address", "jarls-feast"] as const) {
      state.eventDeck = [cardId];
      state.eventDiscard = [];
      expect(drawEndTurnEvent(state, "blue")?.effects).toEqual([]);
    }
  });

  it("deposits treasure when a Soldier returns beside, rather than onto, its castle", () => {
    const state = createGame(setups);
    const blue = state.players.find((player) => player.id === "blue")!;
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    blue.castle = { x: 3, y: 5 };
    soldier.position = { x: 4, y: 5 };
    state.units = [soldier];
    for (let x = 3; x <= 5; x += 1) state.terrain[5 * state.width + x] = "land";
    state.treasures = [{ id: "test-chest", value: 30, position: { x: 5, y: 5 } }];
    const goldBefore = blue.gold;

    expect(moveUnit(state, soldier.id, { x: 5, y: 5 })).toBe(true);
    expect(carriedTreasure(state, soldier.id)?.value).toBe(30);
    expect(blue.gold).toBe(goldBefore);

    soldier.moved = false;
    expect(moveUnit(state, soldier.id, { x: 4, y: 5 })).toBe(true);
    expect(soldier.position).toEqual({ x: 4, y: 5 });
    expect(state.treasures).toHaveLength(0);
    expect(blue.gold).toBe(goldBefore + 30);
    expect(state.battleStats.blue?.treasureChestsBanked).toBe(1);
    expect(state.battleStats.blue?.goldBanked).toBe(30);
  });

  it("banks treasure from a Soldier already waiting beside its home castle", () => {
    const state = createGame(setups, 43);
    const blue = activePlayer(state);
    const soldier = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    soldier.position = { x: blue.castle.x + 1, y: blue.castle.y };
    state.units = [soldier];
    state.treasures = [{
      id: "waiting-chest",
      value: 20,
      position: { ...soldier.position },
      carriedBy: soldier.id,
    }];
    state.eventDeck = ["ravens-counsel"];

    finishTurn(state);

    expect(blue.gold).toBe(70);
    expect(carriedTreasure(state, soldier.id)).toBeUndefined();
    expect(state.log.some((entry) => entry.includes("banks 20 gold"))).toBe(true);
  });

  it("banks a carried chest when Called Home brings its Soldier home", () => {
    const state = createGame(setups);
    const blue = state.players.find((player) => player.id === "blue")!;
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    blue.castle = { x: 6, y: 6 };
    soldier.position = { x: 15, y: 15 };
    state.units = [soldier];
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    state.treasures = [{ id: "tunnel-chest", value: 40, position: { ...soldier.position }, carriedBy: soldier.id }];
    state.eventDeck = ["called-home"];
    const goldBefore = blue.gold;

    expect(drawEndTurnEvent(state, blue.id)?.outcome).toContain("banks 40 gold");
    expect(Math.max(Math.abs(soldier.position.x - blue.castle.x), Math.abs(soldier.position.y - blue.castle.y))).toBe(1);
    expect(carriedTreasure(state, soldier.id)).toBeUndefined();
    expect(blue.gold).toBe(goldBefore + 40);
  });

  it("applies the three upkeep cards without allowing negative gold", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    blue.gold = 30;

    state.eventDeck = ["army-upkeep"];
    expect(drawEndTurnEvent(state, blue.id)?.outcome).toContain("10 gold in army upkeep");
    expect(blue.gold).toBe(20);

    state.eventDeck = ["harbour-dues"];
    expect(drawEndTurnEvent(state, blue.id)?.outcome).toContain("5 gold in harbour dues");
    expect(blue.gold).toBe(15);

    state.units.push(testCatapult(state, blue.id));
    state.eventDeck = ["catapult-repairs"];
    expect(drawEndTurnEvent(state, blue.id)?.outcome).toContain("4 gold for catapult repairs");
    expect(blue.gold).toBe(11);

    blue.gold = 3;
    state.eventDeck = ["army-upkeep"];
    expect(drawEndTurnEvent(state, blue.id)?.outcome).toContain("3 gold in army upkeep");
    expect(blue.gold).toBe(0);
  });

  it("resolves ten benign saga cards without changing the game or covering the board", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    const benignCards = [
      "ravens-counsel",
      "jarls-beard",
      "ordinary-rock",
      "longboat-laundry",
      "mead-inspector",
      "axe-shaped-cloud",
      "tactical-goat",
      "helmet-inspection",
      "missing-spoon",
      "rune-misread",
    ] as const;
    const goldBefore = blue.gold;
    const unitCountBefore = state.units.length;

    for (const cardId of benignCards) {
      state.eventDeck = [cardId];
      const event = drawEndTurnEvent(state, blue.id);
      expect(event?.cardId).toBe(cardId);
      expect(event?.outcome.length).toBeGreaterThan(20);
      expect(event?.outcome).not.toContain("Nothing happens");
      expect(event?.effects).toEqual([]);
      expect(blue.gold).toBe(goldBefore);
      expect(state.units).toHaveLength(unitCountBefore);
    }
  });

  it("blows a friendly Longboat and its crew one to three safe water squares off course", () => {
    const state = createGame(setups);
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const passenger = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    boat.position = { x: 15, y: 12 };
    passenger.position = { ...boat.position };
    passenger.embarkedOn = boat.id;
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "water";
    }
    state.units = [boat, passenger];
    const from = { ...boat.position };
    state.eventDeck = ["high-winds"];

    const event = drawEndTurnEvent(state, "blue");

    const distance = Math.max(Math.abs(boat.position.x - from.x), Math.abs(boat.position.y - from.y));
    expect(event?.cardId).toBe("high-winds");
    expect(event?.effects[0]).toMatchObject({
      kind: "unit",
      unitId: boat.id,
      from,
      position: boat.position,
      label: "Blown off course!",
    });
    expect(distance).toBeGreaterThanOrEqual(1);
    expect(distance).toBeLessThanOrEqual(3);
    expect(passenger.position).toEqual(boat.position);
    expect(unitFootprint(boat).every((cell) => terrainAt(state, cell) === "water")).toBe(true);
  });

  it("leaves the board alone when High Winds finds no safe friendly Longboat", () => {
    const state = createGame(setups);
    state.units = state.units.filter((unit) => unit.playerId !== "blue" || unit.type !== "longboat");
    state.eventDeck = ["high-winds"];

    const event = drawEndTurnEvent(state, "blue");

    expect(event?.cardId).toBe("high-winds");
    expect(event?.outcome).toContain("no Longboat");
    expect(event?.effects).toEqual([]);
  });

  it("uses a favourable tide to move a Longboat and its crew safely toward an enemy castle", () => {
    const state = createGame(setups);
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const passenger = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    boat.position = { x: 10, y: 12 };
    passenger.position = { ...boat.position };
    passenger.embarkedOn = boat.id;
    red.castle = { x: 25, y: 12 };
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "water";
    }
    state.units = [boat, passenger];
    const from = { ...boat.position };
    const before = Math.max(Math.abs(red.castle.x - from.x), Math.abs(red.castle.y - from.y));
    state.eventDeck = ["favourable-tide"];

    const event = drawEndTurnEvent(state, "blue");
    const distance = Math.max(Math.abs(boat.position.x - from.x), Math.abs(boat.position.y - from.y));
    const after = Math.max(Math.abs(red.castle.x - boat.position.x), Math.abs(red.castle.y - boat.position.y));

    expect(event?.cardId).toBe("favourable-tide");
    expect(event?.effects[0]).toMatchObject({ unitId: boat.id, from, position: boat.position });
    expect(distance).toBeGreaterThanOrEqual(1);
    expect(distance).toBeLessThanOrEqual(3);
    expect(after).toBeLessThan(before);
    expect(passenger.position).toEqual(boat.position);
  });

  it("charges only the available gold for Forgotten Rations", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    blue.gold = 1;
    state.eventDeck = ["forgotten-rations"];

    const event = drawEndTurnEvent(state, blue.id);

    expect(event?.cardId).toBe("forgotten-rations");
    expect(event?.effects[0]).toMatchObject({ kind: "gold", amount: -1 });
    expect(blue.gold).toBe(0);
  });

  it("captures an enemy castle from an adjacent square without occupying it", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redSurvivor = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    red.castle = { x: 11, y: 10 };
    blueSoldier.position = { x: 10, y: 10 };
    redSurvivor.position = { x: 20, y: 20 };
    state.units = [blueSoldier, redSurvivor];
    state.seed = 0;
    for (let x = 10; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    const context = captureMovementContext(state, blueSoldier.id, red.castle);

    expect(moveUnit(state, blueSoldier.id, red.castle)).toBe(true);
    expect(blueSoldier.position).toEqual({ x: 10, y: 10 });
    expect(blueSoldier.moved).toBe(true);
    expect(red.eliminated).toBe(true);
    expect(redSurvivor.playerId).toBe("blue");
    expect(state.battleStats.blue?.castleAttacks).toBe(1);
    expect(state.battleStats.blue?.castlesCaptured).toBe(1);
    const presentation = completeMovementPresentation(state, context!);
    expect(presentation.castleAssault).toMatchObject({
      castlePlayerId: "red",
      attackerWon: true,
      attackPosition: { x: 10, y: 10 },
    });
    expect(presentation.capturedUnits).toContainEqual(expect.objectContaining({
      id: redSurvivor.id,
      playerId: "red",
    }));
    expect(CASTLE_ASSAULT_DURATION_MS).toBe(3_000);
  });

  it("finishes a long castle charge on the adjacent attack square", () => {
    const state = createGame(setups);
    const attacker = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    attacker.position = { x: 4, y: 10 };
    red.castle = { x: 11, y: 10 };
    state.units = [attacker];
    state.seed = 0;
    for (let x = 4; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    const context = captureMovementContext(state, attacker.id, red.castle);
    expect(context).toBeDefined();
    expect(moveUnit(state, attacker.id, red.castle)).toBe(true);
    expect(attacker.position).toEqual({ x: 10, y: 10 });
    expect(completeMovementPresentation(state, context!).castleAssault?.attackPosition).toEqual({ x: 10, y: 10 });
  });

  it("drops a repelled castle attacker's treasure beside the walls", () => {
    const state = createGame(setups);
    const attacker = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    attacker.position = { x: 4, y: 10 };
    red.castle = { x: 11, y: 10 };
    state.units = [attacker];
    state.treasures = [{ id: "siege-chest", value: 20, position: { ...attacker.position }, carriedBy: attacker.id }];
    state.seed = 1000;
    for (let x = 4; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    expect(moveUnit(state, attacker.id, red.castle)).toBe(true);
    expect(state.units).not.toContain(attacker);
    expect(state.treasures[0]).toMatchObject({
      carriedBy: undefined,
      position: { x: 10, y: 10 },
    });
  });

  it("uses the requested Soldier, Veteran and castle combat chances", () => {
    const state = createGame(setups);
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const enemy = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    const veteran = { ...soldier, id: "blue-veteran", veteran: true };
    const enemyVeteran = { ...enemy, id: "red-veteran", veteran: true };

    expect(getCombatWinChance(soldier, enemy)).toBe(0.5);
    expect(getCombatWinChance(veteran, enemyVeteran)).toBe(0.5);
    expect(getCombatWinChance(veteran, enemy)).toBe(0.55);
    expect(getCombatWinChance(soldier, enemyVeteran)).toBe(0.45);
    expect(getCastleCaptureChance(soldier)).toBe(0.4);
    expect(getCastleCaptureChance(veteran)).toBe(0.45);
  });

  it("promotes the surviving ordinary Soldier after defeating another warrior", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redSoldier = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blueSoldier.position = { x: 10, y: 10 };
    redSoldier.position = { x: 11, y: 10 };
    state.units = [blueSoldier, redSoldier];
    state.seed = 0; // The next seeded roll is below 50%, so the attacker wins.
    for (let x = 10; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    expect(moveUnit(state, blueSoldier.id, redSoldier.position)).toBe(true);
    expect(blueSoldier.veteran).toBe(true);
    expect(state.units).not.toContain(redSoldier);
    expect(state.battleStats.blue?.combatVictories).toBe(1);
    expect(state.battleStats.blue?.promotions).toBe(1);
    expect(state.battleStats.red?.unitsLost).toBe(1);

    const defendingState = createGame(setups);
    const attackingSoldier = defendingState.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const defendingSoldier = defendingState.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    attackingSoldier.position = { x: 10, y: 10 };
    defendingSoldier.position = { x: 11, y: 10 };
    defendingState.units = [attackingSoldier, defendingSoldier];
    defendingState.seed = 1000; // The next seeded roll is above 50%, so the defender wins.
    for (let x = 10; x <= 11; x += 1) defendingState.terrain[10 * defendingState.width + x] = "land";

    expect(moveUnit(defendingState, attackingSoldier.id, defendingSoldier.position)).toBe(true);
    expect(defendingSoldier.veteran).toBe(true);
    expect(defendingState.units).not.toContain(attackingSoldier);
  });

  it("keeps and captures carried treasure after direct Viking combat", () => {
    const attackingState = createGame(setups);
    const blueAttacker = attackingState.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redDefender = attackingState.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blueAttacker.position = { x: 10, y: 10 };
    redDefender.position = { x: 11, y: 10 };
    blueAttacker.rage = true;
    attackingState.units = [blueAttacker, redDefender];
    attackingState.treasures = [
      { id: "winner-chest", value: 20, position: { ...blueAttacker.position }, carriedBy: blueAttacker.id },
      { id: "loser-chest", value: 30, position: { ...redDefender.position }, carriedBy: redDefender.id },
    ];
    for (let x = 10; x <= 11; x += 1) attackingState.terrain[10 * attackingState.width + x] = "land";

    expect(moveUnit(attackingState, blueAttacker.id, redDefender.position)).toBe(true);
    expect(attackingState.units).not.toContain(redDefender);
    expect(carriedTreasure(attackingState, blueAttacker.id)).toMatchObject({
      id: "winner-chest",
      value: 50,
      carriedBy: blueAttacker.id,
    });
    expect(attackingState.treasures).toHaveLength(1);

    const defendingState = createGame(setups);
    const losingAttacker = defendingState.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const winningDefender = defendingState.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    losingAttacker.position = { x: 10, y: 10 };
    winningDefender.position = { x: 11, y: 10 };
    winningDefender.rage = true;
    defendingState.units = [losingAttacker, winningDefender];
    defendingState.treasures = [
      { id: "captured-chest", value: 40, position: { ...losingAttacker.position }, carriedBy: losingAttacker.id },
    ];
    for (let x = 10; x <= 11; x += 1) defendingState.terrain[10 * defendingState.width + x] = "land";

    expect(moveUnit(defendingState, losingAttacker.id, winningDefender.position)).toBe(true);
    expect(defendingState.units).not.toContain(losingAttacker);
    expect(carriedTreasure(defendingState, winningDefender.id)).toMatchObject({
      id: "captured-chest",
      value: 40,
      carriedBy: winningDefender.id,
    });
    expect(defendingState.log).toContain("Red claims 40 gold from the defeated Viking!");
  });

  it("removes a Soldier when the castle wins its defence roll", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    red.castle = { x: 11, y: 10 };
    blueSoldier.position = { x: 10, y: 10 };
    state.units = [blueSoldier];
    state.seed = 1000; // The next seeded roll is above both castle-capture chances.
    for (let x = 10; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    const context = captureMovementContext(state, blueSoldier.id, red.castle);

    expect(moveUnit(state, blueSoldier.id, red.castle)).toBe(true);
    expect(state.units).not.toContain(blueSoldier);
    expect(red.eliminated).toBe(false);
    expect(state.battleStats.blue?.castleAttacks).toBe(1);
    expect(state.battleStats.blue?.unitsLost).toBe(1);
    expect(completeMovementPresentation(state, context!).castleAssault).toMatchObject({
      castlePlayerId: "red",
      attackerWon: false,
    });
  });

  it("supports five computer difficulties with identical purchase opportunities", () => {
    const difficulties: Difficulty[] = ["very-easy", "easy", "normal", "hard", "expert"];
    for (const difficulty of difficulties) {
      const state = createGame([
        { id: "blue", controller: difficulty },
        { id: "red", controller: "human" },
      ]);
      expect(activePlayer(state).controller).toBe(difficulty);
    }
    expect(AI_PURCHASE_LIMIT).toBe(2);
  });

  it("executes a complete headless computer turn with the shared turn runner", async () => {
    const state = createGame([
      { id: "blue", controller: "normal" },
      { id: "red", controller: "hard" },
    ], 87, { eventDeckEnabled: false });
    const summary = await executeComputerTurn(state);

    expect(summary.playerId).toBe("blue");
    expect(summary.difficulty).toBe("normal");
    expect(summary.moves).toBeGreaterThanOrEqual(0);
    expect(Object.values(summary.purchases).reduce((total, count) => total + count, 0)).toBeLessThanOrEqual(2);
    expect(activePlayer(state).id).toBe("red");
  });

  it("describes treasure pickup for the board movement presentation", () => {
    const state = createGame(setups, 191, { eventDeckEnabled: false });
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    soldier.position = { x: 10, y: 10 };
    state.units = [soldier];
    state.treasures = [{ id: "presentation-chest", value: 10, position: { x: 11, y: 10 } }];
    state.terrain[10 * state.width + 10] = "land";
    state.terrain[10 * state.width + 11] = "land";

    const context = captureMovementContext(state, soldier.id, { x: 11, y: 10 });
    expect(context).toBeDefined();
    expect(moveUnit(state, soldier.id, { x: 11, y: 10 })).toBe(true);
    expect(completeMovementPresentation(state, context!).arrival).toBe("treasure");
  });

  it("describes the actual landing square for Catapult impact presentation", () => {
    const state = createGame(setups, 193, { eventDeckEnabled: false });
    const catapult = testCatapult(state, "blue");
    const target = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    catapult.position = { x: 10, y: 10 };
    target.position = { x: 14, y: 10 };
    state.units = [catapult, target];

    const context = captureShotContext(state, catapult.id, target.position);
    expect(context).toBeDefined();
    state.units = [catapult];
    state.lastShot = { aimedAt: { ...target.position }, landedAt: { ...target.position }, scatterRadius: 1 };
    const presentation = completeShotPresentation(state, context!);

    expect(presentation?.landedAt).toEqual(target.position);
    expect(presentation?.impact).toBe("enemy-hit");
    expect(presentation?.destroyedUnit?.id).toBe(target.id);
  });

  it("does not retain a destroyed unit as a later Catapult target or phantom impact", () => {
    const state = createGame(setups, 195, { eventDeckEnabled: false });
    const catapult = testCatapult(state, "blue");
    const target = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    const secondCatapult = { ...catapult, id: "blue-catapult-second", position: { x: 5, y: 10 }, moved: false, fired: false };
    catapult.position = { x: 4, y: 10 };
    target.position = { x: 12, y: 10 };
    state.units = [catapult, secondCatapult, target];

    const firstContext = captureShotContext(state, catapult.id, target.position)!;
    state.units = [catapult, secondCatapult];
    state.lastShot = { aimedAt: { ...target.position }, landedAt: { ...target.position }, scatterRadius: 2 };
    expect(completeShotPresentation(state, firstContext)?.destroyedUnit?.id).toBe(target.id);
    expect(getCatapultTargets(state, secondCatapult.id)).not.toContainEqual(target.position);

    const laterContext = captureShotContext(state, secondCatapult.id, target.position)!;
    state.lastShot = { aimedAt: { ...target.position }, landedAt: { ...target.position }, scatterRadius: 2 };
    const laterPresentation = completeShotPresentation(state, laterContext);
    expect(laterPresentation?.impact).toBe("miss");
    expect(laterPresentation?.destroyedUnit).toBeUndefined();
  });

  it("describes an empty water landing as a splash rather than a hit", () => {
    const state = createGame(setups, 197, { eventDeckEnabled: false });
    const catapult = testCatapult(state, "blue");
    catapult.position = { x: 10, y: 10 };
    state.units = [catapult];
    state.terrain[10 * state.width + 14] = "water";

    const context = captureShotContext(state, catapult.id, { x: 14, y: 10 });
    state.lastShot = { aimedAt: { x: 14, y: 10 }, landedAt: { x: 14, y: 10 }, scatterRadius: 1 };

    expect(completeShotPresentation(state, context!)?.impact).toBe("water");
  });

  it("stores and retains a strategic target and unit roles", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
      { id: "pink", controller: "human" },
    ], 89);
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const pink = state.players.find((player) => player.id === "pink")!;
    const soldier = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 13, y: 12 };
    pink.castle = { x: 28, y: 20 };
    soldier.position = { x: 5, y: 10 };
    state.units = [soldier];
    state.treasures = [];

    expect(chooseAiMove(state, "hard")).toBeDefined();
    expect(state.aiPlans.blue?.objective).toBe("attack-castle");
    expect(state.aiPlans.blue?.targetPlayerId).toBe("red");
    expect(state.aiPlans.blue?.roles[soldier.id]).toBe("raider");

    red.castle = { x: 30, y: 22 };
    pink.castle = { x: 8, y: 12 };
    soldier.moved = false;
    state.round += 1;
    chooseAiMove(state, "hard");
    expect(state.aiPlans.blue?.targetPlayerId).toBe("red");
  });

  it("detects a castle threat and assigns defenders", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 91);
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const defender = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const threat = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 5, y: 5 };
    red.castle = { x: 28, y: 20 };
    defender.position = { x: 20, y: 18 };
    threat.position = { x: 11, y: 5 };
    state.units = [defender, threat];
    state.treasures = [];

    const before = Math.max(Math.abs(defender.position.x - blue.castle.x), Math.abs(defender.position.y - blue.castle.y));
    const action = chooseAiMove(state, "hard");
    expect(state.aiPlans.blue?.objective).toBe("defend-castle");
    expect(state.aiPlans.blue?.roles[defender.id]).toBe("castle-defender");
    expect(action?.unitId).toBe(defender.id);
    const after = Math.max(Math.abs(action!.destination.x - blue.castle.x), Math.abs(action!.destination.y - blue.castle.y));
    expect(after).toBeLessThan(before);
  });

  it("does not recall the army for a distant castle threat", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 911);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const soldier = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const distantThreat = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 5, y: 5 };
    red.castle = { x: 28, y: 20 };
    soldier.position = { x: 7, y: 7 };
    distantThreat.position = { x: 13, y: 5 };
    state.units = [soldier, distantThreat];
    state.treasures = [];

    chooseAiMove(state, "hard");

    expect(state.aiPlans.blue?.objective).toBe("attack-castle");
    expect(state.aiPlans.blue?.roles[soldier.id]).toBe("raider");
  });

  it("assigns only one defender to one approaching threat", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 912);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const template = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const threat = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 5, y: 5 };
    red.castle = { x: 28, y: 20 };
    const defenders = [0, 1, 2].map((offset) => ({
      ...template,
      id: `possible-defender-${offset}`,
      position: { x: 7 + offset, y: 8 },
    }));
    threat.position = { x: 11, y: 7 };
    state.units = [...defenders, threat];
    state.treasures = [];

    chooseAiMove(state, "expert");

    const assigned = Object.values(state.aiPlans.blue?.roles ?? {}).filter((role) => role === "castle-defender");
    expect(assigned).toHaveLength(1);
  });

  it("moves a non-urgent defender out of the castle courtyard", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 913);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const defender = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const threat = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 5, y: 5 };
    red.castle = { x: 28, y: 20 };
    defender.position = { x: 6, y: 5 };
    threat.position = { x: 11, y: 7 };
    state.units = [defender, threat];
    state.treasures = [];

    const action = chooseAiMove(state, "hard");
    const homeDistance = Math.max(
      Math.abs(action!.destination.x - blue.castle.x),
      Math.abs(action!.destination.y - blue.castle.y),
    );

    expect(action?.unitId).toBe(defender.id);
    expect(homeDistance).toBeGreaterThanOrEqual(2);
  });

  it("makes strategic purchases and stops buying into an unpressured crowd", () => {
    const makeState = (soldierCount: number) => {
      const state = createGame([
        { id: "blue", controller: "hard" },
        { id: "red", controller: "human" },
      ], 914);
      for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
      const blue = activePlayer(state);
      const red = state.players.find((player) => player.id === "red")!;
      const template = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
      const enemy = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
      blue.castle = { x: 5, y: 5 };
      red.castle = { x: 28, y: 20 };
      const soldiers = Array.from({ length: soldierCount }, (_, index) => ({
        ...template,
        id: `army-soldier-${index}`,
        position: { x: 10 + (index % 6), y: 10 + Math.floor(index / 6) },
      }));
      enemy.position = { x: 25, y: 18 };
      state.units = [...soldiers, enemy];
      state.treasures = [];
      state.turnPhase = "purchase";
      return state;
    };

    expect(chooseAiPurchase(makeState(4), "hard")).toBe("catapult");
    expect(chooseAiPurchase(makeState(12), "hard")).toBeUndefined();
  });

  it("lets stronger computers hold an effective Catapult position", () => {
    const makeState = (difficulty: Difficulty) => {
      const state = createGame([
        { id: "blue", controller: difficulty },
        { id: "red", controller: "human" },
      ], 92);
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
      }
      const blue = activePlayer(state);
      const red = state.players.find((player) => player.id === "red")!;
      const catapult = testCatapult(state, blue.id);
      const target = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
      blue.castle = { x: 2, y: 2 };
      red.castle = { x: 28, y: 20 };
      catapult.position = { x: 10, y: 10 };
      target.position = { x: 16, y: 10 };
      state.units = [catapult, target];
      state.treasures = [];
      return state;
    };

    expect(chooseAiMove(makeState("very-easy"), "very-easy")).toBeDefined();
    expect(chooseAiMove(makeState("expert"), "expert")).toBeUndefined();
  });

  it("lets the computer select a legal action", () => {
    const state = createGame([
      { id: "blue", controller: "normal" },
      { id: "red", controller: "human" },
    ]);
    const action = chooseAiMove(state, "normal");
    expect(action).toBeDefined();
    expect(getLegalMoves(state, action!.unitId)).toContainEqual(action!.destination);
  });

  it("makes a hard computer capture a reachable castle instead of wandering", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 93);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const redCastle = state.players.find((player) => player.id === "red")!.castle;
    blueSoldier.position = { x: redCastle.x - 1, y: redCastle.y };
    state.terrain[blueSoldier.position.y * state.width + blueSoldier.position.x] = "land";
    state.units = [blueSoldier];
    expect(chooseAiMove(state, "hard")).toEqual({ unitId: blueSoldier.id, destination: redCastle });
  });

  it("makes stronger computers recognise a guaranteed Soldier attack on a Catapult", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 931);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const soldier = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const catapult = testCatapult(state, red.id);
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 28, y: 20 };
    soldier.position = { x: 10, y: 10 };
    catapult.position = { x: 11, y: 10 };
    state.units = [soldier, catapult];
    state.treasures = [];

    expect(chooseAiMove(state, "hard")).toEqual({ unitId: soldier.id, destination: catapult.position });
  });

  it("makes Expert preserve a Veteran instead of charging supported Veterans", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 932);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const veteran = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const enemyTemplate = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 28, y: 20 };
    veteran.position = { x: 10, y: 10 };
    veteran.veteran = true;
    const enemies = [
      { ...enemyTemplate, id: "supported-veteran-a", position: { x: 11, y: 10 }, veteran: true },
      { ...enemyTemplate, id: "supported-veteran-b", position: { x: 11, y: 9 }, veteran: true },
      { ...enemyTemplate, id: "supported-veteran-c", position: { x: 11, y: 11 }, veteran: true },
    ];
    state.units = [veteran, ...enemies];
    state.treasures = [];

    const action = chooseAiMove(state, "expert");

    if (action) {
      expect(action.unitId).toBe(veteran.id);
      expect(enemies.map((enemy) => enemy.position)).not.toContainEqual(action.destination);
    }
  });

  it("makes lower difficulties take more risky Veteran fights than Expert", () => {
    let veryEasyCharges = 0;
    let expertCharges = 0;
    for (let seed = 940; seed < 970; seed += 1) {
      const makeState = (difficulty: Difficulty) => {
        const state = createGame([
          { id: "blue", controller: difficulty },
          { id: "red", controller: "human" },
        ], seed);
        for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
        const blue = activePlayer(state);
        const red = state.players.find((player) => player.id === "red")!;
        const veteran = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
        const enemyTemplate = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
        blue.castle = { x: 2, y: 2 };
        red.castle = { x: 28, y: 20 };
        veteran.position = { x: 10, y: 10 };
        veteran.veteran = true;
        const enemies = [
          { ...enemyTemplate, id: `risky-a-${seed}`, position: { x: 11, y: 10 }, veteran: true },
          { ...enemyTemplate, id: `risky-b-${seed}`, position: { x: 11, y: 9 }, veteran: true },
          { ...enemyTemplate, id: `risky-c-${seed}`, position: { x: 11, y: 11 }, veteran: true },
        ];
        state.units = [veteran, ...enemies];
        state.treasures = [];
        return { state, enemies };
      };
      const veryEasy = makeState("very-easy");
      const veryEasyAction = chooseAiMove(veryEasy.state, "very-easy");
      if (veryEasyAction && veryEasy.enemies.some((enemy) =>
        positionKey(enemy.position) === positionKey(veryEasyAction.destination)
      )) veryEasyCharges += 1;

      const expert = makeState("expert");
      const expertAction = chooseAiMove(expert.state, "expert");
      if (expertAction && expert.enemies.some((enemy) =>
        positionKey(enemy.position) === positionKey(expertAction.destination)
      )) expertCharges += 1;
    }

    expect(expertCharges).toBe(0);
    expect(veryEasyCharges).toBeGreaterThan(expertCharges);
  });

  it("makes Expert hold a forward raider while a partner catches up", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 933);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const template = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 20, y: 10 };
    const forwardRaider = { ...template, id: "forward-raider", position: { x: 15, y: 8 } };
    const followingRaider = { ...template, id: "following-raider", position: { x: 5, y: 8 } };
    state.units = [forwardRaider, followingRaider];
    state.treasures = [];

    const action = chooseAiMove(state, "expert");

    expect(action?.unitId).toBe(followingRaider.id);
    expect(Math.max(
      Math.abs(action!.destination.x - red.castle.x),
      Math.abs(action!.destination.y - red.castle.y),
    )).toBeLessThan(15);
  });

  it("lets Expert launch with two committed raiders while a third reinforces", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 934);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const template = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 20, y: 10 };
    const first = { ...template, id: "waiting-wave-a", position: { x: 15, y: 8 } };
    const second = { ...template, id: "waiting-wave-b", position: { x: 14, y: 7 } };
    const distant = { ...template, id: "waiting-wave-c", position: { x: 3, y: 18 } };
    state.units = [first, second, distant];
    state.treasures = [];

    const action = chooseAiMove(state, "expert");
    expect(action).toBeDefined();
    expect([first.id, second.id]).toContain(action!.unitId);
  });

  it("lets Hard and Expert spend a small reserve that Normal keeps idle", () => {
    const makeState = (difficulty: Difficulty) => {
      const state = createGame([
        { id: "blue", controller: difficulty },
        { id: "red", controller: "human" },
      ], 4411);
      state.players[0]!.gold = 7;
      state.treasures = [];
      state.units = state.units.filter((unit) => unit.playerId !== "blue" || unit.type === "soldier");
      state.turnPhase = "purchase";
      return state;
    };

    expect(chooseAiPurchase(makeState("normal"), "normal")).toBeUndefined();
    expect(chooseAiPurchase(makeState("hard"), "hard")).toBe("soldier");
    expect(chooseAiPurchase(makeState("expert"), "expert")).toBe("soldier");
  });

  it("lets a supported Expert Veteran remove a castle blocker", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 4412);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const soldierTemplate = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const enemyTemplate = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 18, y: 10 };
    const veteran = { ...soldierTemplate, id: "supported-veteran", position: { x: 12, y: 10 }, veteran: true };
    const allies = [
      { ...soldierTemplate, id: "support-a", position: { x: 11, y: 9 } },
      { ...soldierTemplate, id: "support-b", position: { x: 11, y: 10 } },
    ];
    const blocker = { ...enemyTemplate, id: "castle-blocker", position: { x: 13, y: 10 } };
    state.units = [veteran, ...allies, blocker];
    state.treasures = [];

    expect(chooseAiMove(state, "expert")).toEqual({
      unitId: veteran.id,
      destination: blocker.position,
    });
  });

  it("makes Expert target an exposed castle over a slightly nearer defended one", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
      { id: "pink", controller: "human" },
    ], 4413);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const pink = state.players.find((player) => player.id === "pink")!;
    const blueSoldier = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    const redTemplate = state.units.find((unit) => unit.playerId === red.id && unit.type === "soldier")!;
    blue.castle = { x: 2, y: 2 };
    red.castle = { x: 20, y: 10 };
    pink.castle = { x: 22, y: 10 };
    blueSoldier.position = { x: 10, y: 10 };
    state.units = [
      blueSoldier,
      { ...redTemplate, id: "red-guard-a", position: { x: 19, y: 9 } },
      { ...redTemplate, id: "red-guard-b", position: { x: 19, y: 10 } },
      { ...redTemplate, id: "red-guard-c", position: { x: 20, y: 9 } },
    ];
    state.treasures = [];

    chooseAiMove(state, "expert");
    expect(state.aiPlans.blue?.targetPlayerId).toBe(pink.id);
  });

  it("encourages an unthreatened Expert unit to leave the home crowd", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 935);
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    const soldier = state.units.find((unit) => unit.playerId === blue.id && unit.type === "soldier")!;
    blue.castle = { x: 5, y: 5 };
    red.castle = { x: 27, y: 19 };
    soldier.position = { x: 7, y: 5 };
    state.units = [soldier];
    state.treasures = [];

    const action = chooseAiMove(state, "expert");
    expect(action).toBeDefined();
    expect(Math.max(
      Math.abs(action!.destination.x - blue.castle.x),
      Math.abs(action!.destination.y - blue.castle.y),
    )).toBeGreaterThan(2);
  });

  it("makes a normal computer overwhelmingly favour an adjacent enemy castle", () => {
    let castleAttacks = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const state = createGame([
        { id: "blue", controller: "normal" },
        { id: "red", controller: "human" },
      ], seed);
      const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
      const redCastle = state.players.find((player) => player.id === "red")!.castle;
      for (let y = 0; y < state.height; y += 1) {
        for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
      }
      blueSoldier.position = { x: redCastle.x - 1, y: redCastle.y };
      state.units = [blueSoldier];
      state.seed = seed;

      const action = chooseAiMove(state, "normal");
      if (action?.destination.x === redCastle.x && action.destination.y === redCastle.y) castleAttacks += 1;
    }
    expect(castleAttacks).toBeGreaterThanOrEqual(36);
  });

  it("keeps a purposeless empty computer Longboat still", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 95);
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    boat.position = { x: 10, y: 10 };
    for (let x = 9; x <= 11; x += 1) state.terrain[10 * state.width + x] = "water";
    state.units = [boat];

    expect(chooseAiMove(state, "hard")).toBeUndefined();
  });

  it("assigns and boards raiders when a Longboat provides a useful route", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 96);
    const blue = state.players.find((player) => player.id === "blue")!;
    const red = state.players.find((player) => player.id === "red")!;
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    state.terrain.fill("water");
    blue.castle = { x: 3, y: 8 };
    red.castle = { x: 27, y: 8 };
    for (let y = 7; y <= 9; y += 1) {
      for (let x = 2; x <= 6; x += 1) state.terrain[y * state.width + x] = "land";
      for (let x = 25; x <= 29; x += 1) state.terrain[y * state.width + x] = "land";
    }
    boat.position = { x: 5, y: 10 };
    soldier.position = { x: 5, y: 9 };
    state.units = [boat, soldier];
    state.treasures = [];
    state.drinkingHorns = [];

    const action = chooseAiMove(state, "hard");
    expect(action?.unitId).toBe(soldier.id);
    expect(action?.destination.y).toBe(10);
    expect(unitAt(state, action!.destination)?.id).toBe(boat.id);
    expect(state.aiPlans.blue?.transportMissions?.[boat.id]?.crewIds).toContain(soldier.id);
    expect(moveUnit(state, action!.unitId, action!.destination)).toBe(true);
    expect(longboatPassengers(state, boat.id)).toHaveLength(1);
    const sailing = chooseAiMove(state, "hard");
    expect(sailing?.unitId).toBe(boat.id);
    expect(sailing!.destination.x).toBeGreaterThan(boat.position.x);
  });

  it("lets an Expert ferry depart with two crew after waiting one full round", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 961);
    const blue = state.players.find((player) => player.id === "blue")!;
    const red = state.players.find((player) => player.id === "red")!;
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const soldiers = state.units.filter((unit) => unit.playerId === "blue" && unit.type === "soldier");
    state.terrain.fill("water");
    blue.castle = { x: 3, y: 8 };
    red.castle = { x: 27, y: 8 };
    for (let y = 7; y <= 9; y += 1) {
      for (let x = 2; x <= 6; x += 1) state.terrain[y * state.width + x] = "land";
      for (let x = 25; x <= 29; x += 1) state.terrain[y * state.width + x] = "land";
    }
    boat.position = { x: 5, y: 10 };
    soldiers[0]!.position = { ...boat.position };
    soldiers[0]!.embarkedOn = boat.id;
    soldiers[1]!.position = { ...boat.position };
    soldiers[1]!.embarkedOn = boat.id;
    soldiers[2]!.position = { x: 5, y: 9 };
    state.units = [boat, ...soldiers];
    state.treasures = [];
    state.drinkingHorns = [];
    state.round = 2;
    state.aiPlans.blue = {
      playerId: "blue",
      objective: "attack-castle",
      targetPlayerId: "red",
      createdRound: 1,
      retainUntilRound: 10,
      roles: Object.fromEntries(soldiers.map((soldier) => [soldier.id, "raider"])),
      transportMissions: {
        [boat.id]: {
          boatId: boat.id,
          targetPlayerId: "red",
          crewIds: soldiers.map((soldier) => soldier.id),
          createdRound: 1,
          pickupPosition: { ...boat.position },
          departed: false,
        },
      },
    };

    const action = chooseAiMove(state, "expert");
    expect(state.aiPlans.blue.transportMissions?.[boat.id]?.crewIds).toEqual([soldiers[0]!.id, soldiers[1]!.id]);
    expect(action?.unitId).toBe(boat.id);
    expect(action!.destination.x).toBeGreaterThan(boat.position.x);
  });

  it("ends a computer transport mission after its passengers land", async () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 962, { eventDeckEnabled: false, winterEnabled: false });
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const passenger = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    state.terrain.fill("water");
    boat.position = { x: 10, y: 10 };
    passenger.position = { ...boat.position };
    passenger.embarkedOn = boat.id;
    red.castle = { x: 10, y: 5 };
    for (let x = 8; x <= 12; x += 1) state.terrain[9 * state.width + x] = "land";
    state.units = [boat, passenger];
    state.treasures = [];
    state.drinkingHorns = [];
    state.aiPlans.blue = {
      playerId: "blue",
      objective: "attack-castle",
      targetPlayerId: "red",
      createdRound: 1,
      retainUntilRound: 10,
      roles: { [boat.id]: "transport", [passenger.id]: "raider" },
      transportMissions: {
        [boat.id]: {
          boatId: boat.id,
          targetPlayerId: "red",
          crewIds: [passenger.id],
          createdRound: 1,
          pickupPosition: { x: 5, y: 10 },
          departed: true,
        },
      },
    };

    const summary = await executeComputerTurn(state);
    expect(summary.landings).toBe(1);
    expect(passenger.embarkedOn).toBeUndefined();
    expect(state.aiPlans.blue?.transportMissions?.[boat.id]).toBeUndefined();
  });

  it("makes a computer Longboat prioritise a reachable ram", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 97, { eventCardFrequency: "off" });
    const blueBoat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const redBoat = state.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    blueBoat.position = { x: 10, y: 10 };
    redBoat.position = { x: 14, y: 10 };
    for (let x = 5; x <= 20; x += 1) state.terrain[10 * state.width + x] = "water";
    state.units = [blueBoat, redBoat];

    const action = chooseAiMove(state, "hard");
    expect(action?.unitId).toBe(blueBoat.id);
    expect(action?.destination.y).toBe(10);
    expect(moveUnit(state, action!.unitId, action!.destination)).toBe(true);
    expect(state.units).not.toContain(redBoat);
  });

  it("keeps a crew aboard until a useful enemy shore is reached", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 99);
    const boat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const passenger = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "water";
    }
    boat.position = { x: 10, y: 10 };
    passenger.position = { ...boat.position };
    passenger.embarkedOn = boat.id;
    for (let x = 9; x <= 11; x += 1) state.terrain[9 * state.width + x] = "land";
    state.units = [boat, passenger];
    red.castle = { x: 25, y: 20 };

    expect(chooseAiDisembark(state, boat.id)).toBeUndefined();
    red.castle = { x: 10, y: 5 };
    expect(chooseAiDisembark(state, boat.id)).toBeDefined();
  });

  it("makes a computer carrying treasure favour the route back to its own castle", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 101);
    const blue = state.players.find((player) => player.id === "blue")!;
    blue.castle = { x: 3, y: 5 };
    const soldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    soldier.position = { x: 7, y: 5 };
    state.units = [soldier];
    for (let x = 3; x <= 7; x += 1) state.terrain[5 * state.width + x] = "land";
    state.treasures = [{ id: "return-chest", value: 20, position: { ...soldier.position }, carriedBy: soldier.id }];

    const action = chooseAiMove(state, "hard");
    expect(action).toBeDefined();
    expect(action!.destination.x).toBeLessThan(soldier.position.x);
  });

  it("makes a legal treasure deposit outrank an immediate castle attack", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 102);
    const blue = activePlayer(state);
    const red = state.players.find((player) => player.id === "red")!;
    blue.castle = { x: 6, y: 6 };
    red.castle = { x: 20, y: 6 };
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const carrier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    carrier.position = { x: 8, y: 6 };
    const attacker = { ...carrier, id: "castle-attacker", position: { x: 19, y: 6 } };
    state.units = [carrier, attacker];
    state.treasures = [{ id: "priority-chest", value: 30, position: { ...carrier.position }, carriedBy: carrier.id }];

    const action = chooseAiMove(state, "hard");

    expect(action?.unitId).toBe(carrier.id);
    expect(Math.max(
      Math.abs(action!.destination.x - blue.castle.x),
      Math.abs(action!.destination.y - blue.castle.y),
    )).toBe(1);
  });

  it("makes Hard AI clear its castle courtyard before a treasure delivery", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 103);
    const blue = activePlayer(state);
    blue.castle = { x: 6, y: 6 };
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    const carrier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    carrier.position = { x: 12, y: 6 };
    const blockers = [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1]
        .filter((dx) => dx !== 0 || dy !== 0)
        .map((dx, index) => ({
          ...carrier,
          id: `courtyard-blocker-${index}-${dx}-${dy}`,
          position: { x: blue.castle.x + dx, y: blue.castle.y + dy },
          moved: false,
        })),
    );
    state.units = [carrier, ...blockers];
    state.treasures = [{ id: "delivery-chest", value: 30, position: { ...carrier.position }, carriedBy: carrier.id }];

    const action = chooseAiMove(state, "hard");
    expect(action).toBeDefined();
    expect(action!.unitId).not.toBe(carrier.id);
    expect(Math.max(Math.abs(action!.destination.x - blue.castle.x), Math.abs(action!.destination.y - blue.castle.y))).toBeGreaterThan(1);
    state.turnPhase = "purchase";
    expect(chooseAiPurchase(state, "hard")).toBeUndefined();
  });

  it("clears a full courtyard for the nearest of several carriers within two turns", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 105);
    const blue = activePlayer(state);
    blue.castle = { x: 6, y: 6 };
    for (let index = 0; index < state.terrain.length; index += 1) state.terrain[index] = "land";
    const distantCarrier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    distantCarrier.position = { x: 30, y: 20 };
    const nearCarrier = { ...distantCarrier, id: "near-carrier", position: { x: 23, y: 6 } };
    const blockers = [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1]
        .filter((dx) => dx !== 0 || dy !== 0)
        .map((dx, index) => ({
          ...distantCarrier,
          id: `two-turn-blocker-${index}-${dx}-${dy}`,
          position: { x: blue.castle.x + dx, y: blue.castle.y + dy },
          moved: false,
        })),
    );
    state.units = [distantCarrier, nearCarrier, ...blockers];
    state.treasures = [
      { id: "distant-carried-chest", value: 20, position: { ...distantCarrier.position }, carriedBy: distantCarrier.id },
      { id: "near-carried-chest", value: 30, position: { ...nearCarrier.position }, carriedBy: nearCarrier.id },
    ];

    const action = chooseAiMove(state, "hard");

    expect(action).toBeDefined();
    expect(action!.unitId).not.toBe(distantCarrier.id);
    expect(action!.unitId).not.toBe(nearCarrier.id);
    expect(Math.max(
      Math.abs(action!.destination.x - blue.castle.x),
      Math.abs(action!.destination.y - blue.castle.y),
    )).toBeGreaterThan(1);
  });

  it("does not reserve the courtyard for a treasure carrier still several moves away", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 107);
    const blue = activePlayer(state);
    blue.castle = { x: 3, y: 5 };
    for (let y = 0; y < state.height; y += 1) {
      for (let x = 0; x < state.width; x += 1) state.terrain[y * state.width + x] = "land";
    }
    const carrier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    carrier.position = { x: 28, y: 5 };
    const blockers = [-1, 0, 1].flatMap((dy) =>
      [-1, 0, 1]
        .filter((dx) => dx !== 0 || dy !== 0)
        .filter((dx) => !(dx === 1 && dy === 0))
        .map((dx, index) => ({
          ...carrier,
          id: `distant-blocker-${index}-${dx}-${dy}`,
          position: { x: blue.castle.x + dx, y: blue.castle.y + dy },
          moved: false,
        })),
    );
    state.units = [carrier, ...blockers];
    state.treasures = [{ id: "distant-chest", value: 30, position: { ...carrier.position }, carriedBy: carrier.id }];
    state.turnPhase = "purchase";

    expect(chooseAiPurchase(state, "hard")).toBeDefined();
  });

  it("makes stronger computers prioritise valuable Catapult targets", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 17);
    const blueCatapult = testCatapult(state, "blue");
    const redSoldier = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    const redCatapult = testCatapult(state, "red");
    blueCatapult.position = { x: 10, y: 10 };
    redSoldier.position = { x: 12, y: 10 };
    redCatapult.position = { x: 15, y: 10 };
    state.units = [blueCatapult, redSoldier, redCatapult];
    const target = chooseAiCatapultTarget(state, blueCatapult.id, "hard")!;
    expect(Math.max(
      Math.abs(target.x - redCatapult.position.x),
      Math.abs(target.y - redCatapult.position.y),
    )).toBeLessThanOrEqual(2);
  });

  it("lets Expert aim between clustered enemies when scatter favours both", () => {
    const state = createGame([
      { id: "blue", controller: "expert" },
      { id: "red", controller: "human" },
    ], 18);
    const blueCatapult = testCatapult(state, "blue");
    const redTemplate = state.units.find((unit) => unit.playerId === "red" && unit.type === "soldier")!;
    blueCatapult.position = { x: 4, y: 10 };
    const enemies = [
      { ...redTemplate, id: "scatter-cluster-a", position: { x: 10, y: 9 } },
      { ...redTemplate, id: "scatter-cluster-b", position: { x: 10, y: 11 } },
    ];
    state.units = [blueCatapult, ...enemies];

    expect(chooseAiCatapultTarget(state, blueCatapult.id, "expert")).toEqual({ x: 9, y: 10 });
  });
});

