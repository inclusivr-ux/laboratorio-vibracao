// Painel desenhado num canvas e mostrado como uma placa no mundo 3D.
// Os botões são grandes para serem tocados com o dedo (rastreamento de mãos) ou apontados com o raio.
import * as THREE from 'three';
import { COR, FONTE } from './estilo-ui.js';

export class Painel {
  constructor({ largura = 1024, altura = 704, larguraM = 0.7, nome = 'painel' } = {}) {
    this.nome = nome;
    this.W = largura;
    this.H = altura;
    this.larguraM = larguraM;
    this.alturaM = (larguraM * altura) / largura;
    this.canvas = document.createElement('canvas');
    this.canvas.width = largura;
    this.canvas.height = altura;
    this.g = this.canvas.getContext('2d');
    this.textura = new THREE.CanvasTexture(this.canvas);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.textura.anisotropy = 4;
    this.textura.generateMipmaps = true;
    this.textura.minFilter = THREE.LinearMipmapLinearFilter;
    const geo = new THREE.PlaneGeometry(this.larguraM, this.alturaM);
    // O painel é desenhado por cima da sala (depthTest desligado): nunca fica "preso" dentro da mesa
    // ou de uma parede. Ele grava profundidade, então as mãos à frente dele continuam visíveis.
    const mat = new THREE.MeshBasicMaterial({ map: this.textura, transparent: false, alphaTest: 0.5, depthTest: false, depthWrite: true, toneMapped: false });
    this.malha = new THREE.Mesh(geo, mat);
    this.malha.renderOrder = 50;
    this.malha.userData.painel = this;
    this.grupo = new THREE.Group();
    this.grupo.name = nome;
    this.grupo.add(this.malha);
    this.elementos = [];
    this.hoverId = null;
    this.pressionadoId = null;
    this.ativoArraste = null;
    this.desenhar = () => {};
    this.sujo = true;
    this.visivel = true;
  }

  marcarSujo() {
    this.sujo = true;
  }

  atualizarSeSujo() {
    if (this.sujo) {
      this.sujo = false;
      this.redesenhar();
    }
  }

  redesenhar() {
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    this.elementos = [];
    this.desenhar(this);
    this.textura.needsUpdate = true;
  }

  // ---- Conversões de coordenadas ----
  pontoLocalParaPx(local) {
    return {
      x: (local.x / this.larguraM + 0.5) * this.W,
      y: (0.5 - local.y / this.alturaM) * this.H,
    };
  }

  uvParaPx(uv) {
    return { x: uv.x * this.W, y: (1 - uv.y) * this.H };
  }

  // ---- Desenho ----
  caminhoCartela(x, y, w, h, r) {
    const g = this.g;
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
    g.lineTo(x + w, y + h - r);
    g.arc(x + w, y + h, r, -Math.PI / 2, Math.PI, true);
    g.lineTo(x + r, y + h);
    g.arc(x, y + h, r, 0, -Math.PI / 2, true);
    g.lineTo(x, y + r);
    g.arc(x, y, r, Math.PI / 2, 0, true);
    g.closePath();
  }

  cartela(x, y, w, h, { fundo = COR.pergaminho, borda = COR.carvao, raio = 26, espessura = 6 } = {}) {
    const g = this.g;
    this.caminhoCartela(x + espessura / 2, y + espessura / 2, w - espessura, h - espessura, raio);
    g.fillStyle = fundo;
    g.fill();
    if (espessura > 0) {
      g.lineWidth = espessura;
      g.strokeStyle = borda;
      g.stroke();
    }
  }

  retangulo(x, y, w, h, r, preenchimento, traco, espessura = 3) {
    const g = this.g;
    g.beginPath();
    const rr = Math.min(r, h / 2, w / 2);
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
    if (preenchimento) {
      g.fillStyle = preenchimento;
      g.fill();
    }
    if (traco) {
      g.lineWidth = espessura;
      g.strokeStyle = traco;
      g.stroke();
    }
  }

  texto(txt, x, y, { fonte = FONTE.texto(26), cor = COR.tinta, alinhar = 'left', base = 'alphabetic', maxLargura } = {}) {
    const g = this.g;
    g.font = fonte;
    g.fillStyle = cor;
    g.textAlign = alinhar;
    g.textBaseline = base;
    if (maxLargura) g.fillText(String(txt), x, y, maxLargura);
    else g.fillText(String(txt), x, y);
  }

  // Quebra o texto em linhas que cabem na largura. Devolve a altura usada.
  textoQuebrado(txt, x, y, largura, alturaLinha, opcoes = {}) {
    const g = this.g;
    g.font = opcoes.fonte || FONTE.texto(26);
    const paragrafos = String(txt).split('\n');
    let linhaY = y;
    for (const par of paragrafos) {
      const palavras = par.split(' ');
      let linha = '';
      for (const p of palavras) {
        const teste = linha ? `${linha} ${p}` : p;
        if (g.measureText(teste).width > largura && linha) {
          this.texto(linha, x, linhaY, opcoes);
          linha = p;
          linhaY += alturaLinha;
        } else {
          linha = teste;
        }
      }
      if (linha) {
        this.texto(linha, x, linhaY, opcoes);
        linhaY += alturaLinha;
      }
    }
    return linhaY - y;
  }

  registrar(el) {
    this.elementos.push(el);
    return el;
  }

  botao(id, x, y, w, h, rotulo, acao, opcoes = {}) {
    const { variante = 'secundario', desabilitado = false, subtitulo = null, tamanho = 28, icone = null } = opcoes;
    const hover = this.hoverId === id && !desabilitado;
    const press = this.pressionadoId === id;
    let fundo = COR.pagina;
    let texto = COR.contorno;
    let borda = COR.contorno;
    if (variante === 'primario') fundo = COR.ambar;
    if (variante === 'ativo') fundo = COR.runaBrilho;
    if (variante === 'aba') {
      fundo = 'rgba(255,255,255,0.35)';
      borda = 'rgba(66,67,58,0.35)';
    }
    if (variante === 'abaAtiva') fundo = COR.ambar;
    if (variante === 'perigo') {
      fundo = '#f8d5d6';
      borda = COR.erro;
      texto = COR.erro;
    }
    if (variante === 'progresso') fundo = COR.cianoSignaria;
    if (desabilitado) {
      fundo = 'rgba(200,200,190,0.5)';
      texto = 'rgba(66,67,58,0.45)';
      borda = 'rgba(66,67,58,0.3)';
    }
    const g = this.g;
    const dy = press ? 3 : 0;
    if (hover || variante === 'ativo') {
      g.save();
      g.shadowColor = variante === 'ativo' ? 'rgba(88,196,200,0.9)' : 'rgba(49,245,255,0.75)';
      g.shadowBlur = 22;
      this.retangulo(x, y + dy, w, h, h / 2, fundo, null);
      g.restore();
    }
    this.retangulo(x, y + dy, w, h, h / 2, fundo, borda, 4);
    if (press) this.retangulo(x, y + dy, w, h, h / 2, 'rgba(35,31,32,0.12)', null);
    const fonte = FONTE.forte(tamanho);
    const cx = x + w / 2;
    if (icone) {
      this.texto(icone, x + 30, y + h / 2 + dy + 1, { fonte: FONTE.forte(tamanho), cor: texto, alinhar: 'center', base: 'middle' });
    }
    if (subtitulo) {
      this.texto(rotulo, cx, y + h / 2 - 6 + dy, { fonte, cor: texto, alinhar: 'center', base: 'middle', maxLargura: w - 24 });
      this.texto(subtitulo, cx, y + h / 2 + 20 + dy, { fonte: FONTE.texto(Math.round(tamanho * 0.62)), cor: texto, alinhar: 'center', base: 'middle', maxLargura: w - 24 });
    } else {
      this.texto(rotulo, cx, y + h / 2 + 1 + dy, { fonte, cor: texto, alinhar: 'center', base: 'middle', maxLargura: w - 24 });
    }
    return this.registrar({ id, tipo: 'botao', x, y, w, h, acao: desabilitado ? null : acao });
  }

  alternar(id, x, y, w, h, rotulo, ligado, aoMudar, opcoes = {}) {
    const g = this.g;
    const hover = this.hoverId === id;
    const fundo = ligado ? COR.runaBrilho : COR.pagina;
    if (hover) {
      g.save();
      g.shadowColor = 'rgba(49,245,255,0.75)';
      g.shadowBlur = 18;
      this.retangulo(x, y, w, h, h / 2, fundo, null);
      g.restore();
    }
    this.retangulo(x, y, w, h, h / 2, fundo, COR.contorno, 4);
    // bolinha
    const r = h / 2 - 9;
    const bx = ligado ? x + w - h / 2 : x + h / 2;
    g.beginPath();
    g.arc(bx, y + h / 2, r, 0, Math.PI * 2);
    g.fillStyle = ligado ? COR.contorno : '#b9b9ad';
    g.fill();
    const tam = opcoes.tamanho || 24;
    const tx = ligado ? x + 22 : x + h;
    const tw = w - h - 22;
    this.texto(rotulo, ligado ? tx + tw / 2 - 10 : tx + tw / 2, y + h / 2 + 1, {
      fonte: FONTE.forte(tam),
      cor: COR.contorno,
      alinhar: 'center',
      base: 'middle',
      maxLargura: tw,
    });
    return this.registrar({ id, tipo: 'botao', x, y, w, h, acao: () => aoMudar(!ligado) });
  }

  slider(id, x, y, w, h, rotulo, valor, min, max, aoMudar, opcoes = {}) {
    const { formatar = (v) => v.toFixed(0), passo = 0 } = opcoes;
    const g = this.g;
    const hover = this.hoverId === id || (this.ativoArraste && this.ativoArraste.id === id);
    this.texto(rotulo, x, y + 22, { fonte: FONTE.forte(24), cor: COR.contorno });
    this.texto(formatar(valor), x + w, y + 22, { fonte: FONTE.forte(24), cor: COR.contorno, alinhar: 'right' });
    const ty = y + 38;
    const th = h - 38;
    const t = Math.max(0, Math.min(1, (valor - min) / (max - min)));
    this.retangulo(x, ty + th / 2 - 9, w, 18, 9, COR.pagina, COR.contorno, 3);
    this.retangulo(x, ty + th / 2 - 9, Math.max(18, w * t), 18, 9, COR.ambar, null);
    const bx = x + w * t;
    if (hover) {
      g.save();
      g.shadowColor = 'rgba(49,245,255,0.8)';
      g.shadowBlur = 18;
    }
    g.beginPath();
    g.arc(bx, ty + th / 2, th / 2 - 4, 0, Math.PI * 2);
    g.fillStyle = COR.pergaminho;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = COR.contorno;
    g.stroke();
    if (hover) g.restore();
    const aplicar = (px) => {
      let v = min + ((px - x) / w) * (max - min);
      v = Math.max(min, Math.min(max, v));
      if (passo) v = Math.round(v / passo) * passo;
      aoMudar(v);
    };
    return this.registrar({ id, tipo: 'slider', x: x - 20, y: ty, w: w + 40, h: th, acao: (px) => aplicar(px), arrastar: (px) => aplicar(px) });
  }

  barraNivel(x, y, w, h, valor, cor = COR.cianoSignaria, marcas = null) {
    this.retangulo(x, y, w, h, h / 2, 'rgba(35,31,32,0.12)', COR.contorno, 2);
    const v = Math.max(0, Math.min(1, valor));
    if (v > 0) this.retangulo(x + 2, y + 2, Math.max(h - 4, (w - 4) * v), h - 4, (h - 4) / 2, cor, null);
    if (marcas) {
      const g = this.g;
      g.strokeStyle = COR.contorno;
      g.lineWidth = 2;
      for (const m of marcas) {
        const mx = x + w * m;
        g.beginPath();
        g.moveTo(mx, y - 4);
        g.lineTo(mx, y + h + 4);
        g.stroke();
      }
    }
  }

  alca(id, x, y, w, h) {
    const hover = this.hoverId === id || (this.ativoArraste && this.ativoArraste.id === id);
    this.retangulo(x, y, w, h, h / 2, hover ? COR.runaBrilho : 'rgba(66,67,58,0.55)', null);
    return this.registrar({ id, tipo: 'alca', x: x - 30, y: y - 18, w: w + 60, h: h + 36 });
  }

  // ---- Interação ----
  elementoEm(px, py) {
    for (let i = this.elementos.length - 1; i >= 0; i--) {
      const e = this.elementos[i];
      if (px >= e.x && px <= e.x + e.w && py >= e.y && py <= e.y + e.h) return e;
    }
    return null;
  }

  passar(px, py) {
    const e = px === null ? null : this.elementoEm(px, py);
    const id = e ? e.id : null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.marcarSujo();
    }
    return e;
  }

  // Devolve o elemento pressionado (ou null).
  pressionar(px, py) {
    const e = this.elementoEm(px, py);
    if (!e) return null;
    if (e.tipo === 'alca') {
      this.ativoArraste = e;
      this.marcarSujo();
      return e;
    }
    this.pressionadoId = e.id;
    if (e.tipo === 'slider') this.ativoArraste = e;
    if (e.acao) e.acao(px, py);
    this.marcarSujo();
    clearTimeout(this.timerPress);
    this.timerPress = setTimeout(() => {
      this.pressionadoId = null;
      this.marcarSujo();
    }, 160);
    return e;
  }

  arrastar(px, py) {
    if (this.ativoArraste && this.ativoArraste.arrastar) {
      this.ativoArraste.arrastar(px, py);
      this.marcarSujo();
    }
  }

  soltar() {
    if (this.ativoArraste) {
      this.ativoArraste = null;
      this.marcarSujo();
    }
  }
}
