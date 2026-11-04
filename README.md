# Viking Raiders Returns

An original, light-hearted, turn-based strategy game inspired by the simplicity and spirit of the ZX Spectrum era.

The project now includes its first playable browser prototype. See `GAME_DESIGN.md` for the evolving game brief and `AGENTS.md` for development principles.

## Play the prototype

The game source is in `game/`.

On Windows, double-click `PLAY GAME.cmd`, keep its small command window open while playing, and close that window when finished.

For manual development, open a terminal in the `game` folder, run `npm install` once, and then run `npm run dev`.

The current prototype supports human hot-seat control and independently selectable Easy, Normal, or Hard computer opponents on an enlarged 32×24 battlefield.

## Reference material

Place supplied historical reference files under `references/`. Keep those files separate from assets intended for the finished game, and record where each item came from when possible.

## Planned technical foundation

- TypeScript
- Phaser 4 (open-source edition)
- Vite
- Vitest

The first target is a browser game. Desktop and mobile packaging will be considered after the web version is stable and enjoyable.

