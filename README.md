# Scrabble Solver

A browser-based Scrabble helper. Type the current board onto a full 15×15 layout
(with every double/triple letter/word square), enter your rack, and it lists every
legal move ranked by score.

## Run it

```sh
./fetch-dictionary.sh   # one-time: downloads the ENABLE word list and builds dict/words.js
open index.html         # no server needed
```

### Word lists

- `dict/words.txt`: the base list. `fetch-dictionary.sh` downloads ENABLE (public domain),
  which is close to the North American tournament list but older.
- `dict/extra.txt`: newer words that ENABLE lacks (QI, ZA, OK, EW, ZEN, EMOJI, …). They're merged
  in. Add a word per line to allow more.
- `dict/removed.txt`: offensive words that were dropped from the official list in 2020 but are
  still in ENABLE. They're left out.
- After editing any of these files, run `./build-dictionary.sh` to rebuild `dict/words.js`,
  which is what the page actually loads.
- If the solver suggests a word your Scrabble app rejects, select it and click
  **"<WORD> isn't valid"**. It won't be suggested again.
- If a word on the board is outlined red but your Scrabble app accepts it, click **Add as valid**
  in the "Not in the dictionary" box.
- Both kinds of change are saved in your browser and listed under "Your word list changes",
  where each can be undone.

The current official lists (NWL2023 for North America, Collins Scrabble Words elsewhere) are
licensed, not freely downloadable. You can get NWL through a NASPA membership, or Collins through
its word-list products. If you have one, save it as `dict/words.txt` (one word per line) and run
`./build-dictionary.sh`, or load it
from the page with "Use a different word list".

## Using it

- Click a square and type letters; click the same square again (or press Space) to switch between → and ↓.
- Backspace erases, arrow keys move, right-click a tile to mark it as a blank (scores 0).
- Enter your letters in the rack box, using `?` for a blank, and press **Find best moves** (or Enter).
- Hover over a result to preview it on the board, then click **Play this move** to place it. Undo is available.
- Any word on the board that isn't in the dictionary gets a red outline, so typos are easy to spot.
- Use the tabs above the board to run several games at once: **+ New game** adds one, double-click a tab to rename it, × closes it.
  Each game has its own board, rack, results and undo history.
- All games are saved in your browser between visits.

## How it works

`solver.js` uses the Appel–Jacobson move-generation algorithm: the dictionary is a trie,
and moves are built outward from *anchor* squares (empty squares next to existing tiles),
with cross-checks so that every perpendicular word formed is valid. Scoring counts letter and
word premiums only on newly placed tiles, adds every cross-word, and gives +50 for using all 7 tiles.
