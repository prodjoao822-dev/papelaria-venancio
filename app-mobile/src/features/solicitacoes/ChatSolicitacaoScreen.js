import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { colors } from '../../theme/colors';
import { radius, spacing } from '../../theme/spacing';
import { SetaVoltarIcon, EnviarIcon, PerfilIcon } from '../../components/icons';
import { separacaoSeparadorService } from '../../services/separacaoSeparador.service';
import { separadorSupabase } from '../../supabase/separadorClient';
import { traduzErroRpc } from '../../utils/traduzErroRpc';

function formatHorario(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function iniciais(nome) {
  if (!nome) return null;
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}

// Lógica de chat movida de DetalheSolicitacaoScreen.js (Etapa B) — tela
// própria em vez de embutida no fim do checklist. Mesmo padrão de Realtime
// (INSERT-only, filtrado por solicitacao_id) que já existia lá.
export default function ChatSolicitacaoScreen({ route, navigation }) {
  const { solicitacaoId } = route.params;
  const [solicitacao, setSolicitacao] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        separacaoSeparadorService.buscarPorId(solicitacaoId),
        separacaoSeparadorService.listarMensagens(solicitacaoId),
      ]);
      setSolicitacao(s);
      setMensagens(m);
    } finally {
      setCarregando(false);
    }
  }, [solicitacaoId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!separadorSupabase) return undefined;

    const canal = separadorSupabase
      .channel(`chat-solicitacao-${solicitacaoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitacoes_separacao_mensagens', filter: `solicitacao_id=eq.${solicitacaoId}` }, carregar)
      .subscribe();
    return () => { separadorSupabase.removeChannel(canal); };
  }, [solicitacaoId, carregar]);

  const enviarMensagem = async () => {
    const texto = novaMensagem.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      await separacaoSeparadorService.enviarMensagem(solicitacaoId, texto);
      setNovaMensagem('');
      await carregar();
    } catch (err) {
      Alert.alert('Erro ao enviar mensagem', traduzErroRpc(err));
    } finally {
      setEnviando(false);
    }
  };

  if (carregando) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!solicitacao) return null;

  const delegante = solicitacao.operador_delegante?.nome;
  const avatarIniciais = iniciais(delegante);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}>
            <SetaVoltarIcon size={20} color={colors.texto} />
          </TouchableOpacity>
          <View style={styles.avatar}>
            {avatarIniciais ? (
              <Text style={styles.avatarText}>{avatarIniciais}</Text>
            ) : (
              <PerfilIcon size={18} color={colors.primary} />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerNome} numberOfLines={1}>{delegante ?? 'Operador'}</Text>
            <Text style={styles.headerSubtitulo} numberOfLines={1}>
              {solicitacao.pedidos?.protocolo} · {solicitacao.pedidos?.clientes?.nome}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.mensagensContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {mensagens.map(msg => {
            const isMe = msg.autor_tipo === 'separador';
            return (
              <View key={msg.id} style={[styles.bolhaRow, isMe ? styles.bolhaRowMe : styles.bolhaRowOther]}>
                <View style={[styles.bolha, isMe ? styles.bolhaMe : styles.bolhaOther]}>
                  <Text style={[styles.bolhaTexto, isMe && styles.bolhaTextoMe]}>{msg.texto}</Text>
                  <Text style={[styles.bolhaHorario, isMe ? styles.bolhaHorarioMe : styles.bolhaHorarioOther]}>
                    {formatHorario(msg.criado_em)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Mensagem..."
            placeholderTextColor={colors.textoTerciario}
            value={novaMensagem}
            onChangeText={setNovaMensagem}
            editable={!enviando}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!novaMensagem.trim() || enviando) && styles.sendButtonDisabled]}
            onPress={enviarMensagem}
            disabled={!novaMensagem.trim() || enviando}
          >
            {enviando ? <ActivityIndicator color="#fff" size="small" /> : <EnviarIcon size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.fundo },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.superficie,
    borderBottomWidth: 1, borderColor: colors.borda,
    paddingHorizontal: spacing.xl, paddingVertical: 12,
  },
  avatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  headerInfo: { flex: 1, minWidth: 0 },
  headerNome: { fontSize: 15, fontWeight: '800', color: colors.texto },
  headerSubtitulo: { fontSize: 11.5, color: colors.textoTerciario, marginTop: 1 },

  mensagensContent: { padding: 18, gap: 12 },
  bolhaRow: { flexDirection: 'row' },
  bolhaRowMe: { justifyContent: 'flex-end' },
  bolhaRowOther: { justifyContent: 'flex-start' },
  bolha: { maxWidth: '75%', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18 },
  bolhaMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bolhaOther: { backgroundColor: colors.divisor, borderBottomLeftRadius: 4 },
  bolhaTexto: { fontSize: 14, lineHeight: 20, color: colors.texto },
  bolhaTextoMe: { color: '#fff' },
  bolhaHorario: { fontSize: 10.5, marginTop: 5 },
  bolhaHorarioOther: { color: colors.textoTerciario },
  bolhaHorarioMe: { color: '#C9D9EF', textAlign: 'right' },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderColor: colors.borda,
    backgroundColor: colors.superficie,
  },
  input: {
    flex: 1, minHeight: 46, maxHeight: 100,
    borderWidth: 1.5, borderColor: colors.borda, borderRadius: 23,
    paddingHorizontal: 18, paddingVertical: 12,
    fontSize: 14, color: colors.texto,
    backgroundColor: colors.fundoInput,
  },
  sendButton: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.textoDesabilitado },
});
