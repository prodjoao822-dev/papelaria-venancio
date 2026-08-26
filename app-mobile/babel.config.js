// Exigido pelo jest-expo para transformar JSX/ESM nos testes (procura este
// arquivo via resolveBabelConfig) — também é o preset padrão recomendado
// para apps Expo em geral, então serve tanto ao Metro (app real) quanto ao
// Jest (testes), sem duplicar configuração.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
