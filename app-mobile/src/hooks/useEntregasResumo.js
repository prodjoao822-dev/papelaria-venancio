// Espelha useSolicitacoesResumo.js (Separador) 1:1, mas para o Entregador —
// busca todas as entregas do funcionário logado (RLS já restringe ao
// próprio) e mantém Realtime assinado. Extraído nesta vistoria (19/08) para
// a Home poder mostrar um resumo por papel em vez de só o do Separador
// (achado da vistoria: HomeScreen mostrava só stats de separação mesmo pra
// um funcionário só-Entregador, que via "0 pendentes/0 prontas" sem sentido
// nenhum e nada sobre as próprias entregas).
import { useCallback, useEffect, useState } from 'react';
import { entregaEntregadorService } from '../services/entregaEntregador.service';
import { separadorSupabase } from '../supabase/separadorClient';

export function useEntregasResumo() {
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

    const canal = separadorSupabase
      .channel('resumo-entregas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_entrega' }, carregar)
      .subscribe();

    return () => { separadorSupabase.removeChannel(canal); };
  }, [carregar]);

  return { todasEntregas, carregando, erro, recarregar: carregar };
}
