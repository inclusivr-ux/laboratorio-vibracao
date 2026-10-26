// Sala da Maga simplificada, feita por código (conceito). As posições seguem as âncoras
// da Sala da Maga v01 do Estúdio 3D. O jogador começa na origem, olhando para -Z.
// Para testar na sala de verdade, o .glb pode ser carregado pela página (fica só no aparelho).
import * as THREE from 'three';

export const ANCORAS = {
  inicio: new THREE.Vector3(0, 0, 0),
  espelho: new THREE.Vector3(0, 1.08, 1.6),
  aia: new THREE.Vector3(0.5, 0, -2.45),
  portal: new THREE.Vector3(0.5, 0, -3.55),
  pirikito: new THREE.Vector3(-2.6, 1.15, -3.0),
  circuloDLC: new THREE.Vector3(2.25, 0, -0.3),
  portaQuarto: new THREE.Vector3(2.7, 0, -4.95),
  maquete: new THREE.Vector3(0, 0.75, -1.23),
  lareira: new THREE.Vector3(-4.75, 0, -0.9),
};

export const RAIO_SALA = 5.8;
const ALTURA_PAREDE = 4.2;

function canvasTextura(w, h, desenhar, repetirX = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  desenhar(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repetirX !== 1) {
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(repetirX, 1);
  }
  return t;
}

function basico(cor, extra = {}) {
  return new THREE.MeshBasicMaterial({ color: cor, ...extra });
}

// Aplica um degradê de sombra nos vértices (mais escuro embaixo), para dar volume sem luz.
function sombrearVertical(geo, baixo = 0.75, alto = 1.0) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / Math.max(1e-6, bb.max.y - bb.min.y);
    const v = baixo + (alto - baixo) * t;
    cores[i * 3] = v;
    cores[i * 3 + 1] = v;
    cores[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return geo;
}

function texturaPiso() {
  return canvasTextura(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d99a2b';
    g.fillRect(0, 0, w, h);
    const r = 26;
    const dx = r * Math.sqrt(3);
    const dy = r * 1.5;
    const tons = ['#f6c744', '#f4b224', '#f1c482', '#f7d36b', '#eeb944'];
    for (let lin = -1; lin * dy < h + r; lin++) {
      for (let col = -1; col * dx < w + dx; col++) {
        const cx = col * dx + (lin % 2 ? dx / 2 : 0);
        const cy = lin * dy;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          const x = cx + (r - 2.5) * Math.cos(a);
          const y = cy + (r - 2.5) * Math.sin(a);
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fillStyle = tons[(lin * 7 + col * 3 + 100) % tons.length];
        g.fill();
      }
    }
    // Escurece as bordas (mais perto da parede).
    const grad = g.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.5);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(60,30,0,0.35)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function texturaTapete() {
  return canvasTextura(1024, 1024, (g, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    g.fillStyle = '#1f4a52';
    g.beginPath();
    g.arc(cx, cy, w / 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f6c744';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 30, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 60, 0, Math.PI * 2);
    g.stroke();
    const estrela = (x, y, r, cor) => {
      g.fillStyle = cor;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k;
        const rr = k % 2 ? r * 0.35 : r;
        g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
      g.closePath();
      g.fill();
    };
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI / 4) * k + 0.2;
      estrela(cx + (w / 2 - 130) * Math.cos(a), cy + (w / 2 - 130) * Math.sin(a), 26, '#ebf5b8');
    }
    for (let k = 0; k < 16; k++) {
      const a = (Math.PI / 8) * k;
      g.fillStyle = '#74d0d8';
      g.fillRect(cx + (w / 2 - 200) * Math.cos(a) - 6, cy + (w / 2 - 200) * Math.sin(a) - 6, 12, 12);
    }
    estrela(cx, cy, 120, '#2b5a64');
  });
}

function texturaParede() {
  return canvasTextura(2048, 512, (g, w, h) => {
    g.fillStyle = '#f2cdbf';
    g.fillRect(0, 0, w, h);
    // tijolos
    const bw = 96;
    const bh = 40;
    for (let y = 70; y < h * 0.8; y += bh) {
      const off = ((y / bh) % 2) * (bw / 2);
      for (let x = -bw; x < w + bw; x += bw) {
        g.fillStyle = (x + y) % 3 === 0 ? '#ecbcaa' : '#efc5b4';
        g.beginPath();
        g.roundRect(x + off + 4, y + 4, bw - 8, bh - 8, 10);
        g.fill();
      }
    }
    // faixa de pedra embaixo
    g.fillStyle = '#a9ac9d';
    g.fillRect(0, h * 0.82, w, h * 0.18);
    for (let x = 0; x < w; x += 54) {
      g.fillStyle = (x / 54) % 2 ? '#8f9384' : '#b7baab';
      g.beginPath();
      g.roundRect(x + 3, h * 0.84, 48, h * 0.14, 12);
      g.fill();
    }
    // faixa dourada no alto
    g.fillStyle = '#f6c744';
    g.fillRect(0, 22, w, 14);
    g.fillStyle = '#74d0d8';
    for (let x = 30; x < w; x += 160) {
      g.save();
      g.translate(x, 29);
      g.rotate(Math.PI / 4);
      g.fillRect(-5, -5, 10, 10);
      g.restore();
    }
  }, 4);
}

function texturaCeu() {
  return canvasTextura(1024, 512, (g, w, h) => {
    g.fillStyle = '#223d3e';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() < 0.08 ? 2.4 : 1.1;
      g.fillStyle = Math.random() < 0.15 ? '#f6c744' : '#ebf5b8';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  }, 2);
}

function texturaTapecaria() {
  return canvasTextura(512, 768, (g, w, h) => {
    g.fillStyle = '#26474a';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f6c744';
    g.lineWidth = 8;
    g.strokeRect(24, 24, w - 48, h - 48);
    g.lineWidth = 3;
    g.strokeRect(44, 44, w - 88, h - 88);
    g.fillStyle = '#f6c744';
    for (const [x, y] of [[w / 2, 120], [w / 2, h - 120]]) {
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k;
        const rr = k % 2 ? 10 : 28;
        g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
      }
      g.fill();
    }
  });
}

function texturaLivros() {
  return canvasTextura(512, 768, (g, w, h) => {
    g.fillStyle = '#5a3a22';
    g.fillRect(0, 0, w, h);
    const cores = ['#d22027', '#15b0ff', '#42b23c', '#f4b224', '#ac2fed', '#f799d1', '#ebf5b8', '#63cbc9'];
    for (let prat = 0; prat < 6; prat++) {
      const y0 = 30 + prat * 122;
      g.fillStyle = '#3d2716';
      g.fillRect(0, y0 + 100, w, 16);
      let x = 18;
      while (x < w - 30) {
        const bw = 14 + Math.random() * 22;
        const bh = 70 + Math.random() * 28;
        g.fillStyle = cores[Math.floor(Math.random() * cores.length)];
        g.fillRect(x, y0 + 100 - bh, bw, bh);
        x += bw + 3;
      }
    }
  });
}

function texturaPlaca(texto) {
  return canvasTextura(512, 96, (g, w, h) => {
    g.fillStyle = '#4a2f1a';
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 18);
    g.fill();
    g.strokeStyle = '#f6c744';
    g.lineWidth = 5;
    g.stroke();
    g.fillStyle = '#f6c744';
    g.font = '800 54px "Fraunces Soft", Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, w / 2, h / 2 + 3);
  });
}

function texturaRunas() {
  return canvasTextura(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    g.strokeStyle = 'rgba(174,123,255,1)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 12, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 50, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(203,148,255,1)';
    g.font = '800 46px Outfit, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const letras = ['A', 'E', 'I', 'O', 'U', 'L', 'S', 'M'];
    letras.forEach((l, k) => {
      const a = (Math.PI * 2 * k) / letras.length;
      g.save();
      g.translate(cx + (w / 2 - 31) * Math.cos(a), cy + (w / 2 - 31) * Math.sin(a));
      g.rotate(a + Math.PI / 2);
      g.fillText(l, 0, 0);
      g.restore();
    });
  });
}

export function criarSala() {
  const sala = new THREE.Group();
  sala.name = 'SalaDaMaga';
  const animaveis = { velas: [], chamas: [], brilhoLareira: null, circulo: null, runasMesa: [] };

  // Piso
  const piso = new THREE.Mesh(new THREE.CircleGeometry(RAIO_SALA, 64), basico(0xffffff, { map: texturaPiso() }));
  piso.rotation.x = -Math.PI / 2;
  piso.name = 'Piso';
  sala.add(piso);
  const tapete = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), basico(0xffffff, { map: texturaTapete() }));
  tapete.rotation.x = -Math.PI / 2;
  tapete.position.y = 0.004;
  sala.add(tapete);

  // Parede
  const geoParede = sombrearVertical(new THREE.CylinderGeometry(RAIO_SALA, RAIO_SALA, ALTURA_PAREDE, 72, 1, true), 0.72, 1.0);
  const parede = new THREE.Mesh(geoParede, basico(0xffffff, { map: texturaParede(), side: THREE.BackSide, vertexColors: true }));
  parede.position.y = ALTURA_PAREDE / 2;
  sala.add(parede);

  // Colunas
  const matColuna = basico(0xffffff, { vertexColors: true, color: 0xf6d8cb });
  for (let k = 0; k < 10; k++) {
    const a = (Math.PI * 2 * k) / 10 + 0.31;
    const geo = sombrearVertical(new THREE.CylinderGeometry(0.2, 0.24, ALTURA_PAREDE - 0.4, 16), 0.65, 1.0);
    const col = new THREE.Mesh(geo, matColuna);
    col.position.set((RAIO_SALA - 0.3) * Math.sin(a), (ALTURA_PAREDE - 0.4) / 2, (RAIO_SALA - 0.3) * Math.cos(a));
    sala.add(col);
  }

  // Cúpula de estrelas
  const cupula = new THREE.Mesh(
    new THREE.SphereGeometry(RAIO_SALA, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    basico(0xffffff, { map: texturaCeu(), side: THREE.BackSide }),
  );
  cupula.scale.y = 0.45;
  cupula.position.y = ALTURA_PAREDE;
  sala.add(cupula);
  const aro = new THREE.Mesh(new THREE.TorusGeometry(RAIO_SALA - 0.05, 0.06, 8, 96), basico(0xf6c744));
  aro.rotation.x = Math.PI / 2;
  aro.position.y = ALTURA_PAREDE - 0.05;
  sala.add(aro);

  // Velas no alto da parede (pulsam com a música)
  const matVela = basico(0xf9f4e6);
  const texChama = canvasTextura(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,250,220,1)');
    grad.addColorStop(0.35, 'rgba(246,199,68,0.9)');
    grad.addColorStop(1, 'rgba(244,120,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  for (let k = 0; k < 14; k++) {
    const a = (Math.PI * 2 * k) / 14;
    const x = (RAIO_SALA - 0.35) * Math.sin(a);
    const z = (RAIO_SALA - 0.35) * Math.cos(a);
    const vela = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), matVela);
    vela.position.set(x, 3.15, z);
    sala.add(vela);
    const chama = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texChama, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    chama.position.set(x, 3.32, z);
    chama.scale.set(0.16, 0.22, 1);
    chama.userData.base = 1;
    sala.add(chama);
    animaveis.velas.push(chama);
  }

  // Mesa com a maquete de Signária
  const mesa = new THREE.Group();
  mesa.position.set(ANCORAS.maquete.x, 0, ANCORAS.maquete.z);
  const madeira = basico(0x8b5a2b);
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 48), madeira);
  tampo.position.y = 0.72;
  const borda = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.03, 8, 48), basico(0x6b4220));
  borda.rotation.x = Math.PI / 2;
  borda.position.y = 0.75;
  const pe = new THREE.Mesh(sombrearVertical(new THREE.CylinderGeometry(0.1, 0.16, 0.7, 16), 0.6, 1), basico(0xffffff, { color: 0x7a4a22, vertexColors: true }));
  pe.position.y = 0.35;
  const verde = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.025, 48), basico(0x6a9a3a));
  verde.position.y = 0.77;
  const rio = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 48), basico(0x6ac6c8, { side: THREE.DoubleSide }));
  rio.rotation.x = -Math.PI / 2;
  rio.position.y = 0.784;
  mesa.add(tampo, borda, pe, verde, rio);
  const coresCasas = [0xf2cdbf, 0xffffff, 0xf9c3e2, 0xebf5b8];
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.08 + Math.random() * 0.28;
    const casa = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03 + Math.random() * 0.04, 0.035), basico(coresCasas[k % 4]));
    casa.position.set(r * Math.cos(a), 0.8, r * Math.sin(a));
    mesa.add(casa);
  }
  const casaAia = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), basico(0xe07a3a));
  casaAia.position.set(0, 0.84, 0);
  mesa.add(casaAia);
  for (let k = 0; k < 5; k++) {
    const runa = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.035), basico(0x4b5028));
    const a = Math.PI * 0.75 + k * 0.25;
    runa.position.set(0.64 * Math.cos(a), 0.765, 0.64 * Math.sin(a));
    runa.rotation.y = -a;
    runa.userData.corBase = new THREE.Color(0x4b5028);
    mesa.add(runa);
    animaveis.runasMesa.push(runa);
  }
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.056), basico(0xffffff, { map: texturaPlaca('SIGNÁRIA'), transparent: true }));
  placa.position.set(0, 0.73, 0.705);
  mesa.add(placa);
  sala.add(mesa);

  // Gaiola dourada vazia (à esquerda)
  const gaiola = new THREE.Group();
  gaiola.position.set(-2.4, 0, -2.7);
  const ouro = basico(0xf6c744);
  for (let k = 0; k < 18; k++) {
    const a = (Math.PI * 2 * k) / 18;
    const barra = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 4), ouro);
    barra.position.set(0.32 * Math.cos(a), 1.05, 0.32 * Math.sin(a));
    gaiola.add(barra);
  }
  for (const y of [0.7, 1.4]) {
    const anel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.012, 6, 32), ouro);
    anel.rotation.x = Math.PI / 2;
    anel.position.y = y;
    gaiola.add(anel);
  }
  const topo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), basico(0xf6c744, { wireframe: true }));
  topo.position.y = 1.4;
  gaiola.add(topo);
  const pedestal = new THREE.Mesh(sombrearVertical(new THREE.CylinderGeometry(0.08, 0.3, 0.7, 16), 0.6, 1), basico(0xffffff, { color: 0x7a4a22, vertexColors: true }));
  pedestal.position.y = 0.35;
  gaiola.add(pedestal);
  sala.add(gaiola);

  // Estante de livros e tapeçaria ao fundo
  const angEstante = Math.atan2(-3.2, -4.6);
  const estante = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.4), [
    madeira, madeira, madeira, madeira, basico(0xffffff, { map: texturaLivros() }), madeira,
  ]);
  estante.position.set((RAIO_SALA - 0.45) * Math.sin(angEstante), 1.3, (RAIO_SALA - 0.45) * Math.cos(angEstante));
  estante.lookAt(0, 1.3, 0);
  sala.add(estante);
  const tapecaria = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), basico(0xffffff, { map: texturaTapecaria() }));
  tapecaria.position.set(0, 2.1, -RAIO_SALA + 0.12);
  sala.add(tapecaria);

  // Porta entreaberta do quarto (fundo, à direita)
  const angPorta = Math.atan2(ANCORAS.portaQuarto.x, ANCORAS.portaQuarto.z);
  const porta = new THREE.Group();
  porta.position.set((RAIO_SALA - 0.05) * Math.sin(angPorta), 0, (RAIO_SALA - 0.05) * Math.cos(angPorta));
  porta.lookAt(0, 0, 0);
  const vao = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), basico(0x2b1d14));
  vao.position.set(0, 1.1, 0.01);
  const arco = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24, 0, Math.PI), basico(0x2b1d14));
  arco.position.set(0, 2.2, 0.01);
  const folha = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), basico(0x9a6532));
  folha.position.set(0.48, 1.06, 0.3);
  folha.rotation.y = -0.55;
  folha.translateX(0);
  porta.add(vao, arco, folha);
  sala.add(porta);

  // Lareira (à esquerda)
  const lareira = new THREE.Group();
  lareira.position.copy(ANCORAS.lareira);
  lareira.lookAt(0, 0, ANCORAS.lareira.z);
  const pedra = basico(0x8f9384);
  const caixa = new THREE.Mesh(sombrearVertical(new THREE.BoxGeometry(1.7, 1.5, 0.7), 0.7, 1), basico(0xffffff, { color: 0xa9ac9d, vertexColors: true }));
  caixa.position.set(0, 0.75, -0.2);
  const boca = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), basico(0x1a1210));
  boca.position.set(0, 0.5, 0.155);
  const cornija = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.8), pedra);
  cornija.position.set(0, 1.52, -0.15);
  lareira.add(caixa, boca, cornija);
  const texFogo = canvasTextura(128, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.75, 4, w / 2, h * 0.65, h * 0.6);
    grad.addColorStop(0, 'rgba(255,245,200,1)');
    grad.addColorStop(0.3, 'rgba(246,199,68,0.95)');
    grad.addColorStop(0.65, 'rgba(242,112,58,0.7)');
    grad.addColorStop(1, 'rgba(210,32,39,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(w / 2, 0);
    g.quadraticCurveTo(w, h * 0.6, w / 2, h);
    g.quadraticCurveTo(0, h * 0.6, w / 2, 0);
    g.fill();
  });
  for (let k = 0; k < 4; k++) {
    const chama = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFogo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    chama.position.set(-0.3 + k * 0.2, 0.42, 0.2);
    chama.scale.set(0.28, 0.5, 1);
    chama.userData.fase = Math.random() * 10;
    lareira.add(chama);
    animaveis.chamas.push(chama);
  }
  const brilho = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2703a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  brilho.rotation.x = -Math.PI / 2;
  brilho.position.set(0, 0.01, 0.9);
  lareira.add(brilho);
  animaveis.brilhoLareira = brilho;
  sala.add(lareira);

  // Círculo dos DLCs (à direita)
  const circulo = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 48),
    new THREE.MeshBasicMaterial({ map: texturaRunas(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  circulo.rotation.x = -Math.PI / 2;
  circulo.position.set(ANCORAS.circuloDLC.x, 0.012, ANCORAS.circuloDLC.z);
  sala.add(circulo);
  animaveis.circulo = circulo;

  return { sala, animaveis };
}

// Anima fogo, velas e círculo. "pulso" (0 a 1) vem da música.
export function animarSala(animaveis, t, pulso = 0) {
  for (const c of animaveis.chamas) {
    const f = 0.85 + 0.15 * Math.sin(t * 13 + c.userData.fase) + 0.1 * Math.sin(t * 29 + c.userData.fase * 2);
    c.scale.set(0.28 * (0.9 + 0.1 * f), 0.5 * f, 1);
  }
  if (animaveis.brilhoLareira) {
    animaveis.brilhoLareira.material.opacity = 0.18 + 0.08 * Math.sin(t * 11) + 0.05 * Math.sin(t * 23);
  }
  for (const v of animaveis.velas) {
    const s = 1 + 0.06 * Math.sin(t * 9 + v.position.x * 3) + pulso * 0.9;
    v.scale.set(0.16 * s, 0.22 * s, 1);
  }
  if (animaveis.circulo) animaveis.circulo.rotation.z = t * 0.15;
  for (const r of animaveis.runasMesa) {
    r.material.color.copy(r.userData.corBase).lerp(new THREE.Color(0x74d0d8), Math.min(1, pulso * 1.4));
  }
}
