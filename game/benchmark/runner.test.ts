import { describe, expect, it } from "vitest";
import { BENCHMARK_DIFFICULTIES, formatBenchmarkReport, runBenchmark } from "../src/benchmark";
import type { Difficulty } from "../src/types";

describe("computer-versus-computer benchmark", () => {
  it("runs a reproducible difficulty tournament", async () => {
    const environment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const seedsPerPair = Number(environment.VIKING_BENCHMARK_SEEDS ?? 1);
    const maxRounds = Number(environment.VIKING_BENCHMARK_MAX_ROUNDS ?? 60);
    const eventDeckEnabled = environment.VIKING_BENCHMARK_CARDS === "on";
    const winterEnabled = environment.VIKING_BENCHMARK_WINTER === "on";
    const includeSelfMatches = environment.VIKING_BENCHMARK_SELF !== "off";
    const requestedDifficulties = environment.VIKING_BENCHMARK_DIFFICULTIES
      ?.split(",")
      .map((difficulty) => difficulty.trim())
      .filter((difficulty): difficulty is Difficulty => BENCHMARK_DIFFICULTIES.includes(difficulty as Difficulty));
    const difficulties = requestedDifficulties && requestedDifficulties.length > 0
      ? requestedDifficulties
      : BENCHMARK_DIFFICULTIES;
    const report = await runBenchmark({
      difficulties,
      seedsPerPair,
      maxRounds,
      eventDeckEnabled,
      winterEnabled,
      includeSelfMatches,
    });

    console.log(`\n${formatBenchmarkReport(report)}\n`);
    expect(report.matches.length).toBeGreaterThan(0);
    expect(report.rows).toHaveLength(difficulties.length);
    expect(report.rows.every((row) => row.games > 0 && row.turns > 0)).toBe(true);
  }, 1_800_000);
});
