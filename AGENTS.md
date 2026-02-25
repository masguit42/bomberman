# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Bomberman Casual — a browser-based multiplayer Bomberman game (up to 6 players). Two independent packages in the repo: `client/` (React + Vite) and `server/` (Node.js + Express 5 + Socket.IO). No databases or external services needed; all state is in-memory.

### Running in development

See `README.md` for standard commands. Key ports: server on `4000`, Vite dev server on `5173`.

Start the **server first**, then the client:

```
cd server && npm run dev   # port 4000
cd client && npm run dev   # port 5173, proxies /api and /socket.io → 4000
```

### Important caveats

- **Do NOT run `npm run build` in `client/` before starting the server in dev mode.** The server checks for `client/dist` and, if it exists, registers a wildcard Express route (`app.get('*', ...)`) that crashes under Express 5's path-to-regexp. In dev mode, Vite serves the frontend, so `client/dist` is not needed. If `client/dist` already exists, delete it before starting the server: `rm -rf client/dist`.
- The server uses `nodemon` + `ts-node` for hot-reload. The client uses Vite HMR.
- There are no automated tests in this repo. Linting is available only for the client: `cd client && npm run lint`.
- The server has no lint script configured.
- To build for production (type-check only, not for dev): `cd server && npm run build` and `cd client && npm run build`.
