// Simulador de audição: aplica uma aproximação de perda auditiva ou de implante coclear a TODO o som
// do laboratório (depois do som 3D, nas duas orelhas). Serve para conferir a mixagem, não para "sentir a surdez".
import { titulo, paragrafo, grupoBotoes, subtitulo } from './comum.js';
import { TocadorMusica } from './tocador-musica.js';
import { lerPreferencia, salvarPreferencia } from '../util/armazenamento.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

const RESIDUO = { 250: 50, 500: 70, 1000: 100, 2000: 120, 8000: 120 };

// Audiogramas de exemplo (dB NA em 250, 500, 1k, 2k, 4k e 8k Hz). Ilustrativos, não são pacientes reais.
export const PRESETS = [
  { id: 'normal', nome: 'Audição típica', desc: 'Sem simulação. Use para comparar.', modo: 'normal' },
  { id: 'idade', nome: 'Leve descendente', desc: 'Perda leve que piora nos agudos, comum com a idade.', aud: { 250: 15, 500: 20, 1000: 25, 2000: 35, 4000: 50, 8000: 60 } },
  { id: 'plana', nome: 'Moderada plana', desc: 'Cerca de 50 dB em todas as frequências.', aud: { 250: 45, 500: 50, 1000: 50, 2000: 50, 4000: 55, 8000: 55 } },
  { id: 'ruido', nome: 'Entalhe (ruído)', desc: 'Um "buraco" perto de 4 kHz, típico de exposição a som alto.', aud: { 250: 10, 500: 10, 1000: 15, 2000: 25, 4000: 55, 8000: 30 } },
  { id: 'u', nome: 'Em U', desc: 'Frequências do meio piores que as pontas: a voz perde clareza.', aud: { 250: 30, 500: 45, 1000: 60, 2000: 60, 4000: 45, 8000: 35 } },
  { id: 'rampa', nome: 'Severa em rampa', desc: 'Os graves ainda chegam; acima de 1 kHz, quase nada.', aud: { 250: 45, 500: 55, 1000: 75, 2000: 95, 4000: 110, 8000: 115 } },
  { id: 'profunda', nome: 'Profunda (graves)', desc: 'Só graves fortes passam, e comprimidos. Comum na surdez congênita.', aud: { 250: 85, 500: 95, 1000: 110, 2000: 120, 4000: 120, 8000: 120 } },
  { id: 'unilateral', nome: 'Unilateral direita', desc: 'Esquerda típica; direita sem audição útil. O som 3D perde a referência.', unilateral: true },
  { id: 'ic8', nome: 'Implante 8 canais', desc: 'Vocoder de ruído, 8 canais de 150 Hz a 8 kHz. O ritmo passa; altura e timbre, pouco.', ic: { canais: 8, portadora: 'ruido' } },
  { id: 'ic16', nome: 'Implante 16 canais', desc: 'Vocoder senoidal com 16 canais: um pouco mais de detalhe de altura.', ic: { canais: 16, portadora: 'seno' } },
  { id: 'hibrido', nome: 'Implante + graves', desc: 'Graves pela audição residual, o resto pelo implante (estimulação híbrida).', ic: { canais: 8, portadora: 'ruido', hibrido: true, fCorteHibrido: 500, audiogramaResidual: RESIDUO } },
  { id: 'surdez', nome: 'Surdez total', desc: 'Nenhum som chega. Só as pistas visuais contam.', modo: 'silencio' },
];

export function montarConfig(preset, op) {
  const canal = (lado) => {
    if (preset.modo === 'silencio') return { modo: 'silencio' };
    if (preset.unilateral) {
      return lado === 'dir'
        ? { modo: 'perda', perda: { audiograma: { 250: 100, 500: 110, 1000: 120, 8000: 120 }, recrutamento: true, espalhamento: 1 } }
        : { modo: 'normal' };
    }
    if (preset.ic) return { modo: 'ic', ic: { ...preset.ic } };
    if (preset.aud) {
      return { modo: 'perda', perda: { audiograma: { ...preset.aud }, recrutamento: op.recrutamento, espalhamento: op.espalhamento } };
    }
    return { modo: 'normal' };
  };
  let esquerda = canal('esq');
  let direita = canal('dir');
  if (!preset.unilateral && op.lado === 'esq') direita = { modo: 'normal' };
  if (!preset.unilateral && op.lado === 'dir') esquerda = { modo: 'normal' };
  return {
    esquerda,
    direita,
    nivelReferencia: op.nivelReferencia,
    ativo: op.ativo,
    mono: op.mono,
    balanco: op.balanco,
    nome: preset.id === 'normal' ? '' : preset.nome,
  };
}

export class ModuloSimulador {
  constructor() {
    this.id = 'simulador';
    this.nome = 'Simulador';
    const salvo = lerPreferencia('simulador', null);
    this.presetId = (salvo && salvo.presetId) || 'normal';
    this.op = {
      recrutamento: true,
      espalhamento: 1,
      nivelReferencia: 95,
      ativo: true,
      lado: 'ambos',
      mono: false,
      balanco: 0,
      ...((salvo && salvo.op) || {}),
    };
    this.tocador = null;
  }

  preset() {
    return PRESETS.find((p) => p.id === this.presetId) || PRESETS[0];
  }

  aplicar() {
    const app = this.app;
    const config = montarConfig(this.preset(), this.op);
    app.motor.configurarSimulador(config);
    salvarPreferencia('simulador', { presetId: this.presetId, op: this.op, config });
    app.painel.marcarSujo();
  }

  async tocarMusica() {
    const app = this.app;
    if (!this.tocador) this.tocador = new TocadorMusica(app);
    if (this.tocador.tocando) {
      this.tocador.parar();
      app.painel.marcarSujo();
      return;
    }
    await this.tocador.carregar('exemplo');
    this.tocador.definirVolumeGeral(0.7);
    await this.tocador.tocar({ espacial: false });
    app.painel.marcarSujo();
  }

  async tocarVoz() {
    const app = this.app;
    const cab = app.mundoParaSala(app.posicaoCabeca());
    const frente = app.direcaoOlhar();
    const local = app.mundoParaSala(app.posicaoCabeca().addScaledVector(frente, 1.2));
    local.y = cab.y;
    const reg = await app.adicionarFonte({ itemId: 'voz-um-dois-tres', local, loop: false, volume: 1 });
    reg.fonte.aoTerminar = () => setTimeout(() => app.removerFonte(reg), 100);
    reg.fonte.tocar();
  }

  sair() {
    // A simulação continua ligada ao sair (de propósito): dá para ouvir os outros módulos com ela.
  }

  desenhar(p, a) {
    const app = this.app;
    titulo(p, a, 'Simulador de audição');
    const cols = 4;
    const bw = (a.w - 3 * 10) / cols;
    PRESETS.forEach((pr, i) => {
      const c = i % cols;
      const l = Math.floor(i / cols);
      p.botao(`sim-${pr.id}`, a.x + c * (bw + 10), a.y + 56 + l * 62, bw, 52, pr.nome, () => {
        this.presetId = pr.id;
        this.aplicar();
      }, { variante: pr.id === this.presetId ? 'ativo' : 'secundario', tamanho: 18 });
    });
    let y = a.y + 56 + 3 * 62;
    const pr = this.preset();
    p.texto(pr.desc, a.x, y + 22, { fonte: FONTE.texto(21), cor: COR.tinta, maxLargura: a.w });
    y += 40;
    // Comparação rápida e sons de teste
    p.botao('sim-ab', a.x, y, 290, 56, this.op.ativo ? 'Ouvindo: SIMULADO' : 'Ouvindo: NORMAL', () => {
      this.op.ativo = !this.op.ativo;
      this.aplicar();
    }, { variante: this.op.ativo ? 'primario' : 'secundario', tamanho: 21 });
    p.botao('sim-musica', a.x + 302, y, 200, 56, this.tocador && this.tocador.tocando ? 'Parar música' : 'Tocar música', () => this.tocarMusica(), { tamanho: 19 });
    p.botao('sim-voz', a.x + 514, y, a.w - 514, 56, 'Voz à frente', () => this.tocarVoz(), { tamanho: 19 });
    y += 70;
    if (!this.ajustes) {
      p.botao('sim-ajustes', a.x, y, 300, 52, 'Ajustes finos', () => {
        this.ajustes = true;
        p.marcarSujo();
      }, { tamanho: 20 });
      p.textoQuebrado('Recrutamento, largura das bandas, orelha, áudio mono e nível de referência.', a.x + 320, y + 22, a.w - 320, 26, { fonte: FONTE.texto(18), cor: COR.carvao });
      p.texto('Aproximação didática para conferir a mixagem. Não mostra como uma pessoa surda ouve.', a.x, a.y + a.h - 2, { fonte: FONTE.texto(18), cor: COR.carvao, maxLargura: a.w });
      return;
    }
    p.botao('sim-ajustes-fechar', a.x + a.w - 210, a.y + 4, 210, 44, 'Esconder ajustes', () => {
      this.ajustes = false;
      p.marcarSujo();
    }, { tamanho: 17 });
    subtitulo(p, a.x, y + 30, 'Recrutamento');
    grupoBotoes(p, 'sim-rec', a.x + 190, y, 200, 46, [[true, 'Sim'], [false, 'Não']], this.op.recrutamento, (v) => {
      this.op.recrutamento = v;
      this.aplicar();
    }, { tamanho: 19 });
    subtitulo(p, a.x + 412, y + 30, 'Bandas');
    grupoBotoes(p, 'sim-esp', a.x + 510, y, a.w - 510, 46, [[1, '1x'], [2, '2x'], [3, '3x']], this.op.espalhamento, (v) => {
      this.op.espalhamento = v;
      this.aplicar();
    }, { tamanho: 19 });
    y += 56;
    subtitulo(p, a.x, y + 30, 'Orelha');
    grupoBotoes(p, 'sim-lado', a.x + 190, y, 300, 46, [['ambos', 'As duas'], ['esq', 'Esq.'], ['dir', 'Dir.']], this.op.lado, (v) => {
      this.op.lado = v;
      this.aplicar();
    }, { tamanho: 19 });
    p.botao('sim-mono', a.x + 506, y, a.w - 506, 46, this.op.mono ? 'Áudio mono: sim' : 'Áudio mono: não', () => {
      this.op.mono = !this.op.mono;
      this.aplicar();
    }, { variante: this.op.mono ? 'ativo' : 'secundario', tamanho: 19 });
    y += 58;
    p.slider('sim-ref', a.x, y, a.w, 62, 'Nível de referência do som cheio', this.op.nivelReferencia, 70, 110, (v) => {
      this.op.nivelReferencia = Math.round(v);
      this.aplicar();
    }, { formatar: (v) => `${Math.round(v)} dB SPL`, passo: 1 });
    p.texto('Aproximação didática para conferir a mixagem. Não mostra como uma pessoa surda ouve.', a.x, a.y + a.h - 2, {
      fonte: FONTE.texto(18),
      cor: COR.carvao,
      maxLargura: a.w,
    });
  }
}
