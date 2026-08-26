import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { RelogioGrandeIcon } from '../../components/icons';

// Tela 11 do bundle de design — resumo é só o que a tela anterior já tinha
// em mãos no momento do sucesso (não rebusca a solicitação do zero).
export default function ConfirmacaoEnvioScreen({ route, navigation }) {
  const { protocolo, cliente, totalItens, separadosCount } = route.params ?? {};

  const voltarParaSolicitacoes = () => {
    // popToTop (não goBack): não queremos que o Separador volte pro
    // checklist que ele acabou de concluir — a pilha some até o Painel.
    navigation.popToTop();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconeCirculo}>
          <RelogioGrandeIcon size={34} color={colors.primary} />
        </View>
        <Text style={styles.titulo}>Separação enviada!</Text>
        <Text style={styles.subtitulo}>
          Aguardando confirmação do operador responsável.
        </Text>

        <View style={styles.resumoCard}>
          <Text style={styles.resumoTitulo} numberOfLines={1}>
            {protocolo}{cliente ? ` · ${cliente}` : ''}
          </Text>
          <Text style={styles.resumoSubtitulo}>
            {separadosCount ?? totalItens} de {totalItens} itens separados
          </Text>
        </View>

        <TouchableOpacity style={styles.botaoVoltar} onPress={voltarParaSolicitacoes}>
          <Text style={styles.botaoVoltarText}>Voltar para solicitações</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fundo },
  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 36,
  },
  iconeCirculo: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  titulo: { fontSize: 19, fontWeight: '800', color: colors.texto, marginBottom: 6, textAlign: 'center' },
  subtitulo: { fontSize: 13.5, color: colors.textoTerciario, lineHeight: 19, textAlign: 'center', marginBottom: 24 },
  resumoCard: {
    width: '100%',
    backgroundColor: colors.superficie,
    borderWidth: 1, borderColor: colors.borda,
    borderRadius: radius.lg, padding: 16,
    marginBottom: spacing.xxl,
  },
  resumoTitulo: { fontSize: 14, fontWeight: '800', color: colors.texto, marginBottom: 4 },
  resumoSubtitulo: { fontSize: 12.5, color: colors.textoSecundario },
  botaoVoltar: {
    width: '100%', height: 52,
    borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  botaoVoltarText: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
