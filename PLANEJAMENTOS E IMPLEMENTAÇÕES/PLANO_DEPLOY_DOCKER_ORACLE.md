# Plano de Deploy — Docker + Oracle Cloud Free Tier

Anotação de decisão de arquitetura de deploy, definida em conversa de 13/08. Ainda não implementado — este arquivo é a referência para quando for a hora de executar.

## Decisão

| Componente | Onde roda | Por quê |
|---|---|---|
| JS Bot (papelaria-bot) | Docker, em VM da Oracle Cloud Always Free Tier | Precisa de processo persistente e sempre vivo (locks em memória, webhook do Evolution API, conexões de até 55s com o n8n) — incompatível com serverless (Vercel) e com free tiers que dormem (Render) |
| Venâncio Operations (dashboard) | Vercel | SPA estática pura, encaixe perfeito, grátis, deploy automático a cada push |
| n8n | Já hospedado externamente (Cloudfy) | Sem mudança — fora deste plano |
| Supabase | Serviço gerenciado | Sem mudança — fora deste plano |

## Por que essas escolhas (descartadas e motivo)

- **Vercel para o bot**: descartado. O bot usa locks em memória do processo (`mensagensEmProcessamento`, `conversasComAgenteVendasEmAndamento`, `conversasEmFinalizacao` — achado da auditoria de 13/08) que dependem de ser um processo único sempre vivo. Serverless quebra essa premissa a cada invocação.
- **Render free tier**: descartado. Dorme após 15 min sem tráfego — mensagem do WhatsApp pode chegar exatamente nesse intervalo e atrasar/perder.
- **Railway / Fly.io**: descartados. Não têm mais tier realmente gratuito hoje (só crédito de teste).
- **ngrok**: descartado. Não hospeda nada, só expõe um processo local — depende da própria máquina estar ligada 24/7, e a URL muda a cada reinício no plano grátis. **Nota**: a auditoria de 13/08 já encontrou um workflow n8n ativo em produção apontando pra um túnel ngrok gratuito (Problema 1 do relatório) — isso deve ser corrigido independentemente deste plano de deploy.
- **Domínio pago**: não necessário. Sem domínio próprio, a solução é DuckDNS (subdomínio grátis) + IP público reservado da Oracle.

## Peças do plano

1. **Conta Oracle Cloud** — tier "Always Free". Pede cartão só para verificação de identidade, não cobra nada a menos que se troque de plano manualmente.
2. **VM Ampere A1 (ARM)** — até 4 OCPUs / 24GB RAM de graça, bem acima do necessário para o bot. Node.js e Docker têm suporte nativo a ARM64, sem problema de compatibilidade.
3. **IP público reservado** (não o efêmero padrão) — necessário para o DuckDNS apontar para um endereço estável.
4. **DuckDNS** — subdomínio gratuito (ex.: `venancio-bot.duckdns.org`) apontando para o IP reservado da VM. Resolve o requisito de nome de domínio para HTTPS sem custo.
5. **Docker + Docker Compose** instalados na VM (poucos comandos, feito uma vez).
6. **Caddy** como reverse proxy — gera e renova certificado HTTPS (Let's Encrypt) automaticamente para o subdomínio DuckDNS, sem configuração manual de certificado.
7. **Firewall/Security List da Oracle** — por padrão vem tudo fechado; precisa liberar a porta pública (443/80) manualmente no painel.
8. **`Dockerfile`** multi-stage para o bot: build (`npm ci`), imagem final enxuta, usuário não-root (`USER node`), variáveis de ambiente injetadas em runtime — nunca no build (alinhado à seção 17 do `Guia_Mestre_Engenharia.md`).
9. **`docker-compose.yml`** com `restart: always` — se a VM reiniciar ou o processo cair, volta sozinho sem intervenção manual.

## Ordem de execução sugerida

1. Criar conta e VM na Oracle (Ampere A1, Always Free)
2. Reservar IP público
3. Configurar DuckDNS apontando para o IP
4. Abrir portas 80/443 na security list da Oracle
5. Instalar Docker + Docker Compose na VM
6. Escrever `Dockerfile` do bot (multi-stage, não-root)
7. Escrever `docker-compose.yml` (bot + Caddy)
8. Escrever `Caddyfile` (reverse proxy + HTTPS automático para o subdomínio DuckDNS)
9. Subir com `docker-compose up -d --build`
10. Atualizar a URL do webhook na Evolution API para o novo endereço HTTPS
11. Deploy do dashboard na Vercel (independente, pode ser feito a qualquer momento)

## Pendência para resolver antes ou durante o deploy

- **Problema 1 da auditoria de 13/08**: chave da Evolution API + token de teste em texto plano no workflow n8n ativo, apontando para túnel ngrok. Precisa ser corrigido (credencial nativa + URL de callback real) — se o callback do JS Bot mudar de endereço com este deploy, esse workflow também precisa ser atualizado com a nova URL.
- **Problema 16 da auditoria**: os locks em memória do bot só funcionam com uma única instância. Este plano mantém uma única instância (correto para o estado atual), mas se no futuro houver necessidade de escalar horizontalmente, os locks precisam migrar para Redis antes.

## Prompt para retomar quando for a hora de implementar

> Vamos implementar o deploy do JS Bot (papelaria-bot) em Docker, hospedado numa VM Oracle Cloud Always Free Tier, com HTTPS via DuckDNS + Caddy, conforme o plano em `PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md`. Preciso que você:
> 1. Escreva o `Dockerfile` multi-stage para `chatbot/papelaria-bot` (usuário não-root, variáveis de ambiente em runtime)
> 2. Escreva o `docker-compose.yml` com o bot + Caddy como reverse proxy, `restart: always`
> 3. Escreva o `Caddyfile` apontando para o subdomínio DuckDNS que eu já vou ter configurado
> 4. Me dê o passo a passo exato dos comandos para rodar na VM (instalar Docker, subir o compose, verificar que subiu)
> 5. Liste o que precisa mudar na configuração da Evolution API e do workflow n8n ativo (Problema 1 da auditoria) para apontar para o novo endereço
