import {
  CATAPULT_FIRE_RANGE,
  UNIT_RULES,
  activePlayer,
  buyUnit,
  canBuyUnit,
  carriedTreasure,
  catapultScatterRadius,
  drinkingHornAt,
  getCatapultFireCells,
  getCatapultTargets,
  getCastleCaptureChance,
  getCombatWinChance,
  getDisembarkCells,
  getLegalMoves,
  isInside,
  longboatPassengers,
  longboatIsFrozen,
  playerAtCastle,
  terrainAt,
  treasureAt,
  unitAt,
  unitFootprint,
} from "./core";
import type {
  AiObjective,
  AiPlan,
  AiUnitRole,
  Difficulty,
  GameState,
  MoveAction,
  Player,
  PlayerId,
  Position,
  Unit,
  UnitType,
} from "./types";

/** Identical at every difficulty: strength comes from decisions, not extra resources. */
export const AI_PURCHASE_LIMIT = 2;
export const AI_SOFT_UNIT_CAP = 12;

interface Candidate extends MoveAction {
  score: number;
}

interface AiProfile {
  pathWeight: number;
  crowdPenalty: number;
  courtyardPenalty: number;
  clearCourtyardBonus: number;
  edgePenalty: number;
  minimumMoveScore: number;
  holdImprovement: number;
  planRetention: number;
  defenceHorizon: number;
  defenderCount: number;
  castleAttackChance: number;
  candidatePool: number;
  strategicWeight: number;
  combatJudgement: number;
  coordinationWeight: number;
  assaultGroupSize: number;
  veteranCaution: number;
  homeCongestionPenalty: number;
}

interface AiContext {
  profile: AiProfile;
  treasureHunterId?: string;
  carriers: Array<{ unitId: string; estimatedTurnsAway: number }>;
  deliveryCells: Position[];
  deliveryUrgency: "none" | "distant" | "prepare" | "imminent";
  deliveryBlocked: boolean;
  longboatGoals: Map<string, Position[]>;
  plan: AiPlan;
  targetCastle?: Player;
  castleThreats: Unit[];
  immediateCastleThreats: Unit[];
  assaultReady: boolean;
  committedRaiders: number;
  requiredRaiders: number;
}

function profileFor(difficulty: Difficulty): AiProfile {
  if (difficulty === "expert") return {
    pathWeight: 34, crowdPenalty: 22, courtyardPenalty: 110, clearCourtyardBonus: 360, edgePenalty: 44,
    minimumMoveScore: 0, holdImprovement: 1, planRetention: 3, defenceHorizon: 12, defenderCount: 3,
    castleAttackChance: 1, candidatePool: 1, strategicWeight: 28,
    combatJudgement: 1.3, coordinationWeight: 28, assaultGroupSize: 2, veteranCaution: 60,
    homeCongestionPenalty: 32,
  };
  if (difficulty === "hard") return {
    pathWeight: 28, crowdPenalty: 18, courtyardPenalty: 90, clearCourtyardBonus: 300, edgePenalty: 36,
    minimumMoveScore: 0, holdImprovement: 2, planRetention: 2, defenceHorizon: 10, defenderCount: 2,
    castleAttackChance: 1, candidatePool: 1, strategicWeight: 21,
    combatJudgement: 1, coordinationWeight: 22, assaultGroupSize: 2, veteranCaution: 45,
    homeCongestionPenalty: 18,
  };
  if (difficulty === "normal") return {
    pathWeight: 16, crowdPenalty: 11, courtyardPenalty: 56, clearCourtyardBonus: 190, edgePenalty: 20,
    minimumMoveScore: 0, holdImprovement: 2, planRetention: 1, defenceHorizon: 8, defenderCount: 2,
    castleAttackChance: 0.9, candidatePool: 2, strategicWeight: 13,
    combatJudgement: 0.55, coordinationWeight: 9, assaultGroupSize: 2, veteranCaution: 28,
    homeCongestionPenalty: 8,
  };
  if (difficulty === "easy") return {
    pathWeight: 7, crowdPenalty: 7, courtyardPenalty: 36, clearCourtyardBonus: 110, edgePenalty: 12,
    minimumMoveScore: -20, holdImprovement: -5, planRetention: 0, defenceHorizon: 6, defenderCount: 1,
    castleAttackChance: 0.8, candidatePool: 8, strategicWeight: 8,
    combatJudgement: 0.22, coordinationWeight: 3, assaultGroupSize: 1, veteranCaution: 8,
    homeCongestionPenalty: 2,
  };
  return {
    pathWeight: 2, crowdPenalty: 3, courtyardPenalty: 18, clearCourtyardBonus: 55, edgePenalty: 4,
    minimumMoveScore: -80, holdImprovement: -20, planRetention: 0, defenceHorizon: 4, defenderCount: 1,
    castleAttackChance: 0.65, candidatePool: 14, strategicWeight: 4,
    combatJudgement: 0, coordinationWeight: 0, assaultGroupSize: 1, veteranCaution: 0,
    homeCongestionPenalty: 0,
  };
}

function distance(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function nearestEnemyCastle(state: GameState, player: Player, from: Position): Player | undefined {
  return state.players
    .filter((candidate) => candidate.id !== player.id && !candidate.eliminated)
    .sort((a, b) => distance(from, a.castle) - distance(from, b.castle))[0];
}

function activeEnemies(state: GameState, player: Player): Unit[] {
  return state.units.filter((unit) => unit.playerId !== player.id && !unit.embarkedOn);
}

function combatValue(unit: Unit): number {
  if (unit.type === "soldier") return UNIT_RULES.soldier.cost + (unit.veteran ? 5 : 0);
  return UNIT_RULES[unit.type].cost;
}

function progressTowards(from: Position, destination: Position, target: Position): number {
  return distance(from, target) - distance(destination, target);
}

function adjacentCastleCells(state: GameState, player: Player): Position[] {
  return [-1, 0, 1].flatMap((dy) =>
    [-1, 0, 1].map((dx) => ({ x: player.castle.x + dx, y: player.castle.y + dy })),
  ).filter((cell) =>
    !(cell.x === player.castle.x && cell.y === player.castle.y) &&
    isInside(state, cell) &&
    ["land", "ice"].includes(terrainAt(state, cell)),
  );
}

function openDeliveryCells(state: GameState, player: Player): Position[] {
  return adjacentCastleCells(state, player).filter((cell) => !unitAt(state, cell));
}

function canRouteThrough(state: GameState, unit: Unit, position: Position): boolean {
  if (!isInside(state, position)) return false;
  if (unit.type === "soldier") return terrainAt(state, position) !== "water";
  if (unit.type === "catapult") {
    return [position, { x: position.x + 1, y: position.y }].every(
      (cell) => isInside(state, cell) && terrainAt(state, cell) !== "water",
    );
  }
  return [position.x - 1, position.x, position.x + 1].every(
    (x) => isInside(state, { x, y: position.y }) && terrainAt(state, { x, y: position.y }) === "water",
  );
}

/** A small, eight-direction terrain route map; occupancy is handled separately as traffic scoring. */
function routeDistance(state: GameState, unit: Unit, start: Position, goals: Position[]): number | undefined {
  const goalKeys = new Set(goals.map((goal) => `${goal.x},${goal.y}`));
  const startKey = `${start.x},${start.y}`;
  if (goalKeys.has(startKey)) return 0;
  const visited = new Set([startKey]);
  const queue: Array<{ position: Position; steps: number }> = [{ position: start, steps: 0 }];
  const directions = [-1, 0, 1].flatMap((dx) => [-1, 0, 1]
    .filter((dy) => dx !== 0 || dy !== 0)
    .map((dy) => ({ x: dx, y: dy })));

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const direction of directions) {
      const next = { x: current.position.x + direction.x, y: current.position.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || !canRouteThrough(state, unit, next)) continue;
      if (goalKeys.has(key)) return current.steps + 1;
      visited.add(key);
      queue.push({ position: next, steps: current.steps + 1 });
    }
  }
  return undefined;
}

function routeProgress(
  state: GameState,
  unit: Unit,
  destination: Position,
  goals: Position[],
  profile: AiProfile,
): number {
  if (goals.length === 0) return 0;
  const direct = Math.min(...goals.map((goal) => progressTowards(unit.position, destination, goal)));
  if (profile.pathWeight === 0) return direct;
  const before = routeDistance(state, unit, unit.position, goals);
  const after = routeDistance(state, unit, destination, goals);
  if (before === undefined || after === undefined) return direct;
  return (before - after) * profile.pathWeight;
}

function nearestChestFor(state: GameState, unit: Unit, profile: AiProfile) {
  return state.treasures
    .filter((chest) => !chest.carriedBy)
    .map((chest) => ({
      chest,
      distance: profile.pathWeight > 4
        ? routeDistance(state, unit, unit.position, [chest.position]) ?? Number.MAX_SAFE_INTEGER
        : distance(unit.position, chest.position),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.chest;
}

function castleThreatsFor(
  state: GameState,
  player: Player,
  profile: AiProfile,
  horizon = profile.defenceHorizon,
): Unit[] {
  const homeGoals = adjacentCastleCells(state, player);
  return state.units
    .filter((unit) => unit.playerId !== player.id && unit.type === "soldier" && !unit.embarkedOn)
    .filter((unit) => {
      const route = routeDistance(state, unit, unit.position, homeGoals);
      return route !== undefined && route <= horizon;
    })
    .sort((a, b) => distance(a.position, player.castle) - distance(b.position, player.castle));
}

function selectTargetCastle(state: GameState, player: Player, profile: AiProfile): Player | undefined {
  const soldiers = state.units.filter(
    (unit) => unit.playerId === player.id && unit.type === "soldier" && !unit.embarkedOn && !carriedTreasure(state, unit.id),
  );
  return state.players
    .filter((candidate) => candidate.id !== player.id && !candidate.eliminated)
    .map((candidate) => {
      const goals = adjacentCastleCells(state, candidate);
      const route = soldiers.length > 0
        ? Math.min(...soldiers.map((soldier) =>
          routeDistance(state, soldier, soldier.position, goals) ?? 60 + distance(soldier.position, candidate.castle),
        ))
        : 80;
      const defenders = state.units.filter(
        (unit) => unit.playerId === candidate.id && !unit.embarkedOn && distance(unit.position, candidate.castle) <= 5,
      ).length;
      const committed = state.units.filter(
        (unit) => unit.playerId === player.id && !unit.embarkedOn && distance(unit.position, candidate.castle) <= 9,
      ).length;
      const enemyArmy = state.units.filter((unit) => unit.playerId === candidate.id).length;
      const vulnerability = Math.max(0, 3 - defenders);
      return {
        player: candidate,
        score:
          -(route * profile.strategicWeight) -
          defenders * 22 +
          committed * 14 -
          enemyArmy * 2 +
          vulnerability * profile.combatJudgement * 80,
      };
    })
    .sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id))[0]?.player;
}

function hasImmediateCastleAttack(state: GameState, player: Player): Player | undefined {
  for (const soldier of state.units.filter(
    (unit) => unit.playerId === player.id && unit.type === "soldier" && !unit.embarkedOn && !carriedTreasure(state, unit.id),
  )) {
    for (const destination of getLegalMoves(state, soldier.id)) {
      const castle = playerAtCastle(state, destination);
      if (castle && castle.id !== player.id) return castle;
    }
  }
  return undefined;
}

function assignAiRoles(
  state: GameState,
  player: Player,
  objective: AiObjective,
  profile: AiProfile,
  existingRoles?: Record<string, AiUnitRole>,
): Record<string, AiUnitRole> {
  const ownUnits = state.units.filter((unit) => unit.playerId === player.id);
  const liveIds = new Set(ownUnits.map((unit) => unit.id));
  const roles: Record<string, AiUnitRole> = {};
  for (const [unitId, role] of Object.entries(existingRoles ?? {})) {
    if (liveIds.has(unitId)) roles[unitId] = role;
  }

  for (const unit of ownUnits) {
    if (unit.type === "catapult") roles[unit.id] ??= "siege-support";
    else if (unit.type === "longboat") {
      const hasCrew = longboatPassengers(state, unit.id).length > 0;
      const enemyBoatExists = state.units.some((candidate) =>
        candidate.playerId !== player.id && candidate.type === "longboat",
      );
      roles[unit.id] ??= hasCrew || !enemyBoatExists ? "transport" : "naval-interceptor";
    } else roles[unit.id] ??= "raider";
  }

  for (const carrier of ownUnits.filter((unit) => unit.type === "soldier" && carriedTreasure(state, unit.id))) {
    roles[carrier.id] = "treasure-carrier";
  }

  const availableSoldiers = ownUnits.filter((unit) =>
    unit.type === "soldier" &&
    !unit.embarkedOn &&
    !unit.drunk &&
    !carriedTreasure(state, unit.id),
  );
  if (objective === "recover-treasure") {
    const chests = state.treasures.filter((chest) => !chest.carriedBy);
    const hunter = availableSoldiers
      .map((soldier) => ({
        soldier,
        route: Math.min(...chests.map((chest) =>
          routeDistance(state, soldier, soldier.position, [chest.position]) ?? Number.MAX_SAFE_INTEGER,
        )),
      }))
      .sort((a, b) => a.route - b.route)[0]?.soldier;
    if (hunter) roles[hunter.id] = "treasure-hunter";
  }

  if (objective === "defend-castle") {
    const threatCount = castleThreatsFor(state, player, profile, Math.min(profile.defenceHorizon, 6)).length;
    const defenders = availableSoldiers
      .slice()
      .sort((a, b) => distance(a.position, player.castle) - distance(b.position, player.castle))
      .slice(0, Math.min(profile.defenderCount, threatCount));
    for (const defender of defenders) roles[defender.id] = "castle-defender";
  }
  return roles;
}

function ensureAiPlan(state: GameState, player: Player, difficulty: Difficulty, profile: AiProfile): AiPlan {
  const existing = state.aiPlans[player.id];
  // Stronger opponents notice distant danger for positioning and Catapult
  // support, but a full defensive recall only begins when the threat is close.
  const threats = castleThreatsFor(state, player, profile, Math.min(profile.defenceHorizon, 6));
  const carrierExists = state.units.some(
    (unit) => unit.playerId === player.id && unit.type === "soldier" && Boolean(carriedTreasure(state, unit.id)),
  );
  const immediateCastle = hasImmediateCastleAttack(state, player);
  const chestExists = state.treasures.some((chest) => !chest.carriedBy);

  let objective: AiObjective;
  let target = immediateCastle;
  if (threats.length > 0) objective = "defend-castle";
  else if (carrierExists) objective = "deliver-treasure";
  else if (immediateCastle) objective = "capture-castle";
  else if (chestExists) objective = "recover-treasure";
  else objective = "attack-castle";

  const existingTarget = existing?.targetPlayerId
    ? state.players.find((candidate) => candidate.id === existing.targetPlayerId && !candidate.eliminated)
    : undefined;
  const urgent = objective === "defend-castle" || objective === "deliver-treasure" || objective === "capture-castle";
  const canRetain = Boolean(
    existing &&
    !urgent &&
    state.round <= existing.retainUntilRound &&
    (existing.objective !== "recover-treasure" || chestExists),
  );
  if (canRetain) {
    objective = existing!.objective;
    target = existingTarget;
  }
  target ??= existingTarget ?? selectTargetCastle(state, player, profile);

  const retainedRoles = canRetain && existing?.objective === objective && existing.targetPlayerId === target?.id
    ? existing.roles
    : undefined;
  const plan: AiPlan = {
    playerId: player.id,
    objective,
    targetPlayerId: target?.id,
    createdRound: canRetain ? existing!.createdRound : state.round,
    retainUntilRound: canRetain ? existing!.retainUntilRound : state.round + profile.planRetention,
    roles: assignAiRoles(state, player, objective, profile, retainedRoles),
  };
  state.aiPlans[player.id] = plan;
  return plan;
}

function shoreCellsBesideBoat(state: GameState, centre: Position): Position[] {
  const cells: Position[] = [];
  for (let x = centre.x - 1; x <= centre.x + 1; x += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cell = { x: x + dx, y: centre.y + dy };
        if (
          isInside(state, cell) &&
          terrainAt(state, cell) !== "water" &&
          !cells.some((candidate) => candidate.x === cell.x && candidate.y === cell.y)
        ) cells.push(cell);
      }
    }
  }
  return cells;
}

function navigableBoatCentres(state: GameState, boat: Unit): Position[] {
  const centres: Position[] = [];
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 1; x < state.width - 1; x += 1) {
      const position = { x, y };
      if (canRouteThrough(state, boat, position)) centres.push(position);
    }
  }
  return centres;
}

function buildLongboatGoals(state: GameState, player: Player): Map<string, Position[]> {
  const goals = new Map<string, Position[]>();
  const boats = state.units.filter((unit) => unit.playerId === player.id && unit.type === "longboat");
  const enemyBoats = state.units.filter((unit) => unit.playerId !== player.id && unit.type === "longboat");
  const enemyCastles = state.players.filter((candidate) => candidate.id !== player.id && !candidate.eliminated);

  for (const boat of boats) {
    let candidates: Position[] = [];
    const crew = longboatPassengers(state, boat.id).length;
    if (enemyBoats.length > 0) {
      candidates.push(...enemyBoats.map((enemy) => enemy.position));
    }
    if (crew > 0) {
      candidates.push(...navigableBoatCentres(state, boat).filter((centre) => {
        const shore = shoreCellsBesideBoat(state, centre);
        return shore.some((cell) => enemyCastles.some((enemy) => distance(cell, enemy.castle) <= 8));
      }));
    } else {
      const waitingSoldiers = state.units.filter((unit) =>
        unit.playerId === player.id &&
        unit.type === "soldier" &&
        !unit.embarkedOn &&
        !unit.drunk &&
        !carriedTreasure(state, unit.id) &&
        distance(unit.position, boat.position) <= 10,
      );
      if (waitingSoldiers.length > 0) {
        candidates.push(...navigableBoatCentres(state, boat).filter((centre) =>
          shoreCellsBesideBoat(state, centre).some((cell) =>
            waitingSoldiers.some((soldier) => distance(cell, soldier.position) <= 2),
          ),
        ));
      }
    }

    const unique = [...new Map(candidates.map((position) => [`${position.x},${position.y}`, position])).values()]
      .sort((a, b) => distance(boat.position, a) - distance(boat.position, b));
    if (unique.length > 0 && routeDistance(state, boat, boat.position, unique) !== undefined) {
      goals.set(boat.id, unique);
    }
  }
  return goals;
}

function buildContext(state: GameState, player: Player, difficulty: Difficulty): AiContext {
  const profile = profileFor(difficulty);
  const plan = ensureAiPlan(state, player, difficulty, profile);
  const deliveryCells = openDeliveryCells(state, player);
  const treasureHunterId = Object.entries(plan.roles).find(([, role]) => role === "treasure-hunter")?.[0];
  const homeCells = adjacentCastleCells(state, player);
  const carriers = state.units
    .filter((unit) =>
      unit.playerId === player.id &&
      unit.type === "soldier" &&
      !unit.embarkedOn &&
      Boolean(carriedTreasure(state, unit.id)),
    )
    .map((carrier) => {
      const routeSteps = routeDistance(state, carrier, carrier.position, homeCells);
      // This is an intentionally approximate measure: a clear straight run
      // can cover up to nine cells, while a winding route takes longer.
      return {
        unitId: carrier.id,
        estimatedTurnsAway: routeSteps === undefined ? Number.MAX_SAFE_INTEGER : Math.ceil(routeSteps / 9),
      };
    });
  const nearestCarrierTurns = carriers.length > 0
    ? Math.min(...carriers.map((carrier) => carrier.estimatedTurnsAway))
    : Number.MAX_SAFE_INTEGER;
  const deliveryUrgency = carriers.length === 0
    ? "none"
    : nearestCarrierTurns <= 1
      ? "imminent"
      : nearestCarrierTurns <= 2
        ? "prepare"
        : "distant";
  const castleThreats = castleThreatsFor(state, player, profile);
  const immediateCastleThreats = castleThreatsFor(state, player, profile, Math.min(profile.defenceHorizon, 6));
  const targetCastle = plan.targetPlayerId
    ? state.players.find((candidate) => candidate.id === plan.targetPlayerId && !candidate.eliminated)
    : undefined;
  const raiders = state.units.filter((unit) =>
    unit.playerId === player.id &&
    unit.type === "soldier" &&
    !unit.embarkedOn &&
    !unit.drunk &&
    plan.roles[unit.id] === "raider",
  );
  const requiredRaiders = Math.min(profile.assaultGroupSize, Math.max(1, raiders.length));
  const committedRaiders = targetCastle
    ? raiders.filter((unit) => distance(unit.position, targetCastle.castle) <= 9).length
    : 0;
  return {
    profile,
    treasureHunterId,
    carriers,
    deliveryCells,
    deliveryUrgency,
    deliveryBlocked:
      (deliveryUrgency === "prepare" || deliveryUrgency === "imminent") &&
      deliveryCells.length === 0,
    longboatGoals: buildLongboatGoals(state, player),
    plan,
    targetCastle,
    castleThreats,
    immediateCastleThreats,
    assaultReady: committedRaiders >= requiredRaiders,
    committedRaiders,
    requiredRaiders,
  };
}

function scoreMove(
  state: GameState,
  player: Player,
  unit: Unit,
  destination: Position,
  difficulty: Difficulty,
  context: AiContext,
): number {
  const targetCastle = context.targetCastle ?? nearestEnemyCastle(state, player, destination);
  const targetUnit = unitAt(state, destination);
  const enemies = activeEnemies(state, player);
  const castleThreats = context.castleThreats;
  const role = context.plan.roles[unit.id];
  const { profile } = context;
  let score = 0;

  const ramTarget = unit.type === "longboat"
    ? state.units.find((candidate) =>
      candidate.type === "longboat" &&
      candidate.playerId !== unit.playerId &&
      [destination.x - 1, destination.x, destination.x + 1].some((x) =>
        unitFootprint(candidate).some((cell) => cell.x === x && cell.y === destination.y),
      ),
    )
    : undefined;

  if (unit.type === "soldier") {
    const carriedChest = carriedTreasure(state, unit.id);
    const nearestChest = nearestChestFor(state, unit, profile);
    const horn = drinkingHornAt(state, destination);
    if (carriedChest) {
      score += routeProgress(state, unit, destination, context.deliveryCells, profile) * 3;
      if (distance(destination, player.castle) === 1) score += 850;
    } else if (nearestChest && role === "treasure-hunter") {
      score += routeProgress(state, unit, destination, [nearestChest.position], profile);
      const chestAtDestination = treasureAt(state, destination);
      if (chestAtDestination) score += 70 + chestAtDestination.value;
    }
    // A modest temptation rather than a primary objective: Easy Vikings are
    // happiest to take it, while Hard still favours clear strategic gains.
    if (horn && !carriedChest && !unit.drunk) {
      score += difficulty === "very-easy" ? 26 : difficulty === "easy" ? 22 : difficulty === "normal" ? 16 : 10;
    }
    if (targetCastle && role === "raider") {
      score += routeProgress(state, unit, destination, [targetCastle.castle], profile);
      const targetDistance = distance(destination, targetCastle.castle);
      const targetDefenders = state.units.filter((candidate) =>
        candidate.playerId === targetCastle.id &&
        !candidate.embarkedOn &&
        distance(candidate.position, targetCastle.castle) <= 4,
      ).length;
      const nearbyRaiders = state.units.filter((ally) =>
        ally.id !== unit.id &&
        ally.playerId === player.id &&
        ally.type === "soldier" &&
        !ally.embarkedOn &&
        context.plan.roles[ally.id] === "raider" &&
        distance(ally.position, destination) <= 3,
      ).length;
      score += nearbyRaiders * profile.coordinationWeight;
      if (context.assaultReady) {
        score += progressTowards(unit.position, destination, targetCastle.castle) * profile.coordinationWeight;
        // Once the launch threshold is met, move the raiders already in the
        // attack area before a distant reinforcement. The reinforcement still
        // advances on its own action later in the turn.
        if (distance(unit.position, targetCastle.castle) <= 9) {
          score += profile.coordinationWeight * 4;
        }
        if ((difficulty === "hard" || difficulty === "expert") && targetDefenders <= 1) {
          const urgency = difficulty === "expert" ? 5 : 3;
          score += progressTowards(unit.position, destination, targetCastle.castle) * profile.coordinationWeight * urgency;
          if (targetDistance <= 4) score += profile.strategicWeight * urgency;
        }
        if (targetDistance <= 2) score += 18 + profile.strategicWeight;
      } else if (profile.assaultGroupSize > 1) {
        // Hold a useful staging distance while the rest of the raiding party
        // catches up; do not suppress an actual castle attack below.
        if (targetDistance >= 5 && targetDistance <= 8) score += profile.coordinationWeight * 2;
        if (targetDistance < 5) score -= profile.coordinationWeight * (5 - targetDistance) * 3;
      }
    }
    const destinationCastle = playerAtCastle(state, destination);
    if (destinationCastle && destinationCastle.id !== player.id) {
      score += 1000 + getCastleCaptureChance(unit) * profile.combatJudgement * 100;
    }

    if (
      targetUnit?.type === "longboat" &&
      targetUnit.playerId === player.id &&
      longboatPassengers(state, targetUnit.id).length < 3
    ) {
      score += 95;
    }

    if (role === "castle-defender") {
      const nearestThreat = context.immediateCastleThreats[0];
      const homeDistance = distance(destination, player.castle);
      const threatAtGate = context.immediateCastleThreats.some(
        (threat) => distance(threat.position, player.castle) <= 3,
      );
      if (nearestThreat) {
        score += routeProgress(state, unit, destination, [nearestThreat.position], profile) * 1.5;
      }
      if (homeDistance >= 2 && homeDistance <= 4) score += 85 + context.immediateCastleThreats.length * 18;
      if (homeDistance === 1 && !threatAtGate) score -= 110;
      if (homeDistance === 1 && threatAtGate) score += 70;
      if (homeDistance > 4) {
        score += progressTowards(unit.position, destination, player.castle) * profile.strategicWeight;
      }
      if (distance(unit.position, player.castle) === 1 && homeDistance >= 2 && homeDistance <= 4) score += 75;
    } else if (
      context.immediateCastleThreats.some((threat) => distance(threat.position, player.castle) <= 3) &&
      distance(unit.position, player.castle) <= 5
    ) {
      score += progressTowards(unit.position, destination, player.castle) * Math.max(4, profile.strategicWeight / 3);
    }
  } else if (unit.type === "longboat") {
    const crew = longboatPassengers(state, unit.id).length;
    const missionGoals = context.longboatGoals.get(unit.id) ?? [];
    score += routeProgress(state, unit, destination, missionGoals, profile) * (crew > 0 ? 2 : 1.25);
    if (ramTarget) score += 1200;
    if (crew > 0 && targetCastle) {
      const nearbyShore = [-1, 0, 1].flatMap((dy) =>
        [-2, -1, 0, 1, 2].map((dx) => ({ x: destination.x + dx, y: destination.y + dy })),
      ).filter((cell) => terrainAt(state, cell) !== "water").length;
      score += Math.min(nearbyShore, 6) * 2;
    }
  } else {
    const enemiesInRange = enemies.filter((enemy) => distance(destination, enemy.position) <= CATAPULT_FIRE_RANGE);
    score += enemiesInRange.length * 24;
    const nearestEnemy = enemies
      .slice()
      .sort((a, b) => distance(destination, a.position) - distance(destination, b.position))[0];
    if (nearestEnemy) {
      const range = distance(destination, nearestEnemy.position);
      score += 22 - Math.abs(range - 6) * 5;
      if (range <= 2) score -= 35;
    }
    if (context.immediateCastleThreats.length > 0) {
      score += progressTowards(unit.position, destination, player.castle) * Math.max(5, profile.strategicWeight / 2);
    }
    if (difficulty === "normal" || difficulty === "hard" || difficulty === "expert") {
      const enemyCatapult = enemies.find((enemy) => enemy.type === "catapult");
      const crewedEnemyBoat = enemies.find(
        (enemy) => enemy.type === "longboat" && longboatPassengers(state, enemy.id).length > 0,
      );
      const currentTarget = enemies
        .filter((enemy) => distance(unit.position, enemy.position) <= CATAPULT_FIRE_RANGE)
        .sort((a, b) => combatValue(b) - combatValue(a))[0];
      const missionPosition = context.immediateCastleThreats[0]?.position ??
        enemyCatapult?.position ??
        crewedEnemyBoat?.position ??
        currentTarget?.position ??
        targetCastle?.castle;
      if (missionPosition) {
        const missionRange = distance(destination, missionPosition);
        score += 55 - Math.abs(missionRange - 7) * (difficulty === "expert" ? 11 : difficulty === "hard" ? 9 : 6);
        if (distance(unit.position, missionPosition) > CATAPULT_FIRE_RANGE) {
          score += progressTowards(unit.position, destination, missionPosition) * profile.strategicWeight;
        }
      }
      const escorts = state.units.filter((ally) =>
        ally.playerId === player.id &&
        ally.type === "soldier" &&
        !ally.embarkedOn &&
        distance(ally.position, destination) <= 2,
      ).length;
      score += Math.min(escorts, 1) * (difficulty === "expert" ? 30 : difficulty === "hard" ? 20 : 8);
    }
  }

  if (targetUnit && targetUnit.playerId !== player.id && unit.type === "soldier") {
    const guaranteedRecruit = targetUnit.type === "soldier" && Boolean(targetUnit.drunk);
    const winChance = guaranteedRecruit ? 1 : getCombatWinChance(unit, targetUnit);
    const expectedTrade =
      winChance * combatValue(targetUnit) -
      (1 - winChance) * combatValue(unit);
    const friendlySupport = state.units.filter((ally) =>
      ally.id !== unit.id &&
      ally.playerId === player.id &&
      ally.type === "soldier" &&
      !ally.embarkedOn &&
      distance(ally.position, destination) <= 2,
    ).length;
    const enemySupport = enemies.filter((enemy) =>
      enemy.id !== targetUnit.id &&
      enemy.type === "soldier" &&
      distance(enemy.position, destination) <= 2,
    ).length;
    const localAdvantage = friendlySupport - enemySupport;
    score += profile.combatJudgement * (
      expectedTrade * 12 +
      friendlySupport * profile.coordinationWeight -
      enemySupport * profile.coordinationWeight * 1.25
    );
    if (localAdvantage > 0 && (difficulty === "hard" || difficulty === "expert")) {
      score += localAdvantage * (difficulty === "expert" ? 110 : 65);
    }
    if (
      role === "raider" &&
      targetCastle &&
      targetUnit.type === "soldier" &&
      distance(targetUnit.position, targetCastle.castle) <= 5
    ) {
      score += difficulty === "expert" ? 210 : difficulty === "hard" ? 110 : 0;
    }
    if (unit.veteran && winChance < 0.6) {
      const supportedCaution = difficulty === "expert" && localAdvantage > 0
        ? Math.max(0.15, 1 - localAdvantage * 0.45)
        : 1;
      score -= profile.veteranCaution * supportedCaution * (1 - winChance);
    }
    if (targetUnit.type === "catapult") {
      score += 1200 * profile.combatJudgement;
    } else if (guaranteedRecruit) {
      score += 180 * profile.combatJudgement;
    }
  }

  if (targetUnit && targetUnit.playerId !== player.id) {
    score += 55 + UNIT_RULES[targetUnit.type].cost * 2;
  }

  const nearbyAllies = state.units.filter(
    (ally) => ally.playerId === player.id && !ally.embarkedOn && ally.id !== unit.id && distance(ally.position, destination) <= 2,
  ).length;
  score -= nearbyAllies * profile.crowdPenalty;

  const startsInCourtyard = distance(unit.position, player.castle) === 1;
  const endsInCourtyard = distance(destination, player.castle) === 1;
  const carryingChest = Boolean(carriedTreasure(state, unit.id));
  const destinationHomeDistance = distance(destination, player.castle);
  const currentHomeUnits = state.units.filter((candidate) =>
    candidate.id !== unit.id &&
    candidate.playerId === player.id &&
    !candidate.embarkedOn &&
    distance(candidate.position, player.castle) <= 2,
  ).length;
  if (
    !carryingChest &&
    context.immediateCastleThreats.length === 0 &&
    destinationHomeDistance <= 2
  ) {
    score -= profile.homeCongestionPenalty * Math.max(1, currentHomeUnits - 1);
  }
  if (
    !carryingChest &&
    context.immediateCastleThreats.length === 0 &&
    distance(unit.position, player.castle) <= 2 &&
    destinationHomeDistance > 2
  ) {
    score += profile.homeCongestionPenalty;
  }
  const reservesDeliverySpace = context.deliveryUrgency === "prepare" || context.deliveryUrgency === "imminent";
  if (!carryingChest && reservesDeliverySpace && context.deliveryCells.length <= 1 && endsInCourtyard) {
    score -= profile.courtyardPenalty * (context.deliveryUrgency === "imminent" ? 2 : 1);
  }
  if (context.deliveryBlocked && !carryingChest) {
    if (startsInCourtyard && !endsInCourtyard) score += profile.clearCourtyardBonus;
    if (endsInCourtyard) score -= profile.clearCourtyardBonus;
  }

  const edgeDistance = Math.min(destination.x, destination.y, state.width - 1 - destination.x, state.height - 1 - destination.y);
  if (!carryingChest && !treasureAt(state, destination) && edgeDistance <= 1) score -= profile.edgePenalty;

  if (difficulty === "hard" || difficulty === "expert") {
    const adjacentEnemies = enemies.filter((enemy) => distance(enemy.position, destination) <= 1).length;
    if (unit.type !== "soldier") score -= adjacentEnemies * 12;
  }

  score += ((destination.x * 17 + destination.y * 31 + state.round * 13) % 11) / 10;
  return score;
}

function scoreHoldPosition(state: GameState, player: Player, unit: Unit, context: AiContext): number {
  const role = context.plan.roles[unit.id];
  let score = 0;
  if (role === "raider" && context.targetCastle && !context.assaultReady) {
    const targetDistance = distance(unit.position, context.targetCastle.castle);
    if (targetDistance >= 5 && targetDistance <= 8) {
      score += context.profile.coordinationWeight * 3;
    }
  }
  if (role === "castle-defender") {
    const homeDistance = distance(unit.position, player.castle);
    const threatAtGate = context.immediateCastleThreats.some(
      (threat) => distance(threat.position, player.castle) <= 3,
    );
    if (homeDistance >= 2 && homeDistance <= 4) {
      score += 70 + context.immediateCastleThreats.length * 12;
    } else if (homeDistance === 1 && threatAtGate) {
      score += 60 + context.immediateCastleThreats.length * 12;
    }
  }
  if (unit.type === "catapult") {
    const enemies = activeEnemies(state, player);
    const inRange = enemies.filter((enemy) => distance(unit.position, enemy.position) <= CATAPULT_FIRE_RANGE);
    score += inRange.length * 24;
    const nearest = inRange.slice().sort(
      (a, b) => distance(unit.position, a.position) - distance(unit.position, b.position),
    )[0];
    if (nearest) {
      const range = distance(unit.position, nearest.position);
      score += 22 - Math.abs(range - 6) * 5;
    }
    if (inRange.length > 0 && (context.profile.combatJudgement >= 1)) score += 50;
    if (context.immediateCastleThreats.length > 0 && distance(unit.position, player.castle) <= 5) score += 25;
  }
  return score;
}

export function chooseAiMove(state: GameState, difficulty: Difficulty): MoveAction | undefined {
  const player = activePlayer(state);
  const context = buildContext(state, player, difficulty);
  const candidates: Candidate[] = state.units
    .filter((unit) =>
      unit.playerId === player.id &&
      !unit.moved &&
      !unit.embarkedOn &&
      (unit.type !== "longboat" || context.longboatGoals.has(unit.id)),
    )
    .flatMap((unit) => {
      const holdScore = scoreHoldPosition(state, player, unit, context);
      const requiredScore = Math.max(
        context.profile.minimumMoveScore,
        holdScore + context.profile.holdImprovement,
      );
      return getLegalMoves(state, unit.id)
        .map((destination) => ({
          unitId: unit.id,
          destination,
          score: scoreMove(state, player, unit, destination, difficulty, context),
        }))
        .filter((candidate) => candidate.score > requiredScore);
    })
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return undefined;

  // Banking treasure is never sacrificed for a tempting fight or a defensive
  // shuffle. Each carrier is assessed separately, and any carrier that can
  // finish beside home takes that action before every other unit.
  const deposits = candidates.filter((candidate) =>
    Boolean(carriedTreasure(state, candidate.unitId)) &&
    distance(candidate.destination, player.castle) === 1,
  );
  if (deposits.length > 0) {
    const selected = deposits[0]!;
    return { unitId: selected.unitId, destination: selected.destination };
  }

  // If a carrier is within roughly two turns and every delivery square is
  // occupied, clear one non-carrier out of the courtyard immediately.
  const courtyardClears = context.deliveryBlocked
    ? candidates.filter((candidate) => {
      const unit = state.units.find((item) => item.id === candidate.unitId);
      return Boolean(
        unit &&
        !carriedTreasure(state, unit.id) &&
        distance(unit.position, player.castle) === 1 &&
        distance(candidate.destination, player.castle) > 1,
      );
    })
    : [];
  if (courtyardClears.length > 0) {
    const selected = courtyardClears[0]!;
    return { unitId: selected.unitId, destination: selected.destination };
  }

  const variation = (state.seed ^ (state.round * 2654435761) ^ player.id.length) >>> 0;
  // A castle within reach is the clearest route to victory.  Keep a chest
  // carrier on its homeward job, but otherwise make an adjacent capture
  // attempt overwhelmingly more attractive than any ordinary skirmish.
  const castleAttacks = candidates.filter((candidate) => {
    const unit = state.units.find((item) => item.id === candidate.unitId);
    const castle = playerAtCastle(state, candidate.destination);
    return (
      unit?.type === "soldier" &&
      !carriedTreasure(state, candidate.unitId) &&
      castle?.id !== undefined &&
      castle.id !== player.id
    );
  });
  if (castleAttacks.length > 0) {
    const takesCastleChance = (variation % 100) / 100 < context.profile.castleAttackChance;
    if (takesCastleChance) {
      const selected = castleAttacks[0]!;
      return { unitId: selected.unitId, destination: selected.destination };
    }
  }

  if ((difficulty === "hard" || difficulty === "expert") && context.assaultReady && context.targetCastle) {
    const committedWaveMoves = candidates.filter((candidate) => {
      const unit = state.units.find((item) => item.id === candidate.unitId);
      return Boolean(
        unit &&
        context.plan.roles[unit.id] === "raider" &&
        distance(unit.position, context.targetCastle!.castle) <= 9,
      );
    });
    if (committedWaveMoves.length > 0) {
      const blockingAttacks = committedWaveMoves.filter((candidate) => {
        const target = unitAt(state, candidate.destination);
        return Boolean(
          target &&
          target.playerId !== player.id &&
          target.type === "soldier" &&
          distance(target.position, context.targetCastle!.castle) <= 5,
        );
      });
      const selected = blockingAttacks[0] ?? committedWaveMoves[0]!;
      return { unitId: selected.unitId, destination: selected.destination };
    }
  }

  let selected: Candidate;
  if (context.profile.candidatePool === 1) selected = candidates[0]!;
  else if (difficulty === "normal") {
    selected = variation % 5 === 0 ? candidates[Math.min(1, candidates.length - 1)]! : candidates[0]!;
  } else {
    const pool = candidates.slice(0, Math.min(context.profile.candidatePool, candidates.length));
    selected = pool[variation % pool.length]!;
  }
  return { unitId: selected.unitId, destination: selected.destination };
}

export function chooseAiCatapultTarget(
  state: GameState,
  catapultId: string,
  difficulty: Difficulty,
): Position | undefined {
  const catapult = state.units.find((unit) => unit.id === catapultId);
  if (!catapult) return undefined;
  const targets = getCatapultTargets(state, catapultId);
  if (difficulty === "very-easy" || difficulty === "easy") {
    return targets[(state.round + targets.length + (difficulty === "very-easy" ? 2 : 0)) % Math.max(targets.length, 1)];
  }
  if (difficulty === "normal") return targets
    .map((position) => {
      const target = unitAt(state, position);
      if (!target) return { position, score: -Infinity };
      let score = UNIT_RULES[target.type].cost * 3;
      if (target.type === "catapult") score += 18;
      const home = state.players.find((player) => player.id === catapult.playerId)?.castle;
      if (home) score += Math.max(0, 8 - distance(target.position, home)) * 5;
      const nearbyFriendlies = state.units.filter(
        (unit) => unit.playerId === catapult.playerId && !unit.embarkedOn && distance(unit.position, position) <= 2,
      ).length;
      score -= nearbyFriendlies * 8;
      return { position, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.position;

  const owner = state.players.find((player) => player.id === catapult.playerId);
  const context = owner ? buildContext(state, owner, difficulty) : undefined;
  const scatterCells = getCatapultFireCells(state, catapultId)
    .filter((position) => unitAt(state, position)?.playerId !== catapult.playerId);
  const shotValue = (position: Position): number => {
    const target = unitAt(state, position);
    if (!target) return 0;
    const friendly = target.playerId === catapult.playerId;
    let value = target.type === "longboat"
      ? 110 + longboatPassengers(state, target.id).length * 55
      : target.type === "catapult"
        ? 95
        : 48 + (target.veteran ? 28 : 0) + (carriedTreasure(state, target.id) ? 35 : 0);
    if (target.drunk && !friendly) value = 32;
    if (friendly) return -value * (difficulty === "expert" ? 1.8 : 1.35);
    if (owner && distance(target.position, owner.castle) <= 6) value += 35;
    if (target.type === "catapult") value += 35;
    if (target.type === "longboat" && longboatPassengers(state, target.id).length > 0) value += 65;
    if (context?.targetCastle && distance(target.position, context.targetCastle.castle) <= 5) value += 45;
    return value;
  };
  return scatterCells
    .map((position) => {
      const shotDistance = distance(catapult.position, position);
      const radius = catapultScatterRadius(shotDistance);
      let weightedValue = 0;
      let totalWeight = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const outer = radius === 2 && Math.max(Math.abs(dx), Math.abs(dy)) === 2;
          const weight = outer ? 0.5 : 1;
          const impact = {
            x: Math.max(0, Math.min(state.width - 1, position.x + dx)),
            y: Math.max(0, Math.min(state.height - 1, position.y + dy)),
          };
          weightedValue += shotValue(impact) * weight;
          totalWeight += weight;
        }
      }
      return { position, score: weightedValue / totalWeight };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.position.y - b.position.y || a.position.x - b.position.x)[0]?.position;
}

export function chooseAiDisembark(state: GameState, boatId: string): Position | undefined {
  const boat = state.units.find((unit) => unit.id === boatId);
  const player = boat && state.players.find((candidate) => candidate.id === boat.playerId);
  if (!boat || !player) return undefined;
  const targetCastle = nearestEnemyCastle(state, player, boat.position);
  if (!targetCastle) return undefined;
  // Keep the crew aboard until the boat has reached a genuinely useful enemy
  // shore.  This prevents the old habit of landing everyone beside home.
  return getDisembarkCells(state, boatId)
    .filter((cell) => longboatIsFrozen(state, boat) || distance(cell, targetCastle.castle) <= 8)
    .sort((a, b) => {
      return distance(a, targetCastle.castle) - distance(b, targetCastle.castle);
    })[0];
}

function hasLandRouteToTarget(state: GameState, player: Player, target?: Player): boolean {
  if (!target) return true;
  const routeScout: Unit = state.units.find(
    (unit) => unit.playerId === player.id && unit.type === "soldier",
  ) ?? {
    id: "ai-route-scout",
    playerId: player.id,
    type: "soldier",
    position: { ...player.castle },
    moved: false,
    fired: false,
  };
  const targetCells = adjacentCastleCells(state, target);
  return adjacentCastleCells(state, player).some(
    (start) => routeDistance(state, routeScout, start, targetCells) !== undefined,
  );
}

export function chooseAiPurchase(state: GameState, difficulty: Difficulty): UnitType | undefined {
  const player = activePlayer(state);
  const context = buildContext(state, player, difficulty);
  // Reserve exactly one potential hand-over square only when a carrier is
  // close enough for it to matter. Distant treasure should not stall growth.
  if (
    (context.deliveryUrgency === "prepare" || context.deliveryUrgency === "imminent") &&
    context.deliveryCells.length <= 1
  ) return undefined;
  const ownUnits = state.units.filter((unit) => unit.playerId === player.id);
  const enemyUnits = state.units.filter((unit) => unit.playerId !== player.id);
  const counts = ownUnits
    .reduce<Record<UnitType, number>>(
      (totals, unit) => ({ ...totals, [unit.type]: totals[unit.type] + 1 }),
      { soldier: 0, longboat: 0, catapult: 0 },
    );

  const underPressure = context.immediateCastleThreats.length > 0 || enemyUnits.length > ownUnits.length + 2;
  // A soft ceiling keeps late games readable. It is lifted when the faction
  // is genuinely outnumbered or defending an approaching attack.
  if (ownUnits.length >= AI_SOFT_UNIT_CAP && !underPressure) return undefined;

  // Expert converts more of its existing treasury into useful forces. This is
  // a decision-quality difference, not an economic bonus: prices, income and
  // purchase opportunities remain identical for every difficulty.
  const reserveGold = underPressure ? 0 : difficulty === "expert" ? 2 : difficulty === "hard" ? 4 : 6;
  const enemySoldiers = enemyUnits.filter((unit) => unit.type === "soldier").length;
  const enemyBoats = enemyUnits.filter((unit) => unit.type === "longboat").length;
  const emptyBoats = ownUnits.filter(
    (unit) => unit.type === "longboat" && longboatPassengers(state, unit.id).length === 0,
  ).length;
  const unclaimedChests = state.treasures.filter((chest) => !chest.carriedBy).length;
  const seaRouteUseful = !hasLandRouteToTarget(state, player, context.targetCastle);

  const scores: Record<UnitType, number> = {
    soldier:
      42 +
      Math.max(0, 4 - counts.soldier) * 30 +
      Math.max(0, enemySoldiers - counts.soldier) * 15 +
      (unclaimedChests > 0 ? 18 : 0) +
      context.immediateCastleThreats.length * 22,
    catapult:
      38 +
      (counts.catapult === 0 ? 70 : 0) +
      (counts.catapult * 4 < counts.soldier ? 35 : 0) +
      enemySoldiers * 5 +
      context.immediateCastleThreats.length * 18 -
      counts.catapult * 18,
    longboat:
      18 +
      (seaRouteUseful ? 90 : 0) +
      enemyBoats * 24 +
      (counts.longboat === 0 ? 30 : 0) +
      (counts.soldier > counts.longboat * 3 ? 20 : 0) -
      emptyBoats * 90 -
      counts.longboat * 20,
  };

  if (difficulty === "expert") {
    // A third raider is useful reinforcement, but must never delay the first
    // coordinated pair. Prefer enough Soldiers to sustain a second wave.
    if (context.targetCastle && counts.soldier < 7) scores.soldier += 28;

    // Buy siege support against a substantial land force, without filling the
    // courtyard with Catapults that cannot directly capture the castle.
    if (enemySoldiers >= 4 && counts.catapult < 2) scores.catapult += 30;
    if (counts.catapult >= 2) scores.catapult -= 35;

    // Longboats need a real job: establish a missing sea route or answer an
    // enemy fleet. A land campaign with no naval threat should spend elsewhere.
    if (seaRouteUseful && counts.longboat === 0) scores.longboat += 45;
    if (!seaRouteUseful && enemyBoats === 0) scores.longboat -= 45;
  }

  const candidates = (["soldier", "catapult", "longboat"] as UnitType[])
    .filter((type) =>
      UNIT_RULES[type].cost <= player.gold - reserveGold &&
      canBuyUnit(state, player.id, type),
    )
    .map((type) => ({ type, score: scores[type] }))
    .filter((candidate) => candidate.score >= 20)
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));
  if (candidates.length === 0) return undefined;

  const variation = (state.seed ^ (state.round * 2246822519) ^ ownUnits.length * 97) >>> 0;
  if (difficulty === "hard" || difficulty === "expert") return candidates[0]!.type;
  if (difficulty === "normal") {
    return (variation % 5 === 0 ? candidates[Math.min(1, candidates.length - 1)] : candidates[0])!.type;
  }
  const poolSize = difficulty === "easy" ? Math.min(2, candidates.length) : candidates.length;
  return candidates[variation % poolSize]!.type;
}

export function executeAiPurchase(state: GameState, difficulty: Difficulty): boolean {
  const type = chooseAiPurchase(state, difficulty);
  return type ? buyUnit(state, activePlayer(state).id, type) : false;
}

export function describeAiIntent(state: GameState, action: MoveAction): string {
  const unit = state.units.find((candidate) => candidate.id === action.unitId);
  const castle = playerAtCastle(state, action.destination);
  const target = unitAt(state, action.destination);
  const chest = treasureAt(state, action.destination);
  if (unit && carriedTreasure(state, unit.id)) return "is carrying treasure home";
  if (castle && castle.id !== unit?.playerId && unit?.type === "soldier") return "is storming a castle";
  if (chest && unit?.type === "soldier") return "is collecting a treasure chest";
  if (target && target.playerId === unit?.playerId && target.type === "longboat") return "is boarding a longboat";
  if (target && target.playerId !== unit?.playerId) return "is picking a fight";
  if (unit?.type === "catapult") return "is seeking a firing position";
  if (unit?.type === "longboat" && longboatPassengers(state, unit.id).length > 0) return "is ferrying raiders towards enemy shores";
  if (unit && terrainAt(state, action.destination) === "water") return "is patrolling the fjord";
  return "is advancing towards an enemy castle";
}
