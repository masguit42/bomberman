export type RoomPhase = 'lobby' | 'countdown' | 'in_game' | 'post_game';

export interface LobbyPlayerSummary {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  isHost: boolean;
  ping: number;
}

export interface LobbyStatePayload {
  roomId: string;
  phase: RoomPhase;
  hostId: string;
  players: LobbyPlayerSummary[];
  countdownEndsAt?: number;
  matchTimerMs: number;
}

export interface SnapshotPayload {
  phase: RoomPhase;
  timerMs: number;
  players: PlayerSnapshot[];
  bombs: BombSnapshot[];
  flames: FlameSnapshot[];
  powerups: PowerupSnapshot[];
  countdownEndsAt?: number;
  winnerId?: string | null;
  map?: MapSnapshot;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: string;
  pos: Point;
  alive: boolean;
  speedLevel: number;
  bombCountLevel: number;
  powerLevel: number;
}

export interface BombSnapshot {
  id: string;
  ownerId: string;
  pos: Point;
  fuseMs: number;
  power: number;
}

export interface FlameSnapshot {
  pos: Point;
  ttl: number;
}

export interface PowerupSnapshot {
  id: string;
  pos: Point;
  type: PowerupType;
}

export interface MapSnapshot {
  width: number;
  height: number;
  walls: WallSnapshot[];
  columns: { pos: Point }[];
}

export interface WallSnapshot {
  id: string;
  pos: Point;
  hasPowerup: boolean;
  powerupType?: PowerupType;
}

export type PowerupType = 'speed' | 'count' | 'power';

export interface Point {
  x: number;
  y: number;
}

export interface JoinedPayload {
  playerId: string;
  roomId: string;
  hostId: string;
  name: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

export interface KillEvent {
  victimId: string;
  killerId: string | null;
  timestamp: number;
}

export interface PowerupPickupEvent {
  playerId: string;
  type: PowerupType;
  timestamp: number;
}
