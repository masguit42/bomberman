import { useMemo } from 'react';
import { SnapshotPayload } from '../types';
import './PostGameOverlay.css';

type Props = {
  snapshot: SnapshotPayload;
  onPlayAgain: () => void;
  onCopyLink: () => void;
};

export function PostGameOverlay({ snapshot, onPlayAgain, onCopyLink }: Props) {
  const winner = useMemo(() => {
    const winnerId = snapshot.winnerId ?? '';
    return snapshot.players.find((player) => player.id === winnerId);
  }, [snapshot]);

  return (
    <div className="postgame-backdrop">
      <div className="postgame-card">
        <h2>{winner ? `Победитель: ${winner.name}` : 'Ничья'}</h2>
        <p className="postgame-subtitle">Матч длился {formatDuration(snapshot.timerMs)}</p>
        <table>
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Статус</th>
              <th>Скорость</th>
              <th>Бомбы</th>
              <th>Мощь</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.players.map((player) => (
              <tr key={player.id} className={player.alive ? 'alive' : 'dead'}>
                <td>{player.name}</td>
                <td>{player.alive ? 'Выжил' : 'Пал'}</td>
                <td>{player.speedLevel + 1}</td>
                <td>{player.bombCountLevel + 1}</td>
                <td>{player.powerLevel + 2}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="postgame-actions">
          <button className="primary" onClick={onPlayAgain}>
            Сыграть ещё
          </button>
          <button className="secondary" onClick={onCopyLink}>
            Скопировать ссылку
          </button>
        </div>
        <p className="tooltip">Хост может начать новый матч из лобби</p>
      </div>
    </div>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor((3 * 60 * 1000 - ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}м ${seconds}с`;
}
