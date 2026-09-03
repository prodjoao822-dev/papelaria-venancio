import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Pressable,
} from 'react-native';
import { useSeparadorAuth } from '../../contexts/SeparadorAuthContext';
import { useOperadorAuth } from '../../contexts/OperadorAuthContext';
import { colors } from '../../theme/colors';
import { LivroIcon, AlertaIcon } from '../../components/icons';

const PIN_LENGTH = 6;

// Mensagem final única, nunca a mensagem crua de nenhuma das duas
// tentativas: mostrar "esse código não existe" vs "esse PIN está errado"
// (ou qual dos dois backends respondeu) permitiria descobrir por tentativa e
// erro se um código pertence a um funcionário ou a um operador. Decisão do
// dono (ver briefing desta tarefa): um único formulário código+PIN, sem tela
// de escolha de papel.
const MENSAGEM_ERRO_GENERICA = 'Código ou PIN inválido. Verifique e tente novamente.';

export default function LoginScreen() {
  const { login: loginFuncionario } = useSeparadorAuth();
  const { login: loginOperador } = useOperadorAuth();
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState(null);
  const pinInputRef = useRef(null);

  const podeEntrar = codigo.length > 0 && pin.length === PIN_LENGTH;

  const handleLogin = async () => {
    if (!podeEntrar) return;
    setErro(null);
    setEntrando(true);
    try {
      // Só aplica a sessão no client Supabase certo — não navega
      // manualmente: o AppNavigator reage à mudança de `session` de cada
      // contexto e troca de tela sozinho (ver AppNavigator.js). Tenta
      // primeiro como funcionário (Separador/Entregador — fluxo mais comum
      // hoje) e só depois como operador; a primeira tentativa bem-sucedida
      // encerra o fluxo sem chamar a segunda.
      try {
        await loginFuncionario(codigo, pin);
      } catch {
        await loginOperador(codigo, pin);
      }
    } catch {
      setErro(MENSAGEM_ERRO_GENERICA);
    } finally {
      setEntrando(false);
    }
  };

  const onChangeCodigo = (valor) => {
    if (erro) setErro(null);
    setCodigo(valor.replace(/[^0-9]/g, ''));
  };

  const onChangePin = (valor) => {
    if (erro) setErro(null);
    setPin(valor.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <LivroIcon size={34} color={colors.urgente} />
        </View>
        <Text style={styles.title}>Papelaria Venâncio</Text>
        <Text style={styles.subtitle}>Acesso da equipe</Text>

        {erro && (
          <View style={styles.errorBanner}>
            <AlertaIcon size={18} color={colors.erro} />
            <Text style={styles.errorText}>{erro}</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>CÓDIGO</Text>
          <TextInput
            testID="login-input-codigo"
            style={[styles.input, erro && styles.inputErro]}
            value={codigo}
            onChangeText={onChangeCodigo}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="Ex: 0231"
            placeholderTextColor={colors.textoTerciario}
            editable={!entrando}
            returnKeyType="next"
            onSubmitEditing={() => pinInputRef.current?.focus()}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PIN (6 DÍGITOS)</Text>
          <Pressable onPress={() => pinInputRef.current?.focus()} style={styles.pinWrapper}>
            <View style={styles.pinBoxRow}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const preenchido = i < pin.length;
                const atual = i === pin.length;
                return (
                  <View
                    key={i}
                    style={[
                      styles.pinBox,
                      (atual || preenchido) && !erro && styles.pinBoxAtivo,
                      erro && styles.pinBoxErro,
                    ]}
                  >
                    {preenchido && <View style={styles.pinDot} />}
                  </View>
                );
              })}
            </View>
            {/* Input real é invisível: captura o teclado numérico e alimenta
                o estado `pin`; as 6 caixas acima só refletem `pin.length`.
                Mais robusto em Android/iOS do que 6 TextInputs com foco
                encadeado. */}
            <TextInput
              testID="login-input-pin"
              ref={pinInputRef}
              style={styles.pinInputOculto}
              value={pin}
              onChangeText={onChangePin}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              secureTextEntry
              editable={!entrando}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
          </Pressable>
        </View>

        <TouchableOpacity
          testID="login-botao-entrar"
          style={[styles.button, !podeEntrar && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={!podeEntrar || entrando}
        >
          {entrando ? (
            <ActivityIndicator color={podeEntrar ? '#fff' : colors.textoDesabilitado} />
          ) : (
            <Text style={[styles.buttonText, !podeEntrar && styles.buttonTextDisabled]}>Entrar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.fundo,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  logoContainer: {
    width: 72,
    height: 72,
    backgroundColor: colors.primary,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.texto,
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textoTerciario,
    textAlign: 'center',
    marginBottom: 28,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.erroFundo,
    borderWidth: 1,
    borderColor: colors.erroBorda,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.erroTexto,
    fontWeight: '600',
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textoSecundario,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    height: 52,
    backgroundColor: colors.fundoInput,
    borderWidth: 1.5,
    borderColor: colors.borda,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '700',
    color: colors.texto,
  },
  inputErro: {
    borderColor: colors.erro,
  },
  pinWrapper: {
    position: 'relative',
  },
  pinBoxRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pinBox: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.borda,
    borderRadius: 12,
    backgroundColor: colors.fundoInput,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinBoxAtivo: {
    borderColor: colors.primary,
  },
  pinBoxErro: {
    borderColor: colors.erro,
  },
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.texto,
  },
  pinInputOculto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  button: {
    height: 56,
    backgroundColor: colors.primary,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: colors.botaoDesabilitadoFundo,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonTextDisabled: {
    color: colors.textoDesabilitado,
  },
});
