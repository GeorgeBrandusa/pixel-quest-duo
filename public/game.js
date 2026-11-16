const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const logicalWidth = 960;
const logicalHeight = 540;
const defaultControls = {
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  attack: "KeyJ",
  interact: "KeyE",
  inventory: "KeyI",
};
const resolutionOptions = [640, 960, 1280];

function loadPreferences() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("pixel-quest-settings") ?? "null");
  } catch (error) {
    console.warn("Could not read saved game settings.", error);
    return { controls: { ...defaultControls }, resolution: 960, soundVolume: 70 };
  }

  const controls = { ...defaultControls };
  const candidateControls = saved?.controls;
  if (candidateControls && typeof candidateControls === "object") {
    for (const action of Object.keys(defaultControls)) {
      const code = candidateControls[action];
      if (typeof code === "string" && code.length <= 32) controls[action] = code;
    }
  }
  const usedCodes = Object.values(controls);
  if (new Set(usedCodes).size !== usedCodes.length) Object.assign(controls, defaultControls);
  return {
    controls,
    resolution: resolutionOptions.includes(saved?.resolution) ? saved.resolution : 960,
    soundVolume: Number.isFinite(saved?.soundVolume) ? Math.max(0, Math.min(100, saved.soundVolume)) : 70,
  };
}

const preferences = loadPreferences();
const ui = {
  status: document.querySelector("#connection-status"),
  connectionLabel: document.querySelector("#connection-label"),
  screens: {
    home: document.querySelector("#screen-home"),
    settings: document.querySelector("#screen-settings"),
    lobby: document.querySelector("#screen-lobby"),
    loading: document.querySelector("#screen-loading"),
    game: document.querySelector("#screen-game"),
  },
  canvasHosts: {
    home: document.querySelector("#home-art-frame"),
    settings: document.querySelector("#settings-art-frame"),
    lobby: document.querySelector("#lobby-art-frame"),
    loading: document.querySelector("#loading-art-frame"),
    game: document.querySelector("#game-frame"),
  },
  name: document.querySelector("#player-name"),
  codeInput: document.querySelector("#room-code"),
  message: document.querySelector("#form-message"),
  create: document.querySelector("#create-room"),
  join: document.querySelector("#join-room"),
  activeCode: document.querySelector("#active-room-code"),
  copy: document.querySelector("#copy-code"),
  count: document.querySelector("#crew-count"),
  lobbyDifficulty: document.querySelector("#lobby-difficulty"),
  lobbyDifficultyDetail: document.querySelector("#lobby-difficulty-detail"),
  players: document.querySelector("#player-list"),
  start: document.querySelector("#start-quest"),
  hostNote: document.querySelector("#host-note"),
  leave: document.querySelector("#leave-room"),
  overlay: document.querySelector("#game-overlay"),
  overlayTitle: document.querySelector("#overlay-title"),
  overlayCopy: document.querySelector("#overlay-copy"),
  finishHome: document.querySelector("#finish-home"),
  gameCode: document.querySelector("#game-room-code"),
  gameCount: document.querySelector("#game-player-count"),
  gameDifficulty: document.querySelector("#game-difficulty"),
  levelIndex: document.querySelector("#game-level-index"),
  levelName: document.querySelector("#game-level-name"),
  objective: document.querySelector("#objective-label"),
  loadingLevelIndex: document.querySelector("#loading-level-index"),
  loadingLevelName: document.querySelector("#loading-level-name"),
  gear: document.querySelector("#gear-summary"),
  health: document.querySelector("#game-health"),
  healthFill: document.querySelector("#health-fill"),
  lives: document.querySelector("#game-lives"),
  interactPrompt: document.querySelector("#interact-prompt"),
  interactLabel: document.querySelector("#interact-label"),
  loadingCode: document.querySelector("#loading-room-code"),
  pause: document.querySelector("#pause-game"),
  pauseOverlay: document.querySelector("#pause-overlay"),
  resume: document.querySelector("#resume-game"),
  exit: document.querySelector("#exit-game"),
  openInventory: document.querySelector("#open-inventory"),
  inventoryOverlay: document.querySelector("#inventory-overlay"),
  closeInventory: document.querySelector("#close-inventory"),
  inventoryItems: document.querySelector("#inventory-items"),
  inventoryCount: document.querySelector("#inventory-item-count"),
  inventoryMessage: document.querySelector("#inventory-message"),
  tradePlayerList: document.querySelector("#trade-player-list"),
  incomingTrade: document.querySelector("#incoming-trade"),
  incomingTradeCopy: document.querySelector("#incoming-trade-copy"),
  acceptTrade: document.querySelector("#accept-trade"),
  declineTrade: document.querySelector("#decline-trade"),
  activeTrade: document.querySelector("#active-trade"),
  tradeItemSelect: document.querySelector("#trade-item-select"),
  setTradeOffer: document.querySelector("#set-trade-offer"),
  yourOffer: document.querySelector("#your-offer"),
  theirOffer: document.querySelector("#their-offer"),
  otherOfferLabel: document.querySelector("#other-offer-label"),
  yourLockStatus: document.querySelector("#your-lock-status"),
  theirLockStatus: document.querySelector("#their-lock-status"),
  lockTrade: document.querySelector("#lock-trade"),
  cancelTrade: document.querySelector("#cancel-trade"),
  openSettings: document.querySelector("#open-settings"),
  settingsBack: document.querySelector("#settings-back"),
  pauseSettings: document.querySelector("#pause-settings"),
  resetControls: document.querySelector("#reset-controls"),
  settingsFeedback: document.querySelector("#settings-feedback"),
  resolutionSetting: document.querySelector("#resolution-setting"),
  soundSetting: document.querySelector("#sound-setting"),
  soundValue: document.querySelector("#sound-value"),
  testSound: document.querySelector("#test-sound"),
};

const state = {
  socket: null,
  id: null,
  room: null,
  snapshots: [],
  keys: { left: false, right: false, jump: false, attack: false, interact: false },
  pressedCodes: new Set(),
  mouseAttack: false,
  touch: { left: false, right: false, jump: false, attack: false, interact: false },
  joined: false,
  leaving: false,
  screen: "home",
  paused: false,
  levelIndex: null,
  inventoryOpen: false,
  inventorySignature: null,
  tradeInvite: null,
  trade: null,
  tradeMessage: null,
  preferences,
  settingsReturnScreen: "home",
  settingsReturnPaused: false,
  bindingAction: null,
  audioContext: null,
};

let loadingTimer = null;
let mouseAttackReleaseTimer = null;

function showScreen(name) {
  state.screen = name;
  for (const [screenName, element] of Object.entries(ui.screens)) {
    const active = screenName === name;
    element.hidden = !active;
    element.classList.toggle("is-active", active);
  }
  if (ui.canvasHosts[name]) ui.canvasHosts[name].append(canvas);
  document.body.classList.toggle("game-open", name === "game");
}

function savePreferences() {
  try {
    localStorage.setItem("pixel-quest-settings", JSON.stringify(state.preferences));
  } catch (error) {
    console.warn("Could not save game settings.", error);
    ui.settingsFeedback.textContent = "Settings could not be saved in this browser.";
  }
}

function formatKey(code) {
  if (code === "Space") return "SPACE";
  if (code.startsWith("Key")) return code.slice(3).toUpperCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "ArrowLeft") return "←";
  if (code === "ArrowRight") return "→";
  if (code === "ArrowUp") return "↑";
  if (code === "ArrowDown") return "↓";
  if (code.startsWith("Numpad")) return `NUM ${code.slice(6)}`;
  return code.toUpperCase();
}

function renderSettings() {
  for (const button of document.querySelectorAll("[data-bind]")) {
    const action = button.dataset.bind;
    button.textContent = state.bindingAction === action ? "PRESS KEY…" : formatKey(state.preferences.controls[action]);
    button.setAttribute("aria-label", `Change ${action} key, currently ${formatKey(state.preferences.controls[action])}`);
  }
  ui.resolutionSetting.value = String(state.preferences.resolution);
  ui.soundSetting.value = String(state.preferences.soundVolume);
  ui.soundValue.textContent = `${state.preferences.soundVolume}%`;
  for (const label of document.querySelectorAll("[data-control-label]")) {
    label.textContent = formatKey(state.preferences.controls[label.dataset.controlLabel]);
  }
}

function clearGameplayInput() {
  clearTimeout(mouseAttackReleaseTimer);
  mouseAttackReleaseTimer = null;
  state.keys = { left: false, right: false, jump: false, attack: false, interact: false };
  state.pressedCodes.clear();
  state.mouseAttack = false;
  state.touch = { left: false, right: false, jump: false, attack: false, interact: false };
}

function openSettings() {
  if (state.screen === "settings") return;
  state.settingsReturnScreen = state.screen;
  state.settingsReturnPaused = state.paused;
  if (state.screen === "game") {
    state.paused = true;
    clearGameplayInput();
  }
  state.bindingAction = null;
  ui.settingsFeedback.textContent = "";
  renderSettings();
  showScreen("settings");
}

function closeSettings() {
  state.bindingAction = null;
  state.paused = state.settingsReturnPaused;
  showScreen(state.settingsReturnScreen);
  if (state.settingsReturnScreen === "game") ui.pauseOverlay.hidden = !state.paused;
}

function refreshKeyboardInputs() {
  for (const action of ["left", "right", "jump", "interact"]) {
    state.keys[action] = state.pressedCodes.has(state.preferences.controls[action]);
  }
  state.keys.attack = state.pressedCodes.has(state.preferences.controls.attack) || state.mouseAttack;
}

function playSound(kind = "tap") {
  if (state.preferences.soundVolume <= 0 || !window.AudioContext) return;
  if (!state.audioContext) state.audioContext = new AudioContext();
  const audio = state.audioContext;
  const playTone = () => {
    const now = audio.currentTime;
    const settings = kind === "hit" ? { frequency: 150, duration: 0.15, type: "sawtooth" }
      : kind === "pickup" ? { frequency: 720, duration: 0.19, type: "sine" }
        : kind === "attack" ? { frequency: 310, duration: 0.08, type: "square" }
          : { frequency: 480, duration: 0.12, type: "sine" };
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    volume.gain.setValueAtTime(state.preferences.soundVolume / 100 * 0.12, now);
    volume.gain.exponentialRampToValueAtTime(0.001, now + settings.duration);
    oscillator.connect(volume);
    volume.connect(audio.destination);
    oscillator.start(now);
    oscillator.stop(now + settings.duration);
  };
  if (audio.state === "suspended") {
    audio.resume().then(playTone).catch((error) => console.warn("Could not start game audio.", error));
  } else {
    playTone();
  }
}

function setConnection(label, kind = "") {
  ui.connectionLabel.textContent = label;
  ui.status.className = `connection-status ${kind}`;
}

function setMessage(message) {
  ui.message.textContent = message;
}

function send(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify(payload));
}

function connect(payload) {
  if (state.socket && state.socket.readyState <= WebSocket.OPEN) return;
  setMessage("");
  ui.create.disabled = true;
  ui.join.disabled = true;
  setConnection("Connecting…");
  state.leaving = false;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}`);
  state.socket = socket;
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ ...payload, name: ui.name.value.trim() || "Adventurer" }));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "joined") {
      state.joined = true;
      state.id = message.id;
      showScreen("lobby");
      ui.activeCode.textContent = message.code;
      ui.loadingCode.textContent = message.code;
      setConnection("Connected", "connected");
      setMessage("");
    } else if (message.type === "state") {
      const previousSnapshot = state.snapshots.at(-1);
      if (previousSnapshot && previousSnapshot.room.levelIndex === message.levelIndex) {
        const previousPlayer = previousSnapshot.room.players.find((player) => player.id === state.id);
        const currentPlayer = message.players.find((player) => player.id === state.id);
        if (previousPlayer && currentPlayer && currentPlayer.health < previousPlayer.health) playSound("hit");
        if (message.lootNotice && message.lootNotice !== previousSnapshot.room.lootNotice) playSound("pickup");
      }
      if (!previousSnapshot || previousSnapshot.room.levelIndex !== message.levelIndex) state.snapshots = [];
      state.snapshots.push({ time: performance.now(), room: message });
      if (state.snapshots.length > 6) state.snapshots.shift();
      state.room = message;
      renderRoom(message);
      if (state.inventoryOpen) renderInventory();
    } else if (message.type === "trade-invite") {
      state.tradeInvite = message;
      state.tradeMessage = `${message.fromName} wants to trade with you.`;
      openInventory();
      renderInventory(true);
    } else if (message.type === "trade-state") {
      state.trade = message;
      state.tradeInvite = null;
      state.tradeMessage = null;
      openInventory();
      renderInventory(true);
    } else if (message.type === "trade-result") {
      state.trade = null;
      state.tradeInvite = null;
      state.tradeMessage = message.message;
      renderInventory(true);
    } else if (message.type === "error") {
      setMessage(message.message);
      if (!state.joined) {
        ui.create.disabled = false;
        ui.join.disabled = false;
        setConnection("Not connected");
        socket.close();
      }
    }
  });
  socket.addEventListener("error", () => {
    if (!state.joined) setMessage("Couldn't reach the game server. Try again.");
    setConnection("Connection trouble", "error");
    ui.create.disabled = false;
    ui.join.disabled = false;
  });
  socket.addEventListener("close", () => {
    if (state.leaving) return;
    if (!state.joined) {
      ui.create.disabled = false;
      ui.join.disabled = false;
      setConnection("Not connected");
      return;
    }
    setMessage("You were disconnected from the room.");
    resetRoom();
  });
}

function renderRoom(room) {
  const levelChanged = state.levelIndex !== null && state.levelIndex !== room.levelIndex;
  state.levelIndex = room.levelIndex;
  ui.activeCode.textContent = room.code;
  ui.count.textContent = `${room.players.length} / 4`;
  ui.gameCode.textContent = room.code;
  ui.gameCount.textContent = `${room.players.length} / 4 PLAYERS`;
  ui.gameDifficulty.textContent = room.difficulty.name;
  const partyNames = ["SOLO", "PAIR", "TRIO", "SQUAD"];
  ui.lobbyDifficulty.textContent = `${partyNames[room.difficulty.playerCount - 1]} · ${room.difficulty.name}`;
  ui.lobbyDifficultyDetail.textContent = `${room.chests.length} chest${room.chests.length === 1 ? "" : "s"} · ${room.enemyCount} monster${room.enemyCount === 1 ? "" : "s"}`;
  ui.loadingCode.textContent = room.code;
  ui.levelIndex.textContent = `LVL ${String(room.levelIndex + 1).padStart(2, "0")} / ${room.levelCount}`;
  ui.levelName.textContent = room.levelName;
  ui.loadingLevelIndex.textContent = `WORLD ${String(room.levelIndex + 1).padStart(2, "0")} / ${room.levelCount}`;
  ui.loadingLevelName.textContent = room.levelName;
  ui.players.replaceChildren();
  for (const player of room.players) {
    const row = document.createElement("li");
    row.className = "player-row";
    const swatch = document.createElement("span");
    swatch.className = "player-swatch";
    swatch.style.backgroundColor = player.color;
    const name = document.createElement("span");
    name.textContent = player.name + (player.atDoor ? "  ✓" : "");
    const role = document.createElement("span");
    role.className = "player-role";
    role.textContent = player.id === room.hostId ? "HOST" : "PLAYER";
    row.append(swatch, name, role);
    ui.players.append(row);
  }
  if (room.players.length < 4) {
    const waiting = document.createElement("li");
    waiting.className = "player-waiting";
    waiting.textContent = "Waiting for adventurers…";
    ui.players.append(waiting);
  }

  const isHost = state.id === room.hostId;
  ui.start.hidden = room.started || !isHost;
  ui.hostNote.hidden = room.started;
  ui.hostNote.textContent = isHost
    ? "You are the host. Share your code to invite up to 3 friends."
    : "The host will start the quest when the crew is ready.";
  const me = room.players.find((player) => player.id === state.id);
  const aliveEnemies = room.enemies.filter((enemy) => enemy.health > 0).length;
  const health = Math.max(0, Math.min(3, me?.health ?? 3));
  const filledHearts = Math.ceil(health);
  ui.health.textContent = `${"♥ ".repeat(filledHearts).trim()}${health < 3 ? `  ${"♡ ".repeat(3 - filledHearts).trim()}` : ""}`;
  ui.health.setAttribute("aria-label", `${health.toFixed(1)} of 3 health`);
  ui.healthFill.style.width = `${health / 3 * 100}%`;
  ui.healthFill.parentElement.setAttribute("aria-valuenow", health.toFixed(1));
  ui.lives.textContent = `LIVES ${me?.lives ?? 3} · CP ${String(room.checkpointLevel).padStart(2, "0")} · NEXT ${String(room.nextCheckpointLevel).padStart(2, "0")}`;
  const items = me?.inventory?.items ?? [];
  const weapon = items.find((item) => item.type === "weapon" && item.equipped);
  const armorParts = items.filter((item) => item.type === "armor" && item.equipped).map((item) => item.name);
  const armorLabel = armorParts.length ? armorParts.join(" · ").toUpperCase() : "NO ARMOR";
  ui.gear.textContent = `${(weapon?.name ?? "NO WEAPON").toUpperCase()} · DMG ${weapon?.damage ?? 0} · ${armorLabel}`;
  if (me?.lives === 0) {
    ui.objective.textContent = `Down · waiting for a teammate to reach checkpoint ${String(room.nextCheckpointLevel).padStart(2, "0")}.`;
  } else if (room.lootNotice) {
    ui.objective.textContent = room.lootNotice.startsWith("CHECKPOINT")
      || room.lootNotice.startsWith("Back to checkpoint")
      ? room.lootNotice
      : `Found ${room.lootNotice}!`;
  } else if (room.completed) {
    ui.objective.textContent = "The whole crew made it through!";
  } else if (room.keyCollected) {
    ui.objective.textContent = "Key found. Gather the living crew at the door.";
  } else if (room.bossLoot) {
    ui.objective.textContent = "Boss loot dropped. Claim it to reveal the key.";
  } else if (room.keyAvailable) {
    ui.objective.textContent = "The key is revealed. Find it, then reach the door.";
  } else {
    ui.objective.textContent = `Defeat the monsters to find the key · ${aliveEnemies} left`;
  }
  const isNear = (object) => Boolean(me && object
    && Math.abs(me.x + 14 - object.x) < 70
    && Math.abs(me.y + 18 - object.y) < 60);
  const nearbyChest = room.chests.find((chest) => !chest.opened && isNear(chest));
  const nearbyBossLoot = !nearbyChest && isNear(room.bossLoot);
  ui.interactPrompt.hidden = !room.started || (!nearbyChest && !nearbyBossLoot);
  ui.interactLabel.textContent = nearbyChest ? "OPEN CHEST" : "CLAIM BOSS LOOT";
  ui.overlay.hidden = !room.started || (!room.completed && !me?.atDoor);
  ui.finishHome.hidden = !room.completed;
  ui.pause.disabled = !room.started || room.completed;
  if (room.completed) {
    ui.overlayTitle.textContent = "The crew made it!";
    ui.overlayCopy.textContent = `All ${room.levelCount} trails crossed. One excellent team.`;
  } else if (me?.atDoor) {
    ui.overlayTitle.textContent = "Door unlocked!";
    ui.overlayCopy.textContent = "Waiting for the rest of the crew.";
  }
  if (room.started && (levelChanged || (state.screen !== "game" && state.screen !== "loading" && state.screen !== "settings"))) {
    state.paused = false;
    beginLoading();
  }
}

function openInventory() {
  state.inventoryOpen = true;
  state.inventorySignature = null;
  ui.inventoryOverlay.hidden = false;
  renderInventory(true);
}

function closeInventory() {
  state.inventoryOpen = false;
  ui.inventoryOverlay.hidden = true;
  state.inventorySignature = null;
}

function renderInventory(force = false) {
  if (!state.inventoryOpen || !state.room) return;
  const me = state.room.players.find((player) => player.id === state.id);
  if (!me) return;
  const signature = JSON.stringify({
    items: me.inventory.items,
    players: state.room.players.map((player) => ({ id: player.id, name: player.name })),
    trade: state.trade,
    invite: state.tradeInvite,
    message: state.tradeMessage,
  });
  if (!force && signature === state.inventorySignature) return;
  state.inventorySignature = signature;
  ui.inventoryMessage.textContent = state.tradeMessage || "Equip your finds or trade with a nearby player.";
  ui.inventoryCount.textContent = `${me.inventory.items.length} ITEM${me.inventory.items.length === 1 ? "" : "S"}`;
  ui.inventoryItems.replaceChildren();
  ui.tradeItemSelect.replaceChildren();
  const noOffer = document.createElement("option");
  noOffer.value = "";
  noOffer.textContent = "No item";
  ui.tradeItemSelect.append(noOffer);

  for (const item of me.inventory.items) {
    const row = document.createElement("li");
    row.className = "inventory-item";
    const info = document.createElement("span");
    info.className = "inventory-item-info";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const detail = document.createElement("span");
    detail.textContent = item.type === "weapon" ? `WEAPON · ${item.damage} DAMAGE` : `ARMOR · ${item.armor} DEFENSE`;
    info.append(name, detail);
    const equipped = document.createElement("span");
    equipped.className = "inventory-item-state";
    equipped.textContent = item.equipped ? "EQUIPPED" : "STORED";
    const equip = document.createElement("button");
    equip.className = "inventory-action";
    equip.type = "button";
    equip.dataset.equipItem = item.id;
    equip.textContent = item.type === "armor" && item.equipped ? "UNEQUIP" : item.equipped ? "ACTIVE" : "EQUIP";
    equip.disabled = item.type === "weapon" && item.equipped;
    row.append(info, equipped, equip);
    ui.inventoryItems.append(row);

    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} · ${detail.textContent}`;
    ui.tradeItemSelect.append(option);
  }
  if (!me.inventory.items.length) {
    const empty = document.createElement("li");
    empty.className = "inventory-empty";
    empty.textContent = "No items yet.";
    ui.inventoryItems.append(empty);
  }

  ui.tradePlayerList.replaceChildren();
  for (const player of state.room.players.filter((entry) => entry.id !== state.id)) {
    const row = document.createElement("li");
    row.className = "trade-player-row";
    const name = document.createElement("span");
    name.className = "trade-player-name";
    name.textContent = player.name;
    const trade = document.createElement("button");
    trade.className = "inventory-action";
    trade.type = "button";
    trade.dataset.tradePlayer = player.id;
    trade.textContent = player.tradeId ? "TRADING" : "TRADE";
    trade.disabled = Boolean(player.tradeId || me.tradeId);
    row.append(name, trade);
    ui.tradePlayerList.append(row);
  }
  if (state.room.players.length === 1) {
    const empty = document.createElement("li");
    empty.className = "inventory-empty";
    empty.textContent = "No other players in this room.";
    ui.tradePlayerList.append(empty);
  }

  ui.incomingTrade.hidden = !state.tradeInvite;
  if (state.tradeInvite) ui.incomingTradeCopy.textContent = `${state.tradeInvite.fromName} wants to trade with you.`;
  ui.activeTrade.hidden = !state.trade;
  if (state.trade) {
    const ownOffer = state.trade.participants.find((entry) => entry.id === state.id);
    const otherOffer = state.trade.participants.find((entry) => entry.id !== state.id);
    ui.yourOffer.textContent = ownOffer.offer?.name ?? "Nothing selected";
    ui.theirOffer.textContent = otherOffer.offer?.name ?? "Nothing selected";
    ui.tradeItemSelect.value = ownOffer.offer?.id ?? "";
    ui.otherOfferLabel.textContent = `${otherOffer.name.toUpperCase()} OFFERS`;
    ui.yourLockStatus.textContent = ownOffer.locked ? "OFFER LOCKED" : "";
    ui.theirLockStatus.textContent = otherOffer.locked ? "OFFER LOCKED" : "WAITING FOR THEIR OFFER";
    ui.tradeItemSelect.disabled = ownOffer.locked;
    ui.setTradeOffer.disabled = ownOffer.locked;
    ui.lockTrade.disabled = ownOffer.locked;
    ui.lockTrade.textContent = ownOffer.locked ? "WAITING FOR PLAYER" : "LOCK MY OFFER";
  }
}

function resetRoom() {
  clearTimeout(loadingTimer);
  state.socket = null;
  state.room = null;
  state.snapshots = [];
  state.id = null;
  state.joined = false;
  state.paused = false;
  clearGameplayInput();
  state.levelIndex = null;
  state.inventoryOpen = false;
  state.inventorySignature = null;
  state.tradeInvite = null;
  state.trade = null;
  state.tradeMessage = null;
  state.settingsReturnScreen = "home";
  state.settingsReturnPaused = false;
  ui.overlay.hidden = true;
  ui.pauseOverlay.hidden = true;
  ui.inventoryOverlay.hidden = true;
  ui.create.disabled = false;
  ui.join.disabled = false;
  showScreen("home");
  setConnection("Not connected");
}

function beginLoading() {
  clearTimeout(loadingTimer);
  ui.pauseOverlay.hidden = true;
  showScreen("loading");
  loadingTimer = setTimeout(() => {
    if (state.room?.started && state.screen === "loading") showScreen("game");
  }, 1450);
}

function leaveRoom() {
  state.leaving = true;
  state.socket?.close();
  resetRoom();
}

function togglePause(paused = !state.paused) {
  if (!state.room?.started) return;
  state.paused = paused;
  if (paused) {
    clearGameplayInput();
    state.touch = { left: false, right: false, jump: false, attack: false, interact: false };
  }
  ui.pauseOverlay.hidden = !paused;
}

ui.create.addEventListener("click", () => connect({ type: "create" }));
ui.join.addEventListener("click", () => {
  const code = ui.codeInput.value.trim().toUpperCase();
  if (code.length !== 6) return setMessage("Enter the 6-letter room code.");
  connect({ type: "join", code });
});
ui.codeInput.addEventListener("input", () => {
  ui.codeInput.value = ui.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
ui.codeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") ui.join.click();
});
ui.name.addEventListener("keydown", (event) => {
  if (event.key === "Enter") ui.create.click();
});
ui.start.addEventListener("click", () => send({ type: "start" }));
ui.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(ui.activeCode.textContent);
    ui.copy.textContent = "COPIED";
    setTimeout(() => { ui.copy.textContent = "COPY"; }, 1200);
  } catch {
    setMessage(`Room code: ${ui.activeCode.textContent}`);
  }
});
ui.leave.addEventListener("click", leaveRoom);
ui.exit.addEventListener("click", leaveRoom);
ui.finishHome.addEventListener("click", leaveRoom);
ui.pause.addEventListener("click", () => togglePause(true));
ui.resume.addEventListener("click", () => togglePause(false));
ui.openInventory.addEventListener("click", openInventory);
ui.openSettings.addEventListener("click", openSettings);
ui.settingsBack.addEventListener("click", closeSettings);
ui.pauseSettings.addEventListener("click", openSettings);
ui.resetControls.addEventListener("click", () => {
  state.preferences.controls = { ...defaultControls };
  state.bindingAction = null;
  ui.settingsFeedback.textContent = "Controls restored to defaults.";
  savePreferences();
  renderSettings();
});
document.querySelector(".control-bindings").addEventListener("click", (event) => {
  const button = event.target.closest("[data-bind]");
  if (!button) return;
  state.bindingAction = button.dataset.bind;
  ui.settingsFeedback.textContent = `Press a key for ${button.textContent.toLowerCase()}.`;
  renderSettings();
});
ui.resolutionSetting.addEventListener("change", () => {
  state.preferences.resolution = Number(ui.resolutionSetting.value);
  applyResolution();
  savePreferences();
});
ui.soundSetting.addEventListener("input", () => {
  state.preferences.soundVolume = Number(ui.soundSetting.value);
  ui.soundValue.textContent = `${state.preferences.soundVolume}%`;
  savePreferences();
});
ui.testSound.addEventListener("click", () => playSound("pickup"));
ui.closeInventory.addEventListener("click", closeInventory);
ui.inventoryOverlay.addEventListener("click", (event) => {
  if (event.target === ui.inventoryOverlay && !state.trade) closeInventory();
});
ui.inventoryItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-equip-item]");
  if (button) send({ type: "equip-item", itemId: button.dataset.equipItem });
});
ui.tradePlayerList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-trade-player]");
  if (!button) return;
  const partnerName = button.closest("li").querySelector(".trade-player-name").textContent;
  state.tradeMessage = `Sending trade request to ${partnerName}...`;
  renderInventory(true);
  send({ type: "trade-request", targetId: button.dataset.tradePlayer });
});
ui.acceptTrade.addEventListener("click", () => {
  if (state.tradeInvite) send({ type: "trade-response", requestId: state.tradeInvite.requestId, accept: true });
});
ui.declineTrade.addEventListener("click", () => {
  if (state.tradeInvite) send({ type: "trade-response", requestId: state.tradeInvite.requestId, accept: false });
});
ui.setTradeOffer.addEventListener("click", () => {
  send({ type: "trade-offer", itemId: ui.tradeItemSelect.value || null });
});
ui.lockTrade.addEventListener("click", () => send({ type: "trade-lock" }));
ui.cancelTrade.addEventListener("click", () => send({ type: "trade-cancel" }));
document.querySelector("#brand-home").addEventListener("click", (event) => {
  event.preventDefault();
  if (state.screen === "settings") closeSettings();
  else if (state.joined) leaveRoom();
  else showScreen("home");
});

document.addEventListener("keydown", (event) => {
  if (state.bindingAction) {
    if (event.code === "Escape") {
      state.bindingAction = null;
      ui.settingsFeedback.textContent = "Key assignment cancelled.";
      renderSettings();
    } else if (!event.code.startsWith("Control") && !event.code.startsWith("Alt") && !event.code.startsWith("Shift")
      && !event.code.startsWith("Meta") && !["Tab", "Enter", "Backspace", "Delete", "CapsLock", "ContextMenu"].includes(event.code)
      && !/^F\d+$/.test(event.code) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const conflictingAction = Object.entries(state.preferences.controls)
        .find(([action, code]) => action !== state.bindingAction && code === event.code)?.[0];
      if (conflictingAction) {
        ui.settingsFeedback.textContent = `${formatKey(event.code)} is already assigned to ${conflictingAction}.`;
      } else {
        state.preferences.controls[state.bindingAction] = event.code;
        state.bindingAction = null;
        ui.settingsFeedback.textContent = "Control updated.";
        savePreferences();
        renderSettings();
      }
    } else {
      ui.settingsFeedback.textContent = "Choose a regular key without modifiers.";
    }
    event.preventDefault();
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.code === "Escape" && state.screen === "settings") {
    closeSettings();
    event.preventDefault();
    return;
  }
  if (state.screen !== "game" || !state.room?.started) return;
  if (event.key === "Escape") {
    if (state.inventoryOpen) {
      closeInventory();
      event.preventDefault();
      return;
    }
    togglePause();
    event.preventDefault();
    return;
  }
  if (state.paused) return;
  if (event.code === state.preferences.controls.inventory && !event.repeat) {
    if (state.inventoryOpen) closeInventory();
    else openInventory();
    event.preventDefault();
    return;
  }
  state.pressedCodes.add(event.code);
  refreshKeyboardInputs();
  if (event.code === state.preferences.controls.attack && !event.repeat) playSound("attack");
  if (Object.values(state.preferences.controls).includes(event.code)) event.preventDefault();
});
document.addEventListener("keyup", (event) => {
  state.pressedCodes.delete(event.code);
  refreshKeyboardInputs();
});
window.addEventListener("blur", () => {
  clearGameplayInput();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse" || event.button !== 0 || state.screen !== "game"
    || !state.room?.started || state.paused || state.inventoryOpen) return;
  clearTimeout(mouseAttackReleaseTimer);
  mouseAttackReleaseTimer = null;
  canvas.setPointerCapture(event.pointerId);
  state.mouseAttack = true;
  refreshKeyboardInputs();
  playSound("attack");
});
canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "mouse") return;
  clearTimeout(mouseAttackReleaseTimer);
  mouseAttackReleaseTimer = setTimeout(() => {
    state.mouseAttack = false;
    refreshKeyboardInputs();
    mouseAttackReleaseTimer = null;
  }, 90);
});
canvas.addEventListener("pointercancel", () => {
  state.mouseAttack = false;
  refreshKeyboardInputs();
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

function bindTouch(buttonId, direction) {
  const button = document.querySelector(buttonId);
  const set = (pressed) => { state.touch[direction] = pressed; };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    set(true);
    if (direction === "attack") playSound("attack");
  });
  button.addEventListener("pointerup", () => set(false));
  button.addEventListener("pointercancel", () => set(false));
  button.addEventListener("lostpointercapture", () => set(false));
}
bindTouch("#touch-left", "left");
bindTouch("#touch-right", "right");
bindTouch("#touch-jump", "jump");
bindTouch("#touch-attack", "attack");
bindTouch("#touch-interact", "interact");

setInterval(() => {
  if (!state.room?.started) return;
  send({
    type: "input",
    left: !state.paused && !state.inventoryOpen && (state.keys.left || state.touch.left),
    right: !state.paused && !state.inventoryOpen && (state.keys.right || state.touch.right),
    jump: !state.paused && !state.inventoryOpen && (state.keys.jump || state.touch.jump),
    attack: !state.paused && !state.inventoryOpen && (state.keys.attack || state.touch.attack),
    interact: !state.paused && !state.inventoryOpen && (state.keys.interact || state.touch.interact),
  });
}, 50);

function drawBackground(theme = "meadow") {
  const palettes = {
    meadow: { sky: "#f6dfb1", sun: "#f1bd65", cloud: "#d8bd8c", far: "#c5c58a", near: "#a5b57c", ground: "#719768", grass: "#95b87a", detail: "#648b62" },
    forest: { sky: "#dce2b2", sun: "#e8c66d", cloud: "#c0c99a", far: "#9dae79", near: "#78976b", ground: "#557d5e", grass: "#8eaa6d", detail: "#3e684e" },
    cavern: { sky: "#66777a", sun: "#e58e61", cloud: "#8b9290", far: "#536667", near: "#435755", ground: "#534b4a", grass: "#b67a5e", detail: "#373d3d" },
    coast: { sky: "#a7d2ce", sun: "#f2c56b", cloud: "#e7e0c3", far: "#72b0a5", near: "#57958f", ground: "#417b79", grass: "#d9b879", detail: "#2e6567" },
    ruins: { sky: "#e9c79d", sun: "#f1b85c", cloud: "#cba77d", far: "#b89978", near: "#8e8067", ground: "#716451", grass: "#a18c65", detail: "#554c40" },
  };
  const colors = palettes[theme] ?? palettes.meadow;
  context.fillStyle = colors.sky;
  context.fillRect(0, 0, 960, 540);
  context.fillStyle = colors.sky;
  context.fillRect(0, 0, 960, 370);
  context.fillStyle = colors.sun;
  context.fillRect(772, 55, 44, 44);
  context.fillStyle = theme === "cavern" ? "#9ba09a" : "#f8e6bd";
  context.fillRect(782, 47, 26, 8);
  context.fillRect(782, 99, 26, 8);
  context.fillRect(764, 65, 8, 26);
  context.fillRect(816, 65, 8, 26);

  context.fillStyle = colors.cloud;
  context.fillRect(58, 72, 88, 14);
  context.fillRect(44, 86, 116, 14);
  context.fillRect(99, 58, 36, 14);
  context.fillRect(667, 116, 72, 12);
  context.fillRect(650, 128, 106, 12);
  context.fillRect(690, 104, 35, 12);

  context.fillStyle = colors.far;
  context.beginPath();
  context.moveTo(0, 360); context.lineTo(120, 214); context.lineTo(255, 360); context.fill();
  context.beginPath();
  context.moveTo(155, 360); context.lineTo(360, 185); context.lineTo(555, 360); context.fill();
  context.fillStyle = colors.near;
  context.beginPath();
  context.moveTo(405, 370); context.lineTo(632, 201); context.lineTo(840, 370); context.fill();
  context.beginPath();
  context.moveTo(670, 370); context.lineTo(833, 228); context.lineTo(960, 370); context.fill();

  context.fillStyle = theme === "cavern" ? "#788984" : "#f2dfaf";
  context.fillRect(348, 185, 24, 21);
  context.fillRect(329, 206, 21, 17);
  context.fillRect(371, 206, 22, 18);
  context.fillRect(628, 201, 15, 17);
  context.fillRect(613, 218, 16, 15);
  context.fillRect(643, 218, 17, 15);

  context.fillStyle = colors.ground;
  context.fillRect(0, 370, 960, 130);
  context.fillStyle = colors.ground;
  context.fillRect(0, 382, 960, 118);
  for (let x = 20; x < 960; x += 74) {
    context.fillStyle = x % 3 ? colors.grass : colors.detail;
    context.fillRect(x, 390 + (x % 4) * 7, 18, 12);
    context.fillRect(x + 13, 382 + (x % 3) * 9, 8, 19);
  }
  context.fillStyle = colors.detail;
  context.fillRect(0, 500, 960, 40);
  context.fillStyle = colors.grass;
  context.fillRect(0, 500, 960, 7);
  for (let x = 9; x < 960; x += 32) {
    context.fillStyle = x % 2 ? colors.detail : colors.grass;
    context.fillRect(x, 519 + (x % 3) * 4, 17, 3);
  }
  if (theme === "cavern") {
    context.fillStyle = "#4a5555";
    for (let x = 38; x < 960; x += 122) {
      context.fillRect(x, 370, 10, 22);
      context.fillRect(x + 10, 370, 8, 13);
    }
    context.fillStyle = "#e08a5d";
    context.fillRect(150, 496, 68, 4);
    context.fillRect(654, 496, 74, 4);
  }
}

function drawPlatform(platform, theme = "meadow") {
  if (platform.y === 500) return;
  if (platform.suspended) {
    context.fillStyle = theme === "cavern" ? "#726d61" : "#8a8064";
    for (const anchorX of [platform.x + 14, platform.x + platform.width - 14]) {
      context.fillRect(anchorX, Math.max(12, platform.y - 42), 3, 42);
      context.fillRect(anchorX - 2, Math.max(12, platform.y - 32), 7, 3);
      context.fillRect(anchorX - 2, Math.max(12, platform.y - 18), 7, 3);
    }
  }
  const soil = theme === "cavern" ? "#514745" : theme === "forest" ? "#645844" : "#755e46";
  const turf = theme === "cavern" ? "#c27b5a" : theme === "forest" ? "#75956a" : theme === "coast" ? "#d9bd7a" : theme === "ruins" ? "#a58a61" : "#89a86e";
  context.fillStyle = soil;
  context.fillRect(platform.x, platform.y + 5, platform.width, platform.height - 5);
  context.fillStyle = turf;
  context.fillRect(platform.x, platform.y, platform.width, 7);
  context.fillStyle = "#a4ba79";
  context.fillRect(platform.x + 5, platform.y + 7, platform.width - 10, 4);
  context.fillStyle = "#806c4e";
  for (let x = platform.x + 12; x < platform.x + platform.width - 8; x += 27) {
    context.fillRect(x, platform.y + 12, 9, 3);
  }
}

function drawChest(chest) {
  if (!chest) return;
  const x = Math.round(chest.x - 16);
  const y = Math.round(chest.y - 27);
  context.fillStyle = "#594532";
  context.fillRect(x - 2, y + 9, 36, 27);
  context.fillStyle = "#a7673f";
  context.fillRect(x, y + 11, 32, 23);
  context.fillStyle = "#cf9951";
  context.fillRect(x + 3, y + 14, 26, 4);
  context.fillRect(x + 4, y + 28, 24, 4);
  context.fillStyle = "#edc76c";
  context.fillRect(x + 14, y + 18, 5, 8);
  if (chest.opened) {
    context.fillStyle = "#624837";
    context.fillRect(x - 1, y + 2, 34, 8);
    context.fillStyle = "#d2a15c";
    context.fillRect(x + 3, y + 4, 26, 4);
    context.fillStyle = "#ffe39a";
    context.fillRect(x + 13, y - 5, 8, 7);
  } else {
    context.fillStyle = "#704a35";
    context.fillRect(x + 2, y + 3, 28, 10);
    context.fillStyle = "#c88648";
    context.fillRect(x + 5, y + 5, 22, 5);
    context.fillStyle = "#f2cf79";
    context.fillRect(x + 14, y + 13, 5, 8);
  }
}

function drawLoot(loot) {
  if (!loot) return;
  const x = Math.round(loot.x);
  const y = Math.round(loot.y);
  const shimmer = Math.floor(Date.now() / 160) % 2 === 0;
  context.fillStyle = shimmer ? "#ffe99a" : "#e4ad43";
  context.fillRect(x - 13, y - 14, 26, 3);
  context.fillRect(x - 18, y - 9, 3, 7);
  context.fillRect(x + 15, y - 9, 3, 7);
  if (loot.type === "weapon") {
    context.fillStyle = "#dce4df";
    context.fillRect(x - 2, y - 10, 5, 20);
    context.fillStyle = "#f4c754";
    context.fillRect(x - 6, y + 7, 13, 4);
    context.fillRect(x - 2, y + 11, 5, 6);
  } else {
    context.fillStyle = "#9baeb0";
    context.fillRect(x - 11, y - 7, 22, 15);
    context.fillRect(x - 16, y - 3, 7, 11);
    context.fillRect(x + 9, y - 3, 7, 11);
    context.fillStyle = "#e9c779";
    context.fillRect(x - 3, y - 5, 6, 12);
  }
  context.fillStyle = "#fff5dc";
  context.font = "10px 'DM Mono', monospace";
  context.textAlign = "center";
  context.fillText(loot.name, x, y - 22);
}

function drawDoor(room) {
  const doorX = room?.doorX ?? 885;
  const unlocked = room?.keyCollected || room?.completed;
  context.fillStyle = "#385d4e";
  context.fillRect(doorX + 1, 424, 45, 76);
  context.fillStyle = unlocked ? "#edbd5b" : "#766f5c";
  context.fillRect(doorX + 7, 430, 33, 70);
  context.fillStyle = unlocked ? "#4e745b" : "#4b5651";
  context.fillRect(doorX + 13, 436, 21, 64);
  context.fillStyle = unlocked ? "#f4d786" : "#a8a38a";
  context.fillRect(doorX + 16, 441, 15, 48);
  context.fillStyle = unlocked ? "#ef6a4b" : "#d8ca8e";
  context.fillRect(doorX + 24, 466, 4, 4);
  context.fillStyle = "#fff3cc";
  context.fillRect(doorX + 11, 420, 26, 4);
  context.fillRect(doorX + 5, 425, 5, 6);
  context.fillRect(doorX + 38, 425, 5, 6);
}

function drawKey(room) {
  if (!room?.keyAvailable) return;
  const x = Math.round(room.keyX);
  const y = Math.round(room.keyY);
  context.fillStyle = "#7e5834";
  context.fillRect(x - 2, y + 11, 24, 3);
  context.fillStyle = "#f4c754";
  context.fillRect(x, y, 14, 14);
  context.fillStyle = "#ffe69a";
  context.fillRect(x + 3, y + 3, 8, 8);
  context.fillStyle = "#ae7938";
  context.fillRect(x + 5, y + 5, 4, 4);
  context.fillStyle = "#f4c754";
  context.fillRect(x + 11, y + 5, 23, 5);
  context.fillRect(x + 26, y + 9, 5, 6);
  context.fillRect(x + 33, y + 9, 5, 6);
  context.fillStyle = "#fff2c2";
  context.fillRect(x + 17, y + 2, 4, 3);
}

function drawHeart(heart) {
  const bob = Math.sin(Date.now() / 190 + heart.x) * 3;
  const x = Math.round(heart.x - 8);
  const y = Math.round(heart.y - 8 + bob);
  context.fillStyle = "#783d48";
  context.fillRect(x + 1, y + 2, 6, 5);
  context.fillRect(x + 9, y + 2, 6, 5);
  context.fillRect(x - 1, y + 5, 18, 5);
  context.fillRect(x + 2, y + 10, 12, 4);
  context.fillRect(x + 5, y + 14, 6, 3);
  context.fillStyle = "#ee7181";
  context.fillRect(x + 1, y + 3, 6, 4);
  context.fillRect(x + 9, y + 3, 6, 4);
  context.fillRect(x + 1, y + 7, 14, 4);
  context.fillRect(x + 4, y + 11, 8, 3);
  context.fillRect(x + 7, y + 14, 3, 2);
  context.fillStyle = "#ffd1b6";
  context.fillRect(x + 3, y + 3, 3, 2);
  context.fillStyle = "#fff3c9";
  context.fillRect(x + 17, y - 2, 3, 3);
  context.fillRect(x - 4, y + 5, 3, 3);
}

function drawMonster(enemy) {
  if (enemy.health <= 0) return;
  const x = Math.round(enemy.x + enemy.width / 2);
  const y = Math.round(enemy.y + 35);
  context.save();
  context.translate(x, y);
  context.scale(enemy.boss ? 1.6 : 1, enemy.boss ? 1.6 : 1);
  context.fillStyle = "#34433370";
  context.fillRect(-16, -2, 32, 4);
  context.fillStyle = "#56445b";
  context.fillRect(-12, -28, 24, 7);
  context.fillRect(-15, -20, 30, 16);
  context.fillRect(-11, -4, 7, 4);
  context.fillRect(4, -4, 7, 4);
  context.fillStyle = "#a76b91";
  context.fillRect(-11, -22, 22, 16);
  context.fillRect(-7, -27, 14, 5);
  context.fillStyle = "#fff1d2";
  context.fillRect(enemy.direction < 0 ? -9 : 5, -17, 5, 6);
  context.fillStyle = "#2e3540";
  context.fillRect(enemy.direction < 0 ? -7 : 7, -15, 2, 3);
  context.fillRect(-3, -7, 5, 2);
  context.fillStyle = "#493c48";
  context.fillRect(-10, -35, 6, 8);
  context.fillRect(4, -35, 6, 8);
  if (enemy.flying) {
    const flap = Math.sin(Date.now() / 90 + enemy.phase) > 0 ? 1 : -1;
    context.fillStyle = "#493c58";
    context.fillRect(-25, -19 + flap * 5, 11, 6);
    context.fillRect(14, -19 + flap * 5, 11, 6);
    context.fillRect(-31, -15 + flap * 8, 8, 4);
    context.fillRect(23, -15 + flap * 8, 8, 4);
    context.fillStyle = "#c98dab";
    context.fillRect(-22, -18 + flap * 4, 6, 3);
    context.fillRect(16, -18 + flap * 4, 6, 3);
  }
  context.restore();
  const barWidth = enemy.boss ? 62 : 34;
  const barX = x - barWidth / 2;
  const barY = enemy.boss ? y - 62 : y - 43;
  context.fillStyle = "#26342e";
  context.fillRect(barX, barY, barWidth, 6);
  context.fillStyle = enemy.boss ? "#ef6a4b" : "#e4ad43";
  context.fillRect(barX + 1, barY + 1, (barWidth - 2) * enemy.health / enemy.maxHealth, 4);
  if (enemy.boss) {
    context.fillStyle = "#fff2d6";
    context.font = "8px 'DM Mono', monospace";
    context.textAlign = "center";
    context.fillText("BOSS", x, barY - 5);
  }
}

function drawPlayerEquipment(player, inventory, x, y) {
  if (!inventory) return;
  const items = inventory.items ?? [];
  const parts = items.filter((item) => item.type === "armor" && item.equipped).map((item) => item.name.toLowerCase());
  if (parts.length) {
    const armorColor = parts.some((part) => /ember|cinder|basalt/.test(part)) ? "#bd8068"
      : parts.some((part) => /moon|steel|sunward/.test(part)) ? "#bdc9c4" : "#779882";
    context.fillStyle = "#37443e";
    context.fillRect(x + 3, y + 13, 23, 16);
    context.fillStyle = armorColor;
    context.fillRect(x + 6, y + 14, 17, 14);
    context.fillRect(x + 2, y + 15, 5, 7);
    context.fillRect(x + 22, y + 15, 5, 7);
    context.fillStyle = "#ead99f";
    context.fillRect(x + 13, y + 15, 4, 12);
    context.fillRect(x + 8, y + 23, 14, 3);
    context.fillStyle = "#eef0d3";
    context.fillRect(x + 7, y + 15, 4, 3);
    context.fillRect(x + 19, y + 15, 4, 3);
    context.fillRect(x + 9, y + 27, 3, 3);
    context.fillRect(x + 18, y + 27, 3, 3);
    if (parts.some((part) => /helm|crown/.test(part))) {
      context.fillStyle = armorColor;
      context.fillRect(x + 5, y - 2, 19, 6);
      context.fillRect(x + 8, y - 6, 4, 5);
      context.fillRect(x + 17, y - 6, 4, 5);
      context.fillStyle = "#ead99f";
      context.fillRect(x + 13, y - 2, 4, 4);
    }
    if (parts.some((part) => /boot|greave/.test(part))) {
      context.fillStyle = armorColor;
      context.fillRect(x + 5, y + 31, 9, 6);
      context.fillRect(x + 16, y + 31, 9, 6);
    }
    if (parts.some((part) => /shield|buckler|guard/.test(part))) {
      const shieldX = player.facing < 0 ? x + 24 : x - 5;
      context.fillStyle = "#d7bd75";
      context.fillRect(shieldX, y + 16, 7, 12);
      context.fillStyle = armorColor;
      context.fillRect(shieldX + 2, y + 18, 3, 8);
    }
  }

  const weapon = items.find((item) => item.type === "weapon" && item.equipped);
  if (!weapon) return;
  const facing = player.facing < 0 ? -1 : 1;
  const handX = facing > 0 ? x + 24 : x + 4;
  const bladeColor = weapon.damage >= 6 ? "#f0c66f"
    : weapon.damage >= 4 ? "#a8e1de" : weapon.damage >= 2 ? "#d4e4dc" : "#c3c4bd";
  context.fillStyle = "#765039";
  context.fillRect(handX - 1, y + 19, 4, 8);
  context.fillStyle = "#edc56b";
  context.fillRect(handX - 5, y + 17, 12, 4);
  context.fillRect(handX - 3, y + 16, 8, 2);
  context.fillStyle = bladeColor;
  const bladeSteps = Math.min(5, 3 + Math.floor(weapon.damage / 2));
  for (let step = 0; step < bladeSteps; step += 1) {
    const bladeX = handX + facing * step * 3;
    const bladeY = y + 13 - step * 3;
    context.fillRect(bladeX - 2, bladeY, 6, 4);
    context.fillStyle = "#fff8df";
    context.fillRect(bladeX + (facing > 0 ? 1 : -1), bladeY, 2, 2);
    context.fillStyle = bladeColor;
  }
  const tipX = handX + facing * bladeSteps * 3;
  context.fillRect(tipX - 1, y + 12 - bladeSteps * 3, 4, 4);
  if (player.attackFlash > 0) {
    context.fillStyle = "#fff4a8";
    context.fillRect(tipX - 3, y + 7 - bladeSteps * 3, 6, 6);
    context.fillStyle = bladeColor;
    context.fillRect(tipX + facing * 7, y + 5, 4, 4);
    context.fillRect(tipX + facing * 12, y + 14, 3, 3);
    context.fillRect(tipX + facing * 4, y + 24, 4, 4);
  }
}

function drawPlayer(player, index, inventory) {
  const x = Math.round(player.x);
  const y = Math.round(player.y);
  if (player.lives <= 0) {
    context.fillStyle = "#fff0cf";
    context.font = "9px 'DM Mono', monospace";
    context.textAlign = "center";
    context.fillText("DOWN", x + 14, y + 18);
    return;
  }
  if (player.invulnerable > 0 && Math.floor(Date.now() / 90) % 2 === 0) return;
  context.fillStyle = "#31453640";
  context.fillRect(x - 3, y + 34, 34, 5);
  context.fillStyle = player.color;
  context.fillRect(x + 5, y + 13, 18, 20);
  context.fillStyle = "#f1c49b";
  context.fillRect(x + 6, y + 2, 17, 14);
  context.fillStyle = "#3d3936";
  context.fillRect(x + 4, y, 19, 6);
  context.fillRect(x + 3, y + 4, 5, 7);
  context.fillStyle = "#fff0cf";
  context.fillRect(x + (player.vx < 0 ? 6 : 17), y + 8, 3, 3);
  context.fillStyle = "#344c3e";
  context.fillRect(x + 6, y + 32, 7, 4);
  context.fillRect(x + 17, y + 32, 7, 4);
  drawPlayerEquipment(player, inventory, x, y);
  context.fillStyle = "#f6e8c2";
  context.font = "11px 'DM Mono', monospace";
  context.textAlign = "center";
  context.fillText(player.name, x + 14, y - 8);
  if (player.atDoor) {
    context.fillStyle = "#f3c45d";
    context.fillRect(x + 6, y - 19, 14, 7);
    context.fillRect(x + 9, y - 22, 8, 3);
  }
  if (player.id === state.id && index > -1) {
    context.fillStyle = "#fff4d8";
    context.fillRect(x + 12, y - 3, 4, 3);
  }
  if (player.attackFlash > 0) {
    context.fillStyle = "#fff1b1";
    const slashX = player.facing < 0 ? x - 17 : x + 24;
    context.fillRect(slashX, y + 12, 16, 4);
    context.fillRect(slashX + (player.facing < 0 ? 4 : 8), y + 7, 4, 14);
    context.fillStyle = "#ef6a4b";
    context.fillRect(slashX + (player.facing < 0 ? 1 : 12), y + 8, 4, 3);
  }
}

function getCameraX(room = state.room) {
  if (state.screen !== "game" || !room) return 0;
  const frame = ui.canvasHosts.game;
  const scale = Math.max(0.01, frame.clientHeight / logicalHeight);
  const visibleWorldWidth = frame.clientWidth / scale;
  const player = room.players.find((entry) => entry.id === state.id);
  const targetX = player ? player.x + 14 : visibleWorldWidth / 2;
  const maxCameraX = Math.max(0, room.worldWidth - visibleWorldWidth);
  return Math.max(0, Math.min(maxCameraX, targetX - visibleWorldWidth * 0.42));
}

function updateGameCamera(room = state.room, cameraX = getCameraX(room)) {
  const portraitGame = state.screen === "game"
    && matchMedia("(max-width: 540px) and (orientation: portrait)").matches;
  if (!portraitGame) {
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.transform = "";
    return;
  }

  const frame = ui.canvasHosts.game;
  const scale = frame.clientHeight / logicalHeight;
  canvas.style.width = `${logicalWidth * scale}px`;
  canvas.style.height = `${logicalHeight * scale}px`;
  canvas.style.transform = "";
}

window.addEventListener("resize", updateGameCamera);

function applyResolution() {
  canvas.width = state.preferences.resolution;
  canvas.height = Math.round(state.preferences.resolution * logicalHeight / logicalWidth);
  updateGameCamera();
}

function interpolateActors(older, newer, amount) {
  const previous = new Map(older.map((actor) => [actor.id, actor]));
  return newer.map((actor) => {
    const from = previous.get(actor.id);
    if (!from) return actor;
    return {
      ...actor,
      x: from.x + (actor.x - from.x) * amount,
      y: from.y + (actor.y - from.y) * amount,
    };
  });
}

function getRenderRoom() {
  const snapshots = state.snapshots;
  if (snapshots.length < 2) return state.room;
  const renderTime = performance.now() - 70;
  if (renderTime <= snapshots[0].time) return snapshots[0].room;
  for (let index = 0; index < snapshots.length - 1; index += 1) {
    const older = snapshots[index];
    const newer = snapshots[index + 1];
    if (renderTime > newer.time) continue;
    const amount = Math.max(0, Math.min(1, (renderTime - older.time) / (newer.time - older.time)));
    return {
      ...newer.room,
      players: interpolateActors(older.room.players, newer.room.players, amount),
      enemies: interpolateActors(older.room.enemies, newer.room.enemies, amount),
    };
  }
  return snapshots[snapshots.length - 1].room;
}

function drawScene() {
  const room = getRenderRoom();
  const cameraX = getCameraX(room);
  updateGameCamera(room, cameraX);
  context.setTransform(canvas.width / logicalWidth, 0, 0, canvas.height / logicalHeight, 0, 0);
  context.imageSmoothingEnabled = false;
  drawBackground(room?.theme);
  context.save();
  context.translate(-cameraX, 0);
  for (const platform of room?.platforms ?? [
    { x: 168, y: 420, width: 132, height: 18 },
    { x: 356, y: 346, width: 140, height: 18 },
    { x: 548, y: 420, width: 152, height: 18 },
    { x: 744, y: 334, width: 130, height: 18 },
  ]) drawPlatform(platform, room?.theme);
  drawDoor(room);
  for (const chest of room?.chests ?? []) drawChest(chest);
  drawKey(room);
  for (const heart of room?.hearts ?? []) drawHeart(heart);
  drawLoot(room?.bossLoot);
  for (const enemy of room?.enemies ?? []) drawMonster(enemy);
  if (room?.players.length) {
    room.players.forEach((player, index) => drawPlayer(player, index, player.inventory));
  } else {
    drawPlayer({ x: 65, y: 464, color: "#ef6a4b", name: "YOU", vx: 0, id: null }, 0);
  }
  context.restore();
  context.textAlign = "left";
  requestAnimationFrame(drawScene);
}

function initializeSettings() {
  renderSettings();
  applyResolution();
}

initializeSettings();
showScreen("home");
setConnection("Not connected");
drawScene();