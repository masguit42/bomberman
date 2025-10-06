import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer, Socket } from 'socket.io';
import seedrandom from 'seedrandom';
import { v4 as uuid } from 'uuid';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';
const PUBLIC_URL = process.env.PUBLIC_URL;
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH;

const TILE_SIZE = 48;
const MAP_WIDTH = 30;
const MAP_HEIGHT = 15;
const BASE_TILE_TIME = 200; // ms to travel one tile
const SPEED_REDUCTION = 0.85;
const MIN_TILE_TIME = 120;
const MAX_ACTIVE_BOMBS_BASE = 1;
const BOMB_FUSE_MS = 2500;
const BASE_POWER = 2;
const MAX_PLAYERS = 6;
const POWERUP_CHANCE = 0.3;
const SNAPSHOT_RATE = 100; // ms
const TICK_RATE = 50; // ms
const MATCH_DURATION_MS = 3 * 60 * 1000;

const SPAWN_POINTS: Point[] = [
  { x: 0, y: 0 },
  { x: MAP_WIDTH - 1, y: 0 },
  { x: 0, y: MAP_HEIGHT - 1 },
  { x: MAP_WIDTH - 1, y: MAP_HEIGHT - 1 },
  { x: 0, y: Math.floor(MAP_HEIGHT / 2) },
  { x: MAP_WIDTH - 1, y: Math.floor(MAP_HEIGHT / 2) },
];

const COLUMN_MASK = (x: number, y: number) => x % 2 === 1 && y % 2 === 1;

const ADJECTIVES = ['Brave', 'Salty', 'Sparkling', 'Lucky', 'Crimson', 'Swift'];
const NOUNS = ['Bomb', 'Banana', 'Fox', 'Seagull', 'Rocket', 'Bubble'];

interface Point {
  x: number;
  y: number;
}

type BlockType = 'column' | 'wall';

type PowerupType = 'speed' | 'count' | 'power';

type RoomPhase = 'lobby' | 'countdown' | 'in_game' | 'post_game';

type Direction = 'up' | 'down' | 'left' | 'right';

interface WallBlock {
  id: string;
  pos: Point;
  hasPowerup: boolean;
  powerupType?: PowerupType;
}

interface Powerup {
  id: string;
  pos: Point;
  type: PowerupType;
}

interface Bomb {
  id: string;
  ownerId: string;
  pos: Point;
  fuseMs: number;
  power: number;
}

interface FlameTile {
  pos: Point;
  ttl: number;
}

interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  placeBomb: boolean;
  seq: number;
}

interface PlayerState {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  alive: boolean;
  pos: Point;
  movement?: MovementState;
  speedLevel: number;
  bombCountLevel: number;
  powerLevel: number;
  lastInputSeq: number;
  lastBombAt: number;
  socketId: string;
  ping: number;
}

interface MovementState {
  from: Point;
  to: Point;
  progress: number;
  direction: Direction;
}

interface LobbyPlayerSummary {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  isHost: boolean;
  ping: number;
}

interface Room {
  id: string;
  hostId: string;
  createdAt: number;
  phase: RoomPhase;
  players: Map<string, PlayerState>;
  chat: ChatMessage[];
  countdownEndsAt?: number;
  matchStartedAt?: number;
  map?: GeneratedMap;
  bombs: Map<string, Bomb>;
  flames: FlameTile[];
  powerups: Map<string, Powerup>;
  tickInterval?: NodeJS.Timeout;
  snapshotInterval?: NodeJS.Timeout;
  timerInterval?: NodeJS.Timeout;
  matchTimerMs: number;
  winnerId?: string | null;
  rngSeed: number;
}

interface GeneratedMap {
  width: number;
  height: number;
  walls: Map<string, WallBlock>;
  columns: Set<string>;
}

interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

interface SnapshotPayload {
  phase: RoomPhase;
  timerMs: number;
  players: PlayerSnapshot[];
  bombs: Bomb[];
  flames: FlameTile[];
  powerups: Powerup[];
  map?: {
    width: number;
    height: number;
    walls: WallBlock[];
    columns: { pos: Point }[];
  };
  countdownEndsAt?: number;
  winnerId?: string | null;
}

interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  pos: Point;
  alive: boolean;
  speedLevel: number;
  bombCountLevel: number;
  powerLevel: number;
}

const rooms = new Map<string, Room>();

function resolveShareBase(req: express.Request): string {
  const configured = PUBLIC_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  const host = req.get('host') ?? '';
  const protocol = req.protocol;
  return `${protocol}://${host}`.replace(/\/$/, '');
}

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

const resolvedClientDist = CLIENT_DIST_PATH
  ? path.resolve(CLIENT_DIST_PATH)
  : path.resolve(__dirname, '../../client/dist');
const hasClientBundle = fs.existsSync(resolvedClientDist);

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

app.post('/api/room', (req, res) => {
  const roomId = generateRoomCode();
  const room: Room = {
    id: roomId,
    hostId: '',
    createdAt: Date.now(),
    phase: 'lobby',
    players: new Map(),
    chat: [],
    bombs: new Map(),
    flames: [],
    powerups: new Map(),
    matchTimerMs: MATCH_DURATION_MS,
    rngSeed: Math.floor(Math.random() * 10_000),
  };
  rooms.set(roomId, room);
  const shareBase = resolveShareBase(req);
  res.json({ roomId, shareUrl: `${shareBase}/?room=${roomId}` });
});

app.get('/api/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    id: room.id,
    phase: room.phase,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      color: p.color,
      alive: p.alive,
    })),
    capacity: MAX_PLAYERS,
  });
});

if (hasClientBundle) {
  app.use(express.static(resolvedClientDist, { index: false }));
  const indexFile = path.join(resolvedClientDist, 'index.html');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.method !== 'GET') {
      return next();
    }
    const acceptsHtml = req.accepts('html');
    if (!acceptsHtml) {
      return next();
    }
    return res.sendFile(indexFile);
  });
} else {
  console.warn(`Client bundle not found at ${resolvedClientDist}. Only API and WebSocket endpoints will be served.`);
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId, name }: { roomId: string; name?: string }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('room:error', { message: 'Комната не найдена' });
      return;
    }
    if (room.players.size >= MAX_PLAYERS && !room.players.has(socket.id)) {
      socket.emit('room:error', { message: 'Комната заполнена' });
      return;
    }
    const playerId = socket.id;
    const playerName = sanitizeName(name) ?? generateName();

    const color = pickPlayerColor(room, playerId);
    const playerState: PlayerState = {
      id: playerId,
      name: playerName,
      color,
      ready: false,
      alive: true,
      pos: getSpawnPoint(room.players.size),
      speedLevel: 0,
      bombCountLevel: 0,
      powerLevel: 0,
      lastInputSeq: 0,
      lastBombAt: 0,
      socketId: socket.id,
      ping: 0,
    };
    room.players.set(playerId, playerState);
    if (!room.hostId) {
      room.hostId = playerId;
    }
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;

    socket.emit('room:joined', {
      playerId,
      roomId,
      hostId: room.hostId,
      name: playerName,
      color,
    });
    broadcastLobby(room);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId as string | undefined;
    const playerId = socket.data.playerId as string | undefined;
    if (!roomId || !playerId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    room.players.delete(playerId);
    if (room.hostId === playerId) {
      const nextHost = room.players.values().next().value as PlayerState | undefined;
      room.hostId = nextHost ? nextHost.id : '';
    }
    socket.leave(roomId);
    broadcastLobby(room);

    if (room.players.size === 0) {
      cleanupRoom(roomId);
    }
  });

  socket.on('player:updateName', ({ name }: { name: string }) => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const sanitized = sanitizeName(name);
    if (!sanitized) return;
    player.name = sanitized;
    broadcastLobby(room);
  });

  socket.on('player:setReady', ({ ready }: { ready: boolean }) => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = !!ready;
    broadcastLobby(room);
  });

  socket.on('host:start', () => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.players.size < 2) {
      socket.emit('room:error', { message: 'Нужно минимум два игрока' });
      return;
    }
    startCountdown(room);
  });

  socket.on('chat:message', ({ text }: { text: string }) => {
    const room = getRoomForSocket(socket);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    const sanitized = sanitizeChat(text);
    if (!sanitized) return;
    const message: ChatMessage = {
      id: uuid(),
      authorId: player.id,
      authorName: player.name,
      text: sanitized,
      createdAt: Date.now(),
    };
    room.chat.push(message);
    room.chat = room.chat.slice(-10);
    io.to(room.id).emit('chat:message', message);
  });

  socket.on('input:state', (input: PlayerInputState & { ping?: number }) => {
    const room = getRoomForSocket(socket);
    if (!room || room.phase !== 'in_game') return;
    const player = room.players.get(socket.id);
    if (!player || !player.alive) return;
    if (input.seq <= player.lastInputSeq) return;
    player.lastInputSeq = input.seq;
    player.ping = typeof input.ping === 'number' ? input.ping : player.ping;
    playerInputBuffer.set(player.id, {
      up: !!input.up,
      down: !!input.down,
      left: !!input.left,
      right: !!input.right,
      placeBomb: !!input.placeBomb,
      seq: input.seq,
    });
  });
});

const playerInputBuffer = new Map<string, PlayerInputState>();

function generateRoomCode(): string {
  let code = '';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeName(name?: string): string | undefined {
  if (!name) return undefined;
  const trimmed = name.trim().slice(0, 16);
  if (trimmed.length < 2) return undefined;
  return trimmed;
}

function sanitizeChat(text?: string): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 200);
}

function generateName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `${adjective} ${noun} #${suffix}`;
}

function pickPlayerColor(room: Room, playerId: string): string {
  const palette = ['#4F46E5', '#F97316', '#10B981', '#EC4899', '#6366F1', '#FCD34D'];
  const used = new Set(Array.from(room.players.values()).map((p) => p.color));
  for (const color of palette) {
    if (!used.has(color)) return color;
  }
  const fallback = palette[room.players.size % palette.length];
  return fallback !== undefined ? fallback : palette[0] ?? '#4F46E5';
}

function broadcastLobby(room: Room) {
  io.to(room.id).emit('room:update', {
    roomId: room.id,
    phase: room.phase,
    hostId: room.hostId,
    players: Array.from(room.players.values()).map<LobbyPlayerSummary>((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      ready: player.ready,
      isHost: player.id === room.hostId,
      ping: player.ping,
    })),
    countdownEndsAt: room.countdownEndsAt,
    matchTimerMs: room.matchTimerMs,
  });
}

function startCountdown(room: Room) {
  if (room.phase !== 'lobby' && room.phase !== 'post_game') return;
  room.phase = 'countdown';
  room.countdownEndsAt = Date.now() + 3000;
  broadcastLobby(room);
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    if (room.countdownEndsAt && Date.now() >= room.countdownEndsAt) {
      clearInterval(room.timerInterval!);
      startMatch(room);
    } else {
      broadcastLobby(room);
    }
  }, 250);
}

function startMatch(room: Room) {
  room.phase = 'in_game';
  room.matchStartedAt = Date.now();
  room.matchTimerMs = MATCH_DURATION_MS;
  room.bombs.clear();
  room.flames = [];
  room.powerups.clear();
  const map = generateMap(room);
  room.map = map;
  assignSpawns(room, map);
  broadcastLobby(room);

  if (room.tickInterval) clearInterval(room.tickInterval);
  room.tickInterval = setInterval(() => tickRoom(room), TICK_RATE);
  if (room.snapshotInterval) clearInterval(room.snapshotInterval);
  room.snapshotInterval = setInterval(() => sendSnapshot(room), SNAPSHOT_RATE);
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    if (room.phase !== 'in_game') return;
    room.matchTimerMs = Math.max(0, room.matchTimerMs - 250);
    if (room.matchTimerMs === 0) {
      endMatch(room, null, 'time');
    }
  }, 250);
}

function assignSpawns(room: Room, map: GeneratedMap) {
  const shuffled = [...SPAWN_POINTS];
  shuffleInPlace(shuffled);
  const players = Array.from(room.players.values());
  players.forEach((player, index) => {
    const spawn = shuffled[index % shuffled.length];
    player.pos = spawn ? clonePoint(spawn) : getSpawnPoint(index);
    player.movement = undefined;
    player.alive = true;
    player.ready = false;
    player.speedLevel = 0;
    player.powerLevel = 0;
    player.bombCountLevel = 0;
    player.lastInputSeq = 0;
    player.lastBombAt = 0;
  });

  // ensure spawn tiles are clear
  for (const spawn of shuffled.slice(0, players.length)) {
    const key = keyFromPoint(spawn);
    map.walls.delete(key);
    map.columns.delete(key);
  }
}

function generateMap(room: Room): GeneratedMap {
  const rng = seedrandom(String(room.rngSeed + Date.now()));
  const walls = new Map<string, WallBlock>();
  const columns = new Set<string>();
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const key = keyFromXY(x, y);
      if (COLUMN_MASK(x, y)) {
        columns.add(key);
        continue;
      }
      const isSpawn = SPAWN_POINTS.some((p) => p.x === x && p.y === y);
      if (isSpawn) continue;
      const density = 0.45;
      if (rng() < density) {
        const hasPowerup = rng() < POWERUP_CHANCE;
        const wall: WallBlock = {
          id: uuid(),
          pos: { x, y },
          hasPowerup,
        };
        if (hasPowerup) {
          wall.powerupType = pickPowerup(rng);
        }
        walls.set(key, wall);
      }
    }
  }
  return { width: MAP_WIDTH, height: MAP_HEIGHT, walls, columns };
}

function pickPowerup(rng: seedrandom.PRNG): PowerupType {
  const types: PowerupType[] = ['speed', 'count', 'power'];
  const index = Math.floor(rng() * types.length) % types.length;
  return types[index] ?? 'speed';
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = temp!;
  }
}

function tickRoom(room: Room) {
  if (room.phase !== 'in_game' || !room.map) return;
  const now = Date.now();
  for (const player of room.players.values()) {
    if (!player.alive) continue;
    const input = playerInputBuffer.get(player.id);
    if (input) {
      applyMovement(room, player, input, now);
      if (input.placeBomb) {
        tryPlaceBomb(room, player, now);
      }
    } else {
      applyMovement(room, player, { up: false, down: false, left: false, right: false, placeBomb: false, seq: player.lastInputSeq }, now);
    }
  }

  updateBombs(room, now);
  updateFlames(room, now);
  checkVictory(room);
}

function applyMovement(room: Room, player: PlayerState, input: PlayerInputState, now: number) {
  const currentTileTime = Math.max(MIN_TILE_TIME, BASE_TILE_TIME * Math.pow(SPEED_REDUCTION, player.speedLevel));
  const progressIncrement = TICK_RATE / currentTileTime;
  if (!player.movement) {
    const direction = chooseDirection(input);
    if (direction) {
      const target = nextPoint(player.pos, direction);
      if ((target.x !== player.pos.x || target.y !== player.pos.y) && canEnterTile(room, target)) {
        player.movement = {
          from: { ...player.pos },
          to: target,
          progress: 0,
          direction,
        };
      }
    }
  }
  if (player.movement) {
    player.movement.progress += progressIncrement;
    if (player.movement.progress >= 1) {
      player.pos = clonePoint(player.movement.to);
      player.movement = undefined;
      const powerup = [...room.powerups.values()].find((p) => p.pos.x === player.pos.x && p.pos.y === player.pos.y);
      if (powerup) {
        applyPowerup(player, powerup.type);
        room.powerups.delete(powerup.id);
        io.to(room.id).emit('powerup:picked', { playerId: player.id, type: powerup.type });
      }
      const direction = chooseDirection(input);
      if (direction) {
        const target = nextPoint(player.pos, direction);
        if ((target.x !== player.pos.x || target.y !== player.pos.y) && canEnterTile(room, target)) {
          player.movement = {
            from: { ...player.pos },
            to: target,
            progress: 0,
            direction,
          };
        }
      }
    }
  }
}

function applyPowerup(player: PlayerState, type: PowerupType) {
  switch (type) {
    case 'speed':
      player.speedLevel = Math.min(player.speedLevel + 1, 8);
      break;
    case 'count':
      player.bombCountLevel = Math.min(player.bombCountLevel + 1, 5);
      break;
    case 'power':
      player.powerLevel = Math.min(player.powerLevel + 1, 6);
      break;
  }
}

function chooseDirection(input: PlayerInputState): Direction | undefined {
  if (input.up) return 'up';
  if (input.down) return 'down';
  if (input.left) return 'left';
  if (input.right) return 'right';
  return undefined;
}

function nextPoint(point: Point, direction: Direction): Point {
  switch (direction) {
    case 'up':
      return { x: point.x, y: Math.max(0, point.y - 1) };
    case 'down':
      return { x: point.x, y: Math.min(MAP_HEIGHT - 1, point.y + 1) };
    case 'left':
      return { x: Math.max(0, point.x - 1), y: point.y };
    case 'right':
      return { x: Math.min(MAP_WIDTH - 1, point.x + 1), y: point.y };
  }
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function getSpawnPoint(index: number): Point {
  const base = SPAWN_POINTS[index % SPAWN_POINTS.length] ?? SPAWN_POINTS[0]!;
  return clonePoint(base);
}

function canEnterTile(room: Room, point: Point): boolean {
  if (!room.map) return false;
  const { walls, columns } = room.map;
  const key = keyFromPoint(point);
  if (columns.has(key)) return false;
  if (walls.has(key)) return false;
  for (const bomb of room.bombs.values()) {
    if (bomb.pos.x === point.x && bomb.pos.y === point.y) {
      return false;
    }
  }
  return true;
}

function tryPlaceBomb(room: Room, player: PlayerState, now: number) {
  const activeBombs = [...room.bombs.values()].filter((bomb) => bomb.ownerId === player.id).length;
  const maxBombs = MAX_ACTIVE_BOMBS_BASE + player.bombCountLevel;
  if (activeBombs >= maxBombs) return;
  const key = keyFromPoint(player.pos);
  if (room.bombs.has(key)) return;
  const bomb: Bomb = {
    id: uuid(),
    ownerId: player.id,
    pos: { ...player.pos },
    fuseMs: BOMB_FUSE_MS,
    power: BASE_POWER + player.powerLevel,
  };
  room.bombs.set(key, bomb);
}

function updateBombs(room: Room, now: number) {
  const exploded: Bomb[] = [];
  for (const [key, bomb] of room.bombs.entries()) {
    bomb.fuseMs -= TICK_RATE;
    if (bomb.fuseMs <= 0) {
      exploded.push(bomb);
      room.bombs.delete(key);
    }
  }
  for (const bomb of exploded) {
    explodeBomb(room, bomb);
  }
}

function explodeBomb(room: Room, bomb: Bomb) {
  const affectedTiles: Point[] = [{ ...bomb.pos }];
  const directions: Point[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  for (const dir of directions) {
    for (let step = 1; step <= bomb.power; step++) {
      const tile = { x: bomb.pos.x + dir.x * step, y: bomb.pos.y + dir.y * step };
      if (!isInsideMap(tile)) break;
      const key = keyFromPoint(tile);
      if (room.map?.columns.has(key)) break;
      affectedTiles.push(tile);
      const wall = room.map?.walls.get(key);
      if (wall) {
        room.map?.walls.delete(key);
        if (wall.hasPowerup && wall.powerupType) {
          const powerup: Powerup = {
            id: uuid(),
            pos: { ...tile },
            type: wall.powerupType,
          };
          room.powerups.set(powerup.id, powerup);
        }
        break;
      }
      const otherBomb = room.bombs.get(key);
      if (otherBomb) {
        room.bombs.delete(key);
        explodeBomb(room, otherBomb);
        break;
      }
    }
  }
  const flameTTL = 400;
  for (const tile of affectedTiles) {
    room.flames.push({ pos: tile, ttl: flameTTL });
  }
  for (const player of room.players.values()) {
    if (!player.alive) continue;
    if (affectedTiles.some((tile) => tile.x === player.pos.x && tile.y === player.pos.y)) {
      player.alive = false;
      io.to(room.id).emit('kill:event', { victimId: player.id, killerId: bomb.ownerId === player.id ? null : bomb.ownerId });
    }
  }
}

function updateFlames(room: Room, now: number) {
  room.flames = room.flames
    .map((flame) => ({ ...flame, ttl: flame.ttl - TICK_RATE }))
    .filter((flame) => flame.ttl > 0);
}

function checkVictory(room: Room) {
  if (room.phase !== 'in_game') return;
  const alivePlayers = [...room.players.values()].filter((player) => player.alive);
  if (alivePlayers.length <= 1) {
    endMatch(room, alivePlayers[0]?.id ?? null, 'lastAlive');
  }
}

function endMatch(room: Room, winnerId: string | null, reason: 'time' | 'lastAlive') {
  room.phase = 'post_game';
  room.winnerId = winnerId;
  clearIntervals(room);
  sendSnapshot(room);
  io.to(room.id).emit('game:over', { winnerId, reason });
  broadcastLobby(room);
}

function clearIntervals(room: Room) {
  if (room.tickInterval) clearInterval(room.tickInterval);
  if (room.snapshotInterval) clearInterval(room.snapshotInterval);
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.tickInterval = undefined;
  room.snapshotInterval = undefined;
  room.timerInterval = undefined;
}

function sendSnapshot(room: Room) {
  const payload: SnapshotPayload = {
    phase: room.phase,
    timerMs: room.matchTimerMs,
    players: Array.from(room.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      pos: player.pos,
      alive: player.alive,
      speedLevel: player.speedLevel,
      bombCountLevel: player.bombCountLevel,
      powerLevel: player.powerLevel,
    })),
    bombs: Array.from(room.bombs.values()),
    flames: room.flames,
    powerups: Array.from(room.powerups.values()),
    countdownEndsAt: room.countdownEndsAt,
    winnerId: room.winnerId,
  };
  if (room.map) {
    payload.map = {
      width: room.map.width,
      height: room.map.height,
      walls: Array.from(room.map.walls.values()),
      columns: Array.from(room.map.columns).map((key) => pointFromKey(key)).map((pos) => ({ pos })),
    };
  }
  io.to(room.id).emit('state:snapshot', payload);
}

function keyFromPoint(point: Point): string {
  return `${point.x}:${point.y}`;
}

function keyFromXY(x: number, y: number): string {
  return `${x}:${y}`;
}

function pointFromKey(key: string): Point {
  const [xs, ys] = key.split(':');
  const x = Number(xs);
  const y = Number(ys);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return { x: 0, y: 0 };
  }
  return { x, y };
}

function isInsideMap(point: Point): boolean {
  return point.x >= 0 && point.x < MAP_WIDTH && point.y >= 0 && point.y < MAP_HEIGHT;
}

function getRoomForSocket(socket: Socket): Room | undefined {
  const roomId = socket.data.roomId as string | undefined;
  if (!roomId) return undefined;
  return rooms.get(roomId);
}

function cleanupRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  clearIntervals(room);
  rooms.delete(roomId);
}

server.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
