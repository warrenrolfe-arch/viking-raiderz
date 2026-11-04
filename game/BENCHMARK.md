# Computer-versus-computer runner

The benchmark runs the real game rules and computer-player decisions without opening a board, drawing graphics, or waiting for animations. The visible game and benchmark share the same computer-turn executor.

## Run the standard tournament

Open a terminal in the `game` folder and run:

```text
npm run benchmark
```

The standard tournament uses a fixed set of seeds, turns saga cards off, enables the seeded random starting-player and player-order options, pairs every difficulty against every other difficulty, swaps Blue and Red for mixed pairings, and stops any unfinished match after 60 rounds. It currently runs 25 matches and normally takes about one minute on the development computer.

The report shows win rate, match length, stalled matches, treasure deposits, unit purchases, Catapult shots, Longboat landings, and average units near the home castle. It also reports average ending gold, unused purchase opportunities, turns when purchases were blocked by a full courtyard, and turns spent at the normal twelve-unit soft cap. These economy figures help distinguish prudent saving from a computer player simply failing to spend. Colour wins help expose a first-player or map-region advantage.

## Larger samples

In PowerShell, this runs four seeds per difficulty pairing—100 matches:

```powershell
$env:VIKING_BENCHMARK_SEEDS="4"
npm run benchmark
```

Optional settings:

```powershell
$env:VIKING_BENCHMARK_MAX_ROUNDS="80"
$env:VIKING_BENCHMARK_CARDS="on"
npm run benchmark
```

Close the terminal or remove those environment variables to return to the defaults. Larger samples are more trustworthy when comparing difficulty levels; a single standard run is a quick regression signal, not final balance evidence.
