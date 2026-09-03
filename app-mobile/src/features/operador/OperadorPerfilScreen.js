// Perfil do Operador — mesmo padrão de features/perfil/PerfilScreen.js
// (Separador), trocando a fonte de identidade para useOperadorAuth. Única
// ação aqui é sair da conta (logout), com confirmação antes de encerrar a
// sessão (mesmo motivo do PerfilScreen.js: navegação inteira reage à sessão
// do contexto, um toque acidental não deveria deslogar sem confirmar).
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useOperadorAuth } from '../../contexts/OperadorAuthContext';
import { colors } from '../../theme/colors';
import { PerfilIcon } from '../../components/icons';

export default function OperadorPerfilScreen() {
  const { operador, logout } = useOperadorAuth();

  const confirmarSaida = () => {
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
        <Text style={styles.nome}>{operador?.nome ?? '—'}</Text>
        {operador?.codigo != null && <Text style={styles.codigo}>Código {operador.codigo}</Text>}

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
