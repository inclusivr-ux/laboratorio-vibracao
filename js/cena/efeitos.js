// Pistas visuais do som: marcadores nas fontes, setas na borda da visão, legendas,
// luz que vem de trás (com a sombra do jogador para a frente) e ondas no chão.
import * as THREE from 'three';

function texturaBrilho(cor = '255,255,255') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${cor},1)`);
  grad.addColorStop(0.25, `rgba(${cor},0.6)`);
  grad.addColorStop(1, `rgba(${cor},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let TEX_BRILHO = null;
function brilho() {
  if (!TEX_BRILHO) TEX_BRILHO = texturaBrilho();
  return TEX_BRILHO;
}

function texturaAnel() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 14;
  g.beginPath();
  g.arc(128, 128, 110, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let TEX_ANEL = null;
function anel() {
  if (!TEX_ANEL) TEX_ANEL = texturaAnel();
  return TEX_ANEL;
}

export function spriteTexto(texto, { cor = '#ebf5b8', fundo = 'rgba(16,4,72,0.72)', tamanho = 44, largura = 512 } = {}) {
  const c = document.createElement('canvas');
  c.width = largura;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = fundo;
  g.beginPath();
  g.roundRect(4, 8, largura - 8, 80, 40);
  g.fill();
  g.fillStyle = cor;
  g.font = `700 ${tamanho}px Lexend, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, largura / 2, 50, largura - 40);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set((0.09 * largura) / 96, 0.09, 1);
  return s;
}

// ---------------------------------------------------------------------------
// Marcador de uma fonte sonora
// ---------------------------------------------------------------------------
export class MarcadorSom {
  constructor({ cor = '#74d0d8', rotulo = null, raio = 0.07 } = {}) {
    this.cor = new THREE.Color(cor);
    this.grupo = new THREE.Group();
    this.nucleo = new THREE.Mesh(
      new THREE.SphereGeometry(raio, 20, 14),
      new THREE.MeshBasicMaterial({ color: this.cor, transparent: true, opacity: 0.95 }),
    );
    this.grupo.add(this.nucleo);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: brilho(), color: this.cor, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.halo.scale.set(raio * 6, raio * 6, 1);
    this.grupo.add(this.halo);
    this.aneis = [];
    for (let i = 0; i < 4; i++) {
      const a = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: anel(), color: this.cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      a.userData.idade = 99;
      this.grupo.add(a);
      this.aneis.push(a);
    }
    this.tempoAnel = 0;
    this.nivelSuave = 0;
    if (rotulo) {
      this.rotulo = spriteTexto(rotulo, { tamanho: 38 });
      this.rotulo.position.y = raio + 0.09;
      this.grupo.add(this.rotulo);
    }
    this.raio = raio;
  }

  // nivel: 0 a 1. mostrarOndas: ondas que saem da fonte quando ela soa.
  atualizar(dt, nivel, mostrarOndas = true) {
    this.nivelSuave += (nivel - this.nivelSuave) * Math.min(1, dt * 18);
    const n = Math.min(1, this.nivelSuave * 4);
    const s = 1 + n * 0.8;
    this.nucleo.scale.setScalar(s);
    this.halo.scale.setScalar(this.raio * (5 + n * 7));
    this.halo.material.opacity = 0.5 + n * 0.5;
    this.tempoAnel += dt;
    if (mostrarOndas && n > 0.15 && this.tempoAnel > 0.22) {
      this.tempoAnel = 0;
      const livre = this.aneis.find((a) => a.userData.idade > 0.9) || this.aneis[0];
      livre.userData.idade = 0;
      livre.userData.forca = n;
    }
    for (const a of this.aneis) {
      a.userData.idade += dt;
      const t = a.userData.idade / 0.9;
      if (t >= 1) {
        a.material.opacity = 0;
        continue;
      }
      const r = this.raio * 2 + t * 0.6;
      a.scale.set(r * 2, r * 2, 1);
      a.material.opacity = (1 - t) * 0.8 * (a.userData.forca || 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Setas na borda da visão (presas à cabeça)
// ---------------------------------------------------------------------------
export class SetasDirecao {
  constructor(camera) {
    this.grupo = new THREE.Group();
    this.grupo.position.set(0, 0, -1.0);
    camera.add(this.grupo);
    const forma = new THREE.Shape();
    forma.moveTo(0, 0.05);
    forma.lineTo(0.045, -0.02);
    forma.lineTo(0.015, -0.01);
    forma.lineTo(0, -0.035);
    forma.lineTo(-0.015, -0.01);
    forma.lineTo(-0.045, -0.02);
    forma.closePath();
    const geo = new THREE.ShapeGeometry(forma);
    this.setas = [];
    for (let k = 0; k < 8; k++) {
      const ang = (Math.PI / 4) * k; // 0 = direita, sentido anti-horário
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0x74d0d8, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
      );
      m.position.set(0.36 * Math.cos(ang), 0.3 * Math.sin(ang), 0);
      m.rotation.z = ang - Math.PI / 2;
      m.renderOrder = 200;
      m.userData.ang = ang;
      m.userData.alvo = 0;
      this.grupo.add(m);
      this.setas.push(m);
    }
    this.atras = spriteTexto('ATRÁS', { tamanho: 46, largura: 300, fundo: 'rgba(16,4,72,0.8)', cor: '#74d0d8' });
    this.atras.material.depthTest = false;
    this.atras.renderOrder = 201;
    this.atras.position.set(0, -0.36, 0);
    this.atras.material.opacity = 0;
    this.grupo.add(this.atras);
    this.alvoAtras = 0;
  }

  // fontes: [{ posicao: Vector3 (mundo), nivel: 0..1, cor: Color }]
  atualizar(dt, camera, fontes, ligado = true) {
    for (const s of this.setas) s.userData.alvo = 0;
    this.alvoAtras = 0;
    if (ligado) {
      camera.updateMatrixWorld();
      const inv = camera.matrixWorld.clone().invert();
      for (const f of fontes) {
        if (f.nivel < 0.01) continue;
        const d = f.posicao.clone().applyMatrix4(inv);
        const dist = d.length();
        if (dist < 1e-3) continue;
        d.divideScalar(dist);
        const anguloFrente = Math.acos(Math.max(-1, Math.min(1, -d.z)));
        if (anguloFrente < (35 * Math.PI) / 180) continue; // já está à vista
        let ang = Math.atan2(d.y, d.x);
        if (Math.hypot(d.x, d.y) < 0.15) ang = -Math.PI / 2; // bem atrás: seta de baixo
        let idx = Math.round(ang / (Math.PI / 4));
        idx = ((idx % 8) + 8) % 8;
        const forca = Math.min(1, 0.35 + f.nivel * 4);
        const s = this.setas[idx];
        if (forca > s.userData.alvo) {
          s.userData.alvo = forca;
          if (f.cor) s.material.color.copy(f.cor);
        }
        if (d.z > 0.35) this.alvoAtras = Math.max(this.alvoAtras, forca);
      }
    }
    const k = Math.min(1, dt * 10);
    for (const s of this.setas) {
      s.material.opacity += (s.userData.alvo - s.material.opacity) * k;
      s.visible = s.material.opacity > 0.01;
    }
    this.atras.material.opacity += (this.alvoAtras - this.atras.material.opacity) * k;
    this.atras.visible = this.atras.material.opacity > 0.01;
  }
}

// ---------------------------------------------------------------------------
// Legendas de som (presas à visão, com seta quando a fonte está fora de vista)
// ---------------------------------------------------------------------------
export class Legendas {
  constructor(camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 220;
    this.g = this.canvas.getContext('2d');
    this.textura = new THREE.CanvasTexture(this.canvas);
    this.textura.colorSpace = THREE.SRGBColorSpace;
    this.malha = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.133),
      new THREE.MeshBasicMaterial({ map: this.textura, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.malha.renderOrder = 202;
    this.malha.position.set(0, -0.2, -0.95);
    camera.add(this.malha);
    this.itens = [];
    this.ultimoDesenho = '';
  }

  // direcao: '' | 'esquerda' | 'direita' | 'acima' | 'abaixo' | 'atras'
  mostrar(texto, { direcao = '', duracao = 2.5, chave = null } = {}) {
    const k = chave || texto;
    const existente = this.itens.find((i) => i.chave === k);
    if (existente) {
      existente.restante = duracao;
      existente.direcao = direcao;
      return;
    }
    this.itens.push({ chave: k, texto, direcao, restante: duracao });
    if (this.itens.length > 2) this.itens.shift();
  }

  atualizar(dt, ligado = true) {
    for (const i of this.itens) i.restante -= dt;
    this.itens = this.itens.filter((i) => i.restante > 0);
    const visiveis = ligado ? this.itens : [];
    const assinatura = visiveis.map((i) => `${i.texto}|${i.direcao}`).join('/');
    this.malha.visible = visiveis.length > 0;
    if (assinatura === this.ultimoDesenho) return;
    this.ultimoDesenho = assinatura;
    const g = this.g;
    g.clearRect(0, 0, 1024, 220);
    visiveis.forEach((item, idx) => {
      const y = 12 + idx * 104;
      const seta = { esquerda: '← ', direita: ' →', acima: ' ↑', abaixo: ' ↓', atras: ' (atrás)' }[item.direcao] || '';
      const txt = item.direcao === 'esquerda' ? `${seta}[ ${item.texto} ]` : `[ ${item.texto} ]${seta}`;
      g.font = '700 52px Lexend, sans-serif';
      const w = Math.min(1000, g.measureText(txt).width + 70);
      g.fillStyle = 'rgba(16,4,72,0.82)';
      g.beginPath();
      g.roundRect(512 - w / 2, y, w, 92, 46);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, 512, y + 48, 980);
    });
    this.textura.needsUpdate = true;
  }
}

// Direção de um ponto em relação à visão, para a legenda.
export function direcaoRelativa(camera, posicao) {
  camera.updateMatrixWorld();
  const d = posicao.clone().applyMatrix4(camera.matrixWorld.clone().invert());
  const dist = d.length() || 1;
  d.divideScalar(dist);
  if (Math.acos(Math.max(-1, Math.min(1, -d.z))) < (35 * Math.PI) / 180) return '';
  if (d.z > 0.5 && Math.abs(d.x) < 0.6) return 'atras';
  if (Math.abs(d.x) >= Math.abs(d.y)) return d.x < 0 ? 'esquerda' : 'direita';
  return d.y > 0 ? 'acima' : 'abaixo';
}

// ---------------------------------------------------------------------------
// Luz que vem de trás: brilho no chão e a sombra do jogador apontando para a frente
// ---------------------------------------------------------------------------
export class LuzDeTras {
  constructor(cena) {
    this.grupo = new THREE.Group();
    cena.add(this.grupo);
    const cSombra = document.createElement('canvas');
    cSombra.width = 128;
    cSombra.height = 256;
    const g = cSombra.getContext('2d');
    const grad = g.createRadialGradient(64, 200, 10, 64, 150, 150);
    grad.addColorStop(0, 'rgba(10,20,25,0.85)');
    grad.addColorStop(0.6, 'rgba(10,20,25,0.4)');
    grad.addColorStop(1, 'rgba(10,20,25,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(64, 140, 46, 120, 0, 0, Math.PI * 2);
    g.fill();
    const tSombra = new THREE.CanvasTexture(cSombra);
    this.sombra = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 1.9),
      new THREE.MeshBasicMaterial({ map: tSombra, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.sombra.rotation.x = -Math.PI / 2;
    this.sombra.renderOrder = 5;
    this.grupo.add(this.sombra);
    // Leque de luz no chão: sai de trás do jogador e ilumina a frente (a sombra fica visível dentro dele).
    const cLuz = document.createElement('canvas');
    cLuz.width = 256;
    cLuz.height = 256;
    const gl = cLuz.getContext('2d');
    // O centro do círculo (128,128) é a origem da luz; o brilho cai com a distância.
    const gradL = gl.createRadialGradient(128, 128, 4, 128, 128, 128);
    gradL.addColorStop(0, 'rgba(255,255,255,1)');
    gradL.addColorStop(0.45, 'rgba(255,255,255,0.6)');
    gradL.addColorStop(1, 'rgba(255,255,255,0)');
    gl.fillStyle = gradL;
    gl.fillRect(0, 0, 256, 256);
    const tLuz = new THREE.CanvasTexture(cLuz);
    this.leque = new THREE.Mesh(
      new THREE.CircleGeometry(5.5, 40, -Math.PI / 2 - 0.55, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x74d0d8, map: tLuz, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.leque.rotation.x = -Math.PI / 2;
    this.leque.renderOrder = 4;
    this.grupo.add(this.leque);
    // Brilho na parede da frente: a luz de trás também "acende" o que o jogador está olhando.
    const cParede = document.createElement('canvas');
    cParede.width = 256;
    cParede.height = 128;
    const gp = cParede.getContext('2d');
    const gradP = gp.createRadialGradient(128, 80, 6, 128, 80, 128);
    gradP.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradP.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    gradP.addColorStop(1, 'rgba(255,255,255,0)');
    gp.fillStyle = gradP;
    gp.fillRect(0, 0, 256, 128);
    this.parede = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 2.75),
      new THREE.MeshBasicMaterial({ color: 0x74d0d8, map: new THREE.CanvasTexture(cParede), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.parede.renderOrder = 4;
    this.grupo.add(this.parede);
    this.intensidade = 0;
    this.alvo = 0;
  }

  // origemLuz e jogador em coordenadas de mundo (no chão).
  definir(origemLuz, jogador, intensidade) {
    this.alvo = intensidade;
    const dir = new THREE.Vector3().subVectors(jogador, origemLuz);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const ang = Math.atan2(dir.x, dir.z);
    // A ponta mais escura da sombra fica nos pés; o resto se estende para a frente.
    this.sombra.position.set(jogador.x + dir.x * 0.75, 0.014, jogador.z + dir.z * 0.75);
    this.sombra.rotation.set(-Math.PI / 2, 0, ang + Math.PI);
    this.leque.position.set(origemLuz.x, 0.009, origemLuz.z);
    this.leque.rotation.set(-Math.PI / 2, 0, ang);
    // Na parede oposta à luz, olhando para o centro da sala.
    const distParede = 5.5;
    this.parede.position.set(jogador.x + dir.x * distParede, 1.7, jogador.z + dir.z * distParede);
    this.parede.rotation.set(0, ang + Math.PI, 0);
  }

  atualizar(dt) {
    this.intensidade += (this.alvo - this.intensidade) * Math.min(1, dt * 4);
    const pulso = 0.85 + 0.15 * Math.sin(performance.now() / 250);
    this.sombra.material.opacity = 0.85 * this.intensidade;
    this.leque.material.opacity = 0.65 * this.intensidade * pulso;
    this.parede.material.opacity = 0.55 * this.intensidade * pulso;
    this.grupo.visible = this.intensidade > 0.01;
  }
}

// ---------------------------------------------------------------------------
// Ondas no chão (grave / batida)
// ---------------------------------------------------------------------------
export class OndasChao {
  constructor(cena, cor = 0x74d0d8) {
    this.grupo = new THREE.Group();
    cena.add(this.grupo);
    this.ondas = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.0, 64),
        new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      m.rotation.x = -Math.PI / 2;
      m.userData.idade = 99;
      m.renderOrder = 6;
      this.grupo.add(m);
      this.ondas.push(m);
    }
  }

  disparar(centro, forca = 1) {
    const livre = this.ondas.find((o) => o.userData.idade > 1.2) || this.ondas[0];
    livre.userData.idade = 0;
    livre.userData.forca = forca;
    livre.position.set(centro.x, 0.015, centro.z);
  }

  atualizar(dt) {
    for (const o of this.ondas) {
      o.userData.idade += dt;
      const t = o.userData.idade / 1.2;
      if (t >= 1) {
        o.material.opacity = 0;
        o.visible = false;
        continue;
      }
      o.visible = true;
      const r = 0.3 + t * 2.6;
      o.scale.set(r, r, r);
      o.material.opacity = (1 - t) * 0.6 * (o.userData.forca || 1);
    }
  }
}
