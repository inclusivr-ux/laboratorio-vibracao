// Medidor: loudness (LUFS, norma ITU-R BS.1770) e pico do que sai do laboratório, medido no próprio aparelho.
import { titulo, paragrafo, formatarDb } from './comum.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

export class ModuloMedidor {
  constructor() {
    this.id = 'medidor';
    this.nome = 'Medidor';
    this.ultimo = 0;
    this.dadosFreq = null;
  }

  atualizar(dt, t) {
    // Redesenha 8 vezes por segundo (redesenhar a placa toda a cada quadro pesa no Quest).
    if (t - this.ultimo > 0.125) {
      this.ultimo = t;
      this.app.painel.marcarSujo();
    }
  }

  desenhar(p, a) {
    const app = this.app;
    titulo(p, a, 'Medidor de loudness');
    const l = app.motor.leitura || {};
    const caixa = (x, rotulo, valor, sub) => {
      p.cartela(x, a.y + 58, 240, 132, { fundo: '#ffffff', raio: 16, espessura: 4 });
      p.texto(rotulo, x + 22, a.y + 92, { fonte: FONTE.forte(20), cor: COR.carvao });
      p.texto(valor, x + 22, a.y + 148, { fonte: FONTE.titulo(44), cor: COR.tinta });
      p.texto(sub, x + 22, a.y + 176, { fonte: FONTE.texto(17), cor: COR.carvao });
    };
    caixa(a.x, 'Momentâneo', formatarDb(l.momentaneo), 'LUFS · 0,4 s');
    caixa(a.x + 266, 'Curto prazo', formatarDb(l.curto), 'LUFS · 3 s');
    caixa(a.x + 532, 'Integrado', formatarDb(l.integrado), 'LUFS · desde zerar');
    let y = a.y + 214;
    const picoDb = l.pico > 0 ? 20 * Math.log10(l.pico) : -Infinity;
    const picoMaxDb = l.picoMax > 0 ? 20 * Math.log10(l.picoMax) : -Infinity;
    p.texto(`Pico: ${formatarDb(picoDb)} dBFS   ·   maior pico: ${formatarDb(picoMaxDb)} dBFS`, a.x, y, { fonte: FONTE.forte(22), cor: picoMaxDb > -1 ? COR.erro : COR.tinta });
    y += 18;
    // Barra do momentâneo (-40 a 0 LUFS) com a referência de -16 LUFS.
    const v = isFinite(l.momentaneo) ? (l.momentaneo + 40) / 40 : 0;
    p.barraNivel(a.x, y, a.w, 26, v, COR.cianoSignaria, [24 / 40]);
    p.texto('-16 LUFS', a.x + a.w * (24 / 40) - 40, y + 50, { fonte: FONTE.forte(16), cor: COR.carvao });
    y += 70;
    // Espectro do que está saindo
    const an = app.motor.analisadorSaida;
    if (an) {
      if (!this.dadosFreq) this.dadosFreq = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(this.dadosFreq);
      const taxa = app.motor.ctx.sampleRate;
      const nb = 48;
      const bw = a.w / nb;
      const h = 110;
      p.retangulo(a.x, y, a.w, h + 10, 12, 'rgba(35,31,32,0.08)', null);
      for (let b = 0; b < nb; b++) {
        const f0 = 20 * Math.pow(1000, b / nb);
        const f1 = 20 * Math.pow(1000, (b + 1) / nb);
        const k0 = Math.floor((f0 / taxa) * an.fftSize);
        const k1 = Math.max(k0 + 1, Math.floor((f1 / taxa) * an.fftSize));
        let m = 0;
        for (let k = k0; k < k1 && k < this.dadosFreq.length; k++) m = Math.max(m, this.dadosFreq[k]);
        const hb = (m / 255) * h;
        const g = p.g;
        g.fillStyle = f0 < 250 ? COR.roxo : f0 < 4000 ? COR.cianoSignaria : COR.lima;
        g.fillRect(a.x + b * bw + 1, y + h + 4 - hb, bw - 2, hb);
      }
      ['20 Hz', '100', '1 k', '10 k', '20 kHz'].forEach((rot, i) => {
        const fs = [20, 100, 1000, 10000, 20000][i];
        const x = a.x + (Math.log10(fs / 20) / 3) * a.w;
        p.texto(rot, Math.min(a.x + a.w - 60, x), y + h + 34, { fonte: FONTE.texto(16), cor: COR.carvao });
      });
      y += h + 46;
    }
    p.botao('med-zerar', a.x, y, 220, 54, 'Zerar integrado', () => app.motor.zerarMedidor(), { variante: 'primario', tamanho: 20 });
    paragrafo(
      p,
      a.x + 240,
      y + 22,
      a.w - 240,
      `Referência inicial para jogo portátil: −16 LUFS (±2), pico até −1 dB. Latência de saída: ${Math.round(app.motor.latenciaSaidaMs())} ms.`,
      18,
    );
  }
}
