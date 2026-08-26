// ============================================================================
// OBSOLETO (desde 14/08/2026) — NÃO USAR.
//
// O dono abandonou o modelo PM2 + túnel ngrok para rodar o bot direto no
// terminal (`node src/index.js`) e acompanhar logs ao vivo. Este arquivo é
// mantido apenas por referência histórica (há um comentário em src/index.js
// que ainda cita "ver ecosystem.config.js" ao explicar o motivo de
// process.exit em uncaughtException — não reescreva esse arquivo baseado
// nisso).
//
// O plano de deploy real é Docker em VM Oracle Cloud, descrito em
// "PLANEJAMENTOS E IMPLEMENTAÇÕES/PLANO_DEPLOY_DOCKER_ORACLE.md" (Fase 8 do
// plano mestre, ainda não executada). Não reative este arquivo sem o dono
// pedir explicitamente.
// ============================================================================
//
// Configuração do pm2 (blindagem operacional, ver AUDITORIA_INTEGRACAO.md /
// análise de instabilidade de 29/07/2026). Antes disso, tanto o bot quanto o
// túnel ngrok rodavam soltos em terminais manuais — se um dos dois caísse
// (crash do processo, queda do ngrok), nada os reiniciava sozinho, e o
// sintoma era exatamente "o bot não responde nada" sem nenhum log de erro
// (porque a requisição nem chegava a existir).
//
// Uso:
//   pm2 start ecosystem.config.js   (sobe os dois processos)
//   pm2 status                      (ver se estão de pé)
//   pm2 logs                        (ver log dos dois juntos)
//   pm2 save                        (grava o estado atual pra restaurar depois)
//
// O domínio do ngrok abaixo é o domínio fixo reservado da conta (não muda
// entre reinícios) — trocar aqui só se um novo domínio for reservado.
module.exports = {
  apps: [
    {
      name: 'papelaria-bot',
      script: 'src/index.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: 'ngrok-tunnel',
      script: 'ngrok',
      args: ['http', '--url=sensitive-walmart-residence.ngrok-free.dev', '3005'],
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
