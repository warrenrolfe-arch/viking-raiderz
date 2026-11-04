import { describe, expect, it } from "vitest";
import {
  activePlayer,
  advanceWinter,
  BOARD_WIDTH,
  buyUnit,
  canBuyUnit,
  carriedTreasure,
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
  TURN_INCOME,
  UNIT_RULES,
  WINTER_EARLIEST_ROUND,
  WINTER_LATEST_ROUND,
  WINTER_PHASES,
  unitFootprint,
} from "../src/core";
import { AI_PURCHASE_LIMIT, chooseAiCatapultTarget, chooseAiDisembark, chooseAiMove, chooseAiPurchase } from "../src/ai";
import { executeComputerTurn } from "../src/simulation";
import { captureMovementContext, completeMovementPresentation } from "../src/movementPresentation";
import { captureShotContext, completeShotPresentation } from "../src/shotPresentation";
import type { Difficulty, GameState, PlayerId, PlayerSetup, Unit } from "../src/types";

const setups: PlayerSetup[] = [
  { id: "blue", controller: "human" },
  { id: "red", controller: "normal" },
  { id: "pink", controller: "off" },
  { id: "green", controller: "off" },
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
    expect(state.eventDeck).toHaveLength(17);
    expect(new Set(state.eventDeck)).toEqual(new Set(EVENT_CARDS));
    expect(state.treasures.every((chest) => chest.value >= 10 && chest.value <= 50 && chest.value % 10 === 0)).toBe(true);
    expect(UNIT_RULES.soldier.cost).toBe(2);
    expect(UNIT_RULES.longboat.cost).toBe(5);
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
    expect(state.eventDeck).toEqual([]);
    expect(drawEndTurnEvent(state, endingPlayer.id)).toBeUndefined();
    endTurn(state);
    expect(state.lastEvent).toBeUndefined();
    expect(state.eventDeck).toEqual([]);
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

    endTurn(state);
    expect(state.winterPhase).toBe(0);
    endTurn(state);
    expect(state.winterPhase).toBe(1);

    const firstBoundary = Math.ceil(state.height / WINTER_PHASES);
    expect(originalWater.filter((position) => position.y < firstBoundary).every(
      (position) => state.terrain[position.y * state.width + position.x] === "ice",
    )).toBe(true);
    expect(originalWater.filter((position) => position.y >= firstBoundary).some(
      (position) => state.terrain[position.y * state.width + position.x] === "water",
    )).toBe(true);

    for (let phase = 2; phase <= WINTER_PHASES; phase += 1) {
      endTurn(state);
      expect(state.winterPhase).toBe(phase - 1);
      endTurn(state);
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

    for (let turn = 0; turn < first.players.length; turn += 1) endTurn(first);
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
    expect(state.treasures[0]?.position).toEqual({ x: 11, y: 10 });
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
    redSoldier.position = { x: 11, y: 10 };
    redSoldier.drunk = true;
    for (let x = 10; x <= 12; x += 1) state.terrain[10 * state.width + x] = "land";
    state.units = [blueSoldier, redSoldier];

    expect(moveUnit(state, blueSoldier.id, redSoldier.position)).toBe(true);
    expect(redSoldier.playerId).toBe("blue");
    expect(redSoldier.position).toEqual({ x: 11, y: 10 });
    expect(redSoldier.drunk).toBe(false);
    expect(blueSoldier.moved).toBe(true);

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

    const shore = getDisembarkCells(state, boat.id)[0]!;
    expect(disembarkSoldier(state, boat.id, shore)).toBe(true);
    expect(longboatPassengers(state, boat.id)).toHaveLength(0);
    expect(soldiers[0]!.position).toEqual(shore);
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

  it("purchases units with gold", () => {
    const state = createGame(setups);
    const goldBefore = activePlayer(state).gold;
    expect(buyUnit(state, "blue", "soldier")).toBe(true);
    expect(activePlayer(state).gold).toBe(goldBefore - 2);
    const hired = state.units[state.units.length - 1]!;
    const castle = activePlayer(state).castle;
    expect(Math.max(Math.abs(hired.position.x - castle.x), Math.abs(hired.position.y - castle.y))).toBe(1);
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
    expect(canBuyUnit(state, blue.id, "soldier")).toBe(false);
  });

  it("advances to the next player and pays income", () => {
    const state = createGame(setups);
    const red = state.players.find((player) => player.id === "red")!;
    const goldBefore = red.gold;
    endTurn(state);
    expect(activePlayer(state).id).toBe("red");
    expect(red.gold).toBe(goldBefore + TURN_INCOME);
  });

  it("draws an end-turn saga card, resolves it, and reshuffles when required", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    state.eventDeck = ["royal-ransom"];
    state.eventDiscard = [];
    const goldBefore = blue.gold;

    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("royal-ransom");
    expect(blue.gold).toBe(goldBefore + 8);
    expect(state.eventDiscard).toEqual(["royal-ransom"]);
    expect(state.eventDeck).toEqual([]);

    const secondGoldBefore = blue.gold;
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("royal-ransom");
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
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("treasure-hunter");
    expect(state.treasures[0]?.value).toBe(50);

    state.eventDeck = ["veterans-tale"];
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("veterans-tale");
    expect(blueSoldier.veteran).toBe(true);

    state.eventDeck = ["sobering-thought"];
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("sobering-thought");
    expect(redSoldier.drunk).toBe(false);

    state.eventDeck = ["ale-delivery"];
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("ale-delivery");
    expect(state.drinkingHorns).toHaveLength(1);

    state.eventDeck = ["hidden-hoard"];
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("hidden-hoard");
    expect(state.treasures).toHaveLength(2);
    const hiddenHoard = state.treasures.find((chest) => chest.id.startsWith("event-chest-"))!;
    expect(hiddenHoard.value).toBe(10);
    expect(Math.max(Math.abs(hiddenHoard.position.x - blue.castle.x), Math.abs(hiddenHoard.position.y - blue.castle.y))).toBeGreaterThanOrEqual(5);

    state.eventDeck = ["the-persuader"];
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("the-persuader");
    expect(redSoldier.playerId).toBe("blue");

    redSoldier.playerId = "red";
    state.eventDeck = ["called-home"];
    expect(drawEndTurnEvent(state, blue.id)?.cardId).toBe("called-home");
    expect(Math.max(Math.abs(blueSoldier.position.x - blue.castle.x), Math.abs(blueSoldier.position.y - blue.castle.y))).toBe(1);
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

    endTurn(state);

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

  it("resolves six benign saga cards without changing the game", () => {
    const state = createGame(setups);
    const blue = activePlayer(state);
    const benignCards = [
      "ravens-counsel",
      "jarls-beard",
      "ordinary-rock",
      "longboat-laundry",
      "mead-inspector",
      "axe-shaped-cloud",
    ] as const;
    const goldBefore = blue.gold;
    const unitCountBefore = state.units.length;

    for (const cardId of benignCards) {
      state.eventDeck = [cardId];
      const event = drawEndTurnEvent(state, blue.id);
      expect(event?.cardId).toBe(cardId);
      expect(event?.outcome).toContain("Nothing changes.");
      expect(blue.gold).toBe(goldBefore);
      expect(state.units).toHaveLength(unitCountBefore);
    }
  });

  it("captures an enemy castle from an adjacent square without occupying it", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    red.castle = { x: 11, y: 10 };
    blueSoldier.position = { x: 10, y: 10 };
    state.units = [blueSoldier];
    state.seed = 0;
    for (let x = 10; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    expect(moveUnit(state, blueSoldier.id, red.castle)).toBe(true);
    expect(blueSoldier.position).toEqual({ x: 10, y: 10 });
    expect(blueSoldier.moved).toBe(true);
    expect(red.eliminated).toBe(true);
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

  it("removes a Soldier when the castle wins its defence roll", () => {
    const state = createGame(setups);
    const blueSoldier = state.units.find((unit) => unit.playerId === "blue" && unit.type === "soldier")!;
    const red = state.players.find((player) => player.id === "red")!;
    red.castle = { x: 11, y: 10 };
    blueSoldier.position = { x: 10, y: 10 };
    state.units = [blueSoldier];
    state.seed = 1000; // The next seeded roll is above both castle-capture chances.
    for (let x = 10; x <= 11; x += 1) state.terrain[10 * state.width + x] = "land";

    expect(moveUnit(state, blueSoldier.id, red.castle)).toBe(true);
    expect(state.units).not.toContain(blueSoldier);
    expect(red.eliminated).toBe(false);
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

  it("makes a computer Longboat prioritise a reachable ram", () => {
    const state = createGame([
      { id: "blue", controller: "hard" },
      { id: "red", controller: "human" },
    ], 97);
    const blueBoat = state.units.find((unit) => unit.playerId === "blue" && unit.type === "longboat")!;
    const redBoat = state.units.find((unit) => unit.playerId === "red" && unit.type === "longboat")!;
    blueBoat.position = { x: 10, y: 10 };
    redBoat.position = { x: 14, y: 10 };
    for (let x = 5; x <= 20; x += 1) state.terrain[10 * state.width + x] = "water";
    state.units = [blueBoat, redBoat];

    const action = chooseAiMove(state, "hard");
    expect(action).toEqual({ unitId: blueBoat.id, destination: { x: 12, y: 10 } });
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

