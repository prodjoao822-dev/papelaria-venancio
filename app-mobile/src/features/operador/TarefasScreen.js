// Tarefas pendentes do Operador — leitura da lista + uma única ação de
// escrita (concluir), sempre via RPC já existente (`concluir_tarefa`, sem
// lógica nova). Criar/reatribuir tarefa continuam exclusivos do dashboard
// web (fora de escopo desta v1). Estrutura geral espelha PainelScreen.js.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { CaixaIcon, AlertaIcon, RecarregarIcon, CheckIcon } from '../../components/icons';
import { tarefasOperadorService } from '../../services/tarefasOperador.service';
import { operadorSupabase } from '../../supabase/operadorClient';
import { traduzErroRpc } from '../../utils/traduzErroRpc';

function formatDataHora(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const data = date.toLocaleDateString('pt-BR');
  const hora = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  return `${data} ${hora}`;
}

const TarefaCard = React.memo(function TarefaCard({ item, onConcluir, concluindo }) {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitulo}>{item.descricao}</Text>
        <Text style={styles.cardSubtitulo}>
          {item.pedidos?.protocolo ? `${item.pedidos.protocolo} · ` : ''}
          {item.responsavel?.nome ?? 'Sem responsável'} · {formatDataHora(item.data_execucao)}
        </Text>
      </View>
      <TouchableOpacity
        testID={`tarefa-botao-concluir-${item.id}`}
        style={styles.botaoConcluir}
        onPress={() => onConcluir(item.id)}
        disabled={concluindo}
        hitSlop={8}
      >
        {concluindo ? (
          <ActivityIndicator size="small" color={colors.sucesso} />
        ) : (
          <CheckIcon size={16} color={colors.sucesso} />
        )}
      </TouchableOpacity>
    </View>
  );
});

function ListaVazia() {
  return (
    <View style={styles.estadoContainer}>
      <View style={styles.estadoIconeCirculo}>
        <CaixaIcon size={28} color={colors.primary} />
      </View>
      <Text style={styles.estadoTitulo}>Nenhuma tarefa pendente</Text>
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

export default function TarefasScreen() {
  const [tarefas, setTarefas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [concluindoId, setConcluindoId] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const dados = await tarefasOperadorService.listarPendentes();
      setTarefas(dados);
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
      .channel('tarefas-operador')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, carregar)
      .subscribe();

    return () => { operadorSupabase.removeChannel(canal); };
  }, [carregar]);

  const concluir = useCallback(async (tarefaId) => {
    setConcluindoId(tarefaId);
    try {
      await tarefasOperadorService.concluir(tarefaId);
    } catch (err) {
      Alert.alert('Erro ao concluir', traduzErroRpc(err));
    } finally {
      setConcluindoId(null);
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Tarefas</Text>
      </View>

      <View style={styles.content}>
        {carregando ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : erro ? (
          <ListaErro onTentarNovamente={carregar} />
        ) : (
          <FlatList
            data={tarefas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TarefaCard item={item} onConcluir={concluir} concluindo={concluindoId === item.id} />
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
  botaoConcluir: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.sucessoFundoForte,
    justifyContent: 'center', alignItems: 'center',
  },

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
