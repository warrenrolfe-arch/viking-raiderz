import { describe, expect, it } from "vitest";
import { createGame } from "../src/core";
import {
  HALL_COUNTRIES,
  formatHallTimestamp,
  hallQualificationFor,
  isHallCountryCode,
} from "../src/hallOfLegends";

function qualifyingGame() {
  const state = createGame([
    { id: "blue", controller: "human" },
    { id: "red", controller: "expert" },
    { id: "pink", controller: "expert" },
    { id: "green", controller: "expert" },
  ], 42, {
    eventCardFrequency: "every-two-turns",
    winterEnabled: true,
    randomStartingPlayer: true,
    randomPlayerOrder: true,
  });
  state.winnerId = "blue";
  state.completedTurns = 37;
  state.round = 10;
  return state;
}

describe("Hall of Legends qualification", () => {
  it("accepts a human victory against three Expert chiefs with the required options", () => {
    expect(hallQualificationFor(qualifyingGame())).toMatchObject({
      winnerId: "blue",
      completedTurns: 37,
      eventCardFrequency: "every-two-turns",
      winterEnabled: true,
    });
  });

  it("rejects the wrong winner, difficulty, Saga frequency or winter setting", () => {
    const computerWinner = qualifyingGame();
    computerWinner.winnerId = "red";
    expect(hallQualificationFor(computerWinner)).toBeUndefined();

    const hardOpponent = qualifyingGame();
    hardOpponent.players.find((player) => player.id === "red")!.controller = "hard";
    expect(hallQualificationFor(hardOpponent)).toBeUndefined();

    const wrongSaga = qualifyingGame();
    wrongSaga.eventCardFrequency = "every-turn";
    expect(hallQualificationFor(wrongSaga)).toBeUndefined();

    const noWinter = qualifyingGame();
    noWinter.winterEnabled = false;
    expect(hallQualificationFor(noWinter)).toBeUndefined();
  });

  it("provides the complete ISO list and compact UTC timestamps", () => {
    expect(HALL_COUNTRIES.length).toBeGreaterThan(240);
    expect(HALL_COUNTRIES.find((country) => country.alpha3 === "GBR")).toMatchObject({
      alpha2: "GB",
      flag: "🇬🇧",
    });
    expect(isHallCountryCode("USA")).toBe(true);
    expect(isHallCountryCode("ZZZ")).toBe(false);
    expect(formatHallTimestamp("2026-11-18T21:45:00.000Z")).toBe("18 NOV 26 · 21:45 UTC");
  });
});
