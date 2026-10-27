// Modo guiado: um tutorial que apresenta um sistema do laboratório por vez, com uma explicação curta,
// poucos botões grandes e "Voltar / Próximo". Nada começa sozinho. Usa os módulos do modo livre por baixo.
import * as THREE from 'three';
import { COR, FONTE } from '../ui/estilo-ui.js';
import { PASSOS as PASSOS_SALA } from './sala-maga.js';
import { FREQS_GUIA } from './graves.js';
import { formatarDb } from './comum.js';

const RAD = Math.PI / 180;
const W = 1024;
const X = 48;
const LARGURA = W - 2 * X;
const Y_ACOES = 372;

function mod(app, id) {
  return app.modulos.find((m) => m.id === id);
}

const PASSOS = [
  {
    id: 'boas-vindas',
    titulo: 'Bem-vindo ao laboratório',
    texto: 'Aqui você ouve e vê como o som do jogo chega a pessoas ouvintes, com perda auditiva e surdas. São 7 passos curtos. Nada começa sozinho: em cada passo, toque no botão grande para experimentar e depois em Próximo.',
    acoes(g, p, y) {
      p.retangulo(X, y, LARGURA, 150, 22, 'rgba(255,255,255,0.5)', 'rgba(66,67,58,0.3)', 3);
      p.textoQuebrado('Se o painel sair da sua vista, ele volta para a frente sozinho. O botão redondo no pulso esquerdo (ou B/Y no controle) também traz o painel. Se a sala estiver torta, toque em Recentrar.', X + 24, y + 42, LARGURA - 300, 32, { fonte: FONTE.texto(22), cor: COR.carvao });
      p.botao('g-recentrar', X + LARGURA - 250, y + 40, 226, 70, 'Recentrar', () => g.app.recentrar(), { tamanho: 24 });
    },
  },
  {
    id: 'volta',
    titulo: 'Um som em volta da cabeça',
    texto: 'Uma tesoura vai dar voltas em você, como no barbeiro virtual. Feche os olhos e aponte o rosto para onde ela está. Depois abra os olhos: a bolinha colorida e as setas mostram de onde vem o som.',
    acoes(g, p, y) {
      p.botao('g-volta', X, y, 420, 96, g.volta ? 'Parar' : 'Tocar a volta', () => (g.volta ? g.pararVolta() : g.iniciarVolta()), { variante: 'primario', tamanho: 32 });
      const hrtf = g.app.estado.hrtf;
      p.botao('g-hrtf', X + 450, y, LARGURA - 450, 96, hrtf ? 'Som 3D: ligado' : 'Som 3D: desligado', () => g.app.definirEstado('hrtf', !hrtf), { variante: hrtf ? 'ativo' : 'secundario', tamanho: 26 });
      p.textoQuebrado('Compare o som 3D ligado e desligado: desligado, a tesoura só vai da esquerda para a direita, e frente e trás se confundem.', X, y + 140, LARGURA, 32, { fonte: FONTE.texto(22), cor: COR.carvao });
    },
    sair(g) {
      g.pararVolta();
    },
  },
  {
    id: 'sala',
    modulo: 'sala',
    titulo: 'Atrás de você: o espelho',
    texto: 'Na Sala da Maga, o espelho fica atrás de você e chama. Quem ouve escuta o brilho; quem não ouve vê a luz chegando por trás e a sombra apontando para a frente. O painel fica parado durante a cena.',
    vivo: true,
    acoes(g, p, y) {
      const sala = mod(g.app, 'sala');
      const passoCena = PASSOS_SALA[sala.passo];
      p.retangulo(X, y, LARGURA, 118, 20, 'rgba(255,255,255,0.55)', 'rgba(66,67,58,0.3)', 3);
      p.texto(sala.passo === 0 ? 'A cena ainda não começou' : `Cena: ${passoCena.titulo}`, X + 22, y + 36, { fonte: FONTE.forte(24), cor: COR.tinta, maxLargura: LARGURA - 44 });
      p.textoQuebrado(sala.passo === 0 ? 'Fique olhando para a mesa com a maquete. O espelho está atrás de você.' : passoCena.texto, X + 22, y + 68, LARGURA - 44, 26, { fonte: FONTE.texto(19), cor: COR.carvao });
      const ultimo = sala.passo >= PASSOS_SALA.length - 1;
      const yb = y + 132;
      p.botao('g-cena', X, yb, 380, 76, sala.passo === 0 ? 'Começar a cena' : ultimo ? 'Cena completa' : 'Próximo da cena', () => sala.irPara(sala.passo + 1), { variante: 'primario', desabilitado: ultimo, tamanho: 26 });
      const semSom = !g.app.estado.som;
      p.botao('g-som', X + 398, yb, 300, 76, semSom ? 'Ver com som' : 'Ver sem som', () => g.app.definirEstado('som', semSom), { variante: semSom ? 'ativo' : 'secundario', tamanho: 24 });
      p.botao('g-reiniciar', X + 716, yb, LARGURA - 716, 76, 'Reiniciar', () => sala.reiniciar(), { tamanho: 24 });
    },
    sair(g) {
      const sala = mod(g.app, 'sala');
      sala.reiniciar();
      g.app.definirEstado('som', true);
    },
  },
  {
    id: 'graves',
    modulo: 'graves',
    titulo: 'Grave: ouvir ou sentir?',
    texto: 'O alto-falante do Quest é pequeno e aberto. Escolha uma frequência: o laboratório toca um tom de 2 segundos. Depois diga o que percebeu. Comece com o volume baixo.',
    acoes(g, p, y) {
      const gr = mod(g.app, 'graves');
      const bw = (LARGURA - 3 * 14) / 4;
      FREQS_GUIA.forEach((f, i) => {
        const r = gr.respostas[f];
        const rot = r ? `${f} Hz ✓` : `${f} Hz`;
        p.botao(`g-f-${f}`, X + i * (bw + 14), y, bw, 84, rot, () => g.tocarGrave(f), { variante: g.freqGrave === f ? 'primario' : 'secundario', tamanho: 28 });
      });
      const respostas = [
        ['ouco', 'Ouço'],
        ['sinto', 'Sinto vibrar'],
        ['ambos', 'Os dois'],
        ['nada', 'Nada'],
      ];
      const yb = y + 108;
      respostas.forEach(([id, rot], i) => {
        const marcado = g.freqGrave && gr.respostas[g.freqGrave] === id;
        p.botao(`g-r-${id}`, X + i * (bw + 14), yb, bw, 76, rot, () => g.responderGrave(id), { variante: marcado ? 'ativo' : 'secundario', desabilitado: !g.freqGrave, tamanho: 24 });
      });
    },
    status(g) {
      const gr = mod(g.app, 'graves');
      const n = FREQS_GUIA.filter((f) => gr.respostas[f]).length;
      if (!g.freqGrave) return 'Toque numa frequência para ouvir o tom.';
      return `${g.freqGrave} Hz · respostas: ${n} de ${FREQS_GUIA.length}. No modo livre há 15 frequências e uma varredura.`;
    },
    sair(g) {
      const gr = mod(g.app, 'graves');
      gr.parar();
      if (FREQS_GUIA.some((f) => gr.respostas[f])) gr.salvar();
    },
  },
  {
    id: 'simulador',
    modulo: 'simulador',
    titulo: 'Como soa com perda auditiva',
    texto: 'Toque a música e troque o perfil. O laboratório aproxima uma perda auditiva ou um implante coclear em todo o som. Serve para conferir a mixagem; não mostra como uma pessoa surda ouve.',
    acoes(g, p, y) {
      const sim = mod(g.app, 'simulador');
      const tocando = sim.tocador && sim.tocador.tocando;
      p.botao('g-sim-tocar', X, y, 330, 84, tocando ? 'Parar música' : 'Tocar música', () => sim.tocarMusica(), { variante: 'primario', tamanho: 28 });
      p.botao('g-sim-ab', X + 350, y, LARGURA - 350, 84, sim.op.ativo ? 'Comparar: ouvindo o simulado' : 'Comparar: ouvindo o normal', () => {
        sim.op.ativo = !sim.op.ativo;
        sim.aplicar();
      }, { variante: sim.op.ativo ? 'ativo' : 'secundario', tamanho: 23 });
      const perfis = [
        ['normal', 'Audição típica'],
        ['idade', 'Perda da idade'],
        ['profunda', 'Surdez profunda'],
        ['ic8', 'Implante coclear'],
      ];
      const bw = (LARGURA - 3 * 14) / 4;
      perfis.forEach(([id, rot], i) => {
        p.botao(`g-sim-${id}`, X + i * (bw + 14), y + 106, bw, 76, rot, () => {
          sim.presetId = id;
          sim.op.ativo = true;
          sim.aplicar();
        }, { variante: sim.presetId === id ? 'ativo' : 'secundario', tamanho: 21 });
      });
    },
    status(g) {
      const sim = mod(g.app, 'simulador');
      const pr = sim.preset();
      return pr.desc;
    },
    sair(g) {
      const sim = mod(g.app, 'simulador');
      if (sim.tocador && sim.tocador.tocando) sim.tocador.parar();
      sim.presetId = 'normal';
      sim.op.ativo = true;
      sim.aplicar();
    },
  },
  {
    id: 'musica',
    modulo: 'musica',
    titulo: 'A música vira luz',
    texto: 'Sem som, o ritmo aparece nas velas, nas runas e no chão. Toque a música e depois desligue o som: dá para seguir o tempo só olhando? O mix Essencial é o que funciona melhor para quem usa implante.',
    acoes(g, p, y) {
      const mus = mod(g.app, 'musica');
      const tocando = mus.tocador && mus.tocador.tocando;
      p.botao('g-mus-tocar', X, y, 330, 84, tocando ? 'Parar' : 'Tocar', () => mus.alternar(), { variante: 'primario', tamanho: 30 });
      const som = g.app.estado.som;
      p.botao('g-mus-som', X + 350, y, LARGURA - 350, 84, som ? 'Som ligado (toque para desligar)' : 'Som desligado (toque para ligar)', () => g.app.definirEstado('som', !som), { variante: som ? 'secundario' : 'ativo', tamanho: 22 });
      const mixes = [
        ['original', 'Original'],
        ['essencial', 'Essencial'],
        ['ritmo', 'Só ritmo'],
      ];
      const bw = (LARGURA - 2 * 14) / 3;
      mixes.forEach(([id, rot], i) => {
        p.botao(`g-mix-${id}`, X + i * (bw + 14), y + 106, bw, 76, rot, () => {
          mus.mix = id;
          mus.aplicarMix();
          p.marcarSujo();
        }, { variante: mus.mix === id ? 'ativo' : 'secundario', tamanho: 24 });
      });
    },
    sair(g) {
      const mus = mod(g.app, 'musica');
      if (mus.tocador && mus.tocador.tocando) mus.tocador.parar();
      g.app.definirEstado('som', true);
    },
  },
  {
    id: 'ritmo',
    modulo: 'ritmo',
    titulo: 'Ritmo que se vê',
    texto: 'Uma bola vai quicar no tambor à sua frente, em silêncio. Toque no tambor com o dedo (ou faça a pinça) cada vez que a bola bater. Primeiro vêm 4 tempos de contagem; depois, 16 medidos.',
    vivo: true,
    acoes(g, p, y) {
      const rit = mod(g.app, 'ritmo');
      if (rit.fase === 'medindo') {
        p.botao('g-rit-parar', X, y, 300, 84, 'Encerrar', () => rit.cancelar(), { variante: 'perigo', tamanho: 26 });
        p.texto(`Toques: ${rit.toques.length}`, X + 340, y + 60, { fonte: FONTE.titulo(52), cor: COR.tinta });
        return;
      }
      if (rit.fase === 'fim' && rit.resultado) {
        const r = rit.resultado;
        const media = isFinite(r.media) ? `${Math.round(Math.abs(r.media))} ms ${r.media < 0 ? 'adiantado' : 'atrasado'}` : '—';
        p.retangulo(X + 320, y, LARGURA - 320, 96, 20, '#e5f4e4', 'rgba(66,67,58,0.35)', 3);
        p.texto(`Em média, ${media}`, X + 342, y + 40, { fonte: FONTE.forte(26), cor: COR.tinta, maxLargura: LARGURA - 364 });
        p.texto(`${r.dentro}% dos toques a até 100 ms da batida (${r.n} de ${r.esperados})`, X + 342, y + 76, { fonte: FONTE.texto(21), cor: COR.carvao, maxLargura: LARGURA - 364 });
      }
      p.botao('g-rit-comecar', X, y, 300, 96, rit.fase === 'fim' ? 'Fazer de novo' : 'Começar', () => {
        rit.cfg.modo = 'bola';
        rit.cfg.bpm = 80;
        rit.iniciar();
      }, { variante: 'primario', tamanho: 30 });
      p.textoQuebrado('No modo livre dá para comparar som, flash, bola e mão-guia, em 60 a 120 batidas por minuto.', X, y + 140, LARGURA, 32, { fonte: FONTE.texto(22), cor: COR.carvao });
    },
    sair(g) {
      mod(g.app, 'ritmo').cancelar();
    },
  },
  {
    id: 'medidor',
    modulo: 'medidor',
    titulo: 'Quão alto está o som?',
    texto: 'O medidor mostra o volume como o ouvido percebe (LUFS), medido no próprio Quest. Para jogos portáteis, a referência é perto de −16 LUFS. Toque a música e veja o número.',
    vivo: true,
    acoes(g, p, y) {
      const mus = mod(g.app, 'musica');
      const tocando = mus.tocador && mus.tocador.tocando;
      p.botao('g-med-tocar', X, y, 330, 84, tocando ? 'Parar música' : 'Tocar música', () => mus.alternar(), { variante: 'primario', tamanho: 28 });
      const l = g.app.motor.leitura || {};
      p.texto(`${formatarDb(l.curto)} LUFS`, X + 380, y + 62, { fonte: FONTE.titulo(54), cor: COR.tinta });
      const v = isFinite(l.curto) ? (l.curto + 40) / 40 : 0;
      p.barraNivel(X, y + 120, LARGURA, 30, v, COR.cianoSignaria, [24 / 40]);
      p.texto('−16 LUFS', X + LARGURA * (24 / 40) - 44, y + 182, { fonte: FONTE.forte(20), cor: COR.carvao });
    },
    sair(g) {
      const mus = mod(g.app, 'musica');
      if (mus.tocador && mus.tocador.tocando) mus.tocador.parar();
    },
  },
  {
    id: 'fim',
    titulo: 'Pronto!',
    texto: 'Você passou pelos sistemas do laboratório. No modo livre, cada um tem mais opções, e há também o teste de Localização. Os resultados ficam guardados neste aparelho, na aba Resultados.',
    acoes(g, p, y) {
      p.botao('g-livre', X, y, 470, 96, 'Ir para o modo livre', () => g.app.definirModo('livre'), { variante: 'primario', tamanho: 30 });
      p.botao('g-recomecar', X + 494, y, LARGURA - 494, 96, 'Recomeçar o guia', () => g.ir(0), { tamanho: 28 });
    },
  },
];

export class Guia {
  constructor(app) {
    this.app = app;
    this.i = 0;
    this.volta = null;
    this.freqGrave = null;
    this.ultimoRedesenho = 0;
  }

  get passo() {
    return PASSOS[this.i];
  }

  comecar() {
    this.i = 0;
    this.entrarPasso();
  }

  sair() {
    const s = this.passo;
    if (s && s.sair) s.sair(this);
  }

  ir(n) {
    const novo = Math.max(0, Math.min(PASSOS.length - 1, n));
    if (novo === this.i) return;
    this.sair();
    this.i = novo;
    this.entrarPasso();
  }

  entrarPasso() {
    const s = this.passo;
    if (s.modulo) this.app.ativarModulo(s.modulo);
    this.freqGrave = null;
    this.app.painel.marcarSujo();
  }

  // ---- Passo "volta": uma tesoura girando em volta da cabeça (sentido horário, como no barbeiro) ----
  async iniciarVolta() {
    const app = this.app;
    const centro = app.mundoParaSala(app.posicaoCabeca());
    const yaw = Math.atan2(-app.direcaoOlhar().x, -app.direcaoOlhar().z) - app.mundo.rotation.y;
    this.volta = { centro, az: yaw / RAD + 90, raio: 1.1, reg: null };
    const v = this.volta;
    v.reg = await app.adicionarFonte({ itemId: 'tesoura', local: this.posVolta(v), loop: true, volume: 0.9, rotulo: 'Tesoura' });
    if (this.volta !== v) {
      app.removerFonte(v.reg);
      return;
    }
    v.reg.fonte.tocar();
    app.painel.marcarSujo();
  }

  posVolta(v) {
    const az = v.az * RAD;
    return new THREE.Vector3(v.centro.x - Math.sin(az) * v.raio, v.centro.y, v.centro.z - Math.cos(az) * v.raio);
  }

  pararVolta() {
    if (this.volta && this.volta.reg) this.app.removerFonte(this.volta.reg);
    this.volta = null;
    this.app.painel.marcarSujo();
  }

  // ---- Passo "graves" ----
  tocarGrave(f) {
    const gr = mod(this.app, 'graves');
    this.freqGrave = f;
    gr.modo = 'tom';
    gr.idx = gr.indiceDe(f);
    gr.tocar();
  }

  responderGrave(r) {
    if (!this.freqGrave) return;
    mod(this.app, 'graves').respostas[this.freqGrave] = r;
    this.app.painel.marcarSujo();
  }

  atualizar(dt, t) {
    const v = this.volta;
    if (v && v.reg) {
      v.az = (v.az - 50 * dt) % 360; // horário: esquerda, frente, direita, costas
      v.reg.local.copy(this.posVolta(v));
    }
    if (this.passo.vivo && t - this.ultimoRedesenho > 0.2) {
      this.ultimoRedesenho = t;
      this.app.painel.marcarSujo();
    }
  }

  desenhar(p) {
    const app = this.app;
    const s = this.passo;
    p.cartela(0, 0, p.W, p.H, { fundo: COR.pergaminho, borda: COR.carvao, raio: 30, espessura: 7 });
    // Topo: progresso e atalhos
    p.retangulo(26, 20, 108, 46, 23, COR.roxo, null);
    p.texto('GUIA', 80, 44, { fonte: FONTE.rotulo(24), cor: COR.branco, alinhar: 'center', base: 'middle' });
    p.texto(this.i === 0 ? 'Boas-vindas' : this.i === PASSOS.length - 1 ? 'Fim' : `Passo ${this.i} de ${PASSOS.length - 2}`, 152, 54, { fonte: FONTE.forte(26), cor: COR.tinta });
    const x0 = 524;
    [['som', 'SOM'], ['pistas', 'PISTAS'], ['legendas', 'LEGENDAS']].forEach(([k, rot], i) => {
      p.botao(`g-topo-${k}`, x0 + i * 106, 18, 98, 50, rot, () => app.definirEstado(k, !app.estado[k]), { variante: app.estado[k] ? 'ativo' : 'secundario', tamanho: 18 });
    });
    p.botao('g-topo-livre', x0 + 3 * 106, 18, W - 26 - (x0 + 3 * 106), 50, 'Modo livre', () => app.definirModo('livre'), { tamanho: 19 });
    const g = p.g;
    g.strokeStyle = 'rgba(68,65,65,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(24, 84);
    g.lineTo(p.W - 24, 84);
    g.stroke();
    // Conteúdo
    p.texto(s.titulo, X, 150, { fonte: FONTE.titulo(44), cor: COR.tinta, maxLargura: LARGURA });
    p.textoQuebrado(s.texto, X, 200, LARGURA, 36, { fonte: FONTE.texto(25), cor: COR.carvao });
    if (s.acoes) s.acoes(this, p, Y_ACOES);
    const status = s.status ? s.status(this) : '';
    if (status) p.texto(status, X, 600, { fonte: FONTE.texto(21), cor: COR.carvao, maxLargura: LARGURA });
    // Navegação
    const yN = 618;
    p.botao('g-voltar', 30, yN, 230, 66, '← Voltar', () => this.ir(this.i - 1), { desabilitado: this.i === 0, tamanho: 25 });
    if (this.i < PASSOS.length - 1) {
      p.botao('g-proximo', p.W - 30 - 260, yN, 260, 66, this.i === 0 ? 'Começar →' : 'Próximo →', () => this.ir(this.i + 1), { variante: 'primario', tamanho: 26 });
    }
    const n = PASSOS.length;
    const cx0 = p.W / 2 - ((n - 1) * 26) / 2;
    for (let k = 0; k < n; k++) {
      g.beginPath();
      g.arc(cx0 + k * 26, yN + 20, k === this.i ? 9 : 6, 0, Math.PI * 2);
      g.fillStyle = k <= this.i ? COR.roxo : 'rgba(66,67,58,0.22)';
      g.fill();
    }
    if (app.emVR) {
      p.texto(app.painelFixo ? 'Painel parado' : 'O painel acompanha o seu olhar', p.W / 2, yN + 58, { fonte: FONTE.texto(17), cor: COR.carvao, alinhar: 'center' });
    }
    p.alca('alca', p.W / 2 - 90, p.H - 14, 180, 10);
  }
}
