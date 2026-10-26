// Teste de localização: o som toca de uma direção aleatória (sem pistas visuais) e a pessoa aponta.
// Mede o erro em graus e as trocas entre frente e trás. Não é exame: serve para comparar sons e ajustes.
import * as THREE from 'three';
import { titulo, paragrafo, grupoBotoes, subtitulo } from './comum.js';
import { COR, FONTE } from '../ui/estilo-ui.js';
import { MarcadorSom } from '../cena/efeitos.js';

const RAD = Math.PI / 180;
const ESTIMULOS = [
  ['ruido', 'Ruído'],
  ['voz', 'Voz'],
  ['tom500', 'Tom 500 Hz'],
  ['tom4000', 'Tom 4 kHz'],
  ['asas', 'Asas'],
];

function itemDoEstimulo(est, longo) {
  if (est === 'ruido') return longo ? 'ruido-rosa' : 'ruido-curto';
  if (est === 'voz') return longo ? 'voz-um-dois-tres' : 'voz-estou-aqui';
  if (est === 'tom500') return 'tom-500';
  if (est === 'tom4000') return 'tom-4000';
  return 'asas';
}

export class ModuloLocalizacao {
  constructor() {
    this.id = 'localizacao';
    this.nome = 'Localização';
    this.cfg = { estimulo: 'ruido', longo: false, altura: false, n: 8 };
    this.fase = 'config';
    this.tentativas = [];
    this.atual = null;
    this.reg = null;
  }

  entrar() {
    if (!this.cupula) this.criarCupula();
  }

  sair() {
    this.cancelar();
  }

  criarCupula() {
    const app = this.app;
    this.cupula = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 32, 16),
      new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.cupula.visible = false;
    this.cupula.userData.interativo = {
      aoPressionar: (hit) => this.responder(hit.point),
    };
    app.cena.add(this.cupula);
    app.interacao.adicionarInterativo(this.cupula);
    this.marcaVerdade = new MarcadorSom({ cor: '#42b23c', rotulo: 'o som estava aqui', raio: 0.05 });
    this.marcaResposta = new MarcadorSom({ cor: '#f4b224', rotulo: 'sua resposta', raio: 0.05 });
    this.marcaVerdade.grupo.visible = false;
    this.marcaResposta.grupo.visible = false;
    app.cena.add(this.marcaVerdade.grupo, this.marcaResposta.grupo);
  }

  iniciar() {
    const app = this.app;
    this.tentativas = [];
    this.fase = 'tentativa';
    app.pistasSuspensas = true;
    this.proxima();
  }

  cancelar() {
    const app = this.app;
    if (this.reg) app.removerFonte(this.reg);
    this.reg = null;
    this.fase = this.tentativas.length ? 'fim' : 'config';
    app.pistasSuspensas = false;
    if (this.cupula) this.cupula.visible = false;
    if (this.marcaVerdade) {
      this.marcaVerdade.grupo.visible = false;
      this.marcaResposta.grupo.visible = false;
    }
    app.painel.marcarSujo();
  }

  async proxima() {
    const app = this.app;
    this.marcaVerdade.grupo.visible = false;
    this.marcaResposta.grupo.visible = false;
    if (this.tentativas.length >= this.cfg.n) {
      this.terminar();
      return;
    }
    const cab = app.posicaoCabeca();
    const dir = app.direcaoOlhar();
    const yaw = Math.atan2(-dir.x, -dir.z);
    const az = Math.random() * 360; // horário a partir da frente
    const el = this.cfg.altura ? -20 + Math.random() * 70 : 0;
    const yawFonte = yaw - az * RAD;
    const d = new THREE.Vector3(-Math.sin(yawFonte) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(yawFonte) * Math.cos(el * RAD));
    const posMundo = cab.clone().addScaledVector(d, 1.5);
    this.atual = { az, el, yaw, cab: cab.clone(), d, posMundo, repeticoes: 0 };
    this.cupula.position.copy(cab);
    this.cupula.visible = true;
    this.fase = 'tentativa';
    app.painel.marcarSujo();
    await this.tocarEstimulo();
  }

  async tocarEstimulo() {
    const app = this.app;
    if (this.reg) app.removerFonte(this.reg);
    const longo = this.cfg.longo;
    const itemId = itemDoEstimulo(this.cfg.estimulo, longo);
    const local = app.mundoParaSala(this.atual.posMundo);
    this.reg = await app.adicionarFonte({ itemId, local, loop: true, marcador: false, semLegenda: true, volume: 0 });
    const ctx = app.motor.ctx;
    const buffer = this.reg.fonte.buffer;
    const dur = longo ? 2.0 : Math.min(0.3, buffer.duration);
    const usarDuracaoDoArquivo = this.cfg.estimulo === 'voz' || (this.cfg.estimulo === 'ruido' && !longo);
    const total = usarDuracaoDoArquivo ? buffer.duration : dur;
    const t = ctx.currentTime + 0.25;
    const g = this.reg.fonte.entrada.gain;
    g.cancelScheduledValues(0);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.9, t + 0.015);
    g.setValueAtTime(0.9, t + Math.max(0.03, total - 0.03));
    g.linearRampToValueAtTime(0, t + total);
    this.reg.fonte.loop = !usarDuracaoDoArquivo;
    this.reg.fonte.tocar({ quando: t });
    this.reg.fonte.parar(t + total + 0.03);
  }

  async repetirSom() {
    if (this.fase !== 'tentativa' || !this.atual) return;
    this.atual.repeticoes++;
    await this.tocarEstimulo();
  }

  responder(pontoMundo) {
    if (this.fase === 'feedback') {
      this.proxima();
      return;
    }
    if (this.fase !== 'tentativa' || !this.atual) return;
    const at = this.atual;
    const a = pontoMundo.clone().sub(at.cab).normalize();
    const erro = Math.acos(Math.max(-1, Math.min(1, a.dot(at.d)))) / RAD;
    // Referencial da cabeça no início da tentativa (frente = -Z).
    const rot = new THREE.Matrix4().makeRotationY(-at.yaw);
    const tl = at.d.clone().applyMatrix4(rot);
    const al = a.clone().applyMatrix4(rot);
    const frenteT = -tl.z;
    const frenteA = -al.z;
    const espelhada = new THREE.Vector3(al.x, al.y, -al.z);
    const erroEspelhado = Math.acos(Math.max(-1, Math.min(1, espelhada.dot(tl)))) / RAD;
    const trocaFrenteTras = Math.sign(frenteT) !== Math.sign(frenteA) && Math.abs(frenteT) > 0.25 && Math.abs(frenteA) > 0.25 && erroEspelhado < 30;
    const azResp = ((Math.atan2(al.x, -al.z) / RAD + 360) % 360);
    this.tentativas.push({
      az: Math.round(at.az),
      el: Math.round(at.el),
      azResposta: Math.round(azResp),
      elResposta: Math.round(Math.asin(Math.max(-1, Math.min(1, al.y))) / RAD),
      erro: Math.round(erro),
      trocaFrenteTras,
      repeticoes: at.repeticoes,
    });
    this.ultimo = { erro, trocaFrenteTras };
    // Mostra onde estava e onde a pessoa apontou.
    this.marcaVerdade.grupo.position.copy(at.posMundo);
    this.marcaResposta.grupo.position.copy(at.cab.clone().addScaledVector(a, 1.5));
    this.marcaVerdade.grupo.visible = true;
    this.marcaResposta.grupo.visible = true;
    this.fase = 'feedback';
    this.app.painel.marcarSujo();
  }

  terminar() {
    const app = this.app;
    this.fase = 'fim';
    this.cupula.visible = false;
    app.pistasSuspensas = false;
    if (this.reg) app.removerFonte(this.reg);
    this.reg = null;
    const r = this.resumo();
    if (r) {
      const nomeEst = ESTIMULOS.find((e) => e[0] === this.cfg.estimulo)[1];
      app.registrarResultado(
        'Localização',
        `${nomeEst}, ${this.cfg.longo ? 'longo' : 'curto'}, ${app.estado.hrtf ? 'HRTF' : 'simples'}: erro médio ${r.media}°, frente-trás ${r.trocas}%`,
        { config: { ...this.cfg, hrtf: app.estado.hrtf, simulacao: app.motor.configSimulador ? app.motor.configSimulador.nome || 'nenhuma' : 'nenhuma' }, resumo: r, tentativas: this.tentativas },
      );
    }
    app.painel.marcarSujo();
  }

  resumo() {
    const t = this.tentativas;
    if (!t.length) return null;
    const erros = t.map((x) => x.erro).sort((a, b) => a - b);
    const media = Math.round(erros.reduce((s, v) => s + v, 0) / erros.length);
    const mediana = erros[Math.floor(erros.length / 2)];
    const trocas = Math.round((100 * t.filter((x) => x.trocaFrenteTras).length) / t.length);
    const dentro30 = Math.round((100 * t.filter((x) => x.erro <= 30).length) / t.length);
    return { media, mediana, trocas, dentro30, n: t.length };
  }

  atualizar(dt) {
    if (this.marcaVerdade && this.marcaVerdade.grupo.visible) {
      this.marcaVerdade.atualizar(dt, 0.1, false);
      this.marcaResposta.atualizar(dt, 0.1, false);
    }
  }

  aoEspaco() {
    if (this.fase === 'feedback') this.proxima();
  }

  desenhar(p, a) {
    const app = this.app;
    titulo(p, a, 'Teste de localização');
    let y = a.y + 64;
    if (this.fase === 'config' || this.fase === 'fim') {
      y += 26;
      if (this.fase === 'fim') {
        const r = this.resumo();
        if (r) {
          p.cartela(a.x, y - 6, a.w, 118, { fundo: '#e5f4e4', raio: 18, espessura: 4 });
          p.texto(`Erro médio: ${r.media}°   ·   mediana: ${r.mediana}°`, a.x + 24, y + 34, { fonte: FONTE.forte(26), cor: COR.tinta });
          p.texto(`Frente-trás trocados: ${r.trocas}%   ·   dentro de 30°: ${r.dentro30}%   ·   ${r.n} tentativas`, a.x + 24, y + 78, {
            fonte: FONTE.texto(22),
            cor: COR.carvao,
            maxLargura: a.w - 48,
          });
          y += 132;
        }
      }
      subtitulo(p, a.x, y + 6, 'Som');
      grupoBotoes(p, 'loc-est', a.x + 120, y - 24, a.w - 120, 48, ESTIMULOS, this.cfg.estimulo, (v) => {
        this.cfg.estimulo = v;
        p.marcarSujo();
      }, { tamanho: 18, espaco: 8 });
      y += 60;
      subtitulo(p, a.x, y + 6, 'Duração');
      grupoBotoes(p, 'loc-dur', a.x + 120, y - 24, 360, 48, [[false, 'Curta'], [true, 'Longa (2 s)']], this.cfg.longo, (v) => {
        this.cfg.longo = v;
        p.marcarSujo();
      }, { tamanho: 18 });
      subtitulo(p, a.x + 500, y + 6, 'Total');
      grupoBotoes(p, 'loc-n', a.x + 580, y - 24, a.w - 580, 48, [[8, '8'], [16, '16']], this.cfg.n, (v) => {
        this.cfg.n = v;
        p.marcarSujo();
      }, { tamanho: 18 });
      y += 60;
      subtitulo(p, a.x, y + 6, 'Direções');
      grupoBotoes(p, 'loc-alt', a.x + 120, y - 24, 360, 48, [[false, 'Só em volta'], [true, 'Com altura']], this.cfg.altura, (v) => {
        this.cfg.altura = v;
        p.marcarSujo();
      }, { tamanho: 18 });
      subtitulo(p, a.x + 500, y + 6, '3D');
      grupoBotoes(p, 'loc-hrtf', a.x + 580, y - 24, a.w - 580, 48, [[true, 'HRTF'], [false, 'Simples']], app.estado.hrtf, (v) => app.definirEstado('hrtf', v), { tamanho: 18 });
      y += 54;
      paragrafo(p, a.x, y + 6, a.w, 'As pistas visuais somem durante o teste. Ouça, aponte para onde o som veio e confirme (pinça, gatilho ou clique). O som curto não dá tempo de virar a cabeça; o longo, sim.', 20);
      y += 92;
      p.botao('loc-comecar', a.x, y, 320, 66, this.fase === 'fim' ? 'Fazer de novo' : 'Começar', () => this.iniciar(), { variante: 'primario', tamanho: 24 });
      return;
    }
    const n = this.tentativas.length + (this.fase === 'tentativa' ? 1 : 0);
    p.texto(`Tentativa ${Math.min(n, this.cfg.n)} de ${this.cfg.n}`, a.x, y + 6, { fonte: FONTE.forte(26), cor: COR.tinta });
    y += 30;
    if (this.fase === 'tentativa') {
      paragrafo(p, a.x, y + 18, a.w, 'Aponte para o lugar de onde o som veio e confirme. Pode virar a cabeça à vontade.', 23, COR.tinta);
      y += 96;
      p.botao('loc-repetir', a.x, y, 280, 62, 'Ouvir de novo', () => this.repetirSom(), { tamanho: 21 });
    } else if (this.fase === 'feedback') {
      const u = this.ultimo;
      p.texto(`Erro: ${Math.round(u.erro)}°${u.trocaFrenteTras ? '  (frente e trás trocados)' : ''}`, a.x, y + 34, {
        fonte: FONTE.forte(28),
        cor: u.erro <= 30 ? COR.acerto : COR.tinta,
      });
      paragrafo(p, a.x, y + 70, a.w, 'Verde: onde o som estava. Âmbar: onde você apontou.', 21);
      y += 120;
      p.botao('loc-proxima', a.x, y, 280, 62, this.tentativas.length >= this.cfg.n ? 'Ver resultado' : 'Próxima', () => this.proxima(), {
        variante: 'primario',
        tamanho: 23,
      });
    }
    p.botao('loc-cancelar', a.x + a.w - 200, a.y + a.h - 66, 200, 58, 'Encerrar', () => this.cancelar(), { variante: 'perigo', tamanho: 20 });
  }
}
