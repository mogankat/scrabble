// Scrabble move generator (Appel & Jacobson, "The World's Fastest Scrabble Program").
// Works in the browser (window.Scrabble) and in Node (module.exports).
(function (global) {
  const SIZE = 15;
  const CENTER = 7;

  const LETTER_VALUES = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
    N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };

  // T = triple word, D = double word, * = centre star (double word),
  // t = triple letter, d = double letter
  const LAYOUT = [
    'T..d...T...d..T',
    '.D...t...t...D.',
    '..D...d.d...D..',
    'd..D...d...D..d',
    '....D.....D....',
    '.t...t...t...t.',
    '..d...d.d...d..',
    'T..d...*...d..T',
    '..d...d.d...d..',
    '.t...t...t...t.',
    '....D.....D....',
    'd..D...d...D..d',
    '..D...d.d...D..',
    '.D...t...t...D.',
    'T..d...T...d..T',
  ];

  const PREMIUMS = {
    T: { word: 3, letter: 1, type: 'TW' },
    D: { word: 2, letter: 1, type: 'DW' },
    '*': { word: 2, letter: 1, type: 'STAR' },
    t: { word: 1, letter: 3, type: 'TL' },
    d: { word: 1, letter: 2, type: 'DL' },
    '.': { word: 1, letter: 1, type: null },
  };

  function premiumAt(row, col) {
    return PREMIUMS[LAYOUT[row][col]];
  }

  function tileValue(tile) {
    return tile.blank ? 0 : LETTER_VALUES[tile.letter];
  }

  class Dictionary {
    constructor(words) {
      this.root = { c: Object.create(null), e: false };
      this.count = 0;
      for (const w of words) this.add(w);
    }

    static fromText(text) {
      return new Dictionary(text.split(/\s+/));
    }

    add(raw) {
      const word = raw.trim().toUpperCase();
      if (word.length < 2 || !/^[A-Z]+$/.test(word)) return;
      let node = this.root;
      for (const ch of word) {
        node = node.c[ch] || (node.c[ch] = { c: Object.create(null), e: false });
      }
      if (!node.e) this.count++;
      node.e = true;
    }

    remove(raw) {
      const node = this.walk(raw.trim().toUpperCase());
      if (node && node.e) {
        node.e = false;
        this.count--;
      }
    }

    walk(str, node = this.root) {
      for (const ch of str) {
        node = node.c[ch];
        if (!node) return null;
      }
      return node;
    }

    has(word) {
      const node = this.walk(word.toUpperCase());
      return !!(node && node.e);
    }
  }

  function transpose(grid) {
    return grid[0].map((_, c) => grid.map((row) => row[c]));
  }

  function lettersAlong(grid, row, col, dRow) {
    // Collects the contiguous run of tiles starting next to (row, col) going in dRow.
    let s = '';
    let sum = 0;
    for (let r = row + dRow; r >= 0 && r < SIZE && grid[r][col]; r += dRow) {
      s = dRow < 0 ? grid[r][col].letter + s : s + grid[r][col].letter;
      sum += tileValue(grid[r][col]);
    }
    return { s, sum };
  }

  // For each empty square in `row`, which letters can go there without forming an
  // invalid perpendicular word, plus the info needed to score that perpendicular word.
  function crossChecks(grid, row, dict) {
    const out = [];
    for (let col = 0; col < SIZE; col++) {
      if (grid[row][col]) { out.push(null); continue; }
      const up = lettersAlong(grid, row, col, -1);
      const down = lettersAlong(grid, row, col, 1);
      if (!up.s && !down.s) {
        out.push({ allowed: null, has: false });
        continue;
      }
      const allowed = new Set();
      const prefix = dict.walk(up.s);
      if (prefix) {
        for (const L in prefix.c) {
          const end = dict.walk(down.s, prefix.c[L]);
          if (end && end.e) allowed.add(L);
        }
      }
      out.push({ allowed, has: true, sum: up.sum + down.sum, up: up.s, down: down.s });
    }
    return out;
  }

  function hasNeighbor(grid, r, c) {
    return (r > 0 && grid[r - 1][c]) || (r < SIZE - 1 && grid[r + 1][c]) ||
           (c > 0 && grid[r][c - 1]) || (c < SIZE - 1 && grid[r][c + 1]);
  }

  // Generates moves along rows of `grid`. When `down` is true the grid has been
  // transposed and coordinates are swapped back on output.
  function generate(grid, down, rack, dict, boardEmpty, out) {
    for (let r = 0; r < SIZE; r++) {
      const row = grid[r];
      const cross = crossChecks(grid, r, dict);
      const isAnchor = row.map((t, c) => !t && (boardEmpty ? r === CENTER && c === CENTER : !!hasNeighbor(grid, r, c)));

      for (let anchor = 0; anchor < SIZE; anchor++) {
        if (!isAnchor[anchor]) continue;

        const tryRack = (L, fn) => {
          if (rack[L] > 0) { rack[L]--; fn(false); rack[L]++; }
          if (rack['?'] > 0) { rack['?']--; fn(true); rack['?']++; }
        };

        const record = (start, end, left, right) => {
          const placed = left.map((t, i) => ({ col: start + i, letter: t.letter, blank: t.blank })).concat(right);
          const byCol = new Map(placed.map((p) => [p.col, p]));
          let main = 0;
          let wordMult = 1;
          let crossTotal = 0;
          let word = '';
          const words = [];
          for (let c = start; c <= end; c++) {
            const p = byCol.get(c);
            if (!p) {
              main += tileValue(row[c]);
              word += row[c].blank ? row[c].letter.toLowerCase() : row[c].letter;
              continue;
            }
            word += p.blank ? p.letter.toLowerCase() : p.letter;
            const prem = down ? premiumAt(c, r) : premiumAt(r, c);
            const lv = tileValue(p) * prem.letter;
            main += lv;
            wordMult *= prem.word;
            const cc = cross[c];
            if (cc.has) {
              const s = (cc.sum + lv) * prem.word;
              crossTotal += s;
              words.push({ word: cc.up + p.letter + cc.down, score: s });
            }
          }
          const mainScore = main * wordMult;
          const bingo = placed.length === 7;
          words.unshift({ word: word.toUpperCase(), score: mainScore });
          out.push({
            word,
            row: down ? start : r,
            col: down ? r : start,
            direction: down ? 'down' : 'across',
            score: mainScore + crossTotal + (bingo ? 50 : 0),
            bingo,
            words,
            tiles: placed.map((p) => ({
              row: down ? p.col : r,
              col: down ? r : p.col,
              letter: p.letter,
              blank: p.blank,
            })),
          });
        };

        const extendRight = (node, col, left, right, start) => {
          if (col < SIZE && row[col]) {
            const next = node.c[row[col].letter];
            if (next) extendRight(next, col + 1, left, right, start);
            return;
          }
          if (node.e && col > anchor) record(start, col - 1, left, right);
          if (col >= SIZE) return;
          const cc = cross[col];
          for (const L in node.c) {
            if (cc.allowed && !cc.allowed.has(L)) continue;
            tryRack(L, (blank) => {
              right.push({ col, letter: L, blank });
              extendRight(node.c[L], col + 1, left, right, start);
              right.pop();
            });
          }
        };

        const leftPart = (node, left, limit) => {
          extendRight(node, anchor, left, [], anchor - left.length);
          if (limit === 0) return;
          for (const L in node.c) {
            tryRack(L, (blank) => {
              left.push({ letter: L, blank });
              leftPart(node.c[L], left, limit - 1);
              left.pop();
            });
          }
        };

        if (anchor > 0 && row[anchor - 1]) {
          // Tiles already on the board to the left form a fixed prefix.
          let s = anchor - 1;
          while (s > 0 && row[s - 1]) s--;
          let node = dict.root;
          for (let c = s; c < anchor && node; c++) node = node.c[row[c].letter];
          if (node) extendRight(node, anchor, [], [], s);
        } else {
          let limit = 0;
          for (let c = anchor - 1; c >= 0 && !row[c] && !isAnchor[c]; c--) limit++;
          leftPart(dict.root, [], limit);
        }
      }
    }
  }

  function parseRack(rack) {
    const counts = Object.create(null);
    for (const L of Object.keys(LETTER_VALUES)) counts[L] = 0;
    counts['?'] = 0;
    for (const ch of rack.toUpperCase()) {
      if (ch in counts) counts[ch]++;
      else if (ch === ' ' || ch === '_') counts['?']++;
    }
    return counts;
  }

  /**
   * @param board  SIZE x SIZE array of null | { letter: 'A'..'Z', blank: boolean }
   * @param rack   string of letters, '?' for a blank tile
   * @param dict   Dictionary
   * @returns moves sorted best-first
   */
  function findMoves(board, rack, dict) {
    const counts = parseRack(rack);
    const boardEmpty = board.every((row) => row.every((t) => !t));
    const raw = [];
    generate(board, false, counts, dict, boardEmpty, raw);
    if (!boardEmpty) generate(transpose(board), true, counts, dict, boardEmpty, raw);

    // A single tile can be found both across and down; keep one copy of each placement.
    const best = new Map();
    for (const m of raw) {
      const key = m.tiles.map((t) => `${t.row},${t.col},${t.letter},${t.blank ? 1 : 0}`).sort().join('|');
      const prev = best.get(key);
      if (!prev || m.score > prev.score || (m.score === prev.score && m.word.length > prev.word.length)) best.set(key, m);
    }
    // Same word in the same spot for the same score, differing only in which letter
    // the blank stands for, is one choice as far as the player is concerned.
    const seen = new Set();
    return [...best.values()]
      .sort((a, b) => b.score - a.score || b.word.length - a.word.length)
      .filter((m) => {
        const key = `${m.word.toUpperCase()}|${m.row}|${m.col}|${m.direction}|${m.score}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  // Returns the words on the board that aren't in the dictionary (to catch typos).
  function invalidWords(board, dict) {
    const bad = [];
    const scan = (grid, down) => {
      for (let r = 0; r < SIZE; r++) {
        let c = 0;
        while (c < SIZE) {
          if (!grid[r][c]) { c++; continue; }
          let w = '';
          const start = c;
          while (c < SIZE && grid[r][c]) w += grid[r][c++].letter;
          if (w.length > 1 && !dict.has(w)) bad.push({ word: w, row: down ? start : r, col: down ? r : start, direction: down ? 'down' : 'across' });
        }
      }
    };
    scan(board, false);
    scan(transpose(board), true);
    return bad;
  }

  const api = { SIZE, CENTER, LETTER_VALUES, premiumAt, Dictionary, findMoves, invalidWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Scrabble = api;
})(typeof window !== 'undefined' ? window : globalThis);
