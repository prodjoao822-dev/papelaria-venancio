import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { mockDb } from '../../mocks/db';

export default function DetalheSolicitacaoScreen({ route, navigation }) {
  const { solicitacaoId } = route.params;
  const [solicitacao, setSolicitacao] = useState(null);
  const [itens, setItens] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [novaMensagem, setNovaMensagem] = useState('');

  useEffect(() => {
    const sol = mockDb.solicitacoes_separacao.find(s => s.id === solicitacaoId);
    setSolicitacao(sol);
    if (sol) {
      setItens(mockDb.solicitacoes_separacao_itens.filter(i => i.solicitacao_id === solicitacaoId));
      setMensagens(mockDb.solicitacoes_separacao_mensagens.filter(m => m.solicitacao_id === solicitacaoId));
    }
  }, [solicitacaoId]);

  if (!solicitacao) return null;

  const pedido = mockDb.pedidos_mock[solicitacao.pedido_id];
  const isPendente = solicitacao.status === 'pendente';
  const todosSeparados = itens.length > 0 && itens.every(i => i.separado);

  const assumir = () => setSolicitacao({ ...solicitacao, status: 'em_andamento' });

  const toggleItem = (itemId) => {
    if (isPendente) return;
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, separado: !i.separado } : i));
  };

  const concluir = () => navigation.goBack();

  const enviarMensagem = () => {
    if (!novaMensagem.trim()) return;
    setMensagens([...mensagens, {
      id: Math.random().toString(),
      solicitacao_id: solicitacao.id,
      autor_tipo: 'separador',
      texto: novaMensagem,
      criado_em: new Date().toISOString()
    }]);
    setNovaMensagem('');
  };

  const renderItem = ({ item }) => {
    const detalhe = pedido?.itens_detalhes[item.item_pedido_id];
    return (
      <TouchableOpacity
        style={styles.itemRow}
        onPress={() => toggleItem(item.id)}
        disabled={isPendente}
      >
        <Text style={styles.itemCheckbox}>{item.separado ? '☑' : '☐'}</Text>
        <View style={styles.itemInfo}>
          <Text style={[styles.itemNome, item.separado && styles.itemNomeSeparado]}>
            {detalhe?.nome}
          </Text>
          <Text style={styles.itemQuantidade}>Qtd: {detalhe?.quantidade}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : null}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.pedidoTitle}>Pedido {pedido?.protocolo}</Text>
          <Text style={styles.clienteNome}>{pedido?.cliente_nome}</Text>
          {solicitacao.prioridade === 'imediata' && (
            <View style={styles.badgeImediata}>
              <Text style={styles.badgeImediataText}>⚡ PRIORIDADE IMEDIATA</Text>
            </View>
          )}
        </View>

        {isPendente ? (
          <View style={styles.actionContainer}>
            <Text style={styles.pendenteText}>
              Esta solicitação está aguardando você iniciar a separação.
            </Text>
            <TouchableOpacity style={styles.assumirButton} onPress={assumir}>
              <Text style={styles.assumirButtonText}>Assumir Solicitação</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.checklistContainer}>
            <Text style={styles.sectionTitle}>ITENS DO PEDIDO</Text>
            <FlatList
              data={itens}
              renderItem={renderItem}
              keyExtractor={i => i.id}
              scrollEnabled={false}
            />
            <TouchableOpacity
              style={[styles.concluirButton, !todosSeparados && styles.concluirButtonDisabled]}
              disabled={!todosSeparados}
              onPress={concluir}
            >
              <Text style={styles.concluirButtonText}>✅ Separação Pronta</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.chatContainer}>
          <Text style={styles.sectionTitle}>CHAT INTERNO</Text>
          {mensagens.map(msg => {
            const isMe = msg.autor_tipo === 'separador';
            return (
              <View key={msg.id} style={[styles.msgBubble, isMe ? styles.msgMe : styles.msgOther]}>
                <Text style={[styles.msgAuthor, isMe ? styles.msgAuthorMe : styles.msgAuthorOther]}>
                  {isMe ? 'Você' : 'Operador'}
                </Text>
                <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
                  {msg.texto}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {!isPendente && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite uma mensagem..."
            value={novaMensagem}
            onChangeText={setNovaMensagem}
          />
          <TouchableOpacity style={styles.sendButton} onPress={enviarMensagem}>
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FB' },
  header: {
    padding: 20, backgroundColor: '#fff',
    borderBottomWidth: 1, borderColor: '#E4E8F0',
  },
  pedidoTitle: { fontSize: 22, fontWeight: '800', color: '#1C2033' },
  clienteNome: { fontSize: 16, color: '#5B6072', marginTop: 4 },
  badgeImediata: {
    backgroundColor: '#FFC72C', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, alignSelf: 'flex-start', marginTop: 12,
  },
  badgeImediataText: { fontSize: 12, fontWeight: '800', color: '#8A5B00' },
  actionContainer: {
    padding: 20, backgroundColor: '#fff', marginTop: 16, alignItems: 'center',
  },
  pendenteText: { fontSize: 15, color: '#5B6072', textAlign: 'center', marginBottom: 16 },
  assumirButton: {
    backgroundColor: '#1B5FAE', paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: 12, width: '100%', alignItems: 'center',
  },
  assumirButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  checklistContainer: { padding: 20, backgroundColor: '#fff', marginTop: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#8B91A3', marginBottom: 12 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderColor: '#F0F2F7',
  },
  itemCheckbox: { fontSize: 24, marginRight: 16, color: '#2AA35C' },
  itemInfo: { flex: 1 },
  itemNome: { fontSize: 16, color: '#1C2033', fontWeight: '600' },
  itemNomeSeparado: { textDecorationLine: 'line-through', color: '#8B91A3' },
  itemQuantidade: { fontSize: 14, color: '#5B6072', marginTop: 4 },
  concluirButton: {
    backgroundColor: '#2AA35C', paddingVertical: 16,
    borderRadius: 12, alignItems: 'center', marginTop: 24,
  },
  concluirButtonDisabled: { backgroundColor: '#A3D9B8' },
  concluirButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chatContainer: { padding: 20, paddingBottom: 40 },
  msgBubble: { padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '80%' },
  msgMe: { backgroundColor: '#1B5FAE', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  msgOther: { backgroundColor: '#EAF1FA', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  msgAuthor: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  msgAuthorMe: { color: '#C9D9EF' },
  msgAuthorOther: { color: '#1B5FAE' },
  msgText: { fontSize: 15 },
  msgTextMe: { color: '#fff' },
  msgTextOther: { color: '#1C2033' },
  inputContainer: {
    flexDirection: 'row', padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E4E8F0',
  },
  input: {
    flex: 1, backgroundColor: '#F5F7FB', borderRadius: 20,
    paddingHorizontal: 16, height: 40, marginRight: 8,
  },
  sendButton: {
    width: 40, height: 40, backgroundColor: '#1B5FAE',
    borderRadius: 20, justifyContent: 'center', alignItems: 'center',
  },
  sendIcon: { color: '#fff', fontSize: 16 },
});
