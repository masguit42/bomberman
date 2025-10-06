function resolveBaseUrl(): string {
  const envUrl = import.meta.env.VITE_SERVER_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

const API_URL = resolveBaseUrl();

export async function createRoom() {
  const response = await fetch(`${API_URL}/api/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error('Не удалось создать комнату');
  }
  return (await response.json()) as { roomId: string; shareUrl: string };
}

export async function fetchRoom(roomId: string) {
  const response = await fetch(`${API_URL}/api/room/${roomId}`);
  if (!response.ok) {
    throw new Error('Комната не найдена');
  }
  return response.json();
}

export function getServerUrl() {
  return API_URL;
}
