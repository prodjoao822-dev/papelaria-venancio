// Lista de espera do Operador — só leitura (v1, decisão do escopo desta
// sessão): mostra produtos com clientes esperando reposição. Registrar
// interesse e marcar cliente como notificado continuam exclusivos do
// dashboard web (dependem de contato manual por fora do sistema). Estrutura
// geral espelha PainelScreen.js.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { CaixaIcon, AlertaIcon, RecarregarIcon } from '../../components/icons';
import { listaEsperaOperadorService } from '../../services/listaEsperaOperador.service';
import { operadorSupabase } from '../../supabase/operadorClient';

const ProdutoCard = React.memo(function ProdutoCard({ item }) {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitulo} numberOfLines={1}>{item.nome}</Text>
        <Text style={styles.cardSubtitulo}>
          {item.sku ? `SKU ${item.sku} · ` : ''}Estoque: {item.estoque}
        </Text>
      </View>
      <View style={styles.badgeInteressados}>
        <Text style={styles.badgeInteressadosTexto}>
          {item.qtd_interessados} {item.qtd_interessados === 1 ? 'espera' : 'esperas'}
        </Text>
      </View>
    </View>
  );
});

function ListaVazia() {
  return (
    <View style={styles.estadoContainer}>
      <View style={styles.estadoIconeCirculo}>
        <CaixaIcon size={28} color={colors.primary} />
      </View>
      <Text style={styles.estadoTitulo}>Nenhum produto em espera</Text>
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
      <TouchableOpacity style={styles.tentarNovamenteBtn} onPress={onTentarNovamente}>
        <RecarregarIcon size={15} color={colors.primary} />
        <Text style={styles.tentarNovamenteText}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ListaEsperaScreen() {
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const dados = await listaEsperaOperadorService.listarProdutosComEspera();
      setProdutos(dados);
    } catch (err) {
      setErro(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    if (!operadorSupabase) return undefined;

    const canal = operadorSupabase
      .channel('lista-espera-operador')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lista_espera' }, carregar)
      .subscribe();

    return () => { operadorSupabase.removeChannel(canal); };
  }, [carregar]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Lista de espera</Text>
      </View>

      <View style={styles.content}>
        {carregando ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : erro ? (
          <ListaErro onTentarNovamente={carregar} />
        ) : (
          <FlatList
            data={produtos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ProdutoCard item={item} />}
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.superficie,
    borderWidth: 1,
    borderColor: colors.borda,
    borderRadius: radius.lg,
    padding: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cardTitulo: { fontSize: 15, fontWeight: '800', color: colors.texto },
  cardSubtitulo: { fontSize: 12.5, color: colors.textoSecundario, marginTop: 4 },
  badgeInteressados: {
    backgroundColor: colors.urgenteFundo, borderWidth: 1, borderColor: colors.urgente,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  badgeInteressadosTexto: { fontSize: 11, fontWeight: '800', color: colors.urgenteTexto },

  estadoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 40 },
  estadoIconeCirculo: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  estadoTitulo: { fontSize: 16, fontWeight: '800', color: colors.texto, marginBottom: 6, textAlign: 'center' },
  tentarNovamenteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: colors.primary,
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12,
    marginTop: 20,
  },
  tentarNovamenteText: { fontSize: 14, fontWeight: '700', color: colors.primary },
});
