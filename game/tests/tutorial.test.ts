import { describe, expect, it } from "vitest";
import {
  buyUnit,
  completeManoeuvres,
  disembarkSoldier,
  endTurn,
  fireCatapult,
  getLegalMoves,
  moveUnit,
} from "../src/core";
import { TUTORIAL_LESSONS, createTutorialGame } from "../src/tutorial";

function hasMove(state: ReturnType<typeof createTutorialGame>, unitId: string, x: number, y: number): boolean {
  return getLegalMoves(state, unitId).some((position) => position.x === x && position.y === y);
}

describe("interactive tutorial scenarios", () => {
  it("provides seven isolated lessons with Saga Cards and Winter disabled", () => {
    expect(TUTORIAL_LESSONS).toHaveLength(7);
    for (const lesson of TUTORIAL_LESSONS) {
      const state = createTutorialGame(lesson.id);
      expect(state.eventCardFrequency).toBe("off");
      expect(state.winterEnabled).toBe(false);
      expect(state.activePlayerIndex).toBe(0);
      expect(state.players).toHaveLength(3);
    }
  });

  it("uses the real movement and Drinking Horn rules", () => {
    const movement = createTutorialGame("movement");
    expect(hasMove(movement, "tutorial-mover", 11, 12)).toBe(true);
    expect(moveUnit(movement, "tutorial-mover", { x: 11, y: 12 })).toBe(true);

    const drinking = createTutorialGame("drunkenness");
    expect(moveUnit(drinking, "tutorial-drinker", { x: 12, y: 12 })).toBe(true);
    expect(drinking.units.find((unit) => unit.id === "tutorial-drinker")?.drunk).toBe(true);
    expect(drinking.drinkingHorns).toHaveLength(0);
  });

  it("supports boarding, a nine-square Longboat move and chosen disembarkation", () => {
    const state = createTutorialGame("longboats");
    expect(moveUnit(state, "tutorial-sailor", { x: 8, y: 11 })).toBe(true);
    expect(state.units.find((unit) => unit.id === "tutorial-sailor")?.embarkedOn).toBe("tutorial-boat");
    expect(moveUnit(state, "tutorial-boat", { x: 17, y: 11 })).toBe(true);
    expect(disembarkSoldier(state, "tutorial-boat", { x: 17, y: 10 }, "tutorial-sailor")).toBe(true);
  });

  it("opens the immediate firing window after Catapult movement", () => {
    const state = createTutorialGame("catapults");
    expect(moveUnit(state, "tutorial-catapult", { x: 11, y: 12 })).toBe(true);
    expect(state.units.find((unit) => unit.id === "tutorial-catapult")?.pendingFireAfterMove).toBe(true);
    expect(fireCatapult(state, "tutorial-catapult", { x: 20, y: 12 })).toBe(true);
    expect(state.units.find((unit) => unit.id === "tutorial-catapult")?.fired).toBe(true);
  });

  it("gives the combat and castle demonstrations fixed successful outcomes", () => {
    const combat = createTutorialGame("combat");
    expect(moveUnit(combat, "tutorial-attacker", { x: 12, y: 12 })).toBe(true);
    expect(combat.units.some((unit) => unit.id === "tutorial-defender")).toBe(false);
    expect(combat.units.find((unit) => unit.id === "tutorial-attacker")?.veteran).toBe(true);

    const siege = createTutorialGame("castles");
    expect(moveUnit(siege, "tutorial-sieger", { x: 26, y: 6 })).toBe(true);
    expect(siege.players.find((player) => player.id === "red")?.eliminated).toBe(true);
  });

  it("demonstrates the committed purchase phase with real economy rules", () => {
    const state = createTutorialGame("purchasing");
    expect(completeManoeuvres(state)).toBe(true);
    expect(buyUnit(state, "blue", "soldier")).toBe(true);
    expect(state.players.find((player) => player.id === "blue")?.gold).toBe(8);
    expect(endTurn(state)).toBe(true);
    expect(state.completedTurns).toBe(1);
  });
});
