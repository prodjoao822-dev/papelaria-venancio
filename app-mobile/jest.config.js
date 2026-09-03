// Upgrade Expo SDK 54->57 (03/09): precisa existir como arquivo separado (e
// não como `"jest": {...}` dentro de package.json) porque o mutation de
// `process.env` abaixo TEM que rodar antes do Jest resolver o preset
// `jest-expo` — e um `setupFiles` do projeto não serve pra isso: pela forma
// como o Jest concatena arrays de preset + projeto, o setup do `jest-expo`
// (que já dispara o crash) roda ANTES de qualquer `setupFiles` nosso, nunca
// depois. Um `jest.config.js` já executa como JS puro no processo principal
// do Jest, antes de resolver/registrar o preset, então a env var chega a
// tempo (o pool de workers do Jest é criado por `fork()` depois disso e
// herda o `process.env` do processo principal).
//
// Ver comentário em `.env` para o porquê da env var em si
// (EXPO_PUBLIC_USE_RN_FETCH): desde a SDK 56 o `expo/fetch` é o
// `globalThis.fetch` padrão, e o mock nativo dele não resolve dentro do
// Jest, quebrando as 13 suítes com "TypeError: The 'path' argument must be
// of type string. Received null" já na configuração do preset `jest-expo`.
if (!process.env.EXPO_PUBLIC_USE_RN_FETCH) {
  process.env.EXPO_PUBLIC_USE_RN_FETCH = '1';
}

module.exports = {
  preset: 'jest-expo',
};
