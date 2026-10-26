// Motor de áudio do laboratório.
//
// Caminho do som:
//   fontes -> barramentos (música, efeitos, ambiente, interface) -> mix
//   fontes -> envio de sala -> reverberação -> mix
//   mix -> simulador de audição (AudioWorklet) -> volume geral -> limitador -> saída
//
// O som 3D usa o PannerNode do navegador com HRTF (ou panorâmica simples, para comparar).

export const SALAS = {
  seca: { nome: 'Seca', rt60: 0, preAtraso: 0 },
  pequena: { nome: 'Sala pequena', rt60: 0.35, preAtraso: 0.005 },
  maga: { nome: 'Sala da Maga', rt60: 1.1, preAtraso: 0.012 },
  salao: { nome: 'Salão de pedra', rt60: 2.0, preAtraso: 0.02 },
  catedral: { nome: 'Catedral', rt60: 3.8, preAtraso: 0.035 },
};

export const BARRAMENTOS = ['musica', 'efeitos', 'ambiente', 'interface'];

function gerarRespostaSala(ctx, { rt60, preAtraso }) {
  const taxa = ctx.sampleRate;
  const dur = Math.max(0.1, rt60 * 1.2);
  const n = Math.floor((dur + preAtraso) * taxa);
  const buf = ctx.createBuffer(2, n, taxa);
  const ini = Math.floor(preAtraso * taxa);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let pb = 0;
    for (let i = ini; i < n; i++) {
      const t = (i - ini) / taxa;
      const env = Math.exp((-6.91 * t) / rt60);
      // Os agudos morrem mais rápido: o filtro fecha com o tempo.
      const a = Math.min(0.97, 0.15 + (t / rt60) * 0.8);
      pb = a * pb + (1 - a) * (Math.random() * 2 - 1);
      d[i] = pb * env;
    }
    // Primeiras reflexões.
    for (let r = 0; r < 6; r++) {
      const idx = ini + Math.floor((0.003 + Math.random() * 0.04) * taxa);
      if (idx < n) d[idx] += (Math.random() > 0.5 ? 1 : -1) * (0.5 - r * 0.06);
    }
  }
  // Normaliza a energia da resposta.
  let e = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) e += d[i] * d[i];
  }
  const g = 1 / Math.sqrt(e / 2 + 1e-12);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] *= g * 0.6;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Fonte sonora (pode ser espacial ou presa à cabeça)
// ---------------------------------------------------------------------------
export class FonteSonora {
  constructor(motor, opcoes = {}) {
    this.motor = motor;
    const ctx = motor.ctx;
    this.id = opcoes.id || `fonte-${Math.random().toString(36).slice(2, 8)}`;
    this.nome = opcoes.nome || 'Som';
    this.legenda = opcoes.legenda || this.nome;
    this.cor = opcoes.cor || '#74d0d8';
    this.buffer = opcoes.buffer || null;
    this.loop = !!opcoes.loop;
    this.espacial = opcoes.espacial !== false;
    this.barramento = opcoes.barramento || 'efeitos';
    this.tocando = false;
    this.fonte = null;
    this.posicao = { x: 0, y: 1.6, z: -1 };
    this.entrada = ctx.createGain();
    this.entrada.gain.value = opcoes.volume ?? 1;
    this.analisador = ctx.createAnalyser();
    this.analisador.fftSize = 512;
    this.amostrasNivel = new Float32Array(this.analisador.fftSize);
    this.entrada.connect(this.analisador);
    this.envio = ctx.createGain();
    this.envio.gain.value = opcoes.envioSala ?? 0.3;
    this.entrada.connect(this.envio);
    this.envio.connect(motor.salaEntrada);
    const destino = motor.barramentos[this.barramento] || motor.barramentos.efeitos;
    if (this.espacial) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = motor.modeloPanoramico;
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = opcoes.refDistancia ?? 1;
      this.panner.maxDistance = 100;
      this.panner.rolloffFactor = opcoes.atenuacao ?? 1;
      this.entrada.connect(this.panner);
      this.panner.connect(destino);
    } else {
      this.panEstereo = ctx.createStereoPanner();
      this.panEstereo.pan.value = opcoes.pan ?? 0;
      this.entrada.connect(this.panEstereo);
      this.panEstereo.connect(destino);
    }
    motor.fontes.add(this);
    this.aoTerminar = null;
  }

  tocar({ quando = 0, offset = 0 } = {}) {
    if (!this.buffer) return null;
    this.parar();
    const ctx = this.motor.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.connect(this.entrada);
    const t = quando > 0 ? quando : ctx.currentTime;
    src.start(t, offset % this.buffer.duration);
    this.fonte = src;
    this.tocando = true;
    this.inicio = t - offset;
    src.onended = () => {
      if (this.fonte === src) {
        this.tocando = false;
        this.fonte = null;
        if (this.aoTerminar) this.aoTerminar(this);
      }
    };
    return src;
  }

  parar(quando = 0) {
    if (this.fonte) {
      try {
        this.fonte.stop(quando);
      } catch {
        /* já parou */
      }
      if (!quando) {
        this.fonte.disconnect();
        this.fonte = null;
        this.tocando = false;
      }
    }
  }

  definirVolume(v) {
    this.entrada.gain.setTargetAtTime(Math.max(0, v), this.motor.ctx.currentTime, 0.02);
  }

  definirPosicao(x, y, z) {
    this.posicao.x = x;
    this.posicao.y = y;
    this.posicao.z = z;
    if (!this.panner) return;
    const p = this.panner;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
  }

  definirModelo(modelo) {
    if (this.panner) this.panner.panningModel = modelo;
  }

  // Nível RMS atual (0 a ~1), para os indicadores visuais.
  nivel() {
    this.analisador.getFloatTimeDomainData(this.amostrasNivel);
    let s = 0;
    for (let i = 0; i < this.amostrasNivel.length; i++) s += this.amostrasNivel[i] * this.amostrasNivel[i];
    // O analisador já está depois do volume da fonte.
    return Math.sqrt(s / this.amostrasNivel.length);
  }

  destruir() {
    this.parar();
    try {
      this.entrada.disconnect();
      this.envio.disconnect();
      if (this.panner) this.panner.disconnect();
      if (this.panEstereo) this.panEstereo.disconnect();
    } catch {
      /* nada */
    }
    this.motor.fontes.delete(this);
  }
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------
export class MotorAudio {
  constructor() {
    this.ctx = null;
    this.pronto = false;
    this.fontes = new Set();
    this.modeloPanoramico = 'HRTF';
    this.salaAtual = 'maga';
    this.leitura = { momentaneo: -Infinity, curto: -Infinity, integrado: -Infinity, pico: 0, picoMax: 0 };
    this.aoLer = null;
    this.somLigado = true;
    this.volumeGeral = 0.7;
    this.configSimulador = null;
  }

  async iniciar() {
    if (this.pronto) {
      if (this.ctx.state !== 'running') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    await ctx.audioWorklet.addModule(new URL('./processador-simulador.js', import.meta.url));
    await ctx.audioWorklet.addModule(new URL('./processador-medidor.js', import.meta.url));

    this.mix = ctx.createGain();
    this.barramentos = {};
    for (const nome of BARRAMENTOS) {
      const g = ctx.createGain();
      g.connect(this.mix);
      this.barramentos[nome] = g;
    }
    // Analisador da música antes da simulação (para luzes e vibração no tempo).
    this.analisadorMusica = ctx.createAnalyser();
    this.analisadorMusica.fftSize = 1024;
    this.analisadorMusica.smoothingTimeConstant = 0;
    this.barramentos.musica.connect(this.analisadorMusica);

    this.salaEntrada = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.salaRetorno = ctx.createGain();
    this.salaRetorno.gain.value = 0.55;
    this.salaEntrada.connect(this.convolver);
    this.convolver.connect(this.salaRetorno);
    this.salaRetorno.connect(this.mix);
    this.definirSala(this.salaAtual);

    this.simulador = new AudioWorkletNode(ctx, 'simulador-auditivo', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.simulador.port.onmessage = (e) => {
      if (e.data && e.data.tipo === 'erro') console.warn('Simulador:', e.data.mensagem);
    };
    this.mestre = ctx.createGain();
    this.mestre.gain.value = this.volumeGeral;
    this.limitador = ctx.createDynamicsCompressor();
    this.limitador.threshold.value = -3;
    this.limitador.knee.value = 0;
    this.limitador.ratio.value = 20;
    this.limitador.attack.value = 0.002;
    this.limitador.release.value = 0.12;
    this.mix.connect(this.simulador);
    this.simulador.connect(this.mestre);
    this.mestre.connect(this.limitador);
    this.limitador.connect(ctx.destination);

    this.analisadorSaida = ctx.createAnalyser();
    this.analisadorSaida.fftSize = 4096;
    this.analisadorSaida.smoothingTimeConstant = 0.6;
    this.limitador.connect(this.analisadorSaida);

    this.medidor = new AudioWorkletNode(ctx, 'medidor-lufs', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: 'explicit',
    });
    this.medidor.port.onmessage = (e) => {
      if (e.data && e.data.tipo === 'leitura') {
        this.leitura = e.data;
        if (this.aoLer) this.aoLer(e.data);
      }
    };
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    this.limitador.connect(this.medidor);
    this.medidor.connect(mudo);
    mudo.connect(ctx.destination);

    if (this.configSimulador) this.configurarSimulador(this.configSimulador);
    if (ctx.state !== 'running') await ctx.resume();
    this.pronto = true;
  }

  get agora() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // Converte um instante do relógio de áudio para o relógio da tela (performance.now, em ms),
  // levando em conta a latência de saída. Serve para luz e som baterem juntos.
  tempoAudioParaTela(tAudio) {
    const ctx = this.ctx;
    if (ctx && ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime) return ts.performanceTime + (tAudio - ts.contextTime) * 1000;
    }
    const lat = ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
    return performance.now() + (tAudio - (ctx ? ctx.currentTime : 0) + lat) * 1000;
  }

  // Inverso: um instante da tela no relógio de áudio (aproximado).
  tempoTelaParaAudio(tTela) {
    const ctx = this.ctx;
    if (ctx && ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime) return ts.contextTime + (tTela - ts.performanceTime) / 1000;
    }
    return ctx ? ctx.currentTime - (performance.now() - tTela) / 1000 : 0;
  }

  latenciaSaidaMs() {
    if (!this.ctx) return 0;
    return ((this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) * 1000;
  }

  criarFonte(opcoes) {
    return new FonteSonora(this, opcoes);
  }

  // Toca um som uma vez e descarta a fonte ao terminar.
  tocarUmaVez(buffer, opcoes = {}) {
    if (!this.pronto || !buffer) return null;
    const f = this.criarFonte({ ...opcoes, buffer, loop: false });
    if (opcoes.posicao) f.definirPosicao(opcoes.posicao.x, opcoes.posicao.y, opcoes.posicao.z);
    f.aoTerminar = () => setTimeout(() => f.destruir(), 50);
    f.tocar({ quando: opcoes.quando || 0 });
    return f;
  }

  definirModeloPanoramico(modelo) {
    this.modeloPanoramico = modelo === 'equalpower' ? 'equalpower' : 'HRTF';
    for (const f of this.fontes) f.definirModelo(this.modeloPanoramico);
  }

  definirSala(id) {
    this.salaAtual = SALAS[id] ? id : 'seca';
    if (!this.ctx) return;
    const sala = SALAS[this.salaAtual];
    if (sala.rt60 <= 0) {
      this.salaRetorno.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      return;
    }
    this.convolver.buffer = gerarRespostaSala(this.ctx, sala);
    this.salaRetorno.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.05);
  }

  definirVolumeBarramento(nome, v) {
    const g = this.barramentos && this.barramentos[nome];
    if (g) g.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.03);
  }

  definirVolumeGeral(v) {
    this.volumeGeral = Math.max(0, Math.min(1, v));
    this.aplicarMestre();
  }

  definirSomLigado(ligado) {
    this.somLigado = !!ligado;
    this.aplicarMestre();
  }

  aplicarMestre() {
    if (!this.mestre) return;
    const alvo = this.somLigado ? this.volumeGeral : 0;
    this.mestre.gain.setTargetAtTime(alvo, this.ctx.currentTime, 0.03);
  }

  configurarSimulador(config) {
    this.configSimulador = { ...(this.configSimulador || {}), ...config };
    if (this.simulador) this.simulador.port.postMessage({ tipo: 'config', config });
  }

  zerarMedidor() {
    if (this.medidor) this.medidor.port.postMessage({ tipo: 'zerar' });
  }

  // Atualiza a posição e a orientação de quem ouve a partir da matriz da câmera (three.js Matrix4).
  atualizarOuvinte(matriz) {
    if (!this.ctx) return;
    const e = matriz.elements;
    const l = this.ctx.listener;
    const px = e[12];
    const py = e[13];
    const pz = e[14];
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    const ux = e[4];
    const uy = e[5];
    const uz = e[6];
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = ux;
      l.upY.value = uy;
      l.upZ.value = uz;
    } else {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }
}
