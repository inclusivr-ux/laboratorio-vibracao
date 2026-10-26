// Ajudas de desenho para o conteúdo dos módulos no painel.
import { COR, FONTE } from '../ui/estilo-ui.js';

export function titulo(p, area, texto, y = area.y + 34) {
  p.texto(texto, area.x, y, { fonte: FONTE.titulo(32), cor: COR.tinta, maxLargura: area.w });
  return y + 14;
}

export function subtitulo(p, x, y, texto, largura = 400) {
  p.texto(texto, x, y, { fonte: FONTE.forte(23), cor: COR.carvao, maxLargura: largura });
}

export function paragrafo(p, x, y, largura, texto, tamanho = 22, cor = COR.carvao) {
  return p.textoQuebrado(texto, x, y, largura, Math.round(tamanho * 1.32), { fonte: FONTE.texto(tamanho), cor });
}

export function caixa(p, x, y, w, h, fundo = 'rgba(255,255,255,0.45)') {
  p.retangulo(x, y, w, h, 18, fundo, 'rgba(66,67,58,0.35)', 2);
}

export function formatarDb(v, casas = 1) {
  if (!isFinite(v)) return '—';
  return `${v.toFixed(casas)}`;
}

export function grupoBotoes(p, idBase, x, y, w, h, opcoes, valorAtual, aoEscolher, { tamanho = 21, espaco = 10 } = {}) {
  const n = opcoes.length;
  const bw = (w - espaco * (n - 1)) / n;
  opcoes.forEach(([valor, rotulo], i) => {
    p.botao(`${idBase}-${valor}`, x + i * (bw + espaco), y, bw, h, rotulo, () => aoEscolher(valor), {
      variante: valor === valorAtual ? 'ativo' : 'secundario',
      tamanho,
    });
  });
}
