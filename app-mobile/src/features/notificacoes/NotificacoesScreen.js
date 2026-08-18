import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { mockDb } from '../../mocks/db';

export default function NotificacoesScreen() {
  const notificacoes = [...mockDb.notificacoes_internas].sort(
    (a, b) => new Date(b.criado_em) - new Date(a.criado_em)
  );

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
    <View style={[styles.card, !item.lida && styles.cardUnread]}>
      <Text style={styles.icon}>{tipoIcon(item.tipo)}</Text>
      <View style={styles.content}>
        <Text style={[styles.titulo, !item.lida && styles.tituloUnread]}>{item.titulo}</Text>
        <Text style={styles.corpo}>{item.corpo}</Text>
        <Text style={styles.data}>{formatData(item.criado_em)}</Text>
      </View>
    </View>
  );

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
});
