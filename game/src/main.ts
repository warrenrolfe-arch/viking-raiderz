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
  createGame,
  disembarkSoldier,
  endTurn,
  fireCatapult,
  forfeitPendingCatapultFire,
  getCatapultFireCells,
  getDisembarkCells,
  getLegalMoves,
  longboatPassengers,
  moveUnit,
  playerAtCastle,
  positionKey,
  terrainAt,
  unitAt,
  unitFootprint,
} from "./core";
import { executeComputerTurn, executeDrunkOpeningMoves } from "./simulation";
import {
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
  BATTLE_HORN_DURATION_MS,
  playCatapultFlight,
  playCatapultImpact,
  playCatapultDestroyed,
  playBattleHorn,
  playDirectCombatOutcome,
  playDrunkHic,
  playGoldBanked,
  playShipSinking,
  playSoberingUp,
  playVictoryHorn,
  playWinterWind,
  primeAudio,
  setSoundEffectsEnabled,
} from "./audio";
import type { Controller, EventCardId, GameState, PlayerId, PlayerSetup, Position, Unit, UnitType } from "./types";

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
const slots = requireElement<HTMLElement>("player-slots");
const setupMessage = requireElement<HTMLElement>("setup-message");
const aiPaceSelect = requireElement<HTMLSelectElement>("ai-pace");
const eventDeckToggle = requireElement<HTMLInputElement>("event-deck-enabled");
const randomStartingPlayerToggle = requireElement<HTMLInputElement>("random-starting-player");
const randomPlayerOrderToggle = requireElement<HTMLInputElement>("random-player-order");
const soundEffectsToggle = requireElement<HTMLInputElement>("sound-effects-enabled");
const winterToggle = requireElement<HTMLInputElement>("winter-enabled");
const startButton = requireElement<HTMLButtonElement>("start-game");
const endTurnButton = requireElement<HTMLButtonElement>("end-turn");
const newGameButton = requireElement<HTMLButtonElement>("new-game");
const roundLabel = requireElement<HTMLElement>("round-label");
const turnBadge = requireElement<HTMLElement>("turn-badge");
const activeChief = requireElement<HTMLElement>("active-chief");
const goldValue = requireElement<HTMLElement>("gold-value");
const selectedUnitLabel = requireElement<HTMLElement>("selected-unit");
const boardHelp = requireElement<HTMLElement>("board-help");
const fireCatapultButton = requireElement<HTMLButtonElement>("fire-catapult");
const disembarkButton = requireElement<HTMLButtonElement>("disembark-viking");
const gameLog = requireElement<HTMLOListElement>("game-log");
const eventReveal = requireElement<HTMLElement>("event-reveal");
const eventSymbol = requireElement<HTMLElement>("event-symbol");
const eventTitle = requireElement<HTMLElement>("event-title");
const eventDescription = requireElement<HTMLElement>("event-description");
const eventOutcome = requireElement<HTMLElement>("event-outcome");
const eventDeckCount = requireElement<HTMLElement>("event-deck-count");
const eventContinueButton = requireElement<HTMLButtonElement>("event-continue");
const purchaseButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".purchase-button"));

let gameState: GameState | undefined;
let phaserGame: Phaser.Game | undefined;
let boardScene: BoardScene | undefined;
let selectedUnitId: string | undefined;
let interactionMode: "move" | "fire" | "disembark" = "move";
let aiRunning = false;
let drunkMoveRunning = false;
let movementRunning = false;
let winterAnnouncementRunning = false;
let presentedWinterPhase = 0;
let dismissedEventSequence: number | undefined;
let soundedEventSequence: number | undefined;
let victoryHornFor: PlayerId | undefined;
let openingHornRunning = false;

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
    article.innerHTML = `
      <div class="faction-mark" aria-hidden="true"></div>
      <h3>${option.name} faction</h3>
      <p>${option.title}</p>
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
  private flyingShot?: ShotPresentation & { progress: number };
  private shotImpact?: ShotPresentation & { progress: number };
  private winterAnnouncementProgress?: number;
  private winterTransition?: { fromPhase: number; toPhase: number; progress: number };

  constructor() {
    super("BoardScene");
  }

  create(): void {
    this.ready = true;
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!gameState || openingHornRunning || aiRunning || movementRunning || winterAnnouncementRunning || activePlayer(gameState).controller !== "human" || gameState.winnerId) return;
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
          graphics.fillStyle(0xff593f, 0.58);
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
      graphics.fillStyle(0x253c3f, 0.18);
      graphics.fillEllipse(x + 16, y + 27, 27, 7);
      graphics.fillStyle(player.eliminated ? 0x4f514d : player.color, 1);
      graphics.fillRect(x + 3, y + 11, this.tileSize - 6, this.tileSize - 12);
      graphics.fillRect(x + 4, y + 6, 7, 9);
      graphics.fillRect(x + this.tileSize - 11, y + 6, 7, 9);
      graphics.fillStyle(0xf5e5bd, player.eliminated ? 0.3 : 0.9);
      graphics.fillRect(x + 7, y + 16, 4, 5);
      graphics.fillRect(x + 19, y + 16, 4, 5);
      graphics.fillStyle(player.eliminated ? 0x4f514d : player.color, 1);
      graphics.fillTriangle(x + 12, y + 5, x + 18, y + 7, x + 12, y + 9);
      graphics.lineStyle(2, 0x4d3a2c, player.eliminated ? 0.25 : 0.75);
      graphics.strokeRect(x + 3, y + 11, this.tileSize - 6, this.tileSize - 12);
    }

    for (const treasure of gameState.treasures) {
      if (treasure.carriedBy) continue;
      const x = treasure.position.x * this.tileSize;
      const y = treasure.position.y * this.tileSize;
      graphics.fillStyle(0x4e371e, 0.25);
      graphics.fillEllipse(x + 15, y + 25, 19, 5);
      graphics.fillStyle(0x8c5b23, 1);
      graphics.fillRect(x + 6, y + 13, 18, 11);
      graphics.fillStyle(0xc88432, 1);
      graphics.fillRect(x + 6, y + 10, 18, 5);
      graphics.lineStyle(2, 0xffdf70, 1);
      graphics.strokeRect(x + 6, y + 13, 18, 11);
      graphics.strokeLineShape(new Phaser.Geom.Line(x + 15, y + 10, x + 15, y + 24));
      graphics.fillStyle(0xffdf70, 1);
      graphics.fillCircle(x + 15, y + 14, 3);
    }

    for (const horn of gameState.drinkingHorns) {
      const x = horn.position.x * this.tileSize;
      const y = horn.position.y * this.tileSize;
      graphics.fillStyle(0x5b3a22, 0.2);
      graphics.fillEllipse(x + 15, y + 25, 14, 4);
      graphics.fillStyle(0xe6b64d, 1);
      graphics.fillRect(x + 11, y + 10, 7, 11);
      graphics.fillTriangle(x + 11, y + 10, x + 18, y + 10, x + 15, y + 5);
      graphics.lineStyle(2, 0x83511f, 1);
      graphics.strokeLineShape(new Phaser.Geom.Line(x + 18, y + 14, x + 23, y + 18));
      graphics.fillCircle(x + 23, y + 19, 3);
    }

    for (const unit of gameState.units) {
      const hiddenByClash = unit.id === this.directClash?.attacker.id || unit.id === this.directClash?.defender.id;
      if (!unit.embarkedOn && unit.id !== this.transit?.unit.id && !hiddenByClash) this.drawUnit(graphics, unit);
    }

    if (this.pendingCasualty) this.drawUnit(graphics, this.pendingCasualty);

    if (this.sinkingBoat) this.drawSinkingBoat(graphics, this.sinkingBoat);
    if (this.brokenCatapult) this.drawBrokenCatapult(graphics, this.brokenCatapult);

    if (this.transit) {
      this.drawTransit(graphics, this.transit);
    }

    if (this.directClash) this.drawDirectClash(graphics, this.directClash);

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
        graphics.fillStyle(0xff9a5b, 0.12);
        graphics.fillRect(
          (this.hoveredFireCell.x - radius) * this.tileSize,
          (this.hoveredFireCell.y - radius) * this.tileSize,
          diameter * this.tileSize,
          diameter * this.tileSize,
        );
        graphics.lineStyle(3, 0xffc27a, 0.95);
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

  async animateMovement(presentation: MovementPresentation, duration: number): Promise<void> {
    this.pendingCasualty = presentation.destroyedUnit;
    this.sinkingBoat = undefined;
    this.transit = { ...presentation, progress: 0 };
    await this.animateFor(duration, (progress) => {
      if (this.transit) this.transit.progress = progress;
      this.renderBoard();
    });
    this.transit = undefined;
    this.pendingCasualty = undefined;
    this.renderBoard();

    if (presentation.becameDrunk) playDrunkHic();
    if (presentation.soberedUp) playSoberingUp();
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

    if (presentation.arrival) {
      if (presentation.arrival === "ship-sunk") playShipSinking();
      else if (presentation.destroyedUnit?.type === "catapult") playCatapultDestroyed();
      this.sinkingBoat = presentation.sunkUnit
        ? { unit: presentation.sunkUnit, progress: 0 }
        : undefined;
      this.brokenCatapult = presentation.destroyedUnit?.type === "catapult"
        ? { unit: presentation.destroyedUnit, progress: 0 }
        : undefined;
      this.arrival = { position: presentation.to, kind: presentation.arrival, progress: 0 };
      const arrivalDuration = presentation.destroyedUnit?.type === "catapult"
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
      repelled: { text: "Repelled!", color: 0xff826f },
      castle: { text: "Castle taken!", color: 0xffd45c },
      treasure: { text: "Treasure!", color: 0xffdf70 },
      deposit: { text: "Gold banked!", color: 0xffdf70 },
      boarding: { text: "All aboard!", color: 0x9ce5ee },
    };
    const presentation = labels[arrival.kind];
    const x = (arrival.position.x + 0.5) * this.tileSize;
    const y = (arrival.position.y + 0.5) * this.tileSize;
    const alpha = 1 - arrival.progress * 0.8;
    graphics.lineStyle(3, presentation.color, alpha);
    graphics.strokeCircle(x, y, 8 + arrival.progress * 18);
    this.add.text(x, y - 19 - arrival.progress * 12, presentation.text, {
      fontFamily: "Arial, sans-serif",
      fontSize: "14px",
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
      const crew = longboatPassengers(gameState, unit.id).length;
      for (let index = 0; index < crew; index += 1) {
        const crewX = centre.x - 18 + index * 18;
        graphics.fillStyle(0xf1c18d, alpha);
        graphics.fillCircle(crewX, centre.y + 6, 4);
        graphics.fillStyle(0x4b5661, alpha);
        graphics.fillRect(crewX - 4, centre.y + 1, 8, 3);
        graphics.fillTriangle(crewX - 5, centre.y + 3, crewX + 5, centre.y + 3, crewX, centre.y - 2);
        graphics.fillStyle(0xf4ead0, alpha);
        graphics.fillTriangle(crewX - 3, centre.y + 3, crewX - 7, centre.y + 1, crewX - 5, centre.y + 5);
        graphics.fillTriangle(crewX + 3, centre.y + 3, crewX + 7, centre.y + 1, crewX + 5, centre.y + 5);
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
  if (!gameState || drunkMoveRunning || movementRunning || winterAnnouncementRunning) return;
  const player = activePlayer(gameState);
  const clickedUnit = unitAt(gameState, position);

  if (selectedUnitId && interactionMode === "disembark") {
    const boat = gameState.units.find((unit) => unit.id === selectedUnitId && unit.type === "longboat");
    const passenger = boat ? longboatPassengers(gameState, boat.id)[0] : undefined;
    const presentation: MovementPresentation | undefined = boat && passenger
      ? {
          unit: { ...passenger, position: { ...passenger.position } },
          from: { ...boat.position },
          to: { ...position },
        }
      : undefined;
    if (disembarkSoldier(gameState, selectedUnitId, position)) {
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
    forfeitPendingCatapultFire(gameState);
  }

  if (
    clickedUnit &&
    clickedUnit.playerId === player.id &&
    (!clickedUnit.moved ||
      (clickedUnit.type === "catapult" && !clickedUnit.fired) ||
      (clickedUnit.type === "longboat" && longboatPassengers(gameState, clickedUnit.id).length > 0))
  ) {
    selectedUnitId = clickedUnit.id;
    interactionMode = "move";
  } else {
    selectedUnitId = undefined;
    interactionMode = "move";
  }
  updateAll();
}

function updateAll(): void {
  if (!gameState) return;
  const player = activePlayer(gameState);
  if (gameState.winnerId && victoryHornFor !== gameState.winnerId) {
    victoryHornFor = gameState.winnerId;
    playVictoryHorn(gameState.winnerId);
  }
  roundLabel.textContent = gameState.winterPhase > 0
    ? `Round ${gameState.round} · Winter ${gameState.winterPhase}/${WINTER_PHASES}`
    : `Round ${gameState.round}`;
  turnBadge.textContent = gameState.winnerId ? "Saga complete" : `${player.name} turn`;
  turnBadge.style.setProperty("--turn-color", player.cssColor);
  goldValue.textContent = `${player.gold} gold`;
  activeChief.style.setProperty("--chief-color", player.cssColor);
  activeChief.innerHTML = `
    <div class="chief-emblem">${player.name.charAt(0)}</div>
    <h2>${gameState.winnerId ? `${player.title} is victorious!` : player.title}</h2>
    <p>${controllerLabel(player.controller)} · ${player.emblem} emblem</p>
  `;

  const selected = gameState.units.find((unit) => unit.id === selectedUnitId);
  selectedUnitLabel.textContent = selected
    ? selected.type === "catapult"
      ? `Catapult — two squares wide and always horizontal; move up to 9 spaces and fire up to 11 squares away${selected.pendingFireAfterMove ? " Fire now or lose the shot this round." : selected.fired ? " (already fired)." : "."}`
      : selected.type === "longboat"
        ? `Longboat — three squares long; ${longboatPassengers(gameState, selected.id).length}/3 Vikings aboard.`
        : selected.drunk
          ? `${selected.veteran ? "Drunk Veteran" : "Drunk Soldier"} — will stagger under computer control at the start of their next turn. No treasure or boarding.`
          : `${selected.veteran ? "Veteran" : "Soldier"} — choose 0–9 spaces, or make a forced run to the next object. Castle attack: ${selected.veteran ? "45%" : "40%"}.${selected.veteran ? " Slightly stronger in direct combat." : ""}${carriedTreasure(gameState, selected.id) ? " Deposit the treasure from a square beside your castle." : " Move onto a friendly longboat to embark."}`
    : "Choose a unit on the board.";

  fireCatapultButton.hidden = selected?.type !== "catapult";
  fireCatapultButton.disabled =
    !selected ||
    selected.type !== "catapult" ||
    selected.fired ||
    player.controller !== "human" ||
    openingHornRunning ||
    aiRunning;
  fireCatapultButton.textContent = interactionMode === "fire" ? "Choose intended square" : "Fire catapult";
  const passengerCount = selected?.type === "longboat" ? longboatPassengers(gameState, selected.id).length : 0;
  disembarkButton.hidden = selected?.type !== "longboat";
  disembarkButton.disabled =
    !selected ||
    selected.type !== "longboat" ||
    passengerCount === 0 ||
    getDisembarkCells(gameState, selected.id).length === 0 ||
    player.controller !== "human" ||
    openingHornRunning ||
    aiRunning;
  disembarkButton.textContent = interactionMode === "disembark" ? "Choose a shore square" : "Disembark Viking";
  boardHelp.textContent = openingHornRunning
    ? "The battle horn sounds across the fjord. The first turn begins when its call fades."
    : interactionMode === "fire"
      ? `${selected?.pendingFireAfterMove ? "Immediate Catapult shot: " : "Catapult firing: "}choose an intended square up to 11 spaces away. Nearby shots scatter by 1 square; distant shots by 2, but favour the centre of their landing area.`
      : interactionMode === "disembark"
        ? "Choose a highlighted land or ice square beside the longboat. One Viking will step ashore and may move again next turn."
      : selected && carriedTreasure(gameState, selected.id)
        ? "Treasure carrier: end on a highlighted square beside your castle to bank the chest's gold."
        : "Select one of your units, then choose a highlighted destination. Soldiers may choose 0–9 spaces, or run to the next object, edge, or impassable terrain; other units move up to nine spaces.";

  const humanTurn = player.controller === "human" && !openingHornRunning && !aiRunning && !drunkMoveRunning && !movementRunning && !winterAnnouncementRunning && !gameState.winnerId;
  endTurnButton.disabled = !humanTurn;
  for (const button of purchaseButtons) {
    const type = button.dataset.unit as UnitType;
    button.disabled = !humanTurn || !canBuyUnit(gameState, player.id, type);
  }

  gameLog.innerHTML = gameState.log
    .slice(0, 10)
    .map((entry) => `<li>${entry}</li>`)
    .join("");
  if (boardScene?.isReady()) boardScene.renderBoard();

  if (syncEventReveal()) return;

  if (gameState.winterPhase > presentedWinterPhase && !winterAnnouncementRunning && !aiRunning) {
    void runWinterTransition();
    return;
  }

  const hasPendingDrunkMove = gameState.units.some(
    (unit) => unit.playerId === player.id && unit.type === "soldier" && unit.drunk && !unit.moved && !unit.embarkedOn,
  );
  if (!gameState.winnerId && !openingHornRunning && !aiRunning && !drunkMoveRunning && !movementRunning && !winterAnnouncementRunning && hasPendingDrunkMove) {
    void runDrunkOpeningMoves();
    return;
  }

  if (!gameState.winnerId && !openingHornRunning && player.controller !== "human" && !aiRunning && !drunkMoveRunning && !movementRunning && !winterAnnouncementRunning) {
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
  if (soundedEventSequence !== event.sequence) {
    soundedEventSequence = event.sequence;
    if (event.cardId === "sobering-thought" || event.cardId === "the-persuader") playSoberingUp();
    if (event.cardId === "called-home" && event.outcome.includes("banks")) playGoldBanked();
  }
  const player = gameState.players.find((candidate) => candidate.id === event.playerId);
  eventReveal.hidden = false;
  eventSymbol.textContent = presentation.symbol;
  eventSymbol.style.setProperty("--event-color", presentation.color);
  eventTitle.textContent = presentation.title;
  eventDescription.textContent = `${player?.name ?? "A faction"} drew this card at the end of their turn.`;
  eventOutcome.textContent = event.outcome;
  eventDeckCount.textContent = `${gameState.eventDeck.length} card${gameState.eventDeck.length === 1 ? "" : "s"} remain before the next reshuffle.`;
  return true;
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

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function presentMovement(presentation: MovementPresentation, duration: number): Promise<void> {
  movementRunning = true;
  updateAll();
  if (boardScene?.isReady()) await boardScene.animateMovement(presentation, duration);
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

function startGame(): void {
  if (!validateSetups()) return;
  setSoundEffectsEnabled(soundEffectsToggle.checked);
  openingHornRunning = soundEffectsToggle.checked;
  if (openingHornRunning) {
    void primeAudio().then(() => {
      playBattleHorn();
      window.setTimeout(() => {
        openingHornRunning = false;
        updateAll();
      }, BATTLE_HORN_DURATION_MS);
    });
  }
  const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0] ?? Date.now();
  gameState = createGame(readSetups(), randomSeed, {
    eventDeckEnabled: eventDeckToggle.checked,
    randomStartingPlayer: randomStartingPlayerToggle.checked,
    randomPlayerOrder: randomPlayerOrderToggle.checked,
    winterEnabled: winterToggle.checked,
  });
  selectedUnitId = undefined;
  interactionMode = "move";
  dismissedEventSequence = undefined;
  soundedEventSequence = undefined;
  victoryHornFor = undefined;
  presentedWinterPhase = 0;
  winterAnnouncementRunning = false;
  eventReveal.hidden = true;
  setup.hidden = true;
  gameShell.hidden = false;

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
  updateAll();
}

function returnToSetup(): void {
  aiRunning = false;
  drunkMoveRunning = false;
  winterAnnouncementRunning = false;
  gameState = undefined;
  selectedUnitId = undefined;
  interactionMode = "move";
  dismissedEventSequence = undefined;
  soundedEventSequence = undefined;
  victoryHornFor = undefined;
  openingHornRunning = false;
  presentedWinterPhase = 0;
  eventReveal.hidden = true;
  phaserGame?.destroy(true);
  phaserGame = undefined;
  boardScene = undefined;
  gameShell.hidden = true;
  setup.hidden = false;
  validateSetups();
}

slots.addEventListener("change", validateSetups);
startButton.addEventListener("click", startGame);
soundEffectsToggle.addEventListener("change", () => setSoundEffectsEnabled(soundEffectsToggle.checked));
eventContinueButton.addEventListener("click", () => {
  if (!gameState?.lastEvent) return;
  dismissedEventSequence = gameState.lastEvent.sequence;
  eventReveal.hidden = true;
  updateAll();
});
endTurnButton.addEventListener("click", () => {
  if (!gameState || activePlayer(gameState).controller !== "human") return;
  selectedUnitId = undefined;
  interactionMode = "move";
  endTurn(gameState);
  updateAll();
});
fireCatapultButton.addEventListener("click", () => {
  if (!gameState || !selectedUnitId || fireCatapultButton.disabled) return;
  interactionMode = "fire";
  updateAll();
});
disembarkButton.addEventListener("click", () => {
  if (!gameState || !selectedUnitId || disembarkButton.disabled) return;
  interactionMode = "disembark";
  updateAll();
});
newGameButton.addEventListener("click", returnToSetup);
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

