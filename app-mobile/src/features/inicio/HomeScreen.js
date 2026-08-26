import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSeparadorAuth } from '../../contexts/SeparadorAuthContext';
import { useSolicitacoesResumo } from '../../hooks/useSolicitacoesResumo';
import { useEntregasResumo } from '../../hooks/useEntregasResumo';
import { colors } from '../../theme/colors';
import { SinoIcon, ChevronDireitaIcon, RelogioIcon, CaminhaoIcon } from '../../components/icons';

const STATUS_ABERTOS = ['pendente', 'em_andamento'];
const STATUS_ENTREGA_ABERTOS = ['pendente', 'em_rota'];

function calcularTurno(hora) {
  if (hora < 12) return 'Turno da manhã';
  if (hora < 18) return 'Turno da tarde';
  return 'Turno da noite';
}

function formatHorario(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export default function HomeScreen({ navigation }) {
  const { funcionario } = useSeparadorAuth();
  // Achado da vistoria (19/08): esta tela mostrava só stats de separação
  // (pendentes/prontas hoje) incondicionalmente, mesmo pra um funcionário
  // só-Entregador — que via "0 pendentes/0 prontas" (não é mentira, mas é
  // irrelevante pro trabalho dele) e nenhuma informação sobre as próprias
  // entregas. Os dois hooks sempre rodam (regra dos hooks não permite
  // condicional) — RLS devolve lista vazia sem erro pra quem não tem o
  // papel, custo é uma query extra barata, não uma tela quebrada.
  const { todasSolicitacoes, carregando: carregandoSep } = useSolicitacoesResumo();
  const { todasEntregas, carregando: carregandoEnt } = useEntregasResumo();
  const papeis = funcionario?.papeis ?? [];
  const ehSeparador = papeis.includes('separacao');
  const ehEntregador = papeis.includes('entrega');
  const carregando = (ehSeparador && carregandoSep) || (ehEntregador && carregandoEnt);

  const turno = calcularTurno(new Date().getHours());
  const primeiroNome = (funcionario?.nome ?? '').split(' ')[0];

  const abertas = todasSolicitacoes.filter(s => STATUS_ABERTOS.includes(s.status));
  const prontasCount = todasSolicitacoes.filter(s => s.status === 'pronta').length;
  const imediatasCount = abertas.filter(s => s.prioridade === 'imediata').length;

  const agora = Date.now();
  const proximaAgendada = abertas
    .filter(s => s.prioridade === 'agendada' && s.horario_retirada && new Date(s.horario_retirada).getTime() >= agora)
    .sort((a, b) => new Date(a.horario_retirada).getTime() - new Date(b.horario_retirada).getTime())[0];

  const entregasAbertas = todasEntregas.filter(e => STATUS_ENTREGA_ABERTOS.includes(e.status));
  const entregasEmRotaCount = entregasAbertas.filter(e => e.status === 'em_rota').length;
  const proximaEntrega = entregasAbertas
    .filter(e => e.horario_previsto && new Date(e.horario_previsto).getTime() >= agora)
    .sort((a, b) => new Date(a.horario_previsto).getTime() - new Date(b.horario_previsto).getTime())[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greetingSub}>{turno}</Text>
          <Text style={styles.greetingTitle}>Olá, {primeiroNome}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Notificacoes')} hitSlop={10}>
          <SinoIcon size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {carregando ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {ehSeparador && (
              <>
                <View style={styles.statsContainer}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{abertas.length}</Text>
                    <Text style={styles.statLabel}>pendentes hoje</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statNumber, { color: colors.sucesso }]}>{prontasCount}</Text>
                    <Text style={styles.statLabel}>prontas hoje</Text>
                  </View>
                </View>

                {imediatasCount > 0 && (
                  <TouchableOpacity
                    style={styles.bannerImediata}
                    onPress={() => navigation.navigate('Solicitações')}
                  >
                    <View>
                      <Text style={styles.bannerImediataLabel}>
                        {imediatasCount} {imediatasCount === 1 ? 'imediata agora' : 'imediatas agora'}
                      </Text>
                      <Text style={styles.bannerImediataTitulo}>Ver solicitações urgentes</Text>
                    </View>
                    <ChevronDireitaIcon size={20} color={colors.texto} />
                  </TouchableOpacity>
                )}

                {proximaAgendada && (
                  <>
                    <Text style={styles.sectionTitle}>PRÓXIMA AGENDADA</Text>
                    <View style={styles.cardAgendada}>
                      <View>
                        <Text style={styles.cardAgendadaTitulo}>
                          {proximaAgendada.pedidos?.protocolo} · {proximaAgendada.pedidos?.clientes?.nome}
                        </Text>
                        <Text style={styles.cardAgendadaSub}>
                          {(proximaAgendada.itens ?? []).length} itens
                        </Text>
                      </View>
                      <View style={styles.badgeHorario}>
                        <RelogioIcon size={11} color={colors.primary} />
                        <Text style={styles.badgeHorarioText}>{formatHorario(proximaAgendada.horario_retirada)}</Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}

            {ehEntregador && (
              <>
                <View style={[styles.statsContainer, ehSeparador && { marginTop: 18 }]}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{entregasAbertas.length}</Text>
                    <Text style={styles.statLabel}>entregas em aberto</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statNumber, { color: colors.andamento }]}>{entregasEmRotaCount}</Text>
                    <Text style={styles.statLabel}>em rota agora</Text>
                  </View>
                </View>

                {entregasAbertas.length > 0 && (
                  <TouchableOpacity
                    style={styles.bannerEntrega}
                    onPress={() => navigation.navigate('Entregas')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <CaminhaoIcon size={18} color={colors.primary} />
                      <Text style={styles.bannerEntregaTitulo}>Ver minhas entregas</Text>
                    </View>
                    <ChevronDireitaIcon size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}

                {proximaEntrega && (
                  <>
                    <Text style={styles.sectionTitle}>PRÓXIMA ENTREGA</Text>
                    <View style={styles.cardAgendada}>
                      <View>
                        <Text style={styles.cardAgendadaTitulo}>
                          {proximaEntrega.pedidos?.protocolo} · {proximaEntrega.pedidos?.clientes?.nome}
                        </Text>
                        <Text style={styles.cardAgendadaSub}>
                          {proximaEntrega.endereco_entrega || proximaEntrega.pedidos?.endereco_entrega || 'Endereço não informado'}
                        </Text>
                      </View>
                      <View style={styles.badgeHorario}>
                        <RelogioIcon size={11} color={colors.primary} />
                        <Text style={styles.badgeHorarioText}>{formatHorario(proximaEntrega.horario_previsto)}</Text>
                      </View>
                    </View>
                  </>
                )}
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fundo },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingSub: { fontSize: 13, color: '#C9D9EF', fontWeight: '600' },
  greetingTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 2 },
  content: { flex: 1, padding: 20 },
  statsContainer: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  statBox: {
    flex: 1, backgroundColor: colors.superficie,
    borderWidth: 1, borderColor: colors.borda,
    borderRadius: 16, padding: 14,
  },
  statNumber: { fontSize: 26, fontWeight: '800', color: colors.texto },
  statLabel: { fontSize: 12, color: colors.textoSecundario, fontWeight: '600', marginTop: 2 },
  bannerImediata: {
    backgroundColor: colors.urgente,
    borderRadius: 18,
    padding: 16,
    paddingHorizontal: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerImediataLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.4,
    textTransform: 'uppercase', color: colors.urgenteTexto,
  },
  bannerImediataTitulo: { fontSize: 15, fontWeight: '800', color: colors.texto, marginTop: 4 },
  bannerEntrega: {
    backgroundColor: colors.primaryLight,
    borderRadius: 18,
    padding: 16,
    paddingHorizontal: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerEntregaTitulo: { fontSize: 14.5, fontWeight: '800', color: colors.primary },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: colors.textoSecundario,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  cardAgendada: {
    backgroundColor: colors.superficie,
    borderWidth: 1, borderColor: colors.borda,
    borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  cardAgendadaTitulo: { fontSize: 14, fontWeight: '700', color: colors.texto },
  cardAgendadaSub: { fontSize: 12, color: colors.textoTerciario, marginTop: 3 },
  badgeHorario: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  badgeHorarioText: { fontSize: 11, fontWeight: '800', color: colors.primary },
});
