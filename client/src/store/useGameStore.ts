import { create } from 'zustand';
import {
  LobbyStatePayload,
  RoomPhase,
  SnapshotPayload,
  ChatMessage,
  JoinedPayload,
  KillEvent,
  PowerupPickupEvent,
} from '../types';

interface GameState {
  playerId?: string;
  roomId?: string;
  hostId?: string;
  playerName?: string;
  playerColor?: string;
  phase: RoomPhase;
  lobby?: LobbyStatePayload;
  snapshot?: SnapshotPayload;
  chat: ChatMessage[];
  killFeed: KillEvent[];
  powerups: PowerupPickupEvent[];
  setJoined: (payload: JoinedPayload) => void;
  setLobby: (payload: LobbyStatePayload) => void;
  setSnapshot: (payload: SnapshotPayload) => void;
  pushChat: (message: ChatMessage) => void;
  pushKill: (event: KillEvent) => void;
  pushPowerup: (event: PowerupPickupEvent) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: 'lobby',
  chat: [],
  killFeed: [],
  powerups: [],
  setJoined: (payload: JoinedPayload) =>
    set({
      playerId: payload.playerId,
      roomId: payload.roomId,
      hostId: payload.hostId,
      playerName: payload.name,
      playerColor: payload.color,
    }),
  setLobby: (payload: LobbyStatePayload) =>
    set((state: GameState) => ({
      lobby: payload,
      phase: payload.phase,
      hostId: payload.hostId,
      roomId: payload.roomId,
      snapshot: payload.phase === 'lobby' ? undefined : state.snapshot,
    })),
  setSnapshot: (payload: SnapshotPayload) =>
    set((state: GameState) => ({
      snapshot: payload,
      phase: payload.phase,
      killFeed: payload.phase === 'in_game' && payload.timerMs >= 180000 ? [] : state.killFeed,
      powerups: payload.phase === 'in_game' && payload.timerMs >= 180000 ? [] : state.powerups,
    })),
  pushChat: (message: ChatMessage) =>
    set((state: GameState) => ({
      chat: [...state.chat.slice(-9), message],
    })),
  pushKill: (event: KillEvent) =>
    set((state: GameState) => ({
      killFeed: [...state.killFeed.slice(-4), event],
    })),
  pushPowerup: (event: PowerupPickupEvent) =>
    set((state: GameState) => ({
      powerups: [...state.powerups.slice(-5), event],
    })),
  reset: () =>
    set({
      playerId: undefined,
      roomId: undefined,
      hostId: undefined,
      playerName: undefined,
      playerColor: undefined,
      lobby: undefined,
      snapshot: undefined,
      chat: [],
      killFeed: [],
      powerups: [],
      phase: 'lobby',
    }),
}));
