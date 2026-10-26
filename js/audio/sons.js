// Sons gerados por código (sem arquivos), para o laboratório funcionar antes de o Luigi carregar os dele.
// Todos são de exemplo: o som final do jogo é do sound designer.

const DOIS_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// Ferramentas de síntese
// ---------------------------------------------------------------------------
function rbj(tipo, f, q, taxa) {
  const w0 = (DOIS_PI * Math.min(f, taxa * 0.49)) / taxa;
  const cw = Math.cos(w0);
  const sw = Math.sin(w0);
  const alfa = sw / (2 * q);
  let b0;
  let b1;
  let b2;
  const a0 = 1 + alfa;
  if (tipo === 'passa-baixas') {
    b0 = (1 - cw) / 2;
    b1 = 1 - cw;
    b2 = (1 - cw) / 2;
  } else if (tipo === 'passa-altas') {
    b0 = (1 + cw) / 2;
    b1 = -(1 + cw);
    b2 = (1 + cw) / 2;
  } else {
    // passa-faixa com ganho de pico 0 dB
    b0 = alfa;
    b1 = 0;
    b2 = -alfa;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cw) / a0, a2: (1 - alfa) / a0 };
}

class Filtro {
  constructor(tipo, f, q, taxa) {
    this.taxa = taxa;
    this.tipo = tipo;
    this.q = q;
    this.definir(f);
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  definir(f) {
    this.c = rbj(this.tipo, f, this.q, this.taxa);
  }
  passo(x) {
    const c = this.c;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function ruidoBranco() {
  return Math.random() * 2 - 1;
}

// Ruído rosa (filtro de Paul Kellet).
function criarRuidoRosa() {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return () => {
    const w = ruidoBranco();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const s = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return s * 0.11;
  };
}

function criarRuidoMarrom() {
  let ultimo = 0;
  return () => {
    ultimo = (ultimo + 0.02 * ruidoBranco()) / 1.02;
    return ultimo * 3.5;
  };
}

function normalizar(dados, pico = 0.8) {
  let m = 0;
  for (let i = 0; i < dados.length; i++) m = Math.max(m, Math.abs(dados[i]));
  if (m > 0) {
    const g = pico / m;
    for (let i = 0; i < dados.length; i++) dados[i] *= g;
  }
  return dados;
}

function rampas(dados, taxa, entrada = 0.005, saida = 0.01) {
  const nE = Math.floor(entrada * taxa);
  const nS = Math.floor(saida * taxa);
  for (let i = 0; i < nE && i < dados.length; i++) dados[i] *= i / nE;
  for (let i = 0; i < nS && i < dados.length; i++) dados[dados.length - 1 - i] *= i / nS;
  return dados;
}

// Junta o fim no começo com uma transição suave, para o som repetir sem emenda.
function emendarLoop(dados, taxa, seg = 0.08) {
  const n = Math.floor(seg * taxa);
  const total = dados.length - n;
  const saida = new Float32Array(total);
  saida.set(dados.subarray(0, total));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    saida[i] = dados[i] * t + dados[total + i] * (1 - t);
  }
  return saida;
}

function paraBuffer(ctx, dados, taxa) {
  const b = ctx.createBuffer(1, dados.length, taxa);
  b.copyToChannel(dados, 0);
  return b;
}

// ---------------------------------------------------------------------------
// Efeitos e ambiências
// ---------------------------------------------------------------------------
function gerarLareira(taxa, seg = 6) {
  const extra = 0.08;
  const n = Math.floor((seg + extra) * taxa);
  const d = new Float32Array(n);
  const marrom = criarRuidoMarrom();
  const rosa = criarRuidoRosa();
  const pb = new Filtro('passa-baixas', 600, 0.7, taxa);
  const bp = new Filtro('passa-faixa', 500, 0.8, taxa);
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const mod = 0.7 + 0.15 * Math.sin(DOIS_PI * 0.31 * t) + 0.1 * Math.sin(DOIS_PI * 0.73 * t + 1) + 0.05 * Math.sin(DOIS_PI * 1.7 * t);
    d[i] = 0.25 * pb.passo(marrom()) * mod + 0.18 * bp.passo(rosa()) * (0.6 + 0.4 * Math.sin(DOIS_PI * 0.5 * t));
  }
  // Estalos: rajadas curtas de ruído agudo. Os que passam do fim voltam para o começo.
  const pa = new Filtro('passa-altas', 2200, 0.7, taxa);
  const total = Math.floor(seg * taxa);
  let t = 0;
  while (t < seg) {
    t += -Math.log(1 - Math.random()) / 7;
    const ini = Math.floor(t * taxa);
    const dur = Math.floor((0.001 + Math.random() * 0.006) * taxa);
    const amp = 0.15 + Math.random() * 0.6;
    const tau = (0.001 + Math.random() * 0.003) * taxa;
    for (let j = 0; j < dur * 4; j++) {
      const idx = (ini + j) % total;
      d[idx] += amp * pa.passo(ruidoBranco()) * Math.exp(-j / tau);
    }
  }
  // Estouros graves ocasionais.
  const pb2 = new Filtro('passa-baixas', 900, 0.7, taxa);
  t = 0;
  while (t < seg) {
    t += -Math.log(1 - Math.random()) / 1.2;
    const ini = Math.floor(t * taxa);
    const tau = 0.012 * taxa;
    for (let j = 0; j < tau * 5; j++) {
      const idx = (ini + j) % total;
      d[idx] += 0.4 * pb2.passo(ruidoBranco()) * Math.exp(-j / tau);
    }
  }
  return normalizar(emendarLoop(d, taxa, extra), 0.7);
}

function gerarEspelho(taxa, seg = 4) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const parciais = [1318.5, 1975.5, 2637.0, 3322.4, 3951.1].map((f) => f + (Math.random() - 0.5) * 6);
  const amps = [1, 0.7, 0.5, 0.35, 0.25];
  const pa = new Filtro('passa-altas', 5000, 0.7, taxa);
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const env = Math.min(1, t / 0.8) * Math.min(1, (seg - t) / 1.2);
    const envSuave = env * env * (3 - 2 * env);
    const trem = 1 - 0.3 * (0.5 + 0.5 * Math.sin(DOIS_PI * 7 * t));
    let s = 0;
    for (let p = 0; p < parciais.length; p++) s += amps[p] * Math.sin(DOIS_PI * parciais[p] * t + p);
    d[i] = 0.12 * s * envSuave * trem + 0.05 * pa.passo(ruidoBranco()) * envSuave;
  }
  // Brilhos: pequenos sinos agudos em momentos aleatórios.
  let t = 0.1;
  while (t < seg - 0.3) {
    t += -Math.log(1 - Math.random()) / 14;
    const f = 3000 + Math.random() * 6000;
    const amp = 0.05 + Math.random() * 0.12;
    const ini = Math.floor(t * taxa);
    const tau = 0.04 * taxa;
    for (let j = 0; j < tau * 5 && ini + j < n; j++) d[ini + j] += amp * Math.sin((DOIS_PI * f * j) / taxa) * Math.exp(-j / tau);
  }
  return rampas(normalizar(d, 0.8), taxa, 0.01, 0.05);
}

function gerarPortal(taxa, seg = 3.2) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const bp = new Filtro('passa-faixa', 150, 2, taxa);
  const rosa = criarRuidoRosa();
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const prog = Math.min(1, t / 2.6);
    if (i % 32 === 0) bp.definir(150 * Math.pow(2500 / 150, prog));
    const envSopro = Math.sin(Math.PI * Math.min(1, t / 2.9));
    const rumor = (0.5 * Math.sin(DOIS_PI * 41 * t) + 0.35 * Math.sin(DOIS_PI * 55 * t) + 0.2 * Math.sin(DOIS_PI * 82.4 * t)) * (0.6 + 0.4 * Math.sin(DOIS_PI * 5 * t));
    d[i] = 1.6 * bp.passo(rosa()) * envSopro + 0.35 * rumor * prog * Math.min(1, (seg - t) / 0.4);
    // "Whoomp" final.
    if (t > 2.55) {
      const tt = t - 2.55;
      const f = 40 + 50 * Math.exp(-tt / 0.08);
      d[i] += 0.8 * Math.sin(DOIS_PI * f * tt) * Math.exp(-tt / 0.18);
    }
  }
  return rampas(normalizar(d, 0.9), taxa, 0.02, 0.05);
}

function gerarAsas(taxa, seg = 2) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const batidas = 12;
  const pb = new Filtro('passa-baixas', 1100, 0.8, taxa);
  const pa = new Filtro('passa-altas', 3000, 0.7, taxa);
  const ruido = new Float32Array(n);
  for (let i = 0; i < n; i++) ruido[i] = ruidoBranco();
  for (let b = 0; b < batidas; b++) {
    const ini = Math.floor((b * n) / batidas);
    const amp = 0.8 + 0.2 * Math.sin(b * 1.7);
    for (let j = 0; j < 0.16 * taxa; j++) {
      const idx = (ini + j) % n;
      const tt = j / taxa;
      const env = Math.min(1, tt / 0.015) * Math.exp(-tt / 0.07);
      d[idx] += amp * env * pb.passo(ruido[idx]);
      d[idx] += 0.35 * amp * env * pa.passo(ruido[(idx + 777) % n]) * (tt < 0.04 ? 1 : 0.3);
    }
  }
  return normalizar(d, 0.7);
}

function gerarPassos(taxa, seg = 2.2) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const pb = new Filtro('passa-baixas', 400, 0.7, taxa);
  const bp = new Filtro('passa-faixa', 2500, 1.5, taxa);
  for (let p = 0; p < 4; p++) {
    const ini = Math.floor((p * n) / 4);
    const amp = p % 2 === 0 ? 1 : 0.85;
    for (let j = 0; j < 0.25 * taxa; j++) {
      const idx = (ini + j) % n;
      const tt = j / taxa;
      const f = 55 + 35 * Math.exp(-tt / 0.03);
      d[idx] += amp * 0.6 * Math.sin(DOIS_PI * f * tt) * Math.exp(-tt / 0.04);
      d[idx] += amp * 0.4 * pb.passo(ruidoBranco()) * Math.exp(-tt / 0.025);
      if (tt > 0.06) d[idx] += amp * 0.2 * bp.passo(ruidoBranco()) * Math.exp(-(tt - 0.06) / 0.02);
    }
  }
  return normalizar(d, 0.8);
}

function gerarTesoura(taxa) {
  const seg = 0.7;
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const pa = new Filtro('passa-altas', 4000, 0.7, taxa);
  const bp = new Filtro('passa-faixa', 6000, 2, taxa);
  for (const t0 of [0.05, 0.33]) {
    const ini = Math.floor(t0 * taxa);
    for (let j = 0; j < 0.12 * taxa && ini + j < n; j++) {
      const tt = j / taxa;
      let s = tt < 0.002 ? 0.7 * pa.passo(ruidoBranco()) : 0;
      s += 0.3 * Math.sin(DOIS_PI * 3200 * tt) * Math.exp(-tt / 0.025);
      s += 0.2 * Math.sin(DOIS_PI * 5100 * tt) * Math.exp(-tt / 0.02);
      s += 0.15 * Math.sin(DOIS_PI * 7300 * tt) * Math.exp(-tt / 0.015);
      d[ini + j] += s;
    }
    // Lâmina deslizando entre os cortes.
    const iniS = Math.floor((t0 + 0.06) * taxa);
    for (let j = 0; j < 0.09 * taxa && iniS + j < n; j++) {
      const tt = j / taxa;
      d[iniS + j] += 0.12 * bp.passo(ruidoBranco()) * Math.sin((Math.PI * tt) / 0.09);
    }
  }
  return rampas(normalizar(d, 0.85), taxa, 0.001, 0.02);
}

function gerarAcerto(taxa) {
  const seg = 1.3;
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const notas = [1046.5, 1318.5, 1568.0];
  const razoes = [1, 2.76, 5.4];
  notas.forEach((f, idx) => {
    const ini = Math.floor(idx * 0.045 * taxa);
    for (let j = 0; ini + j < n; j++) {
      const tt = j / taxa;
      let s = 0;
      razoes.forEach((r, k) => {
        s += (1 / (k + 1)) * Math.sin(DOIS_PI * f * r * tt) * Math.exp(-tt / (0.45 / (k + 1)));
      });
      d[ini + j] += s * Math.min(1, tt / 0.003);
    }
  });
  return rampas(normalizar(d, 0.75), taxa, 0.001, 0.05);
}

function gerarErro(taxa) {
  const seg = 0.55;
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const env = Math.min(1, t / 0.01) * Math.exp(-t / 0.13);
    d[i] = env * (0.5 * Math.sin(DOIS_PI * 196 * t) + 0.5 * Math.sin(DOIS_PI * 207.6 * t) + 0.25 * Math.sin(DOIS_PI * 392 * t));
  }
  return rampas(normalizar(d, 0.6), taxa, 0.002, 0.05);
}

function gerarZumbido(taxa, seg = 4) {
  const extra = 0.1;
  const n = Math.floor((seg + extra) * taxa);
  const d = new Float32Array(n);
  const bp = new Filtro('passa-faixa', 800, 1.2, taxa);
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    d[i] =
      0.5 * Math.sin(DOIS_PI * 110 * t) +
      0.3 * Math.sin(DOIS_PI * 165.4 * t) +
      0.25 * Math.sin(DOIS_PI * 220.7 * t) * (0.7 + 0.3 * Math.sin(DOIS_PI * 0.5 * t)) +
      0.12 * bp.passo(ruidoBranco());
  }
  return normalizar(emendarLoop(d, taxa, extra), 0.5);
}

function gerarBumbo(taxa) {
  const seg = 0.5;
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const f = 45 + 75 * Math.exp(-t / 0.05);
    fase += (DOIS_PI * f) / taxa;
    d[i] = Math.sin(fase) * Math.exp(-t / 0.15) + (t < 0.001 ? 0.5 * ruidoBranco() : 0);
  }
  return rampas(normalizar(d, 0.9), taxa, 0.0005, 0.02);
}

// ---------------------------------------------------------------------------
// Sinais de teste
// ---------------------------------------------------------------------------
export function gerarTom(taxa, f, seg = 2, amp = 0.5) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = amp * Math.sin((DOIS_PI * f * i) / taxa);
  return rampas(d, taxa, 0.05, 0.05);
}

// Pulsos de um tom (4 por segundo): a pele percebe melhor pulsos do que um tom contínuo.
export function gerarPulsos(taxa, f, seg = 2, amp = 0.5, porSegundo = 4) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const periodo = taxa / porSegundo;
  const dur = 0.12 * taxa;
  for (let i = 0; i < n; i++) {
    const p = i % periodo;
    if (p < dur) {
      const env = 0.5 - 0.5 * Math.cos((DOIS_PI * p) / dur);
      d[i] = amp * env * Math.sin((DOIS_PI * f * i) / taxa);
    }
  }
  return d;
}

function gerarRuidoRosa(taxa, seg = 10) {
  const extra = 0.05;
  const n = Math.floor((seg + extra) * taxa);
  const d = new Float32Array(n);
  const r = criarRuidoRosa();
  for (let i = 0; i < n; i++) d[i] = r();
  return normalizar(emendarLoop(d, taxa, extra), 0.5);
}

function gerarRuidoCurto(taxa, seg = 0.25) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const r = criarRuidoRosa();
  for (let i = 0; i < n; i++) d[i] = r();
  return rampas(normalizar(d, 0.7), taxa, 0.01, 0.01);
}

export function gerarVarredura(taxa, f0 = 20, f1 = 20000, seg = 20, amp = 0.4) {
  const n = Math.floor(seg * taxa);
  const d = new Float32Array(n);
  const k = Math.log(f1 / f0);
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const fase = ((DOIS_PI * f0 * seg) / k) * (Math.exp((t / seg) * k) - 1);
    d[i] = amp * Math.sin(fase);
  }
  return rampas(d, taxa, 0.05, 0.05);
}

// Frequência instantânea da varredura no tempo t.
export function frequenciaVarredura(t, f0 = 20, f1 = 20000, seg = 20) {
  return f0 * Math.exp((t / seg) * Math.log(f1 / f0));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
// categoria: efeito | ambiente | teste | voz | musica
export const CATALOGO = [
  { id: 'lareira', nome: 'Lareira', legenda: 'fogo estalando', categoria: 'ambiente', loop: true, cor: '#f4b224', gerar: gerarLareira },
  { id: 'espelho', nome: 'Espelho chamando', legenda: 'brilho do espelho', categoria: 'efeito', loop: true, cor: '#74d0d8', gerar: gerarEspelho },
  { id: 'portal', nome: 'Portal da Aia', legenda: 'portal se abrindo', categoria: 'efeito', loop: false, cor: '#58c4c8', gerar: gerarPortal },
  { id: 'asas', nome: 'Asas do Pirikito', legenda: 'asas batendo', categoria: 'efeito', loop: true, cor: '#f799d1', gerar: gerarAsas },
  { id: 'passos', nome: 'Passos na pedra', legenda: 'passos', categoria: 'efeito', loop: true, cor: '#a9ac9d', gerar: gerarPassos },
  { id: 'tesoura', nome: 'Tesoura (barbeiro)', legenda: 'tesoura cortando', categoria: 'efeito', loop: false, cor: '#cfd736', gerar: gerarTesoura },
  { id: 'acerto', nome: 'Sinal certo', legenda: 'acerto', categoria: 'efeito', loop: false, cor: '#42b23c', gerar: gerarAcerto },
  { id: 'erro', nome: 'Sinal errado', legenda: 'tente de novo', categoria: 'efeito', loop: false, cor: '#d22027', gerar: gerarErro },
  { id: 'zumbido', nome: 'Círculo mágico', legenda: 'zumbido mágico', categoria: 'ambiente', loop: true, cor: '#ae7bff', gerar: gerarZumbido },
  { id: 'bumbo', nome: 'Bumbo', legenda: 'batida grave', categoria: 'efeito', loop: false, cor: '#ac2fed', gerar: gerarBumbo },
  { id: 'ruido-curto', nome: 'Ruído curto', legenda: 'ruído', categoria: 'teste', loop: false, cor: '#c7edfb', gerar: gerarRuidoCurto },
  { id: 'ruido-rosa', nome: 'Ruído rosa', legenda: 'ruído rosa', categoria: 'teste', loop: true, cor: '#f9c3e2', gerar: gerarRuidoRosa },
  { id: 'tom-500', nome: 'Tom 500 Hz', legenda: 'tom grave', categoria: 'teste', loop: true, cor: '#ebf5b8', gerar: (t) => gerarTom(t, 500, 2, 0.4) },
  { id: 'tom-4000', nome: 'Tom 4 kHz', legenda: 'tom agudo', categoria: 'teste', loop: true, cor: '#ebf5b8', gerar: (t) => gerarTom(t, 4000, 2, 0.3) },
  { id: 'voz-estou-aqui', nome: 'Voz: "Estou aqui"', legenda: 'voz: estou aqui', categoria: 'voz', loop: false, cor: '#15b0ff', arquivo: 'sons/voz-estou-aqui.wav' },
  { id: 'voz-um-dois-tres', nome: 'Voz: "Um, dois, três"', legenda: 'voz: um, dois, três', categoria: 'voz', loop: false, cor: '#15b0ff', arquivo: 'sons/voz-um-dois-tres.wav' },
  { id: 'voz-ola', nome: 'Voz: "Olá"', legenda: 'voz: olá', categoria: 'voz', loop: false, cor: '#15b0ff', arquivo: 'sons/voz-ola.wav' },
  { id: 'voz-atras-de-voce', nome: 'Voz: "Atrás de você"', legenda: 'voz: atrás de você', categoria: 'voz', loop: false, cor: '#15b0ff', arquivo: 'sons/voz-atras-de-voce.wav' },
];

export function gerarSom(ctx, item) {
  const taxa = ctx.sampleRate;
  const dados = item.gerar(taxa);
  return paraBuffer(ctx, dados, taxa);
}

export function bufferDeDados(ctx, dados) {
  return paraBuffer(ctx, dados, ctx.sampleRate);
}

// ---------------------------------------------------------------------------
// Música de exemplo em faixas separadas (stems), renderizada offline.
// 96 BPM, 8 compassos de 4 tempos, lá menor: Am F C G (duas vezes). Repete sem emenda.
// ---------------------------------------------------------------------------
export const MUSICA = {
  bpm: 96,
  compassos: 8,
  tempos: 4,
  faixas: [
    { id: 'bumbo', nome: 'Bumbo', pan: 0, ganho: 0.9, cor: '#ac2fed' },
    { id: 'percussao', nome: 'Percussão', pan: 0.15, ganho: 0.6, cor: '#f4b224' },
    { id: 'baixo', nome: 'Baixo', pan: 0, ganho: 0.75, cor: '#15b0ff' },
    { id: 'harmonia', nome: 'Harmonia', pan: -0.2, ganho: 0.45, cor: '#ae7bff' },
    { id: 'melodia', nome: 'Melodia', pan: 0.2, ganho: 0.6, cor: '#74d0d8' },
  ],
};

function notaHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export async function gerarMusica(taxa) {
  const batida = 60 / MUSICA.bpm;
  const compasso = batida * MUSICA.tempos;
  const duracao = compasso * MUSICA.compassos;
  const cauda = 1.5;
  const total = duracao + cauda;
  const nCanais = MUSICA.faixas.length;
  const ctx = new OfflineAudioContext({ numberOfChannels: nCanais, length: Math.ceil(total * taxa), sampleRate: taxa });
  const juntar = ctx.createChannelMerger(nCanais);
  juntar.connect(ctx.destination);
  const saidas = MUSICA.faixas.map((_, i) => {
    const g = ctx.createGain();
    g.channelCount = 1;
    g.channelCountMode = 'explicit';
    g.connect(juntar, 0, i);
    return g;
  });
  const [sBumbo, sPerc, sBaixo, sHarm, sMel] = saidas;

  // Ruído compartilhado para percussão.
  const ruido = ctx.createBuffer(1, Math.floor(taxa * 0.5), taxa);
  const rd = ruido.getChannelData(0);
  for (let i = 0; i < rd.length; i++) rd[i] = Math.random() * 2 - 1;

  const acordes = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ];
  const raizes = [45, 41, 48, 43]; // A2 F2 C3 G2

  for (let c = 0; c < MUSICA.compassos; c++) {
    const t0 = c * compasso;
    const acorde = acordes[c % 4];
    const raiz = raizes[c % 4];
    // Bumbo em todos os tempos (pulso claro).
    for (let b = 0; b < MUSICA.tempos; b++) {
      const t = t0 + b * batida;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(b === 0 ? 1 : 0.8, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(g).connect(sBumbo);
      osc.start(t);
      osc.stop(t + 0.5);
    }
    // Palma nos tempos 2 e 4; chocalho em colcheias.
    for (let b = 0; b < MUSICA.tempos * 2; b++) {
      const t = t0 + (b * batida) / 2;
      const ehPalma = b === 2 || b === 6;
      const src = ctx.createBufferSource();
      src.buffer = ruido;
      const f = ctx.createBiquadFilter();
      f.type = ehPalma ? 'bandpass' : 'highpass';
      f.frequency.value = ehPalma ? 1800 : 7000;
      f.Q.value = ehPalma ? 0.9 : 0.7;
      const g = ctx.createGain();
      const pico = ehPalma ? 0.9 : 0.18;
      const dec = ehPalma ? 0.16 : 0.04;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(pico, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      src.connect(f).connect(g).connect(sPerc);
      src.start(t, Math.random() * 0.2);
      src.stop(t + dec + 0.02);
      if (ehPalma) {
        const corpo = ctx.createOscillator();
        corpo.frequency.value = 185;
        const gc = ctx.createGain();
        gc.gain.setValueAtTime(0.0001, t);
        gc.gain.exponentialRampToValueAtTime(0.35, t + 0.003);
        gc.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        corpo.connect(gc).connect(sPerc);
        corpo.start(t);
        corpo.stop(t + 0.12);
      }
    }
    // Baixo em colcheias na fundamental.
    for (let b = 0; b < MUSICA.tempos * 2; b++) {
      const t = t0 + (b * batida) / 2;
      const f = notaHz(b === 7 ? raiz + 12 : raiz);
      const serra = ctx.createOscillator();
      serra.type = 'sawtooth';
      serra.frequency.value = f;
      const sub = ctx.createOscillator();
      sub.frequency.value = f;
      const filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.setValueAtTime(900, t);
      filtro.frequency.exponentialRampToValueAtTime(260, t + 0.2);
      filtro.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + batida / 2 - 0.01);
      const gs = ctx.createGain();
      gs.gain.value = 0.7;
      serra.connect(filtro).connect(g);
      sub.connect(gs).connect(g);
      g.connect(sBaixo);
      serra.start(t);
      sub.start(t);
      serra.stop(t + batida / 2);
      sub.stop(t + batida / 2);
    }
    // Harmonia: acorde sustentado com ataque lento.
    for (const nota of acorde) {
      for (const desafino of [-6, 0, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = notaHz(nota + 12);
        o.detune.value = desafino;
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 1400;
        filtro.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.35);
        g.gain.setValueAtTime(0.05, t0 + compasso - 0.25);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + compasso + 0.3);
        o.connect(filtro).connect(g).connect(sHarm);
        o.start(t0);
        o.stop(t0 + compasso + 0.35);
      }
    }
  }
  // Melodia: motivo na pentatônica de lá menor (notas MIDI, duração em tempos).
  const motivo = [
    [69, 1], [72, 0.5], [74, 0.5], [76, 1], [74, 1],
    [72, 1], [69, 1], [67, 1.5], [69, 0.5],
    [72, 1], [74, 0.5], [76, 0.5], [79, 1], [76, 1],
    [74, 1], [72, 1], [69, 2],
  ];
  let tm = 0;
  for (let rep = 0; rep < 2; rep++) {
    for (const [nota, dur] of motivo) {
      const t = tm * batida;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = notaHz(nota);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = notaHz(nota + 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.45, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.9, dur * batida * 1.4));
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(sMel);
      o.start(t);
      o2.start(t);
      o.stop(t + 1);
      o2.stop(t + 1);
      tm += dur;
    }
  }
  const render = await ctx.startRendering();
  // Dobra a cauda sobre o começo para o loop não ter emenda.
  const n = Math.round(duracao * taxa);
  const faixas = [];
  for (let c = 0; c < nCanais; c++) {
    const dados = render.getChannelData(c);
    const loop = new Float32Array(n);
    loop.set(dados.subarray(0, n));
    for (let i = n; i < dados.length; i++) loop[i - n] += dados[i];
    faixas.push(loop);
  }
  const batidas = [];
  for (let b = 0; b < MUSICA.compassos * MUSICA.tempos; b++) batidas.push(b * batida);
  return { faixas, duracao, batida, batidas };
}
