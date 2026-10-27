// Gerado por ferramentas/gerar-sw.mjs. Não edite à mão.
const CACHE = 'vibracao-41a822eb84';
const ARQUIVOS = [
  "./",
  "./estilo/estilo.css",
  "./fontes/ArchivoExpanded-Variable.woff2",
  "./fontes/FrauncesSoft-Variable.woff2",
  "./fontes/Lexend-Variable.woff2",
  "./fontes/Outfit-Variable.woff2",
  "./imagens/icone-192.png",
  "./imagens/icone-512.png",
  "./imagens/logo-inclusivr-branco-ciano.png",
  "./imagens/selo-inclusivr-indigo.png",
  "./index.html",
  "./js/app.js",
  "./js/audio/biblioteca.js",
  "./js/audio/dsp-nucleo.js",
  "./js/audio/motor.js",
  "./js/audio/processador-medidor.js",
  "./js/audio/processador-simulador.js",
  "./js/audio/sons.js",
  "./js/cena/efeitos.js",
  "./js/cena/espelho.js",
  "./js/cena/pirikito.js",
  "./js/cena/sala.js",
  "./js/modulos/comum.js",
  "./js/modulos/graves.js",
  "./js/modulos/guia.js",
  "./js/modulos/inicio.js",
  "./js/modulos/localizacao.js",
  "./js/modulos/medidor.js",
  "./js/modulos/musica.js",
  "./js/modulos/palco.js",
  "./js/modulos/resultados.js",
  "./js/modulos/ritmo.js",
  "./js/modulos/sala-maga.js",
  "./js/modulos/simulador.js",
  "./js/modulos/tocador-musica.js",
  "./js/principal.js",
  "./js/ui/estilo-ui.js",
  "./js/ui/interacao.js",
  "./js/ui/painel.js",
  "./js/util/armazenamento.js",
  "./manifest.webmanifest",
  "./sons/voz-atras-de-voce.wav",
  "./sons/voz-estou-aqui.wav",
  "./sons/voz-ola.wav",
  "./sons/voz-um-dois-tres.wav",
  "./vendor/three/LICENSE",
  "./vendor/three/addons/loaders/GLTFLoader.js",
  "./vendor/three/addons/utils/BufferGeometryUtils.js",
  "./vendor/three/three.module.js"
];

self.addEventListener('install', (e) => {
  // cache: 'reload' busca a versão nova no servidor, sem passar pelo cache do navegador.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k.startsWith('vibracao-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Rede primeiro para tudo: com internet, sempre a versão mais nova (sem "versão antiga" depois de uma
// atualização); sem internet, o que ficou guardado na primeira visita.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r && r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return r;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))),
  );
});
