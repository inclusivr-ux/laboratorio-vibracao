// Música e luz: tocar as faixas separadas, comparar mixes (original, essencial no estilo implante, só ritmo)
// e ver a música virar luz e movimento na sala (velas, runas, ondas no chão).
// As mãos não pulsam nem vibram: na LIBRAS elas são a língua (regra da equipe, 27/10/2026).
import * as THREE from 'three';
import { titulo, grupoBotoes, subtitulo } from './comum.js';
import { TocadorMusica } from './tocador-musica.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

// Fatores por papel da faixa (para a música de exemplo). Faixas do usuário: por posição.
const MIXES = {
  original: { bumbo: 1, percussao: 1, baixo: 1, harmonia: 1, melodia: 1 },
  essencial: { bumbo: 1.3, percussao: 1.15, baixo: 1.3, harmonia: 0.25, melodia: 1.6 },
  ritmo: { bumbo: 1.2, percussao: 1.1, baixo: 1, harmonia: 0, melodia: 0 },
};

export class ModuloMusica {
  constructor() {
    this.id = 'musica';
    this.nome = 'Música e luz';
    this.origem = 'exemplo';
    this.posicao = 'cabeca';
    this.mix = 'original';
    this.reacoes = { velas: true, ondas: true, espectro: false };
    this.tocador = null;
  }

  sair() {
    // A música continua se o usuário quiser trocar de aba (por exemplo, para o simulador).
  }

  async alternar() {
    const app = this.app;
    if (!this.tocador) this.tocador = new TocadorMusica(app);
    if (this.tocador.tocando) {
      this.tocador.parar();
      app.painel.marcarSujo();
      return;
    }
    try {
      await this.tocador.carregar(this.origem);
    } catch (e) {
      app.alerta(e.message || String(e));
      return;
    }
    this.aplicarMix();
    const espacial = this.posicao === 'mesa';
    const local = espacial ? app.ancora('maquete').add(new THREE.Vector3(0, 0.15, 0)) : null;
    await this.tocador.tocar({ espacial, local });
    app.legendas.mostrar('música', { duracao: 2 });
    app.painel.marcarSujo();
  }

  aplicarMix() {
    const t = this.tocador;
    if (!t || !t.musica) return;
    const fatores = MIXES[this.mix];
    t.musica.faixas.forEach((f, i) => {
      let fator = 1;
      if (fatores[f.id] !== undefined) fator = fatores[f.id];
      else if (this.mix !== 'original') fator = i === 0 ? 1.2 : 1; // faixas do usuário: a primeira é tratada como base
      t.volumes[i] = (f.ganho ?? 0.8) * fator;
    });
    t.aplicarVolumes();
  }

  async trocarPosicao(pos) {
    this.posicao = pos;
    if (this.tocador && this.tocador.tocando) {
      this.tocador.parar();
      await this.alternar();
    }
    this.app.painel.marcarSujo();
  }

  criarEspectro() {
    const app = this.app;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.espectro = {
      c,
      g: c.getContext('2d'),
      t,
      malha: new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false })),
      dados: null,
    };
    this.espectro.malha.position.set(0, 0.24, -1.0);
    this.espectro.malha.renderOrder = 203;
    app.camera.add(this.espectro.malha);
  }

  desenharEspectro() {
    const e = this.espectro;
    const an = this.app.motor.analisadorSaida;
    if (!an) return;
    if (!e.dados) e.dados = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(e.dados);
    const g = e.g;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = 'rgba(16,4,72,0.6)';
    g.fillRect(0, 0, 512, 128);
    const taxa = this.app.motor.ctx.sampleRate;
    const nb = 32;
    for (let b = 0; b < nb; b++) {
      const f0 = 40 * Math.pow(16000 / 40, b / nb);
      const f1 = 40 * Math.pow(16000 / 40, (b + 1) / nb);
      const k0 = Math.floor((f0 / taxa) * an.fftSize);
      const k1 = Math.max(k0 + 1, Math.floor((f1 / taxa) * an.fftSize));
      let m = 0;
      for (let k = k0; k < k1 && k < e.dados.length; k++) m = Math.max(m, e.dados[k]);
      const h = (m / 255) * 110;
      g.fillStyle = b < 6 ? '#ac2fed' : b < 16 ? '#74d0d8' : '#cfd736';
      g.fillRect(8 + b * 15.7, 120 - h, 12, h);
    }
    e.t.needsUpdate = true;
  }

  atualizar(dt) {
    const app = this.app;
    if (this.reacoes.espectro && !this.espectro) this.criarEspectro();
    if (this.espectro) {
      this.espectro.malha.visible = this.reacoes.espectro && !!(this.tocador && this.tocador.tocando);
      if (this.espectro.malha.visible) this.desenharEspectro();
    }
    if (!this.tocador || !this.tocador.tocando) return;
    const n = this.tocador.batidas();
    if (n > 0) {
      if (this.reacoes.velas) app.pulsoMusica = 1;
      if (this.reacoes.ondas) {
        const pes = app.mundoParaSala(app.posicaoCabeca());
        pes.y = 0;
        app.ondas.disparar(pes, 0.8);
      }
    }
  }

  desenhar(p, a) {
    const app = this.app;
    titulo(p, a, 'Música e luz');
    const tocando = this.tocador && this.tocador.tocando;
    p.botao('mus-tocar', a.x + a.w - 220, a.y, 220, 52, tocando ? 'Parar' : 'Tocar', () => this.alternar(), { variante: 'primario', tamanho: 22 });
    let y = a.y + 96;
    const temFaixas = app.biblioteca.faixasDoUsuario().length;
    subtitulo(p, a.x, y + 6, 'Música');
    grupoBotoes(p, 'mus-origem', a.x + 130, y - 24, a.w - 130, 48, [['exemplo', 'Exemplo (gerada)'], ['usuario', temFaixas ? `Suas faixas (${temFaixas})` : 'Suas faixas (0)']], this.origem, (v) => {
      if (v === 'usuario' && !temFaixas) {
        app.alerta('Marque "faixa" nos seus arquivos, na página do laboratório.');
        return;
      }
      this.origem = v;
      if (this.tocador && this.tocador.tocando) this.tocador.parar();
      p.marcarSujo();
    }, { tamanho: 18 });
    y += 56;
    subtitulo(p, a.x, y + 6, 'Onde');
    grupoBotoes(p, 'mus-pos', a.x + 130, y - 24, a.w - 130, 48, [['cabeca', 'Presa à cabeça'], ['mesa', 'Na mesa (3D)']], this.posicao, (v) => this.trocarPosicao(v), { tamanho: 18 });
    y += 56;
    subtitulo(p, a.x, y + 6, 'Mix');
    grupoBotoes(p, 'mus-mix', a.x + 130, y - 24, a.w - 130, 48, [['original', 'Original'], ['essencial', 'Essencial (implante)'], ['ritmo', 'Só ritmo']], this.mix, (v) => {
      this.mix = v;
      this.aplicarMix();
      p.marcarSujo();
    }, { tamanho: 17 });
    y += 42;
    // Faixas
    const t = this.tocador;
    if (t && t.musica) {
      const faixas = t.musica.faixas;
      const linha = Math.min(46, 230 / faixas.length);
      faixas.forEach((f, i) => {
        const yy = y + i * linha;
        const mudo = t.mudos[i];
        p.botao(`mus-mudo-${i}`, a.x, yy, 240, linha - 6, `${mudo ? 'Ligar' : 'Calar'}: ${f.nome}`, () => {
          t.definirMudo(i, !mudo);
          p.marcarSujo();
        }, { variante: mudo ? 'secundario' : 'ativo', tamanho: 16 });
        p.barraNivel(a.x + 256, yy + (linha - 6) / 2 - 8, a.w - 256, 16, Math.min(1, (t.volumes[i] || 0) / 1.4), f.cor || COR.cianoSignaria);
      });
      y += faixas.length * linha + 6;
    } else {
      p.texto('Toque em Tocar para carregar as faixas.', a.x, y + 26, { fonte: FONTE.texto(20), cor: COR.carvao });
      y += 46;
    }
    subtitulo(p, a.x, y + 30, 'Reações');
    const rs = [
      ['velas', 'Velas e runas'],
      ['ondas', 'Ondas no chão'],
      ['espectro', 'Espectro (HUD)'],
    ];
    const rw = (a.w - 130 - 2 * 8) / 3;
    rs.forEach(([k, rot], i) => {
      p.botao(`mus-r-${k}`, a.x + 130 + i * (rw + 8), y, rw, 46, rot, () => {
        this.reacoes[k] = !this.reacoes[k];
        p.marcarSujo();
      }, { variante: this.reacoes[k] ? 'ativo' : 'secundario', tamanho: 16 });
    });
  }
}
