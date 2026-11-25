# Hazefall lobby server: gathers players, starts rounds, introduces browsers.
# It never runs the match (the host's browser does), so it needs no game code.
FROM node:20-alpine
WORKDIR /app
RUN npm init -y >/dev/null \
  && npm install --omit=dev @colyseus/core@0.18.28 @colyseus/ws-transport@0.18.1 @colyseus/schema@5.0.49 express@5.3.0 tsx@4.23.15
COPY server/index.ts server/LcsRoom.ts ./server/
COPY src/game/net/lobby.ts ./src/game/net/lobby.ts
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
