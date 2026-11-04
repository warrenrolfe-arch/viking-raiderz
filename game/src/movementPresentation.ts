import { carriedTreasure, playerAtCastle, positionKey, unitAt, unitFootprint } from "./core";
import type { GameState, Position, Unit } from "./types";

export type ArrivalKind = "battle-won" | "ship-sunk" | "repelled" | "castle" | "treasure" | "deposit" | "boarding";

export interface MovementPresentation {
  unit: Unit;
  from: Position;
  to: Position;
  arrival?: ArrivalKind;
  sunkUnit?: Unit;
  destroyedUnit?: Unit;
  becameDrunk?: boolean;
  soberedUp?: boolean;
  /** Visual-only record for a normal Soldier/Veteran clash. */
  directClash?: {
    attacker: Unit;
    defender: Unit;
    attackerWon: boolean;
  };
}

interface MovementContext {
  unit: Unit;
  from: Position;
  to: Position;
  targetUnitId?: string;
  targetUnitPlayerId?: string;
  targetUnitType?: Unit["type"];
  targetUnit?: Unit;
  targetCastlePlayerId?: string;
  treasureId?: string;
  carriedTreasureId?: string;
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
    treasureId: treasure?.id,
    carriedTreasureId: carriedTreasure(state, unit.id)?.id,
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
  let arrival: ArrivalKind | undefined;

  if (context.targetCastlePlayerId) {
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
  } else if (context.targetUnitId && context.targetUnitPlayerId !== context.unit.playerId) {
    arrival = context.unit.type === "longboat" && context.targetUnitType === "longboat" && mover && !target
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
    becameDrunk: context.unit.type === "soldier" && !context.unit.drunk && Boolean(mover?.drunk),
    soberedUp: Boolean(context.targetUnit?.drunk && target && !target.drunk),
    directClash: isDirectClash
      ? {
          attacker: context.unit,
          defender: context.targetUnit!,
          attackerWon: Boolean(mover) && !target,
        }
      : undefined,
  };
}
