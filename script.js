(function () {
  "use strict";

  const WORDS = {
    id: ["RUMAH","KURSI","MOTOR","PASAR","HUJAN","PANAS","BESAR","KECIL","MAKAN","MINUM",
         "TIDUR","MANDI","KAMAR","PINTU","LAMPU","MERAH","HITAM","PUTIH","HIJAU","SAYUR",
         "JERUK","ANGIN","SUARA","WARNA","DAPUR"],
    en: ["APPLE","HOUSE","WATER","LIGHT","MUSIC","PHONE","CLOCK","GREEN","BLACK","WHITE",
         "BREAD","EARTH","RIVER","CLOUD","SMILE","HEART","TRAIN","PLANE","STONE","GLASS",
         "PAPER","PLANT","LEMON","MANGO","PEACH","HONEY","SUGAR","PASTA","PIZZA","HAPPY",
         "PARTY","QUIET"]
  };

  const KEY_ROWS = [
    { cls: "", keys: "QWERTYUIOP".split("") },
    { cls: "krow-2", keys: "ASDFGHJKL".split("") },
    { cls: "", keys: ["ENTER", ..."ZXCVBNM".split(""), "⌫"] }
  ];

  const MAX_TRIES = 6;
  const WORD_LEN = 5;

  // ---------- State ----------
  let lang = "id";
  let answer = "";
  let guesses = [];
  let current = "";
  let gameOver = false;
  let keyStatus = {};

  const el = {
    board: document.getElementById("board"),
    keyboard: document.getElementById("keyboard"),
    statusText: document.getElementById("status-text"),
    toast: document.getElementById("toast"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modal-title"),
    modalSub: document.getElementById("modal-sub"),
    modalAnswer: document.getElementById("modal-answer"),
    statPlayed: document.getElementById("stat-played"),
    statWinrate: document.getElementById("stat-winrate"),
    statStreak: document.getElementById("stat-streak"),
    btnAgain: document.getElementById("btn-again"),
    btnHelp: document.getElementById("btn-help"),
    btnTheme: document.getElementById("btn-theme"),
    btnId: document.getElementById("btn-id"),
    btnEn: document.getElementById("btn-en"),
  };

  // ---------- Local stats (per-browser, best effort) ----------
  function loadStats() {
    try {
      const raw = localStorage.getItem("wordix-stats");
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return { played: 0, wins: 0, streak: 0 };
  }
  function saveStats(stats) {
    try { localStorage.setItem("wordix-stats", JSON.stringify(stats)); }
    catch (e) { /* ignore */ }
  }
  let stats = loadStats();

  // ---------- Build board ----------
  function buildBoard() {
    el.board.innerHTML = "";
    for (let r = 0; r < MAX_TRIES; r++) {
      const row = document.createElement("div");
      row.className = "row";
      row.id = "row-" + r;
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.id = "tile-" + r + "-" + c;
        row.appendChild(tile);
      }
      el.board.appendChild(row);
    }
  }

  // ---------- Build keyboard ----------
  function buildKeyboard() {
    el.keyboard.innerHTML = "";
    KEY_ROWS.forEach((rowDef) => {
      const krow = document.createElement("div");
      krow.className = "krow" + (rowDef.cls ? " " + rowDef.cls : "");
      rowDef.keys.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "key" + (k === "ENTER" || k === "⌫" ? " wide" : "");
        btn.textContent = k;
        btn.dataset.key = k;
        btn.addEventListener("click", () => handleKey(k === "⌫" ? "BACKSPACE" : k));
        krow.appendChild(btn);
      });
      el.keyboard.appendChild(krow);
    });
  }

  function refreshKeyboardColors() {
    document.querySelectorAll(".key").forEach((btn) => {
      const k = btn.dataset.key;
      const letter = k === "⌫" || k === "ENTER" ? null : k;
      btn.classList.remove("correct", "present", "absent");
      if (letter && keyStatus[letter]) {
        btn.classList.add(keyStatus[letter]);
      }
    });
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 1400);
  }

  // ---------- Core game logic ----------
  function pickAnswer() {
    const list = WORDS[lang];
    return list[Math.floor(Math.random() * list.length)];
  }

  function isValidWord(word) {
    return WORDS[lang].includes(word);
  }

  function newGame() {
    answer = pickAnswer();
    guesses = [];
    current = "";
    gameOver = false;
    keyStatus = {};
    buildBoard();
    refreshKeyboardColors();
    updateStatus();
  }

  function updateStatus() {
    const label = lang === "id" ? "Percobaan " : "Guess ";
    const suffix = lang === "id" ? " dari " + MAX_TRIES : " of " + MAX_TRIES;
    el.statusText.textContent = label + (guesses.length + 1) + suffix;
  }

  function evaluateGuess(guess, ans) {
    const result = new Array(WORD_LEN).fill("absent");
    const ansArr = ans.split("");
    const guessArr = guess.split("");
    const used = new Array(WORD_LEN).fill(false);

    for (let i = 0; i < WORD_LEN; i++) {
      if (guessArr[i] === ansArr[i]) {
        result[i] = "correct";
        used[i] = true;
      }
    }
    for (let i = 0; i < WORD_LEN; i++) {
      if (result[i] === "correct") continue;
      let found = -1;
      for (let j = 0; j < WORD_LEN; j++) {
        if (!used[j] && ansArr[j] === guessArr[i]) { found = j; break; }
      }
      if (found !== -1) {
        result[i] = "present";
        used[found] = true;
      }
    }
    return result;
  }

  function applyKeyStatus(letter, status) {
    const rank = { absent: 0, present: 1, correct: 2 };
    if (!keyStatus[letter] || rank[status] > rank[keyStatus[letter]]) {
      keyStatus[letter] = status;
    }
  }

  function submitGuess() {
    if (gameOver) return;
    if (current.length < WORD_LEN) {
      shakeRow(guesses.length);
      showToast(lang === "id" ? "Kurang huruf" : "Not enough letters");
      return;
    }
    if (!isValidWord(current)) {
      shakeRow(guesses.length);
      showToast(lang === "id" ? "Kata tidak dikenal" : "Not in word list");
      return;
    }

    const rowIndex = guesses.length;
    const result = evaluateGuess(current, answer);

    result.forEach((status, i) => {
      const tile = document.getElementById("tile-" + rowIndex + "-" + i);
      tile.textContent = current[i];
      tile.classList.add("filled");
      setTimeout(() => {
        tile.classList.add("flip");
        setTimeout(() => { tile.classList.add(status); }, 240);
      }, i * 150);
      applyKeyStatus(current[i], status);
    });

    const won = current === answer;
    guesses.push(current);

    setTimeout(() => {
      refreshKeyboardColors();
      updateStatus();
      if (won) {
        endGame(true);
      } else if (guesses.length >= MAX_TRIES) {
        endGame(false);
      }
    }, WORD_LEN * 150 + 400);

    current = "";
  }

  function shakeRow(rowIndex) {
    const row = document.getElementById("row-" + rowIndex);
    if (!row) return;
    row.querySelectorAll(".tile").forEach((t) => {
      t.classList.remove("shake");
      void t.offsetWidth;
      t.classList.add("shake");
    });
  }

  function renderCurrentRow() {
    const rowIndex = guesses.length;
    for (let c = 0; c < WORD_LEN; c++) {
      const tile = document.getElementById("tile-" + rowIndex + "-" + c);
      if (!tile) continue;
      const ch = current[c] || "";
      tile.textContent = ch;
      tile.classList.toggle("filled", !!ch);
    }
  }

  function handleKey(k) {
    if (gameOver) return;
    if (k === "ENTER") { submitGuess(); return; }
    if (k === "BACKSPACE") {
      current = current.slice(0, -1);
      renderCurrentRow();
      return;
    }
    if (/^[A-Z]$/.test(k) && current.length < WORD_LEN) {
      current += k;
      renderCurrentRow();
    }
  }

  function endGame(won) {
    gameOver = true;
    stats.played = (stats.played || 0) + 1;
    if (won) {
      stats.wins = (stats.wins || 0) + 1;
      stats.streak = (stats.streak || 0) + 1;
    } else {
      stats.streak = 0;
    }
    saveStats(stats);
    setTimeout(() => openModal(won), 450);
  }

  function openModal(won) {
    el.modalTitle.textContent = won
      ? (lang === "id" ? "Selamat!" : "Well done!")
      : (lang === "id" ? "Coba lagi" : "Try again");
    el.modalSub.textContent = won
      ? (lang === "id" ? "Kamu berhasil menebak dalam " + guesses.length + " kali coba" : "You solved it in " + guesses.length + " tries")
      : (lang === "id" ? "Kata yang benar adalah:" : "The word was:");
    el.modalAnswer.textContent = answer;
    el.statPlayed.textContent = stats.played || 0;
    const winrate = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    el.statWinrate.textContent = winrate + "%";
    el.statStreak.textContent = stats.streak || 0;
    el.modal.classList.add("show");
  }

  function closeModal() { el.modal.classList.remove("show"); }

  // ---------- Events ----------
  document.addEventListener("keydown", (e) => {
    if (el.modal.classList.contains("show")) return;
    const key = e.key;
    if (key === "Enter") { handleKey("ENTER"); return; }
    if (key === "Backspace") { handleKey("BACKSPACE"); return; }
    const upper = key.toUpperCase();
    if (/^[A-Z]$/.test(upper)) handleKey(upper);
  });

  el.btnAgain.addEventListener("click", () => { closeModal(); newGame(); });

  el.btnHelp.addEventListener("click", () => {
    showToast(lang === "id"
      ? "Hijau = tepat, kuning = salah posisi, abu = tidak ada"
      : "Green = correct spot, yellow = wrong spot, grey = not in word");
  });

  el.btnTheme.addEventListener("click", () => {
    const curr = document.documentElement.getAttribute("data-theme");
    const next = curr === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("wordix-theme", next); } catch (e) {}
  });

  el.btnId.addEventListener("click", () => switchLang("id"));
  el.btnEn.addEventListener("click", () => switchLang("en"));

  function switchLang(newLang) {
    if (newLang === lang) return;
    lang = newLang;
    el.btnId.classList.toggle("active", lang === "id");
    el.btnEn.classList.toggle("active", lang === "en");
    document.documentElement.lang = lang === "id" ? "id" : "en";
    newGame();
  }

  // ---------- Init ----------
  try {
    const savedTheme = localStorage.getItem("wordix-theme");
    if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  } catch (e) {}

  buildKeyboard();
  newGame();
})();
