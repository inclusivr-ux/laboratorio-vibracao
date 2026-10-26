// Gera o sw.js (funcionar sem internet) com a lista de arquivos do laboratório.
// Rodar depois de mudar arquivos: node ferramentas/gerar-sw.mjs
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const ignorar = ['node_modules', 'ferramentas', 'testes', 'vendor' + sep + 'iwer', 'fontes' + sep + 'licencas', 'sw.js', 'package.json', 'package-lock.json', 'README.md'];

async function listar(pasta) {
  const saida = [];
  for (const nome of await readdir(pasta)) {
    if (nome.startsWith('.')) continue; // .git, .gitignore, .nojekyll
    const caminho = join(pasta, nome);
    const rel = relative(raiz, caminho);
    if (ignorar.some((i) => rel === i || rel.startsWith(i + sep))) continue;
    const s = await stat(caminho);
    if (s.isDirectory()) saida.push(...(await listar(caminho)));
    else saida.push(rel.split(sep).join('/'));
  }
  return saida;
}

const arquivos = (await listar(raiz)).sort();
const hash = createHash('sha256');
for (const a of arquivos) hash.update(a).update(await readFile(join(raiz, a)));
const versao = hash.digest('hex').slice(0, 10);

const sw = `// Gerado por ferramentas/gerar-sw.mjs. Não edite à mão.
const CACHE = 'vibracao-${versao}';
const ARQUIVOS = ${JSON.stringify(['./', ...arquivos.map((a) => './' + a)], null, 2)};

self.addEventListener('install', (e) => {
  // cache: 'reload' busca a versão nova no servidor, sem passar pelo cache do navegador.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((k) => k.startsWith('vibracao-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Página: tenta a rede primeiro (para pegar atualizações). Resto: cache primeiro.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); return r; }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
`;
await writeFile(join(raiz, 'sw.js'), sw);
console.log(`sw.js gerado: ${arquivos.length} arquivos, versão ${versao}`);
