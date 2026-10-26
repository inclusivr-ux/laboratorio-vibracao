// Pirikito (conceito): ave escura, mais urubu, de óculos, com asas em forma de mão e dedos coloridos.
// O visual final depende da concept art do Igor; este modelo é só para os testes de som.
import * as THREE from 'three';

const CORES_DEDOS = [0xd22027, 0xf4b224, 0x42b23c, 0x15b0ff, 0xac2fed];

function criarAsa(lado) {
  const asa = new THREE.Group();
  const palma = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), new THREE.MeshBasicMaterial({ color: 0x2e2f2a }));
  palma.scale.set(1.25, 0.35, 0.95);
  palma.position.x = lado * 0.08;
  asa.add(palma);
  CORES_DEDOS.forEach((cor, i) => {
    const dedo = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.07, 4, 8), new THREE.MeshBasicMaterial({ color: cor }));
    const a = -0.5 + i * 0.25;
    dedo.position.set(lado * (0.15 + 0.02 * Math.cos(a)), 0, 0.065 * Math.sin(a) * 1.6);
    dedo.rotation.z = (lado * Math.PI) / 2;
    dedo.rotation.y = -a * lado * 0.6;
    asa.add(dedo);
  });
  return asa;
}

export function criarPirikito() {
  const raiz = new THREE.Group();
  raiz.name = 'Pirikito';
  const corpo = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), new THREE.MeshBasicMaterial({ color: 0x2e2f2a }));
  corpo.scale.set(1, 1.1, 1.3);
  raiz.add(corpo);
  const peito = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshBasicMaterial({ color: 0x4b4d46 }));
  peito.position.set(0, -0.01, -0.06);
  raiz.add(peito);
  const cabeca = new THREE.Group();
  cabeca.position.set(0, 0.12, -0.09);
  const cranio = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshBasicMaterial({ color: 0x8a7f7a }));
  const bico = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 10), new THREE.MeshBasicMaterial({ color: 0xebdcc0 }));
  bico.rotation.x = -Math.PI / 2 - 0.5;
  bico.position.set(0, -0.02, -0.07);
  cabeca.add(cranio, bico);
  const matOculos = new THREE.MeshBasicMaterial({ color: 0xf6c744 });
  for (const x of [-0.025, 0.025]) {
    const lente = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 16), matOculos);
    lente.position.set(x, 0.012, -0.055);
    cabeca.add(lente);
    const olho = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    olho.position.set(x, 0.012, -0.05);
    cabeca.add(olho);
  }
  const ponte = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.003), matOculos);
  ponte.position.set(0, 0.014, -0.058);
  cabeca.add(ponte);
  raiz.add(cabeca);
  const asaE = criarAsa(-1);
  asaE.position.set(-0.07, 0.03, 0);
  const asaD = criarAsa(1);
  asaD.position.set(0.07, 0.03, 0);
  raiz.add(asaE, asaD);
  const cauda = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0x2e2f2a }));
  cauda.rotation.x = Math.PI / 2 - 0.3;
  cauda.position.set(0, -0.03, 0.16);
  raiz.add(cauda);
  raiz.userData.asas = [asaE, asaD];
  raiz.userData.cabeca = cabeca;
  return raiz;
}

// Bate as asas (frequência em batidas por segundo; 0 = parado).
export function baterAsas(pirikito, t, frequencia = 6) {
  const [e, d] = pirikito.userData.asas;
  const a = frequencia > 0 ? Math.sin(t * Math.PI * 2 * frequencia) * 0.9 : -0.3;
  e.rotation.z = a;
  d.rotation.z = -a;
  if (pirikito.userData.cabeca) pirikito.userData.cabeca.rotation.y = Math.sin(t * 0.7) * 0.4;
}

// Trajetória em volta da cabeça (como a tesoura do barbeiro virtual).
// Começa à esquerda e passa pela frente, direita e costas.
export function posicaoVolta(centro, raio, altura, fase) {
  const a = -Math.PI / 2 + fase * Math.PI * 2; // -90° = esquerda
  return new THREE.Vector3(centro.x + raio * Math.sin(a), altura + 0.08 * Math.sin(fase * Math.PI * 6), centro.z - raio * Math.cos(a));
}
