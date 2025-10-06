import { useEffect, useState } from 'react';
import './App.css';
import { NicknameModal } from './components/NicknameModal';
import { Lobby } from './components/Lobby';
import { GameView } from './components/GameView';
import { PostGameOverlay } from './components/PostGameOverlay';
import { useGameStore } from './store/useGameStore';
import { connectSocket, getSocket } from './socket';
import { createRoom, getServerUrl } from './api';

function App() {
  const { phase, snapshot, roomId, hostId, playerId } = useGameStore();
  const [nickname, setNickname] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return localStorage.getItem('bomberman:nickname') ?? undefined;
  });
  const [nicknameModalOpen, setNicknameModalOpen] = useState(!nickname);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    connectSocket(getServerUrl());
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code) {
      setJoiningRoomId(code.toUpperCase());
    }
  }, []);

  useEffect(() => {
    if (!joiningRoomId || !nickname) return;
    try {
      const socket = connectSocket(getServerUrl());
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit('room:join', { roomId: joiningRoomId, name: nickname });
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Не удалось подключиться к серверу');
    }
  }, [joiningRoomId, nickname]);

  const handleNicknameSubmit = (name: string, remember: boolean) => {
    setNickname(name);
    setNicknameModalOpen(false);
    if (remember) {
      localStorage.setItem('bomberman:nickname', name);
    } else {
      localStorage.removeItem('bomberman:nickname');
    }
  };

  const handleCreateRoom = async () => {
    if (!nickname) {
      setNicknameModalOpen(true);
      return;
    }
    try {
      setLoading(true);
      const { roomId: newRoomId } = await createRoom();
      updateUrlWithRoom(newRoomId);
      setJoiningRoomId(newRoomId);
    } catch (err) {
      console.error(err);
      setError('Не удалось создать комнату');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nickname) {
      setNicknameModalOpen(true);
      return;
    }
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) {
      setError('Введите код из 4 символов');
      return;
    }
    updateUrlWithRoom(code);
    setJoiningRoomId(code);
    setError(null);
  };

  const handleToggleReady = (ready: boolean) => {
    try {
      getSocket().emit('player:setReady', { ready });
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartGame = () => {
    try {
      getSocket().emit('host:start');
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setStatusMessage('Ссылка скопирована');
    setTimeout(() => setStatusMessage(null), 2000);
  };

  const handleSendChat = (text: string) => {
    try {
      getSocket().emit('chat:message', { text });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePlayAgain = () => {
    if (playerId === hostId) {
      handleStartGame();
    } else {
      handleToggleReady(true);
    }
  };

  return (
    <div className="app-shell">
      {!roomId ? (
        <div className="landing">
          <div className="landing-card">
            <h1>Bomber Casual</h1>
            <p>Создайте комнату, поделитесь ссылкой с друзьями и сражайтесь до последнего выжившего.</p>
            <div className="landing-actions">
              <button className="primary" onClick={handleCreateRoom} disabled={loading}>
                {loading ? 'Создаём…' : 'Создать комнату'}
              </button>
              <form onSubmit={handleJoinSubmit} className="join-form">
                <input
                  value={joinCodeInput}
                  onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())}
                  placeholder="Код комнаты"
                  maxLength={6}
                />
                <button type="submit" className="secondary">
                  Присоединиться
                </button>
              </form>
            </div>
            {error && <p className="info-message">{error}</p>}
          </div>
        </div>
      ) : phase === 'in_game' || phase === 'post_game' ? (
        <GameView />
      ) : (
        <Lobby onToggleReady={handleToggleReady} onStartGame={handleStartGame} onCopyLink={handleCopyLink} onSendChat={handleSendChat} />
      )}
      {phase === 'post_game' && snapshot && (
        <PostGameOverlay snapshot={snapshot} onPlayAgain={handlePlayAgain} onCopyLink={handleCopyLink} />
      )}
      <NicknameModal isOpen={nicknameModalOpen} initialName={nickname} onSubmit={handleNicknameSubmit} />
      {statusMessage && <div className="toast">{statusMessage}</div>}
    </div>
  );
}

function updateUrlWithRoom(roomId: string) {
  const params = new URLSearchParams(window.location.search);
  params.set('room', roomId);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

export default App;
