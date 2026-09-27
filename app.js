(function () {
  const { SIZE, LETTER_VALUES, premiumAt, Dictionary, findMoves, invalidWords } = window.Scrabble;
  const STORAGE_KEY = 'scrabble-solver-state';
  const BLOCKED_KEY = 'scrabble-solver-blocked';
  const ADDED_KEY = 'scrabble-solver-added';
  const COLS = 'ABCDEFGHIJKLMNO';
  const MAX_RESULTS = 100;

  const boardEl = document.getElementById('board');
  const rackEl = document.getElementById('rack');
  const rackTilesEl = document.getElementById('rack-tiles');
  const solveBtn = document.getElementById('solve');
  const undoBtn = document.getElementById('undo');
  const clearBtn = document.getElementById('clear');
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('results-summary');
  const warningsEl = document.getElementById('warnings');
  const dictStatusEl = document.getElementById('dict-status');
  const dictFileEl = document.getElementById('dict-file');
  const tabsEl = document.getElementById('tabs');
  const wordChangesEl = document.getElementById('word-changes');
  const wordChangesCountEl = document.getElementById('word-changes-count');
  const wordChangesListEl = document.getElementById('word-changes-list');

  let dict = null;
  let blocked = loadSet(BLOCKED_KEY); // words the user marked as not valid
  let added = loadSet(ADDED_KEY); // words the user marked as valid
  let board = emptyBoard();
  let cursor = { row: 7, col: 7 };
  let direction = 'across';
  let moves = [];
  let hovered = null;
  let selected = null;
  let history = [];
  // Each game: { id, name, board, rack, history, moves, selected, summary }.
  // `board`, `history` etc. above always hold the active game's state.
  let games = [];
  let activeId = null;

  function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  // ---------- persistence ----------

  function newGame(name) {
    const n = games.length ? Math.max(...games.map((g) => g.id)) + 1 : 1;
    return { id: n, name: name || `Game ${n}`, board: emptyBoard(), rack: '', history: [] };
  }

  function activeGame() {
    return games.find((g) => g.id === activeId);
  }

  // Copies the working state back into the active game object.
  function stash() {
    const g = activeGame();
    if (!g) return;
    Object.assign(g, { board, rack: rackEl.value, history, moves, selected, summary: summaryEl.textContent });
  }

  function activate(id) {
    stash();
    activeId = id;
    const g = activeGame();
    board = g.board;
    history = g.history || (g.history = []);
    rackEl.value = g.rack || '';
    moves = g.moves || [];
    selected = g.selected || null;
    hovered = null;
    summaryEl.textContent = g.summary || '';
    renderTabs();
    renderRack();
    renderResults();
    render();
    save();
  }

  function save() {
    stash();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        active: activeId,
        games: games.map(({ id, name, board, rack }) => ({ id, name, board, rack })),
      }));
    } catch (_) { /* storage unavailable */ }
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (s && Array.isArray(s.games) && s.games.length) {
        games = s.games.filter((g) => Array.isArray(g.board) && g.board.length === SIZE);
        activeId = s.active;
      } else if (s && Array.isArray(s.board) && s.board.length === SIZE) {
        // State saved before tabs existed.
        games = [{ id: 1, name: 'Game 1', board: s.board, rack: s.rack || '' }];
      }
    } catch (_) { /* ignore */ }
    if (!games.length) games = [newGame()];
    if (!activeGame()) activeId = games[0].id;
  }

  // ---------- tabs ----------

  function renderTabs() {
    tabsEl.innerHTML = '';
    for (const g of games) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (g.id === activeId ? ' active' : '');
      tab.title = 'Double-click to rename';
      const name = document.createElement('span');
      name.textContent = g.name;
      tab.appendChild(name);
      tab.addEventListener('click', () => { if (g.id !== activeId) activate(g.id); });
      tab.addEventListener('dblclick', () => {
        const n = prompt('Name this game:', g.name);
        if (n && n.trim()) { g.name = n.trim(); renderTabs(); save(); }
      });
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = '×';
      close.title = 'Close game';
      close.addEventListener('click', (e) => { e.stopPropagation(); closeGame(g); });
      tab.appendChild(close);
      tabsEl.appendChild(tab);
    }
    const add = document.createElement('button');
    add.className = 'tab-add';
    add.textContent = '+ New game';
    add.addEventListener('click', () => {
      const g = newGame();
      games.push(g);
      activate(g.id);
      boardEl.focus();
    });
    tabsEl.appendChild(add);
  }

  function closeGame(g) {
    const hasTiles = g.board.some((row) => row.some(Boolean));
    if (hasTiles && !confirm(`Close "${g.name}"? Its board will be lost.`)) return;
    const i = games.indexOf(g);
    games.splice(i, 1);
    if (!games.length) games.push(newGame());
    if (g.id === activeId) {
      activeId = null; // don't stash the closed game's state
      activate(games[Math.min(i, games.length - 1)].id);
    } else {
      renderTabs();
      save();
    }
  }

  function snapshot() {
    history.push(JSON.stringify({ board, rack: rackEl.value }));
    if (history.length > 200) history.shift();
  }

  // ---------- board rendering ----------

  const cells = [];

  function buildBoard() {
    boardEl.appendChild(document.createElement('div'));
    for (let c = 0; c < SIZE; c++) boardEl.appendChild(label(COLS[c]));
    for (let r = 0; r < SIZE; r++) {
      boardEl.appendChild(label(r + 1));
      cells.push([]);
      for (let c = 0; c < SIZE; c++) {
        const el = document.createElement('div');
        el.className = 'cell';
        el.dataset.row = r;
        el.dataset.col = c;
        el.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          if (cursor.row === r && cursor.col === c) toggleDirection();
          else cursor = { row: r, col: c };
          boardEl.focus();
          render();
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!board[r][c]) return;
          snapshot();
          board[r][c].blank = !board[r][c].blank;
          changed();
        });
        boardEl.appendChild(el);
        cells[r].push(el);
      }
    }
  }

  function label(text) {
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = text;
    return el;
  }

  function render() {
    const preview = new Map();
    const shown = hovered || selected;
    if (shown) for (const t of shown.tiles) preview.set(`${t.row},${t.col}`, t);

    const bad = new Set();
    const unknown = new Set();
    if (dict) {
      for (const w of invalidWords(board, dict)) {
        unknown.add(w.word);
        for (let i = 0; i < w.word.length; i++) {
          bad.add(w.direction === 'across' ? `${w.row},${w.col + i}` : `${w.row + i},${w.col}`);
        }
      }
    }
    renderWarnings([...unknown].sort());

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cells[r][c];
        const prem = premiumAt(r, c);
        const key = `${r},${c}`;
        const tile = board[r][c] || preview.get(key);
        const cls = ['cell'];
        if (tile) {
          cls.push(board[r][c] ? 'tile' : 'preview');
          if (tile.blank) cls.push('blank');
          el.innerHTML = `<span class="letter">${tile.letter}</span>` +
            (tile.blank ? '' : `<span class="pts">${LETTER_VALUES[tile.letter]}</span>`);
        } else {
          if (prem.type) cls.push(prem.type);
          el.textContent = prem.type === 'STAR' ? '★' : prem.type || '';
        }
        if (bad.has(key)) cls.push('invalid');
        if (cursor.row === r && cursor.col === c) cls.push('cursor', direction);
        el.className = cls.join(' ');
      }
    }
  }

  function renderRack() {
    const letters = cleanRack(rackEl.value);
    if (letters !== rackEl.value) rackEl.value = letters;
    rackTilesEl.innerHTML = [...letters].map((L) =>
      `<div class="rack-tile">${L === '?' ? '' : L}<span class="pts">${L === '?' ? '' : LETTER_VALUES[L]}</span></div>`
    ).join('');
  }

  function cleanRack(s) {
    return s.toUpperCase().replace(/[ _]/g, '?').replace(/[^A-Z?]/g, '').slice(0, 7);
  }

  // ---------- editing ----------

  function toggleDirection() {
    direction = direction === 'across' ? 'down' : 'across';
  }

  function step(delta) {
    const dr = direction === 'down' ? delta : 0;
    const dc = direction === 'across' ? delta : 0;
    cursor = {
      row: Math.min(SIZE - 1, Math.max(0, cursor.row + dr)),
      col: Math.min(SIZE - 1, Math.max(0, cursor.col + dc)),
    };
  }

  function changed() {
    moves = [];
    hovered = selected = null;
    summaryEl.textContent = '';
    renderResults();
    render();
    save();
  }

  boardEl.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const { row, col } = cursor;
    if (/^[a-zA-Z]$/.test(e.key)) {
      snapshot();
      board[row][col] = { letter: e.key.toUpperCase(), blank: false };
      step(1);
      changed();
    } else if (e.key === 'Backspace') {
      snapshot();
      if (board[row][col]) board[row][col] = null;
      else { step(-1); board[cursor.row][cursor.col] = null; }
      changed();
    } else if (e.key === 'Delete') {
      snapshot();
      board[row][col] = null;
      changed();
    } else if (e.key === ' ') {
      toggleDirection();
      render();
    } else if (e.key.startsWith('Arrow')) {
      const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const [dr, dc] = dirs[e.key];
      direction = dc ? 'across' : 'down';
      cursor = {
        row: Math.min(SIZE - 1, Math.max(0, row + dr)),
        col: Math.min(SIZE - 1, Math.max(0, col + dc)),
      };
      render();
    } else if (e.key === 'Enter') {
      solve();
    } else {
      return;
    }
    e.preventDefault();
  });

  solveBtn.addEventListener('click', solve);
  rackEl.addEventListener('input', () => { renderRack(); save(); });
  rackEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') solve(); });

  undoBtn.addEventListener('click', () => {
    if (!history.length) return;
    const prev = JSON.parse(history.pop());
    board = prev.board;
    rackEl.value = prev.rack;
    renderRack();
    changed();
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the whole board?')) return;
    snapshot();
    board = emptyBoard();
    changed();
  });

  // ---------- solving ----------

  function position(m) {
    // Standard notation: across = row then column (8H), down = column then row (H8)
    return m.direction === 'across' ? `${m.row + 1}${COLS[m.col]} →` : `${COLS[m.col]}${m.row + 1} ↓`;
  }

  function solve() {
    if (!dict) { alert('The dictionary has not loaded yet.'); return; }
    const rack = cleanRack(rackEl.value);
    if (!rack) { rackEl.focus(); return; }
    solveBtn.disabled = true;
    solveBtn.textContent = 'Thinking…';
    // Let the button repaint before the (synchronous) search runs.
    const gameId = activeId;
    setTimeout(() => {
      solveBtn.disabled = false;
      solveBtn.textContent = 'Find best moves';
      if (gameId !== activeId) return; // switched tabs meanwhile
      const t0 = performance.now();
      moves = findMoves(board, rack, dict);
      const ms = Math.round(performance.now() - t0);
      hovered = null;
      selected = moves[0] || null;
      summaryEl.textContent = moves.length
        ? `${moves.length.toLocaleString()} possible moves (${ms} ms)${moves.length > MAX_RESULTS ? ` — showing top ${MAX_RESULTS}` : ''}`
        : 'No valid moves found.';
      renderResults();
      render();
    }, 20);
  }

  function renderResults() {
    resultsEl.innerHTML = '';
    moves.slice(0, MAX_RESULTS).forEach((m) => {
      const li = document.createElement('li');
      if (m === selected) li.classList.add('selected');
      const word = [...m.word].map((ch) => ch === ch.toLowerCase() ? `<span class="blank">${ch.toUpperCase()}</span>` : ch).join('');
      const also = m.words.slice(1).map((w) => `${w.word} (${w.score})`).join(', ');
      li.innerHTML = `
        <span class="word">${word}</span>
        <span class="score">${m.score}</span>
        <span class="meta">${position(m)} · uses ${m.tiles.length} tile${m.tiles.length > 1 ? 's' : ''}` +
        `${m.bingo ? ' · <span class="bingo">BINGO +50</span>' : ''}${also ? ` · also forms ${also}` : ''}</span>`;
      if (m === selected) {
        const btn = document.createElement('button');
        btn.className = 'play';
        btn.textContent = 'Play this move';
        btn.addEventListener('click', (e) => { e.stopPropagation(); play(m); });
        li.appendChild(btn);
        const bad = document.createElement('button');
        bad.className = 'not-valid';
        bad.textContent = `${m.words[0].word} isn't valid`;
        bad.title = 'Never suggest this word again';
        bad.addEventListener('click', (e) => { e.stopPropagation(); blockWord(m.words[0].word); });
        li.appendChild(bad);
      }
      li.addEventListener('mouseenter', () => { hovered = m; render(); });
      li.addEventListener('mouseleave', () => { hovered = null; render(); });
      li.addEventListener('click', () => { selected = m; renderResults(); render(); });
      resultsEl.appendChild(li);
    });
  }

  function play(m) {
    snapshot();
    for (const t of m.tiles) board[t.row][t.col] = { letter: t.letter, blank: t.blank };
    let rack = cleanRack(rackEl.value);
    for (const t of m.tiles) rack = rack.replace(t.blank ? '?' : t.letter, '');
    rackEl.value = rack;
    renderRack();
    changed();
    summaryEl.textContent = `Played ${m.word.toUpperCase()} for ${m.score}. Enter your new letters.`;
    save();
    rackEl.focus();
  }

  // ---------- dictionary ----------

  function loadSet(key) {
    try {
      return new Set(JSON.parse(localStorage.getItem(key)) || []);
    } catch (_) {
      return new Set();
    }
  }

  function saveSets() {
    try {
      localStorage.setItem(BLOCKED_KEY, JSON.stringify([...blocked].sort()));
      localStorage.setItem(ADDED_KEY, JSON.stringify([...added].sort()));
    } catch (_) { /* storage unavailable */ }
  }

  function formsWord(m, word) {
    return m.words.some((w) => w.word === word);
  }

  function blockWord(word) {
    blocked.add(word);
    added.delete(word);
    saveSets();
    dict.remove(word);
    stash();
    for (const g of games) {
      if (!g.moves) continue;
      g.moves = g.moves.filter((m) => !formsWord(m, word));
      if (g.selected && formsWord(g.selected, word)) g.selected = g.moves[0] || null;
    }
    moves = activeGame().moves;
    selected = activeGame().selected;
    hovered = null;
    summaryEl.textContent = `Marked ${word} as not valid. It won't be suggested again.`;
    renderResults();
    renderWordChanges();
    render();
    save();
  }

  function addWord(word) {
    added.add(word);
    blocked.delete(word);
    saveSets();
    dict.add(word);
    summaryEl.textContent = `Added ${word} as a valid word.`;
    renderWordChanges();
    render();
  }

  function undoWordChange(word) {
    if (added.delete(word)) dict.remove(word);
    if (blocked.delete(word)) dict.add(word);
    saveSets();
    summaryEl.textContent = `Undid your change to ${word}. Search again to update the results.`;
    renderWordChanges();
    render();
  }

  function renderWordChanges() {
    const all = [...added].map((w) => [w, true]).concat([...blocked].map((w) => [w, false]))
      .sort((a, b) => a[0].localeCompare(b[0]));
    wordChangesEl.hidden = all.length === 0;
    wordChangesCountEl.textContent = all.length;
    wordChangesListEl.innerHTML = '';
    for (const [w, isAdded] of all) {
      const li = document.createElement('li');
      li.className = isAdded ? 'added' : 'blocked';
      li.textContent = `${isAdded ? '✓' : '✗'} ${w} `;
      li.title = isAdded ? 'You marked this as valid' : 'You marked this as not valid';
      const btn = document.createElement('button');
      btn.textContent = 'Undo';
      btn.addEventListener('click', () => undoWordChange(w));
      li.appendChild(btn);
      wordChangesListEl.appendChild(li);
    }
  }

  // Lists board words the dictionary doesn't know, with a button to accept each.
  function renderWarnings(unknown) {
    warningsEl.innerHTML = '';
    if (!unknown.length) return;
    const box = document.createElement('div');
    box.className = 'warn';
    box.append('Not in the dictionary: ');
    for (const w of unknown) {
      const chip = document.createElement('span');
      chip.className = 'unknown-word';
      chip.textContent = w + ' ';
      const btn = document.createElement('button');
      btn.textContent = 'Add as valid';
      btn.addEventListener('click', () => addWord(w));
      chip.appendChild(btn);
      box.appendChild(chip);
    }
    warningsEl.appendChild(box);
  }

  function setDictionary(text, name) {
    const t0 = performance.now();
    dict = Dictionary.fromText(text);
    for (const w of blocked) dict.remove(w);
    for (const w of added) dict.add(w);
    const ms = Math.round(performance.now() - t0);
    dictStatusEl.classList.remove('error');
    dictStatusEl.textContent = `Dictionary: ${name} — ${dict.count.toLocaleString()} words (${ms} ms)`;
    changed();
  }

  function loadDefaultDictionary() {
    // dict/words.js is built by build-dictionary.sh. Loading it as a script (rather
    // than fetching a .txt) means the page works when opened straight from disk.
    if (typeof window.SCRABBLE_WORDS === 'string') {
      setDictionary(window.SCRABBLE_WORDS, 'built-in list');
    } else {
      dictStatusEl.classList.add('error');
      dictStatusEl.textContent = 'No dictionary found — run ./fetch-dictionary.sh, or load a word list below.';
      document.getElementById('dict-picker').open = true;
    }
  }

  dictFileEl.addEventListener('change', async () => {
    const file = dictFileEl.files[0];
    if (file) setDictionary(await file.text(), file.name);
  });

  // ---------- init ----------

  load();
  buildBoard();
  const startId = activeId;
  activeId = null; // nothing to stash yet
  activate(startId);
  renderWordChanges();
  boardEl.focus();
  loadDefaultDictionary();
})();
