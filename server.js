import { createServer } from "node:http";
import { randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const rooms = new Map();
const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const difficultyTiers = [
  { name: "EASY", extraMonsters: 0, enemyDamageMultiplier: 0.72, bossHealthMultiplier: 0.72 },
  { name: "NORMAL", extraMonsters: 0, enemyDamageMultiplier: 1, bossHealthMultiplier: 1 },
  { name: "HARD", extraMonsters: 1, enemyDamageMultiplier: 1.12, bossHealthMultiplier: 1.2 },
  { name: "EXPERT", extraMonsters: 2, enemyDamageMultiplier: 1.25, bossHealthMultiplier: 1.45 },
];
const handcraftedLevels = [
  {
    name: "THE CLOVER RIDGE",
    theme: "meadow",
    width: 1200,
    doorX: 1124,
    key: { x: 1050, y: 465 },
    hearts: [{ x: 116, y: 464 }, { x: 1060, y: 464 }],
    chests: [
      { x: 432, y: 464, loot: { type: "weapon", name: "Cloverblade", damage: 2 } },
      { x: 246, y: 464, loot: { type: "armor", name: "Bramble boots", armor: 1 } },
      { x: 626, y: 464, loot: { type: "armor", name: "Hazel charm", armor: 1 } },
      { x: 954, y: 464, loot: { type: "armor", name: "Windguard plate", armor: 1 } },
    ],
    platforms: [
      { x: 0, y: 500, width: 1200, height: 40 },
      { x: 168, y: 420, width: 132, height: 18, suspended: true },
      { x: 356, y: 346, width: 140, height: 18, suspended: true },
      { x: 548, y: 420, width: 152, height: 18 },
      { x: 744, y: 334, width: 130, height: 18 },
      { x: 900, y: 418, width: 138, height: 18, suspended: true },
      { x: 1040, y: 350, width: 112, height: 18, suspended: true },
    ],
    monsters: [
      { x: 286, minX: 220, maxX: 346 },
      { x: 432, y: 258, minX: 365, maxX: 520, minY: 226, maxY: 410, type: "flying" },
      { x: 536, minX: 470, maxX: 630 },
      { x: 750, minX: 690, maxX: 830, boss: true, health: 9, loot: { type: "armor", name: "Cloverguard plate", armor: 1 } },
    ],
  },
  {
    name: "MOSSVEIL WOODS",
    theme: "forest",
    width: 1200,
    doorX: 1124,
    key: { x: 1050, y: 465 },
    hearts: [{ x: 116, y: 464 }, { x: 1060, y: 464 }],
    chests: [
      { x: 430, y: 464, loot: { type: "armor", name: "Mossveil greaves", armor: 1 } },
      { x: 178, y: 464, loot: { type: "weapon", name: "Fernblade", damage: 3 } },
      { x: 602, y: 464, loot: { type: "armor", name: "Canopy vest", armor: 1 } },
      { x: 954, y: 464, loot: { type: "armor", name: "Glade buckler", armor: 1 } },
    ],
    platforms: [
      { x: 0, y: 500, width: 1200, height: 40 },
      { x: 112, y: 422, width: 126, height: 18, suspended: true },
      { x: 292, y: 346, width: 146, height: 18, suspended: true },
      { x: 484, y: 414, width: 128, height: 18 },
      { x: 658, y: 330, width: 142, height: 18 },
      { x: 790, y: 414, width: 104, height: 18 },
      { x: 910, y: 420, width: 132, height: 18, suspended: true },
      { x: 1040, y: 350, width: 112, height: 18, suspended: true },
    ],
    monsters: [
      { x: 248, minX: 188, maxX: 334 },
      { x: 410, y: 246, minX: 350, maxX: 550, minY: 210, maxY: 410, type: "flying" },
      { x: 492, minX: 430, maxX: 628 },
      { x: 720, minX: 655, maxX: 830 },
      { x: 850, minX: 812, maxX: 870, boss: true, health: 12, loot: { type: "weapon", name: "Ranger blade", damage: 3 } },
    ],
  },
  {
    name: "EMBERSTONE CAVES",
    theme: "cavern",
    width: 1200,
    doorX: 1124,
    key: { x: 1050, y: 465 },
    hearts: [{ x: 116, y: 464 }, { x: 1060, y: 464 }],
    chests: [
      { x: 430, y: 464, loot: { type: "weapon", name: "Emberfang", damage: 4 } },
      { x: 216, y: 464, loot: { type: "armor", name: "Basalt boots", armor: 1 } },
      { x: 598, y: 464, loot: { type: "armor", name: "Cinder guard", armor: 1 } },
      { x: 954, y: 464, loot: { type: "armor", name: "Deepforge helm", armor: 1 } },
    ],
    platforms: [
      { x: 0, y: 500, width: 1200, height: 40 },
      { x: 146, y: 414, width: 136, height: 18, suspended: true },
      { x: 332, y: 326, width: 142, height: 18, suspended: true },
      { x: 530, y: 408, width: 134, height: 18 },
      { x: 716, y: 316, width: 150, height: 18 },
      { x: 900, y: 412, width: 140, height: 18, suspended: true },
      { x: 1040, y: 344, width: 112, height: 18, suspended: true },
    ],
    monsters: [
      { x: 260, minX: 204, maxX: 340 },
      { x: 410, y: 238, minX: 350, maxX: 552, minY: 194, maxY: 400, type: "flying" },
      { x: 480, minX: 422, maxX: 592 },
      { x: 700, minX: 648, maxX: 810 },
      { x: 836, minX: 805, maxX: 870, boss: true, health: 15, loot: { type: "armor", name: "Emberstone cuirass", armor: 1 } },
    ],
  },
];

const levelCount = 50;
const generatedThemes = [
  { theme: "meadow", name: "CLOVERFIELD TRAIL" },
  { theme: "forest", name: "MOSSVEIL CANOPY" },
  { theme: "cavern", name: "EMBERSTONE PASS" },
  { theme: "coast", name: "TIDEBREAK SHORE" },
  { theme: "ruins", name: "SUNFALL RUINS" },
];
const platformLayouts = [
  [{ x: 150, y: 424, width: 130 }, { x: 328, y: 352, width: 142 }, { x: 516, y: 422, width: 136 }, { x: 722, y: 348, width: 140 }],
  [{ x: 104, y: 430, width: 138 }, { x: 282, y: 362, width: 142 }, { x: 478, y: 426, width: 142 }, { x: 690, y: 354, width: 144 }],
  [{ x: 126, y: 416, width: 136 }, { x: 310, y: 344, width: 148 }, { x: 510, y: 414, width: 142 }, { x: 728, y: 336, width: 132 }],
  [{ x: 92, y: 426, width: 142 }, { x: 270, y: 354, width: 138 }, { x: 458, y: 424, width: 150 }, { x: 682, y: 350, width: 154 }],
  [{ x: 166, y: 430, width: 132 }, { x: 348, y: 360, width: 152 }, { x: 548, y: 426, width: 138 }, { x: 746, y: 354, width: 112 }],
];
const generatedWeapons = ["Starfall blade", "Thornbite saber", "Dawnfang sword", "Stormglass edge"];
const generatedArmor = ["Moonsteel cuirass", "Brambleguard boots", "Sunward shield", "Cloudstep greaves"];

function makeGeneratedLevel(stage) {
  const template = handcraftedLevels[(stage - handcraftedLevels.length - 1) % handcraftedLevels.length];
  const biome = generatedThemes[(stage - handcraftedLevels.length) % generatedThemes.length];
  const layout = platformLayouts[(stage - handcraftedLevels.length) % platformLayouts.length];
  const chests = [220, 480, 740, 960].map((x, index) => {
    const weapon = (stage + index) % 3 === 0;
    return {
      x,
      y: 464,
      loot: weapon
        ? { type: "weapon", name: generatedWeapons[(stage + index) % generatedWeapons.length], damage: Math.min(8, 2 + Math.floor(stage / 10)) }
        : { type: "armor", name: generatedArmor[(stage + index) % generatedArmor.length], armor: 1 },
    };
  });
  const bossArena = stage % 10 === 0;
  const loot = stage % 20 === 0
    ? { type: "armor", name: generatedArmor[stage % generatedArmor.length], armor: 2 }
    : { type: "weapon", name: generatedWeapons[stage % generatedWeapons.length], damage: Math.min(8, 4 + Math.floor(stage / 15)) };
  const monsters = bossArena
    ? [{ x: 810, minX: 630, maxX: 1055, boss: true, health: 34 + Math.floor(stage * 0.7), loot }]
    : template.monsters.map((spawn) => {
      if (!spawn.boss) return { ...spawn };
      const boss = stage % 5 === 0;
      return {
        ...spawn,
        x: 920,
        minX: 830,
        maxX: 1055,
        boss,
        health: boss ? 10 + Math.floor(stage * 0.55) : 2 + Math.floor(stage / 20),
        loot: boss ? loot : null,
      };
    });
  if (!bossArena) {
    const bonusMobs = Math.min(5, Math.floor(stage / 8));
    for (let index = 0; index < bonusMobs; index += 1) {
      const x = 150 + ((stage * 97 + index * 163) % 850);
      monsters.push({ x, minX: Math.max(40, x - 55), maxX: Math.min(1090, x + 55), health: 2 + Math.floor(stage / 20) });
    }
    if (stage % 7 === 0) {
      monsters.push({ x: 784, y: 236, minX: 700, maxX: 990, minY: 210, maxY: 408, type: "flying" });
    }
  }

  return {
    name: `${biome.name} ${String(stage).padStart(2, "0")}`,
    theme: biome.theme,
    width: 1200,
    doorX: 1124,
    key: { x: 1050, y: 465 },
    hearts: [{ x: 116, y: 464 }, { x: 1060, y: 464 }],
    chests,
    platforms: [
      { x: 0, y: 500, width: 1200, height: 40 },
      ...layout.map((platform, index) => ({ ...platform, height: 18, suspended: index % 2 === 0 })),
      { x: 900, y: 420, width: 138, height: 18, suspended: true },
      { x: 1040, y: 350, width: 112, height: 18, suspended: true },
    ],
    monsters,
  };
}

const levels = [
  ...handcraftedLevels,
  ...Array.from({ length: levelCount - handcraftedLevels.length }, (_, index) => makeGeneratedLevel(index + handcraftedLevels.length + 1)),
];

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => codeChars[randomInt(codeChars.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanName(value) {
  return String(value ?? "Player")
    .replace(/[<>\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 16) || "Player";
}

function difficultyFor(playerCount) {
  const count = Math.max(1, Math.min(4, playerCount));
  return { playerCount: count, chestCount: count, ...difficultyTiers[count - 1] };
}

function makeChests(levelIndex, chestCount) {
  return levels[levelIndex].chests.slice(0, chestCount).map((chest) => ({
    ...chest,
    loot: { ...chest.loot },
    opened: false,
  }));
}

function makeHearts(levelIndex) {
  return levels[levelIndex].hearts.map((heart, index) => ({
    id: `heart-${levelIndex}-${index}`,
    x: heart.x,
    y: heart.y,
    collected: false,
  }));
}

function makeMonsters(levelIndex, difficulty) {
  const baseSpawns = levels[levelIndex].monsters;
  let spawns = baseSpawns;
  if (difficulty.playerCount === 1) {
    let keptGroundMonster = false;
    spawns = baseSpawns.filter((spawn) => {
      if (spawn.boss || spawn.type === "flying") return true;
      if (keptGroundMonster) return false;
      keptGroundMonster = true;
      return true;
    });
  }

  const groundSpawns = spawns.filter((spawn) => !spawn.boss && spawn.type !== "flying");
  for (let index = 0; index < difficulty.extraMonsters && groundSpawns.length > 0; index += 1) {
    const source = groundSpawns[index % groundSpawns.length];
    const offset = (index % 2 === 0 ? 34 : -34) * (1 + Math.floor(index / 2));
    spawns = [...spawns, {
      ...source,
      x: Math.max(source.minX + 12, Math.min(source.maxX - 12, source.x + offset)),
      health: 2,
      loot: undefined,
    }];
  }

  return spawns.map((spawn, index) => {
    const flying = spawn.type === "flying";
    const health = Math.ceil((spawn.health ?? 2) * (spawn.boss ? difficulty.bossHealthMultiplier : 1));
    return {
      id: `monster-${levelIndex}-${index}`,
      x: spawn.x,
      y: spawn.y ?? 464,
      width: spawn.boss ? 54 : flying ? 42 : 34,
      spawnX: spawn.x,
      baseY: spawn.y ?? 464,
      minX: spawn.minX,
      maxX: spawn.maxX,
      minY: spawn.minY ?? spawn.y ?? 464,
      maxY: spawn.maxY ?? spawn.y ?? 464,
      phase: index * 1.73,
      direction: index % 2 === 0 ? 1 : -1,
      flying,
      boss: Boolean(spawn.boss),
      health,
      maxHealth: health,
      loot: spawn.loot ?? null,
      attackCooldown: 0,
    };
  });
}

function makeInventory(playerId) {
  return {
    items: [{ id: `starter-${playerId}`, name: "Trail knife", type: "weapon", damage: 1, equipped: true }],
  };
}

function equippedWeaponDamage(player) {
  return player.inventory.items.find((item) => item.type === "weapon" && item.equipped)?.damage ?? 1;
}

function armorValue(player) {
  return player.inventory.items
    .filter((item) => item.type === "armor" && item.equipped)
    .reduce((total, item) => total + item.armor, 0);
}

function normalizeInventory(inventory) {
  const weapons = inventory.items.filter((item) => item.type === "weapon");
  if (!weapons.some((item) => item.equipped) && weapons.length) {
    weapons.sort((first, second) => second.damage - first.damage)[0].equipped = true;
  }
  const equippedWeapon = weapons.find((item) => item.equipped);
  for (const weapon of weapons) weapon.equipped = weapon.id === equippedWeapon?.id;
}

function isCheckpointLevel(levelIndex) {
  return levelIndex >= 8 && (levelIndex - 8) % 10 === 0;
}

function getNextCheckpointLevel(levelIndex) {
  let checkpointIndex = Math.floor(levelIndex / 10) * 10 + 8;
  if (checkpointIndex <= levelIndex) checkpointIndex += 10;
  return checkpointIndex + 1;
}

function grantLoot(player, room, loot) {
  const item = { id: randomUUID(), ...loot, equipped: true };
  if (item.type === "weapon") {
    item.equipped = item.damage > equippedWeaponDamage(player);
    if (item.equipped) {
      for (const existing of player.inventory.items) {
        if (existing.type === "weapon") existing.equipped = false;
      }
    }
  }
  player.inventory.items.push(item);
  room.lootNotice = loot.name;
  room.lootNoticeExpiresAt = Date.now() + 2600;
}

function resetLevel(room) {
  const level = levels[room.levelIndex];
  room.keyCollected = false;
  room.completed = false;
  room.enemies = makeMonsters(room.levelIndex, room.difficulty);
  room.chests = makeChests(room.levelIndex, room.difficulty.chestCount);
  room.hearts = makeHearts(room.levelIndex);
  room.bossLoot = null;
  room.lootNotice = null;
  room.lootNoticeExpiresAt = 0;
  [...room.players.values()].forEach((player, index) => {
    player.x = 48 + index * 38;
    player.y = 464;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.health = player.lives > 0 ? 3 : 0;
    player.atDoor = false;
    player.invulnerable = 0;
    player.attackCooldown = 0;
    player.attackFlash = 0;
    player.interactHeld = false;
    player.coyoteTime = 0.12;
    player.jumpBuffer = 0;
    player.jumpHeld = false;
    player.attackHeld = false;
    player.input = { left: false, right: false, jump: false, attack: false, interact: false };
  });
}

function respawnPlayer(player, room) {
  const index = [...room.players.keys()].indexOf(player.id);
  player.x = 48 + Math.max(0, index) * 38;
  player.y = 464;
  player.vx = 0;
  player.vy = 0;
  player.grounded = true;
  player.health = 3;
  player.atDoor = false;
  player.invulnerable = 1.15;
  player.attackCooldown = 0;
  player.attackFlash = 0;
  player.interactHeld = false;
  player.coyoteTime = 0.12;
  player.jumpBuffer = 0;
  player.jumpHeld = false;
  player.attackHeld = false;
  player.input = { left: false, right: false, jump: false, attack: false, interact: false };
}

function handlePlayerDeath(player, room) {
  if (player.health > 0 || player.lives <= 0) return;
  player.lives -= 1;
  if (player.lives > 0) {
    respawnPlayer(player, room);
    room.lootNotice = `${player.name} lost a life`;
    room.lootNoticeExpiresAt = Date.now() + 2200;
    return;
  }

  player.health = 0;
  player.atDoor = false;
  player.input = { left: false, right: false, jump: false, attack: false, interact: false };
  room.lootNotice = `${player.name} is down · reach a checkpoint to revive`;
  room.lootNoticeExpiresAt = Date.now() + 3600;

  if ([...room.players.values()].every((roomPlayer) => roomPlayer.lives <= 0)) {
    room.levelIndex = room.checkpointIndex;
    for (const roomPlayer of room.players.values()) roomPlayer.lives = 3;
    resetLevel(room);
    room.lootNotice = `Back to checkpoint · LVL ${String(room.levelIndex + 1).padStart(2, "0")}`;
    room.lootNoticeExpiresAt = Date.now() + 3600;
  }
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function publicState(room) {
  const level = levels[room.levelIndex];
  return {
    type: "state",
    code: room.code,
    started: room.started,
    hostId: room.hostId,
    levelIndex: room.levelIndex,
    checkpointLevel: room.checkpointIndex + 1,
    nextCheckpointLevel: getNextCheckpointLevel(room.levelIndex),
    isCheckpointLevel: isCheckpointLevel(room.levelIndex),
    levelCount: levels.length,
    levelName: level.name,
    theme: level.theme,
    worldWidth: level.width,
    doorX: level.doorX,
    keyX: level.key.x,
    keyY: level.key.y,
    keyAvailable: !room.keyCollected && room.bossLoot === null && room.enemies.every((enemy) => enemy.health <= 0),
    keyCollected: room.keyCollected,
    completed: room.completed,
    difficulty: room.difficulty,
    enemyCount: room.enemies.filter((enemy) => enemy.health > 0).length,
    chests: room.chests.map(({ loot, ...chest }) => chest),
    hearts: room.hearts.filter((heart) => !heart.collected),
    bossLoot: room.bossLoot,
    lootNotice: room.lootNoticeExpiresAt > Date.now() ? room.lootNotice : null,
    players: [...room.players.values()].map(({ socket, input, jumpHeld, attackHeld, attackCooldown, invulnerable, ...player }) => player),
    enemies: room.enemies.map(({ minX, maxX, attackCooldown, loot, ...enemy }) => enemy),
    platforms: level.platforms,
  };
}

function broadcast(room) {
  const message = JSON.stringify(publicState(room));
  for (const player of room.players.values()) {
    if (player.socket.readyState === WebSocket.OPEN) player.socket.send(message);
  }
}

function fail(socket, message) {
  send(socket, { type: "error", message });
}

function playersCanTrade(first, second) {
  return first && second && first.atDoor !== true && second.atDoor !== true
    && Math.abs(first.y - second.y) < 100
    && Math.abs(first.x - second.x) < 220;
}

function tradeState(room, trade) {
  return {
    type: "trade-state",
    tradeId: trade.id,
    participants: trade.playerIds.map((id) => {
      const player = room.players.get(id);
      const offeredItemId = trade.offers[id];
      const offeredItem = player.inventory.items.find((item) => item.id === offeredItemId) ?? null;
      return {
        id,
        name: player.name,
        locked: trade.locked[id],
        offer: offeredItem ? { id: offeredItem.id, name: offeredItem.name, type: offeredItem.type } : null,
      };
    }),
  };
}

function broadcastTrade(room, trade) {
  const message = tradeState(room, trade);
  for (const id of trade.playerIds) send(room.players.get(id).socket, message);
}

function cancelTrade(room, trade, message) {
  room.trades.delete(trade.id);
  for (const id of trade.playerIds) {
    const player = room.players.get(id);
    if (!player) continue;
    player.tradeId = null;
    send(player.socket, { type: "trade-result", message });
  }
}

function handleTradeMessage(socket, room, player, payload) {
  if (payload.type === "trade-request") {
    const target = room.players.get(String(payload.targetId ?? ""));
    if (!target || target.id === player.id) return fail(socket, "That player is not available to trade.");
    if (player.tradeId || target.tradeId) return fail(socket, "One of you is already trading.");
    if (!playersCanTrade(player, target)) return fail(socket, "Move closer to trade.");
    const requestId = randomUUID();
    room.tradeInvites.set(requestId, { fromId: player.id, toId: target.id, expiresAt: Date.now() + 20000 });
    send(target.socket, { type: "trade-invite", requestId, fromId: player.id, fromName: player.name });
    send(socket, { type: "trade-result", message: `Trade request sent to ${target.name}.` });
    return true;
  }

  if (payload.type === "trade-response") {
    const invite = room.tradeInvites.get(payload.requestId);
    if (!invite || invite.toId !== player.id) return fail(socket, "That trade invite has expired.");
    room.tradeInvites.delete(payload.requestId);
    const initiator = room.players.get(invite.fromId);
    if (!initiator) return fail(socket, "That player left the room.");
    if (!payload.accept) {
      send(initiator.socket, { type: "trade-result", message: `${player.name} declined the trade.` });
      return send(socket, { type: "trade-result", message: "Trade declined." }), true;
    }
    if (invite.expiresAt < Date.now() || !playersCanTrade(player, initiator) || player.tradeId || initiator.tradeId) {
      return fail(socket, "The trade is no longer available. Move closer and try again.");
    }
    const trade = {
      id: randomUUID(),
      playerIds: [initiator.id, player.id],
      offers: { [initiator.id]: null, [player.id]: null },
      locked: { [initiator.id]: false, [player.id]: false },
    };
    room.trades.set(trade.id, trade);
    initiator.tradeId = trade.id;
    player.tradeId = trade.id;
    broadcastTrade(room, trade);
    return true;
  }

  if (payload.type === "trade-offer" || payload.type === "trade-lock" || payload.type === "trade-cancel") {
    const trade = room.trades.get(player.tradeId);
    if (!trade || !trade.playerIds.includes(player.id)) return fail(socket, "You are not in an active trade.");
    const other = room.players.get(trade.playerIds.find((id) => id !== player.id));
    if (!other || !playersCanTrade(player, other)) {
      cancelTrade(room, trade, "Trade cancelled because players moved too far apart.");
      return true;
    }
    if (payload.type === "trade-cancel") {
      cancelTrade(room, trade, `${player.name} cancelled the trade.`);
      return true;
    }
    if (payload.type === "trade-offer") {
      const itemId = payload.itemId ? String(payload.itemId) : null;
      if (itemId && !player.inventory.items.some((item) => item.id === itemId)) return fail(socket, "That item is no longer in your inventory.");
      if (trade.locked[player.id]) return fail(socket, "Unlock your offer before changing it.");
      trade.offers[player.id] = itemId;
      broadcastTrade(room, trade);
      return true;
    }

    trade.locked[player.id] = true;
    if (!trade.playerIds.every((id) => trade.locked[id])) {
      broadcastTrade(room, trade);
      return true;
    }

    const [firstId, secondId] = trade.playerIds;
    const first = room.players.get(firstId);
    const second = room.players.get(secondId);
    const firstItem = first.inventory.items.find((item) => item.id === trade.offers[firstId]) ?? null;
    const secondItem = second.inventory.items.find((item) => item.id === trade.offers[secondId]) ?? null;
    if ((trade.offers[firstId] && !firstItem) || (trade.offers[secondId] && !secondItem)) {
      cancelTrade(room, trade, "An offered item is no longer available. Trade cancelled.");
      return true;
    }
    if (firstItem) first.inventory.items = first.inventory.items.filter((item) => item.id !== firstItem.id);
    if (secondItem) second.inventory.items = second.inventory.items.filter((item) => item.id !== secondItem.id);
    if (secondItem) first.inventory.items.push(secondItem);
    if (firstItem) second.inventory.items.push(firstItem);
    normalizeInventory(first.inventory);
    normalizeInventory(second.inventory);
    cancelTrade(room, trade, "Trade complete. Items swapped.");
    broadcast(room);
    return true;
  }

  if (payload.type === "equip-item") {
    const item = player.inventory.items.find((entry) => entry.id === String(payload.itemId ?? ""));
    if (!item) return fail(socket, "That item is no longer in your inventory.");
    if (item.type === "weapon") {
      for (const weapon of player.inventory.items) if (weapon.type === "weapon") weapon.equipped = false;
      item.equipped = true;
    } else {
      item.equipped = !item.equipped;
    }
    broadcast(room);
    return true;
  }
  return false;
}

function enterRoom(socket, room, name) {
  if (room.players.size >= 4) {
    fail(socket, "This room is full.");
    return;
  }

  const id = randomUUID();
  const player = {
    id,
    name: cleanName(name),
    color: ["#ef6a4b", "#398b73", "#e4ad43", "#6e75b7"][room.players.size],
    x: 48 + room.players.size * 42,
    y: 464,
    vx: 0,
    vy: 0,
    grounded: true,
    health: 3,
    lives: 3,
    atDoor: false,
    invulnerable: 0,
    attackCooldown: 0,
    attackFlash: 0,
    interactHeld: false,
    socket,
    input: { left: false, right: false, jump: false, attack: false, interact: false },
    jumpHeld: false,
    attackHeld: false,
    facing: 1,
    coyoteTime: 0.12,
    jumpBuffer: 0,
    inventory: null,
    tradeId: null,
  };
  player.inventory = makeInventory(id);
  room.players.set(id, player);
  if (!room.started) {
    room.difficulty = difficultyFor(room.players.size);
    room.enemies = makeMonsters(room.levelIndex, room.difficulty);
    room.chests = makeChests(room.levelIndex, room.difficulty.chestCount);
  }
  socket.roomCode = room.code;
  socket.playerId = id;
  send(socket, { type: "joined", id, code: room.code });
  broadcast(room);
}

function handleMessage(socket, payload) {
  if (!payload || typeof payload !== "object") return;

  if (payload.type === "create") {
    if (socket.roomCode) return fail(socket, "You are already in a room.");
    const code = makeCode();
    const difficulty = difficultyFor(1);
    const room = {
      code,
      hostId: null,
      players: new Map(),
      started: false,
      levelIndex: 0,
      checkpointIndex: 0,
      keyCollected: false,
      completed: false,
      difficulty,
      enemies: makeMonsters(0, difficulty),
      chests: makeChests(0, difficulty.chestCount),
      hearts: makeHearts(0),
      bossLoot: null,
      lootNotice: null,
      lootNoticeExpiresAt: 0,
      tradeInvites: new Map(),
      trades: new Map(),
    };
    rooms.set(code, room);
    enterRoom(socket, room, payload.name);
    room.hostId = socket.playerId;
    broadcast(room);
    return;
  }

  if (payload.type === "join") {
    if (socket.roomCode) return fail(socket, "You are already in a room.");
    const code = String(payload.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const room = rooms.get(code);
    if (!room) return fail(socket, "Room code not found. Check it and try again.");
    if (room.started) return fail(socket, "This quest has started. Join another room for the next run.");
    enterRoom(socket, room, payload.name);
    return;
  }

  const room = rooms.get(socket.roomCode);
  const player = room?.players.get(socket.playerId);
  if (!room || !player) return;

  if (payload.type.startsWith("trade-") || payload.type === "equip-item") {
    handleTradeMessage(socket, room, player, payload);
    return;
  }

  if (payload.type === "start") {
    if (room.hostId !== player.id) return fail(socket, "Only the host can start the quest.");
    if (room.started) return;
    room.started = true;
    resetLevel(room);
    broadcast(room);
  } else if (payload.type === "input") {
    player.input = {
      left: Boolean(payload.left),
      right: Boolean(payload.right),
      jump: Boolean(payload.jump),
      attack: Boolean(payload.attack),
      interact: Boolean(payload.interact),
    };
  }
}

function leaveRoom(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room) return;
  const player = room.players.get(socket.playerId);
  if (player?.tradeId) {
    const trade = room.trades.get(player.tradeId);
    if (trade) cancelTrade(room, trade, `${player.name} left. Trade cancelled.`);
  }
  for (const [requestId, invite] of room.tradeInvites) {
    if (invite.fromId === socket.playerId || invite.toId === socket.playerId) {
      room.tradeInvites.delete(requestId);
      const otherId = invite.fromId === socket.playerId ? invite.toId : invite.fromId;
      const other = room.players.get(otherId);
      if (other) send(other.socket, { type: "trade-result", message: "Trade invite cancelled because a player left." });
    }
  }
  room.players.delete(socket.playerId);
  if (room.players.size === 0) {
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === socket.playerId) room.hostId = room.players.keys().next().value;
  if (!room.started) {
    room.difficulty = difficultyFor(room.players.size);
    room.enemies = makeMonsters(room.levelIndex, room.difficulty);
    room.chests = makeChests(room.levelIndex, room.difficulty.chestCount);
  }
  broadcast(room);
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  const files = {
    "/": ["public/index.html", "text/html; charset=utf-8"],
    "/styles.css": ["public/styles.css", "text/css; charset=utf-8"],
    "/game.js": ["public/game.js", "text/javascript; charset=utf-8"],
  };
  const file = files[pathname];
  if (!file) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const content = await readFile(path.join(root, file[0]));
    response.writeHead(200, { "content-type": file[1], "cache-control": "no-store" });
    response.end(content);
  } catch {
    response.writeHead(500);
    response.end("Unable to load the game");
  }
});

const sockets = new WebSocketServer({ server });
sockets.on("connection", (socket) => {
  socket.on("message", (raw) => {
    try {
      handleMessage(socket, JSON.parse(raw.toString()));
    } catch {
      fail(socket, "That message could not be understood.");
    }
  });
  socket.on("close", () => leaveRoom(socket));
});

function updatePlayer(player, room, level, delta) {
  if (player.lives <= 0 || player.atDoor || room.completed) return;
  player.invulnerable = Math.max(0, player.invulnerable - delta);
  player.attackCooldown = Math.max(0, player.attackCooldown - delta);
  player.attackFlash = Math.max(0, player.attackFlash - delta);
  const direction = Number(player.input.right) - Number(player.input.left);
  const maxSpeed = 270;
  const acceleration = direction ? 1050 : 1450;
  player.vx += direction * acceleration * delta;
  if (!direction) player.vx = Math.sign(player.vx) * Math.max(0, Math.abs(player.vx) - acceleration * delta);
  player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
  if (direction) player.facing = direction;
  player.x = Math.max(0, Math.min(level.width - 28, player.x + player.vx * delta));

  if (player.input.jump && !player.jumpHeld) player.jumpBuffer = 0.14;
  else player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
  player.jumpHeld = player.input.jump;

  const previousBottom = player.y + 36;
  player.vy = Math.min(700, player.vy + 1350 * delta);
  player.y += player.vy * delta;
  player.grounded = false;
  if (player.vy >= 0) {
    for (const platform of level.platforms) {
      const overlaps = player.x + 28 > platform.x && player.x < platform.x + platform.width;
      const crossedTop = previousBottom <= platform.y && player.y + 36 >= platform.y;
      if (overlaps && crossedTop) {
        player.y = platform.y - 36;
        player.vy = 0;
        player.grounded = true;
      }
    }
  }
  if (player.grounded) player.coyoteTime = 0.12;
  else player.coyoteTime = Math.max(0, player.coyoteTime - delta);
  if (player.jumpBuffer > 0 && player.coyoteTime > 0) {
    player.vy = -560;
    player.grounded = false;
    player.coyoteTime = 0;
    player.jumpBuffer = 0;
  }
  if (player.y > 580) {
    player.health -= 1;
    if (player.health <= 0) {
      handlePlayerDeath(player, room);
      return;
    }
    player.x = 48;
    player.y = 464;
    player.vx = 0;
    player.vy = 0;
    player.grounded = true;
    player.coyoteTime = 0.12;
  }

  if (player.input.attack && !player.attackHeld && player.attackCooldown <= 0) {
    player.attackCooldown = 0.36;
    player.attackFlash = 0.16;
    const target = room.enemies
      .filter((enemy) => enemy.health > 0 && Math.abs(enemy.y - player.y) < (enemy.flying ? 72 : 52))
      .filter((enemy) => (enemy.x - player.x) * player.facing >= -8 && Math.abs(enemy.x - player.x) <= 68)
      .sort((first, second) => Math.abs(first.x - player.x) - Math.abs(second.x - player.x))[0];
    if (target) {
      target.health = Math.max(0, target.health - equippedWeaponDamage(player));
      if (target.boss && target.health === 0 && target.loot) {
        room.bossLoot = {
          x: target.x + target.width / 2,
          y: target.y + 16,
          type: target.loot.type,
          name: target.loot.name,
          damage: target.loot.damage,
          armor: target.loot.armor,
        };
      }
    }
  }
  player.attackHeld = player.input.attack;

  if (player.health < 3) {
    const heart = room.hearts.find((pickup) => !pickup.collected
      && Math.abs(player.x + 14 - pickup.x) < 27
      && Math.abs(player.y + 18 - pickup.y) < 42);
    if (heart) {
      player.health = Math.min(3, player.health + 1);
      heart.collected = true;
      room.lootNotice = "HEART +1 HEALTH";
      room.lootNoticeExpiresAt = Date.now() + 2200;
    }
  }

  if (player.input.interact && !player.interactHeld) interactWithLevel(player, room);
  player.interactHeld = player.input.interact;

  if (!room.keyCollected && room.bossLoot === null && room.enemies.every((enemy) => enemy.health <= 0)
    && Math.abs(player.x + 14 - level.key.x) < 30 && Math.abs(player.y + 18 - level.key.y) < 48) {
    room.keyCollected = true;
  }

  if (player.x + 28 >= level.doorX) {
    if (room.keyCollected) {
      player.atDoor = true;
      player.x = level.doorX - 28;
    } else {
      player.x = level.doorX - 29;
    }
    player.vx = 0;
  }
}

function updateMonster(monster, room, delta) {
  if (monster.health <= 0) return;
  monster.attackCooldown = Math.max(0, monster.attackCooldown - delta);
  const target = [...room.players.values()]
    .filter((player) => !player.atDoor && player.health > 0 && player.lives > 0)
    .sort((first, second) => Math.abs(first.x - monster.x) - Math.abs(second.x - monster.x))[0];
  if (target && Math.abs(target.x - monster.x) < (monster.flying ? 260 : 210)) {
    monster.direction = target.x < monster.x ? -1 : 1;
  } else if (monster.x <= monster.minX || monster.x >= monster.maxX) {
    monster.direction *= -1;
  }
  const pursuitDistance = monster.flying ? 260 : 210;
  const pursuing = target && Math.abs(target.x - monster.x) < pursuitDistance;
  const speed = monster.flying ? (pursuing ? 76 : 42) : (pursuing ? 48 : 25);
  monster.x = Math.max(monster.minX, Math.min(monster.maxX, monster.x + monster.direction * speed * delta));
  if (monster.flying) {
    monster.phase += delta * (pursuing ? 2.5 : 1.8);
    const hoverY = monster.baseY + Math.sin(monster.phase) * 18;
    const targetY = pursuing ? Math.max(monster.minY, Math.min(monster.maxY, target.y - 42)) : hoverY;
    const verticalSpeed = pursuing ? 115 : 42;
    monster.y += Math.max(-verticalSpeed * delta, Math.min(verticalSpeed * delta, targetY - monster.y));
  }

  const attackRange = monster.boss ? 50 : monster.flying ? 42 : 34;
  const verticalRange = monster.flying ? 58 : 48;
  if (!target || monster.attackCooldown > 0 || Math.abs(target.y - monster.y) > verticalRange || Math.abs(target.x - monster.x) > attackRange) return;
  monster.attackCooldown = monster.boss ? 1.2 : 0.9;
  if (target.invulnerable > 0) return;
  const incomingDamage = Math.max(0.5, (monster.boss ? 2 : 1) - armorValue(target) * 0.5);
  target.health -= incomingDamage * room.difficulty.enemyDamageMultiplier;
  target.invulnerable = 1.15;
  target.x = Math.max(0, Math.min(levels[room.levelIndex].width - 28, target.x + (target.x < monster.x ? -26 : 26)));
  if (target.health <= 0) {
    handlePlayerDeath(target, room);
  }
}

function interactWithLevel(player, room) {
  const isNear = (object) => Math.abs(player.x + 14 - object.x) < 62
    && Math.abs(player.y + 18 - object.y) < 54;
  const chest = room.chests.find((entry) => !entry.opened && isNear(entry));
  if (chest) {
    chest.opened = true;
    grantLoot(player, room, chest.loot);
    return;
  }
  if (room.bossLoot && isNear(room.bossLoot)) {
    grantLoot(player, room, room.bossLoot);
    room.bossLoot = null;
  }
}

function advanceRoom(room) {
  if (!room.started || room.completed || !room.keyCollected) return;
  const livingPlayers = [...room.players.values()].filter((player) => player.lives > 0);
  if (!livingPlayers.length) return;
  const downedPlayers = [...room.players.values()].filter((player) => player.lives <= 0);
  const rescuingAtCheckpoint = downedPlayers.length > 0 && isCheckpointLevel(room.levelIndex + 1);
  const reachedDoor = rescuingAtCheckpoint
    ? livingPlayers.some((player) => player.atDoor)
    : livingPlayers.every((player) => player.atDoor);
  if (!reachedDoor) return;
  if (room.levelIndex === levels.length - 1) {
    room.completed = true;
    return;
  }
  room.levelIndex += 1;
  const checkpointReached = isCheckpointLevel(room.levelIndex);
  if (checkpointReached) {
    room.checkpointIndex = room.levelIndex;
    for (const player of room.players.values()) {
      if (player.lives <= 0) player.lives = 3;
    }
  }
  resetLevel(room);
  if (checkpointReached) {
    room.lootNotice = `CHECKPOINT REACHED · LVL ${String(room.levelIndex + 1).padStart(2, "0")}`;
    room.lootNoticeExpiresAt = Date.now() + 3600;
  }
}

setInterval(() => {
  const now = Date.now();
  const delta = Math.min((now - (updateLoop.last ?? now)) / 1000, 0.05);
  updateLoop.last = now;
  for (const room of rooms.values()) {
    if (!room.started) continue;
    const level = levels[room.levelIndex];
    for (const player of room.players.values()) updatePlayer(player, room, level, delta);
    for (const monster of room.enemies) updateMonster(monster, room, delta);
    advanceRoom(room);
    broadcast(room);
  }
}, 50);

function updateLoop() {}

server.listen(port, "0.0.0.0", () => {
  console.log(`Pixel Quest is running at http://localhost:${port}`);
});