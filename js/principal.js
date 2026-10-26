// Página de entrada: liga a cena, os botões, a biblioteca de sons e os resultados.
import { App } from './app.js';
import { carregarFontes } from './ui/estilo-ui.js';
import { ModuloInicio } from './modulos/inicio.js';
import { ModuloSalaMaga } from './modulos/sala-maga.js';
import { ModuloPalco } from './modulos/palco.js';
import { ModuloLocalizacao } from './modulos/localizacao.js';
import { ModuloGraves } from './modulos/graves.js';
import { ModuloRitmo } from './modulos/ritmo.js';
import { ModuloSimulador } from './modulos/simulador.js';
import { ModuloMusica } from './modulos/musica.js';
import { ModuloMedidor } from './modulos/medidor.js';
import { ModuloResultados } from './modulos/resultados.js';
import { lerPreferencia, lerResultados, apagarResultados, baixarTexto, resultadosParaCSV } from './util/armazenamento.js';

export const VERSAO = '0.1.0';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);

async function instalarEmulador() {
  // Só para testes no PC: ?emular=1 (controles) ou ?emular=maos
  const modo = params.get('emular');
  if (!modo) return null;
  const { XRDevice, metaQuest3 } = await import('../vendor/iwer/iwer.module.js');
  const dispositivo = new XRDevice(metaQuest3);
  // O Chrome do PC já tem um WebXR "de verdade" (sem headset); forceInstall troca pelo emulado.
  dispositivo.installRuntime({ forceInstall: true });
  if (modo === 'maos') dispositivo.primaryInputMode = 'hand';
  window.__xrEmulado = dispositivo;
  return dispositivo;
}

function mostrarStatus(texto) {
  $('#status').textContent = texto;
}

async function iniciar() {
  $('#versao').textContent = VERSAO;
  await instalarEmulador();
  await carregarFontes();

  const app = new App({
    canvas: $('#tela'),
    aoMudarEstado: (m) => {
      if (m.resultados) desenharResultados();
      if (m.alerta) mostrarStatus(m.alerta);
      if (m.vr === false) mostrarStatus('Você saiu do VR.');
    },
  });
  window.__app = app;

  const modulos = [
    new ModuloInicio(),
    new ModuloSalaMaga(),
    new ModuloPalco(),
    new ModuloLocalizacao(),
    new ModuloGraves(),
    new ModuloRitmo(),
    new ModuloSimulador(),
    new ModuloMusica(),
    new ModuloMedidor(),
    new ModuloResultados(),
  ];
  for (const m of modulos) app.registrarModulo(m);
  app.ativarModulo(lerPreferencia('modulo', 'inicio'));
  if (!app.moduloAtivo) app.ativarModulo('inicio');

  // VR disponível?
  let vrOk = false;
  try {
    vrOk = !!(navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr')));
  } catch {
    vrOk = false;
  }
  const btnVR = $('#btn-vr');
  btnVR.disabled = !vrOk;
  $('#aviso-xr').textContent = vrOk
    ? 'Pronto para o VR. Use fone ou os alto-falantes do headset, com volume moderado.'
    : 'Este navegador não abre VR. No PC, use o modo PC com fone de ouvido. No headset, abra este endereço no navegador do Meta Quest.';

  btnVR.addEventListener('click', async () => {
    try {
      mostrarStatus('Ligando o áudio…');
      await app.iniciarAudio();
      mostrarStatus('Entrando no VR…');
      await app.entrarVR();
      mostrarStatus('Você está no VR.');
    } catch (e) {
      mostrarStatus(`Não foi possível entrar no VR: ${e.message || e}`);
    }
  });

  $('#btn-pc').addEventListener('click', async () => {
    $('#palco').hidden = false;
    app.redimensionar();
    try {
      await app.iniciarAudio();
      mostrarStatus('Áudio ligado. Use fone de ouvido para ouvir o som 3D.');
    } catch (e) {
      mostrarStatus(`Áudio: ${e.message || e}`);
    }
    app.trazerPainel();
  });
  $('#btn-voltar').addEventListener('click', () => {
    $('#palco').hidden = true;
  });

  // Biblioteca de sons do usuário
  app.biblioteca.aoMudar(desenharSons);
  await app.biblioteca.carregarSalvos();
  $('#arquivos-som').addEventListener('change', async (ev) => {
    const arquivos = ev.target.files;
    if (!arquivos || !arquivos.length) return;
    mostrarStatus('Lendo os arquivos…');
    try {
      await app.iniciarAudio();
      const novos = await app.biblioteca.adicionarArquivos(arquivos);
      mostrarStatus(`${novos.length} arquivo(s) carregado(s).`);
    } catch (e) {
      mostrarStatus(`Erro ao ler: ${e.message || e}`);
    }
    ev.target.value = '';
  });

  let previa = null;
  async function tocarPrevia(id) {
    await app.iniciarAudio();
    if (previa) {
      previa.destruir();
      const era = previa.idItem;
      previa = null;
      if (era === id) {
        desenharSons();
        return;
      }
    }
    const buffer = await app.biblioteca.obter(id);
    previa = app.motor.criarFonte({ buffer, espacial: false, barramento: 'interface', volume: 0.9 });
    previa.idItem = id;
    previa.aoTerminar = () => {
      previa = null;
      desenharSons();
    };
    previa.tocar();
    desenharSons();
  }

  function desenharSons() {
    const ul = $('#lista-sons');
    ul.innerHTML = '';
    const lista = app.biblioteca.usuario;
    if (!lista.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="texto-suave">Nenhum arquivo ainda. Os sons de exemplo já estão no laboratório.</span>';
      ul.appendChild(li);
      return;
    }
    for (const u of lista) {
      const li = document.createElement('li');
      const nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = u.nome;
      const det = document.createElement('span');
      det.className = 'detalhe';
      det.textContent = `${u.duracao ? u.duracao.toFixed(1) + ' s · ' : ''}${Math.round((u.tamanho || 0) / 1024)} KB`;
      nome.appendChild(det);
      const faixa = document.createElement('label');
      const cx = document.createElement('input');
      cx.type = 'checkbox';
      cx.checked = !!u.faixa;
      cx.addEventListener('change', () => app.biblioteca.alterar(u.id, { faixa: cx.checked }));
      faixa.append(cx, 'faixa');
      const tocar = document.createElement('button');
      tocar.className = 'botao secundario';
      tocar.textContent = previa && previa.idItem === u.id ? 'Parar' : 'Ouvir';
      tocar.addEventListener('click', () => tocarPrevia(u.id));
      const remover = document.createElement('button');
      remover.className = 'botao perigo';
      remover.textContent = 'Remover';
      remover.addEventListener('click', () => app.biblioteca.remover(u.id));
      li.append(nome, faixa, tocar, remover);
      ul.appendChild(li);
    }
  }
  desenharSons();

  // Sala de verdade (.glb)
  $('#arquivo-glb').addEventListener('change', async (ev) => {
    const arq = ev.target.files && ev.target.files[0];
    if (!arq) return;
    $('#status-glb').textContent = 'Abrindo a sala…';
    try {
      const r = await app.carregarSalaGLB(arq);
      $('#status-glb').textContent = `Sala carregada (${(arq.size / 1048576).toFixed(1)} MB). Âncoras: ${r.ancoras.length ? r.ancoras.join(', ') : 'nenhuma'}.`;
    } catch (e) {
      $('#status-glb').textContent = `Não abriu: ${e.message || e}`;
    }
    ev.target.value = '';
  });

  // Resultados
  function desenharResultados() {
    const corpo = $('#tabela-resultados tbody');
    corpo.innerHTML = '';
    const lista = lerResultados().slice().reverse();
    if (!lista.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 3;
      td.className = 'texto-suave';
      td.textContent = 'Nenhum teste salvo ainda.';
      tr.appendChild(td);
      corpo.appendChild(tr);
      return;
    }
    for (const r of lista) {
      const tr = document.createElement('tr');
      for (const v of [new Date(r.quando).toLocaleString('pt-BR'), r.modulo, r.resumo]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      corpo.appendChild(tr);
    }
  }
  desenharResultados();
  $('#btn-json').addEventListener('click', () => baixarTexto(`vibracao-resultados-${Date.now()}.json`, JSON.stringify(lerResultados(), null, 2)));
  $('#btn-csv').addEventListener('click', () => baixarTexto(`vibracao-resultados-${Date.now()}.csv`, resultadosParaCSV(lerResultados()), 'text/csv'));
  $('#btn-apagar').addEventListener('click', () => {
    if (confirm('Apagar todos os resultados salvos neste aparelho?')) {
      apagarResultados();
      desenharResultados();
    }
  });

  // Funciona sem internet depois da primeira visita (exceto em localhost, para não atrapalhar os testes).
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!local || params.has('sw')) && !params.has('emular')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar().catch((e) => {
  console.error(e);
  const s = document.querySelector('#status');
  if (s) s.textContent = `Erro ao iniciar: ${e.message || e}`;
});
