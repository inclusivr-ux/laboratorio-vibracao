// Graves e vibração: dá para OUVIR e dá para SENTIR o grave nos alto-falantes do headset?
// Toca tons ou pulsos de 20 a 500 Hz (e varreduras) com volume controlado e anota as respostas.
import { titulo, paragrafo, grupoBotoes, subtitulo } from './comum.js';
import { gerarTom, gerarPulsos, gerarVarredura, frequenciaVarredura, bufferDeDados } from '../audio/sons.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

const FREQS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500];
const RESPOSTAS = [
  ['ouco', 'Ouço', '#74d0d8'],
  ['sinto', 'Sinto vibrar', '#f4b224'],
  ['ambos', 'Ouço e sinto', '#42b23c'],
  ['nada', 'Nada', '#c9c9bd'],
];

export class ModuloGraves {
  constructor() {
    this.id = 'graves';
    this.nome = 'Graves';
    this.idx = 0;
    this.respostas = {};
    this.nivelDb = -24;
    this.modo = 'pulsos';
    this.vibrarJunto = false;
    this.fonte = null;
    this.varredura = null;
    this.marcasVarredura = {};
  }

  sair() {
    this.parar();
  }

  parar() {
    if (this.fonte) {
      this.fonte.destruir();
      this.fonte = null;
    }
    this.varredura = null;
    this.app.painel.marcarSujo();
  }

  async tocar() {
    const app = this.app;
    if (!app.motor.pronto) await app.iniciarAudio();
    this.parar();
    const f = FREQS[this.idx];
    const amp = Math.pow(10, this.nivelDb / 20);
    const taxa = app.motor.ctx.sampleRate;
    const dados = this.modo === 'pulsos' ? gerarPulsos(taxa, f, 2.5, amp) : gerarTom(taxa, f, 2.5, amp);
    const buffer = bufferDeDados(app.motor.ctx, dados);
    this.fonte = app.motor.criarFonte({ buffer, espacial: false, barramento: 'efeitos', volume: 1, envioSala: 0 });
    this.fonte.aoTerminar = () => {
      this.fonte = null;
      app.painel.marcarSujo();
    };
    this.fonte.tocar();
    app.legendas.mostrar(`tom de ${f} Hz`, { duracao: 2.5 });
    if (this.vibrarJunto) this.vibrarControles();
    app.painel.marcarSujo();
  }

  vibrarControles() {
    const app = this.app;
    const forca = Math.min(1, Math.pow(10, this.nivelDb / 20) * 4);
    if (this.modo === 'pulsos') {
      for (let k = 0; k < 10; k++) setTimeout(() => app.interacao.pulsarLado('ambos', forca, 110), k * 250);
    } else {
      app.interacao.pulsarLado('ambos', forca, 2400);
    }
  }

  responder(r) {
    this.respostas[FREQS[this.idx]] = r;
    if (this.idx < FREQS.length - 1) this.idx++;
    this.parar();
    if (Object.keys(this.respostas).length === FREQS.length) this.salvar();
  }

  async iniciarVarredura(sentido) {
    const app = this.app;
    if (!app.motor.pronto) await app.iniciarAudio();
    this.parar();
    const taxa = app.motor.ctx.sampleRate;
    const seg = 20;
    const [f0, f1] = sentido === 'sobe' ? [20, 20000] : [20000, 20];
    const amp = Math.pow(10, this.nivelDb / 20);
    const buffer = bufferDeDados(app.motor.ctx, gerarVarredura(taxa, f0, f1, seg, amp));
    this.fonte = app.motor.criarFonte({ buffer, espacial: false, barramento: 'efeitos', volume: 1, envioSala: 0 });
    const t0 = app.motor.ctx.currentTime + 0.1;
    this.fonte.tocar({ quando: t0 });
    this.fonte.aoTerminar = () => {
      this.fonte = null;
      this.varredura = null;
      app.painel.marcarSujo();
    };
    this.varredura = { sentido, t0, f0, f1, seg };
    this.redesenharSempre = true;
    app.painel.marcarSujo();
  }

  freqVarreduraAgora() {
    const v = this.varredura;
    if (!v) return null;
    const ctx = this.app.motor.ctx;
    let tOuvido = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime) tOuvido = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    const t = Math.max(0, Math.min(v.seg, tOuvido - v.t0));
    return frequenciaVarredura(t, v.f0, v.f1, v.seg);
  }

  marcarVarredura() {
    const f = this.freqVarreduraAgora();
    if (!f || !this.varredura) return;
    const chave = this.varredura.sentido === 'sobe' ? 'graveMaisBaixo' : 'agudoMaisAlto';
    this.marcasVarredura[chave] = Math.round(f);
    this.parar();
    this.redesenharSempre = false;
    this.salvar();
  }

  salvar() {
    const app = this.app;
    const lista = FREQS.filter((f) => this.respostas[f]);
    const ouve = lista.filter((f) => ['ouco', 'ambos'].includes(this.respostas[f]));
    const sente = lista.filter((f) => ['sinto', 'ambos'].includes(this.respostas[f]));
    const partes = [];
    if (ouve.length) partes.push(`ouve a partir de ${ouve[0]} Hz`);
    if (sente.length) partes.push(`sente vibrar em ${sente.join(', ')} Hz`);
    else if (lista.length) partes.push('não sentiu vibração');
    if (this.marcasVarredura.graveMaisBaixo) partes.push(`varredura: grave mais baixo ${this.marcasVarredura.graveMaisBaixo} Hz`);
    if (this.marcasVarredura.agudoMaisAlto) partes.push(`agudo mais alto ${this.marcasVarredura.agudoMaisAlto} Hz`);
    app.registrarResultado('Graves e vibração', `${this.nivelDb} dBFS, ${this.modo}: ${partes.join('; ') || 'sem respostas'}`, {
      nivelDb: this.nivelDb,
      modo: this.modo,
      vibrarJunto: this.vibrarJunto,
      respostas: this.respostas,
      varredura: this.marcasVarredura,
      fone: 'anotar: alto-falantes do headset ou fone',
    });
  }

  aoEspaco() {
    if (this.varredura) this.marcarVarredura();
  }

  desenhar(p, a) {
    titulo(p, a, 'Graves e vibração');
    p.texto('Comece baixo. Volume alto com grave não faz vibrar: distorce e pode machucar.', a.x, a.y + 66, { fonte: FONTE.forte(19), cor: COR.erro, maxLargura: a.w });
    let y = a.y + 86;
    // Grade de frequências
    const cols = 8;
    const bw = (a.w - (cols - 1) * 6) / cols;
    FREQS.forEach((f, i) => {
      const c = i % cols;
      const l = Math.floor(i / cols);
      const r = this.respostas[f];
      const cor = r ? RESPOSTAS.find((x) => x[0] === r)[2] : null;
      const x = a.x + c * (bw + 6);
      const yy = y + l * 52;
      p.botao(`gr-f-${f}`, x, yy, bw, 44, `${f}`, () => {
        this.idx = i;
        this.parar();
      }, { variante: i === this.idx ? 'primario' : 'secundario', tamanho: 17 });
      if (cor) {
        const g = p.g;
        g.beginPath();
        g.arc(x + bw - 10, yy + 10, 8, 0, Math.PI * 2);
        g.fillStyle = cor;
        g.fill();
        g.strokeStyle = COR.contorno;
        g.lineWidth = 2;
        g.stroke();
      }
    });
    y += 110;
    const f = FREQS[this.idx];
    p.texto(`${f} Hz`, a.x, y + 34, { fonte: FONTE.titulo(40), cor: COR.tinta });
    p.botao('gr-tocar', a.x + 170, y, 170, 58, this.fonte && !this.varredura ? 'Parar' : 'Tocar', () => (this.fonte && !this.varredura ? this.parar() : this.tocar()), {
      variante: 'primario',
      tamanho: 22,
    });
    grupoBotoes(p, 'gr-modo', a.x + 356, y + 4, 260, 50, [['pulsos', 'Pulsos'], ['tom', 'Tom']], this.modo, (v) => {
      this.modo = v;
      p.marcarSujo();
    }, { tamanho: 19 });
    p.botao('gr-vibrar', a.x + 630, y + 4, a.w - 630, 50, this.vibrarJunto ? 'Controle: sim' : 'Controle: não', () => {
      this.vibrarJunto = !this.vibrarJunto;
      p.marcarSujo();
    }, { variante: this.vibrarJunto ? 'ativo' : 'secundario', tamanho: 16 });
    y += 72;
    const rw = (a.w - 3 * 10) / 4;
    RESPOSTAS.forEach(([id, rot], i) => {
      p.botao(`gr-r-${id}`, a.x + i * (rw + 10), y, rw, 58, rot, () => this.responder(id), { tamanho: 20 });
    });
    y += 74;
    p.slider('gr-nivel', a.x, y, a.w, 64, 'Nível digital do teste', this.nivelDb, -48, -6, (v) => {
      this.nivelDb = Math.round(v);
    }, { formatar: (v) => `${Math.round(v)} dBFS`, passo: 1 });
    y += 96;
    subtitulo(p, a.x, y, 'Varredura de 20 segundos: marque quando começar a ouvir', a.w);
    y += 14;
    if (this.varredura) {
      const fv = this.freqVarreduraAgora();
      p.botao('gr-agora', a.x, y, 360, 58, 'Comecei a ouvir!', () => this.marcarVarredura(), { variante: 'primario', tamanho: 22 });
      p.texto(fv ? `${Math.round(fv)} Hz` : '', a.x + 384, y + 40, { fonte: FONTE.titulo(32), cor: COR.tinta });
      p.botao('gr-parar-varredura', a.x + a.w - 160, y, 160, 58, 'Parar', () => this.parar(), { variante: 'perigo', tamanho: 20 });
    } else {
      const bw = (a.w - 12) / 2;
      p.botao('gr-sobe', a.x, y, bw, 58, 'Subindo: 20 Hz → 20 kHz', () => this.iniciarVarredura('sobe'), { tamanho: 19 });
      p.botao('gr-desce', a.x + bw + 12, y, bw, 58, 'Descendo: 20 kHz → 20 Hz', () => this.iniciarVarredura('desce'), { tamanho: 19 });
    }
    const m = this.marcasVarredura;
    const textoMarcas = [m.graveMaisBaixo ? `grave mais baixo: ${m.graveMaisBaixo} Hz` : '', m.agudoMaisAlto ? `agudo mais alto: ${m.agudoMaisAlto} Hz` : '']
      .filter(Boolean)
      .join('   ·   ');
    paragrafo(p, a.x, a.y + a.h - 8, a.w, textoMarcas || 'Anote se o teste foi nos alto-falantes do headset ou num fone.', 19);
  }
}
