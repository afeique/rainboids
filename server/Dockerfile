# Rainboids multiplayer server (Node.js).
#
# Build from the REPO ROOT (the server imports the shared sim at ../../js/sim):
#   docker build -f server/Dockerfile -t rainboids-mp .
#   docker run -p 8091:8091 -e MP_PORT=8091 rainboids-mp
#
# The image bundles the server + the shared headless sim only — no browser
# client (that's static and served separately).

FROM node:20-alpine

WORKDIR /app

# Install server dependencies (just `ws`) using the committed lockfile.
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Source: the server and the shared simulation it imports (../../js/sim).
COPY server/src ./server/src
COPY js/sim ./js/sim

ENV MP_PORT=8091
EXPOSE 8091

WORKDIR /app/server
# Liveness: the server answers GET /healthz on MP_PORT.
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- "http://127.0.0.1:${MP_PORT}/healthz" || exit 1

CMD ["node", "src/index.js"]
