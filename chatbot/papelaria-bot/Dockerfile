# Multi-stage: instala dependências numa camada separada (cache do Docker
# reaproveita essa camada entre builds enquanto package*.json não mudar) e
# copia só o necessário pra imagem final — sem devDependencies, sem cache
# do npm, sem lixo de build. Node 22 (mesma versão do CI, ver
# .github/workflows — corrigido de 20→22 em 27/08/2026).
#
# Ver PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md — plano
# de deploy completo (VM Oracle Cloud Always Free + Caddy + DuckDNS).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app

# §17 do Guia Mestre de Engenharia: nunca rodar como root. A imagem
# node:*-alpine já vem com o usuário/grupo "node" (uid/gid 1000) prontos.
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

# .cache/ (registroDeEcos.js) e logs/ (utils/logger.js, 01/09/2026) são
# gravados em runtime pelo próprio bot — criados aqui com o dono certo pra
# não falhar por permissão quando o container já sobe como "node".
RUN mkdir -p .cache logs && chown -R node:node .cache logs

USER node

# Variáveis de ambiente (Supabase, Evolution API, etc.) NUNCA vão na
# imagem — injetadas em runtime via docker-compose/`--env-file`, conforme
# §17 do Guia Mestre. O .env real nunca é copiado (.dockerignore).
EXPOSE 3000

# Sem HEALTHCHECK de rota dedicada (o bot não tem endpoint /health hoje) —
# docker-compose usa restart:always como rede de segurança equivalente.
CMD ["node", "src/index.js"]
