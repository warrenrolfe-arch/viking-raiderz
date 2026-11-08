import { carriedTreasure, playerAtCastle, positionKey, unitAt, unitFootprint } from "./core";
import type { DrinkingHorn, GameState, PlayerId, Position, Unit } from "./types";

export type ArrivalKind = "battle-won" | "ship-sunk" | "sturdy-longboat" | "repelled" | "converted" | "castle" | "treasure" | "deposit" | "boarding" | "drinking";

/** Castle attacks always hold their outcome for this fixed suspense period. */
export const CASTLE_ASSAULT_DURATION_MS = 3_000;

export interface MovementPresentation {
  unit: Unit;
  from: Position;
  to: Position;
  arrival?: ArrivalKind;
  sunkUnit?: Unit;
  destroyedUnit?: Unit;
  becameDrunk?: boolean;
  /** Visual-only copy of the consumed horn, retained until the Soldier reaches it. */
  consumedHorn?: DrinkingHorn;
  soberedUp?: boolean;
  /** Visual-only record for a normal Soldier/Veteran clash. */
  directClash?: {
    attacker: Unit;
    defender: Unit;
    attackerWon: boolean;
  };
  /** A drunk defender changes allegiance while both units remain on their real squares. */
  drunkConversion?: {
    attacker: Unit;
    defenderBefore: Unit;
    defenderAfter: Unit;
  };
  /** Visual-only castle assault snapshot; core combat has already resolved. */
  castleAssault?: {
    attacker: Unit;
    castlePlayerId: PlayerId;
    attackerWon: boolean;
    /** Last clear square before the castle; the attacker never enters the walls. */
    attackPosition: Position;
    /** Saga log before rules resolve, so the outcome cannot leak early. */
    logBeforeAttack: string[];
  };
  /** Pre-capture colours retained until the victory result appears. */
  capturedUnits?: Unit[];
}

interface MovementContext {
  unit: Unit;
  from: Position;
  to: Position;
  targetUnitId?: string;
  targetUnitPlayerId?: string;
  targetUnitType?: Unit["type"];
  targetUnit?: Unit;
  targetCastlePlayerId?: PlayerId;
  castleDefenderUnits?: Unit[];
  logBeforeCastleAttack?: string[];
  treasureId?: string;
  carriedTreasureId?: string;
  drinkingHorn?: DrinkingHorn;
  targetSturdyProtectionBefore?: number;
}

/** Capture the small amount of pre-move state needed for presentation after rules resolve. */
export function captureMovementContext(
  state: GameState,
  unitId: string,
  destination: Position,
): MovementContext | undefined {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return undefined;
  const destinationFootprint = new Set(unitFootprint(unit, destination).map(positionKey));
  const ramTarget = unit.type === "longboat"
    ? state.units.find((candidate) =>
        candidate.id !== unit.id &&
        candidate.type === "longboat" &&
        candidate.playerId !== unit.playerId &&
        unitFootprint(candidate).some((cell) => destinationFootprint.has(positionKey(cell))),
      )
    : undefined;
  // A three-square Longboat often rams the side of another boat while its
  // centre destination remains empty. Check complete hull footprints before
  // falling back to the ordinary destination-square target.
  const target = ramTarget ?? unitAt(state, destination);
  const castle = playerAtCastle(state, destination);
  const treasure = state.treasures.find(
    (candidate) => !candidate.carriedBy && candidate.position.x === destination.x && candidate.position.y === destination.y,
  );
  return {
    unit: { ...unit, position: { ...unit.position }, facing: unit.facing ? { ...unit.facing } : undefined },
    from: { ...unit.position },
    to: { ...destination },
    targetUnitId: target && target.id !== unit.id ? target.id : undefined,
    targetUnitPlayerId: target && target.id !== unit.id ? target.playerId : undefined,
    targetUnitType: target && target.id !== unit.id ? target.type : undefined,
    targetUnit: target && target.id !== unit.id
      ? { ...target, position: { ...target.position }, facing: target.facing ? { ...target.facing } : undefined }
      : undefined,
    targetCastlePlayerId: castle?.id,
    castleDefenderUnits: castle
      ? state.units
          .filter((candidate) => candidate.playerId === castle.id)
          .map((candidate) => ({
            ...candidate,
            position: { ...candidate.position },
            facing: candidate.facing ? { ...candidate.facing } : undefined,
          }))
      : undefined,
    logBeforeCastleAttack: castle ? [...state.log] : undefined,
    treasureId: treasure?.id,
    carriedTreasureId: carriedTreasure(state, unit.id)?.id,
    drinkingHorn: state.drinkingHorns.find(
      (horn) => horn.position.x === destination.x && horn.position.y === destination.y,
    ),
    targetSturdyProtectionBefore: target?.type === "longboat"
      ? state.players.find((player) => player.id === target.playerId)?.sturdyLongboatProtection
      : undefined,
  };
}

/** Describe the visible result without changing any game state. */
export function completeMovementPresentation(
  state: GameState,
  context: MovementContext,
): MovementPresentation {
  const mover = state.units.find((unit) => unit.id === context.unit.id);
  const target = context.targetUnitId
    ? state.units.find((unit) => unit.id === context.targetUnitId)
    : undefined;
  const destroyedUnit = context.targetUnit && !target ? context.targetUnit : undefined;
  const isDirectClash =
    context.unit.type === "soldier" &&
    context.targetUnit?.type === "soldier" &&
    context.targetUnit.playerId !== context.unit.playerId &&
    !context.targetUnit.drunk;
  const becameDrunk = context.unit.type === "soldier" && !context.unit.drunk && Boolean(mover?.drunk);
  const convertedDrunk = Boolean(
    context.targetUnit?.type === "soldier" &&
    context.targetUnit.drunk &&
    target &&
    !target.drunk &&
    target.playerId === context.unit.playerId,
  );
  let arrival: ArrivalKind | undefined;

  if (becameDrunk && context.drinkingHorn) {
    arrival = "drinking";
  } else if (context.targetCastlePlayerId) {
    const castleOwner = state.players.find((player) => player.id === context.targetCastlePlayerId);
    arrival = castleOwner?.eliminated ? "castle" : !mover ? "repelled" : undefined;
  } else if (mover?.embarkedOn) {
    arrival = "boarding";
  } else if (context.treasureId && state.treasures.some(
    (treasure) => treasure.id === context.treasureId && treasure.carriedBy === context.unit.id,
  )) {
    arrival = "treasure";
  } else if (context.carriedTreasureId && !state.treasures.some(
    (treasure) => treasure.id === context.carriedTreasureId,
  )) {
    arrival = "deposit";
  } else if (convertedDrunk) {
    arrival = "converted";
  } else if (context.targetUnitId && context.targetUnitPlayerId !== context.unit.playerId) {
    const targetOwner = context.targetUnitPlayerId
      ? state.players.find((player) => player.id === context.targetUnitPlayerId)
      : undefined;
    const sturdyLongboatSaved =
      context.unit.type === "longboat" &&
      context.targetUnitType === "longboat" &&
      Boolean(mover) &&
      Boolean(target) &&
      (context.targetSturdyProtectionBefore ?? 0) > (targetOwner?.sturdyLongboatProtection ?? 0);
    arrival = sturdyLongboatSaved
      ? "sturdy-longboat"
      : context.unit.type === "longboat" && context.targetUnitType === "longboat" && mover && !target
      ? "ship-sunk"
      : mover && !target ? "battle-won" : !mover ? "repelled" : "battle-won";
  }

  return {
    unit: context.unit,
    from: context.from,
    to: context.to,
    arrival,
    sunkUnit: arrival === "ship-sunk" ? context.targetUnit : undefined,
    destroyedUnit,
    becameDrunk,
    consumedHorn: becameDrunk && context.drinkingHorn
      ? { ...context.drinkingHorn, position: { ...context.drinkingHorn.position } }
      : undefined,
    soberedUp: Boolean(context.targetUnit?.drunk && target && !target.drunk),
    directClash: isDirectClash
      ? {
          attacker: context.unit,
          defender: context.targetUnit!,
          attackerWon: Boolean(mover) && !target,
        }
      : undefined,
    drunkConversion: convertedDrunk && target
      ? {
          attacker: context.unit,
          defenderBefore: context.targetUnit!,
          defenderAfter: { ...target, position: { ...target.position } },
        }
      : undefined,
    castleAssault: context.targetCastlePlayerId
      ? {
          attacker: context.unit,
          castlePlayerId: context.targetCastlePlayerId,
          attackerWon: Boolean(state.players.find(
            (player) => player.id === context.targetCastlePlayerId,
          )?.eliminated),
          attackPosition: mover
            ? { ...mover.position }
            : {
                x: context.to.x - Math.sign(context.to.x - context.from.x),
                y: context.to.y - Math.sign(context.to.y - context.from.y),
              },
          logBeforeAttack: context.logBeforeCastleAttack ?? [],
        }
      : undefined,
    capturedUnits: context.targetCastlePlayerId && state.players.find(
      (player) => player.id === context.targetCastlePlayerId,
    )?.eliminated
      ? context.castleDefenderUnits
      : undefined,
  };
}
