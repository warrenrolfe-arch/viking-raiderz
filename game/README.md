# Viking Raiders Returns — Web Prototype

This folder contains the playable browser prototype.

## Run it

The easiest Windows launch is to double-click `PLAY GAME.cmd` in the parent project folder. Keep its command window open while playing and close it when finished.

For manual development:

1. Install Node.js if it is not already installed.
2. Open a terminal in this folder.
3. Run `npm install` once.
4. Run `npm run dev`.
5. Open the local address shown in the terminal.

The project owner should not need to edit source code. Future builds will provide simpler launch and packaging options.

## Current prototype scope

- Configurable two-to-four-faction setup
- Human hot-seat and Easy, Normal, or Hard computer control per faction
- 32×24 square battlefield
- One connected, irregular fjord and asymmetric castle regions
- Soldiers, Longboats, Catapults, and castles
- Nine-space straight-line movement that stops at objects
- Separate Catapult movement and indirect-fire actions with visible scatter areas
- Optional **Winter Is Coming** rule that freezes the fjord north-to-south over five complete rounds
- Basic combat, castle capture, purchasing, income, and victory
- Placeholder retro-inspired presentation

The event deck, winter system, transport, sound, finished pixel art, and detailed balancing come after the core loop is proven.
