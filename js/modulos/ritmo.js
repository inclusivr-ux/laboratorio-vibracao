// Ritmo (para a Resistência): acompanhar o tempo pelo som, por um flash, por uma bola quicando ou por uma mão-guia.
// Mede o atraso de cada toque em relação à batida. Base: Iversen e col. (2015), bola quicando x flash.
import * as THREE from 'three';
import { titulo, paragrafo, grupoBotoes, subtitulo } from './comum.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

const MODOS = [
  ['som', 'Som'],
  ['flash', 'Flash'],
  ['bola', 'Bola'],
  ['som-bola', 'Som + bola'],
  ['mao', 'Mão-guia'],
];
const CONTAGEM = 4;
const MEDIDAS = 16;

function texturaNumero() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { c, t, g: c.getContext('2d') };
}

export class ModuloRitmo {
  constructor() {
    this.id = 'ritmo';
    this.nome = 'Ritmo';
    this.cfg = { modo: 'som-bola', bpm: 80 };
    this.fase = 'config';
    this.batidas = [];
    this.toques = [];
    this.resultado = null;
  }

  entrar() {
    if (!this.grupo) this.criarObjetos();
  }

  sair() {
    this.cancelar();
  }

  criarObjetos() {
    const app = this.app;
    this.grupo = new THREE.Group();
    this.grupo.visible = false;
    app.cena.add(this.grupo);
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#4b5028';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#74d0d8';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(128, 128, 100, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(128, 128, 40, 0, Math.PI * 2);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.matTopo = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    this.tambor = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 40), [
      new THREE.MeshBasicMaterial({ color: 0x8b5a2b }),
      this.matTopo,
      new THREE.MeshBasicMaterial({ color: 0x5a3a1c }),
    ]);
    this.tambor.userData.interativo = { aoPressionar: () => this.toque(performance.now()) };
    this.grupo.add(this.tambor);
    app.interacao.adicionarInterativo(this.tambor);
    this.bola = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf4b224 }));
    this.grupo.add(this.bola);
    // Mão-guia (silhueta simples)
    this.mao = new THREE.Group();
    const matMao = new THREE.MeshBasicMaterial({ color: 0x74d0d8, transparent: true, opacity: 0.6, depthWrite: false });
    const palma = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.09), matMao);
    this.mao.add(palma);
    for (let i = 0; i < 4; i++) {
      const dedo = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 4, 8), matMao);
      dedo.rotation.x = Math.PI / 2;
      dedo.position.set(-0.03 + i * 0.02, 0, -0.075);
      this.mao.add(dedo);
    }
    const polegar = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.04, 4, 8), matMao);
    polegar.rotation.set(Math.PI / 2, 0, 0.8);
    polegar.position.set(0.055, 0, -0.02);
    this.mao.add(polegar);
    this.grupo.add(this.mao);
    // Contagem
    this.num = texturaNumero();
    this.placaNum = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.num.t, transparent: true, depthWrite: false }));
    this.placaNum.scale.set(0.16, 0.16, 1);
    this.grupo.add(this.placaNum);
    this.numAtual = null;
  }

  desenharNumero(txt) {
    if (txt === this.numAtual) return;
    this.numAtual = txt;
    const { g, t } = this.num;
    g.clearRect(0, 0, 256, 256);
    if (txt) {
      g.fillStyle = 'rgba(16,4,72,0.85)';
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#74d0d8';
      g.font = '800 130px "Fraunces Soft", Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, 128, 136);
    }
    t.needsUpdate = true;
  }

  async iniciar() {
    const app = this.app;
    if (!app.motor.pronto) await app.iniciarAudio();
    if (!this.grupo) this.criarObjetos();
    // Tambor à frente, na altura do peito.
    const cab = app.posicaoCabeca();
    const dir = app.direcaoOlhar();
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const pos = cab.clone().addScaledVector(dir, 0.42);
    pos.y = cab.y - 0.42;
    this.grupo.position.copy(pos);
    this.grupo.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
    this.grupo.visible = true;
    const modo = this.cfg.modo;
    this.bola.visible = modo === 'bola' || modo === 'som-bola';
    this.mao.visible = modo === 'mao';
    this.placaNum.position.set(0, 0.42, 0);
    const T = 60000 / this.cfg.bpm;
    this.T = T;
    this.batidas = [];
    this.toques = [];
    this.resultado = null;
    const comSom = modo === 'som' || modo === 'som-bola';
    if (comSom) {
      const ctx = app.motor.ctx;
      const bumbo = await app.biblioteca.obter('bumbo');
      const clique = await app.biblioteca.obter('tom-4000');
      const t0 = ctx.currentTime + 1.0;
      for (let k = 0; k < CONTAGEM + MEDIDAS; k++) {
        const tA = t0 + (k * T) / 1000;
        if (k < CONTAGEM) {
          const f = app.motor.tocarUmaVez(clique, { espacial: false, barramento: 'efeitos', volume: 0.35, quando: tA, envioSala: 0 });
          if (f) f.parar(tA + 0.06);
        } else {
          app.motor.tocarUmaVez(bumbo, { espacial: false, barramento: 'efeitos', volume: 0.9, quando: tA, envioSala: 0 });
        }
        this.batidas.push(app.motor.tempoAudioParaTela(tA));
      }
    } else {
      const t0 = performance.now() + 1000;
      for (let k = 0; k < CONTAGEM + MEDIDAS; k++) this.batidas.push(t0 + k * T);
    }
    this.fase = 'medindo';
    this.dedoAnt = 1;
    app.painel.marcarSujo();
  }

  cancelar() {
    this.fase = this.resultado ? 'fim' : 'config';
    if (this.grupo) this.grupo.visible = false;
    this.app.painel.marcarSujo();
  }

  aoSelecionar() {
    if (this.fase !== 'medindo') return false;
    this.toque(performance.now());
    return true;
  }

  aoEspaco() {
    if (this.fase === 'medindo') this.toque(performance.now());
  }

  toque(t) {
    if (this.fase !== 'medindo') return;
    this.toques.push(t);
    this.ultimoToque = performance.now();
    const pos = new THREE.Vector3();
    this.tambor.getWorldPosition(pos);
    this.app.ondas.disparar(this.app.mundoParaSala(pos), 0.6);
  }

  atualizar() {
    if (this.fase !== 'medindo') return;
    const agora = performance.now();
    const T = this.T;
    const b = this.batidas;
    // Batida atual
    let k = -1;
    for (let i = 0; i < b.length; i++) if (agora >= b[i]) k = i;
    const desde = k >= 0 ? agora - b[k] : agora - (b[0] - T);
    const fase = Math.max(0, Math.min(1, desde / T));
    const altura = 0.3 * Math.sin(Math.PI * fase);
    const topo = 0.025;
    if (this.bola.visible) this.bola.position.set(0, topo + 0.035 + (k < 0 ? 0.3 : altura), 0);
    if (this.mao.visible) {
      const hM = k < 0 ? 0.3 : altura;
      this.mao.position.set(0, topo + 0.02 + hM, 0.02 * Math.sin(Math.PI * fase));
      this.mao.rotation.x = -0.6 * (hM / 0.3);
    }
    // Flash no tambor
    const flash = this.cfg.modo === 'flash' && k >= 0 && desde < 110;
    const tocouAgora = this.ultimoToque && agora - this.ultimoToque < 90;
    this.matTopo.color.set(flash ? 0x74d0d8 : tocouAgora ? 0xf4b224 : 0xffffff);
    if (flash) this.matTopo.color.multiplyScalar(2.2);
    // Contagem visual (para todos os modos)
    if (k < CONTAGEM - 1) this.desenharNumero(String(CONTAGEM - Math.max(0, k + 1)));
    else if (k === CONTAGEM - 1) this.desenharNumero('JÁ');
    else this.desenharNumero(null);
    // Toque com o dedo no tambor
    for (const e of this.app.interacao.entradas) {
      if (!e.conectado || !e.ehMao) continue;
      const ponta = this.app.interacao.pontaIndicador(e);
      if (!ponta) continue;
      const local = this.tambor.worldToLocal(ponta.clone());
      const dentro = Math.hypot(local.x, local.z) < 0.16;
      const yv = local.y - 0.025;
      const ant = e.yTamborAnt ?? 1;
      if (dentro && yv < 0.005 && ant >= 0.005) this.toque(performance.now());
      e.yTamborAnt = yv;
    }
    if (agora > b[b.length - 1] + T * 0.75) this.terminar();
  }

  terminar() {
    const app = this.app;
    const T = this.T;
    const medidas = this.batidas.slice(CONTAGEM);
    const desvios = [];
    for (const t of this.toques) {
      let melhor = null;
      for (const b of medidas) {
        const d = t - b;
        if (Math.abs(d) < T / 2 && (melhor === null || Math.abs(d) < Math.abs(melhor))) melhor = d;
      }
      if (melhor !== null) desvios.push(melhor);
    }
    const n = desvios.length;
    const media = n ? desvios.reduce((s, v) => s + v, 0) / n : NaN;
    const dp = n > 1 ? Math.sqrt(desvios.reduce((s, v) => s + (v - media) * (v - media), 0) / (n - 1)) : NaN;
    const dentro = n ? Math.round((100 * desvios.filter((d) => Math.abs(d) <= 100).length) / n) : 0;
    this.resultado = { media, dp, dentro, n, esperados: MEDIDAS };
    this.fase = 'fim';
    this.grupo.visible = false;
    const nomeModo = MODOS.find((m) => m[0] === this.cfg.modo)[1];
    app.registrarResultado(
      'Ritmo',
      `${nomeModo}, ${this.cfg.bpm} BPM: média ${isFinite(media) ? Math.round(media) : '—'} ms, desvio ${isFinite(dp) ? Math.round(dp) : '—'} ms, ${dentro}% em ±100 ms (${n}/${MEDIDAS})`,
      { config: { ...this.cfg }, desvios: desvios.map((d) => Math.round(d)), media, dp, dentro, toques: n, latenciaSaidaMs: Math.round(app.motor.latenciaSaidaMs()) },
    );
    app.painel.marcarSujo();
  }

  desenhar(p, a) {
    titulo(p, a, 'Ritmo (para a Resistência)');
    let y = a.y + 64;
    if (this.fase === 'medindo') {
      p.texto('Acompanhe o pulso: pinça, gatilho, toque no tambor ou barra de espaço.', a.x, y + 10, { fonte: FONTE.forte(22), cor: COR.tinta, maxLargura: a.w });
      paragrafo(p, a.x, y + 50, a.w, 'Os 4 primeiros tempos são só contagem. Depois vêm 16 tempos medidos.', 21);
      p.texto(`Toques: ${this.toques.length}`, a.x, y + 140, { fonte: FONTE.titulo(34), cor: COR.tinta });
      p.botao('rit-parar', a.x, a.y + a.h - 70, 240, 62, 'Encerrar', () => this.cancelar(), { variante: 'perigo', tamanho: 21 });
      return;
    }
    if (this.fase === 'fim' && this.resultado) {
      const r = this.resultado;
      p.cartela(a.x, y - 6, a.w, 126, { fundo: '#e5f4e4', raio: 18, espessura: 4 });
      const sinal = isFinite(r.media) ? (r.media < 0 ? 'adiantado' : 'atrasado') : '';
      p.texto(`Média: ${isFinite(r.media) ? Math.round(r.media) : '—'} ms ${sinal}   ·   desvio: ${isFinite(r.dp) ? Math.round(r.dp) : '—'} ms`, a.x + 24, y + 36, {
        fonte: FONTE.forte(25),
        cor: COR.tinta,
        maxLargura: a.w - 48,
      });
      p.texto(`${r.dentro}% dos toques a até 100 ms da batida   ·   ${r.n} de ${r.esperados} toques`, a.x + 24, y + 80, {
        fonte: FONTE.texto(22),
        cor: COR.carvao,
        maxLargura: a.w - 48,
      });
      y += 140;
    }
    y += 26;
    subtitulo(p, a.x, y + 6, 'Guia');
    grupoBotoes(p, 'rit-modo', a.x + 100, y - 24, a.w - 100, 50, MODOS, this.cfg.modo, (v) => {
      this.cfg.modo = v;
      p.marcarSujo();
    }, { tamanho: 18, espaco: 8 });
    y += 62;
    subtitulo(p, a.x, y + 6, 'BPM');
    grupoBotoes(p, 'rit-bpm', a.x + 100, y - 24, 420, 50, [[60, '60'], [80, '80'], [100, '100'], [120, '120']], this.cfg.bpm, (v) => {
      this.cfg.bpm = v;
      p.marcarSujo();
    }, { tamanho: 19 });
    y += 46;
    paragrafo(
      p,
      a.x,
      y + 10,
      a.w,
      'A pesquisa mostra que uma bola quicando guia o ritmo quase tão bem quanto o som, e que pessoas surdas acompanham flashes melhor do que ouvintes. Compare os modos com pessoas surdas e ouvintes. O rastreamento de mãos tem atraso: compare modos entre si, não com zero.',
      20,
    );
    p.botao('rit-comecar', a.x, a.y + a.h - 70, 300, 64, this.fase === 'fim' ? 'Fazer de novo' : 'Começar', () => this.iniciar(), { variante: 'primario', tamanho: 23 });
  }
}
