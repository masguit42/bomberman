import { useEffect, useMemo, useState } from 'react';
import './NicknameModal.css';

type Props = {
  isOpen: boolean;
  initialName?: string;
  onSubmit: (name: string, remember: boolean) => void;
};

const ADJECTIVES = ['Brave', 'Fizzy', 'Happy', 'Lucky', 'Merry', 'Shiny', 'Sunny', 'Swift'];
const NOUNS = ['Bomb', 'Bun', 'Dino', 'Fox', 'Glow', 'Orb', 'Star', 'Wave'];

function generateName(): string {
  for (let i = 0; i < 20; i += 1) {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const name = `${adjective} ${noun} #${suffix}`;
    if (name.length <= 16) {
      return name;
    }
  }

  return 'Swift Orb #1001';
}

export function NicknameModal({ isOpen, initialName, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const placeholder = useMemo(() => generateName(), []);

  useEffect(() => {
    if (initialName) {
      setValue(initialName);
    }
  }, [initialName]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim() || placeholder;
    if (trimmed.length < 2 || trimmed.length > 16) {
      setError('Никнейм должен быть от 2 до 16 символов');
      return;
    }
    setError(undefined);
    onSubmit(trimmed, remember);
  };

  const handleGenerate = () => {
    setValue(generateName());
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Выберите ник</h2>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <label className="input-wrapper">
            <span className="input-label">Ваш никнейм</span>
            <div className="input-with-button">
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={placeholder}
                minLength={2}
                maxLength={16}
              />
              <button type="button" className="secondary" onClick={handleGenerate}>
                🎲
              </button>
            </div>
          </label>
          <label className="remember-toggle">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
            Запомнить меня
          </label>
          {error && <p className="error-text">{error}</p>}
          <div className="modal-actions">
            <button type="submit" className="primary">
              Готово
            </button>
            <button type="button" className="link" onClick={() => onSubmit(placeholder, false)}>
              Войти как гость
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
