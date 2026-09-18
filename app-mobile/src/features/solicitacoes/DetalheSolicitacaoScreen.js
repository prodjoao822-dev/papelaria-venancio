import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, SafeAreaView, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { SetaVoltarIcon, ChatIcon, CheckIcon, RaioIcon, AlertaIcon, RecarregarIcon } from '../../components/icons';
import { separacaoSeparadorService } from '../../services/separacaoSeparador.service';
import { separadorSupabase } from '../../supabase/separadorClient';
import { traduzErroRpc } from '../../utils/traduzErroRpc';

// Mesmo estado de erro com retry já usado nas telas de lista (ver
// PainelScreen.js) — TRB-2026-0021: aqui a tela é de detalhe, então some a
// tela toda em vez de substituir só o conteúdo de uma FlatList.
function TelaErro({ onTentarNovamente }) {
  return (
    <View style={styles.estadoContainer}>
      <View style={[styles.estadoIconeCirculo, { backgroundColor: colors.erroFundo }]}>
        <AlertaIcon size={28} color={colors.erro} />
      </View>
      <Text style={styles.estadoTitulo}>Não foi possível carregar</Text>
      <Text style={styles.estadoSubtitulo}>
        Verifique sua conexão com a internet e tente novamente.
      </Text>
      <TouchableOpacity style={styles.tentarNovamenteBtn} onPress={onTentarNovamente}>
        <RecarregarIcon size={15} color={colors.primary} />
        <Text style={styles.tentarNovamenteText}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DetalheSolicitacaoScreen({ route, navigation }) {
  const { solicitacaoId } = route.params;
  const [solicitacao, setSolicitacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [concluindo, setConcluindo] = useState(false);

  // Modal "Faltou/substituído" (Fase 2) — item alvo fica em estado local
  // porque a modal é compartilhada por qualquer linha da lista, não uma
  // por item. `null` = modal fechada.
  const [itemModalAberto, setItemModalAberto] = useState(null);
  const [textoObservacao, setTextoObservacao] = useState('');
  const [enviandoObservacao, setEnviandoObservacao] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const s = await separacaoSeparadorService.buscarPorId(solicitacaoId);
      setSolicitacao(s);
    } catch (err) {
      // Bug de UX corrigido (TRB-2026-0021): antes esse erro era engolido
      // pelo try/finally e a tela caía silenciosamente em "não encontrado"
      // (return null abaixo), sem aviso nem retry — mesmo bug já corrigido
      // nas telas de lista (ver PainelScreen.js).
      setErro(err);
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
  if (erro) {
    return (
      <SafeAreaView style={styles.container}>
        <TelaErro onTentarNovamente={carregar} />
      </SafeAreaView>
    );
  }
  if (!solicitacao) return null;

  const isPendente = solicitacao.status === 'pendente';
  const isImediata = solicitacao.prioridade === 'imediata';
  const itens = solicitacao.itens ?? [];
  const totalItens = itens.length;
  // "Prontos" conta os dois estados finais (separado + faltou_substituido)
  // — a barra de progresso enche até 100% independente de como cada item
  // foi resolvido; o badge de "faltou" à parte é o que sinaliza que nem
  // tudo saiu perfeito, sem precisar de uma segunda barra.
  const separadosCount = itens.filter(i => i.status_item === 'separado').length;
  const faltouCount = itens.filter(i => i.status_item === 'faltou_substituido').length;
  const prontosCount = separadosCount + faltouCount;
  const todosFinalizados = totalItens > 0 && itens.every(i => i.status_item !== 'pendente');
  const percentual = totalItens > 0 ? Math.round((prontosCount / totalItens) * 100) : 0;
  const delegante = solicitacao.operador_delegante?.nome;
  const nomeSeparador = solicitacao.separador?.nome;

  const pedido = solicitacao.pedidos;
  const pago = pedido?.status_pagamento === 'pago';
  const ehRetirada = pedido?.forma_entrega === 'retirada';
  const observacoesPedido = (pedido?.observacoes ?? '').trim();

  const assumir = async () => {
    try {
      await separacaoSeparadorService.assumir(solicitacaoId);
    } catch (err) {
      Alert.alert('Erro ao assumir', traduzErroRpc(err));
    }
  };

  // Toque na linha: gesto rápido do caminho comum (90% dos itens só são
  // encontrados e marcados). `pendente` -> `separado` direto; tocar de novo
  // num item já finalizado (separado OU faltou_substituido) desfaz para
  // `pendente` — corrige um toque errado sem exigir passar pela modal.
  const toggleItem = async (item) => {
    if (solicitacao.status !== 'em_andamento') return;
    const novoStatus = item.status_item === 'pendente' ? 'separado' : 'pendente';
    try {
      await separacaoSeparadorService.marcarItem(item.id, novoStatus);
    } catch (err) {
      Alert.alert('Erro ao marcar item', traduzErroRpc(err));
    }
  };

  const abrirModalFaltou = (item) => {
    if (solicitacao.status !== 'em_andamento') return;
    setItemModalAberto(item);
    setTextoObservacao(item.itens_pedido?.observacao ?? '');
  };

  const fecharModalFaltou = () => {
    setItemModalAberto(null);
    setTextoObservacao('');
  };

  const confirmarFaltouSubstituido = async () => {
    if (!itemModalAberto) return;
    setEnviandoObservacao(true);
    try {
      await separacaoSeparadorService.marcarItem(itemModalAberto.id, 'faltou_substituido', textoObservacao.trim());
      fecharModalFaltou();
    } catch (err) {
      Alert.alert('Erro ao marcar item', traduzErroRpc(err));
    } finally {
      setEnviandoObservacao(false);
    }
  };

  // Ícone secundário do item já em `faltou_substituido`: uma forma extra
  // (além do toque na linha) de voltar pra `pendente` sem passar pela
  // modal de novo, já que reabrir a modal só pra "desfazer" seria fricção
  // desnecessária.
  const limparFaltouSubstituido = async (item) => {
    try {
      await separacaoSeparadorService.marcarItem(item.id, 'pendente');
    } catch (err) {
      Alert.alert('Erro ao marcar item', traduzErroRpc(err));
    }
  };

  // concluir_separacao aceita desde a Fase 2 qualquer combinação de
  // 'separado'/'faltou_substituido' — só bloqueia com item 'pendente'
  // (ver `todosFinalizados`, único gate deste botão). A decisão D1 (tela
  // 10 do bundle de design, "conclusão parcial com item pendente") segue
  // fora de escopo: esta tela nunca chama a RPC com item pendente.
  const concluir = async () => {
    setConcluindo(true);
    try {
      await separacaoSeparadorService.concluir(solicitacaoId);
      navigation.replace('ConfirmacaoEnvio', {
        protocolo: solicitacao.pedidos?.protocolo,
        cliente: solicitacao.pedidos?.clientes?.nome,
        totalItens,
        separadosCount: prontosCount,
      });
    } catch (err) {
      Alert.alert('Erro ao concluir', traduzErroRpc(err));
    } finally {
      setConcluindo(false);
    }
  };

  const renderItem = ({ item }) => {
    const status = item.status_item ?? (item.separado ? 'separado' : 'pendente');
    const separado = status === 'separado';
    const faltou = status === 'faltou_substituido';
    const podeInteragir = solicitacao.status === 'em_andamento';

    return (
      <View style={[styles.itemCard, separado && styles.itemCardMarcado, faltou && styles.itemCardFaltou]}>
        <TouchableOpacity
          style={styles.itemToqueArea}
          onPress={() => toggleItem(item)}
          disabled={!podeInteragir}
          activeOpacity={0.75}
          testID={`item-linha-${item.id}`}
        >
          <View style={[
            styles.itemCheckbox,
            separado && styles.itemCheckboxMarcado,
            faltou && styles.itemCheckboxFaltou,
          ]}>
            {separado && <CheckIcon size={16} color="#fff" />}
            {faltou && <AlertaIcon size={14} color="#fff" />}
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemNome}>{item.itens_pedido?.nome_item}</Text>
            <Text style={styles.itemQuantidade}>Qtd: {item.itens_pedido?.quantidade}</Text>
            {faltou && !!item.itens_pedido?.observacao && (
              <Text style={styles.itemObservacaoFaltou}>{item.itens_pedido.observacao}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Controle secundário — deliberadamente menor/menos proeminente
            que o toque na linha, que cobre o caminho comum. */}
        <TouchableOpacity
          style={styles.itemAcaoFaltou}
          hitSlop={10}
          disabled={!podeInteragir}
          onPress={() => (faltou ? limparFaltouSubstituido(item) : abrirModalFaltou(item))}
          testID={`item-acao-faltou-${item.id}`}
        >
          <AlertaIcon size={18} color={faltou ? colors.andamento : colors.textoTerciario} />
        </TouchableOpacity>
      </View>
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
              <Text style={[styles.progressoLabel, { color: todosFinalizados ? colors.sucesso : colors.textoSecundario }]}>
                {prontosCount} de {totalItens} prontos
              </Text>
              <Text style={[styles.progressoLabel, { color: todosFinalizados ? colors.sucesso : colors.textoSecundario }]}>
                {percentual}%
              </Text>
            </View>
            <View style={styles.progressoBarraFundo}>
              <View
                style={[
                  styles.progressoBarraPreenchida,
                  { width: `${percentual}%`, backgroundColor: todosFinalizados ? colors.sucesso : colors.andamento },
                ]}
              />
            </View>
            {/* Badge à parte (não uma segunda barra) pra sinalizar, num
                relance, que nem tudo saiu perfeito — só aparece quando
                existe pelo menos 1 item faltou/substituído. */}
            {faltouCount > 0 && (
              <View style={styles.badgeFaltouContainer}>
                <AlertaIcon size={12} color={colors.andamento} />
                <Text style={styles.badgeFaltouText}>
                  {faltouCount} {faltouCount === 1 ? 'item' : 'itens'} faltou/substituído
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Painel somente-leitura (Fase 2) — pagamento, entrega, horário,
          observações do cliente e separador responsável. Nada aqui é
          editável nesta tela: pagamento/entrega/horário/observações são
          decisão tomada no fechamento do pedido (Agente de Vendas/loja),
          não no galpão de separação. */}
      <View style={styles.infoPainel}>
        <View style={styles.infoPainelLinha}>
          <Text style={styles.infoPainelItem}>
            {pago ? '🟢 Pago' : '🟡 Aguardando pagamento'}
          </Text>
          <Text style={styles.infoPainelItem}>
            {ehRetirada ? '🏬 Retirada' : '🚚 Entrega'}
          </Text>
        </View>
        <Text style={styles.infoPainelLabel}>
          Horário: <Text style={styles.infoPainelValor}>{pedido?.horario_retirada_desejado || 'não informado'}</Text>
        </Text>
        {!!observacoesPedido && (
          <Text style={styles.infoPainelLabel}>
            Observações do cliente: <Text style={styles.infoPainelValor}>{observacoesPedido}</Text>
          </Text>
        )}
        <Text style={styles.infoPainelLabel}>
          Separador responsável: <Text style={styles.infoPainelValor}>{nomeSeparador || 'não informado'}</Text>
        </Text>
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
            style={[styles.concluirButton, (!todosFinalizados || concluindo) && styles.concluirButtonDisabled]}
            disabled={!todosFinalizados || concluindo}
            onPress={concluir}
          >
            {concluindo ? (
              <ActivityIndicator color={todosFinalizados ? '#fff' : colors.textoDesabilitado} />
            ) : (
              <Text style={[styles.concluirButtonText, !todosFinalizados && styles.concluirButtonTextDisabled]}>
                {faltouCount > 0 ? 'Finalizar com pendências' : 'Separação Pronta'}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Modal "Faltou/substituído" — mesmo padrão visual/estrutural do
          modal de insucesso em DetalheEntregaScreen.js (overlay + card +
          TextInput multiline + par cancelar/confirmar), reaproveitado aqui
          por consistência entre telas do app. Observação é opcional (pode
          confirmar em branco se o separador não quiser detalhar). */}
      <Modal
        visible={!!itemModalAberto}
        transparent
        animationType="fade"
        onRequestClose={fecharModalFaltou}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Faltou ou foi substituído</Text>
            <Text style={styles.modalSubtitulo}>
              {itemModalAberto?.itens_pedido?.nome_item}
              {'\n'}Conte o que aconteceu (opcional).
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: sem estoque, substituído por outra marca..."
              placeholderTextColor={colors.textoTerciario}
              value={textoObservacao}
              onChangeText={setTextoObservacao}
              multiline
              editable={!enviandoObservacao}
              testID="modal-faltou-input"
            />
            <View style={styles.modalAcoes}>
              <TouchableOpacity
                style={styles.modalBotaoCancelar}
                onPress={fecharModalFaltou}
                disabled={enviandoObservacao}
              >
                <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBotaoConfirmar}
                onPress={confirmarFaltouSubstituido}
                disabled={enviandoObservacao}
                testID="modal-faltou-confirmar"
              >
                {enviandoObservacao ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.modalBotaoConfirmarTexto}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  badgeFaltouContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 8, alignSelf: 'flex-start',
  },
  badgeFaltouText: { fontSize: 11.5, fontWeight: '700', color: colors.andamento },

  // Painel somente-leitura de dados do pedido (Fase 2) — texto simples,
  // sem nenhum controle editável (regra não-negociável do plano).
  infoPainel: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    backgroundColor: colors.fundo, borderWidth: 1, borderColor: colors.borda,
    borderRadius: radius.lg, padding: 14, gap: 6,
  },
  infoPainelLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  infoPainelItem: { fontSize: 13.5, fontWeight: '700', color: colors.texto },
  infoPainelLabel: { fontSize: 12.5, color: colors.textoSecundario },
  infoPainelValor: { fontWeight: '700', color: colors.texto },

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
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.superficie,
    borderWidth: 1.5, borderColor: colors.borda,
    borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: 10,
  },
  itemCardMarcado: {
    backgroundColor: colors.sucessoFundo,
    borderColor: colors.sucesso,
  },
  // Variante "faltou/substituído" — reaproveita o laranja de `andamento`
  // (já usado como estado "em progresso"/atenção no restante do app) em
  // vez de criar um token de cor novo, e também em vez do vermelho de
  // `erro` (reservado para falha de verdade, não é o caso aqui).
  itemCardFaltou: {
    backgroundColor: colors.andamentoFundo,
    borderColor: colors.andamento,
  },
  itemToqueArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
  itemCheckbox: {
    width: 28, height: 28, borderRadius: 8,
    borderWidth: 2, borderColor: colors.bordaCheckbox,
    justifyContent: 'center', alignItems: 'center',
  },
  itemCheckboxMarcado: {
    backgroundColor: colors.sucesso,
    borderColor: colors.sucesso,
  },
  itemCheckboxFaltou: {
    backgroundColor: colors.andamento,
    borderColor: colors.andamento,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemNome: { fontSize: 15, fontWeight: '700', color: colors.texto },
  itemQuantidade: { fontSize: 12.5, color: colors.textoSecundario, marginTop: 3 },
  itemObservacaoFaltou: { fontSize: 12, color: colors.andamento, marginTop: 4, fontStyle: 'italic' },
  itemAcaoFaltou: { padding: 6, marginLeft: 4 },

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

  estadoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  estadoIconeCirculo: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  estadoTitulo: { fontSize: 16, fontWeight: '800', color: colors.texto, marginBottom: 6, textAlign: 'center' },
  estadoSubtitulo: { fontSize: 13, color: colors.textoTerciario, lineHeight: 19, textAlign: 'center' },
  tentarNovamenteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.primary,
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12,
    marginTop: 20,
  },
  tentarNovamenteText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Modal "Faltou/substituído" — mesmo padrão visual de
  // DetalheEntregaScreen.js (modal de Insucesso/Ocorrência), reaproveitado
  // aqui por consistência entre telas do app.
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(28, 32, 51, 0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.xl,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: colors.superficie, borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalTitulo: { fontSize: 17, fontWeight: '800', color: colors.texto, marginBottom: 4 },
  modalSubtitulo: { fontSize: 13, color: colors.textoSecundario, marginBottom: 16, lineHeight: 18 },
  modalInput: {
    minHeight: 90, maxHeight: 160,
    borderWidth: 1.5, borderColor: colors.borda, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.texto,
    backgroundColor: colors.fundoInput,
    textAlignVertical: 'top',
  },
  modalAcoes: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBotaoCancelar: {
    flex: 1, height: 48, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.borda,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBotaoCancelarTexto: { fontSize: 14, fontWeight: '700', color: colors.textoSecundario },
  modalBotaoConfirmar: {
    flex: 1, height: 48, borderRadius: radius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  modalBotaoConfirmarTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
