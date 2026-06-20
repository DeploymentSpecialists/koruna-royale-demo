const STRIPE_PAYMENT_URL = "https://buy.stripe.com/28EcN44914Q65Sy2SG2400i";
const pageMode = document.body.dataset.page === "paid" ? "paid" : "free";

const BET_OPTIONS = [10, 25, 50, 100];
const START_CREDIT = pageMode === "paid" ? 900 : 1000;
const FREE_SPIN_LIMIT = 5;

const symbols = [
  { text: "7", className: "symbol-seven", weight: 7 },
  { text: "BAR", className: "symbol-bar", weight: 10 },
  { text: "🔔", className: "symbol-bell", weight: 13 },
  { text: "🍒", className: "symbol-cherry", weight: 16 },
  { text: "🍋", className: "symbol-lemon", weight: 19 },
  { text: "⭐", className: "symbol-star", weight: 22 }
];

const payTable = {
  "7|7|7": { multiplier: 50, text: "Tři sedmičky" },
  "BAR|BAR|BAR": { multiplier: 25, text: "Tři symboly BAR" },
  "🔔|🔔|🔔": { multiplier: 18, text: "Tři zvonky" },
  "🍒|🍒|🍒": { multiplier: 12, text: "Tři třešně" },
  "🍋|🍋|🍋": { multiplier: 8, text: "Tři citrony" },
  "⭐|⭐|⭐": { multiplier: 6, text: "Tři hvězdy" }
};

const paylines = [
  { name: "horní linie", row: 0 },
  { name: "středová linie", row: 1 },
  { name: "spodní linie", row: 2 }
];

const state = {
  credit: START_CREDIT,
  freeSpins: pageMode === "paid" ? Infinity : FREE_SPIN_LIMIT,
  bet: 10,
  totalSpins: 0,
  winCount: 0,
  bestWin: 0,
  totalWon: 0,
  locked: false,
  spinning: false,
  emailCaptured: false,
  paymentShown: false,
  soundOn: true,
  audioContext: null
};

const els = {
  reels: [...document.querySelectorAll(".reel")],
  spinButton: document.querySelector("#spinButton"),
  creditValue: document.querySelector("#creditValue"),
  freeSpinsValue: document.querySelector("#freeSpinsValue"),
  freeSpinStat: document.querySelector("#freeSpinStat"),
  lastWinValue: document.querySelector("#lastWinValue"),
  totalSpins: document.querySelector("#totalSpins"),
  winCount: document.querySelector("#winCount"),
  bestWin: document.querySelector("#bestWin"),
  totalWon: document.querySelector("#totalWon"),
  betValue: document.querySelector("#betValue"),
  betOptions: document.querySelector("#betOptions"),
  messagePanel: document.querySelector("#messagePanel"),
  jackpotFlash: document.querySelector("#jackpotFlash"),
  coinBurst: document.querySelector("#coinBurst"),
  emailModal: document.querySelector("#emailModal"),
  playerEmail: document.querySelector("#playerEmail"),
  emailError: document.querySelector("#emailError"),
  emailContinueButton: document.querySelector("#emailContinueButton"),
  paymentModal: document.querySelector("#paymentModal"),
  modalReason: document.querySelector("#modalReason"),
  soundToggle: document.querySelector("#soundToggle"),
  payButton: document.querySelector("#payButton"),
  gameCursor: document.querySelector("#gameCursor")
};

function money(value) {
  return `${value.toLocaleString("cs-CZ")} Kč`;
}

function updateUi() {
  els.creditValue.textContent = money(state.credit);
  els.betValue.textContent = money(state.bet);
  els.freeSpinsValue.textContent = pageMode === "paid" ? "Bez limitu" : state.freeSpins;
  els.totalSpins.textContent = state.totalSpins;
  els.winCount.textContent = state.winCount;
  els.bestWin.textContent = money(state.bestWin);
  els.totalWon.textContent = money(state.totalWon);
  els.spinButton.disabled = state.locked || state.spinning || state.credit < state.bet;

  document.querySelectorAll("[data-bet]").forEach((button) => {
    const value = Number(button.dataset.bet);
    button.classList.toggle("is-active", value === state.bet);
    button.disabled = state.spinning || state.locked || value > state.credit;
  });
}

function setMessage(text, isWin = false) {
  els.messagePanel.textContent = text;
  els.messagePanel.classList.toggle("is-win", isWin);
}

function getAudioContext() {
  const AudioApi = window.AudioContext || window.webkitAudioContext;
  if (!AudioApi) return null;
  if (!state.audioContext) state.audioContext = new AudioApi();
  return state.audioContext;
}

function tone(frequency, duration, type = "sine", gain = 0.035, delay = 0) {
  if (!state.soundOn) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  const start = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0, start);
  volume.gain.linearRampToValueAtTime(gain, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume);
  volume.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function playSpinSound() {
  [160, 220, 310, 420].forEach((frequency, index) => {
    tone(frequency, 0.08, "square", 0.014, index * 0.08);
  });
}

function playStopSound(index) {
  tone(230 + index * 70, 0.09, "triangle", 0.025);
}

function playWinSound() {
  [440, 560, 720, 910, 1080].forEach((frequency, index) => {
    tone(frequency, 0.16, "triangle", 0.045, index * 0.075);
  });
}

function randomSymbol() {
  const totalWeight = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const symbol of symbols) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol;
  }
  return symbols[symbols.length - 1];
}

function symbolClass(text) {
  return symbols.find((symbol) => symbol.text === text)?.className || "symbol-star";
}

function evaluateLine(lineSymbols) {
  const exact = payTable[lineSymbols.join("|")];
  if (exact) return exact;

  const sevens = lineSymbols.filter((symbol) => symbol === "7").length;
  if (sevens === 2) {
    return { multiplier: 5, text: "Dvě sedmičky" };
  }

  return null;
}

function evaluateSpin(columns) {
  const wins = [];
  paylines.forEach((payline) => {
    const lineSymbols = columns.map((column) => column[payline.row]);
    const match = evaluateLine(lineSymbols);
    if (match) {
      wins.push({
        ...match,
        amount: match.multiplier * state.bet,
        line: payline.name,
        symbols: lineSymbols
      });
    }
  });
  return wins;
}

function spinResult() {
  const columns = els.reels.map(() => [randomSymbol().text, randomSymbol().text, randomSymbol().text]);
  return { columns, wins: evaluateSpin(columns) };
}

function renderReel(reel, values) {
  reel.innerHTML = values
    .map((value) => `<div class="symbol ${symbolClass(value)}">${value}</div>`)
    .join("");
}

function showWinEffect() {
  document.body.classList.add("is-winning");
  els.jackpotFlash.classList.add("is-active");
  els.coinBurst.innerHTML = "";
  for (let index = 0; index < 22; index += 1) {
    const coin = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 22;
    const distance = 80 + Math.random() * 120;
    coin.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    coin.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    els.coinBurst.appendChild(coin);
  }
  setTimeout(() => {
    document.body.classList.remove("is-winning");
    els.jackpotFlash.classList.remove("is-active");
    els.coinBurst.innerHTML = "";
  }, 920);
}

function openPaymentModal(reason) {
  if (pageMode === "paid") return;
  state.locked = true;
  state.paymentShown = true;
  els.modalReason.textContent = reason;
  els.paymentModal.classList.add("is-open");
  els.paymentModal.setAttribute("aria-hidden", "false");
  updateUi();
  els.payButton.focus();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function openEmailModal() {
  if (pageMode === "paid") return;
  state.locked = true;
  els.emailModal.classList.add("is-open");
  els.emailModal.setAttribute("aria-hidden", "false");
  els.playerEmail.value = "";
  els.emailError.textContent = "";
  els.emailContinueButton.disabled = true;
  updateUi();
  window.setTimeout(() => els.playerEmail.focus(), 60);
}

function closeEmailModal() {
  state.locked = false;
  state.emailCaptured = true;
  els.emailModal.classList.remove("is-open");
  els.emailModal.setAttribute("aria-hidden", "true");
  setMessage("Email je uložený. Automat je odemčený a můžete pokračovat.");
  updateUi();
  els.spinButton.focus();
}

function checkEndState() {
  if (pageMode === "paid") {
    if (state.credit < Math.min(...BET_OPTIONS)) {
      setMessage("Kredit je dohraný. Při novém otevření této stránky se znovu načte 900 Kč.");
    }
    return;
  }

  if (state.totalSpins === 3 && !state.emailCaptured) {
    window.setTimeout(openEmailModal, 420);
    return;
  }

  if (state.totalSpins >= FREE_SPIN_LIMIT && !state.paymentShown) {
    window.setTimeout(() => openPaymentModal("Právě jste využili všech 5 bezplatných pokusů."), 420);
  }
}

function chooseBet(value) {
  if (state.spinning || state.locked || value > state.credit) return;
  state.bet = value;
  setMessage(`Sázka nastavena na ${money(value)}. Každý spin je nezávislý a náhodný.`);
  updateUi();
}

async function spin() {
  if (state.locked || state.spinning) return;

  if (state.credit < state.bet) {
    const affordableBet = BET_OPTIONS.filter((value) => value <= state.credit).pop();
    if (affordableBet) {
      chooseBet(affordableBet);
      setMessage(`Kredit nestačí na původní sázku. Snížil jsem sázku na ${money(affordableBet)}.`);
    } else {
      setMessage(pageMode === "paid"
        ? "Kredit je dohraný. Otevřete stránku znovu pro nové nabití 900 Kč."
        : "Kredit nestačí na další zatočení.");
    }
    return;
  }

  state.spinning = true;
  document.body.classList.add("is-spinning");
  state.credit = Math.max(0, state.credit - state.bet);
  state.totalSpins += 1;
  if (pageMode === "free" && state.freeSpins > 0) state.freeSpins -= 1;
  els.lastWinValue.textContent = money(0);
  setMessage(`Sázka ${money(state.bet)} přijata. Válce se roztáčí...`);
  updateUi();
  playSpinSound();

  const { columns, wins } = spinResult();
  els.reels.forEach((reel) => reel.classList.add("is-spinning"));

  await Promise.all(
    els.reels.map((reel, index) => new Promise((resolve) => {
      const interval = window.setInterval(() => {
        renderReel(reel, [randomSymbol().text, randomSymbol().text, randomSymbol().text]);
      }, 58);
      window.setTimeout(() => {
        window.clearInterval(interval);
        renderReel(reel, columns[index]);
        reel.classList.remove("is-spinning");
        playStopSound(index);
        resolve();
      }, 760 + index * 310);
    }))
  );

  if (wins.length) {
    const totalWin = wins.reduce((sum, win) => sum + win.amount, 0);
    const bestLineWin = wins.reduce((best, win) => Math.max(best, win.amount), 0);
    state.credit += totalWin;
    state.winCount += 1;
    state.bestWin = Math.max(state.bestWin, bestLineWin);
    state.totalWon += totalWin;
    els.lastWinValue.textContent = money(totalWin);
    const lineText = wins.map((win) => `${win.line}: ${win.text} (${win.multiplier}x)`).join(", ");
    setMessage(`${wins.length} výherní linie. ${lineText}. Připsáno ${money(totalWin)}.`, true);
    showWinEffect();
    playWinSound();
  } else {
    setMessage("Bez výherní kombinace. Další spin je opět nezávislý a náhodný.");
  }

  state.spinning = false;
  document.body.classList.remove("is-spinning");
  updateUi();
  checkEndState();
}

function setupCursor() {
  if (!window.matchMedia("(pointer: fine)").matches || !els.gameCursor) return;
  window.addEventListener("mousemove", (event) => {
    els.gameCursor.style.opacity = "1";
    els.gameCursor.style.transform = `translate(${event.clientX - 17}px, ${event.clientY - 17}px)`;
  });
  document.querySelectorAll("button, a, label").forEach((element) => {
    element.addEventListener("mouseenter", () => els.gameCursor.classList.add("is-active"));
    element.addEventListener("mouseleave", () => els.gameCursor.classList.remove("is-active"));
  });
}

function bindEvents() {
  els.payButton.href = STRIPE_PAYMENT_URL;
  els.spinButton.addEventListener("click", spin);

  els.betOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bet]");
    if (!button) return;
    chooseBet(Number(button.dataset.bet));
  });

  els.soundToggle.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    els.soundToggle.classList.toggle("is-muted", !state.soundOn);
    els.soundToggle.setAttribute("aria-label", state.soundOn ? "Vypnout zvuk" : "Zapnout zvuk");
  });

  els.playerEmail.addEventListener("input", () => {
    const valid = isValidEmail(els.playerEmail.value);
    els.emailContinueButton.disabled = !valid;
    els.emailError.textContent = els.playerEmail.value && !valid ? "Zadejte platnou emailovou adresu." : "";
  });

  els.playerEmail.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !els.emailContinueButton.disabled) closeEmailModal();
  });

  els.emailContinueButton.addEventListener("click", () => {
    if (isValidEmail(els.playerEmail.value)) closeEmailModal();
  });
}

function initReels() {
  els.reels.forEach((reel) => {
    renderReel(reel, [randomSymbol().text, randomSymbol().text, randomSymbol().text]);
  });
}

initReels();
bindEvents();
setupCursor();
updateUi();
