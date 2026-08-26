import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { RelogioIcon, CaminhaoIcon, LocalizacaoIcon, AlertaIcon, RecarregarIcon } from '../../components/icons';
import { entregaEntregadorService } from '../../services/entregaEntregador.service';
import { separadorSupabase } from '../../supabase/separadorClient';

// Espelha PainelScreen.js (Separador) — mesma estrutura (skeleton/erro/vazio,
// realtime refetch completo, ordenação client-side), vocabulário próprio de
// entrega. Sem conceito de "prioridade imediata" aqui (não existe esse campo
// em solicitacoes_entrega) — a ordenação relevante é por horario_previsto.
const STATUS_ABERTOS = ['pendente', 'em_rota'];

function formatHorario(isoString) {
  if (!isoString) return '';
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

// React.memo — mesma justificativa/achado de PainelScreen.js (SolicitacaoCard).
const EntregaCard = React.memo(function EntregaCard({ item, onPress }) {
  const endereco = item.endereco_entrega || item.pedidos?.endereco_entrega;
  const delegante = item.delegado_por?.nome;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item.id)} activeOpacity={0.75}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitulo} numberOfLines={1}>
          {item.pedidos?.protocolo} · {item.pedidos?.clientes?.nome}
        </Text>
        {item.horario_previsto && (
          <View style={styles.badgeHorario}>
            <RelogioIcon size={11} color={colors.primary} />
            <Text style={styles.badgeHorarioText}>{formatHorario(item.horario_previsto)}</Text>
          </View>
        )}
      </View>
      {endereco ? (
        <View style={styles.enderecoRow}>
          <LocalizacaoIcon size={13} color={colors.textoSecundario} />
          <Text style={styles.cardSubtitulo} numberOfLines={1}>{endereco}</Text>
        </View>
      ) : (
        <Text style={styles.cardSubtitulo}>Endereço não informado</Text>
      )}
      {delegante && <Text style={styles.cardDelegante}>Delegado por {delegante}</Text>}
      <StatusPill status={item.status} />
    </TouchableOpacity>
  );
});

function SkeletonBlock({ style }) {
  const opacidade = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidade, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacidade, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacidade]);

  return <Animated.View style={[style, { opacity: opacidade }]} />;
}

function ListaCarregandoSkeleton() {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <SkeletonBlock style={[styles.skeletonBloco, { width: '60%', height: 14, marginBottom: 10 }]} />
          <SkeletonBlock style={[styles.skeletonBloco, { width: '40%', height: 11, marginBottom: 12 }]} />
          <SkeletonBlock style={[styles.skeletonBloco, { width: '30%', height: 20, borderRadius: 999 }]} />
        </View>
      ))}
    </View>
  );
}

function ListaVazia() {
  return (
    <View style={styles.estadoContainer}>
      <View style={styles.estadoIconeCirculo}>
        <CaminhaoIcon size={28} color={colors.primary} />
      </View>
      <Text style={styles.estadoTitulo}>Nenhuma entrega pendente</Text>
      <Text style={styles.estadoSubtitulo}>
        Novas entregas aparecem aqui assim que forem delegadas a você.
      </Text>
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

export default function PainelEntregasScreen({ navigation }) {
  // Sem filtro de status na query: uma única leitura serve a lista aberta
  // (pendente/em_rota) — RLS já restringe ao próprio entregador.
  const [todasEntregas, setTodasEntregas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const dados = await entregaEntregadorService.listarMinhas();
      setTodasEntregas(dados);
    } catch (err) {
      setErro(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    if (!separadorSupabase) return undefined;

    // Status visível sem refresh manual (RF-05): refaz a query inteira em
    // qualquer mudança relevante.
    const canal = separadorSupabase
      .channel('painel-entregas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_entrega' }, carregar)
      .subscribe();

    return () => { separadorSupabase.removeChannel(canal); };
  }, [carregar]);

  // useCallback estável — mesma justificativa de PainelScreen.js/abrirDetalhe.
  const abrirDetalhe = useCallback((id) => {
    navigation.navigate('DetalheEntrega', { solicitacaoId: id });
  }, [navigation]);

  const entregas = todasEntregas
    .filter(e => STATUS_ABERTOS.includes(e.status))
    .sort((a, b) => {
      if (!a.horario_previsto) return 1;
      if (!b.horario_previsto) return -1;
      return new Date(a.horario_previsto) - new Date(b.horario_previsto);
    });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Entregas</Text>
      </View>

      <View style={styles.content}>
        {carregando ? (
          <ListaCarregandoSkeleton />
        ) : erro ? (
          <ListaErro onTentarNovamente={carregar} />
        ) : (
          <FlatList
            data={entregas}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <EntregaCard item={item} onPress={abrirDetalhe} />
            )}
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
  enderecoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  cardSubtitulo: { flex: 1, fontSize: 12.5, color: colors.textoSecundario },
  cardDelegante: { fontSize: 11.5, color: colors.textoTerciario, marginBottom: 10 },
  badgeHorario: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  badgeHorarioText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  pill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  pillText: { fontSize: 11, fontWeight: '700' },

  skeletonCard: {
    backgroundColor: colors.superficie,
    borderWidth: 1, borderColor: colors.borda,
    borderRadius: radius.lg, padding: 16, marginBottom: 12,
  },
  skeletonBloco: { borderRadius: 6, backgroundColor: colors.divisor },

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
