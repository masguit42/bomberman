import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { useGameStore } from '../store/useGameStore';
import { LobbyPlayerSummary } from '../types';
import './Lobby.css';

type Props = {
  onToggleReady: (ready: boolean) => void;
  onStartGame: () => void;
  onCopyLink: () => void;
  onSendChat: (text: string) => void;
};

const MAX_PLAYERS = 6;

export function Lobby({ onToggleReady, onStartGame, onCopyLink, onSendChat }: Props) {
  const { lobby, playerId, hostId, chat } = useGameStore();
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');

  const players: LobbyPlayerSummary[] = useMemo(() => {
    if (!lobby) return [];
    const list = [...lobby.players];
    return list;
  }, [lobby]);

  const roomCode = lobby?.roomId ?? '';
  const readyFromServer = lobby?.players.find((player: LobbyPlayerSummary) => player.id === playerId)?.ready ?? false;

  useEffect(() => {
    setReady(readyFromServer);
  }, [readyFromServer]);

  const handleReadyChange = () => {
    const next = !ready;
    setReady(next);
    onToggleReady(next);
  };

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    onSendChat(message.trim());
    setMessage('');
  };

  return (
    <div className="lobby-wrapper">
      <header className="lobby-header">
        <div className="logo">💣 Bomber Casual</div>
        <div className="room-code">
          Комната: <strong>{roomCode}</strong>
          <button className="secondary" onClick={onCopyLink}>
            Скопировать ссылку
          </button>
        </div>
      </header>
      <div className="lobby-content">
        <section className="players-grid">
          {Array.from({ length: MAX_PLAYERS }).map((_, index) => {
            const player = players[index];
            return (
              <div key={index} className={classNames('player-card', { empty: !player })}>
                {player ? (
                  <>
                    <div className="avatar" style={{ background: player.color }}>
                      {player.name.slice(0, 1)}
                    </div>
                    <div className="player-info">
                      <span className="player-name">{player.name}</span>
                      <span className={classNames('player-status', { ready: player.ready })}>
                        {player.ready ? 'Готов' : 'Не готов'}
                      </span>
                    </div>
                    <span className={classNames('ping-indicator', pingColor(player.ping))} />
                    {player.id === hostId && <span className="host-badge">Хост</span>}
                  </>
                ) : (
                  <span className="slot-empty">Свободный слот</span>
                )}
              </div>
            );
          })}
        </section>
        <aside className="lobby-chat">
          <h3>Чат</h3>
          <div className="chat-messages">
            {chat.map((entry) => (
              <div key={entry.id} className="chat-message">
                <span className="author">{entry.authorName}:</span> {entry.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} className="chat-input">
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Напишите сообщение" />
            <button type="submit" className="secondary">
              ➤
            </button>
          </form>
        </aside>
      </div>
      <footer className="lobby-footer">
        <button className={classNames('ready-toggle', { active: ready })} onClick={handleReadyChange}>
          {ready ? 'Готов!' : 'Нажмите, чтобы быть готовым'}
        </button>
        {playerId === hostId && (
          <button className="primary" onClick={onStartGame} disabled={players.filter((p) => !!p).length < 2}>
            Начать игру
          </button>
        )}
      </footer>
    </div>
  );
}

function pingColor(ping: number) {
  if (ping < 60) return 'good';
  if (ping < 120) return 'medium';
  return 'bad';
}
