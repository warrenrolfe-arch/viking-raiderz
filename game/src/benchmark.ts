import { createGame } from "./core";
import { executeComputerTurn } from "./simulation";
import type { ComputerTurnSummary } from "./simulation";
import type { Difficulty, GameState, PlayerId, UnitType } from "./types";

export const BENCHMARK_DIFFICULTIES: readonly Difficulty[] = [
  "very-easy",
  "easy",
  "normal",
  "hard",
  "expert",
];

export interface BenchmarkConfig {
  difficulties?: readonly Difficulty[];
  seedsPerPair?: number;
  baseSeed?: number;
  maxRounds?: number;
  eventDeckEnabled?: boolean;
  winterEnabled?: boolean;
  randomStartingPlayer?: boolean;
  randomPlayerOrder?: boolean;
  includeSelfMatches?: boolean;
}

export interface BenchmarkMatchResult {
  seed: number;
  blueDifficulty: Difficulty;
  redDifficulty: Difficulty;
  winnerId?: PlayerId;
  winnerDifficulty?: Difficulty;
  rounds: number;
  stalled: boolean;
}

export interface DifficultyBenchmarkRow {
  difficulty: Difficulty;
  games: number;
  wins: number;
  winRate: number;
  stalled: number;
  averageRounds: number;
  turns: number;
  moves: number;
  combats: number;
  castleAttacks: number;
  castleCaptures: number;
  treasureCollections: number;
  treasureDeposits: number;
  veteranPromotions: number;
  catapultShots: number;
  boatLandings: number;
  boatRams: number;
  purchases: Record<UnitType, number>;
  averageUnitsNearHome: number;
  averageEndingGold: number;
  unusedPurchaseOpportunities: number;
  purchaseBlockedTurns: number;
  turnsAtUnitCap: number;
  transportBoardings: number;
  crewedBoatMoves: number;
  emptyBoatMoves: number;
  transportMissionTurns: number;
  transportAssignedCrew: number;
  transportWaitingTurns: number;
  frozenTransportTurns: number;
  averageLandingDistance: number;
  immediateCastleOpportunities: number;
  missedImmediateCastleOpportunities: number;
  assaultStagingTurns: number;
  stagedRaidersHeld: number;
  assignedRaiders: number;
  assignedDefenders: number;
  targetChanges: number;
  noMoveTurns: number;
}

export interface BenchmarkReport {
  config: Required<BenchmarkConfig>;
  matches: BenchmarkMatchResult[];
  rows: DifficultyBenchmarkRow[];
  colorWins: Record<"blue" | "red" | "stalled", number>;
  elapsedMilliseconds: number;
}

interface MutableRow extends Omit<
  DifficultyBenchmarkRow,
  "winRate" | "averageRounds" | "averageUnitsNearHome" | "averageEndingGold" | "averageLandingDistance"
> {
  totalRounds: number;
  totalUnitsNearHome: number;
  totalEndingGold: number;
  totalLandingDistance: number;
}

function createMutableRow(difficulty: Difficulty): MutableRow {
  return {
    difficulty,
    games: 0,
    wins: 0,
    stalled: 0,
    totalRounds: 0,
    turns: 0,
    moves: 0,
    combats: 0,
    castleAttacks: 0,
    castleCaptures: 0,
    treasureCollections: 0,
    treasureDeposits: 0,
    veteranPromotions: 0,
    catapultShots: 0,
    boatLandings: 0,
    boatRams: 0,
    purchases: { soldier: 0, longboat: 0, catapult: 0 },
    totalUnitsNearHome: 0,
    totalEndingGold: 0,
    unusedPurchaseOpportunities: 0,
    purchaseBlockedTurns: 0,
    turnsAtUnitCap: 0,
    transportBoardings: 0,
    crewedBoatMoves: 0,
    emptyBoatMoves: 0,
    transportMissionTurns: 0,
    transportAssignedCrew: 0,
    transportWaitingTurns: 0,
    frozenTransportTurns: 0,
    totalLandingDistance: 0,
    immediateCastleOpportunities: 0,
    missedImmediateCastleOpportunities: 0,
    assaultStagingTurns: 0,
    stagedRaidersHeld: 0,
    assignedRaiders: 0,
    assignedDefenders: 0,
    targetChanges: 0,
    noMoveTurns: 0,
  };
}

function addTurn(row: MutableRow, turn: ComputerTurnSummary): void {
  row.turns += 1;
  row.moves += turn.moves + turn.drunkMoves;
  row.combats += turn.combats;
  row.castleAttacks += turn.castleAttacks;
  row.castleCaptures += turn.castleCaptures;
  row.treasureCollections += turn.treasureCollections;
  row.treasureDeposits += turn.treasureDeposits;
  row.veteranPromotions += turn.veteranPromotions;
  row.catapultShots += turn.catapultShots;
  row.boatLandings += turn.landings;
  row.boatRams += turn.boatRams;
  row.purchases.soldier += turn.purchases.soldier;
  row.purchases.longboat += turn.purchases.longboat;
  row.purchases.catapult += turn.purchases.catapult;
  row.totalUnitsNearHome += turn.unitsNearHomeAtEnd;
  row.unusedPurchaseOpportunities += turn.unusedPurchaseOpportunities;
  if (turn.purchaseBlockedBySpace) row.purchaseBlockedTurns += 1;
  if (turn.atSoftUnitCap) row.turnsAtUnitCap += 1;
  row.transportBoardings += turn.transportBoardings;
  row.crewedBoatMoves += turn.crewedBoatMoves;
  row.emptyBoatMoves += turn.emptyBoatMoves;
  row.transportMissionTurns += turn.transportMissionTurns;
  row.transportAssignedCrew += turn.transportAssignedCrew;
  row.transportWaitingTurns += turn.transportWaitingTurns;
  row.frozenTransportTurns += turn.frozenTransportTurns;
  row.totalLandingDistance += turn.landingDistanceTotal;
  row.immediateCastleOpportunities += turn.immediateCastleOpportunity;
  row.missedImmediateCastleOpportunities += turn.missedImmediateCastleOpportunity;
  row.assaultStagingTurns += turn.assaultStagingTurn;
  row.stagedRaidersHeld += turn.stagedRaidersHeld;
  row.assignedRaiders += turn.assignedRaiders;
  row.assignedDefenders += turn.assignedDefenders;
  row.targetChanges += turn.targetChanges;
  row.noMoveTurns += turn.noMoveTurn;
}

async function runMatch(
  blueDifficulty: Difficulty,
  redDifficulty: Difficulty,
  seed: number,
  maxRounds: number,
  eventDeckEnabled: boolean,
  randomStartingPlayer: boolean,
  randomPlayerOrder: boolean,
  winterEnabled: boolean,
  rows: Map<Difficulty, MutableRow>,
): Promise<BenchmarkMatchResult> {
  const state: GameState = createGame([
    { id: "blue", controller: blueDifficulty },
    { id: "red", controller: redDifficulty },
  ], seed, { eventDeckEnabled, randomStartingPlayer, randomPlayerOrder, winterEnabled });
  const maximumTurns = maxRounds * state.players.length;
  let turns = 0;
  while (!state.winnerId && state.round <= maxRounds && turns < maximumTurns) {
    const summary = await executeComputerTurn(state);
    addTurn(rows.get(summary.difficulty)!, summary);
    turns += 1;
  }
  const winner = state.winnerId
    ? state.players.find((player) => player.id === state.winnerId)
    : undefined;
  for (const player of state.players) {
    if (player.controller !== "human") rows.get(player.controller)!.totalEndingGold += player.gold;
  }
  return {
    seed,
    blueDifficulty,
    redDifficulty,
    winnerId: state.winnerId,
    winnerDifficulty: winner?.controller === "human" ? undefined : winner?.controller,
    rounds: Math.min(state.round, maxRounds),
    stalled: !state.winnerId,
  };
}

export async function runBenchmark(config: BenchmarkConfig = {}): Promise<BenchmarkReport> {
  const resolved: Required<BenchmarkConfig> = {
    difficulties: config.difficulties ?? BENCHMARK_DIFFICULTIES,
    seedsPerPair: Math.max(1, Math.floor(config.seedsPerPair ?? 1)),
    baseSeed: config.baseSeed ?? 7000,
    maxRounds: Math.max(5, Math.floor(config.maxRounds ?? 60)),
    eventDeckEnabled: config.eventDeckEnabled ?? false,
    winterEnabled: config.winterEnabled ?? false,
    randomStartingPlayer: config.randomStartingPlayer ?? true,
    randomPlayerOrder: config.randomPlayerOrder ?? true,
    includeSelfMatches: config.includeSelfMatches ?? true,
  };
  const rows = new Map(resolved.difficulties.map((difficulty) => [difficulty, createMutableRow(difficulty)]));
  const matches: BenchmarkMatchResult[] = [];
  const started = performance.now();
  let seedOffset = 0;

  for (let first = 0; first < resolved.difficulties.length; first += 1) {
    for (let second = first; second < resolved.difficulties.length; second += 1) {
      if (first === second && !resolved.includeSelfMatches) continue;
      const firstDifficulty = resolved.difficulties[first]!;
      const secondDifficulty = resolved.difficulties[second]!;
      for (let sample = 0; sample < resolved.seedsPerPair; sample += 1) {
        const seed = resolved.baseSeed + seedOffset;
        seedOffset += 1;
        matches.push(await runMatch(
          firstDifficulty,
          secondDifficulty,
          seed,
          resolved.maxRounds,
          resolved.eventDeckEnabled,
          resolved.randomStartingPlayer,
          resolved.randomPlayerOrder,
          resolved.winterEnabled,
          rows,
        ));
        if (firstDifficulty !== secondDifficulty) {
          matches.push(await runMatch(
            secondDifficulty,
            firstDifficulty,
            seed,
            resolved.maxRounds,
            resolved.eventDeckEnabled,
            resolved.randomStartingPlayer,
            resolved.randomPlayerOrder,
            resolved.winterEnabled,
            rows,
          ));
        }
      }
    }
  }

  for (const match of matches) {
    for (const difficulty of [match.blueDifficulty, match.redDifficulty]) {
      const row = rows.get(difficulty)!;
      row.games += 1;
      row.totalRounds += match.rounds;
      if (match.stalled) row.stalled += 1;
    }
    if (match.winnerDifficulty) rows.get(match.winnerDifficulty)!.wins += 1;
  }

  const finalRows = [...rows.values()].map<DifficultyBenchmarkRow>((row) => ({
    difficulty: row.difficulty,
    games: row.games,
    wins: row.wins,
    winRate: row.games === 0 ? 0 : row.wins / row.games,
    stalled: row.stalled,
    averageRounds: row.games === 0 ? 0 : row.totalRounds / row.games,
    turns: row.turns,
    moves: row.moves,
    combats: row.combats,
    castleAttacks: row.castleAttacks,
    castleCaptures: row.castleCaptures,
    treasureCollections: row.treasureCollections,
    treasureDeposits: row.treasureDeposits,
    veteranPromotions: row.veteranPromotions,
    catapultShots: row.catapultShots,
    boatLandings: row.boatLandings,
    boatRams: row.boatRams,
    purchases: { ...row.purchases },
    averageUnitsNearHome: row.turns === 0 ? 0 : row.totalUnitsNearHome / row.turns,
    averageEndingGold: row.games === 0 ? 0 : row.totalEndingGold / row.games,
    unusedPurchaseOpportunities: row.unusedPurchaseOpportunities,
    purchaseBlockedTurns: row.purchaseBlockedTurns,
    turnsAtUnitCap: row.turnsAtUnitCap,
    transportBoardings: row.transportBoardings,
    crewedBoatMoves: row.crewedBoatMoves,
    emptyBoatMoves: row.emptyBoatMoves,
    transportMissionTurns: row.transportMissionTurns,
    transportAssignedCrew: row.transportAssignedCrew,
    transportWaitingTurns: row.transportWaitingTurns,
    frozenTransportTurns: row.frozenTransportTurns,
    averageLandingDistance: row.boatLandings === 0 ? 0 : row.totalLandingDistance / row.boatLandings,
    immediateCastleOpportunities: row.immediateCastleOpportunities,
    missedImmediateCastleOpportunities: row.missedImmediateCastleOpportunities,
    assaultStagingTurns: row.assaultStagingTurns,
    stagedRaidersHeld: row.stagedRaidersHeld,
    assignedRaiders: row.assignedRaiders,
    assignedDefenders: row.assignedDefenders,
    targetChanges: row.targetChanges,
    noMoveTurns: row.noMoveTurns,
  }));

  return {
    config: resolved,
    matches,
    rows: finalRows,
    colorWins: {
      blue: matches.filter((match) => match.winnerId === "blue").length,
      red: matches.filter((match) => match.winnerId === "red").length,
      stalled: matches.filter((match) => match.stalled).length,
    },
    elapsedMilliseconds: performance.now() - started,
  };
}

const percentage = (value: number) => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number) => value.toFixed(1);

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const header = [
    "Difficulty | Games | Wins | Win rate | Avg rounds | Stalled | Deposits | S/C/B bought | Shots | Landings | Home crowd | Gold | Unused | Blocked | Cap",
    "-----------|------:|-----:|---------:|-----------:|--------:|---------:|-------------:|------:|---------:|-----------:|-----:|-------:|--------:|---:",
  ];
  const rows = report.rows.map((row) => [
    row.difficulty,
    row.games,
    row.wins,
    percentage(row.winRate),
    decimal(row.averageRounds),
    row.stalled,
    row.treasureDeposits,
    `${row.purchases.soldier}/${row.purchases.catapult}/${row.purchases.longboat}`,
    row.catapultShots,
    row.boatLandings,
    decimal(row.averageUnitsNearHome),
    decimal(row.averageEndingGold),
    row.unusedPurchaseOpportunities,
    row.purchaseBlockedTurns,
    row.turnsAtUnitCap,
  ].join(" | "));
  const transportHeader = [
    "",
    "Transport | Boardings | Crewed moves | Empty moves | Mission turns | Avg assigned | Waiting | Frozen | Avg landing distance",
    "----------|----------:|-------------:|------------:|--------------:|-------------:|--------:|-------:|---------------------:",
  ];
  const transportRows = report.rows.map((row) => [
    row.difficulty,
    row.transportBoardings,
    row.crewedBoatMoves,
    row.emptyBoatMoves,
    row.transportMissionTurns,
    decimal(row.transportMissionTurns === 0 ? 0 : row.transportAssignedCrew / row.transportMissionTurns),
    row.transportWaitingTurns,
    row.frozenTransportTurns,
    decimal(row.averageLandingDistance),
  ].join(" | "));
  const tacticsHeader = [
    "",
    "Tactics | Combats | Castle attacks | Captures | Immediate | Missed | Staging turns | Held raiders | Avg raiders | Avg defenders | Target changes | No-move turns",
    "--------|--------:|---------------:|---------:|----------:|-------:|--------------:|-------------:|------------:|--------------:|---------------:|--------------:",
  ];
  const tacticsRows = report.rows.map((row) => [
    row.difficulty,
    row.combats,
    row.castleAttacks,
    row.castleCaptures,
    row.immediateCastleOpportunities,
    row.missedImmediateCastleOpportunities,
    row.assaultStagingTurns,
    row.stagedRaidersHeld,
    decimal(row.turns === 0 ? 0 : row.assignedRaiders / row.turns),
    decimal(row.turns === 0 ? 0 : row.assignedDefenders / row.turns),
    row.targetChanges,
    row.noMoveTurns,
  ].join(" | "));
  const headToHead = report.config.difficulties.flatMap((first, firstIndex) =>
    report.config.difficulties.slice(firstIndex + 1).map((second) => {
      const matches = report.matches.filter((match) =>
        match.blueDifficulty !== match.redDifficulty &&
        [match.blueDifficulty, match.redDifficulty].includes(first) &&
        [match.blueDifficulty, match.redDifficulty].includes(second),
      );
      const firstWins = matches.filter((match) => match.winnerDifficulty === first).length;
      const secondWins = matches.filter((match) => match.winnerDifficulty === second).length;
      return `${first} vs ${second}: ${firstWins}-${secondWins}${matches.some((match) => match.stalled) ? ` (${matches.filter((match) => match.stalled).length} stalled)` : ""}`;
    }),
  );
  const footer = [
    "",
    `Matches: ${report.matches.length}; cards: ${report.config.eventDeckEnabled ? "on" : "off"}; winter: ${report.config.winterEnabled ? "on" : "off"}; self matches: ${report.config.includeSelfMatches ? "on" : "off"}; random starter: ${report.config.randomStartingPlayer ? "on" : "off"}; random order: ${report.config.randomPlayerOrder ? "on" : "off"}; maximum rounds: ${report.config.maxRounds}`,
    `Colour wins — Blue: ${report.colorWins.blue}, Red: ${report.colorWins.red}, stalled: ${report.colorWins.stalled}`,
    `Head-to-head — ${headToHead.join("; ")}`,
    "Economy diagnostics: Gold is average ending gold; Unused is unused purchase opportunities; Blocked is turns with gold but no legal placement; Cap is turns at the 12-unit soft limit.",
    `Elapsed: ${(report.elapsedMilliseconds / 1000).toFixed(2)} seconds`,
  ];
  return [...header, ...rows, ...transportHeader, ...transportRows, ...tacticsHeader, ...tacticsRows, ...footer].join("\n");
}
