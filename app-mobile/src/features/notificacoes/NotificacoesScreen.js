import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { separacaoSeparadorService } from '../../services/separacaoSeparador.service';
import { separadorSupabase } from '../../supabase/separadorClient';
import { AlertaIcon, RecarregarIcon } from '../../components/icons';

// NOTA (vistoria 19/08): `listarNotificacoes` filtra por
// `destinatario_tipo = 'separador'` — hoje é a única opção válida do CHECK
// de `notificacoes_internas` além de 'operador' (ver addendum
// Requisitos_Addendum_Entrega_Ocorrencia.md, pendência conhecida: papel
// Entregador ainda não tem tipo de notificação próprio nem gatilho que as
// gere). Ou seja, um funcionário só-Entregador sempre vê esta tela vazia —
// não é um bug desta tela, é um schema/gatilho que falta (fora do escopo
// deste agente).
export default function NotificacoesScreen() {
  const [notificacoes, setNotificacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setNotificacoes(await separacaoSeparadorService.listarNotificacoes());
    } catch (err) {
      // Bug corrigido (vistoria 19/08): o erro era engolido pelo try/finally
      // (mesma classe de bug já corrigida em PainelScreen.js) — a tela caía
      // direto em "Nenhuma notificação", escondendo falha de rede/RLS.
      setErro(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!separadorSupabase) return undefined;
    const canal = separadorSupabase
      .channel('notificacoes-internas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes_internas' }, carregar)
      .subscribe();
    return () => { separadorSupabase.removeChannel(canal); };
  }, [carregar]);

  // Tocar numa notificação não lida marca ela como lida (marcar_notificacao_lida)
  // — sem essa ação nenhuma notificação jamais sairia do estado "não lida".
  const handlePress = async (item) => {
    if (item.lida) return;
    try {
      await separacaoSeparadorService.marcarNotificacaoLida(item.id);
    } catch {
      // Falha silenciosa: marcar como lida não é crítico o suficiente pra
      // interromper o fluxo do separador com um alerta.
    }
  };

  const formatData = (iso) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const tipoIcon = (tipo) => {
    switch (tipo) {
      case 'solicitacao_delegada': return '📋';
      case 'separacao_concluida': return '✅';
      case 'nova_mensagem': return '💬';
      case 'tarefa_agendada_vencendo': return '⏰';
      default: return '🔔';
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.card, !item.lida && styles.cardUnread]}
      onPress={() => handlePress(item)}
    >
      <Text style={styles.icon}>{tipoIcon(item.tipo)}</Text>
      <View style={styles.content}>
        <Text style={[styles.titulo, !item.lida && styles.tituloUnread]}>{item.titulo}</Text>
        <Text style={styles.corpo}>{item.corpo}</Text>
        <Text style={styles.data}>{formatData(item.criado_em)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (carregando) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#1B5FAE" />
      </View>
    );
  }

  if (erro) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
        <AlertaIcon size={28} color="#E5484D" />
        <Text style={styles.erroTitulo}>Não foi possível carregar</Text>
        <Text style={styles.erroSubtitulo}>Verifique sua conexão e tente novamente.</Text>
        <TouchableOpacity style={styles.tentarNovamenteBtn} onPress={carregar}>
          <RecarregarIcon size={15} color="#1B5FAE" />
          <Text style={styles.tentarNovamenteText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={notificacoes}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#8B91A3', marginTop: 40 }}>
            Nenhuma notificação.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  card: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#E4E8F0',
  },
  cardUnread: { borderColor: '#1B5FAE', backgroundColor: '#F9FCFF' },
  icon: { fontSize: 24, marginRight: 16, marginTop: 2 },
  content: { flex: 1 },
  titulo: { fontSize: 15, fontWeight: '600', color: '#5B6072', marginBottom: 4 },
  tituloUnread: { fontWeight: '800', color: '#1C2033' },
  corpo: { fontSize: 14, color: '#5B6072', marginBottom: 8 },
  data: { fontSize: 12, color: '#8B91A3' },

  erroTitulo: { fontSize: 16, fontWeight: '800', color: '#1C2033', marginTop: 14, marginBottom: 6, textAlign: 'center' },
  erroSubtitulo: { fontSize: 13, color: '#8B91A3', textAlign: 'center', lineHeight: 19 },
  tentarNovamenteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#1B5FAE',
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12,
    marginTop: 20,
  },
  tentarNovamenteText: { fontSize: 14, fontWeight: '700', color: '#1B5FAE' },
});
