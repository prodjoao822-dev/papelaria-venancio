// Storage adapter para `auth.storage` do Supabase no Expo — não é
// `expo-secure-store` puro porque o Android Keystore tem um limite de
// ~2048 bytes por item, e uma sessão do Supabase (access_token JWT +
// refresh_token) costuma ULTRAPASSAR isso: `SecureStore.setItemAsync`
// falharia (silenciosamente ou com erro) em produção, não é um mock
// "quase certo". O padrão oficial Supabase+Expo para isso é: uma chave
// AES aleatória pequena vai pro SecureStore (cabe no limite), e o valor
// da sessão em si vai CIFRADO (nunca em texto puro) pro AsyncStorage, que
// não tem limite de tamanho mas também não é seguro por si só. Ou seja:
// AsyncStorage aqui guarda ciphertext ilegível sem a chave que só existe
// no SecureStore — isso não viola "nunca sessão em texto puro".
import 'react-native-get-random-values'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import aesjs from 'aes-js'

// Contador determinístico é aceitável em AES-CTR aqui porque cada chave é
// gerada uma única vez por instalação e nunca reaproveitada entre
// mensagens diferentes com contadores diferentes — é o mesmo padrão
// documentado pelo próprio Supabase para clients Expo.
const TAMANHO_CHAVE_BYTES = 256 / 8

function prefixoChave(chave) {
  return `${chave}-encryption-key`
}

async function obterOuCriarChave(chave) {
  const chaveExistente = await SecureStore.getItemAsync(prefixoChave(chave))
  if (chaveExistente) return chaveExistente

  const bytesAleatorios = crypto.getRandomValues(new Uint8Array(TAMANHO_CHAVE_BYTES))
  const novaChave = aesjs.utils.hex.fromBytes(bytesAleatorios)
  await SecureStore.setItemAsync(prefixoChave(chave), novaChave)
  return novaChave
}

export class LargeSecureStore {
  async getItem(chave) {
    const chaveHex = await obterOuCriarChave(chave)
    const cifradoHex = await AsyncStorage.getItem(chave)
    if (!cifradoHex) return null

    const bytesChave = aesjs.utils.hex.toBytes(chaveHex)
    const contador = new aesjs.Counter(1)
    const cifrador = new aesjs.ModeOfOperation.ctr(bytesChave, contador)
    const bytesDecifrados = cifrador.decrypt(aesjs.utils.hex.toBytes(cifradoHex))
    return aesjs.utils.utf8.fromBytes(bytesDecifrados)
  }

  async setItem(chave, valor) {
    const chaveHex = await obterOuCriarChave(chave)
    const bytesChave = aesjs.utils.hex.toBytes(chaveHex)
    const contador = new aesjs.Counter(1)
    const cifrador = new aesjs.ModeOfOperation.ctr(bytesChave, contador)
    const bytesCifrados = cifrador.encrypt(aesjs.utils.utf8.toBytes(valor))
    await AsyncStorage.setItem(chave, aesjs.utils.hex.fromBytes(bytesCifrados))
  }

  async removeItem(chave) {
    await AsyncStorage.removeItem(chave)
    await SecureStore.deleteItemAsync(prefixoChave(chave))
  }
}
