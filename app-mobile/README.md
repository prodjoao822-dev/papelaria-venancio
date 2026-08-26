# app-mobile — Venâncio Equipe

App interno (React Native + Expo SDK 54) usado pelas equipes de Separação e
Entrega da Papelaria Venâncio. Não é um app de cliente e não está publicado
em loja nenhuma.

## Identidade de build (T3.2 — 26/08/2026)

- `android.package` / `ios.bundleIdentifier`: **`com.papelariavenancio.equipe`**
- Este identificador é **PROVISÓRIO**. O dono do produto ainda não confirmou
  explicitamente esse valor — foi escolhido como sugestão razoável para
  destravar a configuração de build (T3.2 / problema P19 da auditoria de
  25/08/2026).
- É seguro usar agora porque configurar `app.json`/`eas.json` no repositório
  é 100% reversível (é apenas arquivo de config, não uma submissão). O
  identificador só se torna **irreversível de fato** no momento da primeira
  submissão real à Play Store/App Store — o que está fora do escopo desta
  tarefa e não aconteceu aqui.
- **Antes de rodar `eas build` de verdade ou submeter à loja pela primeira
  vez, confirme com o dono se `com.papelariavenancio.equipe` é definitivo.**
  Até lá, pode ser trocado livremente em `app.json` (`android.package` e
  `ios.bundleIdentifier`).
- A mesma nota está espelhada em `app.json` → `expo.extra.buildIdentity`.

## Pendências que só o dono pode resolver

1. **Confirmar o identificador de pacote** (`com.papelariavenancio.equipe`)
   antes da primeira submissão real a uma loja.
2. **`eas init`**: o `projectId` do EAS não foi gerado — depende de
   `eas login` com a conta Expo do dono. Sem isso, `eas build` real não
   funciona (comandos como `eas config`/`eas build` falham com "EAS project
   not configured", que é o esperado e não indica erro de configuração).
3. Nenhuma credencial (Apple Developer, Google Play Console, conta Expo) foi
   criada ou usada por este agente.

## `eas.json` — decisões tomadas

- Dois perfis: `development` (build de dev client, `distribution: internal`)
  e `production` (build de distribuição interna via APK/IPA ad-hoc,
  `distribution: internal`).
- `production` foi configurado como **distribuição interna**, não como
  "store" (loja pública), porque não havia nenhuma decisão registrada no
  repositório indicando publicação em loja pública — o app é de uso interno
  das equipes de Separação/Entrega. Se isso mudar (ex.: decisão de publicar
  na Play Store), revisar `eas.json` (`build.production.distribution` e
  `submit.production`).
- `cli.version` fixado com um piso (`>= 12.0.0`) compatível com a versão de
  `eas-cli` disponível no ambiente (v20–22.x na data desta tarefa).

## Ícone e splash

Gerados a partir do logo oficial (`venancio-ai-ops/public/logo-mascote.png`)
via `app-mobile/scripts/gen-icons.py` (script pontual, pode ser reexecutado
se o logo for atualizado; requer Python + Pillow). Assets ficam em
`app-mobile/assets/`:

- `icon.png` — ícone principal (iOS/fallback), fundo branco.
- `android-icon-foreground.png` / `android-icon-background.png` /
  `android-icon-monochrome.png` — ícone adaptativo Android.
- `favicon.png` — versão web.
- `splash-icon.png` — usado pelo plugin `expo-splash-screen`
  (fundo transparente; a cor de fundo da splash é definida em
  `app.json` → `plugins` → `expo-splash-screen` → `backgroundColor`).

## Scripts

```bash
npm start       # expo start
npm run android # expo start --android
npm run ios     # expo start --ios
npm test        # jest (baseline: 32 testes passando)
```
