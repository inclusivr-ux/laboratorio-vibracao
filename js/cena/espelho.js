// Espelho mágico feito com o truque do "mundo espelhado" (sem câmera extra, funciona nos dois olhos).
// 1) O vidro marca o stencil onde está visível. 2) Um segundo desenho "limpa" a profundidade ali.
// 3) Uma cópia espelhada do mundo é desenhada só dentro do vidro. 4) Uma película dá o brilho do vidro.
import * as THREE from 'three';

const ORDEM_VIDRO = 10;
const ORDEM_LIMPA = 11;
const ORDEM_REFLEXO = 12;

const tmpInv = new THREE.Matrix4();

export class Espelho {
  constructor({ mundo, posicao = new THREE.Vector3(0, 1.08, 1.6), largura = 1.0, altura = 1.6 }) {
    this.mundo = mundo;
    this.posicao = posicao.clone();
    this.largura = largura;
    this.altura = altura;
    this.acordado = false;
    this.brilho = 0;
    this.aoAcordar = null;
    this.materiais = new Map();
    this.pares = [];
    this.registrados = [];

    this.grupo = new THREE.Group();
    this.grupo.name = 'Espelho';
    this.grupo.position.copy(this.posicao);
    // O vidro olha para -Z (para o centro da sala).
    this.grupo.rotation.y = Math.PI;
    mundo.add(this.grupo);

    const geoVidro = new THREE.PlaneGeometry(largura, altura);
    const matVidro = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: THREE.ReplaceStencilOp,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
    });
    this.vidro = new THREE.Mesh(geoVidro, matVidro);
    this.vidro.renderOrder = ORDEM_VIDRO;
    this.vidro.name = 'Espelho_Vidro';
    this.grupo.add(this.vidro);

    const matLimpa = new THREE.ShaderMaterial({
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'void main(){ gl_FragDepth = 1.0; gl_FragColor = vec4(0.0); }',
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.KeepStencilOp,
    });
    this.limpa = new THREE.Mesh(geoVidro, matLimpa);
    this.limpa.renderOrder = ORDEM_LIMPA;
    this.grupo.add(this.limpa);

    // Película do vidro (por cima do reflexo).
    this.pelicula = new THREE.Mesh(
      geoVidro,
      new THREE.MeshBasicMaterial({ color: 0x9fe3e6, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    this.pelicula.position.z = 0.002;
    this.pelicula.renderOrder = 60;
    this.grupo.add(this.pelicula);

    this.criarMoldura();

    // Mundo espelhado: reflexão no plano do vidro (z = posicao.z, no referencial do mundo).
    this.reflexo = new THREE.Group();
    this.reflexo.name = 'MundoEspelhado';
    this.reflexo.matrixAutoUpdate = false;
    this.reflexo.matrix.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 2 * this.posicao.z, 0, 0, 0, 1);
    mundo.add(this.reflexo);

    this.criarAvatar();

    // Tocar no vidro acorda o espelho.
    this.vidro.userData.interativo = {
      toque: { largura, altura },
      aoPressionar: () => this.acordar(),
    };
  }

  criarMoldura() {
    const forma = new THREE.Shape();
    const w = this.largura / 2 + 0.09;
    const h = this.altura / 2 + 0.09;
    forma.moveTo(-w, -h);
    forma.lineTo(w, -h);
    forma.lineTo(w, h - 0.15);
    forma.quadraticCurveTo(w, h + 0.12, 0, h + 0.16);
    forma.quadraticCurveTo(-w, h + 0.12, -w, h - 0.15);
    forma.lineTo(-w, -h);
    const furo = new THREE.Path();
    const iw = this.largura / 2;
    const ih = this.altura / 2;
    furo.moveTo(-iw, -ih);
    furo.lineTo(-iw, ih);
    furo.lineTo(iw, ih);
    furo.lineTo(iw, -ih);
    furo.lineTo(-iw, -ih);
    forma.holes.push(furo);
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
    this.matMoldura = new THREE.MeshBasicMaterial({ color: 0xf6c744 });
    const moldura = new THREE.Mesh(geo, this.matMoldura);
    moldura.position.z = -0.04;
    this.grupo.add(moldura);
    // Pés
    const pe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.45), new THREE.MeshBasicMaterial({ color: 0x7a4a22 }));
    for (const x of [-0.45, 0.45]) {
      const p = pe.clone();
      p.position.set(x, -this.altura / 2 - 0.12, -0.05);
      this.grupo.add(p);
    }
    // Brilho mágico (quando acordado).
    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(this.largura + 0.6, this.altura + 0.6),
      new THREE.MeshBasicMaterial({
        map: texturaAura(),
        color: 0x74d0d8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.aura.position.z = -0.06;
    this.aura.renderOrder = 59;
    this.grupo.add(this.aura);
  }

  criarAvatar() {
    // Cabeça com visor: aparece só no espelho.
    this.cabeca = new THREE.Group();
    const rosto = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xd9a58a }));
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0x42433a }));
    visor.position.set(0, 0.01, -0.07);
    const faixa = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.012, 0.005), new THREE.MeshBasicMaterial({ color: 0x74d0d8 }));
    faixa.position.set(0, 0.01, -0.118);
    const alca = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 6, 24), new THREE.MeshBasicMaterial({ color: 0x42433a }));
    alca.rotation.x = Math.PI / 2;
    this.cabeca.add(rosto, visor, faixa, alca);
    this.cabeca.matrixAutoUpdate = false;
    this.aplicarStencil(this.cabeca);
    this.reflexo.add(this.cabeca);
    this.juntasEspelho = [];
  }

  materialComStencil(mat) {
    if (!mat) return mat;
    if (Array.isArray(mat)) return mat.map((m) => this.materialComStencil(m));
    let m = this.materiais.get(mat.uuid);
    if (!m) {
      m = mat.clone();
      m.stencilWrite = true;
      m.stencilRef = 1;
      m.stencilFunc = THREE.EqualStencilFunc;
      m.stencilFail = THREE.KeepStencilOp;
      m.stencilZFail = THREE.KeepStencilOp;
      m.stencilZPass = THREE.KeepStencilOp;
      m.userData.original = mat;
      this.materiais.set(mat.uuid, m);
    }
    return m;
  }

  aplicarStencil(raiz) {
    raiz.traverse((o) => {
      if (o.material) o.material = this.materialComStencil(o.material);
      if (o.isMesh || o.isSprite || o.isLine || o.isPoints) o.renderOrder = ORDEM_REFLEXO + (o.material && o.material.transparent ? 1 : 0);
    });
  }

  // Copia um objeto do mundo para o espelho. As mudanças do original seguem a cópia a cada quadro.
  registrar(original) {
    const copia = original.clone(true);
    this.aplicarStencil(copia);
    copia.matrixAutoUpdate = false;
    const pares = [];
    const listaO = [];
    const listaC = [];
    original.traverse((o) => listaO.push(o));
    copia.traverse((c) => listaC.push(c));
    for (let i = 0; i < listaO.length && i < listaC.length; i++) pares.push([listaO[i], listaC[i]]);
    this.reflexo.add(copia);
    const reg = { original, copia, pares };
    this.registrados.push(reg);
    return reg;
  }

  removerRegistro(original) {
    const idx = this.registrados.findIndex((r) => r.original === original);
    if (idx >= 0) {
      this.reflexo.remove(this.registrados[idx].copia);
      this.registrados.splice(idx, 1);
    }
  }

  acordar() {
    if (!this.acordado) {
      this.acordado = true;
      if (this.aoAcordar) this.aoAcordar();
    }
  }

  dormir() {
    this.acordado = false;
  }

  // Chamado a cada quadro. "cabecaMundo": matriz da câmera no mundo; "maos": entradas da interação.
  atualizar(dt, cabecaMundo, entradas) {
    this.mundo.updateMatrixWorld();
    tmpInv.copy(this.mundo.matrixWorld).invert();
    for (const reg of this.registrados) {
      const { original, copia, pares } = reg;
      original.updateMatrixWorld();
      copia.matrix.multiplyMatrices(tmpInv, original.matrixWorld);
      copia.visible = original.visible && visivelNaArvore(original);
      for (let i = 1; i < pares.length; i++) {
        const [o, c] = pares[i];
        c.position.copy(o.position);
        c.quaternion.copy(o.quaternion);
        c.scale.copy(o.scale);
        c.visible = o.visible;
        if (o.material && c.material && !Array.isArray(o.material)) {
          if (o.material.color && c.material.color) c.material.color.copy(o.material.color);
          c.material.opacity = o.material.opacity;
          c.material.visible = o.material.visible;
        }
      }
    }
    if (cabecaMundo) {
      this.cabeca.matrix.multiplyMatrices(tmpInv, cabecaMundo);
      this.cabeca.visible = true;
    }
    this.atualizarMaos(entradas);
    // Brilho de acordado
    const alvo = this.acordado ? 1 : 0;
    this.brilho += (alvo - this.brilho) * Math.min(1, dt * 3);
    this.aura.material.opacity = 0.55 * this.brilho * (0.85 + 0.15 * Math.sin(performance.now() / 300));
    this.pelicula.material.opacity = 0.08 + 0.06 * this.brilho;
    this.matMoldura.color.setHex(0xf6c744).lerp(new THREE.Color(0x74d0d8), this.brilho * 0.25);
  }

  atualizarMaos(entradas) {
    if (!entradas) return;
    let idx = 0;
    for (const e of entradas) {
      if (!e.conectado || !e.esferasJuntas || !e.esferasJuntas.length) continue;
      for (const esfera of e.esferasJuntas) {
        let c = this.juntasEspelho[idx];
        if (!c) {
          c = new THREE.Mesh(esfera.geometry, this.materialComStencil(esfera.material));
          c.matrixAutoUpdate = false;
          c.renderOrder = ORDEM_REFLEXO;
          this.reflexo.add(c);
          this.juntasEspelho.push(c);
        }
        esfera.updateMatrixWorld();
        c.matrix.multiplyMatrices(tmpInv, esfera.matrixWorld);
        c.visible = esfera.parent ? esfera.parent.visible : false;
        idx++;
      }
    }
    for (let i = idx; i < this.juntasEspelho.length; i++) this.juntasEspelho[i].visible = false;
  }
}

function visivelNaArvore(o) {
  let v = true;
  o.traverseAncestors((a) => {
    if (!a.visible) v = false;
  });
  return v;
}

function texturaAura() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
