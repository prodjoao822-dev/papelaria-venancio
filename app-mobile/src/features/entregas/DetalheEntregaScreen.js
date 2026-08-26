import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, SafeAreaView, Modal, KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import {
  SetaVoltarIcon, LocalizacaoIcon, RelogioIcon, CheckIcon, XCirculoIcon, AlertaIcon,
  TelefoneIcon, NavegacaoIcon,
} from '../../components/icons';
import { entregaEntregadorService } from '../../services/entregaEntregador.service';
import { separadorSupabase } from '../../supabase/separadorClient';

// tipo_observacao de itens_pedido — só mostra rótulo quando é algo que muda
// o jeito de manusear/entregar o item ('padrao' e null não geram badge).
const LABEL_TIPO_OBSERVACAO = {
  fragil: 'Frágil',
  presente_menina: 'Presente (menina)',
  presente_menino: 'Presente (menino)',
  a_granel: 'A granel',
};

// Deep links de campo (vistoria 19/08, tarefa 3 do briefing): "abrir no
// mapa" e "ligar pro cliente" não são frescura, evitam o entregador ter que
// sair do app, copiar o endereço/telefone e colar em outro app manualmente.
// `Linking.openURL` sem `canOpenURL` antes: no Android 11+ a query de
// `canOpenURL` para esquemas geo:/tel: costuma retornar false por causa do
// package visibility (mesmo com o app instalado), então checar antes gera
// falso-negativo — preferível deixar o SO resolver e só avisar em caso de
// erro real (nenhum app capaz de abrir o link).
function abrirMapa(endereco) {
  if (!endereco) return;
  const query = encodeURIComponent(endereco);
  const url = Platform.select({
    ios: `maps:0,0?q=${query}`,
    android: `geo:0,0?q=${query}`,
    default: `https://www.google.com/maps/search/?api=1&query=${query}`,
  });
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {
      Alert.alert('Não foi possível abrir o mapa', 'Nenhum aplicativo de mapas encontrado neste dispositivo.');
    });
  });
}

function ligarCliente(telefone) {
  if (!telefone) return;
  const numero = telefone.replace(/[^0-9+]/g, '');
  Linking.openURL(`tel:${numero}`).catch(() => {
    Alert.alert('Não foi possível ligar', 'Nenhum aplicativo de telefone disponível neste dispositivo.');
  });
}

// Espelha DetalheSolicitacaoScreen.js (Separador) na estrutura geral
// (header + realtime + ações condicionadas ao status), vocabulário e fluxo
// próprios de entrega: pendente (sem assumida_em) -> Aceitar -> pendente
// (com assumida_em) -> Iniciar Rota -> em_rota -> Marcar Entregue OU
// Registrar Insucesso. Não existe chat para solicitacoes_entrega (decisão
// consciente da Fase A/addendum — não há tabela de mensagens); "Registrar
// Ocorrência" é o canal equivalente pra sinalizar problema.
const TIPOS_OCORRENCIA_ENTREGADOR = [
  { value: 'item_faltante', label: 'Item faltante' },
  { value: 'endereco_nao_encontrado', label: 'Endereço não encontrado' },
  { value: 'cliente_ausente', label: 'Cliente ausente' },
  { value: 'produto_avariado', label: 'Produto avariado' },
];

function formatHorario(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function StatusPill({ status }) {
  const config = {
    pendente: { fundo: colors.divisor, texto: colors.textoSecundario, label: 'Pendente' },
    em_rota: { fundo: colors.andamentoFundo, texto: colors.andamento, label: 'Em rota' },
    entregue: { fundo: colors.sucessoFundoForte, texto: colors.sucesso, label: 'Entregue' },
    insucesso: { fundo: colors.erroFundo, texto: colors.erro, label: 'Insucesso' },
    cancelada: { fundo: colors.divisor, texto: colors.textoTerciario, label: 'Cancelada' },
  }[status] ?? { fundo: colors.divisor, texto: colors.textoSecundario, label: status };

  return (
    <View style={[styles.pill, { backgroundColor: config.fundo }]}>
      <Text style={[styles.pillText, { color: config.texto }]}>{config.label}</Text>
    </View>
  );
}

export default function DetalheEntregaScreen({ route, navigation }) {
  const { solicitacaoId } = route.params;
  const [solicitacao, setSolicitacao] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);

  const [modalInsucesso, setModalInsucesso] = useState(false);
  const [motivoInsucesso, setMotivoInsucesso] = useState('');

  const [modalOcorrencia, setModalOcorrencia] = useState(false);
  const [tipoOcorrencia, setTipoOcorrencia] = useState(null);
  const [descricaoOcorrencia, setDescricaoOcorrencia] = useState('');
  const [enviandoOcorrencia, setEnviandoOcorrencia] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const s = await entregaEntregadorService.buscarPorId(solicitacaoId);
      setSolicitacao(s);
    } finally {
      setCarregando(false);
    }
  }, [solicitacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!separadorSupabase) return undefined;

    // Status visível sem refresh manual (RF-05) — refaz a query inteira em
    // qualquer mudança relevante nesta solicitação.
    const canal = separadorSupabase
      .channel(`detalhe-entrega-${solicitacaoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_entrega', filter: `id=eq.${solicitacaoId}` }, carregar)
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

  const endereco = solicitacao.endereco_entrega || solicitacao.pedidos?.endereco_entrega;
  const delegante = solicitacao.delegado_por?.nome;
  const horarioPrevisto = formatHorario(solicitacao.horario_previsto);
  const telefoneCliente = solicitacao.pedidos?.clientes?.telefone;
  // pedidos NÃO tem coluna de observação geral (confirmado no schema real —
  // só itens_pedido.observacao/tipo_observacao existe, por item). Mostrar
  // aqui é o mais perto que dá de "observações do pedido" pro entregador em
  // campo, incluindo itens frágeis que merecem manuseio diferente.
  const itensPedido = solicitacao.pedidos?.itens_pedido ?? [];

  const podeAceitar = solicitacao.status === 'pendente' && !solicitacao.assumida_em;
  const podeIniciarRota = solicitacao.status === 'pendente' && !!solicitacao.assumida_em;
  const emRota = solicitacao.status === 'em_rota';
  const finalizada = ['entregue', 'insucesso', 'cancelada'].includes(solicitacao.status);

  const aceitar = async () => {
    setProcessando(true);
    try {
      await entregaEntregadorService.assumir(solicitacaoId);
    } catch (err) {
      Alert.alert('Erro ao aceitar', err.message);
    } finally {
      setProcessando(false);
    }
  };

  const iniciarRota = async () => {
    setProcessando(true);
    try {
      await entregaEntregadorService.iniciarRota(solicitacaoId);
    } catch (err) {
      Alert.alert('Erro ao iniciar rota', err.message);
    } finally {
      setProcessando(false);
    }
  };

  const marcarEntregue = async () => {
    setProcessando(true);
    try {
      await entregaEntregadorService.concluir(solicitacaoId);
    } catch (err) {
      Alert.alert('Erro ao concluir', err.message);
    } finally {
      setProcessando(false);
    }
  };

  const confirmarInsucesso = async () => {
    const motivo = motivoInsucesso.trim();
    if (!motivo) return;
    setProcessando(true);
    try {
      await entregaEntregadorService.registrarInsucesso(solicitacaoId, motivo);
      setModalInsucesso(false);
      setMotivoInsucesso('');
    } catch (err) {
      Alert.alert('Erro ao registrar insucesso', err.message);
    } finally {
      setProcessando(false);
    }
  };

  const enviarOcorrencia = async () => {
    const descricao = descricaoOcorrencia.trim();
    if (!tipoOcorrencia || !descricao) return;
    setEnviandoOcorrencia(true);
    try {
      await entregaEntregadorService.abrirOcorrencia({
        pedidoId: solicitacao.pedido_id,
        tipo: tipoOcorrencia,
        descricao,
        solicitacaoEntregaId: solicitacaoId,
      });
      setModalOcorrencia(false);
      setTipoOcorrencia(null);
      setDescricaoOcorrencia('');
      Alert.alert('Ocorrência registrada', 'A loja foi avisada.');
    } catch (err) {
      Alert.alert('Erro ao registrar ocorrência', err.message);
    } finally {
      setEnviandoOcorrencia(false);
    }
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
              {delegante ? `Delegado por ${delegante}` : 'Entrega delegada'}
            </Text>
          </View>
        </View>
        <View style={styles.headerBadges}>
          <StatusPill status={solicitacao.status} />
          {horarioPrevisto && (
            <View style={styles.badgeHorario}>
              <RelogioIcon size={11} color={colors.primary} />
              <Text style={styles.badgeHorarioText}>Previsto {horarioPrevisto}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.infoCard}>
          <View style={styles.infoCardComAcao}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Cliente</Text>
              <Text style={styles.infoValor}>{solicitacao.pedidos?.clientes?.nome ?? '—'}</Text>
              {telefoneCliente && <Text style={styles.infoValorSecundario}>{telefoneCliente}</Text>}
            </View>
            {telefoneCliente && (
              <TouchableOpacity style={styles.acaoRapida} onPress={() => ligarCliente(telefoneCliente)} hitSlop={8}>
                <TelefoneIcon size={15} color={colors.primary} />
                <Text style={styles.acaoRapidaTexto}>Ligar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoCardComAcao}>
            <View style={{ flex: 1 }}>
              <View style={styles.infoLabelRow}>
                <LocalizacaoIcon size={14} color={colors.textoSecundario} />
                <Text style={styles.infoLabel}>Endereço de entrega</Text>
              </View>
              <Text style={styles.infoValor}>{endereco || 'Não informado'}</Text>
            </View>
            {endereco && (
              <TouchableOpacity style={styles.acaoRapida} onPress={() => abrirMapa(endereco)} hitSlop={8}>
                <NavegacaoIcon size={15} color={colors.primary} />
                <Text style={styles.acaoRapidaTexto}>Mapa</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Itens do pedido (bug corrigido, vistoria 19/08): o entregador
            antes não tinha como saber o que estava levando — o SELECT do
            service nunca buscava itens_pedido. tipo_observacao vira um
            aviso visual (ex: "Frágil") quando relevante pro manuseio. */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Itens do pedido ({itensPedido.length})</Text>
          {itensPedido.length === 0 ? (
            <Text style={styles.itemVazioTexto}>Itens não disponíveis no momento.</Text>
          ) : (
            itensPedido.map((item) => {
              const badge = LABEL_TIPO_OBSERVACAO[item.tipo_observacao];
              return (
                <View key={item.id} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNome}>{item.nome_item}</Text>
                    {item.observacao && <Text style={styles.itemObs}>{item.observacao}</Text>}
                  </View>
                  <Text style={styles.itemQtd}>Qtd: {item.quantidade}</Text>
                  {badge && (
                    <View style={styles.itemBadge}>
                      <Text style={styles.itemBadgeTexto}>{badge}</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {solicitacao.motivo_insucesso && (
          <View style={[styles.infoCard, styles.infoCardAlerta]}>
            <Text style={styles.infoLabelAlerta}>Motivo do insucesso</Text>
            <Text style={styles.infoValor}>{solicitacao.motivo_insucesso}</Text>
          </View>
        )}
        {solicitacao.motivo_cancelamento && (
          <View style={[styles.infoCard, styles.infoCardAlerta]}>
            <Text style={styles.infoLabelAlerta}>Motivo do cancelamento</Text>
            <Text style={styles.infoValor}>{solicitacao.motivo_cancelamento}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.ocorrenciaLink}
          onPress={() => setModalOcorrencia(true)}
        >
          <AlertaIcon size={16} color={colors.erro} />
          <Text style={styles.ocorrenciaLinkText}>Registrar ocorrência</Text>
        </TouchableOpacity>
      </ScrollView>

      {!finalizada && (
        <View style={styles.footer}>
          {podeAceitar && (
            <TouchableOpacity style={styles.botaoPrimario} onPress={aceitar} disabled={processando}>
              {processando ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.botaoPrimarioTexto}>Aceitar Entrega</Text>
              )}
            </TouchableOpacity>
          )}

          {podeIniciarRota && (
            <TouchableOpacity style={styles.botaoPrimario} onPress={iniciarRota} disabled={processando}>
              {processando ? <ActivityIndicator color="#fff" /> : (
                <Text style={styles.botaoPrimarioTexto}>Iniciar Rota</Text>
              )}
            </TouchableOpacity>
          )}

          {emRota && (
            <View style={styles.footerLinhaDupla}>
              <TouchableOpacity
                style={[styles.botaoPrimario, styles.botaoMetade]}
                onPress={marcarEntregue}
                disabled={processando}
              >
                {processando ? <ActivityIndicator color="#fff" /> : (
                  <View style={styles.botaoComIcone}>
                    <CheckIcon size={16} color="#fff" />
                    <Text style={styles.botaoPrimarioTexto}>Entregue</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.botaoSecundario, styles.botaoMetade]}
                onPress={() => setModalInsucesso(true)}
                disabled={processando}
              >
                <View style={styles.botaoComIcone}>
                  <XCirculoIcon size={16} color={colors.erro} />
                  <Text style={styles.botaoSecundarioTexto}>Insucesso</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Modal: Registrar Insucesso — motivo obrigatório (RPC exige texto). */}
      <Modal visible={modalInsucesso} transparent animationType="fade" onRequestClose={() => setModalInsucesso(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Registrar insucesso</Text>
            <Text style={styles.modalSubtitulo}>Descreva o motivo pelo qual a entrega não foi concluída.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: cliente não atendeu, endereço fechado..."
              placeholderTextColor={colors.textoTerciario}
              value={motivoInsucesso}
              onChangeText={setMotivoInsucesso}
              multiline
              editable={!processando}
            />
            <View style={styles.modalAcoes}>
              <TouchableOpacity
                style={styles.modalBotaoCancelar}
                onPress={() => { setModalInsucesso(false); setMotivoInsucesso(''); }}
                disabled={processando}
              >
                <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBotaoConfirmar, !motivoInsucesso.trim() && styles.modalBotaoDesabilitado]}
                onPress={confirmarInsucesso}
                disabled={!motivoInsucesso.trim() || processando}
              >
                {processando ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.modalBotaoConfirmarTexto}>Confirmar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Registrar Ocorrência — tipo + descrição, sempre acessível
          (não depende do status da entrega, ex: reportar problema após
          já ter marcado como entregue). */}
      <Modal visible={modalOcorrencia} transparent animationType="fade" onRequestClose={() => setModalOcorrencia(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>Registrar ocorrência</Text>
            <Text style={styles.modalSubtitulo}>A loja será avisada para acompanhar o caso.</Text>

            <View style={styles.chipsContainer}>
              {TIPOS_OCORRENCIA_ENTREGADOR.map((tipo) => (
                <TouchableOpacity
                  key={tipo.value}
                  style={[styles.chip, tipoOcorrencia === tipo.value && styles.chipSelecionado]}
                  onPress={() => setTipoOcorrencia(tipo.value)}
                >
                  <Text style={[styles.chipTexto, tipoOcorrencia === tipo.value && styles.chipTextoSelecionado]}>
                    {tipo.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.modalInput}
              placeholder="Descreva o que aconteceu..."
              placeholderTextColor={colors.textoTerciario}
              value={descricaoOcorrencia}
              onChangeText={setDescricaoOcorrencia}
              multiline
              editable={!enviandoOcorrencia}
            />
            <View style={styles.modalAcoes}>
              <TouchableOpacity
                style={styles.modalBotaoCancelar}
                onPress={() => { setModalOcorrencia(false); setTipoOcorrencia(null); setDescricaoOcorrencia(''); }}
                disabled={enviandoOcorrencia}
              >
                <Text style={styles.modalBotaoCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBotaoConfirmar,
                  (!tipoOcorrencia || !descricaoOcorrencia.trim()) && styles.modalBotaoDesabilitado,
                ]}
                onPress={enviarOcorrencia}
                disabled={!tipoOcorrencia || !descricaoOcorrencia.trim() || enviandoOcorrencia}
              >
                {enviandoOcorrencia ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={styles.modalBotaoConfirmarTexto}>Enviar</Text>
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
  headerBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.xl },
  badgeHorario: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  badgeHorarioText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },

  content: { flex: 1, padding: spacing.xl },
  infoCard: {
    backgroundColor: colors.fundo,
    borderWidth: 1, borderColor: colors.borda,
    borderRadius: radius.lg, padding: 14,
    marginBottom: 12,
  },
  infoCardAlerta: { backgroundColor: colors.erroFundo, borderColor: colors.erroBorda },
  infoCardComAcao: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  infoLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textoTerciario, textTransform: 'uppercase' },
  infoLabelAlerta: { fontSize: 11.5, fontWeight: '700', color: colors.erroTexto, textTransform: 'uppercase', marginBottom: 4 },
  infoValor: { fontSize: 15, fontWeight: '700', color: colors.texto, marginTop: 4 },
  infoValorSecundario: { fontSize: 13, color: colors.textoSecundario, marginTop: 2 },
  acaoRapida: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
  },
  acaoRapidaTexto: { fontSize: 12.5, fontWeight: '700', color: colors.primary },

  itemVazioTexto: { fontSize: 13, color: colors.textoTerciario, marginTop: 6 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1, borderColor: colors.divisor,
    marginTop: 8,
  },
  itemNome: { fontSize: 13.5, fontWeight: '700', color: colors.texto },
  itemObs: { fontSize: 12, color: colors.textoSecundario, marginTop: 2 },
  itemQtd: { fontSize: 12.5, color: colors.textoSecundario, fontWeight: '600' },
  itemBadge: {
    backgroundColor: colors.urgenteFundo, borderWidth: 1, borderColor: colors.urgente,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  itemBadgeTexto: { fontSize: 10.5, fontWeight: '800', color: colors.urgenteTexto },

  ocorrenciaLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 10, paddingHorizontal: 4,
  },
  ocorrenciaLinkText: { fontSize: 14, fontWeight: '700', color: colors.erro },

  footer: {
    padding: spacing.xl, paddingTop: 14,
    borderTopWidth: 1, borderColor: colors.borda,
  },
  footerLinhaDupla: { flexDirection: 'row', gap: 12 },
  botaoMetade: { flex: 1 },
  botaoComIcone: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  botaoPrimario: {
    backgroundColor: colors.primary, height: 56,
    borderRadius: radius.md, justifyContent: 'center', alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  botaoPrimarioTexto: { color: '#fff', fontSize: 16, fontWeight: '700' },
  botaoSecundario: {
    backgroundColor: colors.erroFundo,
    borderWidth: 1.5, borderColor: colors.erroBorda,
    height: 56, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  botaoSecundarioTexto: { color: colors.erroTexto, fontSize: 16, fontWeight: '700' },

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
  modalBotaoDesabilitado: { backgroundColor: colors.botaoDesabilitadoFundo },
  modalBotaoConfirmarTexto: { fontSize: 14, fontWeight: '700', color: '#fff' },

  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1.5, borderColor: colors.borda, backgroundColor: colors.fundoInput,
  },
  chipSelecionado: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipTexto: { fontSize: 12.5, fontWeight: '700', color: colors.textoSecundario },
  chipTextoSelecionado: { color: colors.primary },
});
