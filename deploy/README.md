# Deploy do JS Bot — Oracle Cloud Always Free + Docker + Caddy

Segue o plano em `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md`.
Os arquivos desta pasta (`Dockerfile` fica em `chatbot/papelaria-bot/`,
`docker-compose.yml` + `Caddyfile` aqui) já estão prontos — o que falta é
só a parte que só você pode fazer (conta, VM, DNS).

## O que só você pode fazer (fora do meu alcance)

1. Criar conta na Oracle Cloud (tier "Always Free").
2. Criar uma VM Ampere A1 (ARM), Always Free.
3. Reservar um IP público (não o efêmero padrão).
4. Criar um subdomínio grátis em [duckdns.org](https://www.duckdns.org) apontando pro IP reservado.
5. Na Security List da Oracle, liberar as portas **80** e **443** (vêm fechadas por padrão).

## Depois que a VM existir (passo a passo)

Conectado na VM por SSH:

```bash
# 1. Instalar Docker + Docker Compose (Ubuntu/Oracle Linux via script oficial)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# desconecte e reconecte o SSH pra o grupo docker valer

# 2. Clonar o repositório (ou só copiar as pastas chatbot/papelaria-bot e deploy)
git clone <url-do-seu-repositorio> venancio
cd venancio/deploy

# 3. Criar o .env real com os valores de producao
cp ../chatbot/papelaria-bot/.env.example .env
nano .env   # preencher SUPABASE_URL, EVOLUTION_API_KEY, etc. de verdade

# 4. Editar o Caddyfile trocando SEU-SUBDOMINIO pelo subdominio real do DuckDNS
nano Caddyfile

# 5. Subir tudo
docker compose up -d --build

# 6. Conferir que subiu
docker compose ps
docker compose logs -f bot
```

## Depois que estiver no ar

- **Evolution API**: atualizar a URL do webhook pra `https://SEU-SUBDOMINIO.duckdns.org/webhook`.
- **n8n**: o workflow "Agente vendedor" e o "Agente Orçamento" chamam de volta o JS Bot em alguns pontos (callback do Agente de Orçamento, notificação de status) — conferir se algum desses aponta pro túnel ngrok antigo e trocar pro novo endereço HTTPS.
- **Verificação**: mandar uma mensagem de teste pelo WhatsApp da loja e confirmar no `docker compose logs -f bot` que o webhook chegou.

## Comandos do dia a dia

```bash
docker compose logs -f bot        # acompanhar o bot em tempo real
docker compose restart bot        # reiniciar só o bot (ex.: depois de um git pull)
docker compose up -d --build bot  # reconstruir e subir depois de mudar código
docker compose down               # parar tudo (não apaga os volumes de log/cache)
```

## O que este setup resolve (e o que não muda)

- Processo sempre vivo, sobrevive a reinício da VM (`restart: always`) — sem depender do terminal ficar aberto.
- HTTPS automático e renovado sozinho (Caddy + Let's Encrypt), sem custo de domínio.
- Container roda como usuário não-root (`node`), variáveis de ambiente só em runtime, nunca na imagem.
- **Não muda**: os locks de concorrência do bot continuam em memória de processo — isso é seguro com **uma única instância** (decisão do dono, 31/08/2026, ver memória `decisao-instancia-unica-sem-redis`). Não escale pra 2+ réplicas deste serviço sem migrar os locks pra Redis antes.
- **Não inclui**: n8n e Supabase continuam hospedados onde já estão (fora deste plano).
