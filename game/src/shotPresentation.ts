import { positionKey, terrainAt, unitFootprint } from "./core";
import type { GameState, PlayerId, Position, Unit, UnitType } from "./types";

export type ImpactKind =
  | "enemy-hit"
  | "friendly-hit"
  | "longboat-hit"
  | "sturdy-longboat"
  | "shield-wall"
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
  sturdyLongboatProtection: Partial<Record<PlayerId, number>>;
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
    sturdyLongboatProtection: Object.fromEntries(
      state.players.map((player) => [player.id, player.sturdyLongboatProtection]),
    ),
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
    const sturdyLongboatSaved =
      previousOccupant.type === "longboat" &&
      Boolean(survivor) &&
      (context.sturdyLongboatProtection[previousOccupant.playerId] ?? 0) >
        (state.players.find((player) => player.id === previousOccupant.playerId)?.sturdyLongboatProtection ?? 0);
    const shieldWallSaved =
      previousOccupant.type === "soldier" &&
      Boolean(previousOccupant.unit.shieldWall) &&
      Boolean(survivor) &&
      !survivor?.shieldWall;
    impact = sturdyLongboatSaved
      ? "sturdy-longboat"
      : shieldWallSaved
        ? "shield-wall"
      : previousOccupant.drunk && survivor?.playerId === context.shooterPlayerId
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
    sunkUnit: impact === "longboat-hit" && !survivor ? previousOccupant?.unit : undefined,
    destroyedUnit,
  };
}
