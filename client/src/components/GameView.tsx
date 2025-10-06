import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getSocket } from '../socket';
import { SnapshotPayload, PlayerSnapshot, KillEvent, PowerupPickupEvent } from '../types';
import './GameView.css';

const INPUT_INTERVAL = 80;

export function GameView() {
  const { snapshot, playerId, killFeed, powerups } = useGameStore();
  const [inputState, setInputState] = useState({ up: false, down: false, left: false, right: false });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);
  const bombQueued = useRef(false);
  const inputRef = useRef(inputState);

  const playerSelf = useMemo(
    () => snapshot?.players.find((player: PlayerSnapshot) => player.id === playerId),
    [snapshot, playerId],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      let consumed = true;
      setInputState((prev) => {
        const next = { ...prev };
        switch (event.key) {
          case 'ArrowUp':
          case 'w':
          case 'W':
            next.up = true;
            break;
          case 'ArrowDown':
          case 's':
          case 'S':
            next.down = true;
            break;
          case 'ArrowLeft':
          case 'a':
          case 'A':
            next.left = true;
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            next.right = true;
            break;
          case ' ': {
            if (!event.repeat) {
              bombQueued.current = true;
            }
            break;
          }
          default:
            consumed = false;
        }
        inputRef.current = next;
        return next;
      });
      if (consumed) {
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      setInputState((prev) => {
        const next = { ...prev };
        switch (event.key) {
          case 'ArrowUp':
          case 'w':
          case 'W':
            next.up = false;
            break;
          case 'ArrowDown':
          case 's':
          case 'S':
            next.down = false;
            break;
          case 'ArrowLeft':
          case 'a':
          case 'A':
            next.left = false;
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            next.right = false;
            break;
          default:
            break;
        }
        inputRef.current = next;
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const socket = getSocket();
        const payload = {
          seq: ++seqRef.current,
          up: inputRef.current.up,
          down: inputRef.current.down,
          left: inputRef.current.left,
          right: inputRef.current.right,
          placeBomb: bombQueued.current,
          ping: Math.floor(Math.random() * 40) + 20,
        };
        socket.emit('input:state', payload);
        bombQueued.current = false;
      } catch (error) {
        // socket not ready yet
      }
    }, INPUT_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !snapshot?.map) return;
      const container = containerRef.current.getBoundingClientRect();
      const tileWidth = container.width / snapshot.map.width;
      const tileHeight = container.height / snapshot.map.height;
      const tileSize = Math.max(16, Math.floor(Math.min(tileWidth, tileHeight)));
      const width = tileSize * snapshot.map.width;
      const height = tileSize * snapshot.map.height;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [snapshot]);

  useEffect(() => {
    drawScene(canvasRef.current, snapshot);
  }, [snapshot]);

  return (
    <div className="game-layout">
      <header className="hud-header">
        <div className="hud-logo">💣 Bomber Casual</div>
        <div className="hud-timer">{formatTimer(snapshot?.timerMs ?? 0)}</div>
        <div className="hud-players">
          {snapshot?.players.map((player: PlayerSnapshot) => (
            <span key={player.id} className={player.alive ? 'alive' : 'dead'} style={{ backgroundColor: player.color }}>
              {player.name.slice(0, 1)}
            </span>
          ))}
        </div>
      </header>
      <div className="game-main">
        <div className="canvas-wrapper" ref={containerRef}>
          <canvas ref={canvasRef} className="game-canvas" />
        </div>
        <aside className="side-panel">
          <h3>Килл-фид</h3>
          <div className="kill-feed">
            {killFeed.map((entry: KillEvent, index: number) => (
              <div key={index} className="kill-entry">
                {renderKillText(entry)}
              </div>
            ))}
          </div>
          <h3>Пикапы</h3>
          <div className="powerup-feed">
            {powerups.map((event: PowerupPickupEvent, index: number) => (
              <span key={index} className={`perk perk-${event.type}`}>
                {event.type}
              </span>
            ))}
          </div>
        </aside>
      </div>
      {playerSelf && (
        <div className="perk-bar">
          <div className="perk-chip">
            <span>⚡ Скорость</span>
            <strong>{playerSelf.speedLevel + 1}</strong>
          </div>
          <div className="perk-chip">
            <span>💣 Бомбы</span>
            <strong>{playerSelf.bombCountLevel + 1}</strong>
          </div>
          <div className="perk-chip">
            <span>🔥 Мощь</span>
            <strong>{playerSelf.powerLevel + 2}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function drawScene(canvas: HTMLCanvasElement | null, snapshot?: SnapshotPayload) {
  if (!canvas || !snapshot || !snapshot.map) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width === 0 || canvas.height === 0) {
    canvas.width = snapshot.map.width * 32;
    canvas.height = snapshot.map.height * 32;
  }
  const tileSize = canvas.width / snapshot.map.width;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1b9aaa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // draw grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= snapshot.map.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * tileSize, 0);
    ctx.lineTo(x * tileSize, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= snapshot.map.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * tileSize);
    ctx.lineTo(canvas.width, y * tileSize);
    ctx.stroke();
  }

  // draw columns
  ctx.fillStyle = '#cbd5f5';
  snapshot.map.columns.forEach(({ pos }) => {
    drawRoundedRect(ctx, pos.x * tileSize, pos.y * tileSize, tileSize, tileSize, 12);
    ctx.fill();
  });

  // draw walls
  snapshot.map.walls.forEach((wall) => {
    ctx.fillStyle = '#f97316';
    drawRoundedRect(ctx, wall.pos.x * tileSize + 4, wall.pos.y * tileSize + 4, tileSize - 8, tileSize - 8, 10);
    ctx.fill();
  });

  // draw powerups
  snapshot.powerups.forEach((powerup) => {
    const centerX = powerup.pos.x * tileSize + tileSize / 2;
    const centerY = powerup.pos.y * tileSize + tileSize / 2;
    ctx.beginPath();
    ctx.fillStyle = powerupColor(powerup.type);
    ctx.arc(centerX, centerY, tileSize * 0.25, 0, Math.PI * 2);
    ctx.fill();
  });

  // draw bombs
  snapshot.bombs.forEach((bomb) => {
    const cx = bomb.pos.x * tileSize + tileSize / 2;
    const cy = bomb.pos.y * tileSize + tileSize / 2;
    const radius = tileSize * 0.28;
    const fuseRatio = Math.max(0, bomb.fuseMs / 2500);
    ctx.beginPath();
    ctx.fillStyle = '#111827';
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.arc(cx, cy, radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fuseRatio);
    ctx.stroke();
  });

  // draw flames
  snapshot.flames.forEach((flame) => {
    const alpha = Math.max(0, flame.ttl / 400);
    ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
    ctx.fillRect(flame.pos.x * tileSize, flame.pos.y * tileSize, tileSize, tileSize);
  });

  // draw players
  snapshot.players.forEach((player) => {
    const cx = player.pos.x * tileSize + tileSize / 2;
    const cy = player.pos.y * tileSize + tileSize / 2;
    const radius = tileSize * 0.32;
    ctx.beginPath();
    ctx.fillStyle = player.color;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.floor(tileSize * 0.35)}px Nunito`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(player.name.slice(0, 1), cx, cy);
  });
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function formatTimer(timerMs: number) {
  const totalSeconds = Math.floor(timerMs / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function renderKillText(event: KillEvent) {
  const { snapshot } = useGameStore.getState();
  const players = snapshot?.players ?? [];
  const killer = event.killerId ? players.find((player: PlayerSnapshot) => player.id === event.killerId) : undefined;
  const victim = players.find((player: PlayerSnapshot) => player.id === event.victimId);
  if (!victim) return 'Игрок потерян';
  if (!killer || killer.id === victim.id) {
    return `${victim.name} самоуничтожился`;
  }
  return `${killer.name} подорвал ${victim.name}`;
}

function powerupColor(type: string) {
  switch (type) {
    case 'speed':
      return '#22c55e';
    case 'count':
      return '#6366f1';
    case 'power':
      return '#f97316';
    default:
      return '#f8fafc';
  }
}
