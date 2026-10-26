// Núcleo do Laboratório VibrAção: cena 3D, VR, painel principal, fontes de som e pistas visuais.
import * as THREE from 'three';
import { MotorAudio } from './audio/motor.js';
import { Biblioteca } from './audio/biblioteca.js';
import { criarSala, animarSala, ANCORAS } from './cena/sala.js';
import { Espelho } from './cena/espelho.js';
import { criarPirikito, baterAsas } from './cena/pirikito.js';
import { MarcadorSom, SetasDirecao, Legendas, LuzDeTras, OndasChao, direcaoRelativa, spriteTexto } from './cena/efeitos.js';
import { Painel } from './ui/painel.js';
import { Interacao } from './ui/interacao.js';
import { COR, FONTE } from './ui/estilo-ui.js';
import { lerPreferencia, salvarPreferencia, adicionarResultado } from './util/armazenamento.js';

const LARGURA_ABAS = 230;
const ALTURA_TOPO = 84;
const ALTURA_RODAPE = 52;

export class App {
  constructor({ canvas, aoMudarEstado = () => {} }) {
    this.canvas = canvas;
    this.aoMudarEstado = aoMudarEstado;
    this.estado = {
      som: true,
      pistas: true,
      legendas: true,
      haptica: true,
      hrtf: true,
      ...lerPreferencia('estado', {}),
    };
    this.estado.som = true; // sempre começa com som
    this.alertaTexto = '';
    this.alertaAte = 0;
    this.fontes = [];
    this.relogio = new THREE.Clock();
    this.tempo = 0;
    this.pulsoMusica = 0;
    this.emVR = false;

    // Renderização
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    this.renderer = r;
    this.cena = new THREE.Scene();
    this.cena.background = new THREE.Color(0x162a2c);
    this.jogador = new THREE.Group();
    this.jogador.name = 'Jogador';
    this.cena.add(this.jogador);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 80);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.order = 'YXZ';
    this.jogador.add(this.camera);

    // Mundo (a sala e tudo que é dela)
    this.mundo = new THREE.Group();
    this.mundo.name = 'Mundo';
    this.cena.add(this.mundo);
    const { sala, animaveis } = criarSala();
    this.sala = sala;
    this.salaAnimaveis = animaveis;
    this.mundo.add(sala);
    this.espelho = new Espelho({ mundo: this.mundo, posicao: ANCORAS.espelho });
    this.espelho.registrar(sala);
    this.pirikito = criarPirikito();
    this.pirikito.position.copy(ANCORAS.pirikito);
    this.mundo.add(this.pirikito);
    this.espelho.registrar(this.pirikito);
    this.criarPortalEAia();
    this.salaGLB = null;

    // Pistas visuais
    this.setas = new SetasDirecao(this.camera);
    this.legendas = new Legendas(this.camera);
    this.luzDeTras = new LuzDeTras(this.mundo);
    this.ondas = new OndasChao(this.mundo);

    // Áudio
    this.motor = new MotorAudio();
    this.biblioteca = new Biblioteca(this.motor);

    // Painel principal
    this.painel = new Painel({ largura: 1024, altura: 704, larguraM: 0.74, nome: 'PainelPrincipal' });
    this.painel.desenhar = (p) => this.desenharPainel(p);
    this.cena.add(this.painel.grupo);
    this.painel.grupo.position.set(0, 1.25, -0.6);
    this.painel.grupo.rotation.x = -0.35;

    this.interacao = new Interacao(this);
    this.interacao.configurarXR(r, this.jogador);
    this.interacao.configurarMouse(canvas, this.camera);
    this.interacao.adicionarPainel(this.painel);
    this.interacao.adicionarInterativo(this.espelho.vidro);
    this.interacao.aoTocarBotao = () => this.somDeToque();
    this.criarBotaoPulso();

    this.modulos = [];
    this.moduloAtivo = null;

    // Teclado no modo PC
    this.teclas = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      this.teclas.add(e.code);
      if (e.code === 'Space' && this.moduloAtivo && this.moduloAtivo.aoEspaco) {
        e.preventDefault();
        this.moduloAtivo.aoEspaco();
      }
    });
    window.addEventListener('keyup', (e) => this.teclas.delete(e.code));

    r.xr.addEventListener('sessionstart', () => {
      this.emVR = true;
      this.camera.rotation.set(0, 0, 0);
      setTimeout(() => this.trazerPainel(), 300);
      this.aoMudarEstado({ vr: true });
    });
    r.xr.addEventListener('sessionend', () => {
      this.emVR = false;
      this.camera.position.set(0, 1.6, 0);
      this.aoMudarEstado({ vr: false });
    });

    this.redimensionar();
    window.addEventListener('resize', () => this.redimensionar());
    r.setAnimationLoop((t, frame) => this.quadro(t, frame));
  }

  // ------------------------------------------------------------------
  // Cena
  // ------------------------------------------------------------------
  criarPortalEAia() {
    const portal = new THREE.Group();
    portal.position.set(ANCORAS.portal.x, 1.25, ANCORAS.portal.z);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 12, 64), new THREE.MeshBasicMaterial({ color: 0x74d0d8 }));
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(116,208,216,0.7)');
    grad.addColorStop(1, 'rgba(88,196,200,0.05)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const disco = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 48),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    portal.add(aro, disco);
    portal.scale.setScalar(0.001);
    portal.visible = false;
    portal.userData.abertura = 0;
    this.mundo.add(portal);
    this.portal = portal;
    this.espelho.registrar(portal);

    // Lugar da Aia (silhueta provisória, conceito).
    const aia = new THREE.Group();
    aia.position.set(ANCORAS.aia.x, 0, ANCORAS.aia.z);
    const matAia = new THREE.MeshBasicMaterial({ color: 0x74d0d8, transparent: true, opacity: 0.55, depthWrite: false });
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.95, 6, 16), matAia);
    corpo.position.y = 0.75;
    const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), matAia);
    cabeca.position.y = 1.62;
    const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: 0xa0522d, transparent: true, opacity: 0.7, depthWrite: false }));
    cabelo.position.y = 1.64;
    const rotulo = spriteTexto('AIA (lugar provisório)', { tamanho: 34, largura: 600 });
    rotulo.position.y = 2.0;
    aia.add(corpo, cabeca, cabelo, rotulo);
    aia.visible = false;
    aia.userData.alpha = 0;
    this.mundo.add(aia);
    this.aiaLugar = aia;
    this.espelho.registrar(aia);
  }

  // Botão no pulso esquerdo (mãos) ou no controle esquerdo: traz o menu para a frente.
  criarBotaoPulso() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = COR.ambar;
    g.beginPath();
    g.arc(64, 64, 60, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = COR.contorno;
    g.stroke();
    g.fillStyle = COR.contorno;
    for (const y of [42, 62, 82]) g.fillRect(34, y - 5, 60, 10);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const botao = new THREE.Mesh(new THREE.CircleGeometry(0.022, 24), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    botao.userData.interativo = {
      toque: { largura: 0.05, altura: 0.05 },
      aoPressionar: () => this.trazerPainel(),
    };
    botao.visible = false;
    this.botaoPulso = botao;
    this.cena.add(botao);
    this.interacao.adicionarInterativo(botao);
  }

  atualizarBotaoPulso() {
    const b = this.botaoPulso;
    b.visible = false;
    if (!this.emVR) return;
    for (const e of this.interacao.entradas) {
      if (!e.conectado || e.lado !== 'left') continue;
      let ref = null;
      const local = new THREE.Vector3();
      if (e.ehMao && e.mao.joints && e.mao.joints['wrist']) {
        ref = e.mao.joints['wrist'];
        local.set(0, 0.03, 0.045);
      } else if (!e.ehMao) {
        ref = e.pegada;
        local.set(0, 0.045, 0.05);
      }
      if (!ref) continue;
      ref.updateMatrixWorld();
      b.position.copy(local).applyMatrix4(ref.matrixWorld);
      // Vira para a cabeça.
      b.lookAt(this.posicaoCabeca());
      b.visible = true;
    }
  }

  // ------------------------------------------------------------------
  // Coordenadas
  // ------------------------------------------------------------------
  posicaoCabeca() {
    this.camera.updateMatrixWorld();
    return new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
  }

  direcaoOlhar() {
    this.camera.updateMatrixWorld();
    return new THREE.Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld);
  }

  // Converte um ponto do mundo (cena) para coordenadas da sala.
  mundoParaSala(v) {
    this.mundo.updateMatrixWorld();
    return this.mundo.worldToLocal(v.clone());
  }

  salaParaMundo(v) {
    this.mundo.updateMatrixWorld();
    return this.mundo.localToWorld(v.clone());
  }

  // Coloca a sala para que o ponto de início fique onde o jogador está, olhando para a frente dele.
  recentrar() {
    const cab = this.posicaoCabeca();
    const dir = this.direcaoOlhar();
    const yaw = Math.atan2(-dir.x, -dir.z);
    this.mundo.position.set(cab.x, 0, cab.z);
    this.mundo.rotation.set(0, yaw, 0);
    this.mundo.updateMatrixWorld(true);
    this.alerta('Sala recentrada: o espelho está atrás de você.');
  }

  trazerPainel() {
    const cab = this.posicaoCabeca();
    const dir = this.direcaoOlhar();
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const alvo = cab.clone().addScaledVector(dir, this.emVR ? 0.5 : 0.85);
    alvo.y = cab.y - (this.emVR ? 0.3 : 0.25);
    this.painel.grupo.position.copy(alvo);
    const olhar = cab.clone();
    olhar.y = cab.y + 0.05;
    this.painel.grupo.lookAt(olhar);
    this.painel.grupo.visible = true;
    this.painel.visivel = true;
  }

  girarCameraPC(dx, dy) {
    if (this.emVR) return;
    this.camera.rotation.y -= dx * 0.0045;
    this.camera.rotation.x = Math.max(-1.3, Math.min(1.3, this.camera.rotation.x - dy * 0.0045));
  }

  moverPC(dt) {
    if (this.emVR || !this.teclas.size) return;
    const v = 1.6 * dt;
    const giro = 1.6 * dt;
    const frente = new THREE.Vector3(-Math.sin(this.camera.rotation.y), 0, -Math.cos(this.camera.rotation.y));
    const direita = new THREE.Vector3(-frente.z, 0, frente.x);
    const t = this.teclas;
    if (t.has('KeyW')) this.camera.position.addScaledVector(frente, v);
    if (t.has('KeyS')) this.camera.position.addScaledVector(frente, -v);
    if (t.has('KeyD')) this.camera.position.addScaledVector(direita, v);
    if (t.has('KeyA')) this.camera.position.addScaledVector(direita, -v);
    if (t.has('ArrowLeft') || t.has('KeyQ')) this.camera.rotation.y += giro;
    if (t.has('ArrowRight') || t.has('KeyE')) this.camera.rotation.y -= giro;
    if (t.has('ArrowUp')) this.camera.rotation.x = Math.min(1.3, this.camera.rotation.x + giro * 0.6);
    if (t.has('ArrowDown')) this.camera.rotation.x = Math.max(-1.3, this.camera.rotation.x - giro * 0.6);
  }

  redimensionar() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------
  // Estado global
  // ------------------------------------------------------------------
  definirEstado(chave, valor) {
    this.estado[chave] = valor;
    salvarPreferencia('estado', this.estado);
    if (chave === 'som') this.motor.definirSomLigado(valor);
    if (chave === 'hrtf') this.motor.definirModeloPanoramico(valor ? 'HRTF' : 'equalpower');
    this.painel.marcarSujo();
    this.aoMudarEstado({ estado: { ...this.estado } });
  }

  alerta(texto, segundos = 4) {
    this.alertaTexto = texto;
    this.alertaAte = performance.now() + segundos * 1000;
    this.painel.marcarSujo();
    this.aoMudarEstado({ alerta: texto });
  }

  registrarResultado(modulo, resumo, dados) {
    adicionarResultado({ modulo, resumo, dados });
    this.alerta('Resultado salvo neste aparelho.');
    this.aoMudarEstado({ resultados: true });
  }

  somDeToque() {
    if (!this.motor.pronto) return;
    const ctx = this.motor.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    o.connect(g).connect(this.motor.barramentos.interface);
    o.start();
    o.stop(ctx.currentTime + 0.08);
  }

  // ------------------------------------------------------------------
  // Áudio e fontes
  // ------------------------------------------------------------------
  async iniciarAudio() {
    await this.motor.iniciar();
    this.motor.definirModeloPanoramico(this.estado.hrtf ? 'HRTF' : 'equalpower');
    this.motor.definirSomLigado(this.estado.som);
    const sim = lerPreferencia('simulador', null);
    if (sim && sim.config) this.motor.configurarSimulador(sim.config);
    this.painel.marcarSujo();
  }

  // opcoes: { itemId | buffer, local (Vector3 na sala) | seguir (Object3D), loop, volume, nome, legenda, cor,
  //           marcador (bool), barramento, espacial, envioSala }
  async adicionarFonte(opcoes = {}) {
    if (!this.motor.pronto) await this.iniciarAudio();
    let buffer = opcoes.buffer;
    let item = null;
    if (!buffer && opcoes.itemId) {
      item = this.biblioteca.item(opcoes.itemId);
      buffer = await this.biblioteca.obter(opcoes.itemId);
    }
    const nome = opcoes.nome || (item && item.nome) || 'Som';
    const fonte = this.motor.criarFonte({
      buffer,
      loop: opcoes.loop ?? (item ? item.loop : false),
      volume: opcoes.volume ?? 1,
      nome,
      legenda: opcoes.legenda || (item && item.legenda) || nome,
      cor: opcoes.cor || (item && item.cor) || '#74d0d8',
      espacial: opcoes.espacial !== false,
      barramento: opcoes.barramento || 'efeitos',
      envioSala: opcoes.envioSala,
      pan: opcoes.pan,
    });
    const reg = {
      fonte,
      local: opcoes.local ? opcoes.local.clone() : null,
      seguir: opcoes.seguir || null,
      marcador: null,
      mostrarMarcador: opcoes.marcador !== false && opcoes.espacial !== false,
      legenda: opcoes.semLegenda ? null : fonte.legenda,
      ultimaLegenda: -99,
      posMundo: new THREE.Vector3(),
    };
    if (reg.mostrarMarcador) {
      reg.marcador = new MarcadorSom({ cor: fonte.cor, rotulo: opcoes.rotulo || null });
      this.mundo.add(reg.marcador.grupo);
      reg.registroEspelho = this.espelho.registrar(reg.marcador.grupo);
    }
    this.fontes.push(reg);
    this.atualizarPosicaoFonte(reg);
    return reg;
  }

  removerFonte(reg) {
    if (!reg) return;
    reg.fonte.destruir();
    if (reg.marcador) {
      this.mundo.remove(reg.marcador.grupo);
      this.espelho.removerRegistro(reg.marcador.grupo);
    }
    this.fontes = this.fontes.filter((f) => f !== reg);
  }

  removerTodasFontes() {
    for (const f of [...this.fontes]) this.removerFonte(f);
  }

  atualizarPosicaoFonte(reg) {
    let local = reg.local;
    if (reg.seguir) {
      reg.seguir.updateMatrixWorld();
      reg.posMundo.setFromMatrixPosition(reg.seguir.matrixWorld);
      local = this.mundoParaSala(reg.posMundo);
    } else if (local) {
      reg.posMundo.copy(this.salaParaMundo(local));
    } else {
      // Sem posição: um pouco à frente da cabeça.
      reg.posMundo.copy(this.posicaoCabeca()).addScaledVector(this.direcaoOlhar(), 1);
      local = this.mundoParaSala(reg.posMundo);
    }
    if (reg.fonte.espacial) reg.fonte.definirPosicao(reg.posMundo.x, reg.posMundo.y, reg.posMundo.z);
    if (reg.marcador) reg.marcador.grupo.position.copy(local);
  }

  atualizarFontes(dt) {
    const paraSetas = [];
    for (const reg of this.fontes) {
      this.atualizarPosicaoFonte(reg);
      const nivel = reg.fonte.tocando ? reg.fonte.nivel() : 0;
      if (reg.marcador) {
        const visivel = this.estado.pistas && reg.mostrarMarcador && !reg.ocultarMarcador;
        reg.marcador.grupo.visible = visivel;
        reg.marcador.atualizar(dt, nivel, true);
      }
      if (reg.fonte.espacial && nivel > 0.004 && !reg.ocultarMarcador) {
        paraSetas.push({ posicao: reg.posMundo.clone(), nivel, cor: new THREE.Color(reg.fonte.cor) });
      }
      if (reg.legenda && nivel > 0.004 && this.tempo - reg.ultimaLegenda > 0.5) {
        reg.ultimaLegenda = this.tempo;
        const dir = reg.fonte.espacial ? direcaoRelativa(this.camera, reg.posMundo) : '';
        this.legendas.mostrar(reg.legenda, { direcao: dir, duracao: 1.6, chave: reg.fonte.id });
      }
    }
    const pistas = this.estado.pistas && !this.pistasSuspensas;
    this.setas.atualizar(dt, this.camera, paraSetas, pistas);
    this.legendas.atualizar(dt, this.estado.legendas && !this.pistasSuspensas);
  }

  // ------------------------------------------------------------------
  // Módulos e painel
  // ------------------------------------------------------------------
  registrarModulo(m) {
    this.modulos.push(m);
    m.app = this;
  }

  ativarModulo(id) {
    const novo = this.modulos.find((m) => m.id === id);
    if (!novo || novo === this.moduloAtivo) return;
    if (this.moduloAtivo && this.moduloAtivo.sair) this.moduloAtivo.sair();
    this.pistasSuspensas = false;
    this.moduloAtivo = novo;
    if (novo.entrar) novo.entrar();
    this.painel.marcarSujo();
    salvarPreferencia('modulo', id);
  }

  areaConteudo() {
    return { x: LARGURA_ABAS + 18, y: ALTURA_TOPO + 12, w: 1024 - LARGURA_ABAS - 36, h: 704 - ALTURA_TOPO - ALTURA_RODAPE - 24 };
  }

  desenharPainel(p) {
    p.cartela(0, 0, p.W, p.H, { fundo: COR.pergaminho, borda: COR.carvao, raio: 30, espessura: 7 });
    // Topo
    p.texto('LABORATÓRIO VIBRAÇÃO', 34, 54, { fonte: FONTE.titulo(30), cor: COR.tinta, maxLargura: 520 });
    const x0 = 572;
    const toggles = [
      ['som', 'SOM'],
      ['pistas', 'PISTAS'],
      ['legendas', 'LEGENDAS'],
      ['haptica', 'VIBRAÇÃO'],
    ];
    toggles.forEach(([k, rot], i) => {
      p.botao(`topo-${k}`, x0 + i * 108, 18, 100, 50, rot, () => this.definirEstado(k, !this.estado[k]), {
        variante: this.estado[k] ? 'ativo' : 'secundario',
        tamanho: 19,
      });
    });
    const g = p.g;
    g.strokeStyle = 'rgba(68,65,65,0.35)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(24, ALTURA_TOPO);
    g.lineTo(p.W - 24, ALTURA_TOPO);
    g.stroke();
    // Abas
    const n = this.modulos.length;
    const hAba = Math.min(54, (704 - ALTURA_TOPO - ALTURA_RODAPE - 24) / Math.max(1, n));
    this.modulos.forEach((m, i) => {
      const ativo = m === this.moduloAtivo;
      p.botao(`aba-${m.id}`, 18, ALTURA_TOPO + 12 + i * hAba, LARGURA_ABAS - 12, hAba - 8, m.nome, () => this.ativarModulo(m.id), {
        variante: ativo ? 'abaAtiva' : 'aba',
        tamanho: 22,
      });
    });
    g.beginPath();
    g.moveTo(LARGURA_ABAS + 8, ALTURA_TOPO + 14);
    g.lineTo(LARGURA_ABAS + 8, 704 - ALTURA_RODAPE - 6);
    g.stroke();
    // Conteúdo
    const area = this.areaConteudo();
    if (this.moduloAtivo && this.moduloAtivo.desenhar) {
      g.save();
      g.beginPath();
      g.rect(area.x - 6, area.y - 6, area.w + 12, area.h + 12);
      g.clip();
      this.moduloAtivo.desenhar(p, area);
      g.restore();
    }
    // Rodapé: alerta ou status
    const yR = 704 - ALTURA_RODAPE + 6;
    let status;
    if (this.alertaTexto && performance.now() < this.alertaAte) status = this.alertaTexto;
    else {
      const partes = [];
      if (this.emVR) {
        partes.push(this.interacao.temMaos() ? 'Mãos' : '');
        partes.push(this.interacao.temControles() ? 'Controles' : '');
      } else partes.push('Modo PC');
      if (this.motor.pronto) partes.push(`${Math.round(this.motor.ctx.sampleRate / 1000)} kHz`);
      else partes.push('áudio parado');
      const sim = this.motor.configSimulador;
      if (sim && sim.nome && sim.ativo !== false) partes.push(`simulação: ${sim.nome}`);
      status = partes.filter(Boolean).join('  ·  ');
    }
    p.texto(status, 34, yR + 24, { fonte: FONTE.forte(22), cor: COR.carvao, maxLargura: 780 });
    p.alca('alca', p.W / 2 - 90, p.H - 20, 180, 12);
  }

  // ------------------------------------------------------------------
  // Quadro
  // ------------------------------------------------------------------
  quadro() {
    const dt = Math.min(0.1, this.relogio.getDelta());
    this.tempo += dt;
    const t = this.tempo;
    this.moverPC(dt);
    if (this.emVR) this.interacao.atualizarXR(this.posicaoCabeca());
    else this.interacao.atualizarMouse();
    this.atualizarBotaoPulso();
    if (this.moduloAtivo && this.moduloAtivo.atualizar) this.moduloAtivo.atualizar(dt, t);
    this.atualizarFontes(dt);
    if (this.motor.pronto) {
      this.camera.updateMatrixWorld();
      this.motor.atualizarOuvinte(this.camera.matrixWorld);
    }
    this.pulsoMusica *= Math.exp(-dt * 7);
    animarSala(this.salaAnimaveis, t, this.estado.pistas ? this.pulsoMusica : 0);
    this.atualizarPortalEAia(dt);
    baterAsas(this.pirikito, t, this.pirikito.userData.voando ? 7 : 0);
    this.luzDeTras.atualizar(dt);
    this.ondas.atualizar(dt);
    this.camera.updateMatrixWorld();
    this.espelho.atualizar(dt, this.camera.matrixWorld, this.interacao.entradas);
    if (this.alertaTexto && performance.now() > this.alertaAte) {
      this.alertaTexto = '';
      this.painel.marcarSujo();
    }
    // Redesenho contínuo limitado a ~12 vezes por segundo (o canvas inteiro pesa no Quest).
    if (this.moduloAtivo && this.moduloAtivo.redesenharSempre && t - (this.ultimoRedesenho || 0) > 0.08) {
      this.ultimoRedesenho = t;
      this.painel.marcarSujo();
    }
    this.painel.atualizarSeSujo();
    this.renderer.render(this.cena, this.camera);
  }

  atualizarPortalEAia(dt) {
    const p = this.portal;
    const alvo = p.userData.aberto ? 1 : 0;
    p.userData.abertura += (alvo - p.userData.abertura) * Math.min(1, dt * 2.5);
    const a = p.userData.abertura;
    p.visible = a > 0.01;
    p.scale.setScalar(Math.max(0.001, a));
    p.rotation.z += dt * 0.6;
    const aia = this.aiaLugar;
    const alvoAia = aia.userData.visivel ? 1 : 0;
    aia.userData.alpha += (alvoAia - aia.userData.alpha) * Math.min(1, dt * 2);
    aia.visible = aia.userData.alpha > 0.02;
    aia.traverse((o) => {
      if (o.material && o.material.transparent) o.material.opacity = (o.isSprite ? 1 : 0.55) * aia.userData.alpha;
    });
  }

  // ------------------------------------------------------------------
  // Sala de verdade (.glb carregado pela página; fica só no aparelho)
  // ------------------------------------------------------------------
  async carregarSalaGLB(arquivo) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const url = URL.createObjectURL(arquivo);
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      const raiz = gltf.scene;
      raiz.traverse((o) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          });
        }
      });
      // Âncoras do arquivo (Ancora_*) substituem as do conceito.
      raiz.updateMatrixWorld(true);
      const ancoras = {};
      raiz.traverse((o) => {
        if (/^Ancora_/i.test(o.name)) ancoras[o.name] = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      });
      this.sala.visible = false;
      if (this.salaGLB) {
        this.mundo.remove(this.salaGLB);
        this.espelho.removerRegistro(this.salaGLB);
      }
      this.salaGLB = raiz;
      this.mundo.add(raiz);
      this.espelho.removerRegistro(this.sala);
      this.espelho.registrar(raiz);
      this.ancorasGLB = ancoras;
      this.alerta(`Sala carregada: ${arquivo.name}`);
      return { ancoras: Object.keys(ancoras) };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  ancora(nome, padrao) {
    const mapa = {
      espelho: 'Ancora_Espelho',
      aia: 'Ancora_Aia',
      portal: 'Ancora_Portal',
      pirikito: 'Ancora_Pirikito',
      circuloDLC: 'Ancora_Circulo_DLC',
      portaQuarto: 'Ancora_Porta_Quarto',
      maquete: 'Ancora_Maquete',
    };
    if (this.ancorasGLB && mapa[nome] && this.ancorasGLB[mapa[nome]]) return this.ancorasGLB[mapa[nome]].clone();
    return (padrao || ANCORAS[nome] || new THREE.Vector3()).clone();
  }

  // ------------------------------------------------------------------
  // VR
  // ------------------------------------------------------------------
  async entrarVR() {
    if (!navigator.xr) throw new Error('Este navegador não tem WebXR. Abra no navegador do Meta Quest.');
    const sessao = await navigator.xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'bounded-floor'],
    });
    await this.renderer.xr.setSession(sessao);
    try {
      this.renderer.xr.setFoveation(0.4);
    } catch {
      /* nada */
    }
    return sessao;
  }

  async sairVR() {
    const s = this.renderer.xr.getSession();
    if (s) await s.end();
  }
}
