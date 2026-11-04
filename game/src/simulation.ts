import {
  AI_PURCHASE_LIMIT,
  AI_SOFT_UNIT_CAP,
  chooseAiCatapultTarget,
  chooseAiDisembark,
  chooseAiMove,
  describeAiIntent,
  executeAiPurchase,
} from "./ai";
import {
  activePlayer,
  canBuyUnit,
  completeManoeuvres,
  disembarkSoldier,
  endTurn,
  fireCatapult,
  forfeitPendingCatapultFire,
  longboatPassengers,
  moveDrunkSoldier,
  moveUnit,
} from "./core";
import {
  captureMovementContext,
  completeMovementPresentation,
  type MovementPresentation,
} from "./movementPresentation";
import {
  captureShotContext,
  completeShotPresentation,
  type ShotPresentation,
} from "./shotPresentation";
import type { Difficulty, GameState, PlayerId, UnitType } from "./types";

export type ComputerStepKind =
  | "drunk-move"
  | "move"
  | "disembark"
  | "catapult"
  | "manoeuvres-complete"
  | "purchase"
  | "end-turn";

export interface ComputerTurnHooks {
  onStep?: (
    kind: ComputerStepKind,
    state: GameState,
    movement?: MovementPresentation,
    shot?: ShotPresentation,
  ) => void | Promise<void>;
}

export interface ComputerTurnSummary {
  playerId: PlayerId;
  difficulty: Difficulty;
  drunkMoves: number;
  moves: number;
  landings: number;
  catapultShots: number;
  purchases: Record<UnitType, number>;
  combats: number;
  castleAttacks: number;
  castleCaptures: number;
  treasureCollections: number;
  treasureDeposits: number;
  veteranPromotions: number;
  boatRams: number;
  unitLosses: number;
  unitsNearHomeAtEnd: number;
  unusedPurchaseOpportunities: number;
  purchaseBlockedBySpace: boolean;
  atSoftUnitCap: boolean;
}

async function emitStep(
  hooks: ComputerTurnHooks,
  kind: ComputerStepKind,
  state: GameState,
  movement?: MovementPresentation,
  shot?: ShotPresentation,
): Promise<void> {
  await hooks.onStep?.(kind, state, movement, shot);
}

export async function executeDrunkOpeningMoves(
  state: GameState,
  hooks: ComputerTurnHooks = {},
): Promise<number> {
  if (state.winnerId) return 0;
  const player = activePlayer(state);
  const drunkSoldiers = state.units.filter(
    (unit) => unit.playerId === player.id && unit.type === "soldier" && unit.drunk && !unit.moved && !unit.embarkedOn,
  );
  let moved = 0;
  for (const soldier of drunkSoldiers) {
    if (state.winnerId || activePlayer(state).id !== player.id) break;
    const snapshot = { ...soldier, position: { ...soldier.position }, facing: soldier.facing ? { ...soldier.facing } : undefined };
    if (moveDrunkSoldier(state, soldier.id)) {
      moved += 1;
      const movedSoldier = state.units.find((unit) => unit.id === soldier.id);
      await emitStep(
        hooks,
        "drunk-move",
        state,
        {
          unit: snapshot,
          from: { ...snapshot.position },
          to: { ...(movedSoldier?.position ?? snapshot.position) },
        },
      );
    }
  }
  return moved;
}

/** Execute one complete computer turn with the same ordering used by the visible game. */
export async function executeComputerTurn(
  state: GameState,
  hooks: ComputerTurnHooks = {},
  includeDrunkOpening = true,
): Promise<ComputerTurnSummary> {
  const initialPlayer = activePlayer(state);
  if (initialPlayer.controller === "human") throw new Error("Cannot execute a human turn as a computer turn.");
  const difficulty = initialPlayer.controller;
  const initialUnitCount = state.units.length;
  const initialLogLength = state.log.length;
  const summary: ComputerTurnSummary = {
    playerId: initialPlayer.id,
    difficulty,
    drunkMoves: 0,
    moves: 0,
    landings: 0,
    catapultShots: 0,
    purchases: { soldier: 0, longboat: 0, catapult: 0 },
    combats: 0,
    castleAttacks: 0,
    castleCaptures: 0,
    treasureCollections: 0,
    treasureDeposits: 0,
    veteranPromotions: 0,
    boatRams: 0,
    unitLosses: 0,
    unitsNearHomeAtEnd: 0,
    unusedPurchaseOpportunities: 0,
    purchaseBlockedBySpace: false,
    atSoftUnitCap: false,
  };

  if (includeDrunkOpening) summary.drunkMoves = await executeDrunkOpeningMoves(state, hooks);

  // Stronger opponents coordinate artillery before committing their raiders.
  // Each Catapult reassesses after the previous impact, so two weapons do not
  // blindly waste shots on a target that has already been removed.
  if (difficulty === "hard" || difficulty === "expert") {
    const openingCatapults = state.units.filter(
      (unit) => unit.playerId === initialPlayer.id && unit.type === "catapult" && !unit.moved && !unit.fired,
    );
    for (const catapult of openingCatapults) {
      const target = chooseAiCatapultTarget(state, catapult.id, difficulty);
      const shotContext = target ? captureShotContext(state, catapult.id, target) : undefined;
      if (target && fireCatapult(state, catapult.id, target)) {
        summary.catapultShots += 1;
        await emitStep(hooks, "catapult", state, undefined, shotContext ? completeShotPresentation(state, shotContext) : undefined);
      }
    }
  }

  for (let step = 0; step < 24; step += 1) {
    if (state.winnerId || activePlayer(state).id !== initialPlayer.id) break;
    const action = chooseAiMove(state, difficulty);
    if (!action) break;
    state.log.unshift(`${initialPlayer.name} ${describeAiIntent(state, action)}.`);
    const actingUnit = state.units.find((unit) => unit.id === action.unitId);
    const movementContext = captureMovementContext(state, action.unitId, action.destination);
    if (!moveUnit(state, action.unitId, action.destination)) break;
    summary.moves += 1;
    await emitStep(
      hooks,
      "move",
      state,
      movementContext ? completeMovementPresentation(state, movementContext) : undefined,
    );
    const movedCatapult = actingUnit?.type === "catapult"
      ? state.units.find((unit) => unit.id === actingUnit.id)
      : undefined;
    if (movedCatapult?.pendingFireAfterMove) {
      const target = chooseAiCatapultTarget(state, movedCatapult.id, difficulty);
      const shotContext = target ? captureShotContext(state, movedCatapult.id, target) : undefined;
      if (target && fireCatapult(state, movedCatapult.id, target)) {
        summary.catapultShots += 1;
        await emitStep(hooks, "catapult", state, undefined, shotContext ? completeShotPresentation(state, shotContext) : undefined);
      } else {
        forfeitPendingCatapultFire(state);
      }
    }
  }

  if (!state.winnerId) {
    const crewedBoats = state.units.filter(
      (unit) =>
        unit.playerId === initialPlayer.id &&
        unit.type === "longboat" &&
        longboatPassengers(state, unit.id).length > 0,
    );
    for (const boat of crewedBoats) {
      while (longboatPassengers(state, boat.id).length > 0) {
        const landing = chooseAiDisembark(state, boat.id);
        const passenger = longboatPassengers(state, boat.id)[0];
        const presentation = passenger && landing
          ? {
              unit: { ...passenger, position: { ...passenger.position } },
              from: { ...boat.position },
              to: { ...landing },
            }
          : undefined;
        if (!landing || !disembarkSoldier(state, boat.id, landing)) break;
        summary.landings += 1;
        await emitStep(hooks, "disembark", state, presentation);
      }
    }
  }

  if (!state.winnerId) {
    const catapults = state.units.filter(
      (unit) => unit.playerId === initialPlayer.id && unit.type === "catapult" && !unit.fired,
    );
    for (const catapult of catapults) {
      const target = chooseAiCatapultTarget(state, catapult.id, difficulty);
      const shotContext = target ? captureShotContext(state, catapult.id, target) : undefined;
      if (target && fireCatapult(state, catapult.id, target)) {
        summary.catapultShots += 1;
        await emitStep(hooks, "catapult", state, undefined, shotContext ? completeShotPresentation(state, shotContext) : undefined);
      }
    }
  }

  if (!state.winnerId) {
    if (!completeManoeuvres(state)) throw new Error("Computer could not complete its movement phase.");
    await emitStep(hooks, "manoeuvres-complete", state);
  }

  if (!state.winnerId) {
    for (let purchase = 0; purchase < AI_PURCHASE_LIMIT; purchase += 1) {
      const before = new Set(state.units.map((unit) => unit.id));
      if (!executeAiPurchase(state, difficulty)) break;
      const bought = state.units.find((unit) => !before.has(unit.id));
      if (bought) summary.purchases[bought.type] += 1;
      await emitStep(hooks, "purchase", state);
    }
  }

  const home = initialPlayer.castle;
  const purchasesMade = Object.values(summary.purchases).reduce((total, count) => total + count, 0);
  summary.unusedPurchaseOpportunities = AI_PURCHASE_LIMIT - purchasesMade;
  const ownUnitCount = state.units.filter((unit) => unit.playerId === initialPlayer.id).length;
  summary.atSoftUnitCap = ownUnitCount >= AI_SOFT_UNIT_CAP;
  summary.purchaseBlockedBySpace =
    !state.winnerId &&
    summary.unusedPurchaseOpportunities > 0 &&
    initialPlayer.gold >= 2 &&
    !(Object.keys(summary.purchases) as UnitType[]).some((type) => canBuyUnit(state, initialPlayer.id, type));
  summary.unitsNearHomeAtEnd = state.units.filter((unit) =>
    unit.playerId === initialPlayer.id &&
    !unit.embarkedOn &&
    Math.max(Math.abs(unit.position.x - home.x), Math.abs(unit.position.y - home.y)) <= 2,
  ).length;

  if (!state.winnerId) {
    endTurn(state);
    await emitStep(hooks, "end-turn", state);
  }

  const newEntries = state.log.slice(0, state.log.length - initialLogLength);
  summary.combats = newEntries.filter((entry) => entry.includes("wins a clash") || entry.includes("overruns")).length;
  summary.castleAttacks = newEntries.filter((entry) => entry.includes("castle repels") || entry.includes("captures") && entry.includes("castle")).length;
  summary.castleCaptures = newEntries.filter((entry) => entry.includes("captures") && entry.includes("castle")).length;
  summary.treasureCollections = newEntries.filter((entry) => entry.includes("picks up a") && entry.includes("treasure chest")).length;
  summary.treasureDeposits = newEntries.filter((entry) => entry.includes("deposits treasure") || entry.includes("banks") && entry.includes("gold")).length;
  summary.veteranPromotions = newEntries.filter((entry) => entry.includes("becomes a Veteran")).length;
  summary.boatRams = newEntries.filter((entry) => entry.includes("rams and sinks")).length;
  const purchases = Object.values(summary.purchases).reduce((total, count) => total + count, 0);
  summary.unitLosses = Math.max(0, initialUnitCount + purchases - state.units.length);
  return summary;
}
