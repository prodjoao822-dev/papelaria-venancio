// Painel de pedidos do Operador — só leitura (v1, decisão do escopo desta
// sessão): sem criar pedido, sem mudar status, sem atribuir responsável pelo
// celular. Estrutura geral (header, skeleton, realtime, estados vazio/erro)
// espelha PainelScreen.js (Separador), trocando `separacaoSeparadorService`
// por `pedidosOperadorService` e a tabela `pedidos` no canal Realtime.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { CaixaIcon, AlertaIcon, RecarregarIcon } from '../../components/icons';
import { pedidosOperadorService } from '../../services/pedidosOperador.service';
import { operadorSupabase } from '../../supabase/operadorClient';
import { LABEL_STATUS_PEDIDO } from '../../utils/statusPedido';

function formatValor(valor) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CONFIG_STATUS = {
  NOVO_PEDIDO: { fundo: colors.primaryLight, texto: colors.primary },
  EM_SEPARACAO: { fundo: colors.andamentoFundo, texto: colors.andamento },
  SEPARADO: { fundo: colors.sucessoFundoForte, texto: colors.sucesso },
  PRONTO_RETIRADA: { fundo: colors.sucessoFundoForte, texto: colors.sucesso },
  SAIU_ENTREGA: { fundo: colors.andamentoFundo, texto: colors.andamento },
  FINALIZADO: { fundo: colors.divisor, texto: colors.textoSecundario },
  CANCELADO: { fundo: colors.erroFundo, texto: colors.erro },
};

function StatusPill({ status }) {
  const config = CONFIG_STATUS[status] ?? { fundo: colors.divisor, texto: colors.textoSecundario };
  return (
    <View style={[styles.pill, { backgroundColor: config.fundo }]}>
      <Text style={[styles.pillText, { color: config.texto }]}>{LABEL_STATUS_PEDIDO[status] ?? status}</Text>
    </View>
  );
}

const PedidoCard = React.memo(function PedidoCard({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item.id)} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitulo} numberOfLines={1}>
          {item.protocolo} · {item.clientes?.nome ?? '—'}
        </Text>
        <Text style={styles.cardValor}>{formatValor(item.valor_total)}</Text>
      </View>
      <StatusPill status={item.status} />
    </TouchableOpacity>
  );
});

function ListaVazia() {
  return (
    <View style={styles.estadoContainer}>
      <View style={styles.estadoIconeCirculo}>
        <CaixaIcon size={28} color={colors.primary} />
      </View>
      <Text style={styles.estadoTitulo}>Nenhum pedido encontrado</Text>
    </View>
  );
}

function ListaErro({ onTentarNovamente }) {
  return (
    <View style={styles.estadoContainer}>
      <View style={[styles.estadoIconeCirculo, { backgroundColor: colors.erroFundo }]}>
        <AlertaIcon size={28} color={colors.erro} />
      </View>
      <Text style={styles.estadoTitulo}>Não foi possível carregar</Text>
      <Text style={styles.estadoSubtitulo}>Verifique sua conexão com a internet e tente novamente.</Text>
      <TouchableOpacity style={styles.tentarNovamenteBtn} onPress={onTentarNovamente}>
        <RecarregarIcon size={15} color={colors.primary} />
        <Text style={styles.tentarNovamenteText}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function PainelPedidosScreen({ navigation }) {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const dados = await pedidosOperadorService.listar();
      setPedidos(dados);
    } catch (err) {
      setErro(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    if (!operadorSupabase) return undefined;

    // Status visível sem refresh manual (mesmo espírito de RF-05, aplicado
    // aqui à lista de pedidos do Operador).
    const canal = operadorSupabase
      .channel('painel-pedidos-operador')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, carregar)
      .subscribe();

    return () => { operadorSupabase.removeChannel(canal); };
  }, [carregar]);

  const abrirDetalhe = useCallback((id) => {
    navigation.navigate('DetalhePedido', { pedidoId: id });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Pedidos</Text>
      </View>

      <View style={styles.content}>
        {carregando ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : erro ? (
          <ListaErro onTentarNovamente={carregar} />
        ) : (
          <FlatList
            data={pedidos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PedidoCard item={item} onPress={abrirDetalhe} />}
            contentContainerStyle={{ paddingBottom: 20 }}
            ListEmptyComponent={<ListaVazia />}
          />
        )}
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
    paddingHorizontal: spacing.xl,
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitulo: { fontSize: 22, fontWeight: '800', color: colors.texto },
  content: { flex: 1, padding: spacing.xl, paddingTop: 16 },

  card: {
    backgroundColor: colors.superficie,
    borderWidth: 1,
    borderColor: colors.borda,
    borderRadius: radius.lg,
    padding: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 8, gap: 8,
  },
  cardTitulo: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.texto },
  cardValor: { fontSize: 13.5, fontWeight: '700', color: colors.textoSecundario },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  pillText: { fontSize: 11, fontWeight: '700' },

  estadoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 40 },
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
});
