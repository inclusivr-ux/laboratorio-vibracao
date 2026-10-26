// Palco 360°: coloque sons em volta da cabeça, mova, faça girar (como no barbeiro) e compare HRTF x simples.
import * as THREE from 'three';
import { titulo, grupoBotoes, subtitulo } from './comum.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

const CATEGORIAS = [
  ['todos', 'Todos'],
  ['usuario', 'Seus sons'],
  ['efeito', 'Efeitos'],
  ['ambiente', 'Ambiente'],
  ['teste', 'Teste'],
  ['voz', 'Voz'],
];
const POR_PAGINA = 6;
const RAD = Math.PI / 180;

export class ModuloPalco {
  constructor() {
    this.id = 'palco';
    this.nome = 'Palco 360°';
    this.itens = [];
    this.selecionada = -1;
    this.categoria = 'todos';
    this.pagina = 0;
  }

  sair() {
    // Os sons do palco continuam até alguém parar (para comparar com o simulador, por exemplo).
  }

  listaFiltrada() {
    const todos = this.app.biblioteca.itens();
    return this.categoria === 'todos' ? todos : todos.filter((i) => i.categoria === this.categoria);
  }

  yawCabecaSala() {
    const app = this.app;
    const dir = app.direcaoOlhar();
    const yawMundo = Math.atan2(-dir.x, -dir.z);
    return yawMundo - app.mundo.rotation.y;
  }

  // Posição na sala a partir de azimute (graus, horário a partir da frente da sala), elevação e distância.
  posicao(item) {
    const az = item.az * RAD;
    const el = item.el * RAD;
    const c = item.centro;
    return new THREE.Vector3(c.x - Math.sin(az) * Math.cos(el) * item.dist, c.y + Math.sin(el) * item.dist, c.z - Math.cos(az) * Math.cos(el) * item.dist);
  }

  async adicionar(itemBib) {
    const app = this.app;
    if (this.itens.length >= 8) {
      app.alerta('O palco aceita até 8 sons ao mesmo tempo.');
      return;
    }
    const centro = app.mundoParaSala(app.posicaoCabeca());
    const yaw = this.yawCabecaSala() / RAD;
    // Azimute no mesmo sentido do giro da cabeça (anti-horário visto de cima): 90 = esquerda.
    const item = { itemId: itemBib.id, nome: itemBib.nome, cor: itemBib.cor, az: yaw, el: 0, dist: 1.5, centro, girando: false, velocidade: 60, reg: null };
    item.reg = await app.adicionarFonte({ itemId: itemBib.id, local: this.posicao(item), loop: true, rotulo: itemBib.nome });
    this.tornarArrastavel(item);
    item.reg.fonte.tocar();
    this.itens.push(item);
    this.selecionada = this.itens.length - 1;
    app.painel.marcarSujo();
  }

  tornarArrastavel(item) {
    const app = this.app;
    const alvo = item.reg.marcador.nucleo;
    let distRaio = 1;
    alvo.userData.interativo = {
      aoPressionar: (hit, entrada) => {
        this.selecionada = this.itens.indexOf(item);
        const origem = entrada ? app.interacao.raioDaEntrada(entrada).origem : app.posicaoCabeca();
        distRaio = hit.point.distanceTo(origem);
        item.arrastando = true;
        app.painel.marcarSujo();
      },
      aoArrastar: (origem, dir) => {
        const pMundo = origem.clone().addScaledVector(dir, distRaio);
        const pSala = app.mundoParaSala(pMundo);
        const rel = pSala.sub(item.centro);
        item.dist = Math.max(0.3, rel.length());
        item.el = Math.asin(Math.max(-1, Math.min(1, rel.y / item.dist))) / RAD;
        item.az = Math.atan2(-rel.x, -rel.z) / RAD;
      },
      aoSoltar: () => {
        item.arrastando = false;
        app.painel.marcarSujo();
      },
    };
    app.interacao.adicionarInterativo(alvo);
  }

  remover(i) {
    const item = this.itens[i];
    if (!item) return;
    this.app.interacao.removerInterativo(item.reg.marcador.nucleo);
    this.app.removerFonte(item.reg);
    this.itens.splice(i, 1);
    this.selecionada = Math.min(this.selecionada, this.itens.length - 1);
    this.app.painel.marcarSujo();
  }

  limpar() {
    while (this.itens.length) this.remover(0);
  }

  // graus no sentido horário a partir de onde a pessoa olha: 90 = direita, 180 = atrás.
  direcaoRelativa(item, graus) {
    item.az = this.yawCabecaSala() / RAD - graus;
    item.el = 0;
    this.app.painel.marcarSujo();
  }

  atualizar(dt) {
    for (const item of this.itens) {
      if (!item.reg || !this.app.fontes.includes(item.reg)) continue;
      // Gira no sentido horário (esquerda, frente, direita, costas), como a tesoura do barbeiro.
      if (item.girando && !item.arrastando) item.az = (item.az - item.velocidade * dt) % 360;
      item.reg.local.copy(this.posicao(item));
    }
  }

  desenhar(p, a) {
    const app = this.app;
    titulo(p, a, 'Palco 360°');
    grupoBotoes(p, 'palco-modelo', a.x + 300, a.y + 4, 250, 44, [[true, 'HRTF'], [false, 'Simples']], app.estado.hrtf, (v) => app.definirEstado('hrtf', v), { tamanho: 18 });
    p.botao('palco-limpar', a.x + 566, a.y + 4, 206, 44, 'Limpar palco', () => this.limpar(), { variante: 'perigo', tamanho: 18 });
    // Categorias
    const yc = a.y + 62;
    const cw = (a.w - 5 * 8) / 6;
    CATEGORIAS.forEach(([id, rot], i) => {
      p.botao(`palco-cat-${id}`, a.x + i * (cw + 8), yc, cw, 42, rot, () => {
        this.categoria = id;
        this.pagina = 0;
        p.marcarSujo();
      }, { variante: this.categoria === id ? 'abaAtiva' : 'aba', tamanho: 16 });
    });
    // Lista
    const lista = this.listaFiltrada();
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    this.pagina = Math.min(this.pagina, paginas - 1);
    const xl = a.x;
    const wl = 320;
    let y = yc + 56;
    const visiveis = lista.slice(this.pagina * POR_PAGINA, this.pagina * POR_PAGINA + POR_PAGINA);
    if (!visiveis.length) {
      p.textoQuebrado('Nenhum som aqui. Carregue arquivos na página do laboratório (fora do VR).', xl, y + 24, wl, 28, { fonte: FONTE.texto(20), cor: COR.carvao });
    }
    visiveis.forEach((it, i) => {
      p.botao(`palco-item-${it.id}`, xl, y + i * 58, wl, 50, it.nome, () => this.adicionar(it), { tamanho: 18 });
      const g = p.g;
      g.beginPath();
      g.arc(xl + 22, y + i * 58 + 25, 9, 0, Math.PI * 2);
      g.fillStyle = it.cor;
      g.fill();
    });
    const yPag = y + POR_PAGINA * 58 + 2;
    p.botao('palco-ant', xl, yPag, 90, 44, '◀', () => {
      this.pagina = Math.max(0, this.pagina - 1);
      p.marcarSujo();
    }, { desabilitado: this.pagina === 0, tamanho: 20 });
    p.texto(`${this.pagina + 1} / ${paginas}`, xl + wl / 2, yPag + 30, { fonte: FONTE.forte(20), cor: COR.carvao, alinhar: 'center' });
    p.botao('palco-prox', xl + wl - 90, yPag, 90, 44, '▶', () => {
      this.pagina = Math.min(paginas - 1, this.pagina + 1);
      p.marcarSujo();
    }, { desabilitado: this.pagina >= paginas - 1, tamanho: 20 });
    p.texto('Toque num som para colocá-lo à sua frente.', xl, a.y + a.h - 4, { fonte: FONTE.texto(17), cor: COR.carvao, maxLargura: wl });

    // Controles do som selecionado
    const xr = a.x + wl + 22;
    const wr = a.w - wl - 22;
    y = yc + 56;
    const item = this.itens[this.selecionada];
    if (!item) {
      p.textoQuebrado(
        this.itens.length
          ? 'Toque num dos marcadores coloridos (ou escolha abaixo) para ajustar.'
          : 'Nenhum som no palco ainda. Escolha um som na lista. Depois, arraste o marcador colorido com o raio para movê-lo.',
        xr,
        y + 24,
        wr,
        28,
        { fonte: FONTE.texto(20), cor: COR.carvao },
      );
    } else {
      p.texto(item.nome, xr, y + 22, { fonte: FONTE.forte(24), cor: COR.tinta, maxLargura: wr - 110 });
      p.botao('palco-remover', xr + wr - 100, y - 6, 100, 42, 'Tirar', () => this.remover(this.selecionada), { variante: 'perigo', tamanho: 17 });
      y += 36;
      const tocando = item.reg.fonte.tocando;
      p.botao('palco-tocar', xr, y, 150, 50, tocando ? 'Parar' : 'Tocar', () => {
        if (item.reg.fonte.tocando) item.reg.fonte.parar();
        else item.reg.fonte.tocar();
        p.marcarSujo();
      }, { variante: 'primario', tamanho: 20 });
      p.botao('palco-loop', xr + 160, y, 150, 50, item.reg.fonte.loop ? 'Repete: sim' : 'Repete: não', () => {
        item.reg.fonte.loop = !item.reg.fonte.loop;
        if (item.reg.fonte.fonte) item.reg.fonte.fonte.loop = item.reg.fonte.loop;
        p.marcarSujo();
      }, { tamanho: 17 });
      p.botao('palco-girar', xr + 320, y, wr - 320, 50, item.girando ? 'Girando' : 'Girar', () => {
        item.girando = !item.girando;
        p.marcarSujo();
      }, { variante: item.girando ? 'ativo' : 'secundario', tamanho: 18 });
      y += 60;
      p.slider('palco-dist', xr, y, wr, 62, 'Distância', item.dist, 0.3, 6, (v) => {
        item.dist = v;
      }, { formatar: (v) => `${v.toFixed(1)} m` });
      y += 64;
      p.slider('palco-el', xr, y, wr, 62, 'Altura (elevação)', item.el, -60, 80, (v) => {
        item.el = v;
      }, { formatar: (v) => `${Math.round(v)}°`, passo: 1 });
      y += 64;
      p.slider('palco-vel', xr, y, wr, 62, 'Velocidade do giro', item.velocidade, 10, 240, (v) => {
        item.velocidade = v;
      }, { formatar: (v) => `${Math.round(v)}°/s`, passo: 1 });
      y += 70;
      subtitulo(p, xr, y + 2, 'Pôr o som:', wr);
      y += 14;
      const dirs = [
        [0, 'Frente'],
        [90, 'Direita'],
        [180, 'Atrás'],
        [270, 'Esquerda'],
      ];
      const dw = (wr - 3 * 8) / 4;
      dirs.forEach(([g, rot], i) => {
        p.botao(`palco-dir-${g}`, xr + i * (dw + 8), y, dw, 48, rot, () => this.direcaoRelativa(item, g), { tamanho: 17 });
      });
    }
    // Abas dos sons no palco
    if (this.itens.length > 1) {
      const yS = a.y + a.h - 48;
      const sw = Math.min(56, (wr - 8 * 6) / this.itens.length);
      this.itens.forEach((it, i) => {
        p.botao(`palco-sel-${i}`, xr + i * (sw + 6), yS, sw, 44, String(i + 1), () => {
          this.selecionada = i;
          p.marcarSujo();
        }, { variante: i === this.selecionada ? 'ativo' : 'secundario', tamanho: 18 });
      });
    }
    this.redesenharSempre = this.itens.some((i) => i.arrastando);
  }
}
