// Servidor local simples para testar o laboratório no PC: node ferramentas/servidor.mjs [porta]
// No Quest, o WebXR exige HTTPS (ou localhost via cabo com "adb reverse").
import http from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const porta = Number(process.argv[2] || process.env.PORT || 8642);
const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
  '.md': 'text/markdown; charset=utf-8',
};

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      // Só para testes locais: salva uma captura da tela (dataURL JPEG/PNG) em ferramentas/capturas/.
      if (req.method === 'POST' && url.pathname === '/__captura') {
        const nome = (url.searchParams.get('nome') || 'captura').replace(/[^a-z0-9_-]/gi, '');
        let corpo = '';
        for await (const parte of req) corpo += parte;
        const [, tipo, base64] = corpo.match(/^data:image\/(png|jpeg);base64,(.*)$/) || [];
        if (!base64) {
          res.writeHead(400).end('Formato inválido');
          return;
        }
        const pasta = join(raiz, 'ferramentas', 'capturas');
        await mkdir(pasta, { recursive: true });
        const destino = join(pasta, `${nome}.${tipo === 'png' ? 'png' : 'jpg'}`);
        await writeFile(destino, Buffer.from(base64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end(destino);
        return;
      }
      const caminho = decodeURIComponent(url.pathname);
      let arquivo = normalize(join(raiz, caminho));
      if (!arquivo.startsWith(raiz) || arquivo.includes('node_modules')) {
        res.writeHead(403).end('Proibido');
        return;
      }
      const s = await stat(arquivo).catch(() => null);
      if (s && s.isDirectory()) arquivo = join(arquivo, 'index.html');
      const dados = await readFile(arquivo);
      res.writeHead(200, {
        'Content-Type': tipos[extname(arquivo).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(dados);
    } catch {
      res.writeHead(404).end('Não encontrado');
    }
  })
  .listen(porta, () => console.log(`Laboratório VibrAção em http://localhost:${porta}`));
