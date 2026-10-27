// A sala da Maga: o "barbeiro virtual" com espelho. Cada passo espera o jogador (nada avança sozinho).
import * as THREE from 'three';
import { posicaoVolta } from '../cena/pirikito.js';
import { titulo, paragrafo, subtitulo } from './comum.js';
import { TocadorMusica } from './tocador-musica.js';
import { spriteTexto } from '../cena/efeitos.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

export const PASSOS = [
  {
    titulo: 'Pronto para começar',
    texto: 'Fique em pé, olhando para a mesa com a maquete. Se a sala estiver torta, toque em Recentrar. O espelho fica atrás de você.',
  },
  {
    titulo: '1. Chegada',
    texto: 'A lareira estala à esquerda e o círculo mágico zumbe à direita. Gire a cabeça: os sons ficam no lugar. Quem não ouve vê o fogo e a luz dele no chão.',
  },
  {
    titulo: '2. O espelho chama, de trás',
    texto: 'Um brilho nasce atrás de você. Quem não ouve vê a luz chegando por trás, a própria sombra no chão apontando para a frente e faíscas passando pelos lados. Vire e toque no vidro.',
  },
  {
    titulo: '3. O espelho acorda',
    texto: 'Agora o brilho do espelho está à sua frente e você vê o seu reflexo.',
  },
  {
    titulo: '4. O portal abre, atrás',
    texto: 'O portal da Aia abre do outro lado da sala. Quem ouve escuta pelas costas; quem não ouve vê o portal e a Aia no espelho.',
  },
  {
    titulo: '5. O Pirikito dá a volta',
    texto: 'As asas passam pela esquerda, frente, direita e costas, como a tesoura do barbeiro virtual. Acompanhe pelo espelho e pelo rastro de faíscas.',
  },
  {
    titulo: '6. A Aia cumprimenta',
    texto: 'A música da sala entra baixa, presa à cabeça, e as velas e runas pulsam no tempo. Na cena real, a Aia sinaliza OLÁ, BEM-VINDO e CASA.',
  },
];

export class ModuloSalaMaga {
  constructor() {
    this.id = 'sala';
    this.nome = 'Sala da Maga';
    this.passo = 0;
    this.fontes = {};
    this.voo = null;
    this.faiscas = [];
    this.musica = null;
    this.tempoHaptica = 0;
  }

  entrar() {
    const app = this.app;
    app.espelho.aoAcordar = () => {
      if (this.passo === 2) this.irPara(3);
    };
  }

  sair() {
    this.app.espelho.aoAcordar = null;
  }

  async irPara(n) {
    const app = this.app;
    if (!app.motor.pronto) await app.iniciarAudio();
    while (this.passo < n) {
      this.passo++;
      await this.executar(this.passo);
    }
    app.painel.marcarSujo();
  }

  async repetir() {
    const p = this.passo;
    if (p === 0) return;
    if (p === 4) {
      await this.tocarPortal();
    } else if (p === 5) {
      this.iniciarVoo();
    } else if (p === 2) {
      this.app.espelho.dormir();
      this.app.luzDeTras.alvo = 1;
      this.criarFaiscas();
    }
  }

  async executar(n) {
    const app = this.app;
    if (n === 1) {
      this.fontes.lareira = await app.adicionarFonte({
        itemId: 'lareira',
        local: app.ancora('lareira', new THREE.Vector3(-4.75, 0, -0.9)).add(new THREE.Vector3(0.4, 0.5, 0)),
        loop: true,
        volume: 0.8,
        barramento: 'ambiente',
      });
      this.fontes.lareira.fonte.tocar();
      this.fontes.zumbido = await app.adicionarFonte({
        itemId: 'zumbido',
        local: app.ancora('circuloDLC').add(new THREE.Vector3(0, 0.4, 0)),
        loop: true,
        volume: 0.3,
        barramento: 'ambiente',
      });
      this.fontes.zumbido.fonte.tocar();
    }
    if (n === 2) {
      app.espelho.dormir();
      this.fontes.espelho = await app.adicionarFonte({
        itemId: 'espelho',
        local: app.ancora('espelho'),
        loop: true,
        volume: 0.9,
      });
      this.fontes.espelho.fonte.tocar();
      app.luzDeTras.alvo = 1;
      this.criarFaiscas();
    }
    if (n === 3) {
      app.espelho.acordar();
      app.luzDeTras.alvo = 0;
      if (this.fontes.espelho) this.fontes.espelho.fonte.definirVolume(0.3);
      app.legendas.mostrar('o espelho acordou', { duracao: 2.5 });
    }
    if (n === 4) {
      await this.tocarPortal();
      setTimeout(() => {
        app.aiaLugar.userData.visivel = true;
      }, 1200);
    }
    if (n === 5) {
      this.fontes.asas = await app.adicionarFonte({
        itemId: 'asas',
        seguir: app.pirikito,
        loop: true,
        volume: 0.9,
        marcador: false,
      });
      this.iniciarVoo();
    }
    if (n === 6) {
      this.musica = this.musica || new TocadorMusica(app);
      await this.musica.carregar('exemplo');
      this.musica.definirVolumeGeral(0.35);
      await this.musica.tocar({ espacial: false });
      app.legendas.mostrar('música da sala', { duracao: 3 });
      if (!this.rotuloSinais) {
        this.rotuloSinais = spriteTexto('OLÁ · BEM-VINDO · CASA (em LIBRAS)', { tamanho: 34, largura: 820 });
        this.rotuloSinais.position.copy(app.ancora('aia')).add(new THREE.Vector3(0, 2.25, 0));
        app.mundo.add(this.rotuloSinais);
      }
      this.rotuloSinais.visible = true;
    }
  }

  async tocarPortal() {
    const app = this.app;
    app.portal.userData.aberto = true;
    const pos = app.ancora('portal').add(new THREE.Vector3(0, 1.25, 0));
    const reg = await app.adicionarFonte({ itemId: 'portal', local: pos, loop: false, volume: 1, marcador: false });
    reg.fonte.aoTerminar = () => setTimeout(() => app.removerFonte(reg), 100);
    reg.fonte.tocar();
  }

  iniciarVoo() {
    const app = this.app;
    const cab = app.mundoParaSala(app.posicaoCabeca());
    const inicio = app.pirikito.position.clone();
    const pouso = app.ancora('espelho').add(new THREE.Vector3(0, 0.98, -0.02));
    this.voo = { t: 0, inicio, cab, pouso, duracaoIda: 1.6, duracaoVolta: 7.0, duracaoPouso: 1.6 };
    app.pirikito.userData.voando = true;
    if (this.fontes.asas && !this.fontes.asas.fonte.tocando) this.fontes.asas.fonte.tocar();
  }

  atualizarVoo(dt) {
    const app = this.app;
    const v = this.voo;
    if (!v) return;
    v.t += dt;
    const raio = 0.62;
    const p = app.pirikito.position;
    let alvoOlhar = null;
    if (v.t < v.duracaoIda) {
      const k = suave(v.t / v.duracaoIda);
      const entrada = posicaoVolta(v.cab, raio, v.cab.y, 0);
      p.lerpVectors(v.inicio, entrada, k);
      p.y += Math.sin(k * Math.PI) * 0.4;
      alvoOlhar = entrada;
    } else if (v.t < v.duracaoIda + v.duracaoVolta) {
      const fase = ((v.t - v.duracaoIda) / v.duracaoVolta) * 2; // duas voltas
      p.copy(posicaoVolta(v.cab, raio, v.cab.y, fase));
      alvoOlhar = posicaoVolta(v.cab, raio, v.cab.y, fase + 0.05);
    } else if (v.t < v.duracaoIda + v.duracaoVolta + v.duracaoPouso) {
      const k = suave((v.t - v.duracaoIda - v.duracaoVolta) / v.duracaoPouso);
      const ultimo = posicaoVolta(v.cab, raio, v.cab.y, 2);
      p.lerpVectors(ultimo, v.pouso, k);
      p.y += Math.sin(k * Math.PI) * 0.3;
      alvoOlhar = v.pouso;
    } else {
      p.copy(v.pouso);
      app.pirikito.rotation.set(0, Math.PI, 0);
      app.pirikito.userData.voando = false;
      if (this.fontes.asas) this.fontes.asas.fonte.parar();
      this.voo = null;
      return;
    }
    if (alvoOlhar) {
      // O Pirikito olha para onde vai (a frente do modelo é -Z).
      const mundoAlvo = app.salaParaMundo(alvoOlhar);
      const atual = app.salaParaMundo(p.clone());
      const dir = mundoAlvo.sub(atual);
      if (dir.lengthSq() > 1e-6) app.pirikito.rotation.set(0, Math.atan2(-dir.x, -dir.z) - app.mundo.rotation.y, 0);
    }
    // Nada vibra nas mãos (regra da equipe): a direção do voo aparece no espelho, nas setas e nas legendas.
  }

  criarFaiscas() {
    const app = this.app;
    for (const f of this.faiscas) app.mundo.remove(f.sprite);
    this.faiscas = [];
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(116,208,216,0.95)';
    g.translate(32, 32);
    g.rotate(Math.PI / 4);
    g.fillRect(-12, -12, 24, 24);
    const tex = new THREE.CanvasTexture(c);
    const origem = app.ancora('espelho');
    const cab = app.mundoParaSala(app.posicaoCabeca());
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.setScalar(0.05 + Math.random() * 0.04);
      app.mundo.add(s);
      const lado = i % 2 ? 1 : -1;
      this.faiscas.push({
        sprite: s,
        atraso: i * 0.35,
        t: 0,
        origem: origem.clone(),
        lado,
        altura: cab.y - 0.3 + Math.random() * 0.6,
        cab: cab.clone(),
      });
    }
  }

  atualizarFaiscas(dt) {
    for (const f of this.faiscas) {
      f.t += dt;
      const t = (f.t - f.atraso) / 2.4;
      if (t < 0) {
        f.sprite.visible = false;
        continue;
      }
      const ciclo = t % 1;
      f.sprite.visible = this.app.estado.pistas;
      // Sai do espelho, passa pelo lado do jogador e some à frente da visão periférica.
      const ini = f.origem;
      const lateral = new THREE.Vector3(f.cab.x + f.lado * 0.75, f.altura, f.cab.z);
      const fim = new THREE.Vector3(f.cab.x + f.lado * 0.55, f.altura + 0.2, f.cab.z - 1.4);
      const pos = ciclo < 0.5 ? new THREE.Vector3().lerpVectors(ini, lateral, ciclo * 2) : new THREE.Vector3().lerpVectors(lateral, fim, (ciclo - 0.5) * 2);
      f.sprite.position.copy(pos);
      f.sprite.material.opacity = Math.sin(ciclo * Math.PI);
    }
  }

  limparFaiscas() {
    for (const f of this.faiscas) this.app.mundo.remove(f.sprite);
    this.faiscas = [];
  }

  reiniciar() {
    const app = this.app;
    for (const k of Object.keys(this.fontes)) app.removerFonte(this.fontes[k]);
    this.fontes = {};
    if (this.musica) this.musica.parar();
    app.portal.userData.aberto = false;
    app.aiaLugar.userData.visivel = false;
    app.espelho.dormir();
    app.luzDeTras.alvo = 0;
    this.limparFaiscas();
    this.voo = null;
    app.pirikito.userData.voando = false;
    app.pirikito.position.copy(app.ancora('pirikito'));
    app.pirikito.rotation.set(0, 0.5, 0);
    if (this.rotuloSinais) this.rotuloSinais.visible = false;
    this.passo = 0;
    app.painel.marcarSujo();
  }

  atualizar(dt) {
    const app = this.app;
    if (this.passo >= 2 && app.luzDeTras.alvo > 0) {
      const espelhoMundo = app.salaParaMundo(app.ancora('espelho'));
      espelhoMundo.y = 0;
      const pes = app.posicaoCabeca();
      pes.y = 0;
      app.luzDeTras.definir(espelhoMundo, pes, app.estado.pistas ? 1 : 0);
      this.atualizarFaiscas(dt);
    } else if (this.faiscas.length && app.luzDeTras.intensidade < 0.05) {
      this.limparFaiscas();
    }
    this.atualizarVoo(dt);
    if (this.musica && this.musica.tocando) {
      const n = this.musica.batidas();
      if (n > 0) app.pulsoMusica = 1;
    }
  }

  desenhar(p, a) {
    const app = this.app;
    const passo = PASSOS[this.passo];
    titulo(p, a, passo.titulo);
    const altura = paragrafo(p, a.x, a.y + 76, a.w, passo.texto, 23);
    let y = a.y + 90 + altura;
    const ultimo = this.passo >= PASSOS.length - 1;
    p.botao('sala-proximo', a.x, y, 300, 70, this.passo === 0 ? 'Começar' : ultimo ? 'Fim da cena' : 'Próximo passo', () => this.irPara(this.passo + 1), {
      variante: 'primario',
      desabilitado: ultimo,
      tamanho: 25,
    });
    p.botao('sala-repetir', a.x + 316, y, 210, 70, 'Repetir passo', () => this.repetir(), { desabilitado: ![2, 4, 5].includes(this.passo), tamanho: 22 });
    p.botao('sala-reiniciar', a.x + 542, y, 210, 70, 'Reiniciar', () => this.reiniciar(), { tamanho: 22 });
    y += 100;
    subtitulo(p, a.x, y, 'Experimentar como:');
    const modo = !app.estado.som ? 'surdo' : !app.estado.pistas ? 'ouvinte' : 'todos';
    const opcoes = [
      ['todos', 'Som + pistas'],
      ['surdo', 'Sem som (só pistas)'],
      ['ouvinte', 'Só som (sem pistas)'],
    ];
    opcoes.forEach(([id, rot], i) => {
      p.botao(`sala-modo-${id}`, a.x + i * 256, y + 16, 244, 60, rot, () => {
        app.definirEstado('som', id !== 'surdo');
        app.definirEstado('pistas', id !== 'ouvinte');
        app.definirEstado('legendas', id !== 'ouvinte');
      }, { variante: modo === id ? 'ativo' : 'secundario', tamanho: 20 });
    });
    y += 108;
    p.botao('sala-recentrar', a.x, y, 250, 60, 'Recentrar sala', () => app.recentrar(), { tamanho: 21 });
    p.botao('sala-hrtf', a.x + 266, y, 250, 60, app.estado.hrtf ? 'Som 3D: HRTF' : 'Som 3D: simples', () => app.definirEstado('hrtf', !app.estado.hrtf), {
      variante: app.estado.hrtf ? 'ativo' : 'secundario',
      tamanho: 21,
    });
    // Progresso dos passos
    const yP = a.y + a.h - 22;
    for (let i = 1; i < PASSOS.length; i++) {
      const cx = a.x + 20 + (i - 1) * 40;
      const g = p.g;
      g.beginPath();
      g.arc(cx, yP, 12, 0, Math.PI * 2);
      g.fillStyle = i <= this.passo ? COR.cianoSignaria : 'rgba(66,67,58,0.18)';
      g.fill();
    }
    p.texto(`passo ${this.passo} de ${PASSOS.length - 1}`, a.x + 20 + (PASSOS.length - 1) * 40, yP + 8, { fonte: FONTE.forte(20), cor: COR.carvao });
  }
}

function suave(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
