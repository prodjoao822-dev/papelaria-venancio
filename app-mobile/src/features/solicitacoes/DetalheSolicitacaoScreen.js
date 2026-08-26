import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { SetaVoltarIcon, ChatIcon, CheckIcon, RaioIcon } from '../../components/icons';
import { separacaoSeparadorService } from '../../services/separacaoSeparador.service';
import { separadorSupabase } from '../../supabase/separadorClient';
import { traduzErroRpc } from '../../utils/traduzErroRpc';

export default function DetalheSolicitacaoScreen({ route, navigation }) {
  const { solicitacaoId } = route.params;
  const [solicitacao, setSolicitacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [concluindo, setConcluindo] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const s = await separacaoSeparadorService.buscarPorId(solicitacaoId);
      setSolicitacao(s);
    } finally {
      setCarregando(false);
    }
  }, [solicitacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!separadorSupabase) return undefined;

    // Status visível sem refresh manual (RF-05) — refaz a query inteira em
    // qualquer mudança relevante. Mensagens não fazem mais parte desta tela
    // (viraram ChatSolicitacaoScreen), então não assina mais essa tabela aqui.
    const canal = separadorSupabase
      .channel(`detalhe-solicitacao-${solicitacaoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao', filter: `id=eq.${solicitacaoId}` }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao_itens', filter: `solicitacao_id=eq.${solicitacaoId}` }, carregar)
      .subscribe();
    return () => { separadorSupabase.removeChannel(canal); };
  }, [solicitacaoId, carregar]);

  if (carregando) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!solicitacao) return null;

  const isPendente = solicitacao.status === 'pendente';
  const isImediata = solicitacao.prioridade === 'imediata';
  const itens = solicitacao.itens ?? [];
  const totalItens = itens.length;
  const separadosCount = itens.filter(i => i.separado).length;
  const todosSeparados = totalItens > 0 && separadosCount === totalItens;
  const percentual = totalItens > 0 ? Math.round((separadosCount / totalItens) * 100) : 0;
  const delegante = solicitacao.operador_delegante?.nome;

  const assumir = async () => {
    try {
      await separacaoSeparadorService.assumir(solicitacaoId);
    } catch (err) {
      Alert.alert('Erro ao assumir', traduzErroRpc(err));
    }
  };

  const toggleItem = async (item) => {
    if (solicitacao.status !== 'em_andamento') return;
    try {
      await separacaoSeparadorService.marcarItem(item.id, !item.separado);
    } catch (err) {
      Alert.alert('Erro ao marcar item', traduzErroRpc(err));
    }
  };

  // concluir_separacao já existe e funciona em produção para o caminho
  // normal (todo item marcado — é a única forma deste botão habilitar, ver
  // `todosSeparados`). O que fica pendente de decisão do dono (D1, tela 10
  // do bundle de design) é só a CONCLUSÃO PARCIAL — chamar essa mesma RPC
  // com item faltando, que ela hoje rejeita de propósito. Como esta tela
  // nunca chama a RPC com item pendente, não há conflito com essa decisão
  // em aberto, e nenhum link "concluir parcial" é oferecido.
  const concluir = async () => {
    setConcluindo(true);
    try {
      await separacaoSeparadorService.concluir(solicitacaoId);
      navigation.replace('ConfirmacaoEnvio', {
        protocolo: solicitacao.pedidos?.protocolo,
        cliente: solicitacao.pedidos?.clientes?.nome,
        totalItens,
        separadosCount: totalItens,
      });
    } catch (err) {
      Alert.alert('Erro ao concluir', traduzErroRpc(err));
    } finally {
      setConcluindo(false);
    }
  };

  const renderItem = ({ item }) => {
    const marcado = item.separado;
    return (
      <TouchableOpacity
        style={[styles.itemCard, marcado && styles.itemCardMarcado]}
        onPress={() => toggleItem(item)}
        disabled={solicitacao.status !== 'em_andamento'}
        activeOpacity={0.75}
      >
        <View style={[styles.itemCheckbox, marcado && styles.itemCheckboxMarcado]}>
          {marcado && <CheckIcon size={16} color="#fff" />}
        </View>
        <View style={styles.itemInfo}>
          <Text style={styles.itemNome}>{item.itens_pedido?.nome_item}</Text>
          <Text style={styles.itemQuantidade}>Qtd: {item.itens_pedido?.quantidade}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopo}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <SetaVoltarIcon size={20} color={colors.texto} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitulo} numberOfLines={1}>
              {solicitacao.pedidos?.protocolo} · {solicitacao.pedidos?.clientes?.nome}
            </Text>
            <Text style={styles.headerSubtitulo}>
              {totalItens} {totalItens === 1 ? 'item' : 'itens'}{delegante ? ` · delegado por ${delegante}` : ''}
            </Text>
          </View>
          {isImediata && (
            <View style={styles.badgeUrgente}>
              <RaioIcon size={10} color={colors.texto} />
              <Text style={styles.badgeUrgenteText}>URGENTE</Text>
            </View>
          )}
          {!isPendente && (
            <TouchableOpacity
              style={styles.chatButton}
              hitSlop={10}
              onPress={() => navigation.navigate('ChatSolicitacao', { solicitacaoId })}
            >
              <ChatIcon size={22} color={colors.textoSecundario} />
            </TouchableOpacity>
          )}
        </View>

        {!isPendente && (
          <View style={styles.progressoContainer}>
            <View style={styles.progressoLabelRow}>
              <Text style={[styles.progressoLabel, { color: todosSeparados ? colors.sucesso : colors.textoSecundario }]}>
                {separadosCount} de {totalItens} separados
              </Text>
              <Text style={[styles.progressoLabel, { color: todosSeparados ? colors.sucesso : colors.textoSecundario }]}>
                {percentual}%
              </Text>
            </View>
            <View style={styles.progressoBarraFundo}>
              <View
                style={[
                  styles.progressoBarraPreenchida,
                  { width: `${percentual}%`, backgroundColor: todosSeparados ? colors.sucesso : colors.andamento },
                ]}
              />
            </View>
          </View>
        )}
      </View>

      {/* Bug corrigido (vistoria 19/08): a lista de itens antes só renderizava
          com `!isPendente` — o separador assumia a solicitação às cegas, sem
          saber o que ia separar. Agora a FlatList é sempre exibida; o que
          muda por status é só a ação do footer (Assumir vs Concluir) e a
          interatividade dos itens (toggleItem/renderItem já bloqueiam toque
          fora de `em_andamento`, então isso continua seguro aqui). */}
      {isPendente && (
        <Text style={styles.pendenteBanner}>
          Confira os itens abaixo antes de assumir esta solicitação.
        </Text>
      )}

      <FlatList
        data={itens}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.listaContent}
      />

      <View style={styles.footer}>
        {isPendente ? (
          <TouchableOpacity style={styles.assumirButton} onPress={assumir}>
            <Text style={styles.assumirButtonText}>Assumir Solicitação</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.concluirButton, (!todosSeparados || concluindo) && styles.concluirButtonDisabled]}
            disabled={!todosSeparados || concluindo}
            onPress={concluir}
          >
            {concluindo ? (
              <ActivityIndicator color={todosSeparados ? '#fff' : colors.textoDesabilitado} />
            ) : (
              <Text style={[styles.concluirButtonText, !todosSeparados && styles.concluirButtonTextDisabled]}>
                Separação Pronta
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.superficie },
  header: {
    borderBottomWidth: 1, borderColor: colors.borda,
    paddingTop: 8, paddingBottom: 16,
  },
  headerTopo: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: spacing.xl, paddingBottom: 12,
  },
  headerInfo: { flex: 1 },
  headerTitulo: { fontSize: 16, fontWeight: '800', color: colors.texto },
  headerSubtitulo: { fontSize: 12, color: colors.textoTerciario, marginTop: 2 },
  badgeUrgente: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.urgente,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999,
  },
  badgeUrgenteText: { fontSize: 10.5, fontWeight: '800', color: colors.texto },
  chatButton: { padding: 2 },
  progressoContainer: { paddingHorizontal: spacing.xl },
  progressoLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressoLabel: { fontSize: 12.5, fontWeight: '700' },
  progressoBarraFundo: { height: 8, borderRadius: 4, backgroundColor: colors.divisor, overflow: 'hidden' },
  progressoBarraPreenchida: { height: '100%', borderRadius: 4 },

  pendenteBanner: {
    fontSize: 13, color: colors.textoSecundario, textAlign: 'center',
    paddingHorizontal: spacing.xl, paddingTop: 14,
  },
  assumirButton: {
    backgroundColor: colors.primary, height: 56,
    borderRadius: radius.md, justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  assumirButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  listaContent: { padding: spacing.xl, paddingBottom: 8 },
  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.superficie,
    borderWidth: 1.5, borderColor: colors.borda,
    borderRadius: radius.lg, padding: 14, paddingHorizontal: 16,
    marginBottom: 10,
  },
  itemCardMarcado: {
    backgroundColor: colors.sucessoFundo,
    borderColor: colors.sucesso,
  },
  itemCheckbox: {
    width: 28, height: 28, borderRadius: 8,
    borderWidth: 2, borderColor: colors.bordaCheckbox,
    justifyContent: 'center', alignItems: 'center',
  },
  itemCheckboxMarcado: {
    backgroundColor: colors.sucesso,
    borderColor: colors.sucesso,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemNome: { fontSize: 15, fontWeight: '700', color: colors.texto },
  itemQuantidade: { fontSize: 12.5, color: colors.textoSecundario, marginTop: 3 },

  footer: {
    padding: spacing.xl, paddingTop: 14,
    borderTopWidth: 1, borderColor: colors.borda,
  },
  concluirButton: {
    backgroundColor: colors.primary, height: 56,
    borderRadius: radius.md, justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  concluirButtonDisabled: {
    backgroundColor: colors.botaoDesabilitadoFundo,
    shadowOpacity: 0,
    elevation: 0,
  },
  concluirButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  concluirButtonTextDisabled: { color: colors.textoDesabilitado },
});
