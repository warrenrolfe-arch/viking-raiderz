/**
 * Board presentation is deliberately separate from serializable game state.
 * A theme may change colours, procedural drawing and eventually sprite
 * atlases, but it must never change movement, combat, AI or seeded outcomes.
 */
export type BoardThemeId = "prototype" | "new-graphics";

export interface BoardThemePalette {
  land: number;
  landLight: number;
  landShade: number;
  snowyLand: number;
  snowShade: number;
  water: number;
  waterDeep: number;
  waterFoam: number;
  frozenWater: number;
  waterRipple: number;
  iceGlaze: number;
  iceCrack: number;
  snowSpeckle: number;
  snowContour: number;
  grassTuft: number;
  grassFlower: number;
  waterGrid: number;
  iceGrid: number;
  landGrid: number;
  legalMove: number;
  fireTarget: number;
  disembarkTarget: number;
  selectedUnit: number;
  winterFront: number;
  aimArea: number;
  aimOutline: number;
  castleShadow: number;
  defeatedCastle: number;
  castleWindow: number;
  castleOutline: number;
}

export interface BoardThemeAssets {
  /** Reserved for the sprite-atlas path introduced by the graphics pass. */
  terrainAtlas?: string;
  unitAtlas?: string;
  objectAtlas?: string;
}

export interface BoardTheme {
  id: BoardThemeId;
  label: string;
  description: string;
  terrainStyle: "prototype" | "storybook";
  palette: BoardThemePalette;
  assets: BoardThemeAssets;
}

const prototypePalette: BoardThemePalette = {
  land: 0x9bc96b,
  landLight: 0xb4d77f,
  landShade: 0x739d55,
  snowyLand: 0xdde7d7,
  snowShade: 0xa9c3c4,
  water: 0x249fc4,
  waterDeep: 0x167f9f,
  waterFoam: 0x9ce5ee,
  frozenWater: 0xd3eff0,
  waterRipple: 0x9ce5ee,
  iceGlaze: 0xffffff,
  iceCrack: 0x85c5d2,
  snowSpeckle: 0xf7fbf4,
  snowContour: 0xa9c3c4,
  grassTuft: 0x639952,
  grassFlower: 0xe1d875,
  waterGrid: 0x7dd4df,
  iceGrid: 0x9bcfd6,
  landGrid: 0x739d55,
  legalMove: 0xf4da77,
  fireTarget: 0xff593f,
  disembarkTarget: 0x8ee5cf,
  selectedUnit: 0xffed9e,
  winterFront: 0xe9fbff,
  aimArea: 0xff9a5b,
  aimOutline: 0xffc27a,
  castleShadow: 0x253c3f,
  defeatedCastle: 0x4f514d,
  castleWindow: 0xf5e5bd,
  castleOutline: 0x4d3a2c,
};

const storybookPalette: BoardThemePalette = {
  ...prototypePalette,
  land: 0x94c464,
  landLight: 0xb5d98a,
  landShade: 0x668f4e,
  snowyLand: 0xe7eee2,
  snowShade: 0xb5cdc9,
  water: 0x359dbe,
  waterDeep: 0x216f8d,
  waterFoam: 0xb8e5e9,
  frozenWater: 0xc7e3e7,
  waterRipple: 0xa8e0e8,
  iceGlaze: 0xf1fafb,
  iceCrack: 0x8dbec7,
  snowSpeckle: 0xffffff,
  snowContour: 0xa4c9c9,
  grassTuft: 0x638d50,
  grassFlower: 0xf3dc77,
  waterGrid: 0x216f8d,
  iceGrid: 0xa7cdd2,
  landGrid: 0x668f4e,
  legalMove: 0xffe57f,
  fireTarget: 0xff6048,
  disembarkTarget: 0x8ff1d1,
  selectedUnit: 0xfff0a8,
};

export const BOARD_THEMES: readonly BoardTheme[] = [
  {
    id: "prototype",
    label: "Prototype",
    description: "The current polished placeholder board and units.",
    terrainStyle: "prototype",
    palette: prototypePalette,
    assets: {},
  },
  {
    id: "new-graphics",
    label: "Soft storybook",
    description: "Light, uncluttered cartoon terrain with gentle board detail.",
    terrainStyle: "storybook",
    palette: storybookPalette,
    assets: {},
  },
] as const;

export function resolveBoardTheme(value: string | null | undefined): BoardTheme {
  return BOARD_THEMES.find((theme) => theme.id === value)
    ?? BOARD_THEMES.find((theme) => theme.id === "new-graphics")!;
}

