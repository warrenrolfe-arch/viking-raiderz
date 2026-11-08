export type Terrain = "land" | "water" | "ice";
export type TurnPhase = "movement" | "purchase";
export type UnitType = "soldier" | "longboat" | "catapult";
export type EventCardFrequency = "off" | "every-turn" | "every-two-turns";
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
  | "axe-shaped-cloud"
  | "man-overboard"
  | "bad-viking"
  | "bandits"
  | "inside-job"
  | "loose-change"
  | "the-deserter"
  | "new-recruit"
  | "wrong-address"
  | "jarls-feast"
  | "sturdy-longboat"
  | "yule-festival"
  | "berserker-rage"
  | "tactical-goat"
  | "helmet-inspection"
  | "high-winds"
  | "shield-wall"
  | "favourable-tide"
  | "forgotten-rations"
  | "missing-spoon"
  | "rune-misread"
  | "missing-boot"
  | "raven-union"
  | "porridge-emergency"
  | "axe-seminar"
  | "jarls-new-hat"
  | "legendary-nap"
  | "suspicious-seagull"
  | "beard-braiding"
  | "herring-debate"
  | "helgas-cabbage"
  | "longhouse-draft"
  | "runic-typo"
  | "viking-yoga"
  | "wrong-saga"
  | "spare-helmet"
  | "fjord-fashion"
  | "taxidermy-workshop"
  | "unhelpful-map"
  | "thors-lost-sock"
  | "quiet-battle-cry"
  | "axe-polishing"
  | "ferocious-duck";
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
  /** Shared Saga Card cadence. Takes precedence over the legacy on/off option. */
  eventCardFrequency?: EventCardFrequency;
  /** Legacy benchmark/test compatibility: true means every turn, false means off. */
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
  /** Saga protection charges; each one saves the next friendly Longboat hit or rammed. */
  sturdyLongboatProtection: number;
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
  /** Wins this unit's next direct Soldier/Veteran clash; castles do not consume or receive the bonus. */
  rage?: boolean;
  /** Absorbs the next Catapult impact on this Soldier or Veteran, then expires. */
  shieldWall?: boolean;
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

/** Serializable board cue used to replay a Saga Card's visible consequence. */
export interface EventEffect {
  kind: "unit" | "gold" | "treasure" | "horn" | "protection" | "benign";
  position: Position;
  label: string;
  unitId?: string;
  entityId?: string;
  from?: Position;
  amount?: number;
  previousPlayerId?: PlayerId;
  /** Complete pre-effect appearance retained until a Saga animation reveals the resolved state. */
  previousUnit?: Unit;
  /** Snapshot retained when the effect removes a unit before presentation begins. */
  removedUnit?: Unit;
  /** Snapshot retained when the effect removes a chest before presentation begins. */
  removedTreasure?: TreasureChest;
}

export interface EventDraw {
  sequence: number;
  cardId: EventCardId;
  playerId: PlayerId;
  outcome: string;
  /** True when the discard pile was returned to the draw pile immediately before this draw. */
  reshuffled?: boolean;
  /** Exact pieces and squares changed, retained for rendering, saves and replays. */
  effects: EventEffect[];
}

/** Serializable computer plan: useful for saves, replays and AI diagnostics. */
export interface AiPlan {
  playerId: PlayerId;
  objective: AiObjective;
  targetPlayerId?: PlayerId;
  createdRound: number;
  retainUntilRound: number;
  roles: Record<string, AiUnitRole>;
  /** Purposeful ferry assignments retained across turns and saves. */
  transportMissions?: Record<string, AiTransportMission>;
  /** Recently completed ferries cannot immediately order their landing party back aboard. */
  transportCooldowns?: Record<string, number>;
}

export interface AiTransportMission {
  boatId: string;
  targetPlayerId: PlayerId;
  crewIds: string[];
  createdRound: number;
  /** Original loading point, used to distinguish waiting from a launched ferry. */
  pickupPosition?: Position;
  departed?: boolean;
}

/** Small, serializable counters used by the end-of-match battle report. */
export interface PlayerBattleStats {
  unitsPurchased: Record<UnitType, number>;
  treasureChestsBanked: number;
  goldBanked: number;
  combatVictories: number;
  unitsLost: number;
  longboatsLost: number;
  longboatsSunk: number;
  catapultShots: number;
  catapultHits: number;
  friendlyFireHits: number;
  castleAttacks: number;
  castlesCaptured: number;
  promotions: number;
  drunkenIncidents: number;
  sagaCardsDrawn: number;
  sturdyLongboatSaves: number;
}

export interface GameState {
  width: number;
  height: number;
  terrain: Terrain[];
  players: Player[];
  units: Unit[];
  treasures: TreasureChest[];
  drinkingHorns: DrinkingHorn[];
  eventCardFrequency: EventCardFrequency;
  /** Compatibility flag derived from eventCardFrequency. */
  eventDeckEnabled: boolean;
  randomStartingPlayer: boolean;
  randomPlayerOrder: boolean;
  winterEnabled: boolean;
  /** Completed round after which the first northern band freezes. */
  winterStartRound: number;
  /** Zero before winter, then one through six as ice advances south. */
  winterPhase: number;
  /** Shared deck: drawn cards move to the discard pile, then are reshuffled. */
  eventDeck: EventCardId[];
  eventDiscard: EventCardId[];
  eventSequence: number;
  /** Total number of completed faction turns, retained for match diagnostics. */
  completedTurns: number;
  /** Per-faction history for the humorous end-of-match battle report. */
  battleStats: Partial<Record<PlayerId, PlayerBattleStats>>;
  lastEvent?: EventDraw;
  aiPlans: Partial<Record<PlayerId, AiPlan>>;
  activePlayerIndex: number;
  /** Every turn commits movement and combat before purchasing begins. */
  turnPhase: TurnPhase;
  /** Monotonic counter ensures a casualty's identifier is never reused. */
  nextUnitSequence: number;
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

