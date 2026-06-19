const STRIPE_PAYMENT_URL = "https://buy.stripe.com/28EcN44914Q65Sy2SG2400i";
const pageMode = document.body.dataset.page === "paid" ? "paid" : "free";

const symbols = [
  { text: "7", className: "symbol-seven", weight: 7 },
  { text: "BAR", className: "symbol-bar", weight: 10 },
  { text: "★", className: "symbol-star", weight: 15 },
  { text: "K", className: "symbol-crown", weight: 13 },
  { text: "◆", className: "symbol-gem", weight: 18 },
  { text: "CZ", className: "symbol-bar", weight: 22 }
];

const payTable = {
  "7|7|7": { amount: 500, text: "Královský jackpot" },
  "BAR|BAR|BAR": { amount: 250, text: "Klasická linie BAR" },
  "K|K|K": { amount: 200, text: "Tři koruny" },
  "★|★|★": { amount: 150, text: "Zlatá hvězda" },
  "◆|◆|◆": { amount: 100, text: "Diamantová řada" },
  "CZ|CZ|CZ": { amount: 50, text: "Česká trojice" }
};

const state = {
  credit: pageMode === "paid" ? 900 : 1000,
  freeSpins: pageMode === "paid" ? 0 : 5,
  bet: 50,
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
  els.freeSpinsValue.textContent = pageMode === "paid" ? "VIP" : state.freeSpins;
  els.totalSpins.textContent = state.totalSpins;
  els.winCount.textContent = state.winCount;
  els.bestWin.textContent = money(state.bestWin);
  els.totalWon.textContent = money(state.totalWon);
  els.spinButton.disabled = state.locked || state.spinning || state.credit < state.bet;
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

function evaluatePayline(result) {
  const exact = payTable[result.join("|")];
  if (exact) return exact;

  const sevens = result.filter((symbol) => symbol === "7").length;
  if (sevens === 2) {
    return { amount: 75, text: "Dvě sedmičky na středové linii" };
  }

  return null;
}

function spinResult() {
  const result = [randomSymbol().text, randomSymbol().text, randomSymbol().text];
  return { result, win: evaluatePayline(result) };
}

function symbolClass(text) {
  return symbols.find((symbol) => symbol.text === text)?.className || "symbol-seven";
}

function renderReel(reel, centerText) {
  const values = [randomSymbol().text, centerText, randomSymbol().text];
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
  setMessage("Email je uložený. Automat je odemčený a můžete pokračovat ke 4. zatočení.");
  updateUi();
  els.spinButton.focus();
}

function unlockAfterConfirmation() {
  state.locked = false;
  if (pageMode === "paid") {
    state.credit = 900;
    state.totalSpins = 0;
    state.emailCaptured = false;
    state.paymentShown = false;
    setMessage("Kredit byl obnoven na 900 Kč. Můžete pokračovat ve hře.");
  } else {
    window.location.href = "./paid.html";
    return;
  }
  els.paymentModal.classList.remove("is-open");
  els.paymentModal.setAttribute("aria-hidden", "true");
  updateUi();
  els.spinButton.focus();
}

function checkEndState() {
  if (state.totalSpins === 3 && !state.emailCaptured) {
    window.setTimeout(openEmailModal, 420);
    return;
  }

  if (pageMode === "free" && state.totalSpins >= 5 && !state.paymentShown) {
    window.setTimeout(() => openPaymentModal("Právě jste využili všech 5 bezplatných pokusů."), 420);
    return;
  }

  if (pageMode === "paid" && state.totalSpins >= 5 && !state.paymentShown) {
    window.setTimeout(() => openPaymentModal("Máte za sebou 5. kolo. Pro pokračování prosím proveďte platbu."), 420);
    return;
  }

  if (pageMode === "paid" && state.credit < state.bet) {
    window.setTimeout(() => openPaymentModal("Váš kredit 900 Kč byl vyčerpán."), 420);
  }
}

async function spin() {
  if (state.locked || state.spinning || state.credit < state.bet) return;

  state.spinning = true;
  document.body.classList.add("is-spinning");
  state.credit = Math.max(0, state.credit - state.bet);
  state.totalSpins += 1;
  if (pageMode === "free" && state.freeSpins > 0) state.freeSpins -= 1;
  els.lastWinValue.textContent = money(0);
  setMessage("Válce se roztáčí...");
  updateUi();
  playSpinSound();

  const { result, win } = spinResult();
  els.reels.forEach((reel) => reel.classList.add("is-spinning"));

  await Promise.all(
    els.reels.map((reel, index) => new Promise((resolve) => {
      const interval = window.setInterval(() => renderReel(reel, randomSymbol().text), 58);
      window.setTimeout(() => {
        window.clearInterval(interval);
        renderReel(reel, result[index]);
        reel.classList.remove("is-spinning");
        playStopSound(index);
        resolve();
      }, 760 + index * 310);
    }))
  );

  if (win) {
    state.credit += win.amount;
    state.winCount += 1;
    state.bestWin = Math.max(state.bestWin, win.amount);
    state.totalWon += win.amount;
    els.lastWinValue.textContent = money(win.amount);
    setMessage(`${win.text}: vyhráli jste ${money(win.amount)}.`, true);
    showWinEffect();
    playWinSound();
  } else {
    setMessage("Tentokrát bez výhry. Výsledky jsou pouze demonstrační.");
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

els.payButton.href = STRIPE_PAYMENT_URL;
els.spinButton.addEventListener("click", spin);

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

setupCursor();
updateUi();
