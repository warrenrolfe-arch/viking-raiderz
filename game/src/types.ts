export type Terrain = "land" | "water" | "ice";
export type UnitType = "soldier" | "longboat" | "catapult";
export type EventCardId =
  | "royal-ransom"
  | "treasure-hunter"
  | "veterans-tale"
  | "sobering-thought"
  | "ale-delivery"
  | "hidden-hoard"
  | "army-upkeep"
  | "harbour-dues"
  | "catapult-repairs"
  | "the-persuader"
  | "called-home"
  | "ravens-counsel"
  | "jarls-beard"
  | "ordinary-rock"
  | "longboat-laundry"
  | "mead-inspector"
  | "axe-shaped-cloud";
export type Difficulty = "very-easy" | "easy" | "normal" | "hard" | "expert";
export type Controller = "human" | Difficulty;
export type PlayerId = "blue" | "red" | "pink" | "green";
export type AiObjective =
  | "defend-castle"
  | "deliver-treasure"
  | "capture-castle"
  | "recover-treasure"
  | "attack-castle"
  | "consolidate";
export type AiUnitRole =
  | "treasure-carrier"
  | "treasure-hunter"
  | "castle-defender"
  | "raider"
  | "transport"
  | "naval-interceptor"
  | "siege-support";

export interface Position {
  x: number;
  y: number;
}

export interface PlayerSetup {
  id: PlayerId;
  controller: Controller | "off";
}

export interface GameOptions {
  /** Whether the shared saga deck is used at the end of turns. */
  eventDeckEnabled?: boolean;
  /** Rotate the fixed turn sequence so a seeded random participating faction begins. */
  randomStartingPlayer?: boolean;
  /** Seeded shuffle of the complete turn sequence; fixed after setup. */
  randomPlayerOrder?: boolean;
  /** Whether the fjord gradually freezes during this match. */
  winterEnabled?: boolean;
}

export interface Player {
  id: PlayerId;
  name: string;
  title: string;
  color: number;
  cssColor: string;
  emblem: string;
  controller: Controller;
  gold: number;
  castle: Position;
  eliminated: boolean;
}

export interface Unit {
  id: string;
  playerId: PlayerId;
  type: UnitType;
  position: Position;
  moved: boolean;
  fired: boolean;
  /** A moved Catapult must use this immediate firing window before any other action. */
  pendingFireAfterMove?: boolean;
  /** Longboats occupy three horizontal squares. */
  facing?: Position;
  /** Soldiers aboard a longboat remain units, but are not present on the board. */
  embarkedOn?: string;
  /** Drunk Soldiers make an uncontrolled opening move each of their owner's turns. */
  drunk?: boolean;
  /** Promotion earned by defeating another Soldier or Veteran in direct combat. */
  veteran?: boolean;
}

export interface TreasureChest {
  id: string;
  value: number;
  position: Position;
  carriedBy?: string;
}

export interface DrinkingHorn {
  id: string;
  position: Position;
}

export interface EventDraw {
  sequence: number;
  cardId: EventCardId;
  playerId: PlayerId;
  outcome: string;
}

/** Serializable computer plan: useful for saves, replays and AI diagnostics. */
export interface AiPlan {
  playerId: PlayerId;
  objective: AiObjective;
  targetPlayerId?: PlayerId;
  createdRound: number;
  retainUntilRound: number;
  roles: Record<string, AiUnitRole>;
}

export interface GameState {
  width: number;
  height: number;
  terrain: Terrain[];
  players: Player[];
  units: Unit[];
  treasures: TreasureChest[];
  drinkingHorns: DrinkingHorn[];
  eventDeckEnabled: boolean;
  randomStartingPlayer: boolean;
  randomPlayerOrder: boolean;
  winterEnabled: boolean;
  /** Completed round after which the first northern band freezes. */
  winterStartRound: number;
  /** Zero before winter, then one through five as ice advances south. */
  winterPhase: number;
  /** Shared deck: drawn cards move to the discard pile, then are reshuffled. */
  eventDeck: EventCardId[];
  eventDiscard: EventCardId[];
  eventSequence: number;
  lastEvent?: EventDraw;
  aiPlans: Partial<Record<PlayerId, AiPlan>>;
  activePlayerIndex: number;
  round: number;
  seed: number;
  winnerId?: PlayerId;
  lastShot?: {
    aimedAt: Position;
    landedAt: Position;
    scatterRadius: number;
  };
  log: string[];
}

export interface MoveAction {
  unitId: string;
  destination: Position;
}

