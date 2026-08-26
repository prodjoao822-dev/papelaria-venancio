// Sem mockup no bundle de design para o Separador (tela 28 é do app do
// Operador, fora de escopo) — mantida simples e consistente com a paleta.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSeparadorAuth } from '../../contexts/SeparadorAuthContext';
import { colors } from '../../theme/colors';
import { PerfilIcon } from '../../components/icons';

export default function PerfilScreen() {
  const { funcionario, logout } = useSeparadorAuth();

  const confirmarSaida = () => {
    // Hoje não existe outro jeito de deslogar no app — a navegação inteira
    // reage à sessão do contexto (ver AppNavigator.js). Um toque acidental
    // aqui não deveria encerrar o turno de trabalho sem confirmação.
    Alert.alert(
      'Sair da conta',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => logout() },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.avatar}>
          <PerfilIcon size={30} color={colors.primary} />
        </View>
        <Text style={styles.nome}>{funcionario?.nome ?? '—'}</Text>
        {funcionario?.codigo_funcionario != null && (
          <Text style={styles.codigo}>Código {funcionario.codigo_funcionario}</Text>
        )}

        <TouchableOpacity style={styles.botaoSair} onPress={confirmarSaida}>
          <Text style={styles.botaoSairTexto}>Sair</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fundo },
  header: {
    backgroundColor: colors.superficie,
    borderBottomWidth: 1,
    borderColor: colors.borda,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.texto },
  content: { flex: 1, alignItems: 'center', padding: 24, paddingTop: 40 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  nome: { fontSize: 18, fontWeight: '800', color: colors.texto },
  codigo: { fontSize: 13, color: colors.textoSecundario, marginTop: 4, fontWeight: '600' },
  botaoSair: {
    marginTop: 32,
    width: '100%',
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.erroBorda,
    backgroundColor: colors.erroFundo,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botaoSairTexto: { fontSize: 15, fontWeight: '700', color: colors.erroTexto },
});
