import { positionKey, terrainAt, unitFootprint } from "./core";
import type { GameState, PlayerId, Position, Unit, UnitType } from "./types";

export type ImpactKind =
  | "enemy-hit"
  | "friendly-hit"
  | "longboat-hit"
  | "castle"
  | "converted"
  | "water"
  | "miss";

export interface ShotPresentation {
  from: Position;
  aimedAt: Position;
  landedAt: Position;
  shooterPlayerId: PlayerId;
  impact: ImpactKind;
  sunkUnit?: Unit;
  destroyedUnit?: Unit;
}

interface ShotContext {
  from: Position;
  aimedAt: Position;
  shooterPlayerId: PlayerId;
  occupants: Record<string, { id: string; playerId: PlayerId; type: UnitType; drunk?: boolean; unit: Unit }>;
  castles: Record<string, PlayerId>;
}

export function captureShotContext(
  state: GameState,
  catapultId: string,
  aimedAt: Position,
): ShotContext | undefined {
  const catapult = state.units.find((unit) => unit.id === catapultId && unit.type === "catapult");
  if (!catapult) return undefined;
  const occupants: ShotContext["occupants"] = {};
  for (const unit of state.units) {
    if (unit.embarkedOn) continue;
    for (const cell of unitFootprint(unit)) {
      occupants[positionKey(cell)] = {
        id: unit.id,
        playerId: unit.playerId,
        type: unit.type,
        drunk: unit.drunk,
        unit: { ...unit, position: { ...unit.position }, facing: unit.facing ? { ...unit.facing } : undefined },
      };
    }
  }
  const castles: ShotContext["castles"] = {};
  for (const player of state.players) castles[positionKey(player.castle)] = player.id;
  return {
    from: { ...catapult.position },
    aimedAt: { ...aimedAt },
    shooterPlayerId: catapult.playerId,
    occupants,
    castles,
  };
}

export function completeShotPresentation(
  state: GameState,
  context: ShotContext,
): ShotPresentation | undefined {
  const shot = state.lastShot;
  if (!shot) return undefined;
  const key = positionKey(shot.landedAt);
  const previousOccupant = context.occupants[key];
  const survivor = previousOccupant
    ? state.units.find((unit) => unit.id === previousOccupant.id)
    : undefined;
  const destroyedUnit = previousOccupant && !survivor ? previousOccupant.unit : undefined;
  let impact: ImpactKind = "miss";
  if (previousOccupant) {
    impact = previousOccupant.drunk && survivor?.playerId === context.shooterPlayerId
      ? "converted"
      : previousOccupant.type === "longboat"
        ? "longboat-hit"
        : previousOccupant.playerId === context.shooterPlayerId
          ? "friendly-hit"
          : "enemy-hit";
  } else if (context.castles[key]) {
    impact = "castle";
  } else if (terrainAt(state, shot.landedAt) === "water") {
    impact = "water";
  }
  return {
    from: context.from,
    aimedAt: { ...shot.aimedAt },
    landedAt: { ...shot.landedAt },
    shooterPlayerId: context.shooterPlayerId,
    impact,
    sunkUnit: impact === "longboat-hit" ? previousOccupant?.unit : undefined,
    destroyedUnit,
  };
}
