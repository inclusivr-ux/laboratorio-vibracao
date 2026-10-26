// Toca as faixas (stems) de uma música em sincronia e informa as batidas para as luzes e a vibração.

export class TocadorMusica {
  constructor(app) {
    this.app = app;
    this.musica = null;
    this.regs = [];
    this.tocando = false;
    this.inicio = 0;
    this.ultimoTempo = 0;
    this.mudos = [];
    this.volumes = [];
    this.volumeGeral = 0.8;
    // Detecção de batidas para músicas sem grade conhecida.
    this.energiaMedia = 0;
    this.ultimaBatidaTela = 0;
    this.dadosFreq = null;
  }

  async carregar(origem = 'exemplo') {
    const b = this.app.biblioteca;
    if (!this.app.motor.pronto) await this.app.iniciarAudio();
    const m = origem === 'usuario' ? await b.obterMusicaUsuario() : await b.obterMusicaExemplo();
    if (!m) throw new Error('Nenhuma faixa marcada como "faixa da música" na página.');
    this.parar();
    this.musica = m;
    this.mudos = m.faixas.map(() => false);
    this.volumes = m.faixas.map((f) => f.ganho ?? 0.8);
    return m;
  }

  async tocar({ espacial = false, local = null } = {}) {
    if (!this.musica) await this.carregar('exemplo');
    this.pararFontes();
    const app = this.app;
    for (let i = 0; i < this.musica.faixas.length; i++) {
      const f = this.musica.faixas[i];
      const reg = await app.adicionarFonte({
        buffer: f.buffer,
        loop: true,
        volume: this.volumeEfetivo(i),
        espacial,
        local,
        pan: espacial ? 0 : f.pan,
        barramento: 'musica',
        marcador: espacial && i === 0,
        semLegenda: true,
        nome: f.nome,
        cor: f.cor,
        envioSala: espacial ? 0.25 : 0.05,
      });
      this.regs.push(reg);
    }
    const t0 = app.motor.ctx.currentTime + 0.12;
    for (const r of this.regs) r.fonte.tocar({ quando: t0 });
    this.inicio = t0;
    this.ultimoTempo = -1;
    this.tocando = true;
  }

  volumeEfetivo(i) {
    return this.mudos[i] ? 0 : this.volumes[i] * this.volumeGeral;
  }

  aplicarVolumes() {
    this.regs.forEach((r, i) => r.fonte.definirVolume(this.volumeEfetivo(i)));
  }

  definirMudo(i, mudo) {
    this.mudos[i] = mudo;
    this.aplicarVolumes();
  }

  definirVolume(i, v) {
    this.volumes[i] = v;
    this.aplicarVolumes();
  }

  definirVolumeGeral(v) {
    this.volumeGeral = v;
    this.aplicarVolumes();
  }

  pararFontes() {
    for (const r of this.regs) this.app.removerFonte(r);
    this.regs = [];
  }

  parar() {
    this.pararFontes();
    this.tocando = false;
  }

  // Tempo (no relógio de áudio) do som que está saindo agora.
  tempoOuvido() {
    const ctx = this.app.motor.ctx;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime) return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  // Devolve quantas batidas passaram desde a última chamada (0, 1...) e a força.
  batidas() {
    if (!this.tocando || !this.musica) return 0;
    if (!this.musica.batidas) return this.detectarBatida() ? 1 : 0;
    const dur = this.musica.duracao;
    const t = this.tempoOuvido() - this.inicio;
    if (t < 0) return 0;
    const tm = t % dur;
    const ant = this.ultimoTempo;
    this.ultimoTempo = tm;
    if (ant < 0) return 0;
    let n = 0;
    for (const b of this.musica.batidas) {
      if (ant <= tm) {
        if (b > ant && b <= tm) n++;
      } else if (b > ant || b <= tm) n++;
    }
    // Se o bumbo estiver mudo, as batidas continuam: o ritmo existe mesmo sem som.
    return n;
  }

  detectarBatida() {
    const an = this.app.motor.analisadorMusica;
    if (!an) return false;
    if (!this.dadosFreq) this.dadosFreq = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(this.dadosFreq);
    const taxa = this.app.motor.ctx.sampleRate;
    const binHz = taxa / an.fftSize;
    const k0 = Math.max(1, Math.floor(40 / binHz));
    const k1 = Math.max(k0 + 1, Math.ceil(160 / binHz));
    let e = 0;
    for (let k = k0; k <= k1; k++) e += this.dadosFreq[k];
    e /= k1 - k0 + 1;
    this.energiaMedia = this.energiaMedia * 0.94 + e * 0.06;
    const agora = performance.now();
    if (e > 60 && e > this.energiaMedia * 1.35 && agora - this.ultimaBatidaTela > 260) {
      this.ultimaBatidaTela = agora;
      return true;
    }
    return false;
  }
}
