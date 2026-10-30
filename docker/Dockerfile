# Une seule image pour l'app et le worker : seule la commande change (voir docker-compose.yml
# en local, deploy/docker-compose.yml sur le VPS). La CI la construit et la publie sur ghcr.io.
FROM node:22-bookworm-slim
# ffmpeg pour coller les plans, et ce qu'il faut à Chrome pour le rendu HyperFrames
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
      libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 fonts-liberation \
      python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* && corepack enable && useradd -m regie \
    && mkdir -p /app /data && chown regie /app /data
# rembg pour « Fond nettoyé » sur les images sans damier, avec son modèle (silueta, libre et léger :
# environ 800 Mo de mémoire le temps d'un détourage), téléchargé ici plutôt qu'au premier clic
ENV U2NET_HOME=/opt/rembg/models REMBG_BIN=/opt/rembg/bin/rembg
RUN python3 -m venv /opt/rembg && /opt/rembg/bin/pip install --no-cache-dir "rembg[cpu,cli]==2.0.84" \
    && /opt/rembg/bin/rembg d silueta && chmod -R a+rX /opt/rembg
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
USER regie

# Les dépendances d'abord, avec les seuls package.json : une modification du code ne les
# retélécharge pas, et le VPS ne tire que la dernière couche à chaque mise à jour.
COPY --chown=regie package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=regie apps/web/package.json apps/web/
COPY --chown=regie apps/worker/package.json apps/worker/
COPY --chown=regie packages/core/package.json packages/core/
COPY --chown=regie packages/db/package.json packages/db/
COPY --chown=regie packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile && cd apps/worker && npx hyperframes browser ensure

COPY --chown=regie . .
# next build lit la configuration : des valeurs factices, le temps du build seulement
RUN DATABASE_URL=postgres://build@localhost/build \
    SESSION_SECRET=build-only-not-a-secret-build-only-not-a-secret \
    MEDIA_SECRET=build-only-not-a-secret-build-only-not-a-secret-2 \
    GITHUB_CLIENT_ID=build GITHUB_CLIENT_SECRET=build \
    pnpm --filter @regie/web build

ENV NODE_ENV=production STORAGE_DIR=/data
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && exec pnpm --filter @regie/web start"]
