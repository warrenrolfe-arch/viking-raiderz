import { createGame } from "./core";
import type { GameState, PlayerId, Position, Terrain, Unit, UnitType } from "./types";

export type TutorialLessonId =
  | "movement"
  | "drunkenness"
  | "longboats"
  | "catapults"
  | "combat"
  | "castles"
  | "purchasing";

export interface TutorialLesson {
  id: TutorialLessonId;
  number: number;
  symbol: string;
  title: string;
  summary: string;
  estimatedTime: string;
}

export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {
    id: "movement",
    number: 1,
    symbol: "➜",
    title: "Move Your Vikings",
    summary: "Diagonal movement, the nine-square limit, and forced stops at water, edges and horns.",
    estimatedTime: "about 2 minutes",
  },
  {
    id: "drunkenness",
    number: 2,
    symbol: "🍺",
    title: "Mead and Persuasion",
    summary: "Become drunk, then sober that Viking up by recruiting them from the opposing side.",
    estimatedTime: "about 1 minute",
  },
  {
    id: "longboats",
    number: 3,
    symbol: "⌁",
    title: "Longboat School",
    summary: "Embark, sail with the horizontal hull and choose who disembarks.",
    estimatedTime: "about 2 minutes",
  },
  {
    id: "catapults",
    number: 4,
    symbol: "◆",
    title: "Catapult Practice",
    summary: "Move the two-square weapon, fire immediately and observe its scatter.",
    estimatedTime: "about 1 minute",
  },
  {
    id: "combat",
    number: 5,
    symbol: "⚔",
    title: "A Friendly Disagreement",
    summary: "Start direct combat and see a victorious Viking become a Veteran.",
    estimatedTime: "about 1 minute",
  },
  {
    id: "castles",
    number: 6,
    symbol: "♜",
    title: "Storm the Castle",
    summary: "Attack from beside the walls and witness a castle change hands.",
    estimatedTime: "about 1 minute",
  },
  {
    id: "purchasing",
    number: 7,
    symbol: "◈",
    title: "Spend the Loot",
    summary: "Commit manoeuvres, purchase beside home and finish the turn.",
    estimatedTime: "about 1 minute",
  },
] as const;

const BLUE_CASTLE: Position = { x: 3, y: 20 };
const RED_CASTLE: Position = { x: 28, y: 3 };
const GREEN_CASTLE: Position = { x: 28, y: 20 };

function fillTerrain(state: GameState, terrain: Terrain): void {
  state.terrain = Array.from({ length: state.width * state.height }, () => terrain);
}

function setTerrain(state: GameState, position: Position, terrain: Terrain): void {
  state.terrain[position.y * state.width + position.x] = terrain;
}

function addUnit(
  state: GameState,
  id: string,
  playerId: PlayerId,
  type: UnitType,
  position: Position,
  extras: Partial<Unit> = {},
): Unit {
  const unit: Unit = {
    id,
    playerId,
    type,
    position: { ...position },
    moved: false,
    fired: false,
    facing: type === "longboat" ? { x: 1, y: 0 } : undefined,
    ...extras,
  };
  state.units.push(unit);
  return unit;
}

function baseTutorialState(): GameState {
  const state = createGame([
    { id: "blue", controller: "human" },
    { id: "red", controller: "human" },
    { id: "green", controller: "human" },
  ], 1, {
    eventCardFrequency: "off",
    randomStartingPlayer: false,
    randomPlayerOrder: false,
    winterEnabled: false,
  });

  fillTerrain(state, "land");
  state.players.find((player) => player.id === "blue")!.castle = { ...BLUE_CASTLE };
  state.players.find((player) => player.id === "red")!.castle = { ...RED_CASTLE };
  state.players.find((player) => player.id === "green")!.castle = { ...GREEN_CASTLE };
  state.units = [];
  state.treasures = [];
  state.drinkingHorns = [];
  state.eventDeck = [];
  state.eventDiscard = [];
  state.lastEvent = undefined;
  state.activePlayerIndex = 0;
  state.turnPhase = "movement";
  state.round = 1;
  state.completedTurns = 0;
  state.nextUnitSequence = 100;
  state.winnerId = undefined;
  state.seed = 1;
  state.log = ["Training ground opened. No actual longhouses were harmed."];
  return state;
}

export function createTutorialGame(lessonId: TutorialLessonId): GameState {
  const state = baseTutorialState();

  switch (lessonId) {
    case "movement":
      addUnit(state, "tutorial-mover", "blue", "soldier", { x: 5, y: 5 });
      for (let x = 16; x <= 20; x += 1) setTerrain(state, { x, y: 20 }, "water");
      state.log = ["Begin the movement course with a diagonal move."];
      break;

    case "drunkenness":
      addUnit(state, "tutorial-drinker", "blue", "soldier", { x: 6, y: 12 });
      addUnit(state, "tutorial-soberer", "red", "soldier", { x: 5, y: 12 });
      state.drinkingHorns = [{ id: "tutorial-horn", position: { x: 12, y: 12 } }];
      state.log = ["A completely unattended horn of mead waits to the east. Another faction is watching closely."];
      break;

    case "longboats":
      for (let y = 11; y <= 14; y += 1) {
        for (let x = 4; x <= 27; x += 1) setTerrain(state, { x, y }, "water");
      }
      addUnit(state, "tutorial-sailor", "blue", "soldier", { x: 8, y: 10 });
      addUnit(state, "tutorial-boat", "blue", "longboat", { x: 8, y: 11 });
      state.log = ["The Longboat can carry up to three Vikings. Begin by boarding one."];
      break;

    case "catapults":
      addUnit(state, "tutorial-catapult", "blue", "catapult", { x: 7, y: 12 });
      addUnit(state, "tutorial-target", "red", "soldier", { x: 20, y: 12 });
      state.log = ["Catapults occupy two horizontal squares and may move up to nine."];
      break;

    case "combat":
      addUnit(state, "tutorial-attacker", "blue", "soldier", { x: 7, y: 12 });
      addUnit(state, "tutorial-defender", "red", "soldier", { x: 12, y: 12 });
      state.seed = 1; // The first 50/50 roll favours the tutorial attacker.
      state.log = ["Move onto the enemy Viking to begin direct combat."];
      break;

    case "castles": {
      const red = state.players.find((player) => player.id === "red")!;
      red.castle = { x: 26, y: 6 };
      addUnit(state, "tutorial-sieger", "blue", "soldier", { x: 20, y: 6 }, { veteran: true });
      addUnit(state, "tutorial-recruit", "red", "soldier", { x: 27, y: 7 });
      state.seed = 1; // The first 45% castle roll succeeds for a clear demonstration.
      state.log = ["The Veteran has reached the enemy stronghold. Attack the castle itself."];
      break;
    }

    case "purchasing":
      state.players.find((player) => player.id === "blue")!.castle = { x: 6, y: 12 };
      state.players.find((player) => player.id === "blue")!.gold = 16;
      // Leave a clear land courtyard plus one three-square water berth. The
      // lesson deliberately fills these spaces as each purchase is made.
      for (let x = 4; x <= 8; x += 1) setTerrain(state, { x, y: 11 }, "water");
      addUnit(state, "tutorial-quartermaster", "blue", "soldier", { x: 9, y: 12 }, { moved: true });
      state.log = ["Commit Viking Manoeuvres, then assemble two Vikings, a Catapult and a Longboat."];
      break;
  }

  return state;
}

