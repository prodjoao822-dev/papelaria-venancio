import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { mockDb } from '../../mocks/db';

export default function PainelScreen({ route, navigation }) {
  const { separadorId, nome } = route.params;
  const [solicitacoes, setSolicitacoes] = useState([]);

  useEffect(() => {
    const assigned = mockDb.solicitacoes_separacao.filter(
      s => s.separador_id === separadorId && (s.status === 'pendente' || s.status === 'em_andamento')
    );
    setSolicitacoes(assigned);
  }, []);

  const formatHorario = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const renderItem = ({ item }) => {
    const isImediata = item.prioridade === 'imediata';
    const pedido = mockDb.pedidos_mock[item.pedido_id];

    return (
      <TouchableOpacity
        style={[styles.card, isImediata && styles.cardImediata]}
        onPress={() => navigation.navigate('DetalheSolicitacao', { solicitacaoId: item.id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.pedidoId}>{pedido?.protocolo}</Text>
          {isImediata ? (
            <View style={styles.badgeImediata}>
              <Text style={styles.badgeImediataText}>⚡ IMEDIATA</Text>
            </View>
          ) : (
            <View style={styles.badgeAgendada}>
              <Text style={styles.badgeAgendadaText}>🕐 {formatHorario(item.horario_retirada)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.clienteNome}>{pedido?.cliente_nome}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusText}>
            {item.status === 'em_andamento' ? '🏃 Em separação' : '⏳ Pendente'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greetingSub}>Turno da tarde</Text>
          <Text style={styles.greetingTitle}>Olá, {nome.split(' ')[0]}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Notificacoes')}>
          <Text style={styles.bellIcon}>🔔</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{solicitacoes.length}</Text>
            <Text style={styles.statLabel}>pendentes hoje</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNumber, { color: '#2AA35C' }]}>
              {mockDb.solicitacoes_separacao.filter(s => s.separador_id === separadorId && s.status === 'pronta').length}
            </Text>
            <Text style={styles.statLabel}>prontas hoje</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SUAS SOLICITAÇÕES</Text>

        <FlatList
          data={solicitacoes.sort((a, b) => a.prioridade === 'imediata' ? -1 : 1)}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyText}>Nenhuma separação pendente.</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  header: {
    backgroundColor: '#1B5FAE',
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingSub: { fontSize: 13, color: '#C9D9EF', fontWeight: '600' },
  greetingTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  bellIcon: { fontSize: 24 },
  content: { flex: 1, padding: 20 },
  statsContainer: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statBox: {
    flex: 1, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E4E8F0',
    borderRadius: 16, padding: 14,
  },
  statNumber: { fontSize: 26, fontWeight: '800', color: '#1C2033' },
  statLabel: { fontSize: 12, color: '#5B6072', fontWeight: '600', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#5B6072', marginBottom: 10 },
  card: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E4E8F0',
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  cardImediata: { backgroundColor: '#FFC72C', borderColor: '#FFC72C' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  pedidoId: { fontSize: 14, fontWeight: '700', color: '#1C2033' },
  clienteNome: { fontSize: 14, color: '#1C2033', marginBottom: 8 },
  badgeImediata: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  badgeImediataText: { fontSize: 11, fontWeight: '800', color: '#8A5B00' },
  badgeAgendada: {
    backgroundColor: '#EAF1FA',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  badgeAgendadaText: { fontSize: 11, fontWeight: '800', color: '#1B5FAE' },
  statusRow: { marginTop: 4 },
  statusText: { fontSize: 12, color: '#5B6072', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 40 },
  emptyIcon: { fontSize: 40 },
  emptyText: { marginTop: 10, fontSize: 16, color: '#5B6072', fontWeight: '600' },
});
