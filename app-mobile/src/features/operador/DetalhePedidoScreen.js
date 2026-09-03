// Detalhe de um pedido para o Operador — só leitura (v1, decisão do escopo
// desta sessão): itens, cliente e histórico de status, sem nenhuma ação de
// escrita (mudar status, atribuir responsável, editar pagamento continuam
// exclusivos do dashboard web). Estrutura geral espelha
// DetalheEntregaScreen.js (header com voltar, ScrollView de cards, Realtime).
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { SetaVoltarIcon } from '../../components/icons';
import { pedidosOperadorService } from '../../services/pedidosOperador.service';
import { operadorSupabase } from '../../supabase/operadorClient';
import { LABEL_STATUS_PEDIDO } from '../../utils/statusPedido';

function formatValor(valor) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDataHora(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const data = date.toLocaleDateString('pt-BR');
  const hora = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  return `${data} ${hora}`;
}

export default function DetalhePedidoScreen({ route, navigation }) {
  const { pedidoId } = route.params;
  const [pedido, setPedido] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const p = await pedidosOperadorService.buscarPorId(pedidoId);
      setPedido(p);
    } finally {
      setCarregando(false);
    }
  }, [pedidoId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!operadorSupabase) return undefined;

    const canal = operadorSupabase
      .channel(`detalhe-pedido-operador-${pedidoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_status_historico', filter: `pedido_id=eq.${pedidoId}` }, carregar)
      .subscribe();
    return () => { operadorSupabase.removeChannel(canal); };
  }, [pedidoId, carregar]);

  if (carregando) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!pedido) return null;

  const itens = pedido.itens_pedido ?? [];
  const historico = pedido.pedidos_status_historico ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopo}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <SetaVoltarIcon size={20} color={colors.texto} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitulo} numberOfLines={1}>
              {pedido.protocolo} · {pedido.clientes?.nome ?? '—'}
            </Text>
            <Text style={styles.headerSubtitulo}>{LABEL_STATUS_PEDIDO[pedido.status] ?? pedido.status}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Cliente</Text>
          <Text style={styles.infoValor}>{pedido.clientes?.nome ?? '—'}</Text>
          {pedido.clientes?.telefone && <Text style={styles.infoValorSecundario}>{pedido.clientes.telefone}</Text>}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Valor total</Text>
          <Text style={styles.infoValor}>{formatValor(pedido.valor_total)}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Itens ({itens.length})</Text>
          {itens.length === 0 ? (
            <Text style={styles.itemVazioTexto}>Nenhum item neste pedido.</Text>
          ) : (
            itens.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>{item.nome_item}</Text>
                  {item.observacao && <Text style={styles.itemObs}>{item.observacao}</Text>}
                </View>
                <Text style={styles.itemQtd}>Qtd: {item.quantidade}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Histórico de status ({historico.length})</Text>
          {historico.length === 0 ? (
            <Text style={styles.itemVazioTexto}>Sem histórico registrado.</Text>
          ) : (
            historico.map((h) => (
              <View key={h.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome}>
                    {h.status_anterior ?? '—'} → {h.status_novo}
                  </Text>
                  {h.observacao && <Text style={styles.itemObs}>{h.observacao}</Text>}
                  {h.operadores?.nome && <Text style={styles.itemObs}>por {h.operadores.nome}</Text>}
                </View>
                <Text style={styles.itemQtd}>{formatDataHora(h.criado_em)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
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
    paddingHorizontal: spacing.xl,
  },
  headerInfo: { flex: 1 },
  headerTitulo: { fontSize: 16, fontWeight: '800', color: colors.texto },
  headerSubtitulo: { fontSize: 12, color: colors.textoTerciario, marginTop: 2 },

  content: { flex: 1, padding: spacing.xl },
  infoCard: {
    backgroundColor: colors.fundo,
    borderWidth: 1, borderColor: colors.borda,
    borderRadius: radius.lg, padding: 14,
    marginBottom: 12,
  },
  infoLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textoTerciario, textTransform: 'uppercase' },
  infoValor: { fontSize: 15, fontWeight: '700', color: colors.texto, marginTop: 4 },
  infoValorSecundario: { fontSize: 13, color: colors.textoSecundario, marginTop: 2 },

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
});
