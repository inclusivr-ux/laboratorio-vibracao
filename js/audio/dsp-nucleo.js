// Núcleo de processamento de sinal do Laboratório VibrAção.
// Sem dependências: é usado pelo processador de áudio (AudioWorklet) e pelos testes no Node.
//
// O simulador trabalha no domínio da frequência (STFT): cada quadro de áudio vira um espectro,
// o espectro é modificado (perda auditiva, implante coclear, silêncio) e volta a ser áudio.
// É uma APROXIMAÇÃO DIDÁTICA para conferir a mixagem, não a experiência real de uma pessoa.

// ---------------------------------------------------------------------------
// FFT complexa (radix-2, no lugar)
// ---------------------------------------------------------------------------
export class FFT {
  constructor(n) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT: o tamanho precisa ser potência de 2');
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      let x = i;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r;
    }
  }

  // Transformada no lugar. inversa=true não divide por n (quem chama divide).
  transformar(re, im, inversa = false) {
    const n = this.n;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    const sinal = inversa ? 1 : -1;
    for (let tam = 2; tam <= n; tam <<= 1) {
      const meio = tam >> 1;
      const passo = n / tam;
      for (let i = 0; i < n; i += tam) {
        for (let j = 0, k = 0; j < meio; j++, k += passo) {
          const wr = this.cos[k];
          const wi = sinal * this.sin[k];
          const a = i + j;
          const b = a + meio;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Tabelas e funções de audição
// ---------------------------------------------------------------------------

// Limiar de audibilidade em campo livre (ISO 226:2003), valores aproximados em dB SPL.
// Acima de 12,5 kHz a curva foi estendida de forma aproximada.
export const LIMIAR_ISO226 = [
  [20, 78.5], [25, 68.7], [31.5, 59.5], [40, 51.1], [50, 44.0], [63, 37.5], [80, 31.5],
  [100, 26.5], [125, 22.1], [160, 17.9], [200, 14.4], [250, 11.4], [315, 8.6], [400, 6.2],
  [500, 4.4], [630, 3.0], [800, 2.2], [1000, 2.4], [1250, 3.5], [1600, 1.7], [2000, -1.3],
  [2500, -4.2], [3150, -6.0], [4000, -5.4], [5000, -1.5], [6300, 6.0], [8000, 12.6],
  [10000, 13.9], [12500, 12.3], [16000, 40.0], [20000, 80.0],
];

// Interpolação linear em log2(f) numa tabela [[f, valor], ...] ordenada por f.
export function interpolarLogF(tabela, f) {
  if (f <= tabela[0][0]) return tabela[0][1];
  const ult = tabela[tabela.length - 1];
  if (f >= ult[0]) return ult[1];
  const lf = Math.log2(f);
  for (let i = 1; i < tabela.length; i++) {
    if (f <= tabela[i][0]) {
      const [f0, v0] = tabela[i - 1];
      const [f1, v1] = tabela[i];
      const t = (lf - Math.log2(f0)) / (Math.log2(f1) - Math.log2(f0));
      return v0 + t * (v1 - v0);
    }
  }
  return ult[1];
}

export function limiarNormal(f) {
  return interpolarLogF(LIMIAR_ISO226, Math.max(20, f));
}

// Largura de banda retangular equivalente (ERB) do filtro auditivo, em Hz (Glasberg e Moore, 1990).
export function erb(f) {
  return 24.7 * ((4.37 * f) / 1000 + 1);
}

// Função de Greenwood (posição na cóclea humana -> frequência). x = 0 no ápice, 1 na base.
export function greenwood(x) {
  return 165.4 * (Math.pow(10, 2.1 * x) - 0.88);
}
export function greenwoodInversa(f) {
  return Math.log10(f / 165.4 + 0.88) / 2.1;
}
export const COMPRIMENTO_COCLEA_MM = 35;

// Normaliza um audiograma {250: 20, 500: 30, ...} ou [[250,20],...] para [[f, dBNA], ...] ordenado.
export function normalizarAudiograma(aud) {
  if (!aud) return [[250, 0], [8000, 0]];
  const pares = Array.isArray(aud)
    ? aud.map(([f, v]) => [Number(f), Number(v)])
    : Object.entries(aud).map(([f, v]) => [Number(f), Number(v)]);
  pares.sort((a, b) => a[0] - b[0]);
  return pares;
}

// Ganho (dB) que a simulação aplica a uma banda.
//   nivelSL: nível de entrada acima do limiar normal (dB de sensação)
//   perda: perda auditiva naquela frequência (dB NA)
//   recrutamento: true = expande a faixa dinâmica (sons fracos somem, fortes continuam fortes)
// Modelo simplificado inspirado em Moore e Glasberg (1993): a faixa [perda, teto] do ouvido
// com perda é mapeada na faixa [0, teto] do ouvido normal.
export const TETO_DESCONFORTO_SL = 105;
export function ganhoPerdaDb(nivelSL, perda, recrutamento) {
  if (perda <= 0) return 0;
  if (!recrutamento) return -perda;
  const teto = TETO_DESCONFORTO_SL;
  if (perda >= teto - 5) return -90; // sem audição útil nessa faixa
  if (nivelSL <= perda) return -Math.min(90, perda + 25);
  const saida = ((nivelSL - perda) * teto) / (teto - perda);
  const ganho = saida - nivelSL;
  return Math.max(-90, Math.min(0, ganho));
}

// ---------------------------------------------------------------------------
// Configuração de um canal (orelha) do simulador
// ---------------------------------------------------------------------------
// modo: 'normal' | 'perda' | 'ic' | 'silencio'
// perda: { audiograma, recrutamento, espalhamento (1 = sem; 2 ou 3 = bandas 2x ou 3x mais largas) }
// ic: { canais, fMin, fMax, portadora: 'ruido'|'seno', deslocamentoMm, hibrido, fCorteHibrido, audiogramaResidual }
export const CANAL_PADRAO = Object.freeze({
  modo: 'normal',
  perda: { audiograma: { 250: 0, 8000: 0 }, recrutamento: true, espalhamento: 1 },
  ic: {
    canais: 8,
    fMin: 150,
    fMax: 8000,
    portadora: 'ruido',
    deslocamentoMm: 0,
    hibrido: false,
    fCorteHibrido: 500,
    audiogramaResidual: { 250: 50, 500: 70, 1000: 100, 8000: 120 },
  },
  ganhoDb: 0,
});

function mesclar(base, extra) {
  const r = JSON.parse(JSON.stringify(base));
  if (!extra) return r;
  for (const k of Object.keys(extra)) {
    if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && r[k] && typeof r[k] === 'object') {
      r[k] = { ...r[k], ...extra[k] };
    } else {
      r[k] = extra[k];
    }
  }
  return r;
}

// Prepara as tabelas de um canal para um tamanho de quadro e taxa.
class PreparoCanal {
  constructor(cfg, N, H, taxa, nivelReferencia) {
    this.cfg = mesclar(CANAL_PADRAO, cfg);
    this.N = N;
    this.H = H;
    this.taxa = taxa;
    this.K = N / 2 + 1;
    this.df = taxa / N;
    this.nivelReferencia = nivelReferencia;
    const quadrosPorSegundo = taxa / H;
    this.coefAtaque = Math.exp(-1 / (0.004 * quadrosPorSegundo));
    this.coefSoltura = Math.exp(-1 / (0.06 * quadrosPorSegundo));
    // O envelope do implante precisa acompanhar variações mais rápidas.
    this.coefAtaqueIC = Math.exp(-1 / (0.002 * quadrosPorSegundo));
    this.coefSolturaIC = Math.exp(-1 / (0.015 * quadrosPorSegundo));
    this.ganhoLinear = Math.pow(10, (this.cfg.ganhoDb || 0) / 20);
    if (this.cfg.modo === 'perda') this.prepararPerda(this.cfg.perda);
    if (this.cfg.modo === 'ic') this.prepararIC(this.cfg.ic);
  }

  // Bandas de 1/6 de oitava entre 40 Hz e Nyquist para estimar o nível local.
  criarBandas(fMinimo = 40) {
    const bandas = [];
    const nyq = this.taxa / 2;
    let f = fMinimo;
    const razao = Math.pow(2, 1 / 6);
    let kIni = 1;
    while (kIni < this.K - 1) {
      const fSup = f * razao;
      let kFim = Math.min(this.K - 1, Math.floor(fSup / this.df));
      if (kFim < kIni) kFim = kIni;
      const fc = Math.sqrt(Math.max(this.df, kIni * this.df) * Math.max(this.df, kFim * this.df));
      bandas.push({ kIni, kFim, fc });
      kIni = kFim + 1;
      f = Math.max(fSup, kIni * this.df);
      if (f > nyq) break;
    }
    return bandas;
  }

  prepararPerda(p) {
    this.audiograma = normalizarAudiograma(p.audiograma);
    this.recrutamento = p.recrutamento !== false;
    this.bandas = this.criarBandas();
    const B = this.bandas.length;
    this.perdaBanda = new Float64Array(B);
    this.limiarBanda = new Float64Array(B);
    for (let b = 0; b < B; b++) {
      const fc = this.bandas[b].fc;
      this.perdaBanda[b] = interpolarLogF(this.audiograma, fc);
      this.limiarBanda[b] = limiarNormal(fc);
    }
    this.nivelSuave = new Float64Array(B).fill(-120);
    this.ganhoBanda = new Float64Array(B);
    this.ganhoBin = new Float64Array(this.K);
    // Para cada bin: banda e peso de interpolação entre os centros das bandas vizinhas.
    this.binBandaA = new Int32Array(this.K);
    this.binBandaB = new Int32Array(this.K);
    this.binPeso = new Float64Array(this.K);
    const centros = this.bandas.map((bd) => Math.log2(bd.fc));
    for (let k = 0; k < this.K; k++) {
      const lf = Math.log2(Math.max(this.df * 0.5, k * this.df));
      let a = 0;
      while (a < B - 1 && centros[a + 1] < lf) a++;
      const b = Math.min(B - 1, a + 1);
      let t = 0;
      if (b !== a) t = Math.min(1, Math.max(0, (lf - centros[a]) / (centros[b] - centros[a])));
      if (lf <= centros[0]) t = 0;
      this.binBandaA[k] = a;
      this.binBandaB[k] = b;
      this.binPeso[k] = t;
    }
    // Espalhamento espectral (menos seletividade de frequência).
    this.espalhamento = Math.max(1, Number(p.espalhamento) || 1);
    if (this.espalhamento > 1) this.prepararEspalhamento(this.espalhamento);
    else this.nucleo = null;
  }

  prepararEspalhamento(s) {
    // Núcleo gaussiano por bin, com largura proporcional ao ERB naquela frequência.
    this.nucleo = [];
    for (let k = 0; k < this.K; k++) {
      const f = Math.max(this.df, k * this.df);
      const sigmaHz = 0.5 * (s - 1) * erb(f);
      const sigmaBins = Math.max(0.5, sigmaHz / this.df);
      const alcance = Math.min(80, Math.ceil(2.5 * sigmaBins));
      const ini = Math.max(1, k - alcance);
      const fim = Math.min(this.K - 2, k + alcance);
      const pesos = new Float64Array(Math.max(1, fim - ini + 1));
      let soma = 0;
      for (let j = ini; j <= fim; j++) {
        const d = (j - k) / sigmaBins;
        const w = Math.exp(-0.5 * d * d);
        pesos[j - ini] = w;
        soma += w;
      }
      for (let i = 0; i < pesos.length; i++) pesos[i] /= soma || 1;
      this.nucleo.push({ ini, fim, pesos });
    }
    this.potencia = new Float64Array(this.K);
  }

  prepararIC(ic) {
    const nyq = this.taxa / 2;
    const n = Math.max(1, Math.min(24, Math.round(ic.canais)));
    this.hibrido = !!ic.hibrido;
    const fCorte = this.hibrido ? Math.max(150, ic.fCorteHibrido || 500) : 0;
    const fMin = Math.max(ic.fMin || 150, this.hibrido ? fCorte : 0, this.df);
    const fMax = Math.min(ic.fMax || 8000, nyq * 0.95);
    const x0 = greenwoodInversa(fMin);
    const x1 = greenwoodInversa(fMax);
    const desloc = (ic.deslocamentoMm || 0) / COMPRIMENTO_COCLEA_MM;
    this.portadora = ic.portadora === 'seno' ? 'seno' : 'ruido';
    this.canais = [];
    for (let c = 0; c < n; c++) {
      const xa = x0 + ((x1 - x0) * c) / n;
      const xb = x0 + ((x1 - x0) * (c + 1)) / n;
      const fa = greenwood(xa);
      const fb = greenwood(xb);
      // Banda de síntese (deslocada para a base quando a inserção é rasa).
      const sa = Math.min(nyq * 0.98, greenwood(Math.min(1, xa + desloc)));
      const sb = Math.min(nyq * 0.99, greenwood(Math.min(1, xb + desloc)));
      const kA = Math.max(1, Math.round(fa / this.df));
      const kB = Math.max(kA, Math.round(fb / this.df) - 1);
      const sA = Math.max(1, Math.round(sa / this.df));
      const sB = Math.max(sA, Math.min(this.K - 2, Math.round(sb / this.df) - 1));
      const fCentro = greenwood(Math.min(1, (xa + xb) / 2 + desloc));
      const kCentro = Math.max(1, Math.min(this.K - 2, Math.round(fCentro / this.df)));
      this.canais.push({ kA, kB, sA, sB, kCentro, env: 0, fase: Math.random() * Math.PI * 2 });
    }
    this.kCorteHibrido = this.hibrido ? Math.round(fCorte / this.df) : 0;
    if (this.hibrido) {
      // A audição residual nos graves usa o mesmo modelo de perda.
      this.prepararPerda({ audiograma: ic.audiogramaResidual, recrutamento: true, espalhamento: 1 });
    }
    this.yRe = new Float64Array(this.K);
    this.yIm = new Float64Array(this.K);
  }
}

// ---------------------------------------------------------------------------
// Processador espectral estéreo (STFT com sobreposição de 75%)
// ---------------------------------------------------------------------------
export class SimuladorAuditivo {
  constructor({ taxa = 48000, tamanho = 1024, salto = 256 } = {}) {
    this.taxa = taxa;
    this.N = tamanho;
    this.H = salto;
    this.K = tamanho / 2 + 1;
    this.fft = new FFT(tamanho);
    this.janela = new Float64Array(tamanho);
    for (let n = 0; n < tamanho; n++) {
      this.janela[n] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * n) / tamanho));
    }
    // Normalização da sobreposição-soma (janela de análise x síntese = Hann).
    let soma = 0;
    for (let n = 0; n < tamanho; n += salto) soma += this.janela[n] * this.janela[n];
    // soma acima pega um ponto de cada quadro sobreposto no instante 0; vale para todos os instantes.
    this.escalaOLA = 1 / soma;
    this.entrada = [new Float64Array(tamanho), new Float64Array(tamanho)];
    this.acumulador = [new Float64Array(tamanho), new Float64Array(tamanho)];
    this.pendente = [new Float64Array(salto), new Float64Array(salto)];
    this.pos = 0;
    // Fila de saída: começa com 'salto' zeros para nunca faltar amostra.
    this.filaTam = salto * 4;
    this.fila = [new Float64Array(this.filaTam), new Float64Array(this.filaTam)];
    this.filaLer = 0;
    this.filaEscrever = salto;
    this.re = new Float64Array(tamanho);
    this.im = new Float64Array(tamanho);
    this.xRe = [new Float64Array(this.K), new Float64Array(this.K)];
    this.xIm = [new Float64Array(this.K), new Float64Array(this.K)];
    this.mono = false;
    this.balanco = 0;
    this.nivelReferencia = 95;
    this.ativo = true; // false = ouvir sem simulação (mesma latência)
    this.configurar({ esquerda: { modo: 'normal' }, direita: { modo: 'normal' } });
  }

  get latenciaAmostras() {
    return this.N;
  }

  configurar(cfg = {}) {
    if (typeof cfg.nivelReferencia === 'number') this.nivelReferencia = cfg.nivelReferencia;
    if (typeof cfg.mono === 'boolean') this.mono = cfg.mono;
    if (typeof cfg.balanco === 'number') this.balanco = Math.max(-1, Math.min(1, cfg.balanco));
    if (typeof cfg.ativo === 'boolean') this.ativo = cfg.ativo;
    if (cfg.esquerda || cfg.direita || !this.canais) {
      const esq = cfg.esquerda || (this.canais ? this.canais[0].cfg : { modo: 'normal' });
      const dir = cfg.direita || (this.canais ? this.canais[1].cfg : { modo: 'normal' });
      this.canais = [
        new PreparoCanal(esq, this.N, this.H, this.taxa, this.nivelReferencia),
        new PreparoCanal(dir, this.N, this.H, this.taxa, this.nivelReferencia),
      ];
    } else if (typeof cfg.nivelReferencia === 'number') {
      for (const c of this.canais) c.nivelReferencia = this.nivelReferencia;
    }
  }

  // Processa um bloco. Entradas e saídas: Float32Array (ou similares) do mesmo tamanho.
  processar(entE, entD, saiE, saiD) {
    const n = entE.length;
    const H = this.H;
    for (let i = 0; i < n; i++) {
      this.pendente[0][this.pos] = entE[i];
      this.pendente[1][this.pos] = entD ? entD[i] : entE[i];
      const l = this.filaLer;
      saiE[i] = this.fila[0][l];
      saiD[i] = this.fila[1][l];
      this.filaLer = (l + 1) % this.filaTam;
      this.pos++;
      if (this.pos === H) {
        this.pos = 0;
        this.quadro();
      }
    }
    this.posProcessar(saiE, saiD);
  }

  posProcessar(saiE, saiD) {
    const n = saiE.length;
    if (this.mono) {
      for (let i = 0; i < n; i++) {
        const m = 0.5 * (saiE[i] + saiD[i]);
        saiE[i] = m;
        saiD[i] = m;
      }
    }
    if (this.balanco !== 0) {
      const gE = this.balanco > 0 ? 1 - this.balanco : 1;
      const gD = this.balanco < 0 ? 1 + this.balanco : 1;
      for (let i = 0; i < n; i++) {
        saiE[i] *= gE;
        saiD[i] *= gD;
      }
    }
  }

  quadro() {
    const N = this.N;
    const H = this.H;
    const K = this.K;
    const w = this.janela;
    const re = this.re;
    const im = this.im;
    // Desliza a janela de entrada e junta os dois canais num só FFT complexo.
    for (let c = 0; c < 2; c++) {
      const e = this.entrada[c];
      e.copyWithin(0, H);
      e.set(this.pendente[c], N - H);
    }
    const eE = this.entrada[0];
    const eD = this.entrada[1];
    for (let n = 0; n < N; n++) {
      re[n] = eE[n] * w[n];
      im[n] = eD[n] * w[n];
    }
    this.fft.transformar(re, im, false);
    // Separa os espectros da esquerda e da direita.
    const xRe0 = this.xRe[0];
    const xIm0 = this.xIm[0];
    const xRe1 = this.xRe[1];
    const xIm1 = this.xIm[1];
    for (let k = 0; k < K; k++) {
      const nk = (N - k) % N;
      xRe0[k] = 0.5 * (re[k] + re[nk]);
      xIm0[k] = 0.5 * (im[k] - im[nk]);
      xRe1[k] = 0.5 * (im[k] + im[nk]);
      xIm1[k] = 0.5 * (re[nk] - re[k]);
    }
    // Modifica cada orelha.
    for (let c = 0; c < 2; c++) {
      const prep = this.canais[c];
      const modo = this.ativo ? prep.cfg.modo : 'normal';
      if (modo === 'perda') this.aplicarPerda(prep, this.xRe[c], this.xIm[c], 0, K - 1);
      else if (modo === 'ic') this.aplicarIC(prep, this.xRe[c], this.xIm[c]);
      else if (modo === 'silencio') {
        this.xRe[c].fill(0);
        this.xIm[c].fill(0);
      }
      const g = this.ativo ? prep.ganhoLinear : 1;
      if (g !== 1) {
        const a = this.xRe[c];
        const b = this.xIm[c];
        for (let k = 0; k < K; k++) {
          a[k] *= g;
          b[k] *= g;
        }
      }
      // DC e Nyquist precisam ser reais.
      this.xIm[c][0] = 0;
      this.xIm[c][K - 1] = 0;
    }
    // Junta de novo: Y = YE + i*YD, com simetria hermitiana.
    for (let k = 0; k < K; k++) {
      const lr = xRe0[k];
      const li = xIm0[k];
      const rr = xRe1[k];
      const ri = xIm1[k];
      re[k] = lr - ri;
      im[k] = li + rr;
      if (k > 0 && k < N / 2) {
        const nk = N - k;
        re[nk] = lr + ri;
        im[nk] = rr - li;
      }
    }
    this.fft.transformar(re, im, true);
    const escala = this.escalaOLA / N;
    const aE = this.acumulador[0];
    const aD = this.acumulador[1];
    for (let n = 0; n < N; n++) {
      aE[n] += re[n] * w[n] * escala;
      aD[n] += im[n] * w[n] * escala;
    }
    // Os primeiros H valores estão completos: vão para a fila de saída.
    let pE = this.filaEscrever;
    for (let n = 0; n < H; n++) {
      this.fila[0][pE] = aE[n];
      this.fila[1][pE] = aD[n];
      pE = (pE + 1) % this.filaTam;
    }
    this.filaEscrever = pE;
    aE.copyWithin(0, H);
    aD.copyWithin(0, H);
    aE.fill(0, N - H);
    aD.fill(0, N - H);
  }

  // Potência média (escala: seno de amplitude 1 => 0,5) de um intervalo de bins.
  potenciaBins(xr, xi, kIni, kFim) {
    let s = 0;
    for (let k = kIni; k <= kFim; k++) s += xr[k] * xr[k] + xi[k] * xi[k];
    // Parseval com janela Hann na análise (raiz de Hann x raiz de Hann não entra aqui: só análise).
    // Soma de w^2 da raiz de Hann = N/2; espectro de um lado dobra a energia.
    return (4 * s) / (this.N * this.N);
  }

  aplicarPerda(prep, xr, xi, kMin, kMax) {
    const B = prep.bandas.length;
    // 1) Espalhamento espectral (antes de medir os níveis).
    if (prep.nucleo && kMin === 0) {
      const P = prep.potencia;
      for (let k = 0; k < this.K; k++) P[k] = xr[k] * xr[k] + xi[k] * xi[k];
      for (let k = 1; k < this.K - 1; k++) {
        const { ini, fim, pesos } = prep.nucleo[k];
        let s = 0;
        for (let j = ini; j <= fim; j++) s += P[j] * pesos[j - ini];
        const mag = Math.sqrt(P[k]);
        if (mag > 1e-12) {
          const f = Math.sqrt(s) / mag;
          xr[k] *= f;
          xi[k] *= f;
        } else {
          xr[k] = Math.sqrt(s);
          xi[k] = 0;
        }
      }
    }
    // 2) Nível de cada banda, suavizado no tempo.
    for (let b = 0; b < B; b++) {
      const { kIni, kFim } = prep.bandas[b];
      const ms = this.potenciaBins(xr, xi, kIni, kFim);
      const dbfs = 10 * Math.log10(ms / 0.5 + 1e-20);
      const spl = dbfs + this.nivelReferencia;
      const ant = prep.nivelSuave[b];
      const coef = spl > ant ? prep.coefAtaque : prep.coefSoltura;
      const novo = coef * ant + (1 - coef) * spl;
      prep.nivelSuave[b] = novo;
      const sl = novo - prep.limiarBanda[b];
      prep.ganhoBanda[b] = ganhoPerdaDb(sl, prep.perdaBanda[b], prep.recrutamento);
    }
    // 3) Ganho por bin, interpolado entre as bandas.
    const kF = Math.min(kMax, this.K - 1);
    for (let k = kMin; k <= kF; k++) {
      const a = prep.binBandaA[k];
      const b = prep.binBandaB[k];
      const t = prep.binPeso[k];
      const gDb = prep.ganhoBanda[a] * (1 - t) + prep.ganhoBanda[b] * t;
      const g = Math.pow(10, gDb / 20);
      xr[k] *= g;
      xi[k] *= g;
    }
  }

  aplicarIC(prep, xr, xi) {
    const K = this.K;
    const yr = prep.yRe;
    const yi = prep.yIm;
    yr.fill(0);
    yi.fill(0);
    // Parte acústica (híbrido): graves com a audição residual.
    if (prep.hibrido && prep.kCorteHibrido > 0) {
      this.aplicarPerda(prep, xr, xi, 0, prep.kCorteHibrido);
      for (let k = 0; k <= prep.kCorteHibrido && k < K; k++) {
        yr[k] = xr[k];
        yi[k] = xi[k];
      }
    }
    // Parte elétrica: envelope de cada canal modulando uma portadora.
    const dois = 2 * Math.PI;
    for (const canal of prep.canais) {
      let s = 0;
      for (let k = canal.kA; k <= canal.kB; k++) s += xr[k] * xr[k] + xi[k] * xi[k];
      const amp = Math.sqrt(s);
      const coef = amp > canal.env ? prep.coefAtaqueIC : prep.coefSolturaIC;
      canal.env = coef * canal.env + (1 - coef) * amp;
      const e = canal.env;
      if (e < 1e-9) continue;
      if (prep.portadora === 'seno') {
        canal.fase += (dois * canal.kCentro * this.H) / this.N;
        if (canal.fase > dois) canal.fase -= dois * Math.floor(canal.fase / dois);
        const k = canal.kCentro;
        // 1,11: compensa a janela (medido nos testes) para manter o nível de entrada.
        yr[k] += 1.11 * e * Math.cos(canal.fase);
        yi[k] += 1.11 * e * Math.sin(canal.fase);
      } else {
        const nb = canal.sB - canal.sA + 1;
        // Fator 2: quadros de ruído independentes somam em potência (-3 dB) e a janela
        // de análise tira outros 3 dB. Medido nos testes.
        const a = (2 * e) / Math.sqrt(nb);
        for (let k = canal.sA; k <= canal.sB; k++) {
          const f = Math.random() * dois;
          yr[k] += a * Math.cos(f);
          yi[k] += a * Math.sin(f);
        }
      }
    }
    xr.set(yr);
    xi.set(yi);
  }
}

// ---------------------------------------------------------------------------
// Medidor de loudness (ITU-R BS.1770): ponderação K
// ---------------------------------------------------------------------------
export function coeficientesK(taxa) {
  // Estágio 1: prateleira de agudos (+4 dB). Estágio 2: passa-altas (RLB).
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / taxa);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / taxa);
  a0 = 1 + K / Q + K * K;
  const s2 = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  return [s1, s2];
}

export class Biquad {
  constructor(c) {
    this.c = c;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
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

// Medidor de loudness completo (momentâneo, curto prazo e integrado com portas).
export class MedidorLoudness {
  constructor(taxa, canais = 2) {
    this.taxa = taxa;
    this.canais = canais;
    const [s1, s2] = coeficientesK(taxa);
    this.filtros = [];
    for (let c = 0; c < canais; c++) this.filtros.push([new Biquad(s1), new Biquad(s2)]);
    this.tamBloco = Math.round(taxa * 0.1);
    this.contagem = 0;
    this.soma = new Float64Array(canais);
    this.blocos = []; // energia média (soma dos canais) de cada bloco de 100 ms
    this.blocos400 = []; // energias de blocos de 400 ms (sobreposição de 75%)
    this.pico = 0;
    this.picoMax = 0;
    this.momentaneo = -Infinity;
    this.curto = -Infinity;
    this.integrado = -Infinity;
  }
  zerar() {
    this.blocos = [];
    this.blocos400 = [];
    this.picoMax = 0;
    this.integrado = -Infinity;
  }
  static lufs(z) {
    return z > 0 ? -0.691 + 10 * Math.log10(z) : -Infinity;
  }
  // canaisAmostras: array de Float32Array (um por canal)
  processar(canaisAmostras) {
    const n = canaisAmostras[0].length;
    let houveBloco = false;
    let picoBloco = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < this.canais; c++) {
        const dados = canaisAmostras[c] || canaisAmostras[0];
        const x = dados[i];
        const ax = Math.abs(x);
        if (ax > picoBloco) picoBloco = ax;
        const f = this.filtros[c];
        const y = f[1].passo(f[0].passo(x));
        this.soma[c] += y * y;
      }
      this.contagem++;
      if (this.contagem >= this.tamBloco) {
        let z = 0;
        for (let c = 0; c < this.canais; c++) {
          z += this.soma[c] / this.contagem;
          this.soma[c] = 0;
        }
        this.contagem = 0;
        this.blocos.push(z);
        if (this.blocos.length > 30) this.blocos.shift();
        this.atualizar();
        houveBloco = true;
      }
    }
    this.pico = picoBloco;
    if (picoBloco > this.picoMax) this.picoMax = picoBloco;
    return houveBloco;
  }
  atualizar() {
    const b = this.blocos;
    const media = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    if (b.length >= 4) {
      const z4 = media(b.slice(-4));
      this.momentaneo = MedidorLoudness.lufs(z4);
      this.blocos400.push(z4);
      if (this.blocos400.length > 36000) this.blocos400.shift();
      // Integrado com as portas absoluta (-70 LUFS) e relativa (-10 LU).
      const acimaAbs = this.blocos400.filter((z) => MedidorLoudness.lufs(z) > -70);
      if (acimaAbs.length) {
        const relativo = MedidorLoudness.lufs(media(acimaAbs)) - 10;
        const validos = acimaAbs.filter((z) => MedidorLoudness.lufs(z) > relativo);
        this.integrado = validos.length ? MedidorLoudness.lufs(media(validos)) : -Infinity;
      }
    }
    if (b.length >= 30) this.curto = MedidorLoudness.lufs(media(b.slice(-30)));
    else if (b.length > 0) this.curto = MedidorLoudness.lufs(media(b));
  }
}
