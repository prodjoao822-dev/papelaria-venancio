// Hook compartilhado: busca todas as solicitações do separador logado (RLS
// já restringe ao próprio) e mantém Realtime assinado, mesmo padrão usado em
// PainelScreen.js. Feito para a Home (HomeScreen) consumir sem duplicar a
// query + assinatura de canal. PainelScreen.js não foi migrado para este
// hook nesta etapa de propósito — sua reestilização (com a lógica de filtro
// que já tem) é escopo da próxima etapa, não desta.
import { useCallback, useEffect, useState } from 'react';
import { separacaoSeparadorService } from '../services/separacaoSeparador.service';
import { separadorSupabase } from '../supabase/separadorClient';

export function useSolicitacoesResumo() {
  const [todasSolicitacoes, setTodasSolicitacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const dados = await separacaoSeparadorService.listarMinhas();
      setTodasSolicitacoes(dados);
    } catch (err) {
      // Mesma correção de PainelScreen.js: não engolir o erro em silêncio —
      // a Home também precisa saber distinguir "sem solicitações" de "não
      // deu pra carregar".
      setErro(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    if (!separadorSupabase) return undefined;

    const canal = separadorSupabase
      .channel('resumo-solicitacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao' }, carregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_separacao_itens' }, carregar)
      .subscribe();

    return () => { separadorSupabase.removeChannel(canal); };
  }, [carregar]);

  return { todasSolicitacoes, carregando, erro, recarregar: carregar };
}
