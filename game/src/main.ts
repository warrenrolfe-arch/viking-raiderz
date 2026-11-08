import Phaser from "phaser";
import "./styles.css";
import {
  UNIT_RULES,
  WINTER_PHASES,
  activePlayer,
  buyUnit,
  carriedTreasure,
  catapultScatterRadius,
  canBuyUnit,
  capitalize,
  completeManoeuvres,
  createGame,
  disembarkSoldier,
  endTurn,
  fireCatapult,
  getCatapultFireCells,
  getDisembarkCells,
  getLegalMoves,
  getPendingCatapult,
  longboatPassengers,
  moveUnit,
  playerAtCastle,
  positionKey,
  skipPendingCatapultFire,
  terrainAt,
  unitAt,
  unitFootprint,
} from "./core";
import { executeComputerTurn, executeDrunkOpeningMoves } from "./simulation";
import {
  CASTLE_ASSAULT_DURATION_MS,
  captureMovementContext,
  completeMovementPresentation,
  type ArrivalKind,
  type MovementPresentation,
} from "./movementPresentation";
import {
  captureShotContext,
  completeShotPresentation,
  type ImpactKind,
  type ShotPresentation,
} from "./shotPresentation";
import {
  BATTLE_HORN_CEREMONY_HOLD_MS,
  BATTLE_HORN_DURATION_MS,
  playCatapultFlight,
  playCatapultImpact,
  playCatapultDestroyed,
  playBattleHorn,
  playCastleAssaultCheer,
  playDirectCombatOutcome,
  playDrunkHic,
  playGoldBanked,
  playShipSinking,
  playSoberingUp,
  playWinterWind,
  primeAudio,
  setMusicEnabled,
  setSoundEffectsEnabled,
  startBattleReportMusic,
  startMenuMusic,
  stopBattleReportMusic,
  stopMenuMusic,
} from "./audio";
import type { Controller, EventCardId, EventDraw, EventEffect, GameState, PlayerId, PlayerSetup, Position, TreasureChest, Unit, UnitType } from "./types";

const PLAYER_OPTIONS: Array<{
  id: PlayerId;
  name: string;
  title: string;
  color: string;
  defaultController: Controller | "off";
}> = [
  { id: "blue", name: "Blue", title: "Astrid the Audacious", color: "#2d6cdf", defaultController: "human" },
  { id: "red", name: "Red", title: "Ragnar the Reasonably Cross", color: "#e34d44", defaultController: "normal" },
  { id: "pink", name: "Pink", title: "Freya the Fearsome-ish", color: "#d94f9d", defaultController: "off" },
  { id: "green", name: "Green", title: "Leif the Loud", color: "#3d9b63", defaultController: "off" },
];

const setup = requireElement<HTMLElement>("setup");
const gameShell = requireElement<HTMLElement>("game-shell");
const heritageNote = requireElement<HTMLElement>("heritage-note");
const slots = requireElement<HTMLElement>("player-slots");
const setupMessage = requireElement<HTMLElement>("setup-message");
const aiPaceSelect = requireElement<HTMLSelectElement>("ai-pace");
const eventCardFrequencySelect = requireElement<HTMLSelectElement>("event-card-frequency");
const randomStartingPlayerToggle = requireElement<HTMLInputElement>("random-starting-player");
const randomPlayerOrderToggle = requireElement<HTMLInputElement>("random-player-order");
const soundEffectsToggle = requireElement<HTMLInputElement>("sound-effects-enabled");
const musicToggle = requireElement<HTMLInputElement>("music-enabled");
const winterToggle = requireElement<HTMLInputElement>("winter-enabled");
const startButton = requireElement<HTMLButtonElement>("start-game");
const mapPreview = requireElement<HTMLElement>("map-preview");
const redrawMapButton = requireElement<HTMLButtonElement>("redraw-map");
const acceptMapButton = requireElement<HTMLButtonElement>("accept-map");
const hornCeremony = requireElement<HTMLElement>("horn-ceremony");
const sagaTable = requireElement<HTMLElement>("saga-table");
const sagaDrawPile = requireElement<HTMLElement>("saga-draw-pile");
const sagaDrawState = requireElement<HTMLElement>("saga-draw-state");
const sagaCurrentSlot = requireElement<HTMLElement>("saga-current-slot");
const sagaCurrentSymbol = requireElement<HTMLElement>("saga-current-symbol");
const sagaCurrentTitle = requireElement<HTMLElement>("saga-current-title");
const sagaCurrentDrawer = requireElement<HTMLElement>("saga-current-drawer");
const sagaCurrentDetail = requireElement<HTMLElement>("saga-current-detail");
const sagaDiscardPile = requireElement<HTMLElement>("saga-discard-pile");
const sagaDiscardSymbol = requireElement<HTMLElement>("saga-discard-symbol");
const sagaDiscardState = requireElement<HTMLElement>("saga-discard-state");
const humanTurnAnnouncement = requireElement<HTMLElement>("human-turn-announcement");
const humanTurnTitle = requireElement<HTMLElement>("human-turn-title");
const humanTurnCopy = requireElement<HTMLElement>("human-turn-copy");
const endTurnButton = requireElement<HTMLButtonElement>("end-turn");
const newGameButton = requireElement<HTMLButtonElement>("new-game");
const roundLabel = requireElement<HTMLElement>("round-label");
const turnBadge = requireElement<HTMLElement>("turn-badge");
const activeChief = requireElement<HTMLElement>("active-chief");
const goldValue = requireElement<HTMLElement>("gold-value");
const selectedUnitLabel = requireElement<HTMLElement>("selected-unit");
const boardHelp = requireElement<HTMLElement>("board-help");
const fireCatapultButton = requireElement<HTMLButtonElement>("fire-catapult");
const skipCatapultFireButton = requireElement<HTMLButtonElement>("skip-catapult-fire");
const boatPassengersPanel = requireElement<HTMLElement>("boat-passengers");
const gameLog = requireElement<HTMLOListElement>("game-log");
const eventReveal = requireElement<HTMLElement>("event-reveal");
const eventCard = requireElement<HTMLElement>("event-card");
const eventSymbol = requireElement<HTMLElement>("event-symbol");
const eventTitle = requireElement<HTMLElement>("event-title");
const eventDescription = requireElement<HTMLElement>("event-description");
const eventOutcome = requireElement<HTMLElement>("event-outcome");
const eventDeckCount = requireElement<HTMLElement>("event-deck-count");
const eventContinueButton = requireElement<HTMLButtonElement>("event-continue");
const battleReport = requireElement<HTMLElement>("battle-report");
const battleReportTitle = requireElement<HTMLElement>("battle-report-title");
const battleReportSubtitle = requireElement<HTMLElement>("battle-report-subtitle");
const battleReportSummary = requireElement<HTMLElement>("battle-report-summary");
const battleReportFactions = requireElement<HTMLTableSectionElement>("battle-report-factions");
const battleReportAwardList = requireElement<HTMLElement>("battle-report-award-list");
const viewBattleReportButton = requireElement<HTMLButtonElement>("view-battle-report");
const reviewBattlefieldButton = requireElement<HTMLButtonElement>("review-battlefield");
const reportNewGameButton = requireElement<HTMLButtonElement>("report-new-game");
const buyMeadButton = requireElement<HTMLButtonElement>("buy-mead");
const longhouseModal = requireElement<HTMLElement>("longhouse-modal");
const longhouseTitle = requireElement<HTMLElement>("longhouse-title");
const longhouseSubtitle = requireElement<HTMLElement>("longhouse-subtitle");
const longhouseEyebrow = requireElement<HTMLElement>("longhouse-eyebrow");
const longhouseSeal = requireElement<HTMLElement>("longhouse-seal");
const closeLonghouseButton = requireElement<HTMLButtonElement>("close-longhouse");
const feedbackForm = requireElement<HTMLFormElement>("feedback-form");
const feedbackName = requireElement<HTMLInputElement>("feedback-name");
const feedbackEmail = requireElement<HTMLInputElement>("feedback-email");
const feedbackCategory = requireElement<HTMLSelectElement>("feedback-category");
const feedbackMessage = requireElement<HTMLTextAreaElement>("feedback-message");
const feedbackStatus = requireElement<HTMLElement>("feedback-status");
const purchaseButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".purchase-button"));
const longhouseOpenButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-longhouse-page]"));
const longhousePages = Array.from(document.querySelectorAll<HTMLElement>("[data-longhouse-content]"));

type LonghousePage = "instructions" | "acknowledgements" | "feedback";

const LONGHOUSE_PAGE_COPY: Record<LonghousePage, { title: string; subtitle: string; eyebrow: string; seal: string }> = {
  instructions: {
    title: "Game Instructions",
    subtitle: "Everything required to raid responsibly. More or less.",
    eyebrow: "Advice from the war council",
    seal: "ᚱ",
  },
  acknowledgements: {
    title: "Acknowledgements",
    subtitle: "The names behind the axes, music, mead and magnificent nonsense.",
    eyebrow: "A toast from the longhouse",
    seal: "✦",
  },
  feedback: {
    title: "Feedback Form",
    subtitle: "Reports of bugs, battles and brilliant Saga Cards are welcome.",
    eyebrow: "The raven is taking notes",
    seal: "✉",
  },
};

let longhousePreviousFocus: HTMLElement | undefined;

function openLonghousePage(page: LonghousePage): void {
  const copy = LONGHOUSE_PAGE_COPY[page];
  longhousePreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  longhouseTitle.textContent = copy.title;
  longhouseSubtitle.textContent = copy.subtitle;
  longhouseEyebrow.textContent = copy.eyebrow;
  longhouseSeal.textContent = copy.seal;
  for (const section of longhousePages) section.hidden = section.dataset.longhouseContent !== page;
  longhouseModal.hidden = false;
  longhouseModal.scrollTop = 0;
  longhouseTitle.focus();
}

function closeLonghouse(): void {
  longhouseModal.hidden = true;
  longhousePreviousFocus?.focus();
  longhousePreviousFocus = undefined;
}

let gameState: GameState | undefined;
let phaserGame: Phaser.Game | undefined;
let boardScene: BoardScene | undefined;
let selectedUnitId: string | undefined;
let selectedPassengerId: string | undefined;
let interactionMode: "move" | "fire" | "disembark" = "move";
let aiRunning = false;
let drunkMoveRunning = false;
let movementRunning = false;
/** Conceals a castle battle's already-resolved rules outcome until its suspense animation ends. */
let castleAssaultRunning = false;
let concealedCastleLog: string[] | undefined;
let winterAnnouncementRunning = false;
let humanTurnAnnouncementRunning = false;
let announcedHumanTurnKey: string | undefined;
let sagaEffectRunning = false;
let presentedWinterPhase = 0;
let dismissedEventSequence: number | undefined;
let soundedEventSequence: number | undefined;
let autoSagaEventSequence: number | undefined;
let autoSagaTimer: number | undefined;
let sagaDrawAnimationSequence: number | undefined;
let sagaDrawReadySequence: number | undefined;
let sagaDiscardAnimationSequence: number | undefined;
let presentedBattleReportFor: PlayerId | undefined;
let openingHornRunning = false;
let openingHornSequence = 0;
/** Human matches pause here so the player can reject an unappealing fjord before play. */
let mapPreviewActive = false;

const EVENT_PRESENTATION: Record<EventCardId, { title: string; description: string; symbol: string; color: string }> = {
  "royal-ransom": {
    title: "Royal Ransom",
    description: "A very official-looking messenger arrives with a very unofficial bag of gold.",
    symbol: "✦",
    color: "#d99b28",
  },
  "treasure-hunter": {
    title: "Treasure Hunter",
    description: "A sharp-eyed scout has found a way to make an existing chest more valuable.",
    symbol: "▣",
    color: "#c37a36",
  },
  "veterans-tale": {
    title: "Veteran’s Tale",
    description: "A stirring tale of glory convinces one Viking to grow a little more fearsome.",
    symbol: "⚔",
    color: "#b34d42",
  },
  "sobering-thought": {
    title: "Sobering Thought",
    description: "A cold splash of fjord water restores somebody’s better judgement.",
    symbol: "☀",
    color: "#4c9ec4",
  },
  "ale-delivery": {
    title: "Ale Delivery",
    description: "A suspiciously well-timed drinking horn appears near the opposition.",
    symbol: "⚑",
    color: "#8c5d2f",
  },
  "hidden-hoard": {
    title: "Hidden Hoard",
    description: "A modest chest turns up well away from home—somebody will have to fetch it.",
    symbol: "▣",
    color: "#e0a433",
  },
  "army-upkeep": {
    title: "Army Upkeep",
    description: "Axes need sharpening, helmets need polishing, and somebody has sent an invoice.",
    symbol: "⚒",
    color: "#7b6150",
  },
  "harbour-dues": {
    title: "Harbour Dues",
    description: "The harbour master has noticed your Longboats. Unfortunately, so has their ledger.",
    symbol: "⚓",
    color: "#377c9e",
  },
  "catapult-repairs": {
    title: "Catapult Repairs",
    description: "Ropes fray, beams creak, and the repair crew expects payment before lunch.",
    symbol: "⚙",
    color: "#966541",
  },
  "the-persuader": {
    title: "The Persuader",
    description: "An unusually convincing Viking makes nearby rivals reconsider their employment.",
    symbol: "☍",
    color: "#7b4aa1",
  },
  "called-home": {
    title: "Called Home",
    description: "A Viking receives an urgent message and takes the scenic underground route home.",
    symbol: "↟",
    color: "#466f52",
  },
  "ravens-counsel": {
    title: "Raven's Counsel",
    description: "A thoughtful raven has advice. Sadly, it is keeping the important parts to itself.",
    symbol: "♢",
    color: "#4d5264",
  },
  "jarls-beard": {
    title: "The Jarl's Beard",
    description: "A magnificent beard receives an even more magnificent amount of attention.",
    symbol: "≈",
    color: "#7d5a3d",
  },
  "ordinary-rock": {
    title: "A Perfectly Ordinary Rock",
    description: "It has no strategic value whatsoever, but it is a very dependable rock.",
    symbol: "●",
    color: "#73746d",
  },
  "longboat-laundry": {
    title: "Longboat Laundry",
    description: "Socks and sails flutter together. Morale is unaffected, but the smell improves.",
    symbol: "〰",
    color: "#6b97b7",
  },
  "mead-inspector": {
    title: "The Mead Inspector",
    description: "The official verdict is 'adequately meady'. No further paperwork is required.",
    symbol: "◒",
    color: "#b27a37",
  },
  "axe-shaped-cloud": {
    title: "Axe-Shaped Cloud",
    description: "A cloud looks alarmingly axe-like, then continues harmlessly across the sky.",
    symbol: "☁",
    color: "#8299ad",
  },
  "man-overboard": {
    title: "Man Overboard",
    description: "A sudden lurch, a startled splash, and one fewer Viking aboard a crewed Longboat.",
    symbol: "≋",
    color: "#287b9f",
  },
  "bad-viking": {
    title: "Bad Viking",
    description: "A Veteran has behaved disgracefully and must hand back the impressive axe badge.",
    symbol: "⇣",
    color: "#9a4d3d",
  },
  "bandits": {
    title: "Bandits!",
    description: "Masked opportunists make off with one unattended treasure chest.",
    symbol: "◆",
    color: "#4c4650",
  },
  "inside-job": {
    title: "Inside Job",
    description: "Half the treasury quietly changes hands. The bookkeeper is suddenly unavailable.",
    symbol: "⇄",
    color: "#8a6b25",
  },
  "loose-change": {
    title: "Loose Change",
    description: "Three coins emerge from beneath a longhall bench, along with a very old turnip.",
    symbol: "●",
    color: "#d6a332",
  },
  "the-deserter": {
    title: "The Deserter",
    description: "One ordinary Viking remembers an urgent appointment somewhere beyond the horizon.",
    symbol: "➜",
    color: "#6f7068",
  },
  "new-recruit": {
    title: "New Recruit",
    description: "An enthusiastic volunteer arrives at the castle with an axe and almost matching boots.",
    symbol: "+",
    color: "#4c9a64",
  },
  "wrong-address": {
    title: "Wrong Address",
    description: "A Drinking Horn is delivered nearby, but emphatically not where anybody ordered it.",
    symbol: "?",
    color: "#b87632",
  },
  "jarls-feast": {
    title: "The Jarl’s Feast",
    description: "The Jarl is hosting dinner. Your contribution is compulsory; your invitation is less certain.",
    symbol: "♨",
    color: "#a65a3f",
  },
  "sturdy-longboat": {
    title: "Sturdy Longboat",
    description: "Extra oak, iron nails, and unreasonable confidence protect the next friendly Longboat under attack.",
    symbol: "⬡",
    color: "#2f8ea4",
  },
  "yule-festival": {
    title: "Yule Festival",
    description: "The mead flows freely. One available Viking from every faction becomes gloriously drunk.",
    symbol: "✺",
    color: "#b44b78",
  },
  "berserker-rage": {
    title: "Berserker Rage",
    description: "One friendly Viking sees red and will win their next direct clash with a Viking or Veteran.",
    symbol: "⚡",
    color: "#d8482e",
  },
  "tactical-goat": {
    title: "The Tactical Goat",
    description: "A remarkably confident goat attends the war council and develops strong opinions about coastlines.",
    symbol: "♑",
    color: "#8a7049",
  },
  "helmet-inspection": {
    title: "Helmet Inspection",
    description: "The army's helmets face a rigorous inspection by somebody wearing a suspiciously practical cooking pot.",
    symbol: "⌒",
    color: "#73848f",
  },
  "high-winds": {
    title: "High Winds",
    description: "A fierce gust catches a friendly Longboat and blows it one to three squares off course.",
    symbol: "≋",
    color: "#5b9fbd",
  },
  "shield-wall": {
    title: "Shield Wall",
    description: "One friendly Viking locks shields and will survive the next Catapult impact.",
    symbol: "⬟",
    color: "#497aa3",
  },
  "favourable-tide": {
    title: "Favourable Tide",
    description: "A helpful current carries a friendly Longboat safely toward the nearest enemy castle.",
    symbol: "≈",
    color: "#318eac",
  },
  "forgotten-rations": {
    title: "Forgotten Rations",
    description: "Somebody left lunch at home. Replacements cost up to two gold and several stern looks.",
    symbol: "♨",
    color: "#9b6b3d",
  },
  "missing-spoon": {
    title: "The Missing Spoon",
    description: "The royal spoon has vanished. Suspicion falls unfairly, but inevitably, upon the goat.",
    symbol: "?",
    color: "#80756a",
  },
  "rune-misread": {
    title: "Rune Misread",
    description: "The runes predict glory, fog, and a turnip of unusual strategic importance.",
    symbol: "ᚱ",
    color: "#76639a",
  },
  "missing-boot": {
    title: "The Missing Boot",
    description: "One boot is missing. Its owner assures everyone this makes retreating less likely.",
    symbol: "⌟",
    color: "#8a6f52",
  },
  "raven-union": {
    title: "Raven Union Meeting",
    description: "The ravens demand better seeds, shorter hours, and tiny helmets.",
    symbol: "♢",
    color: "#4d5264",
  },
  "porridge-emergency": {
    title: "Porridge Emergency",
    description: "The porridge is too thick to stir. Three axes are offered. None help.",
    symbol: "◒",
    color: "#bc8340",
  },
  "axe-seminar": {
    title: "Axe Sharpening Seminar",
    description: "An expert explains the sharp end of an axe. Attendance is enthusiastic and unhelpful.",
    symbol: "⚒",
    color: "#816348",
  },
  "jarls-new-hat": {
    title: "The Jarl’s New Hat",
    description: "Very tall, very furry, and entirely unsuitable for battle.",
    symbol: "♛",
    color: "#76543d",
  },
  "legendary-nap": {
    title: "Legendary Nap",
    description: "A warrior sleeps magnificently and gains no tactical insight whatsoever.",
    symbol: "☾",
    color: "#6c7196",
  },
  "suspicious-seagull": {
    title: "Suspicious Seagull",
    description: "It watches the battle with confidence, then steals somebody’s biscuit.",
    symbol: "⌁",
    color: "#7994a4",
  },
  "beard-braiding": {
    title: "Beard Braiding Contest",
    description: "An emergency contest ends in a draw and several knots of diplomacy.",
    symbol: "≈",
    color: "#8b5f3e",
  },
  "herring-debate": {
    title: "The Great Herring Debate",
    description: "The council debates whether herring is a fish or a strategy. No consensus follows.",
    symbol: "<>",
    color: "#5a91a6",
  },
  "helgas-cabbage": {
    title: "Helga’s Cabbage",
    description: "A prize cabbage is inspected and ruled completely irrelevant to the campaign.",
    symbol: "✿",
    color: "#67964c",
  },
  "longhouse-draft": {
    title: "Longhouse Draft",
    description: "Every cloak flaps heroically for a full minute. No plans are altered.",
    symbol: "〰",
    color: "#7b9ab1",
  },
  "runic-typo": {
    title: "Runic Typo",
    description: "The ancient plan says ‘raid at dawnish’. The timetable is politely ignored.",
    symbol: "ᚠ",
    color: "#81679d",
  },
  "viking-yoga": {
    title: "Viking Yoga",
    description: "Downward raven, angry bear, and the forbidden folding Longboat.",
    symbol: "⌘",
    color: "#567b72",
  },
  "wrong-saga": {
    title: "The Wrong Saga",
    description: "The storyteller opens the wrong saga. It is mostly about sheep and a brave spoon.",
    symbol: "☷",
    color: "#a16d54",
  },
  "spare-helmet": {
    title: "Spare Helmet",
    description: "Nobody fits it, but it makes an excellent fruit bowl.",
    symbol: "⌒",
    color: "#73848f",
  },
  "fjord-fashion": {
    title: "Fjord Fashion Week",
    description: "Capes are judged, boots are admired, and no territory changes hands.",
    symbol: "✦",
    color: "#ba668d",
  },
  "taxidermy-workshop": {
    title: "Taxidermy Workshop",
    description: "A souvenir demonstration is unanimously declined after one alarming example.",
    symbol: "✣",
    color: "#89735b",
  },
  "unhelpful-map": {
    title: "The Unhelpful Map",
    description: "Every enemy castle is labelled ‘somewhere over there’.",
    symbol: "⌑",
    color: "#b09361",
  },
  "thors-lost-sock": {
    title: "Thor’s Lost Sock",
    description: "It crackles faintly and smells of thunder. Nobody volunteers to wash it.",
    symbol: "ϟ",
    color: "#6676ae",
  },
  "quiet-battle-cry": {
    title: "The Quiet Battle Cry",
    description: "A stealthy battle cry is rehearsed. Nobody can hear it, including the warband.",
    symbol: "…",
    color: "#798277",
  },
  "axe-polishing": {
    title: "Axe Polishing Day",
    description: "The axes shine so brightly that everyone pauses to admire their eyebrows.",
    symbol: "✧",
    color: "#a78043",
  },
  "ferocious-duck": {
    title: "The Ferocious Duck",
    description: "It patrols the shore. Even the Longboats agree to give it plenty of room.",
    symbol: "◓",
    color: "#779c4d",
  },
};

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element #${id}`);
  return element as T;
}

function blendColor(from: number, to: number, amount: number): number {
  const mix = Phaser.Math.Clamp(amount, 0, 1);
  const channel = (shift: number): number => Math.round(
    ((from >> shift) & 0xff) + (((to >> shift) & 0xff) - ((from >> shift) & 0xff)) * mix,
  );
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function buildSetup(): void {
  slots.innerHTML = "";
  for (const option of PLAYER_OPTIONS) {
    const article = document.createElement("article");
    article.className = "player-slot";
    article.style.setProperty("--faction", option.color);
    const [chiefName, ...epithet] = option.title.split(" ");
    article.innerHTML = `
      <div class="commander-portrait commander-${option.id}" aria-hidden="true"></div>
      <div class="faction-mark" aria-hidden="true"></div>
      <p class="faction-label"><span class="chief-name">${option.name}</span> faction</p>
      <h3 class="chief-title"><span class="chief-title-name">${chiefName}</span><span class="chief-epithet">${epithet.join(" ")}</span></h3>
      <label>
        <span class="sr-only">${option.name} controller</span>
        <select data-player="${option.id}">
          <option value="off">Not playing</option>
          <option value="human">Human — hot seat</option>
          <option value="very-easy">Computer — Very Easy</option>
          <option value="easy">Computer — Easy</option>
          <option value="normal">Computer — Normal</option>
          <option value="hard">Computer — Hard</option>
          <option value="expert">Computer — Expert</option>
        </select>
      </label>
    `;
    const select = article.querySelector("select");
    if (select) select.value = option.defaultController;
    slots.append(article);
  }
}

function readSetups(): PlayerSetup[] {
  return PLAYER_OPTIONS.map((option) => {
    const select = slots.querySelector<HTMLSelectElement>(`select[data-player="${option.id}"]`);
    return { id: option.id, controller: (select?.value ?? "off") as PlayerSetup["controller"] };
  });
}

function validateSetups(): boolean {
  const active = readSetups().filter((item) => item.controller !== "off");
  if (active.length < 2) {
    setupMessage.textContent = "Choose at least two factions. Even Vikings need somebody to disagree with.";
    return false;
  }
  setupMessage.textContent = `${active.length} factions are ready. The insurance paperwork is not.`;
  return true;
}

class BoardScene extends Phaser.Scene {
  private readonly tileSize = 30;
  private readonly offsetX = 0;
  private readonly offsetY = 0;
  private ready = false;
  private hoveredFireCell?: Position;
  private transit?: MovementPresentation & { progress: number };
  private arrival?: { position: Position; kind: ArrivalKind; progress: number };
  private sinkingBoat?: { unit: Unit; progress: number };
  private brokenCatapult?: { unit: Unit; progress: number };
  /** A rules-removed casualty retained visually until the attack reaches it. */
  private pendingCasualty?: Unit;
  private directClash?: NonNullable<MovementPresentation["directClash"]> & { progress: number; from: Position; to: Position };
  private drunkConversion?: NonNullable<MovementPresentation["drunkConversion"]> & { progress: number };
  private castleAssault?: NonNullable<MovementPresentation["castleAssault"]> & { progress: number; from: Position; to: Position };
  /** Keeps a resolved castle in its original colours until its suspense sequence finishes. */
  private concealedCastlePlayerId?: PlayerId;
  /** Keeps recruited survivors in their former colours until Victory is revealed. */
  private concealedCapturedUnits?: Unit[];
  private flyingShot?: ShotPresentation & { progress: number };
  private shotImpact?: ShotPresentation & { progress: number };
  private winterAnnouncementProgress?: number;
  private winterTransition?: { fromPhase: number; toPhase: number; progress: number };
  private sagaEvent?: { event: EventDraw; progress: number };

  constructor() {
    super("BoardScene");
  }

  create(): void {
    this.ready = true;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!gameState || mapPreviewActive || gameState.turnPhase !== "movement" || openingHornRunning || aiRunning || movementRunning || winterAnnouncementRunning || sagaEffectRunning || activePlayer(gameState).controller !== "human" || gameState.winnerId) return;
      const position = this.boardPositionFromPointer(pointer);
      if (!position) return;
      if (position.x < 0 || position.y < 0 || position.x >= gameState.width || position.y >= gameState.height) return;
      handleBoardSelection(position);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!gameState || interactionMode !== "fire" || !selectedUnitId) {
        if (this.hoveredFireCell) {
          this.hoveredFireCell = undefined;
          this.renderBoard();
        }
        return;
      }
      const position = this.boardPositionFromPointer(pointer);
      if (!position) return;
      const legal = getCatapultFireCells(gameState, selectedUnitId).some(
        (cell) => cell.x === position.x && cell.y === position.y,
      );
      const changed =
        this.hoveredFireCell?.x !== position.x || this.hoveredFireCell?.y !== position.y;
      if (changed) {
        this.hoveredFireCell = legal ? position : undefined;
        this.renderBoard();
      }
    });
    this.renderBoard();
  }

  /**
   * Phaser's pointer values can be out of step with the rendered canvas when
   * Windows display scaling or browser zoom changes its CSS size.  Calculate
   * from the browser's measured canvas bounds instead, so the square under
   * the cursor is always the square the game receives.
   */
  private boardPositionFromPointer(pointer: Phaser.Input.Pointer): Position | undefined {
    if (!gameState) return undefined;
    const event = pointer.event as MouseEvent | undefined;
    const bounds = this.game.canvas.getBoundingClientRect();
    if (event && bounds.width > 0 && bounds.height > 0) {
      return {
        x: Math.floor(((event.clientX - bounds.left) * gameState.width) / bounds.width),
        y: Math.floor(((event.clientY - bounds.top) * gameState.height) / bounds.height),
      };
    }
    return {
      x: Math.floor((pointer.x - this.offsetX) / this.tileSize),
      y: Math.floor((pointer.y - this.offsetY) / this.tileSize),
    };
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Conceal already-resolved combat state before updateAll redraws the board. */
  prepareMovement(presentation: MovementPresentation): void {
    if (presentation.castleAssault) {
      this.concealedCastlePlayerId = presentation.castleAssault.castlePlayerId;
      this.concealedCapturedUnits = presentation.capturedUnits;
      this.castleAssault = {
        ...presentation.castleAssault,
        from: presentation.from,
        to: presentation.to,
        progress: 0,
      };
    }
    if (presentation.drunkConversion) {
      this.drunkConversion = { ...presentation.drunkConversion, progress: 0 };
    }
  }

  renderBoard(): void {
    if (!gameState) return;
    this.children.removeAll();
    const graphics = this.add.graphics();
    const legalMoves = new Set(
      selectedUnitId && interactionMode === "move"
        ? getLegalMoves(gameState, selectedUnitId).map(positionKey)
        : [],
    );
    const fireTargets = new Set(
      selectedUnitId && interactionMode === "fire"
        ? getCatapultFireCells(gameState, selectedUnitId).map(positionKey)
        : [],
    );
    const disembarkTargets = new Set(
      selectedUnitId && interactionMode === "disembark"
        ? getDisembarkCells(gameState, selectedUnitId).map(positionKey)
        : [],
    );
    const fromWinterPhase = this.winterTransition?.fromPhase ?? presentedWinterPhase;
    const toWinterPhase = this.winterTransition?.toPhase ?? presentedWinterPhase;
    const winterFade = this.winterTransition?.progress ?? 1;
    const previousSnowLine = Math.ceil((gameState.height * fromWinterPhase) / WINTER_PHASES);
    const nextSnowLine = Math.ceil((gameState.height * toWinterPhase) / WINTER_PHASES);
    const snowLine = Phaser.Math.Linear(previousSnowLine, nextSnowLine, winterFade);

    for (let y = 0; y < gameState.height; y += 1) {
      for (let x = 0; x < gameState.width; x += 1) {
        const position = { x, y };
        const terrain = terrainAt(gameState, position);
        const winterAmount = y < previousSnowLine
          ? 1
          : y < nextSnowLine
            ? winterFade
            : 0;
        const iceAmount = terrain === "ice" ? winterAmount : 0;
        const snowAmount = terrain === "land" ? winterAmount : 0;
        const color = terrain === "ice"
          ? blendColor(0x249fc4, 0xd3eff0, iceAmount)
          : terrain === "water"
            ? 0x249fc4
            : blendColor(0x9bc96b, 0xdde7d7, snowAmount);
        graphics.fillStyle(color, 1);
        graphics.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
        if (terrain === "water" || (terrain === "ice" && iceAmount < 1)) {
          const rippleOffset = (x * 11 + y * 7) % 9;
          graphics.fillStyle(0x9ce5ee, 0.48 * (1 - iceAmount));
          graphics.fillRect(x * this.tileSize + 3, y * this.tileSize + 7 + rippleOffset, 11, 2);
          graphics.fillRect(x * this.tileSize + 17, y * this.tileSize + 18 - rippleOffset / 2, 8, 2);
        }
        if (terrain === "ice" && iceAmount > 0) {
          graphics.fillStyle(0xffffff, 0.52 * iceAmount);
          graphics.fillTriangle(x * this.tileSize + 5, y * this.tileSize + 6, x * this.tileSize + 14, y * this.tileSize + 4, x * this.tileSize + 10, y * this.tileSize + 12);
          graphics.lineStyle(1, 0x85c5d2, 0.8 * iceAmount);
          graphics.strokeLineShape(new Phaser.Geom.Line(x * this.tileSize + 18, y * this.tileSize + 7, x * this.tileSize + 23, y * this.tileSize + 19));
        } else if (terrain === "land" && snowAmount > 0) {
          graphics.fillStyle(0xf7fbf4, 0.72 * snowAmount);
          graphics.fillCircle(x * this.tileSize + 7 + ((x + y) % 3) * 8, y * this.tileSize + 8, 2);
          graphics.fillCircle(x * this.tileSize + 20, y * this.tileSize + 21 - ((x * 5 + y) % 8), 1.5);
          graphics.lineStyle(1, 0xa9c3c4, 0.42 * snowAmount);
          graphics.strokeLineShape(new Phaser.Geom.Line(x * this.tileSize + 4, y * this.tileSize + 25, x * this.tileSize + 12, y * this.tileSize + 23));
        } else {
          const tuftOffset = (x * 17 + y * 13) % 16;
          graphics.lineStyle(1, 0x639952, 0.65);
          graphics.strokeLineShape(new Phaser.Geom.Line(x * this.tileSize + 4 + tuftOffset, y * this.tileSize + 23, x * this.tileSize + 7 + tuftOffset, y * this.tileSize + 17));
          graphics.fillStyle(0xe1d875, 0.55);
          graphics.fillCircle(x * this.tileSize + 7 + ((x + y) % 3) * 8, y * this.tileSize + 8 + ((x * 3 + y) % 2) * 12, 1.2);
        }
        graphics.lineStyle(1, terrain === "water" ? 0x7dd4df : terrain === "ice" ? blendColor(0x7dd4df, 0x9bcfd6, iceAmount) : 0x739d55, 0.34);
        graphics.strokeRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
        if (legalMoves.has(positionKey(position))) {
          graphics.fillStyle(0xf4da77, 0.38);
          graphics.fillRect(x * this.tileSize + 2, y * this.tileSize + 2, this.tileSize - 4, this.tileSize - 4);
        }
        if (fireTargets.has(positionKey(position))) {
          graphics.fillStyle(0xff593f, 0.29);
          graphics.fillCircle(
            x * this.tileSize + this.tileSize / 2,
            y * this.tileSize + this.tileSize / 2,
            this.tileSize * 0.42,
          );
        }
        if (disembarkTargets.has(positionKey(position))) {
          graphics.fillStyle(0x8ee5cf, 0.55);
          graphics.fillCircle(
            x * this.tileSize + this.tileSize / 2,
            y * this.tileSize + this.tileSize / 2,
            this.tileSize * 0.35,
          );
        }
      }
    }

    for (const player of gameState.players) {
      const x = player.castle.x * this.tileSize;
      const y = player.castle.y * this.tileSize;
      const visuallyEliminated = player.eliminated && player.id !== this.concealedCastlePlayerId;
      graphics.fillStyle(0x253c3f, 0.18);
      graphics.fillEllipse(x + 16, y + 27, 27, 7);
      graphics.fillStyle(visuallyEliminated ? 0x4f514d : player.color, 1);
      graphics.fillRect(x + 3, y + 11, this.tileSize - 6, this.tileSize - 12);
      graphics.fillRect(x + 4, y + 6, 7, 9);
      graphics.fillRect(x + this.tileSize - 11, y + 6, 7, 9);
      graphics.fillStyle(0xf5e5bd, visuallyEliminated ? 0.3 : 0.9);
      graphics.fillRect(x + 7, y + 16, 4, 5);
      graphics.fillRect(x + 19, y + 16, 4, 5);
      graphics.fillStyle(visuallyEliminated ? 0x4f514d : player.color, 1);
      graphics.fillTriangle(x + 12, y + 5, x + 18, y + 7, x + 12, y + 9);
      graphics.lineStyle(2, 0x4d3a2c, visuallyEliminated ? 0.25 : 0.75);
      graphics.strokeRect(x + 3, y + 11, this.tileSize - 6, this.tileSize - 12);
    }

    const sagaEffects = this.sagaEvent?.event.effects ?? [];
    const appearingTreasureIds = new Set(
      sagaEffects.filter((effect) => effect.kind === "treasure" && effect.entityId).map((effect) => effect.entityId),
    );
    const appearingHornIds = new Set(
      sagaEffects.filter((effect) => effect.kind === "horn" && effect.entityId).map((effect) => effect.entityId),
    );
    const concealedSagaUnitIds = new Set(
      sagaEffects
        .filter((effect) => effect.kind === "unit" && effect.unitId && (effect.from || effect.previousUnit))
        .map((effect) => effect.unitId),
    );

    for (const treasure of gameState.treasures) {
      if (treasure.carriedBy) continue;
      if (!appearingTreasureIds.has(treasure.id)) this.drawTreasure(graphics, treasure);
    }

    for (const horn of gameState.drinkingHorns) {
      if (!appearingHornIds.has(horn.id)) this.drawHorn(graphics, horn.position);
    }

    for (const unit of gameState.units) {
      const hiddenByClash = unit.id === this.directClash?.attacker.id || unit.id === this.directClash?.defender.id;
      const hiddenByCastleAssault = unit.id === this.castleAssault?.attacker.id;
      const hiddenByConversion = unit.id === this.drunkConversion?.attacker.id || unit.id === this.drunkConversion?.defenderAfter.id;
      if (!unit.embarkedOn && unit.id !== this.transit?.unit.id && !hiddenByClash && !hiddenByCastleAssault && !hiddenByConversion && !concealedSagaUnitIds.has(unit.id)) {
        const formerUnit = this.concealedCapturedUnits?.find((candidate) => candidate.id === unit.id);
        this.drawUnit(graphics, formerUnit ? { ...unit, playerId: formerUnit.playerId } : unit);
      }
    }

    if (this.pendingCasualty) this.drawUnit(graphics, this.pendingCasualty);

    if (this.sinkingBoat) this.drawSinkingBoat(graphics, this.sinkingBoat);
    if (this.brokenCatapult) this.drawBrokenCatapult(graphics, this.brokenCatapult);

    if (this.transit) {
      if (this.transit.consumedHorn) {
        const fadeStart = 0.78;
        const alpha = this.transit.progress <= fadeStart
          ? 1
          : Math.max(0, 1 - (this.transit.progress - fadeStart) / (1 - fadeStart));
        this.drawHorn(graphics, this.transit.consumedHorn.position, alpha);
      }
      this.drawTransit(graphics, this.transit);
    }

    if (this.directClash) this.drawDirectClash(graphics, this.directClash);
    if (this.drunkConversion) this.drawDrunkConversion(graphics, this.drunkConversion);
    if (this.castleAssault) this.drawCastleAssault(graphics, this.castleAssault);

    if (this.arrival) {
      this.drawArrival(graphics, this.arrival);
    }

    if (interactionMode === "fire" && this.hoveredFireCell && selectedUnitId) {
      const catapult = gameState.units.find((unit) => unit.id === selectedUnitId);
      if (catapult) {
        const distance = Math.max(
          Math.abs(this.hoveredFireCell.x - catapult.position.x),
          Math.abs(this.hoveredFireCell.y - catapult.position.y),
        );
        const radius = catapultScatterRadius(distance);
        const diameter = radius * 2 + 1;
        graphics.fillStyle(0xff9a5b, 0.06);
        graphics.fillRect(
          (this.hoveredFireCell.x - radius) * this.tileSize,
          (this.hoveredFireCell.y - radius) * this.tileSize,
          diameter * this.tileSize,
          diameter * this.tileSize,
        );
        graphics.lineStyle(3, 0xffc27a, 0.475);
        graphics.strokeRect(
          (this.hoveredFireCell.x - radius) * this.tileSize,
          (this.hoveredFireCell.y - radius) * this.tileSize,
          diameter * this.tileSize,
          diameter * this.tileSize,
        );
      }
    }

    if (this.flyingShot) this.drawFlyingShot(graphics, this.flyingShot);
    if (this.shotImpact) this.drawShotImpact(graphics, this.shotImpact);
    if (this.sagaEvent) this.drawSagaEffects(graphics, this.sagaEvent.event.effects, this.sagaEvent.progress);

    if (selectedUnitId) {
      const selected = gameState.units.find((unit) => unit.id === selectedUnitId);
      if (selected) {
        graphics.lineStyle(3, 0xffed9e, 1);
        for (const cell of unitFootprint(selected)) {
          graphics.strokeRect(
            cell.x * this.tileSize + 2,
            cell.y * this.tileSize + 2,
            this.tileSize - 4,
            this.tileSize - 4,
          );
        }
      }
    }

    if ((presentedWinterPhase > 0 || this.winterTransition) && toWinterPhase < WINTER_PHASES) {
      graphics.lineStyle(3, 0xe9fbff, 0.75);
      graphics.strokeLineShape(new Phaser.Geom.Line(0, snowLine * this.tileSize, gameState.width * this.tileSize, snowLine * this.tileSize));
    }

    if (this.winterAnnouncementProgress !== undefined) {
      this.drawWinterAnnouncement(graphics, this.winterAnnouncementProgress);
    }
  }

  async animateSagaEvent(event: EventDraw, duration = 1_650): Promise<void> {
    this.sagaEvent = { event, progress: 0 };
    await this.animateFor(duration, (progress) => {
      if (this.sagaEvent) this.sagaEvent.progress = Phaser.Math.Easing.Sine.InOut(progress);
      this.renderBoard();
    });
    this.sagaEvent = undefined;
    this.renderBoard();
  }

  private drawTreasure(graphics: Phaser.GameObjects.Graphics, treasure: TreasureChest, alpha = 1): void {
    const x = treasure.position.x * this.tileSize;
    const y = treasure.position.y * this.tileSize;
    graphics.fillStyle(0x4e371e, 0.25 * alpha);
    graphics.fillEllipse(x + 15, y + 25, 19, 5);
    graphics.fillStyle(0x8c5b23, alpha);
    graphics.fillRect(x + 6, y + 13, 18, 11);
    graphics.fillStyle(0xc88432, alpha);
    graphics.fillRect(x + 6, y + 10, 18, 5);
    graphics.lineStyle(2, 0xffdf70, alpha);
    graphics.strokeRect(x + 6, y + 13, 18, 11);
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 15, y + 10, x + 15, y + 24));
    graphics.fillStyle(0xffdf70, alpha);
    graphics.fillCircle(x + 15, y + 14, 3);
  }

  private drawHorn(graphics: Phaser.GameObjects.Graphics, position: Position, alpha = 1): void {
    const x = position.x * this.tileSize;
    const y = position.y * this.tileSize;
    graphics.fillStyle(0x5b3a22, 0.2 * alpha);
    graphics.fillEllipse(x + 15, y + 25, 14, 4);
    graphics.fillStyle(0xe6b64d, alpha);
    graphics.fillRect(x + 11, y + 10, 7, 11);
    graphics.fillTriangle(x + 11, y + 10, x + 18, y + 10, x + 15, y + 5);
    graphics.lineStyle(2, 0x83511f, alpha);
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 18, y + 14, x + 23, y + 18));
    graphics.fillCircle(x + 23, y + 19, 3);
  }

  private drawSagaEffects(graphics: Phaser.GameObjects.Graphics, effects: EventEffect[], progress: number): void {
    if (!gameState) return;
    const visibility = Math.max(0.18, Math.sin(progress * Math.PI));
    const pulse = 10 + Math.sin(progress * Math.PI * 5) * 3 + progress * 16;

    for (const effect of effects) {
      const x = (effect.position.x + 0.5) * this.tileSize;
      const y = (effect.position.y + 0.5) * this.tileSize;
      const positive = (effect.amount ?? 0) >= 0;
      const color = effect.kind === "benign"
        ? 0xdbe6e8
        : effect.kind === "gold" || effect.kind === "treasure"
          ? positive ? 0xffdf70 : 0xff907d
          : effect.kind === "horn"
            ? 0xe6b64d
            : effect.kind === "protection"
              ? 0x7de3f2
            : 0xc9a8ff;

      if (effect.kind === "treasure" && effect.entityId) {
        const treasure = gameState.treasures.find((candidate) => candidate.id === effect.entityId);
        if (treasure) this.drawTreasure(graphics, treasure, Math.min(1, progress * 2.2));
        else if (effect.removedTreasure) {
          this.drawTreasure(graphics, effect.removedTreasure, Math.max(0, 1 - progress));
          graphics.fillStyle(0x30343a, 0.5 * visibility);
          graphics.fillCircle(x, y, 8 + progress * 18);
        }
      } else if (effect.kind === "horn") {
        const hornPosition = effect.from
          ? {
              x: Phaser.Math.Linear(effect.from.x, effect.position.x, Phaser.Math.Easing.Sine.InOut(progress)),
              y: Phaser.Math.Linear(effect.from.y, effect.position.y, Phaser.Math.Easing.Sine.InOut(progress)),
            }
          : effect.position;
        this.drawHorn(graphics, hornPosition, Math.min(1, progress * 2.2));
      } else if (effect.kind === "unit" && effect.unitId) {
        const unit = gameState.units.find((candidate) => candidate.id === effect.unitId);
        if (unit && effect.from) {
          const eased = Phaser.Math.Easing.Sine.InOut(progress);
          const movingPosition = {
            x: Phaser.Math.Linear(effect.from.x, effect.position.x, eased),
            y: Phaser.Math.Linear(effect.from.y, effect.position.y, eased),
          };
          graphics.fillStyle(0xc9a8ff, 0.45 * visibility);
          for (let trail = 1; trail <= 4; trail += 1) {
            const trailProgress = Math.max(0, eased - trail * 0.075);
            graphics.fillCircle(
              (Phaser.Math.Linear(effect.from.x, effect.position.x, trailProgress) + 0.5) * this.tileSize,
              (Phaser.Math.Linear(effect.from.y, effect.position.y, trailProgress) + 0.5) * this.tileSize,
              5 - trail * 0.6,
            );
          }
          this.drawUnit(graphics, { ...unit, position: movingPosition, moved: false });
        } else if (unit && effect.previousUnit && progress < 1) {
          // Rules have already resolved, but the old state stays visible for
          // the whole effect. The final icon/colour appears only on completion.
          this.drawUnit(graphics, { ...effect.previousUnit, moved: false });
        } else if (unit && effect.previousUnit) {
          this.drawUnit(graphics, { ...unit, moved: false });
        } else if (unit && effect.previousPlayerId && progress < 0.55) {
          this.drawUnit(graphics, { ...unit, playerId: effect.previousPlayerId, moved: false }, 1 - progress / 0.55);
        } else if (!unit && effect.removedUnit) {
          if (effect.removedUnit.embarkedOn) {
            const overboardPosition = {
              x: effect.removedUnit.position.x,
              y: effect.removedUnit.position.y + progress * 0.45,
            };
            this.drawUnit(graphics, { ...effect.removedUnit, position: overboardPosition, moved: false }, Math.max(0, 1 - progress));
            graphics.lineStyle(3, 0xc7f1ff, 0.75 * visibility);
            graphics.strokeEllipse(x, y + progress * 10, 20 + progress * 40, 8 + progress * 15);
          } else {
            const deserterPosition = {
              x: effect.removedUnit.position.x + progress * 0.8,
              y: effect.removedUnit.position.y,
            };
            this.drawUnit(graphics, { ...effect.removedUnit, position: deserterPosition, moved: false }, Math.max(0, 1 - progress));
            graphics.fillStyle(0xd6c28a, 0.45 * visibility);
            graphics.fillCircle(x + progress * this.tileSize * 0.55, y + 8, 4 + progress * 7);
          }
        }
      }

      // Older saves may still contain the former benign board cue. The card
      // panel's joke is sufficient; do not cover the battlefield with a
      // redundant "Nothing happens" notification.
      if (effect.kind === "benign") continue;

      graphics.lineStyle(4, color, visibility);
      graphics.strokeCircle(x, y, pulse);
      graphics.lineStyle(2, 0xffffff, visibility * 0.75);
      graphics.strokeCircle(x, y, Math.max(5, pulse - 6));
      this.add.text(x, y - 24 - progress * 16, effect.label, {
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: `#${color.toString(16).padStart(6, "0")}`,
        stroke: "#17323a",
        strokeThickness: 5,
        align: "center",
      }).setOrigin(0.5).setAlpha(visibility).setDepth(45);
    }
  }

  async animateMovement(presentation: MovementPresentation, duration: number): Promise<void> {
    this.concealedCastlePlayerId = presentation.castleAssault?.castlePlayerId;
    this.concealedCapturedUnits = presentation.capturedUnits;
    this.pendingCasualty = presentation.destroyedUnit;
    this.sinkingBoat = undefined;
    // A castle attack has one visual journey, handled by the suspense
    // sequence below. Running the ordinary transit first made the attacker
    // enter the castle and then jump back to charge a second time.
    if (!presentation.castleAssault && !presentation.drunkConversion) {
      this.transit = { ...presentation, progress: 0 };
      await this.animateFor(duration, (progress) => {
        if (this.transit) this.transit.progress = progress;
        this.renderBoard();
      });
      this.transit = undefined;
      this.pendingCasualty = undefined;
      this.renderBoard();
    }

    if (presentation.becameDrunk) playDrunkHic();
    if (presentation.soberedUp && !presentation.drunkConversion) playSoberingUp();
    if (presentation.arrival === "deposit") playGoldBanked();

    if (presentation.directClash) {
      this.directClash = { ...presentation.directClash, from: presentation.from, to: presentation.to, progress: 0 };
      playDirectCombatOutcome(presentation.directClash.attackerWon);
      await this.animateFor(880, (progress) => {
        if (this.directClash) this.directClash.progress = progress;
        this.renderBoard();
      });
      this.directClash = undefined;
      this.renderBoard();
    }

    if (presentation.drunkConversion) {
      this.drunkConversion = { ...presentation.drunkConversion, progress: 0 };
      await this.animateFor(1_350, (progress) => {
        if (this.drunkConversion) this.drunkConversion.progress = progress;
        this.renderBoard();
      });
      this.drunkConversion = undefined;
      playSoberingUp();
      this.renderBoard();
    }

    if (presentation.castleAssault) {
      playCastleAssaultCheer();
      this.castleAssault = {
        ...presentation.castleAssault,
        from: presentation.from,
        to: presentation.to,
        progress: 0,
      };
      await this.animateFor(CASTLE_ASSAULT_DURATION_MS, (progress) => {
        if (this.castleAssault) this.castleAssault.progress = progress;
        this.renderBoard();
      });
      this.castleAssault = undefined;
      castleAssaultRunning = false;
    }

    if (presentation.arrival) {
      if (presentation.castleAssault) {
        // Reveal the fallen castle and recruited survivors on the same frame
        // as the Victory result, never during the suspense sequence.
        this.concealedCastlePlayerId = undefined;
        this.concealedCapturedUnits = undefined;
      }
      if (presentation.arrival === "ship-sunk") playShipSinking();
      else if (presentation.destroyedUnit?.type === "catapult") playCatapultDestroyed();
      else if (presentation.arrival === "castle") playBattleHorn();
      this.sinkingBoat = presentation.sunkUnit
        ? { unit: presentation.sunkUnit, progress: 0 }
        : undefined;
      this.brokenCatapult = presentation.destroyedUnit?.type === "catapult"
        ? { unit: presentation.destroyedUnit, progress: 0 }
        : undefined;
      this.arrival = { position: presentation.to, kind: presentation.arrival, progress: 0 };
      const arrivalDuration = presentation.arrival === "castle"
        ? BATTLE_HORN_DURATION_MS
        : presentation.destroyedUnit?.type === "catapult"
          ? 650
          : Math.min(380, Math.max(170, duration * 0.65));
      await this.animateFor(arrivalDuration, (progress) => {
        if (this.arrival) this.arrival.progress = progress;
        if (this.sinkingBoat) this.sinkingBoat.progress = progress;
        if (this.brokenCatapult) this.brokenCatapult.progress = progress;
        this.renderBoard();
      });
      this.arrival = undefined;
      this.sinkingBoat = undefined;
      this.brokenCatapult = undefined;
      this.renderBoard();
    }
    this.concealedCastlePlayerId = undefined;
    this.concealedCapturedUnits = undefined;
    this.pendingCasualty = undefined;
  }

  async animateShot(presentation: ShotPresentation, duration: number): Promise<void> {
    this.pendingCasualty = presentation.destroyedUnit;
    this.sinkingBoat = undefined;
    playCatapultFlight(duration);
    this.flyingShot = { ...presentation, progress: 0 };
    await this.animateFor(duration, (progress) => {
      if (this.flyingShot) this.flyingShot.progress = progress;
      this.renderBoard();
    });
    this.flyingShot = undefined;
    this.pendingCasualty = undefined;
    playCatapultImpact(presentation.impact, presentation.destroyedUnit);
    if (presentation.impact === "converted") playSoberingUp();
    this.sinkingBoat = presentation.sunkUnit
      ? { unit: presentation.sunkUnit, progress: 0 }
      : undefined;
    this.brokenCatapult = presentation.destroyedUnit?.type === "catapult"
      ? { unit: presentation.destroyedUnit, progress: 0 }
      : undefined;
    this.shotImpact = { ...presentation, progress: 0 };
    const impactDuration = duration < 250 ? 380 : duration < 450 ? 680 : 980;
    await this.animateFor(impactDuration, (progress) => {
      if (this.shotImpact) this.shotImpact.progress = progress;
      if (this.sinkingBoat) this.sinkingBoat.progress = progress;
      if (this.brokenCatapult) this.brokenCatapult.progress = progress;
      this.renderBoard();
    });
    this.shotImpact = undefined;
    this.pendingCasualty = undefined;
    this.sinkingBoat = undefined;
    this.brokenCatapult = undefined;
    this.renderBoard();
  }

  async animateWinterTransition(fromPhase: number, toPhase: number, duration = 1_600): Promise<void> {
    this.winterTransition = { fromPhase, toPhase, progress: 0 };
    this.winterAnnouncementProgress = toPhase === 1 ? 0 : undefined;
    await this.animateFor(duration, (progress) => {
      if (this.winterTransition) this.winterTransition.progress = Phaser.Math.Easing.Sine.InOut(progress);
      if (this.winterAnnouncementProgress !== undefined) this.winterAnnouncementProgress = progress;
      this.renderBoard();
    });
    presentedWinterPhase = toPhase;
    this.winterTransition = undefined;
    this.winterAnnouncementProgress = undefined;
    this.renderBoard();
  }

  private animateFor(duration: number, update: (progress: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number): void => {
        const progress = Math.min(1, (now - startedAt) / Math.max(1, duration));
        update(progress);
        if (progress < 1) window.requestAnimationFrame(tick);
        else resolve();
      };
      window.requestAnimationFrame(tick);
    });
  }

  private drawTransit(
    graphics: Phaser.GameObjects.Graphics,
    transit: MovementPresentation & { progress: number },
  ): void {
    const eased = Phaser.Math.Easing.Sine.InOut(transit.progress);
    const dx = transit.to.x - transit.from.x;
    const dy = transit.to.y - transit.from.y;
    const position = {
      x: Phaser.Math.Linear(transit.from.x, transit.to.x, eased),
      y: Phaser.Math.Linear(transit.from.y, transit.to.y, eased),
    };
    const centreX = (position.x + 0.5) * this.tileSize;
    const centreY = (position.y + 0.5) * this.tileSize;
    const trailX = centreX - Math.sign(dx || 1) * 11;
    const trailY = centreY - Math.sign(dy) * 8;

    if (transit.unit.type === "longboat") {
      graphics.lineStyle(2, 0xd7fbff, 0.75 * (1 - transit.progress * 0.45));
      for (const offset of [-7, 0, 7]) {
        graphics.strokeLineShape(new Phaser.Geom.Line(trailX - 22, trailY + offset, trailX - 5, trailY + offset));
      }
    } else if (transit.unit.type === "catapult") {
      graphics.fillStyle(0x72512f, 0.38);
      for (let index = 0; index < 3; index += 1) {
        graphics.fillCircle(trailX - index * 7, trailY + 8 + (index % 2) * 3, 2.5);
      }
    } else {
      graphics.fillStyle(0xe7d49a, 0.55);
      graphics.fillCircle(trailX, trailY + 9, 3.5);
      graphics.fillCircle(trailX - 7, trailY + 12, 2.3);
      position.y -= Math.abs(Math.sin(transit.progress * Math.PI * 6)) * 0.08;
    }

    this.drawUnit(graphics, { ...transit.unit, position, moved: false });
  }

  private drawArrival(
    graphics: Phaser.GameObjects.Graphics,
    arrival: { position: Position; kind: ArrivalKind; progress: number },
  ): void {
    const labels: Record<ArrivalKind, { text: string; color: number }> = {
      "battle-won": { text: "Victory!", color: 0xffd45c },
      "ship-sunk": { text: "Ship sunk!", color: 0x91e7f7 },
      "sturdy-longboat": { text: "Sturdy Longboat!", color: 0x7de3f2 },
      repelled: { text: "Repelled!", color: 0xff826f },
      converted: { text: "Sobered & joined!", color: 0x9ce5ee },
      castle: { text: "Castle taken!", color: 0xffd45c },
      treasure: { text: "Treasure!", color: 0xffdf70 },
      deposit: { text: "Gold banked!", color: 0xffdf70 },
      boarding: { text: "All aboard!", color: 0x9ce5ee },
      drinking: { text: "Drank the horn!", color: 0xf4c34d },
    };
    const presentation = labels[arrival.kind];
    const x = (arrival.position.x + 0.5) * this.tileSize;
    const y = (arrival.position.y + 0.5) * this.tileSize;
    const alpha = 1 - arrival.progress * 0.8;
    if (arrival.kind === "castle" && gameState) {
      const boardWidth = gameState.width * this.tileSize;
      const boardHeight = gameState.height * this.tileSize;
      const celebrationAlpha = Math.min(1, Math.max(0, (1 - arrival.progress) / 0.25));
      const pulse = 1 + Math.sin(arrival.progress * Math.PI * 8) * 0.035;
      const bannerWidth = 590 * pulse;
      const bannerHeight = 145 * pulse;
      const bannerX = (boardWidth - bannerWidth) / 2;
      const bannerY = boardHeight / 2 - bannerHeight / 2;
      graphics.fillStyle(0x172f3a, 0.78 * celebrationAlpha);
      graphics.fillRect(bannerX, bannerY, bannerWidth, bannerHeight);
      graphics.lineStyle(5, 0xf4c34d, celebrationAlpha);
      graphics.strokeRect(bannerX, bannerY, bannerWidth, bannerHeight);
      graphics.lineStyle(2, 0xfff1ad, celebrationAlpha * 0.85);
      graphics.strokeRect(bannerX + 8, bannerY + 8, bannerWidth - 16, bannerHeight - 16);
      this.add.text(boardWidth / 2, bannerY + 51, "VIKING VICTORY!", {
        fontFamily: "Georgia, serif",
        fontSize: "46px",
        fontStyle: "bold",
        color: "#ffd45c",
        stroke: "#3a1d12",
        strokeThickness: 7,
      }).setOrigin(0.5).setAlpha(celebrationAlpha).setDepth(50);
      this.add.text(boardWidth / 2, bannerY + 100, "A castle has fallen", {
        fontFamily: "Arial, sans-serif",
        fontSize: "20px",
        fontStyle: "bold",
        color: "#fff2c7",
        stroke: "#17323a",
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(celebrationAlpha).setDepth(50);
    }
    graphics.lineStyle(3, presentation.color, alpha);
    graphics.strokeCircle(x, y, 8 + arrival.progress * 18);
    this.add.text(x, y - 19 - arrival.progress * 12, presentation.text, {
      fontFamily: "Arial, sans-serif",
      fontSize: arrival.kind === "castle" ? "18px" : "14px",
      fontStyle: "bold",
      color: `#${presentation.color.toString(16).padStart(6, "0")}`,
      stroke: "#17323a",
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(alpha).setDepth(20);
  }

  private drawDirectClash(
    graphics: Phaser.GameObjects.Graphics,
    clash: NonNullable<MovementPresentation["directClash"]> & { progress: number; from: Position; to: Position },
  ): void {
    const dx = Math.sign(clash.to.x - clash.from.x);
    const dy = Math.sign(clash.to.y - clash.from.y);
    const beat = Math.sin(clash.progress * Math.PI * 5);
    const approach = 0.17 * (1 - Math.min(1, clash.progress * 4));
    const impact = Math.max(0, Math.sin(clash.progress * Math.PI));
    const attackerPosition = {
      x: clash.to.x - dx * (approach + beat * 0.055),
      y: clash.to.y - dy * (approach + beat * 0.055),
    };
    const defenderPosition = {
      x: clash.to.x + dx * (0.12 + beat * 0.04),
      y: clash.to.y + dy * (0.12 + beat * 0.04),
    };
    this.drawUnit(graphics, { ...clash.attacker, position: attackerPosition, moved: false });
    this.drawUnit(graphics, { ...clash.defender, position: defenderPosition, moved: false });

    const x = (clash.to.x + 0.5) * this.tileSize;
    const y = (clash.to.y + 0.5) * this.tileSize;
    const sparkAlpha = Math.max(0, impact * (1 - clash.progress * 0.35));
    graphics.lineStyle(3, 0xffe4a0, sparkAlpha);
    graphics.strokeLineShape(new Phaser.Geom.Line(x - 11, y - 11, x + 11, y + 11));
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 11, y - 11, x - 11, y + 11));
    graphics.fillStyle(0xfff2ba, sparkAlpha);
    graphics.fillCircle(x, y, 3 + impact * 3);
    for (let spark = 0; spark < 6; spark += 1) {
      const angle = (Math.PI * 2 * spark) / 6 + clash.progress * 1.8;
      graphics.fillCircle(x + Math.cos(angle) * (11 + impact * 8), y + Math.sin(angle) * (11 + impact * 8), 1.8);
    }
  }

  private drawDrunkConversion(
    graphics: Phaser.GameObjects.Graphics,
    conversion: NonNullable<MovementPresentation["drunkConversion"]> & { progress: number },
  ): void {
    const progress = conversion.progress;
    const dx = Math.sign(conversion.defenderBefore.position.x - conversion.attacker.position.x);
    const dy = Math.sign(conversion.defenderBefore.position.y - conversion.attacker.position.y);
    // The attacker spends the action but does not occupy the defender's
    // square. A small lunge conveys the scuffle without inventing a move.
    const lunge = Math.sin(progress * Math.PI) * 0.1;
    const attackerPosition = {
      x: conversion.attacker.position.x + dx * lunge,
      y: conversion.attacker.position.y + dy * lunge,
    };
    const defender = progress < 1 ? conversion.defenderBefore : conversion.defenderAfter;
    this.drawUnit(graphics, { ...conversion.attacker, position: attackerPosition, moved: false });
    this.drawUnit(graphics, { ...defender, moved: false });

    const toX = (conversion.defenderBefore.position.x + 0.5) * this.tileSize;
    const toY = (conversion.defenderBefore.position.y + 0.5) * this.tileSize;
    const pulse = Math.max(0, Math.sin(progress * Math.PI));
    // Keep the conversion feedback local to the defender. The previous
    // centre-to-centre connector could span most of the board when a Viking
    // reached a distant drunk opponent, looking like a stray rendering line.
    const scuffleRadius = 7 + pulse * 6;
    graphics.lineStyle(3, 0xffe4a0, 0.72 * pulse);
    graphics.strokeLineShape(new Phaser.Geom.Line(
      toX - scuffleRadius,
      toY - scuffleRadius,
      toX + scuffleRadius,
      toY + scuffleRadius,
    ));
    graphics.strokeLineShape(new Phaser.Geom.Line(
      toX + scuffleRadius,
      toY - scuffleRadius,
      toX - scuffleRadius,
      toY + scuffleRadius,
    ));
    graphics.fillStyle(0xc9a8ff, 0.48 * pulse);
    graphics.fillCircle(toX, toY, 9 + pulse * 13);
    graphics.lineStyle(3, 0xf4c34d, 0.9 * pulse);
    graphics.strokeCircle(toX, toY, 11 + pulse * 12);
  }

  private drawCastleAssault(
    graphics: Phaser.GameObjects.Graphics,
    assault: NonNullable<MovementPresentation["castleAssault"]> & { progress: number; from: Position; to: Position },
  ): void {
    if (!gameState) return;
    const defender = gameState.players.find((player) => player.id === assault.castlePlayerId);
    const progress = assault.progress;
    const dx = Math.sign(assault.to.x - assault.from.x);
    const dy = Math.sign(assault.to.y - assault.from.y);
    const impactPulse = Math.max(0, Math.sin(progress * Math.PI * 6));
    const charge = Phaser.Math.Easing.Sine.Out(Math.min(1, progress / 0.42));
    const lunge = progress < 0.42 ? 0 : impactPulse * 0.1;
    const attackerPosition = {
      x: Phaser.Math.Linear(assault.from.x, assault.attackPosition.x, charge) + dx * lunge,
      y: Phaser.Math.Linear(assault.from.y, assault.attackPosition.y, charge) + dy * lunge,
    };

    // Redraw the still-contested castle over the already-resolved state so the
    // player cannot learn the result until the three-second assault completes.
    const castleX = assault.to.x * this.tileSize;
    const castleY = assault.to.y * this.tileSize;
    const shake = progress > 0.18 ? Math.sin(progress * Math.PI * 18) * 2.2 * impactPulse : 0;
    const drawX = castleX + shake;
    const castleColor = defender?.color ?? 0x6d7370;
    graphics.fillStyle(0x253c3f, 0.24);
    graphics.fillEllipse(drawX + 16, castleY + 27, 29, 8);
    graphics.fillStyle(castleColor, 1);
    graphics.fillRect(drawX + 3, castleY + 11, this.tileSize - 6, this.tileSize - 12);
    graphics.fillRect(drawX + 4, castleY + 6, 7, 9);
    graphics.fillRect(drawX + this.tileSize - 11, castleY + 6, 7, 9);
    graphics.fillStyle(0xf5e5bd, 0.9);
    graphics.fillRect(drawX + 7, castleY + 16, 4, 5);
    graphics.fillRect(drawX + 19, castleY + 16, 4, 5);
    graphics.fillStyle(castleColor, 1);
    graphics.fillTriangle(drawX + 12, castleY + 5, drawX + 18, castleY + 7, drawX + 12, castleY + 9);
    graphics.lineStyle(2, 0x4d3a2c, 0.85);
    graphics.strokeRect(drawX + 3, castleY + 11, this.tileSize - 6, this.tileSize - 12);

    this.drawUnit(graphics, { ...assault.attacker, position: attackerPosition, moved: false });

    const impactX = (assault.to.x + 0.5 - dx * 0.28) * this.tileSize;
    const impactY = (assault.to.y + 0.5 - dy * 0.28) * this.tileSize;
    graphics.lineStyle(3, 0xffe49a, impactPulse);
    graphics.strokeLineShape(new Phaser.Geom.Line(impactX - 10, impactY - 10, impactX + 10, impactY + 10));
    graphics.strokeLineShape(new Phaser.Geom.Line(impactX + 10, impactY - 10, impactX - 10, impactY + 10));
    graphics.fillStyle(0xffd45c, impactPulse * 0.9);
    for (let spark = 0; spark < 7; spark += 1) {
      const angle = (Math.PI * 2 * spark) / 7 + progress * 2;
      graphics.fillCircle(
        impactX + Math.cos(angle) * (8 + impactPulse * 11),
        impactY + Math.sin(angle) * (8 + impactPulse * 11),
        1.5 + impactPulse,
      );
    }

    const boardWidth = gameState.width * this.tileSize;
    const boardHeight = gameState.height * this.tileSize;
    const bannerWidth = Math.min(570, boardWidth - 80);
    const bannerHeight = 94;
    const bannerX = (boardWidth - bannerWidth) / 2;
    const bannerY = boardHeight * 0.42 - bannerHeight / 2;
    const countdown = Math.max(1, 3 - Math.floor(progress * 3));
    const suspenseText = progress < 0.34
      ? "THE ASSAULT BEGINS!"
      : progress < 0.68
        ? "THE WALLS ARE SHAKING…"
        : "VICTORY OR DEFEAT?";
    graphics.fillStyle(0x172f3a, 0.84);
    graphics.fillRect(bannerX, bannerY, bannerWidth, bannerHeight);
    graphics.lineStyle(4, 0xf4c34d, 0.95);
    graphics.strokeRect(bannerX, bannerY, bannerWidth, bannerHeight);
    this.add.text(boardWidth / 2, bannerY + 31, suspenseText, {
      fontFamily: "Georgia, serif",
      fontSize: "30px",
      fontStyle: "bold",
      color: "#ffd45c",
      stroke: "#3a1d12",
      strokeThickness: 6,
    }).setOrigin(0.5).setDepth(50);
    this.add.text(boardWidth / 2, bannerY + 68, `The fate of the castle hangs in the balance…  ${countdown}`, {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: "#fff2c7",
      stroke: "#17323a",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(50);
  }

  private drawFlyingShot(
    graphics: Phaser.GameObjects.Graphics,
    shot: ShotPresentation & { progress: number },
  ): void {
    const startX = (shot.from.x + 1.55) * this.tileSize;
    const startY = (shot.from.y + 0.2) * this.tileSize;
    const endX = (shot.landedAt.x + 0.5) * this.tileSize;
    const endY = (shot.landedAt.y + 0.5) * this.tileSize;
    const distance = Math.max(Math.abs(shot.landedAt.x - shot.from.x), Math.abs(shot.landedAt.y - shot.from.y));
    const arcHeight = 58 + distance * 4;

    const pointAt = (progress: number): { x: number; y: number } => ({
      x: Phaser.Math.Linear(startX, endX, progress),
      y: Phaser.Math.Linear(startY, endY, progress) - Math.sin(progress * Math.PI) * arcHeight,
    });
    for (let index = 4; index >= 1; index -= 1) {
      const trailProgress = Math.max(0, shot.progress - index * 0.025);
      const trail = pointAt(trailProgress);
      graphics.fillStyle(0x755d4c, 0.1 + (4 - index) * 0.08);
      graphics.fillCircle(trail.x, trail.y, 2 + (4 - index) * 0.3);
    }
    const projectile = pointAt(shot.progress);
    graphics.fillStyle(0x17252b, 0.25);
    graphics.fillCircle(projectile.x + 2, projectile.y + 3, 6);
    graphics.fillStyle(0x59606a, 1);
    graphics.fillCircle(projectile.x, projectile.y, 5);
    graphics.lineStyle(1, 0xd6dde0, 0.75);
    graphics.strokeCircle(projectile.x - 1, projectile.y - 1, 4);
  }

  private drawShotImpact(
    graphics: Phaser.GameObjects.Graphics,
    shot: ShotPresentation & { progress: number },
  ): void {
    const labels: Record<ImpactKind, { text: string; color: number }> = {
      "enemy-hit": { text: "Direct hit!", color: 0xffb14f },
      "friendly-hit": { text: "Friendly fire!", color: 0xff6f61 },
      "longboat-hit": { text: "Longboat sunk!", color: 0x91e7f7 },
      "sturdy-longboat": { text: "Sturdy Longboat!", color: 0x7de3f2 },
      "shield-wall": { text: "Shield Wall!", color: 0x8fd4ed },
      castle: { text: "Stonework rattled!", color: 0xffcf70 },
      converted: { text: "Sobered and recruited!", color: 0xc7a3ff },
      water: { text: "Splosh!", color: 0x91e7f7 },
      miss: { text: "Missed!", color: 0xd9c39b },
    };
    const presentation = labels[shot.impact];
    const x = (shot.landedAt.x + 0.5) * this.tileSize;
    const y = (shot.landedAt.y + 0.5) * this.tileSize;
    const fade = 1 - shot.progress * 0.72;
    const burst = Math.min(1, shot.progress * 3.2);

    if (shot.impact === "water") {
      const ripple = 8 + burst * 22;
      graphics.lineStyle(3, 0xd7fbff, 0.82 * fade);
      graphics.strokeCircle(x, y + 4, ripple);
      graphics.lineStyle(2, 0x5bc1e5, 0.65 * fade);
      graphics.strokeCircle(x, y + 4, ripple * 0.58);
      graphics.fillStyle(0xd7fbff, 0.72 * fade);
      for (let drop = 0; drop < 6; drop += 1) {
        const angle = (Math.PI * 2 * drop) / 6;
        graphics.fillCircle(x + Math.cos(angle) * (10 + burst * 12), y - 3 + Math.sin(angle) * (7 + burst * 9), 2.5);
      }
      this.add.text(x, y - 28 - shot.progress * 10, presentation.text, {
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: `#${presentation.color.toString(16).padStart(6, "0")}`,
        stroke: "#17323a",
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(fade).setDepth(25);
      return;
    }

    if (shot.impact === "sturdy-longboat" || shot.impact === "shield-wall") {
      const wardColor = shot.impact === "shield-wall" ? 0x8fd4ed : 0x7de3f2;
      graphics.lineStyle(5, wardColor, 0.9 * fade);
      graphics.strokeCircle(x, y, 12 + burst * 23);
      graphics.lineStyle(2, 0xfff2ba, 0.8 * fade);
      graphics.strokeCircle(x, y, 7 + burst * 14);
      graphics.fillStyle(0xd8fbff, 0.45 * fade);
      graphics.fillCircle(x, y, 7 + burst * 9);
      this.add.text(x, y - 31 - shot.progress * 10, presentation.text, {
        fontFamily: "Arial, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: `#${wardColor.toString(16).padStart(6, "0")}`,
        stroke: "#17323a",
        strokeThickness: 5,
      }).setOrigin(0.5).setAlpha(fade).setDepth(25);
      return;
    }

    // A small irregular crater replaces the old debug-like black X. It forms
    // quickly at the true landing square and fades with the rest of the impact.
    const craterFade = Math.min(1, shot.progress * 7) * Math.max(0, 1 - shot.progress);
    graphics.fillStyle(0x3b2a22, 0.88 * craterFade);
    graphics.fillEllipse(x, y + 3, 23, 13);
    graphics.fillStyle(0x171b1c, 0.72 * craterFade);
    graphics.fillEllipse(x + 1, y + 4, 14, 7);
    graphics.lineStyle(2, 0x8b6542, 0.78 * craterFade);
    graphics.strokeEllipse(x, y + 3, 24, 14);
    graphics.fillStyle(0x6a4a32, 0.72 * craterFade);
    graphics.fillTriangle(x - 13, y + 1, x - 8, y - 5, x - 5, y + 2);
    graphics.fillTriangle(x + 8, y + 1, x + 13, y - 3, x + 11, y + 5);

    graphics.fillStyle(0xffc05c, 0.55 * fade);
    graphics.fillCircle(x, y, 5 + burst * 15);
    graphics.lineStyle(3, 0x6b3522, 0.9 * fade);
    for (let spoke = 0; spoke < 8; spoke += 1) {
      const angle = (Math.PI * 2 * spoke) / 8;
      const inner = 7 + burst * 5;
      const outer = 12 + burst * 17;
      graphics.strokeLineShape(new Phaser.Geom.Line(
        x + Math.cos(angle) * inner,
        y + Math.sin(angle) * inner,
        x + Math.cos(angle) * outer,
        y + Math.sin(angle) * outer,
      ));
    }
    graphics.fillStyle(0x5e6465, 0.48 * fade);
    graphics.fillCircle(x - 9 - burst * 4, y - 5 - burst * 10, 6 + burst * 3);
    graphics.fillCircle(x + 7 + burst * 5, y - 9 - burst * 13, 7 + burst * 4);
    graphics.fillCircle(x + 1, y - 15 - burst * 12, 5 + burst * 5);
    this.add.text(x, y - 28 - shot.progress * 10, presentation.text, {
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
      fontStyle: "bold",
      color: `#${presentation.color.toString(16).padStart(6, "0")}`,
      stroke: "#17323a",
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(fade).setDepth(25);
  }

  private drawWinterAnnouncement(graphics: Phaser.GameObjects.Graphics, progress: number): void {
    if (!gameState) return;
    const visibility = Math.sin(progress * Math.PI);
    const width = gameState.width * this.tileSize;
    const height = gameState.height * this.tileSize;
    graphics.fillStyle(0x173b4c, 0.62 * visibility);
    graphics.fillRect(0, 0, width, height);
    graphics.fillStyle(0xe8fbff, 0.1 * visibility);
    graphics.fillRect(0, 0, width, height * Math.min(1, progress * 1.7));
    graphics.fillStyle(0xffffff, 0.82 * visibility);
    for (let index = 0; index < 44; index += 1) {
      const x = (index * 83 + 41) % width;
      const y = (index * 47 + progress * 260) % height;
      graphics.fillCircle(x, y, 1.5 + (index % 3));
    }
    this.add.text(width / 2, height / 2 - 18, "WINTER IS COMING", {
      fontFamily: "Georgia, serif",
      fontSize: "42px",
      fontStyle: "bold",
      color: "#f4fdff",
      stroke: "#17323a",
      strokeThickness: 7,
    }).setOrigin(0.5).setAlpha(visibility).setDepth(40);
    this.add.text(width / 2, height / 2 + 32, "The fjord freezes from north to south.", {
      fontFamily: "Arial, sans-serif",
      fontSize: "18px",
      color: "#dff8ff",
      stroke: "#17323a",
      strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(visibility).setDepth(40);
  }

  private drawSinkingBoat(
    graphics: Phaser.GameObjects.Graphics,
    sinking: { unit: Unit; progress: number },
  ): void {
    const position = {
      x: sinking.unit.position.x,
      y: sinking.unit.position.y + sinking.progress * 0.32,
    };
    const fade = Math.max(0.08, 1 - sinking.progress * 0.92);
    this.drawUnit(graphics, { ...sinking.unit, position, moved: false }, fade);
    const x = (sinking.unit.position.x + 0.5) * this.tileSize;
    const y = (sinking.unit.position.y + 0.8) * this.tileSize;
    graphics.lineStyle(2, 0xd7fbff, fade * 0.8);
    graphics.strokeEllipse(x, y, 34 + sinking.progress * 55, 9 + sinking.progress * 13);
    graphics.fillStyle(0xd7fbff, fade * 0.75);
    for (let bubble = 0; bubble < 6; bubble += 1) {
      graphics.fillCircle(
        x - 22 + bubble * 9,
        y - sinking.progress * (11 + bubble * 2),
        1.5 + (bubble % 3),
      );
    }
  }

  private drawBrokenCatapult(
    graphics: Phaser.GameObjects.Graphics,
    broken: { unit: Unit; progress: number },
  ): void {
    const x = broken.unit.position.x * this.tileSize;
    const y = broken.unit.position.y * this.tileSize;
    const alpha = Math.max(0.08, 1 - broken.progress * 0.9);
    const settle = Math.min(1, broken.progress * 4);
    graphics.fillStyle(0x2e2924, 0.25 * alpha);
    graphics.fillEllipse(x + 30, y + 26, 50, 8);
    graphics.fillStyle(0x3d2a20, alpha);
    graphics.fillCircle(x + 13, y + 23, 6);
    graphics.fillCircle(x + 46, y + 25, 5);
    graphics.fillStyle(0x8b552b, alpha);
    graphics.fillRect(x + 9, y + 17, 38, 6);
    graphics.fillRect(x + 34, y + 11, 12, 5);
    graphics.lineStyle(4, 0x56321f, alpha);
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 22, y + 20, x + 12, y + 6));
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 28, y + 18, x + 45, y + 4));
    graphics.lineStyle(2, 0xe2b36a, alpha * 0.9);
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 26, y + 13, x + 31, y + 18));
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 31, y + 13, x + 26, y + 18));
    graphics.fillStyle(0x62676b, alpha);
    graphics.fillCircle(x + 53, y + 23, 4);
    graphics.fillCircle(x + 39, y + 28, 3);
    graphics.fillStyle(0x758084, alpha * (1 - settle * 0.35));
    graphics.fillCircle(x + 26, y + 8 - settle * 6, 5 + settle * 2);
    graphics.fillCircle(x + 35, y + 4 - settle * 9, 4 + settle * 2);
    graphics.lineStyle(2, 0xd4f2f2, alpha * 0.8);
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 6, y + 27, x + 20, y + 27));
    graphics.strokeLineShape(new Phaser.Geom.Line(x + 38, y + 29, x + 55, y + 29));
  }

  private drawUnit(graphics: Phaser.GameObjects.Graphics, unit: Unit, alphaOverride?: number): void {
    if (!gameState) return;
    const player = gameState.players.find((candidate) => candidate.id === unit.playerId);
    if (!player) return;
    const x = unit.position.x * this.tileSize;
    const y = unit.position.y * this.tileSize;
    const alpha = alphaOverride ?? (unit.moved ? 0.52 : 1);
    graphics.fillStyle(player.color, alpha);
    graphics.lineStyle(2, 0x283d40, 0.9);

    if (unit.type === "soldier") {
      graphics.fillStyle(0x243b48, alpha);
      graphics.fillEllipse(x + 15, y + 27, 17, 5);
      if (unit.veteran) {
        // Veterans trade the ordinary tunic and shield for a broad bare chest,
        // faction-coloured war paint and an oversized axe silhouette.
        graphics.fillStyle(0xf1c18d, alpha);
        graphics.fillCircle(x + 14, y + 8, 6);
        graphics.fillTriangle(x + 5, y + 25, x + 23, y + 25, x + 14, y + 12);
        graphics.fillRect(x + 8, y + 15, 13, 8);
        graphics.fillStyle(0x8b4d32, alpha);
        graphics.fillTriangle(x + 9, y + 10, x + 19, y + 10, x + 14, y + 16);
        graphics.fillStyle(player.color, alpha);
        graphics.fillRect(x + 7, y + 20, 15, 4);
        graphics.fillRect(x + 8, y + 6, 12, 2);
        graphics.lineStyle(3, 0x573c2a, alpha);
        graphics.strokeLineShape(new Phaser.Geom.Line(x + 20, y + 25, x + 27, y + 5));
        graphics.fillStyle(0xd8e0df, alpha);
        graphics.fillTriangle(x + 23, y + 4, x + 30, y + 1, x + 28, y + 9);
        graphics.fillTriangle(x + 23, y + 4, x + 18, y + 1, x + 20, y + 9);
        graphics.lineStyle(1, 0x39464b, alpha);
        graphics.strokeTriangle(x + 23, y + 4, x + 30, y + 1, x + 28, y + 9);
      } else {
        graphics.fillStyle(0xf1c18d, alpha);
        graphics.fillCircle(x + 15, y + 10, 6);
        // Deliberately playful horned helmets: historical accuracy yields to instant readability.
        graphics.fillStyle(0xf4ead0, alpha);
        graphics.fillTriangle(x + 10, y + 8, x + 4, y + 5, x + 8, y + 12);
        graphics.fillTriangle(x + 20, y + 8, x + 26, y + 5, x + 22, y + 12);
        graphics.fillStyle(0x485565, alpha);
        graphics.fillRect(x + 9, y + 4, 12, 5);
        graphics.fillTriangle(x + 8, y + 9, x + 22, y + 9, x + 15, y + 2);
        graphics.fillStyle(0xd5e0df, alpha);
        graphics.fillRect(x + 13, y + 5, 4, 2);
        graphics.fillStyle(player.color, alpha);
        graphics.fillTriangle(x + 7, y + 26, x + 23, y + 26, x + 15, y + 13);
        graphics.fillCircle(x + 21, y + 20, 5);
        graphics.lineStyle(1, 0xf4e4be, alpha);
        graphics.strokeCircle(x + 21, y + 20, 5);
        graphics.lineStyle(2, 0x573c2a, alpha);
        graphics.strokeLineShape(new Phaser.Geom.Line(x + 9, y + 23, x + 4, y + 10));
      }
      if (unit.drunk) {
        // A large purple-and-gold horn badge keeps drunkenness readable at board scale.
        graphics.fillStyle(0x7c4b9c, alpha);
        graphics.fillCircle(x + 24, y + 6, 6);
        graphics.fillStyle(0xf4c34d, alpha);
        graphics.fillRect(x + 21, y + 4, 5, 6);
        graphics.fillTriangle(x + 21, y + 4, x + 26, y + 4, x + 24, y + 1);
        graphics.lineStyle(1, 0x442755, alpha);
        graphics.strokeCircle(x + 24, y + 6, 6);
        graphics.strokeLineShape(new Phaser.Geom.Line(x + 26, y + 7, x + 29, y + 10));
      }
      if (unit.rage) {
        // A hot red lightning badge keeps the one-use Berserker bonus visible.
        graphics.fillStyle(0xd8482e, alpha);
        graphics.fillCircle(x + 6, y + 6, 6);
        graphics.fillStyle(0xffdf70, alpha);
        graphics.fillTriangle(x + 7, y + 1, x + 3, y + 7, x + 7, y + 7);
        graphics.fillTriangle(x + 5, y + 5, x + 9, y + 5, x + 4, y + 12);
        graphics.lineStyle(1, 0x5f2118, alpha);
        graphics.strokeCircle(x + 6, y + 6, 6);
      }
      if (unit.shieldWall) {
        // A cool blue shield badge marks the one-use Catapult protection.
        graphics.fillStyle(0x497aa3, alpha);
        graphics.fillCircle(x + 6, y + 18, 6);
        graphics.fillStyle(0xd8eff7, alpha);
        graphics.fillPoints([
          new Phaser.Math.Vector2(x + 2, y + 15),
          new Phaser.Math.Vector2(x + 10, y + 15),
          new Phaser.Math.Vector2(x + 9, y + 20),
          new Phaser.Math.Vector2(x + 6, y + 23),
          new Phaser.Math.Vector2(x + 3, y + 20),
        ], true);
        graphics.lineStyle(1, 0x183f59, alpha);
        graphics.strokeCircle(x + 6, y + 18, 6);
      }
      if (carriedTreasure(gameState, unit.id)) {
        graphics.fillStyle(0xf4c95d, 1);
        graphics.fillRect(x + 18, y + 19, 9, 8);
        graphics.lineStyle(1, 0x5b3516, 1);
        graphics.strokeRect(x + 18, y + 19, 9, 8);
      }
    } else if (unit.type === "longboat") {
      const centre = { x: x + 15, y: y + 15 };
      // The hull is intentionally much deeper than the earlier triangular boat,
      // giving it the unmistakable profile of a small Viking longship.
      graphics.fillStyle(0x4f301c, alpha);
      graphics.fillPoints([
        new Phaser.Math.Vector2(centre.x - 40, centre.y + 10),
        new Phaser.Math.Vector2(centre.x - 31, centre.y + 24),
        new Phaser.Math.Vector2(centre.x + 26, centre.y + 24),
        new Phaser.Math.Vector2(centre.x + 40, centre.y + 15),
        new Phaser.Math.Vector2(centre.x + 34, centre.y + 9),
        new Phaser.Math.Vector2(centre.x - 34, centre.y + 8),
      ], true);
      graphics.fillStyle(0xc47a35, alpha);
      graphics.fillRect(centre.x - 33, centre.y + 11, 64, 5);
      graphics.lineStyle(2, 0x352116, alpha);
      graphics.strokeLineShape(new Phaser.Geom.Line(centre.x - 38, centre.y + 10, centre.x + 38, centre.y + 11));
      graphics.strokeLineShape(new Phaser.Geom.Line(centre.x - 29, centre.y + 19, centre.x + 27, centre.y + 20));
      graphics.lineStyle(3, 0x593a24, alpha);
      graphics.strokeLineShape(new Phaser.Geom.Line(centre.x, centre.y - 23, centre.x, centre.y + 11));
      graphics.fillStyle(player.color, alpha);
      graphics.fillTriangle(centre.x + 2, centre.y - 21, centre.x + 24, centre.y - 7, centre.x + 2, centre.y - 4);
      graphics.fillStyle(0xfff5d7, alpha);
      graphics.fillTriangle(centre.x - 2, centre.y - 19, centre.x - 17, centre.y - 8, centre.x - 2, centre.y - 5);
      graphics.fillStyle(player.color, alpha);
      for (const shieldX of [-24, -4, 17]) {
        graphics.fillCircle(centre.x + shieldX, centre.y + 16, 4);
        graphics.lineStyle(1, 0xf5dfb5, alpha);
        graphics.strokeCircle(centre.x + shieldX, centre.y + 16, 4);
      }
      graphics.lineStyle(2, 0x4f301c, alpha);
      graphics.strokeLineShape(new Phaser.Geom.Line(centre.x + 38, centre.y + 11, centre.x + 42, centre.y + 1));
      graphics.strokeCircle(centre.x + 41, centre.y - 1, 4);
      const passengers = longboatPassengers(gameState, unit.id);
      const crew = passengers.length;
      for (let index = 0; index < crew; index += 1) {
        const crewX = centre.x - 18 + index * 18;
        const passenger = passengers[index]!;
        graphics.fillStyle(0xf1c18d, alpha);
        graphics.fillCircle(crewX, centre.y + 6, 4);
        graphics.fillStyle(0x4b5661, alpha);
        graphics.fillRect(crewX - 4, centre.y + 1, 8, 3);
        graphics.fillTriangle(crewX - 5, centre.y + 3, crewX + 5, centre.y + 3, crewX, centre.y - 2);
        graphics.fillStyle(0xf4ead0, alpha);
        graphics.fillTriangle(crewX - 3, centre.y + 3, crewX - 7, centre.y + 1, crewX - 5, centre.y + 5);
        graphics.fillTriangle(crewX + 3, centre.y + 3, crewX + 7, centre.y + 1, crewX + 5, centre.y + 5);
        if (passenger.rage) {
          graphics.fillStyle(0xffdf70, alpha);
          graphics.fillTriangle(crewX - 2, centre.y - 5, crewX + 2, centre.y - 1, crewX - 1, centre.y - 1);
          graphics.fillTriangle(crewX + 1, centre.y - 3, crewX + 4, centre.y - 3, crewX, centre.y + 1);
        }
        if (passenger.shieldWall) {
          graphics.fillStyle(0xd8eff7, alpha);
          graphics.fillCircle(crewX + 5, centre.y - 3, 2.5);
          graphics.lineStyle(1, 0x183f59, alpha);
          graphics.strokeCircle(crewX + 5, centre.y - 3, 2.5);
        }
      }
      const carriedGold = passengers.reduce(
        (total, passenger) => total + (carriedTreasure(gameState!, passenger.id)?.value ?? 0),
        0,
      );
      if (carriedGold > 0) {
        // A small gold-bound chest makes carried treasure visible even while
        // its Soldier or Veteran is represented only by a head in the boat.
        graphics.fillStyle(0x8c5b23, alpha);
        graphics.fillRect(centre.x + 25, centre.y - 11, 14, 9);
        graphics.fillStyle(0xc88432, alpha);
        graphics.fillRect(centre.x + 25, centre.y - 14, 14, 4);
        graphics.lineStyle(2, 0xffdf70, alpha);
        graphics.strokeRect(centre.x + 25, centre.y - 11, 14, 9);
        graphics.strokeLineShape(new Phaser.Geom.Line(centre.x + 32, centre.y - 14, centre.x + 32, centre.y - 2));
      }
    } else {
      // Catapults occupy their left-hand anchor tile plus the tile to its right.
      graphics.fillStyle(0x3a2b23, 0.25);
      graphics.fillEllipse(x + 30, y + 27, 47, 6);
      graphics.fillStyle(0x4f301c, alpha);
      graphics.fillCircle(x + 12, y + 23, 6);
      graphics.fillCircle(x + 48, y + 23, 6);
      graphics.fillStyle(0xbd7434, alpha);
      graphics.fillRect(x + 7, y + 15, 45, 7);
      graphics.fillStyle(player.color, alpha);
      graphics.fillRect(x + 18, y + 13, 22, 4);
      graphics.lineStyle(3, 0x593a24, alpha);
      graphics.strokeLineShape(new Phaser.Geom.Line(x + 24, y + 16, x + 51, y + 4));
      graphics.fillStyle(0x59606a, alpha);
      graphics.fillCircle(x + 53, y + 4, 4);
    }
  }
}

function handleBoardSelection(position: Position): void {
  if (!gameState || gameState.turnPhase !== "movement" || drunkMoveRunning || movementRunning || winterAnnouncementRunning || sagaEffectRunning) return;
  const player = activePlayer(gameState);
  const clickedUnit = unitAt(gameState, position);

  if (selectedUnitId && interactionMode === "disembark") {
    const boat = gameState.units.find((unit) => unit.id === selectedUnitId && unit.type === "longboat");
    const passenger = boat
      ? longboatPassengers(gameState, boat.id).find((candidate) => candidate.id === selectedPassengerId)
      : undefined;
    const presentation: MovementPresentation | undefined = boat && passenger
      ? {
          unit: { ...passenger, position: { ...passenger.position } },
          from: { ...boat.position },
          to: { ...position },
        }
      : undefined;
    if (passenger && disembarkSoldier(gameState, selectedUnitId, position, passenger.id)) {
      selectedPassengerId = undefined;
      interactionMode = "move";
      if (presentation) void presentMovement(presentation, movementDuration(presentation));
      else updateAll();
      return;
    }
  }

  if (selectedUnitId && interactionMode === "fire") {
    const shotContext = captureShotContext(gameState, selectedUnitId, position);
    if (fireCatapult(gameState, selectedUnitId, position)) {
      selectedUnitId = undefined;
      selectedPassengerId = undefined;
      interactionMode = "move";
      const presentation = shotContext ? completeShotPresentation(gameState, shotContext) : undefined;
      if (presentation) void presentShot(presentation, shotDuration(presentation));
      else updateAll();
      return;
    }
  }

  if (selectedUnitId && interactionMode === "move") {
    const movingUnitId = selectedUnitId;
    const movementContext = captureMovementContext(gameState, movingUnitId, position);
    const moved = moveUnit(gameState, movingUnitId, position);
    if (moved) {
      const movedUnit = gameState.units.find((unit) => unit.id === movingUnitId);
      if (movedUnit?.type === "catapult" && movedUnit.pendingFireAfterMove) {
        selectedUnitId = movingUnitId;
        interactionMode = "fire";
      } else {
        selectedUnitId = undefined;
        selectedPassengerId = undefined;
        interactionMode = "move";
      }
      const presentation = movementContext
        ? completeMovementPresentation(gameState, movementContext)
        : undefined;
      if (presentation) void presentMovement(presentation, movementDuration(presentation));
      else updateAll();
      return;
    }
  }

  const pendingCatapult = gameState.units.find(
    (unit) => unit.id === selectedUnitId && unit.type === "catapult" && unit.pendingFireAfterMove,
  );
  if (pendingCatapult) {
    if (clickedUnit?.id === pendingCatapult.id) {
      interactionMode = "fire";
      updateAll();
      return;
    }
    selectedUnitId = pendingCatapult.id;
    interactionMode = "fire";
    updateAll();
    return;
  }

  if (
    clickedUnit &&
    clickedUnit.playerId === player.id &&
    (!clickedUnit.moved ||
      (clickedUnit.type === "catapult" && !clickedUnit.fired) ||
      (clickedUnit.type === "longboat" && longboatPassengers(gameState, clickedUnit.id).length > 0))
  ) {
    selectedUnitId = clickedUnit.id;
    selectedPassengerId = undefined;
    interactionMode = "move";
  } else {
    selectedUnitId = undefined;
    selectedPassengerId = undefined;
    interactionMode = "move";
  }
  updateAll();
}

function renderBattleReport(state: GameState): void {
  const winner = state.players.find((player) => player.id === state.winnerId);
  if (!winner) return;
  const statsFor = (playerId: PlayerId) => state.battleStats[playerId];
  const purchased = (playerId: PlayerId) => {
    const stats = statsFor(playerId);
    return stats ? stats.unitsPurchased.soldier + stats.unitsPurchased.longboat + stats.unitsPurchased.catapult : 0;
  };
  const total = (value: (playerId: PlayerId) => number) =>
    state.players.reduce((sum, player) => sum + value(player.id), 0);

  const casualties = total((id) => statsFor(id)?.unitsLost ?? 0);
  const treasureGold = total((id) => statsFor(id)?.goldBanked ?? 0);
  const sagaCards = total((id) => statsFor(id)?.sagaCardsDrawn ?? 0);
  const catapultShots = total((id) => statsFor(id)?.catapultShots ?? 0);
  const boatsLost = total((id) => statsFor(id)?.longboatsLost ?? 0);

  battleReportTitle.textContent = `${winner.title} wins the fjord!`;
  battleReportSubtitle.textContent = `Concluded in round ${state.round} after ${state.completedTurns} completed faction turns. The skald insists every word below is “mostly accurate”.`;
  battleReportSummary.innerHTML = [
    ["Rounds", state.round, "A brisk little disagreement"],
    ["Units lost", casualties, casualties === 0 ? "An exceptionally polite invasion" : "Valhalla has been notified"],
    ["Treasure banked", `${treasureGold} gold`, treasureGold > 0 ? "Receipts remain unavailable" : "Excellent work, accountants"],
    ["Saga Cards", sagaCards, sagaCards > 0 ? "Fate was feeling theatrical" : "Fate took the evening off"],
    ["Catapult shots", catapultShots, catapultShots > 0 ? "Accuracy sold separately" : "The rocks stayed comfortable"],
    ["Longboats lost", boatsLost, boatsLost > 0 ? "Some assembly may be required" : "A fine day for ship insurance"],
  ].map(([label, value, note]) => `
    <div class="battle-stat">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </div>
  `).join("");

  battleReportFactions.innerHTML = state.players.map((player) => {
    const stats = statsFor(player.id);
    const forceLeft = state.units.filter((unit) => unit.playerId === player.id).length;
    const fate = player.id === winner.id ? "Rules the fjord" : "Castle borrowed forever";
    return `
      <tr>
        <th><span class="report-faction-mark" style="--report-faction:${player.cssColor}"></span>${player.name}</th>
        <td>${fate}</td>
        <td>${forceLeft}</td>
        <td>${purchased(player.id)}</td>
        <td>${stats?.combatVictories ?? 0}</td>
        <td>${stats?.goldBanked ?? 0} gold</td>
        <td>${player.gold} gold</td>
      </tr>
    `;
  }).join("");

  const leaders = (score: (playerId: PlayerId) => number) => {
    const best = Math.max(...state.players.map((player) => score(player.id)));
    return {
      best,
      names: state.players.filter((player) => score(player.id) === best).map((player) => player.name).join(" & "),
    };
  };
  const combat = leaders((id) => statsFor(id)?.combatVictories ?? 0);
  const treasure = leaders((id) => statsFor(id)?.goldBanked ?? 0);
  const drinking = leaders((id) => statsFor(id)?.drunkenIncidents ?? 0);
  const shopping = leaders((id) => purchased(id));
  const naval = leaders((id) => statsFor(id)?.longboatsSunk ?? 0);
  const siege = leaders((id) => statsFor(id)?.castleAttacks ?? 0);
  const accurateCatapults = state.players
    .map((player) => ({
      player,
      shots: statsFor(player.id)?.catapultShots ?? 0,
      hits: statsFor(player.id)?.catapultHits ?? 0,
    }))
    .filter((entry) => entry.shots > 0)
    .sort((a, b) => (b.hits / b.shots) - (a.hits / a.shots))[0];

  const awards: Array<[string, string]> = [
    ["Last Castle Standing", `${winner.name} — a decisive triumph, followed by a suspiciously quick change of the locks.`],
    combat.best > 0
      ? ["Sharpest Axe", `${combat.names} won ${combat.best} direct clash${combat.best === 1 ? "" : "es"}. Their helmet warranty is now void.`]
      : ["Polite Raider", "Nobody won a direct clash. Several stern looks were exchanged."],
    treasure.best > 0
      ? ["Golden Helmet", `${treasure.names} returned ${treasure.best} gold. The tax scroll has unfortunately gone missing.`]
      : ["Empty-Pocket Excellence", "No treasure reached home. The chests remain somewhere scenic."],
    shopping.best > 0
      ? ["Quartermaster's Favourite", `${shopping.names} hired ${shopping.best} unit${shopping.best === 1 ? "" : "s"}. Bulk discount: still unavailable.`]
      : ["Frugal Jarl", "Nobody hired a unit. The war chests have never looked healthier—or more disappointed."],
  ];
  if (drinking.best > 0) {
    awards.push(["Mead Hall Frequent Visitor", `${drinking.names} suffered ${drinking.best} drunken incident${drinking.best === 1 ? "" : "s"}. The horns deny everything.`]);
  }
  if (naval.best > 0) {
    awards.push(["Harbour Menace", `${naval.names} sank ${naval.best} Longboat${naval.best === 1 ? "" : "s"}. The harbourmaster requests a quiet word.`]);
  }
  if (siege.best > 0) {
    awards.push(["Persistent Door-Knocker", `${siege.names} launched ${siege.best} castle assault${siege.best === 1 ? "" : "s"}. Subtlety was considered and rejected.`]);
  }
  if (accurateCatapults) {
    const percentage = Math.round((accurateCatapults.hits / accurateCatapults.shots) * 100);
    awards.push(["Least Inaccurate Artillery", `${accurateCatapults.player.name} hit something ${percentage}% of the time (${accurateCatapults.hits}/${accurateCatapults.shots}). “Something” may include friends.`]);
  }
  battleReportAwardList.innerHTML = awards.map(([title, description]) => `
    <article><strong>${title}</strong><p>${description}</p></article>
  `).join("");
}

function setSagaPileDepth(element: HTMLElement, cards: number): void {
  element.classList.remove("pile-empty", "pile-low", "pile-mid", "pile-high");
  element.classList.add(cards <= 0 ? "pile-empty" : cards <= 7 ? "pile-low" : cards <= 20 ? "pile-mid" : "pile-high");
}

function updateSagaTable(): void {
  if (!gameState || mapPreviewActive || !gameState.eventDeckEnabled) {
    sagaTable.hidden = true;
    return;
  }
  sagaTable.hidden = false;
  const pendingEvent = gameState.lastEvent && dismissedEventSequence !== gameState.lastEvent.sequence
    ? gameState.lastEvent
    : undefined;
  const drawCards = gameState.eventDeck.length;
  const discardedCards = Math.max(0, gameState.eventDiscard.length - (pendingEvent ? 1 : 0));
  setSagaPileDepth(sagaDrawPile, drawCards);
  setSagaPileDepth(sagaDiscardPile, discardedCards);
  sagaDrawState.textContent = drawCards <= 0
    ? "The runes await a reshuffle"
    : drawCards <= 7
      ? "Only a few tales remain"
      : drawCards <= 20
        ? "The pile is thinning"
        : "The saga is well stocked";
  sagaDiscardState.textContent = discardedCards <= 0
    ? "No tales told yet"
    : discardedCards <= 7
      ? "A few tales have been told"
      : discardedCards <= 20
        ? "The pile is growing"
        : "Many tales are remembered";

  const lastEvent = gameState.lastEvent;
  if (lastEvent) {
    const presentation = EVENT_PRESENTATION[lastEvent.cardId];
    const drawingFaction = gameState.players.find((player) => player.id === lastEvent.playerId);
    sagaCurrentSymbol.textContent = presentation.symbol;
    sagaCurrentTitle.textContent = presentation.title;
    sagaCurrentDrawer.textContent = `${drawingFaction?.name ?? "A faction"} drew this card.`;
    sagaCurrentDetail.textContent = lastEvent.outcome;
    sagaCurrentSlot.style.setProperty("--event-color", presentation.color);
  } else {
    sagaCurrentSymbol.textContent = "✦";
    sagaCurrentTitle.textContent = "No card drawn yet";
    sagaCurrentDrawer.textContent = "The first card arrives after Round 1.";
    sagaCurrentDetail.textContent = "";
    sagaCurrentSlot.style.removeProperty("--event-color");
  }

  const discardOffset = pendingEvent ? 2 : 1;
  const visibleDiscardId = gameState.eventDiscard.at(-discardOffset);
  if (visibleDiscardId) {
    sagaDiscardSymbol.textContent = EVENT_PRESENTATION[visibleDiscardId].symbol;
  } else {
    sagaDiscardSymbol.textContent = "✦";
  }
}

function updateAll(): void {
  if (!gameState) return;
  const player = activePlayer(gameState);
  if (mapPreviewActive) {
    sagaTable.hidden = true;
    roundLabel.textContent = "Battlefield preview";
    turnBadge.textContent = "Choose the fjord";
    turnBadge.style.setProperty("--turn-color", "#d99b28");
    goldValue.textContent = "50 gold each";
    activeChief.style.setProperty("--chief-color", "#d99b28");
    activeChief.innerHTML = `
      <div class="chief-emblem">?</div>
      <h2>The war council awaits</h2>
      <p>Redraw as often as you like before the horn sounds.</p>
    `;
    selectedUnitLabel.textContent = "The warriors are inspecting the ground, not yet taking orders.";
    boardHelp.textContent = "Human match preview: redraw this fjord for a fresh fair battlefield, or keep it and sound the horn to begin.";
    fireCatapultButton.hidden = true;
    skipCatapultFireButton.hidden = true;
    boatPassengersPanel.hidden = true;
    endTurnButton.disabled = true;
    viewBattleReportButton.hidden = true;
    for (const button of purchaseButtons) button.disabled = true;
    gameLog.innerHTML = "<li>Battlefield preview — no moves, cards, gold, or computer turns have begun.</li>";
    if (boardScene?.isReady()) boardScene.renderBoard();
    return;
  }
  updateSagaTable();
  const finishedWinner = !movementRunning && !castleAssaultRunning ? gameState.winnerId : undefined;
  viewBattleReportButton.hidden = !finishedWinner;
  if (finishedWinner && presentedBattleReportFor !== finishedWinner) {
    presentedBattleReportFor = finishedWinner;
    renderBattleReport(gameState);
    battleReport.hidden = false;
    startBattleReportMusic();
  }
  roundLabel.textContent = gameState.winterPhase > 0
    ? `Round ${gameState.round} · Winter ${gameState.winterPhase}/${WINTER_PHASES}`
    : `Round ${gameState.round}`;
  turnBadge.textContent = gameState.winnerId && !castleAssaultRunning
    ? "Saga complete"
    : `${player.name} · ${gameState.turnPhase === "movement" ? "Manoeuvres" : "Loot spending"}`;
  turnBadge.style.setProperty("--turn-color", player.cssColor);
  goldValue.textContent = `${player.gold} gold`;
  activeChief.style.setProperty("--chief-color", player.cssColor);
  activeChief.innerHTML = `
    <div class="chief-emblem">${player.name.charAt(0)}</div>
    <h2>${gameState.winnerId && !castleAssaultRunning ? `${player.title} is victorious!` : player.title}</h2>
    <p>${controllerLabel(player.controller)} · ${player.emblem} emblem</p>
  `;

  const selected = gameState.units.find((unit) => unit.id === selectedUnitId);
  const selectedBoatPassengers = selected?.type === "longboat"
    ? longboatPassengers(gameState, selected.id)
    : [];
  const selectedBoatGold = selectedBoatPassengers.reduce(
    (total, passenger) => total + (carriedTreasure(gameState!, passenger.id)?.value ?? 0),
    0,
  );
  if (selectedPassengerId && !selectedBoatPassengers.some((passenger) => passenger.id === selectedPassengerId)) {
    selectedPassengerId = undefined;
    if (interactionMode === "disembark") interactionMode = "move";
  }
  const selectedPassenger = selectedBoatPassengers.find((passenger) => passenger.id === selectedPassengerId);
  selectedUnitLabel.textContent = gameState.turnPhase === "purchase"
    ? "Viking manoeuvres are complete. Spend from the war chest, then finish the purchase phase."
    : selected
    ? selected.type === "catapult"
      ? `Catapult — two squares wide and always horizontal; move up to 9 spaces and fire up to 11 squares away${selected.pendingFireAfterMove ? " Fire now or lose the shot this round." : selected.fired ? " (already fired)." : "."}`
      : selected.type === "longboat"
        ? `Longboat — three squares long; ${selectedBoatPassengers.length}/3 Vikings aboard.${selectedBoatGold > 0 ? ` Carrying ${selectedBoatGold} gold.` : ""}`
        : selected.drunk
          ? `${selected.veteran ? "Drunk Veteran" : "Drunk Soldier"} — will stagger under computer control at the start of their next turn. No treasure or boarding.`
          : `${selected.veteran ? "Veteran" : "Soldier"}${selected.rage ? " — BERSERKER RAGE: guaranteed to win the next direct Viking clash; castles are unaffected." : ""}${selected.shieldWall ? " — SHIELD WALL: survives the next Catapult impact." : ""} — choose 0–9 spaces, or make a forced run to the next object. Castle attack: ${selected.veteran ? "45%" : "40%"}.${selected.veteran ? " Slightly stronger in direct combat." : ""}${carriedTreasure(gameState, selected.id) ? " Deposit the treasure from a square beside your castle." : " Move onto a friendly longboat to embark."}`
    : "Choose a unit on the board.";

  fireCatapultButton.hidden = gameState.turnPhase !== "movement" || selected?.type !== "catapult";
  fireCatapultButton.disabled =
    !selected ||
    selected.type !== "catapult" ||
    selected.fired ||
    player.controller !== "human" ||
    openingHornRunning ||
    aiRunning;
  fireCatapultButton.textContent = interactionMode === "fire" ? "Choose intended square" : "Fire catapult";
  const pendingCatapult = getPendingCatapult(gameState);
  skipCatapultFireButton.hidden = !pendingCatapult || selected?.id !== pendingCatapult.id;
  skipCatapultFireButton.disabled = player.controller !== "human" || openingHornRunning || aiRunning || movementRunning;
  const canChoosePassenger = Boolean(
    selected?.type === "longboat" &&
    selectedBoatPassengers.length > 0 &&
    getDisembarkCells(gameState, selected.id).length > 0 &&
    player.controller === "human" &&
    !openingHornRunning &&
    !aiRunning &&
    !movementRunning,
  );
  boatPassengersPanel.hidden = gameState.turnPhase !== "movement" || selected?.type !== "longboat" || selectedBoatPassengers.length === 0;
  boatPassengersPanel.innerHTML = selectedBoatPassengers.map((passenger, index) => {
    const treasure = carriedTreasure(gameState!, passenger.id);
    const rank = passenger.veteran ? "Veteran" : "Soldier";
    const active = passenger.id === selectedPassengerId;
    return `
      <button class="passenger-button${active ? " is-selected" : ""}" type="button" data-passenger-id="${passenger.id}" aria-pressed="${active}" ${canChoosePassenger ? "" : "disabled"}>
        <span class="passenger-icon" aria-hidden="true">${passenger.rage ? "⚡" : passenger.shieldWall ? "⬟" : treasure ? "▣" : passenger.veteran ? "⚔" : "♟"}</span>
        <span><strong>${rank} ${index + 1}${passenger.rage ? " — Berserker Rage" : ""}${passenger.shieldWall ? " — Shield Wall" : ""}</strong><small>${treasure ? `Carrying ${treasure.value} gold` : "No treasure"}${active ? " — choose a shore square" : ""}</small></span>
      </button>
    `;
  }).join("");
  const hasFurtherUnitMovement = gameState.turnPhase === "movement" && gameState.units.some(
    (unit) => unit.playerId === player.id && !unit.embarkedOn && getLegalMoves(gameState!, unit.id).length > 0,
  );
  boardHelp.textContent = openingHornRunning
    ? "The battle horn sounds across the fjord. The first turn begins when its call fades."
    : pendingCatapult
      ? "This Catapult has moved. Choose an intended square now, or press Skip firing before continuing."
      : gameState.turnPhase === "purchase"
        ? "Loot Spending: purchase any units you want beside your castle, then press Loot Spending Complete."
    : interactionMode === "fire"
      ? `${selected?.pendingFireAfterMove ? "Immediate Catapult shot: " : "Catapult firing: "}choose an intended square up to 11 spaces away. Nearby shots scatter by 1 square; distant shots by 2, but favour the centre of their landing area.`
      : interactionMode === "disembark"
        ? `Choose a highlighted land or ice square beside the longboat for the ${selectedPassenger?.veteran ? "Veteran" : "Soldier"}${selectedPassenger && carriedTreasure(gameState, selectedPassenger.id) ? ` carrying ${carriedTreasure(gameState, selectedPassenger.id)!.value} gold` : ""}.`
      : selected && carriedTreasure(gameState, selected.id)
        ? "Treasure carrier: end on a highlighted square beside your castle to bank the chest's gold."
        : !hasFurtherUnitMovement
          ? "No further unit movement is available. Press Viking Manoeuvres Complete to open the purchase phase."
          : "Viking Manoeuvres: select units in any order. Soldiers may choose 0–9 spaces, or run to the next object; other units move up to nine spaces.";

  const humanTurn = player.controller === "human" && !openingHornRunning && !aiRunning && !drunkMoveRunning && !movementRunning && !winterAnnouncementRunning && !sagaEffectRunning && !humanTurnAnnouncementRunning && !gameState.winnerId;
  endTurnButton.disabled = !humanTurn;
  endTurnButton.textContent = gameState.turnPhase === "movement"
    ? "Viking Manoeuvres Complete"
    : "Loot Spending Complete";
  for (const button of purchaseButtons) {
    const type = button.dataset.unit as UnitType;
    button.disabled = !humanTurn || gameState.turnPhase !== "purchase" || !canBuyUnit(gameState, player.id, type);
  }

  const visibleLog = castleAssaultRunning
    ? ["The castle battle hangs in the balance…", ...(concealedCastleLog ?? [])]
    : gameState.log;
  gameLog.innerHTML = visibleLog
    .slice(0, 10)
    .map((entry) => `<li>${entry}</li>`)
    .join("");
  if (boardScene?.isReady()) boardScene.renderBoard();

  if (syncEventReveal()) return;

  if (gameState.winterPhase > presentedWinterPhase && !winterAnnouncementRunning && !sagaEffectRunning && !aiRunning) {
    void runWinterTransition();
    return;
  }

  const hasPendingDrunkMove = gameState.units.some(
    (unit) => unit.playerId === player.id && unit.type === "soldier" && unit.drunk && !unit.moved && !unit.embarkedOn,
  );
  if (!gameState.winnerId && !openingHornRunning && !aiRunning && !drunkMoveRunning && !movementRunning && !winterAnnouncementRunning && !sagaEffectRunning && hasPendingDrunkMove) {
    void runDrunkOpeningMoves();
    return;
  }

  const humanTurnKey = `${gameState.completedTurns}:${player.id}`;
  if (
    !gameState.winnerId &&
    player.controller === "human" &&
    gameState.turnPhase === "movement" &&
    !openingHornRunning &&
    !aiRunning &&
    !drunkMoveRunning &&
    !movementRunning &&
    !winterAnnouncementRunning &&
    !sagaEffectRunning &&
    !humanTurnAnnouncementRunning &&
    announcedHumanTurnKey !== humanTurnKey
  ) {
    void announceHumanTurn(player, humanTurnKey);
    return;
  }

  if (!gameState.winnerId && !openingHornRunning && player.controller !== "human" && !aiRunning && !drunkMoveRunning && !movementRunning && !winterAnnouncementRunning && !sagaEffectRunning) {
    void runAiTurn();
  }
}

function syncEventReveal(): boolean {
  const event = gameState?.lastEvent;
  if (!gameState || !event || dismissedEventSequence === event.sequence) {
    eventReveal.hidden = true;
    return false;
  }
  const presentation = EVENT_PRESENTATION[event.cardId];
  const player = gameState.players.find((candidate) => candidate.id === event.playerId);
  const computerDraw = Boolean(player && player.controller !== "human");
  eventReveal.hidden = false;
  eventSymbol.textContent = presentation.symbol;
  eventSymbol.style.setProperty("--event-color", presentation.color);
  eventTitle.textContent = presentation.title;
  eventDescription.textContent = computerDraw
    ? `${player?.name ?? "A faction"} drew this card. The computer chief will continue after four seconds.`
    : `${player?.name ?? "A faction"} drew this card at the end of their turn.`;
  eventOutcome.textContent = event.outcome;
  eventDeckCount.textContent = event.reshuffled && sagaDrawReadySequence !== event.sequence
    ? "The old tales are being shuffled into a fresh Saga pile."
    : `${sagaDrawState.textContent}. The piles on the Saga table show how fate is flowing.`;
  eventContinueButton.textContent = computerDraw
    ? "Computer continues shortly"
    : event.effects.some((effect) => effect.kind !== "benign")
      ? "Show effect on board"
      : "Continue saga";
  const drawReady = sagaDrawReadySequence === event.sequence;
  eventCard.classList.toggle("is-awaiting-draw", !drawReady);
  eventContinueButton.disabled = !drawReady || sagaEffectRunning;
  if (!drawReady && sagaDrawAnimationSequence !== event.sequence) {
    void animateSagaDraw(event);
  }
  if (computerDraw && drawReady && autoSagaEventSequence !== event.sequence) {
    if (autoSagaTimer !== undefined) window.clearTimeout(autoSagaTimer);
    autoSagaEventSequence = event.sequence;
    autoSagaTimer = window.setTimeout(() => {
      autoSagaTimer = undefined;
      if (gameState?.lastEvent?.sequence === event.sequence && dismissedEventSequence !== event.sequence) {
        void runSagaEffect(event);
      }
    }, 4_000);
  }
  return true;
}

function createFlyingCardBack(rect: DOMRect): HTMLElement {
  const card = document.createElement("div");
  card.className = "saga-flying-card saga-flight-back";
  card.textContent = "ᚱ";
  card.style.left = `${rect.left}px`;
  card.style.top = `${rect.top}px`;
  card.style.width = `${rect.width}px`;
  card.style.height = `${rect.height}px`;
  document.body.append(card);
  return card;
}

async function animateSagaReshuffle(): Promise<void> {
  const source = sagaDiscardPile.getBoundingClientRect();
  const target = sagaDrawPile.getBoundingClientRect();
  sagaTable.classList.add("is-reshuffling");
  sagaCurrentSymbol.textContent = "↻";
  sagaCurrentTitle.textContent = "The runes reshuffle the Saga";
  sagaCurrentDrawer.textContent = "Discarded tales return to the draw pile.";
  sagaCurrentDetail.textContent = "";
  const flights = Array.from({ length: 6 }, async (_, index) => {
    const card = createFlyingCardBack(source);
    const dx = target.left + target.width / 2 - (source.left + source.width / 2);
    const dy = target.top + target.height / 2 - (source.top + source.height / 2);
    const animation = card.animate([
      { transform: `translate3d(0, 0, 0) rotate(${index * 2 - 5}deg) scale(1)`, opacity: 0.88 },
      { transform: `translate3d(${dx * 0.48}px, ${dy - 38 - index * 3}px, 0) rotate(${16 - index * 4}deg) scale(1.06)`, opacity: 1, offset: 0.48 },
      { transform: `translate3d(${dx * 0.82}px, ${dy - 13}px, 0) rotate(${4 - index * 2}deg) scale(1.02)`, opacity: 0.98, offset: 0.78 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${index - 3}deg) scale(1)`, opacity: 0.92 },
    ], { duration: 860, delay: index * 72, easing: "cubic-bezier(.2,.72,.22,1)", fill: "forwards" });
    await animation.finished.catch(() => undefined);
    card.remove();
  });
  await Promise.all(flights);
  sagaTable.classList.remove("is-reshuffling");
}

async function animateSagaDraw(event: EventDraw): Promise<void> {
  sagaDrawAnimationSequence = event.sequence;
  eventCard.classList.add("is-awaiting-draw");
  eventReveal.classList.add("is-card-in-motion");
  if (event.reshuffled) await animateSagaReshuffle();
  if (!gameState || gameState.lastEvent?.sequence !== event.sequence || eventReveal.hidden) {
    sagaDrawAnimationSequence = undefined;
    eventReveal.classList.remove("is-card-in-motion");
    return;
  }
  updateSagaTable();
  const source = sagaDrawPile.getBoundingClientRect();
  const target = eventCard.getBoundingClientRect();
  const card = createFlyingCardBack(source);
  const dx = target.left + target.width / 2 - (source.left + source.width / 2);
  const dy = target.top + target.height / 2 - (source.top + source.height / 2);
  const animation = card.animate([
    { transform: "translate3d(0, 0, 0) rotate(-5deg) scale(1)", opacity: 0.96 },
    { transform: `translate3d(${dx * 0.38}px, ${dy * 0.25 - 45}px, 0) rotate(6deg) scale(1.08)`, opacity: 1, offset: 0.38 },
    { transform: `translate3d(${dx * 0.76}px, ${dy * 0.68 - 24}px, 0) rotate(-2deg) scale(1.24)`, opacity: 1, offset: 0.74 },
    { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(1.42)`, opacity: 0.98 },
  ], { duration: 860, easing: "cubic-bezier(.18,.72,.2,1)", fill: "forwards" });
  await animation.finished.catch(() => undefined);
  card.remove();
  if (!gameState || gameState.lastEvent?.sequence !== event.sequence) {
    eventReveal.classList.remove("is-card-in-motion");
    return;
  }
  sagaDrawAnimationSequence = undefined;
  sagaDrawReadySequence = event.sequence;
  eventCard.classList.remove("is-awaiting-draw");
  const revealAnimation = eventCard.animate([
    { transform: "translate3d(0, 10px, 0) scale(0.78)", opacity: 0 },
    { transform: "translate3d(0, -2px, 0) scale(1.015)", opacity: 1, offset: 0.82 },
    { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
  ], { duration: 330, easing: "cubic-bezier(.18,.76,.24,1)", fill: "both" });
  await revealAnimation.finished.catch(() => undefined);
  eventReveal.classList.remove("is-card-in-motion");
  eventContinueButton.disabled = false;
  updateAll();
}

async function animateSagaDiscard(event: EventDraw): Promise<void> {
  if (sagaDiscardAnimationSequence === event.sequence || eventReveal.hidden) return;
  sagaDiscardAnimationSequence = event.sequence;
  const source = eventCard.getBoundingClientRect();
  const target = sagaDiscardPile.getBoundingClientRect();
  const clone = eventCard.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
  clone.querySelectorAll("button").forEach((button) => button.remove());
  clone.classList.remove("is-awaiting-draw", "is-discarding");
  clone.classList.add("saga-flying-card", "saga-flight-face");
  clone.style.left = `${source.left}px`;
  clone.style.top = `${source.top}px`;
  clone.style.width = `${source.width}px`;
  clone.style.height = `${source.height}px`;
  document.body.append(clone);
  eventCard.classList.add("is-discarding");
  eventReveal.classList.add("is-card-in-motion");
  const dx = target.left + target.width / 2 - (source.left + source.width / 2);
  const dy = target.top + target.height / 2 - (source.top + source.height / 2);
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const animation = clone.animate([
    { transform: "translate3d(0, 0, 0) rotate(0deg) scale(1)", opacity: 1 },
    { transform: `translate3d(${dx * 0.34}px, ${dy * 0.24 - 36}px, 0) rotate(-3deg) scale(0.8)`, opacity: 1, offset: 0.36 },
    { transform: `translate3d(${dx * 0.76}px, ${dy * 0.68 - 18}px, 0) rotate(4deg) scale(${Math.max(scale * 1.8, 0.34)})`, opacity: 0.97, offset: 0.76 },
    { transform: `translate3d(${dx}px, ${dy}px, 0) rotate(2deg) scale(${scale})`, opacity: 0.9 },
  ], { duration: 820, easing: "cubic-bezier(.22,.7,.2,1)", fill: "forwards" });
  await animation.finished.catch(() => undefined);
  clone.remove();
  eventCard.classList.remove("is-discarding");
  eventReveal.classList.remove("is-card-in-motion");
  sagaDiscardPile.animate([
    { transform: "rotate(2deg) scale(1)" },
    { transform: "rotate(-2deg) scale(1.12)" },
    { transform: "rotate(2deg) scale(1)" },
  ], { duration: 360, easing: "cubic-bezier(.2,.75,.22,1)" });
}

async function runSagaEffect(event: EventDraw): Promise<void> {
  if (!gameState || sagaEffectRunning) return;
  if (autoSagaTimer !== undefined) {
    window.clearTimeout(autoSagaTimer);
    autoSagaTimer = undefined;
  }
  sagaEffectRunning = true;
  eventContinueButton.disabled = true;
  await animateSagaDiscard(event);
  eventReveal.hidden = true;
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  interactionMode = "move";

  if (soundedEventSequence !== event.sequence) {
    soundedEventSequence = event.sequence;
    if (event.cardId === "sobering-thought" || event.cardId === "the-persuader") playSoberingUp();
    if (event.cardId === "yule-festival") playDrunkHic();
    if (event.cardId === "called-home" && event.outcome.includes("banks")) playGoldBanked();
    if (event.cardId === "royal-ransom") playGoldBanked();
  }

  if (event.effects.length > 0) {
    if (boardScene?.isReady()) await boardScene.animateSagaEvent(event);
    else await pause(1_000);
  }

  dismissedEventSequence = event.sequence;
  sagaEffectRunning = false;
  eventContinueButton.disabled = false;
  updateAll();
}

function controllerLabel(controller: Controller): string {
  if (controller === "human") return "Human player";
  const labels: Record<Exclude<Controller, "human">, string> = {
    "very-easy": "Very Easy",
    easy: "Easy",
    normal: "Normal",
    hard: "Hard",
    expert: "Expert",
  };
  return `${labels[controller]} computer`;
}

async function runAiTurn(): Promise<void> {
  if (!gameState) return;
  const initialPlayer = activePlayer(gameState);
  if (initialPlayer.controller === "human") return;
  aiRunning = true;
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  updateAll();

  await executeComputerTurn(gameState, {
    onStep: async (kind, _state, movement, shot) => {
      if (movement) {
        await presentMovement(movement, movementDuration(movement, true));
      } else if (shot) {
        await presentShot(shot, shotDuration(shot, true));
      } else {
        updateAll();
        await computerPause(kind === "catapult" ? 180 : 120);
      }
    },
  }, false);
  aiRunning = false;
  updateAll();
}

async function runDrunkOpeningMoves(): Promise<void> {
  if (!gameState || gameState.winnerId) return;
  drunkMoveRunning = true;
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  updateAll();
  await executeDrunkOpeningMoves(gameState, {
    onStep: async (_kind, _state, movement) => {
      if (movement) await presentMovement(movement, movementDuration(movement, true));
      else {
        updateAll();
        await computerPause(240);
      }
    },
  });
  drunkMoveRunning = false;
  updateAll();
}

/** A short, input-blocking hand-off makes hot-seat turns unmistakable. */
async function announceHumanTurn(player: GameState["players"][number], turnKey: string): Promise<void> {
  if (humanTurnAnnouncementRunning || announcedHumanTurnKey === turnKey) return;
  humanTurnAnnouncementRunning = true;
  announcedHumanTurnKey = turnKey;
  humanTurnTitle.textContent = `${player.name} takes command`;
  humanTurnAnnouncement.style.setProperty("--turn-color", player.cssColor);
  humanTurnCopy.textContent = `${player.title}, begin your Viking Manoeuvres.`;
  humanTurnAnnouncement.hidden = false;
  updateAll();
  await pause(1_250);
  humanTurnAnnouncement.hidden = true;
  humanTurnAnnouncementRunning = false;
  updateAll();
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function presentMovement(presentation: MovementPresentation, duration: number): Promise<void> {
  movementRunning = true;
  castleAssaultRunning = Boolean(presentation.castleAssault);
  concealedCastleLog = presentation.castleAssault?.logBeforeAttack;
  boardScene?.prepareMovement(presentation);
  updateAll();
  if (boardScene?.isReady()) await boardScene.animateMovement(presentation, duration);
  castleAssaultRunning = false;
  concealedCastleLog = undefined;
  movementRunning = false;
  updateAll();
}

async function presentShot(presentation: ShotPresentation, duration: number): Promise<void> {
  movementRunning = true;
  updateAll();
  if (boardScene?.isReady()) await boardScene.animateShot(presentation, duration);
  movementRunning = false;
  updateAll();
}

async function runWinterTransition(): Promise<void> {
  if (!gameState || winterAnnouncementRunning) return;
  const fromPhase = presentedWinterPhase;
  const toPhase = Math.min(gameState.winterPhase, fromPhase + 1);
  winterAnnouncementRunning = true;
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  interactionMode = "move";
  updateAll();
  playWinterWind(1_600);
  if (boardScene?.isReady()) await boardScene.animateWinterTransition(fromPhase, toPhase);
  presentedWinterPhase = toPhase;
  winterAnnouncementRunning = false;
  updateAll();
}

function movementDuration(presentation: MovementPresentation, computerControlled = false): number {
  const distance = Math.max(
    Math.abs(presentation.to.x - presentation.from.x),
    Math.abs(presentation.to.y - presentation.from.y),
  );
  const base = Math.min(680, 170 + distance * 50);
  if (!computerControlled) return base;
  const multiplier = {
    relaxed: 1.4,
    normal: 1,
    brisk: 0.62,
    rapid: 0.22,
  }[aiPaceSelect.value] ?? 1;
  return Math.max(90, Math.round(base * multiplier));
}

function shotDuration(presentation: ShotPresentation, computerControlled = false): number {
  const distance = Math.max(
    Math.abs(presentation.landedAt.x - presentation.from.x),
    Math.abs(presentation.landedAt.y - presentation.from.y),
  );
  const base = Math.min(760, 360 + distance * 28);
  if (!computerControlled) return base;
  const multiplier = {
    relaxed: 1.35,
    normal: 1,
    brisk: 0.68,
    rapid: 0.3,
  }[aiPaceSelect.value] ?? 1;
  return Math.max(150, Math.round(base * multiplier));
}

/** Animation-only setting: the AI's decisions and seeded game outcomes never change. */
function computerPause(baseMilliseconds: number): Promise<void> {
  const multiplier = {
    relaxed: 1.55,
    normal: 1,
    brisk: 0.55,
    rapid: 0.12,
  }[aiPaceSelect.value] ?? 1;
  return pause(Math.max(18, Math.round(baseMilliseconds * multiplier)));
}

function resetMatchPresentation(): void {
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  interactionMode = "move";
  dismissedEventSequence = undefined;
  soundedEventSequence = undefined;
  autoSagaEventSequence = undefined;
  if (autoSagaTimer !== undefined) window.clearTimeout(autoSagaTimer);
  autoSagaTimer = undefined;
  sagaDrawAnimationSequence = undefined;
  sagaDrawReadySequence = undefined;
  sagaDiscardAnimationSequence = undefined;
  document.querySelectorAll(".saga-flying-card").forEach((element) => element.remove());
  presentedBattleReportFor = undefined;
  presentedWinterPhase = 0;
  winterAnnouncementRunning = false;
  humanTurnAnnouncementRunning = false;
  announcedHumanTurnKey = undefined;
  sagaEffectRunning = false;
  concealedCastleLog = undefined;
  eventReveal.hidden = true;
  eventCard.classList.remove("is-awaiting-draw", "is-discarding");
  eventReveal.classList.remove("is-card-in-motion");
  sagaTable.classList.remove("is-reshuffling");
  sagaTable.hidden = true;
  humanTurnAnnouncement.hidden = true;
  battleReport.hidden = true;
  viewBattleReportButton.hidden = true;
}

function createFreshMatch(): void {
  const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  gameState = createGame(readSetups(), randomSeed, {
    eventCardFrequency: eventCardFrequencySelect.value as GameState["eventCardFrequency"],
    randomStartingPlayer: randomStartingPlayerToggle.checked,
    randomPlayerOrder: randomPlayerOrderToggle.checked,
    winterEnabled: winterToggle.checked,
  });
  resetMatchPresentation();
}

function ensureBoard(): void {
  if (phaserGame) phaserGame.destroy(true);
  boardScene = new BoardScene();
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-canvas",
    width: 960,
    height: 720,
    backgroundColor: "#17201d",
    scene: boardScene,
    render: { antialias: false, pixelArt: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  });
}

function commenceMatch(): void {
  const hornSequence = ++openingHornSequence;
  mapPreviewActive = false;
  mapPreview.hidden = true;
  openingHornRunning = soundEffectsToggle.checked;
  // Keep the battlefield concealed until the supplied horn has reached silence.
  hornCeremony.hidden = !openingHornRunning;
  hornCeremony.classList.remove("is-fading");
  if (openingHornRunning) {
    void primeAudio().then(() => {
      playBattleHorn();
      window.setTimeout(() => {
        if (hornSequence !== openingHornSequence) return;
        // The horn has finished. Let the final held second dissolve into the map.
        hornCeremony.classList.add("is-fading");
      }, BATTLE_HORN_DURATION_MS);
      window.setTimeout(() => {
        if (hornSequence !== openingHornSequence) return;
        openingHornRunning = false;
        hornCeremony.hidden = true;
        hornCeremony.classList.remove("is-fading");
        updateAll();
      }, BATTLE_HORN_DURATION_MS + BATTLE_HORN_CEREMONY_HOLD_MS);
    });
  }
  updateAll();
}

function startGame(): void {
  if (!validateSetups()) return;
  stopMenuMusic();
  setSoundEffectsEnabled(soundEffectsToggle.checked);
  setMusicEnabled(musicToggle.checked);
  createFreshMatch();
  heritageNote.hidden = true;
  setup.hidden = true;
  gameShell.hidden = false;
  ensureBoard();
  mapPreviewActive = readSetups().some((player) => player.controller === "human");
  mapPreview.hidden = !mapPreviewActive;
  if (mapPreviewActive) updateAll();
  else commenceMatch();
}

function returnToSetup(): void {
  stopBattleReportMusic();
  aiRunning = false;
  drunkMoveRunning = false;
  winterAnnouncementRunning = false;
  humanTurnAnnouncementRunning = false;
  announcedHumanTurnKey = undefined;
  sagaEffectRunning = false;
  concealedCastleLog = undefined;
  gameState = undefined;
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  interactionMode = "move";
  dismissedEventSequence = undefined;
  soundedEventSequence = undefined;
  autoSagaEventSequence = undefined;
  if (autoSagaTimer !== undefined) window.clearTimeout(autoSagaTimer);
  autoSagaTimer = undefined;
  sagaDrawAnimationSequence = undefined;
  sagaDrawReadySequence = undefined;
  sagaDiscardAnimationSequence = undefined;
  document.querySelectorAll(".saga-flying-card").forEach((element) => element.remove());
  presentedBattleReportFor = undefined;
  openingHornRunning = false;
  openingHornSequence += 1;
  hornCeremony.hidden = true;
  humanTurnAnnouncement.hidden = true;
  hornCeremony.classList.remove("is-fading");
  mapPreviewActive = false;
  mapPreview.hidden = true;
  sagaTable.hidden = true;
  presentedWinterPhase = 0;
  eventReveal.hidden = true;
  eventCard.classList.remove("is-awaiting-draw", "is-discarding");
  eventReveal.classList.remove("is-card-in-motion");
  battleReport.hidden = true;
  viewBattleReportButton.hidden = true;
  phaserGame?.destroy(true);
  phaserGame = undefined;
  boardScene = undefined;
  gameShell.hidden = true;
  setup.hidden = false;
  heritageNote.hidden = false;
  startMenuMusic();
  validateSetups();
}

slots.addEventListener("change", validateSetups);
startButton.addEventListener("click", startGame);
redrawMapButton.addEventListener("click", () => {
  if (!mapPreviewActive) return;
  createFreshMatch();
  updateAll();
});
acceptMapButton.addEventListener("click", () => {
  if (!mapPreviewActive) return;
  commenceMatch();
});
soundEffectsToggle.addEventListener("change", () => {
  setSoundEffectsEnabled(soundEffectsToggle.checked);
});
musicToggle.addEventListener("change", () => {
  setMusicEnabled(musicToggle.checked);
  if (musicToggle.checked && !setup.hidden) startMenuMusic();
});
eventContinueButton.addEventListener("click", () => {
  if (!gameState?.lastEvent) return;
  void runSagaEffect(gameState.lastEvent);
});
endTurnButton.addEventListener("click", () => {
  if (!gameState || activePlayer(gameState).controller !== "human") return;
  if (gameState.turnPhase === "movement") {
    const pendingCatapult = getPendingCatapult(gameState);
    if (pendingCatapult) {
      selectedUnitId = pendingCatapult.id;
      interactionMode = "fire";
      updateAll();
      return;
    }
    if (completeManoeuvres(gameState)) {
      selectedUnitId = undefined;
      selectedPassengerId = undefined;
      interactionMode = "move";
    }
    updateAll();
    return;
  }
  selectedUnitId = undefined;
  selectedPassengerId = undefined;
  interactionMode = "move";
  endTurn(gameState);
  updateAll();
});
fireCatapultButton.addEventListener("click", () => {
  if (!gameState || !selectedUnitId || fireCatapultButton.disabled) return;
  interactionMode = "fire";
  updateAll();
});
skipCatapultFireButton.addEventListener("click", () => {
  if (!gameState || !selectedUnitId || skipCatapultFireButton.disabled) return;
  if (skipPendingCatapultFire(gameState, selectedUnitId)) {
    selectedUnitId = undefined;
    selectedPassengerId = undefined;
    interactionMode = "move";
  }
  updateAll();
});
boatPassengersPanel.addEventListener("click", (event) => {
  if (!gameState || !selectedUnitId) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-passenger-id]");
  if (!button || button.disabled) return;
  selectedPassengerId = button.dataset.passengerId;
  interactionMode = "disembark";
  updateAll();
});
newGameButton.addEventListener("click", returnToSetup);
viewBattleReportButton.addEventListener("click", () => {
  if (!gameState?.winnerId) return;
  renderBattleReport(gameState);
  battleReport.hidden = false;
  startBattleReportMusic();
});
reviewBattlefieldButton.addEventListener("click", () => {
  battleReport.hidden = true;
});
reportNewGameButton.addEventListener("click", returnToSetup);
buyMeadButton.addEventListener("click", () => {
  window.open(
    "https://www.buymeacoffee.com/warrenrolfa",
    "buy-me-a-mead",
    "popup=yes,width=760,height=780,noopener,noreferrer",
  );
});
for (const button of longhouseOpenButtons) {
  button.addEventListener("click", () => {
    const page = button.dataset.longhousePage as LonghousePage | undefined;
    if (page && page in LONGHOUSE_PAGE_COPY) openLonghousePage(page);
  });
}
closeLonghouseButton.addEventListener("click", closeLonghouse);
longhouseModal.addEventListener("click", (event) => {
  if (event.target === longhouseModal) closeLonghouse();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !longhouseModal.hidden) closeLonghouse();
});
feedbackForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!feedbackForm.reportValidity()) return;
  const subject = `Viking Raiderz feedback: ${feedbackCategory.value}`;
  const lines = [
    `Feedback category: ${feedbackCategory.value}`,
    `Name: ${feedbackName.value.trim() || "Not provided"}`,
    `Reply email: ${feedbackEmail.value.trim() || "Not provided"}`,
    "",
    feedbackMessage.value.trim(),
  ];
  feedbackStatus.textContent = "Your email app should now open with the raven-mail prepared. Please review it and press Send.";
  window.location.href = `mailto:hello@vikingraiderz.co.uk?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
});
for (const button of purchaseButtons) {
  button.addEventListener("click", () => {
    if (!gameState) return;
    const type = button.dataset.unit as UnitType;
    buyUnit(gameState, activePlayer(gameState).id, type);
    updateAll();
  });
}

buildSetup();
validateSetups();

// Browser autoplay rules require a user gesture. Any ordinary setup
// interaction can begin the quiet loop; startGame stops it before the board
// preview or match appears.
setup.addEventListener("click", () => {
  if (!setup.hidden && musicToggle.checked) startMenuMusic();
});
setup.addEventListener("keydown", () => {
  if (!setup.hidden && musicToggle.checked) startMenuMusic();
});

