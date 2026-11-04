import { describe, expect, it } from "vitest";
import { formatBenchmarkReport, runBenchmark } from "../src/benchmark";

describe("computer-versus-computer benchmark", () => {
  it("runs a reproducible difficulty tournament", async () => {
    const environment = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const seedsPerPair = Number(environment.VIKING_BENCHMARK_SEEDS ?? 1);
    const maxRounds = Number(environment.VIKING_BENCHMARK_MAX_ROUNDS ?? 60);
    const eventDeckEnabled = environment.VIKING_BENCHMARK_CARDS === "on";
    const report = await runBenchmark({ seedsPerPair, maxRounds, eventDeckEnabled });

    console.log(`\n${formatBenchmarkReport(report)}\n`);
    expect(report.matches.length).toBeGreaterThan(0);
    expect(report.rows).toHaveLength(5);
    expect(report.rows.every((row) => row.games > 0 && row.turns > 0)).toBe(true);
  }, 600_000);
});
