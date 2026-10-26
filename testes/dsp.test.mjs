// Testes do núcleo de processamento de sinal. Rodar com: npm run testar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FFT,
  SimuladorAuditivo,
  ganhoPerdaDb,
  MedidorLoudness,
  interpolarLogF,
  normalizarAudiograma,
  greenwood,
  greenwoodInversa,
} from '../js/audio/dsp-nucleo.js';

const TAXA = 48000;

function seno(f, amp, n, taxa = TAXA, fase = 0) {
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = amp * Math.sin((2 * Math.PI * f * i) / taxa + fase);
  return s;
}

function rms(arr, ini = 0, fim = arr.length) {
  let s = 0;
  for (let i = ini; i < fim; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / (fim - ini));
}

function db(x) {
  return 20 * Math.log10(x + 1e-30);
}

// Passa um sinal estéreo pelo simulador em blocos de 128 amostras (como no AudioWorklet).
function passar(sim, esq, dir) {
  const n = esq.length;
  const outE = new Float32Array(n);
  const outD = new Float32Array(n);
  const B = 128;
  for (let i = 0; i < n; i += B) {
    const fim = Math.min(n, i + B);
    const bE = new Float32Array(B);
    const bD = new Float32Array(B);
    bE.set(esq.subarray(i, fim));
    bD.set(dir.subarray(i, fim));
    const sE = new Float32Array(B);
    const sD = new Float32Array(B);
    sim.processar(bE, bD, sE, sD);
    outE.set(sE.subarray(0, fim - i), i);
    outD.set(sD.subarray(0, fim - i), i);
  }
  return [outE, outD];
}

test('FFT: ida e volta devolve o sinal', () => {
  const n = 1024;
  const fft = new FFT(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const orig = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    orig[i] = Math.random() * 2 - 1;
    re[i] = orig[i];
  }
  fft.transformar(re, im, false);
  fft.transformar(re, im, true);
  let erro = 0;
  for (let i = 0; i < n; i++) erro = Math.max(erro, Math.abs(re[i] / n - orig[i]), Math.abs(im[i] / n));
  assert.ok(erro < 1e-10, `erro ${erro}`);
});

test('FFT: um seno aparece no bin certo', () => {
  const n = 1024;
  const fft = new FFT(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const bin = 37;
  for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * bin * i) / n);
  fft.transformar(re, im, false);
  let maior = 0;
  let kMaior = -1;
  for (let k = 0; k < n / 2; k++) {
    const m = Math.hypot(re[k], im[k]);
    if (m > maior) {
      maior = m;
      kMaior = k;
    }
  }
  assert.equal(kMaior, bin);
  assert.ok(Math.abs(maior - n / 2) < 1e-6);
});

test('Simulador no modo normal: saída = entrada atrasada', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  const n = TAXA; // 1 s
  const esq = new Float32Array(n).map(() => Math.random() * 0.5 - 0.25);
  const dir = new Float32Array(n).map(() => Math.random() * 0.5 - 0.25);
  const [sE, sD] = passar(sim, esq, dir);
  const L = sim.latenciaAmostras;
  let erro = 0;
  for (let i = L + 2048; i < n; i++) {
    erro = Math.max(erro, Math.abs(sE[i] - esq[i - L]), Math.abs(sD[i] - dir[i - L]));
  }
  assert.ok(erro < 1e-5, `erro de reconstrução ${erro}`);
});

test('Áudio mono deixa os dois lados iguais', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  sim.configurar({ mono: true });
  const n = TAXA / 2;
  const esq = seno(440, 0.5, n);
  const dir = new Float32Array(n);
  const [sE, sD] = passar(sim, esq, dir);
  for (let i = 0; i < n; i++) assert.equal(sE[i], sD[i]);
  // metade da energia de um lado só vai para cada lado
  const r = rms(sE, 4096, n) / rms(esq, 4096, n);
  assert.ok(Math.abs(r - 0.5) < 0.02, `razão ${r}`);
});

test('Ganho da perda: sons fracos somem, sons fortes continuam', () => {
  assert.equal(ganhoPerdaDb(50, 0, true), 0);
  assert.equal(ganhoPerdaDb(50, 40, false), -40);
  assert.ok(ganhoPerdaDb(105, 60, true) > -1); // forte: quase sem mudança
  assert.ok(ganhoPerdaDb(60, 60, true) <= -60); // no limiar do ouvido com perda: some
  const meio = ganhoPerdaDb(85, 60, true); // (85-60)*105/45 = 58,3 => ganho de -26,7
  assert.ok(meio < -20 && meio > -32, `ganho ${meio}`);
  assert.equal(ganhoPerdaDb(90, 110, true), -90); // surdez profunda nessa faixa
});

test('Audiograma: interpolação em escala logarítmica', () => {
  const a = normalizarAudiograma({ 500: 20, 1000: 40, 2000: 60 });
  assert.equal(interpolarLogF(a, 1000), 40);
  assert.equal(interpolarLogF(a, 100), 20);
  assert.equal(interpolarLogF(a, 9000), 60);
  assert.ok(Math.abs(interpolarLogF(a, Math.sqrt(500 * 1000)) - 30) < 1e-9);
});

test('Greenwood: ida e volta', () => {
  for (const f of [150, 500, 1000, 4000, 8000]) {
    assert.ok(Math.abs(greenwood(greenwoodInversa(f)) - f) < 1e-6);
  }
});

test('Perda auditiva: agudo com perda cai muito, grave sem perda passa', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  const aud = { 250: 0, 500: 0, 1000: 10, 2000: 50, 4000: 70, 8000: 80 };
  sim.configurar({
    nivelReferencia: 95,
    esquerda: { modo: 'perda', perda: { audiograma: aud, recrutamento: true } },
    direita: { modo: 'perda', perda: { audiograma: aud, recrutamento: true } },
  });
  const n = TAXA;
  // -20 dBFS => cerca de 75 dB SPL com referência de 95
  const grave = seno(250, 0.1, n);
  const agudo = seno(4000, 0.1, n);
  const [g] = passar(sim, grave, grave);
  const sim2 = new SimuladorAuditivo({ taxa: TAXA });
  sim2.configurar({
    nivelReferencia: 95,
    esquerda: { modo: 'perda', perda: { audiograma: aud, recrutamento: true } },
    direita: { modo: 'perda', perda: { audiograma: aud, recrutamento: true } },
  });
  const [a] = passar(sim2, agudo, agudo);
  const quedaGrave = db(rms(g, 8192, n)) - db(rms(grave, 8192, n));
  const quedaAgudo = db(rms(a, 8192, n)) - db(rms(agudo, 8192, n));
  assert.ok(quedaGrave > -3, `grave caiu ${quedaGrave.toFixed(1)} dB`);
  assert.ok(quedaAgudo < -25, `agudo caiu só ${quedaAgudo.toFixed(1)} dB`);
});

test('Recrutamento: o mesmo agudo mais forte perde menos', () => {
  const aud = { 250: 60, 8000: 60 };
  const cfg = {
    nivelReferencia: 95,
    esquerda: { modo: 'perda', perda: { audiograma: aud, recrutamento: true } },
    direita: { modo: 'perda', perda: { audiograma: aud, recrutamento: true } },
  };
  const n = TAXA;
  const medir = (amp) => {
    const sim = new SimuladorAuditivo({ taxa: TAXA });
    sim.configurar(cfg);
    const x = seno(1000, amp, n);
    const [y] = passar(sim, x, x);
    return db(rms(y, 8192, n)) - db(rms(x, 8192, n));
  };
  const fraco = medir(0.05);
  const forte = medir(0.7);
  assert.ok(forte > fraco + 10, `fraco ${fraco.toFixed(1)} dB, forte ${forte.toFixed(1)} dB`);
});

test('Implante coclear (ruído): mantém a energia perto da faixa do som', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  const ic = { canais: 8, portadora: 'ruido' };
  sim.configurar({ esquerda: { modo: 'ic', ic }, direita: { modo: 'ic', ic } });
  const n = TAXA;
  const x = seno(1000, 0.2, n);
  const [y] = passar(sim, x, x);
  const dif = db(rms(y, 8192, n)) - db(rms(x, 8192, n));
  assert.ok(Math.abs(dif) < 6, `nível mudou ${dif.toFixed(1)} dB`);
  // O espectro da saída deve se concentrar entre 500 Hz e 2 kHz.
  const N = 4096;
  const fft = new FFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = y[20000 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft.transformar(re, im, false);
  let dentro = 0;
  let total = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * TAXA) / N;
    const p = re[k] * re[k] + im[k] * im[k];
    total += p;
    if (f > 500 && f < 2000) dentro += p;
  }
  assert.ok(dentro / total > 0.8, `só ${((100 * dentro) / total).toFixed(0)}% na faixa`);
});

test('Implante coclear (seno): produz som e não explode', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  const ic = { canais: 16, portadora: 'seno' };
  sim.configurar({ esquerda: { modo: 'ic', ic }, direita: { modo: 'ic', ic } });
  const n = TAXA;
  const x = new Float32Array(n).map(() => (Math.random() * 2 - 1) * 0.2);
  const [y] = passar(sim, x, x);
  const r = rms(y, 8192, n);
  assert.ok(r > 0.01 && r < 1, `rms ${r}`);
});

test('Silêncio: nada sai', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  sim.configurar({ esquerda: { modo: 'silencio' }, direita: { modo: 'silencio' } });
  const x = seno(500, 0.5, TAXA / 2);
  const [y] = passar(sim, x, x);
  assert.ok(rms(y, 4096) < 1e-9);
});

test('A/B: desligar a simulação devolve o som original', () => {
  const sim = new SimuladorAuditivo({ taxa: TAXA });
  sim.configurar({ esquerda: { modo: 'silencio' }, direita: { modo: 'silencio' }, ativo: false });
  const x = seno(500, 0.5, TAXA / 2);
  const [y] = passar(sim, x, x);
  assert.ok(Math.abs(db(rms(y, 4096)) - db(rms(x, 4096))) < 0.1);
});

test('Loudness: seno de 1 kHz a -20 dBFS nos dois canais mede cerca de -20 LUFS', () => {
  const m = new MedidorLoudness(TAXA, 2);
  const x = seno(997, 0.1, TAXA * 4);
  m.processar([x, x]);
  assert.ok(Math.abs(m.integrado - -20) < 0.2, `integrado ${m.integrado}`);
  assert.ok(Math.abs(m.momentaneo - -20) < 0.2, `momentâneo ${m.momentaneo}`);
});

test('Loudness: um canal só, seno de 0 dBFS mede cerca de -3 LUFS', () => {
  const m = new MedidorLoudness(TAXA, 2);
  const x = seno(997, 1, TAXA * 2);
  const z = new Float32Array(x.length);
  m.processar([x, z]);
  assert.ok(Math.abs(m.integrado - -3.01) < 0.2, `integrado ${m.integrado}`);
});
