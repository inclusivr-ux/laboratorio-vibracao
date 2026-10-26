// Interação: raio (controle ou pinça da mão), toque com a ponta do dedo (mãos) e mouse (modo PC).
import * as THREE from 'three';

const tmpMat = new THREE.Matrix4();
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();

const DIST_TOQUE = 0.012; // o dedo "aperta" a 1,2 cm da placa
const DIST_SOLTA = 0.03;

export class Interacao {
  constructor(app) {
    this.app = app;
    this.paineis = [];
    this.interativos = [];
    this.entradas = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 30;
    this.mouse = {
      ndc: new THREE.Vector2(),
      dentro: false,
      pressionado: false,
      arrasteCamera: false,
      ultimoX: 0,
      ultimoY: 0,
      alvo: null,
      painel: null,
    };
    this.aoTocarBotao = null;
  }

  adicionarPainel(p) {
    if (!this.paineis.includes(p)) this.paineis.push(p);
  }

  adicionarInterativo(obj) {
    if (!this.interativos.includes(obj)) this.interativos.push(obj);
  }

  removerInterativo(obj) {
    this.interativos = this.interativos.filter((o) => o !== obj);
  }

  alvosVisiveis() {
    const lista = [];
    for (const p of this.paineis) if (p.visivel && p.grupo.visible && p.malha.visible) lista.push(p.malha);
    for (const o of this.interativos) {
      let vis = true;
      o.traverseAncestors((a) => {
        if (!a.visible) vis = false;
      });
      if (vis && o.visible) lista.push(o);
    }
    return lista;
  }

  // ------------------------------------------------------------------
  // VR
  // ------------------------------------------------------------------
  configurarXR(renderer, pai) {
    for (let i = 0; i < 2; i++) {
      const controle = renderer.xr.getController(i);
      const pegada = renderer.xr.getControllerGrip(i);
      const mao = renderer.xr.getHand(i);
      pai.add(controle);
      pai.add(pegada);
      pai.add(mao);

      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const raio = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x74d0d8, transparent: true, opacity: 0.85 }));
      raio.visible = false;
      controle.add(raio);
      const cursor = new THREE.Mesh(
        new THREE.SphereGeometry(0.009, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x31f5ff, depthTest: false, transparent: true }),
      );
      cursor.renderOrder = 100;
      cursor.visible = false;
      this.app.cena.add(cursor);

      // Modelo simples do controle (sem baixar nada da internet).
      const modelo = new THREE.Group();
      const cabo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.022, 0.11, 12),
        new THREE.MeshBasicMaterial({ color: 0x42433a }),
      );
      cabo.rotation.x = Math.PI / 2.6;
      cabo.position.set(0, -0.01, 0.03);
      const anel = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 24), new THREE.MeshBasicMaterial({ color: 0x74d0d8 }));
      anel.rotation.x = Math.PI / 2.4;
      anel.position.set(0, 0.025, -0.02);
      modelo.add(cabo, anel);
      modelo.visible = false;
      pegada.add(modelo);

      const entrada = {
        i,
        controle,
        pegada,
        mao,
        modelo,
        raio,
        cursor,
        fonte: null,
        lado: 'nenhum',
        ehMao: false,
        conectado: false,
        selecionando: false,
        hoverPainel: null,
        hoverPx: null,
        hoverInterativo: null,
        ultimoAcerto: null,
        arrasteSlider: null,
        arrastePainel: null,
        arrasteInterativo: null,
        poke: new Map(),
        juntasCriadas: false,
        esferasJuntas: [],
        botoesAntes: [],
      };
      controle.addEventListener('connected', (e) => {
        entrada.fonte = e.data;
        entrada.lado = e.data.handedness;
        entrada.ehMao = !!e.data.hand;
        entrada.conectado = true;
        raio.visible = true;
        modelo.visible = !entrada.ehMao;
      });
      controle.addEventListener('disconnected', () => {
        entrada.conectado = false;
        entrada.fonte = null;
        raio.visible = false;
        cursor.visible = false;
        modelo.visible = false;
        this.limparHover(entrada);
      });
      controle.addEventListener('selectstart', () => this.iniciarSelecao(entrada));
      controle.addEventListener('selectend', () => this.terminarSelecao(entrada));
      this.entradas.push(entrada);
    }
  }

  limparHover(entrada) {
    if (entrada.hoverPainel) {
      entrada.hoverPainel.passar(null, null);
      entrada.hoverPainel = null;
    }
    if (entrada.hoverInterativo) {
      const it = entrada.hoverInterativo.userData.interativo;
      if (it && it.aoPassar) it.aoPassar(false);
      entrada.hoverInterativo = null;
    }
  }

  raioDaEntrada(entrada) {
    const c = entrada.controle;
    c.updateMatrixWorld();
    tmpMat.identity().extractRotation(c.matrixWorld);
    const origem = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).applyMatrix4(tmpMat).normalize();
    return { origem, dir };
  }

  acertoEm(origem, dir, alvos) {
    this.raycaster.set(origem, dir);
    const hits = this.raycaster.intersectObjects(alvos, false);
    return hits.length ? hits[0] : null;
  }

  iniciarSelecao(entrada) {
    entrada.selecionando = true;
    const hit = entrada.ultimoAcerto;
    // Um módulo pode usar a pinça/gatilho para outra coisa (por exemplo, marcar o tempo no teste de ritmo).
    const noPainel = hit && hit.object.userData.painel;
    const mod = this.app.moduloAtivo;
    if (!noPainel && mod && mod.aoSelecionar && mod.aoSelecionar(entrada)) return;
    if (!hit) return;
    const painel = hit.object.userData.painel;
    if (painel) {
      const px = painel.uvParaPx(hit.uv);
      const el = painel.pressionar(px.x, px.y);
      if (!el) return;
      if (el.tipo === 'alca') {
        const { origem } = this.raioDaEntrada(entrada);
        entrada.arrastePainel = { painel, distancia: Math.max(0.25, origem.distanceTo(hit.point)) };
      } else if (el.tipo === 'slider') {
        entrada.arrasteSlider = painel;
      } else {
        this.pulsar(entrada, 0.35, 25);
        if (this.aoTocarBotao) this.aoTocarBotao();
      }
      return;
    }
    const it = hit.object.userData.interativo;
    if (it) {
      if (it.aoPressionar) it.aoPressionar(hit, entrada);
      entrada.arrasteInterativo = hit.object;
      this.pulsar(entrada, 0.3, 20);
    }
  }

  terminarSelecao(entrada) {
    entrada.selecionando = false;
    if (entrada.arrasteSlider) entrada.arrasteSlider.soltar();
    if (entrada.arrastePainel) entrada.arrastePainel.painel.soltar();
    if (entrada.arrasteInterativo) {
      const it = entrada.arrasteInterativo.userData.interativo;
      if (it && it.aoSoltar) it.aoSoltar(entrada);
    }
    entrada.arrasteSlider = null;
    entrada.arrastePainel = null;
    entrada.arrasteInterativo = null;
  }

  pulsar(entrada, forca = 0.5, ms = 40) {
    const fonte = entrada && entrada.fonte;
    if (!fonte || !fonte.gamepad || !this.app.estado.haptica) return false;
    const atuadores = fonte.gamepad.hapticActuators;
    if (atuadores && atuadores.length && atuadores[0].pulse) {
      try {
        atuadores[0].pulse(Math.max(0, Math.min(1, forca)), ms);
        return true;
      } catch {
        return false;
      }
    }
    const vib = fonte.gamepad.vibrationActuator;
    if (vib && vib.playEffect) {
      vib.playEffect('dual-rumble', { duration: ms, strongMagnitude: forca, weakMagnitude: forca }).catch(() => {});
      return true;
    }
    return false;
  }

  // Pulso nos controles de um lado ("left"/"right") ou nos dois ("ambos").
  pulsarLado(lado, forca, ms) {
    let algum = false;
    for (const e of this.entradas) {
      if (!e.conectado || e.ehMao) continue;
      if (lado === 'ambos' || e.lado === lado) algum = this.pulsar(e, forca, ms) || algum;
    }
    return algum;
  }

  temControles() {
    return this.entradas.some((e) => e.conectado && !e.ehMao);
  }

  temMaos() {
    return this.entradas.some((e) => e.conectado && e.ehMao);
  }

  atualizarXR(cabeca) {
    const alvos = this.alvosVisiveis();
    for (const entrada of this.entradas) {
      if (!entrada.conectado) continue;
      if (entrada.ehMao) this.atualizarJuntas(entrada);
      const { origem, dir } = this.raioDaEntrada(entrada);

      // Arrastar a placa pela alça.
      if (entrada.arrastePainel) {
        const p = entrada.arrastePainel.painel;
        const alvo = origem.clone().addScaledVector(dir, entrada.arrastePainel.distancia);
        p.grupo.position.copy(alvo);
        if (cabeca) {
          tmpVec.copy(cabeca);
          tmpVec.y = Math.min(tmpVec.y, alvo.y + 0.6);
          p.grupo.lookAt(tmpVec);
        }
        entrada.raio.scale.z = entrada.arrastePainel.distancia;
        entrada.cursor.visible = false;
        continue;
      }

      const hit = this.acertoEm(origem, dir, alvos);
      entrada.ultimoAcerto = hit;
      if (entrada.arrasteSlider) {
        const plano = this.acertoEm(origem, dir, [entrada.arrasteSlider.malha]);
        if (plano) {
          const px = entrada.arrasteSlider.uvParaPx(plano.uv);
          entrada.arrasteSlider.arrastar(px.x, px.y);
        }
      }
      if (entrada.arrasteInterativo) {
        const it = entrada.arrasteInterativo.userData.interativo;
        if (it && it.aoArrastar) it.aoArrastar(origem, dir, entrada);
      }

      // Hover
      const painel = hit && hit.object.userData.painel;
      if (entrada.hoverPainel && entrada.hoverPainel !== painel) {
        entrada.hoverPainel.passar(null, null);
        entrada.hoverPainel = null;
      }
      const inter = hit && !painel ? hit.object : null;
      if (entrada.hoverInterativo && entrada.hoverInterativo !== inter) {
        const it = entrada.hoverInterativo.userData.interativo;
        if (it && it.aoPassar) it.aoPassar(false);
        entrada.hoverInterativo = null;
      }
      if (painel) {
        const px = painel.uvParaPx(hit.uv);
        painel.passar(px.x, px.y);
        entrada.hoverPainel = painel;
      } else if (inter && inter.userData.interativo) {
        if (entrada.hoverInterativo !== inter) {
          const it = inter.userData.interativo;
          if (it.aoPassar) it.aoPassar(true, hit);
          entrada.hoverInterativo = inter;
        }
      }
      // Desenho do raio
      const comprimento = hit ? hit.distance : entrada.ehMao ? 0.6 : 2.5;
      entrada.raio.scale.z = comprimento;
      entrada.raio.material.opacity = entrada.ehMao ? 0.45 : 0.85;
      if (hit) {
        entrada.cursor.position.copy(hit.point);
        entrada.cursor.visible = true;
      } else {
        entrada.cursor.visible = false;
      }
      if (!entrada.ehMao) this.lerBotoes(entrada);
    }
    this.atualizarToques();
  }

  // Botões B/Y trazem o menu para a frente.
  lerBotoes(entrada) {
    const gp = entrada.fonte && entrada.fonte.gamepad;
    if (!gp) return;
    const botoes = gp.buttons.map((b) => b.pressed);
    const antes = entrada.botoesAntes;
    for (const idx of [4, 5]) {
      if (botoes[idx] && !antes[idx] && this.app.trazerPainel) this.app.trazerPainel();
    }
    entrada.botoesAntes = botoes;
  }

  // Esferas nas juntas das mãos (vistas na cena e copiadas no espelho).
  atualizarJuntas(entrada) {
    const juntas = entrada.mao.joints;
    if (!juntas || !juntas['wrist']) return;
    if (!entrada.juntasCriadas) {
      entrada.juntasCriadas = true;
      const matPele = new THREE.MeshBasicMaterial({ color: 0xebf5b8 });
      const matPonta = new THREE.MeshBasicMaterial({ color: 0x74d0d8 });
      for (const nome of Object.keys(juntas)) {
        const ponta = nome.endsWith('-tip');
        const esfera = new THREE.Mesh(new THREE.SphereGeometry(ponta ? 0.0085 : 0.0075, 10, 8), ponta ? matPonta : matPele);
        esfera.userData.juntaNome = nome;
        juntas[nome].add(esfera);
        entrada.esferasJuntas.push(esfera);
      }
      entrada.matPele = matPele;
      entrada.matPonta = matPonta;
    }
  }

  pontaIndicador(entrada) {
    const j = entrada.mao && entrada.mao.joints && entrada.mao.joints['index-finger-tip'];
    if (!j || !j.visible) return null;
    j.updateMatrixWorld();
    return new THREE.Vector3().setFromMatrixPosition(j.matrixWorld);
  }

  // Toque direto com a ponta do indicador nas placas.
  atualizarToques() {
    for (const entrada of this.entradas) {
      if (!entrada.conectado || !entrada.ehMao) continue;
      const ponta = this.pontaIndicador(entrada);
      if (!ponta) continue;
      for (const p of this.paineis) {
        if (!p.visivel || !p.grupo.visible) continue;
        const local = p.malha.worldToLocal(tmpVec2.copy(ponta));
        const dentro = Math.abs(local.x) <= p.larguraM / 2 + 0.01 && Math.abs(local.y) <= p.alturaM / 2 + 0.01;
        let est = entrada.poke.get(p);
        if (!est) {
          est = { zAnt: 1, pressionado: false };
          entrada.poke.set(p, est);
        }
        const z = local.z;
        const px = p.pontoLocalParaPx(local);
        if (dentro && z < 0.08 && z > -0.05) p.passar(px.x, px.y);
        if (!est.pressionado && dentro && z < DIST_TOQUE && est.zAnt >= DIST_TOQUE && z > -0.05) {
          const el = p.pressionar(px.x, px.y);
          est.pressionado = true;
          est.elemento = el;
          if (el && el.tipo === 'botao' && this.aoTocarBotao) this.aoTocarBotao();
        } else if (est.pressionado) {
          if (z > DIST_SOLTA || !dentro) {
            est.pressionado = false;
            p.soltar();
          } else if (est.elemento && (est.elemento.tipo === 'slider' || est.elemento.tipo === 'alca')) {
            if (est.elemento.tipo === 'alca') {
              // Arrasta a placa junto com o dedo.
              const mundo = ponta.clone();
              p.grupo.position.add(mundo.sub(p.malha.localToWorld(new THREE.Vector3(local.x, local.y, 0))));
            } else {
              p.arrastar(px.x, px.y);
            }
          }
        }
        est.zAnt = z;
      }
      // Toque em objetos interativos (por exemplo, o vidro do espelho).
      for (const o of this.interativos) {
        const it = o.userData.interativo;
        if (!it || !it.toque || !o.visible) continue;
        const local = o.worldToLocal(tmpVec2.copy(ponta));
        let est = entrada.poke.get(o);
        if (!est) {
          est = { zAnt: 1, pressionado: false };
          entrada.poke.set(o, est);
        }
        const dentro = Math.abs(local.x) <= it.toque.largura / 2 && Math.abs(local.y) <= it.toque.altura / 2;
        if (!est.pressionado && dentro && local.z < 0.02 && est.zAnt >= 0.02 && local.z > -0.08) {
          est.pressionado = true;
          if (it.aoPressionar) it.aoPressionar({ point: ponta.clone(), object: o }, entrada);
        } else if (est.pressionado && (local.z > 0.05 || !dentro)) {
          est.pressionado = false;
          if (it.aoSoltar) it.aoSoltar(entrada);
        }
        est.zAnt = local.z;
      }
    }
  }

  // ------------------------------------------------------------------
  // Mouse (modo PC)
  // ------------------------------------------------------------------
  configurarMouse(canvas, camera) {
    this.cameraMouse = camera;
    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    };
    canvas.addEventListener('pointermove', (ev) => {
      pos(ev);
      this.mouse.dentro = true;
      if (this.mouse.arrasteCamera) {
        const dx = ev.clientX - this.mouse.ultimoX;
        const dy = ev.clientY - this.mouse.ultimoY;
        this.mouse.ultimoX = ev.clientX;
        this.mouse.ultimoY = ev.clientY;
        if (this.app.girarCameraPC) this.app.girarCameraPC(dx, dy);
      }
    });
    canvas.addEventListener('pointerleave', () => {
      this.mouse.dentro = false;
    });
    canvas.addEventListener('pointerdown', (ev) => {
      pos(ev);
      canvas.setPointerCapture(ev.pointerId);
      this.mouse.pressionado = true;
      const hit = this.acertoMouse();
      if (hit && hit.object.userData.painel) {
        const p = hit.object.userData.painel;
        const px = p.uvParaPx(hit.uv);
        const el = p.pressionar(px.x, px.y);
        this.mouse.painel = el && (el.tipo === 'slider' || el.tipo === 'alca') ? p : null;
        if (el && el.tipo === 'botao' && this.aoTocarBotao) this.aoTocarBotao();
        if (el && el.tipo === 'alca') this.mouse.arrastePainel = { painel: p, distancia: hit.distance };
        return;
      }
      if (hit && hit.object.userData.interativo) {
        const it = hit.object.userData.interativo;
        if (it.aoPressionar) it.aoPressionar(hit, null);
        this.mouse.alvo = hit.object;
        return;
      }
      const mod = this.app.moduloAtivo;
      if (mod && mod.aoSelecionar && mod.aoSelecionar(null)) return;
      this.mouse.arrasteCamera = true;
      this.mouse.ultimoX = ev.clientX;
      this.mouse.ultimoY = ev.clientY;
    });
    canvas.addEventListener('pointerup', (ev) => {
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {
        /* nada */
      }
      this.mouse.pressionado = false;
      this.mouse.arrasteCamera = false;
      if (this.mouse.painel) this.mouse.painel.soltar();
      this.mouse.painel = null;
      this.mouse.arrastePainel = null;
      if (this.mouse.alvo) {
        const it = this.mouse.alvo.userData.interativo;
        if (it && it.aoSoltar) it.aoSoltar(null);
        this.mouse.alvo = null;
      }
    });
  }

  acertoMouse() {
    if (!this.cameraMouse) return null;
    this.raycaster.setFromCamera(this.mouse.ndc, this.cameraMouse);
    const hits = this.raycaster.intersectObjects(this.alvosVisiveis(), false);
    return hits.length ? hits[0] : null;
  }

  atualizarMouse() {
    if (!this.cameraMouse || !this.mouse.dentro) return;
    this.raycaster.setFromCamera(this.mouse.ndc, this.cameraMouse);
    const origem = this.raycaster.ray.origin.clone();
    const dir = this.raycaster.ray.direction.clone();
    if (this.mouse.arrastePainel) {
      const p = this.mouse.arrastePainel.painel;
      p.grupo.position.copy(origem).addScaledVector(dir, this.mouse.arrastePainel.distancia);
      p.grupo.lookAt(origem);
      return;
    }
    if (this.mouse.painel && this.mouse.pressionado) {
      const plano = this.raycaster.intersectObject(this.mouse.painel.malha, false)[0];
      if (plano) {
        const px = this.mouse.painel.uvParaPx(plano.uv);
        this.mouse.painel.arrastar(px.x, px.y);
      }
    }
    if (this.mouse.alvo) {
      const it = this.mouse.alvo.userData.interativo;
      if (it && it.aoArrastar) it.aoArrastar(origem, dir, null);
    }
    const hits = this.raycaster.intersectObjects(this.alvosVisiveis(), false);
    const hit = hits.length ? hits[0] : null;
    const painel = hit && hit.object.userData.painel;
    for (const p of this.paineis) if (p !== painel && p.hoverId) p.passar(null, null);
    if (painel) {
      const px = painel.uvParaPx(hit.uv);
      painel.passar(px.x, px.y);
    }
    const inter = hit && !painel ? hit.object : null;
    if (this.mouse.hoverInterativo && this.mouse.hoverInterativo !== inter) {
      const it = this.mouse.hoverInterativo.userData.interativo;
      if (it && it.aoPassar) it.aoPassar(false);
      this.mouse.hoverInterativo = null;
    }
    if (inter && inter.userData.interativo && this.mouse.hoverInterativo !== inter) {
      const it = inter.userData.interativo;
      if (it.aoPassar) it.aoPassar(true, hit);
      this.mouse.hoverInterativo = inter;
    }
  }
}
