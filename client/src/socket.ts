import { io, Socket } from 'socket.io-client';
import { useGameStore } from './store/useGameStore';
import {
  ChatMessage,
  JoinedPayload,
  LobbyStatePayload,
  SnapshotPayload,
  KillEvent,
  PowerupPickupEvent,
  PowerupType,
} from './types';

let socket: Socket | undefined;

export function getSocket() {
  if (!socket) {
    throw new Error('Socket not initialised');
  }
  return socket;
}

export function connectSocket(serverUrl: string) {
  if (socket) {
    return socket;
  }
  socket = io(serverUrl, {
    autoConnect: false,
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('Connected');
  });

  socket.on('disconnect', () => {
    useGameStore.getState().reset();
  });

  socket.on('room:joined', (payload: JoinedPayload) => {
    useGameStore.getState().setJoined(payload);
  });

  socket.on('room:update', (payload: LobbyStatePayload) => {
    useGameStore.getState().setLobby(payload);
  });

  socket.on('state:snapshot', (payload: SnapshotPayload) => {
    useGameStore.getState().setSnapshot(payload);
  });

  socket.on('chat:message', (message: ChatMessage) => {
    useGameStore.getState().pushChat(message);
  });

  socket.on('game:over', ({ winnerId, reason }: { winnerId: string | null; reason: string }) => {
    console.log('Game over', winnerId, reason);
  });

  socket.on('kill:event', ({ victimId, killerId }: { victimId: string; killerId: string | null }) => {
    const event: KillEvent = {
      victimId,
      killerId,
      timestamp: Date.now(),
    };
    useGameStore.getState().pushKill(event);
  });

  socket.on('powerup:picked', ({ playerId, type }: { playerId: string; type: string }) => {
    const event: PowerupPickupEvent = {
      playerId,
      type: type as PowerupType,
      timestamp: Date.now(),
    };
    useGameStore.getState().pushPowerup(event);
  });

  socket.on('room:error', (error: { message: string }) => {
    console.error(error.message);
  });

  return socket;
}
