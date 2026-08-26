// Ícones em SVG extraídos diretamente do bundle de design (telas 01-13 ·
// Separador — Venancio App Mobile.dc.html). Mantidos num só lugar para não
// duplicar path SVG pelas telas. Todos aceitam `size` e `color`/`strokeColor`
// com o mesmo default visto no design.
import Svg, { Path } from 'react-native-svg';

export function LivroIcon({ size = 34, color = '#FFC72C' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </Svg>
  );
}

export function AlertaIcon({ size = 18, color = '#E5484D' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2L2 20h20L12 2zM12 9v5M12 17h.01" />
    </Svg>
  );
}

export function HomeIcon({ size = 22, color = '#8B91A3' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
    </Svg>
  );
}

export function ListaIcon({ size = 22, color = '#8B91A3' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </Svg>
  );
}

export function PerfilIcon({ size = 22, color = '#8B91A3' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
    </Svg>
  );
}

export function SinoIcon({ size = 19, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
    </Svg>
  );
}

export function ChevronDireitaIcon({ size = 20, color = '#1C2033' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function RelogioIcon({ size = 11, color = '#1B5FAE' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 7v5l3 3" />
    </Svg>
  );
}

export function RaioIcon({ size = 11, color = '#1C2033' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </Svg>
  );
}

// Seta pra voltar — usada em cabeçalhos customizados (Detalhe, Chat).
export function SetaVoltarIcon({ size = 20, color = '#1C2033' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 19l-7-7 7-7" />
    </Svg>
  );
}

// Balão de chat — botão no cabeçalho do Detalhe (linha ~191 do bundle) e
// item de bottom-tab (não usado como tab real nesta etapa, só o ícone).
export function ChatIcon({ size = 22, color = '#8B91A3' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </Svg>
  );
}

// Checkmark — item marcado no checklist (dentro do quadrado verde).
export function CheckIcon({ size = 16, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

// Avião de papel — botão de enviar do chat.
export function EnviarIcon({ size = 18, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  );
}

// Caixa — estado vazio da lista de solicitações (tela 05).
export function CaixaIcon({ size = 28, color = '#1B5FAE' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10" />
    </Svg>
  );
}

// Recarregar — botão "Tentar novamente" do estado de erro (tela 07).
export function RecarregarIcon({ size = 15, color = '#1B5FAE' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </Svg>
  );
}

// Relógio/check — ícone central da tela de confirmação de envio (tela 11),
// mesmo path do RelogioIcon mas em tamanho maior (uso decorativo).
export function RelogioGrandeIcon({ size = 34, color = '#1B5FAE' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 7v5l3 3" />
    </Svg>
  );
}

// Caminhão — tab "Entregas" (papel Entregador, Fase C) e ícone de ação
// "Iniciar Rota". Não faz parte do bundle de design original (que só cobria
// o Separador) — desenhado no mesmo estilo (stroke 2, linecap/linejoin round)
// dos demais ícones deste arquivo para não destoar visualmente.
export function CaminhaoIcon({ size = 22, color = '#8B91A3' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 3h13v13H1zM14 8h4l4 4v4h-8zM4 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z" />
    </Svg>
  );
}

// Alfinete de mapa — endereço de entrega nos cards/detalhe. Mesmo motivo do
// CaminhaoIcon (não existe no bundle de design, papel Entregador é novo).
export function LocalizacaoIcon({ size = 14, color = '#5B6072' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0z" />
      <Path d="M12 13a3 3 0 100-6 3 3 0 000 6z" />
    </Svg>
  );
}

// X num círculo — botão "Registrar Insucesso" (entrega não concluída).
export function XCirculoIcon({ size = 18, color = '#E5484D' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a10 10 0 100 20 10 10 0 000-20zM15 9l-6 6M9 9l6 6" />
    </Svg>
  );
}

// Telefone — ação rápida "Ligar" no detalhe da entrega (deep link tel:).
// Mesmo motivo do CaminhaoIcon/LocalizacaoIcon: papel Entregador é novo,
// não existe no bundle de design original.
export function TelefoneIcon({ size = 15, color = '#1B5FAE' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </Svg>
  );
}

// Navegação/seta — ação rápida "Abrir no mapa" no detalhe da entrega
// (deep link geo:/maps). Mesmo motivo das demais deste bloco.
export function NavegacaoIcon({ size = 15, color = '#1B5FAE' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l18-8-8 18-2-8-8-2z" />
    </Svg>
  );
}
