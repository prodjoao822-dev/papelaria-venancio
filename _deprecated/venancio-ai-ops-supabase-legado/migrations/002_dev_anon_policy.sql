-- ⚠️  APENAS PARA DESENVOLVIMENTO/TESTE
-- Em produção, remova estas policies e use autenticação real (Supabase Auth)
-- ─────────────────────────────────────────────────────────────────────────────

-- Permite que a chave anônima (dashboard sem login) leia e escreva os dados
CREATE POLICY "anon_acesso_total_dev" ON public.pedidos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.clientes
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.itens_pedido
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.historico_status
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.notificacoes
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.orcamentos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.conversas
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.mensagens
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.contexto_ia
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_acesso_total_dev" ON public.listas_escolares
  FOR ALL TO anon USING (true) WITH CHECK (true);
