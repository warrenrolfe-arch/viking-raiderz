import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";
import type { GameState, PlayerId } from "./types";

countries.registerLocale(englishCountries);

export interface HallCountry {
  alpha2: string;
  alpha3: string;
  flag: string;
  name: string;
}

export interface HallQualificationProof {
  challengeVersion: 1;
  winnerId: PlayerId;
  completedTurns: number;
  round: number;
  matchSeed: number;
  eventCardFrequency: "every-two-turns";
  winterEnabled: true;
  controllers: Array<{ id: PlayerId; controller: "human" | "expert" }>;
}

export interface HallEntry {
  rank: number;
  initials: string;
  countryCode: string;
  chiefId: PlayerId;
  chief: string;
  turns: number;
  createdAt: string;
}

export const HALL_CHIEFS: Record<PlayerId, string> = {
  blue: "Astrid the Audacious",
  red: "Ragnar the Reasonably Cross",
  pink: "Freya the Fearsome-ish",
  green: "Leif the Loud",
};

function countryFlag(alpha2: string): string {
  return String.fromCodePoint(...[...alpha2].map((letter) => 127397 + letter.charCodeAt(0)));
}

export const HALL_COUNTRIES: readonly HallCountry[] = Object.entries(
  countries.getNames("en", { select: "official" }),
).flatMap(([alpha2, name]) => {
  const alpha3 = countries.alpha2ToAlpha3(alpha2);
  return alpha3 ? [{ alpha2, alpha3, flag: countryFlag(alpha2), name }] : [];
}).sort((left, right) => left.name.localeCompare(right.name, "en"));

const HALL_COUNTRY_CODES = new Set(HALL_COUNTRIES.map((country) => country.alpha3));

export function isHallCountryCode(value: string): boolean {
  return HALL_COUNTRY_CODES.has(value);
}

/**
 * Return the compact proof used by the casual public leaderboard, or nothing
 * when the finished match does not meet every Hall of Legends rule.
 */
export function hallQualificationFor(state: GameState): HallQualificationProof | undefined {
  if (!state.winnerId || state.players.length !== 4) return undefined;
  if (state.eventCardFrequency !== "every-two-turns" || !state.winterEnabled) return undefined;
  if (!Number.isInteger(state.completedTurns) || state.completedTurns <= 0) return undefined;

  const humans = state.players.filter((player) => player.controller === "human");
  const experts = state.players.filter((player) => player.controller === "expert");
  if (humans.length !== 1 || experts.length !== 3 || humans[0]?.id !== state.winnerId) return undefined;

  return {
    challengeVersion: 1,
    winnerId: state.winnerId,
    completedTurns: state.completedTurns,
    round: state.round,
    matchSeed: state.seed,
    eventCardFrequency: "every-two-turns",
    winterEnabled: true,
    controllers: state.players.map((player) => ({
      id: player.id,
      controller: player.controller as "human" | "expert",
    })),
  };
}

export function formatHallTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(date).replaceAll(" ", " ").toUpperCase();
  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  return `${datePart} · ${timePart} UTC`;
}
