// Biblioteca de sons: os gerados por código, as vozes de teste e os arquivos do Luigi.
// Os arquivos do usuário ficam guardados no aparelho (IndexedDB) para não precisar carregar de novo.
import { CATALOGO, gerarSom, gerarMusica, MUSICA } from './sons.js';
import { salvarArquivo, listarArquivos, apagarArquivo } from '../util/armazenamento.js';

const CORES_USUARIO = ['#f4b224', '#74d0d8', '#f799d1', '#cfd736', '#ae7bff', '#15b0ff', '#63cbc9', '#f6c744'];

export class Biblioteca {
  constructor(motor) {
    this.motor = motor;
    this.cache = new Map();
    this.usuario = []; // { id, nome, tipo, faixa: bool, dados: ArrayBuffer }
    this.musicaGerada = null;
    this.ouvintes = new Set();
  }

  aoMudar(fn) {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  avisar() {
    for (const fn of this.ouvintes) {
      try {
        fn();
      } catch (e) {
        console.warn(e);
      }
    }
  }

  itens() {
    const gerados = CATALOGO.map((i) => ({
      id: i.id,
      nome: i.nome,
      legenda: i.legenda,
      categoria: i.categoria,
      loop: i.loop,
      cor: i.cor,
      origem: i.arquivo ? 'arquivo' : 'gerado',
    }));
    const doUsuario = this.usuario.map((u, idx) => ({
      id: u.id,
      nome: u.nome,
      legenda: u.nome.replace(/\.[a-z0-9]+$/i, ''),
      categoria: 'usuario',
      loop: !!u.loop,
      cor: CORES_USUARIO[idx % CORES_USUARIO.length],
      origem: 'usuario',
      faixa: !!u.faixa,
    }));
    return [...doUsuario, ...gerados];
  }

  item(id) {
    return this.itens().find((i) => i.id === id) || null;
  }

  async obter(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const ctx = this.motor.ctx;
    if (!ctx) throw new Error('Áudio ainda não iniciado');
    const doCatalogo = CATALOGO.find((i) => i.id === id);
    let buffer = null;
    if (doCatalogo && doCatalogo.gerar) {
      buffer = gerarSom(ctx, doCatalogo);
    } else if (doCatalogo && doCatalogo.arquivo) {
      const resp = await fetch(new URL(`../../${doCatalogo.arquivo}`, import.meta.url));
      buffer = await ctx.decodeAudioData(await resp.arrayBuffer());
    } else {
      const u = this.usuario.find((x) => x.id === id);
      if (!u) throw new Error(`Som não encontrado: ${id}`);
      buffer = await ctx.decodeAudioData(u.dados.slice(0));
    }
    this.cache.set(id, buffer);
    return buffer;
  }

  async carregarSalvos() {
    const salvos = await listarArquivos();
    salvos.sort((a, b) => (a.criado || 0) - (b.criado || 0));
    this.usuario = salvos;
    this.avisar();
  }

  async adicionarArquivos(lista) {
    const novos = [];
    for (const arq of Array.from(lista || [])) {
      const dados = await arq.arrayBuffer();
      const registro = {
        id: `usuario-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        nome: arq.name,
        tipo: arq.type,
        tamanho: arq.size,
        faixa: false,
        loop: false,
        criado: Date.now(),
        dados,
      };
      // Confere se o navegador consegue abrir o arquivo antes de guardar.
      if (this.motor.ctx) {
        try {
          const b = await this.motor.ctx.decodeAudioData(dados.slice(0));
          this.cache.set(registro.id, b);
          registro.duracao = b.duration;
        } catch {
          registro.erro = 'Formato não suportado';
          continue;
        }
      }
      await salvarArquivo(registro);
      this.usuario.push(registro);
      novos.push(registro);
    }
    this.avisar();
    return novos;
  }

  async alterar(id, mudancas) {
    const u = this.usuario.find((x) => x.id === id);
    if (!u) return;
    Object.assign(u, mudancas);
    await salvarArquivo(u);
    this.avisar();
  }

  async remover(id) {
    this.usuario = this.usuario.filter((x) => x.id !== id);
    this.cache.delete(id);
    await apagarArquivo(id);
    this.avisar();
  }

  // Faixas da música: as do usuário marcadas como "faixa", ou a música de exemplo.
  faixasDoUsuario() {
    return this.usuario.filter((u) => u.faixa).slice(0, 6);
  }

  async obterMusicaExemplo() {
    if (this.musicaGerada) return this.musicaGerada;
    const ctx = this.motor.ctx;
    const m = await gerarMusica(ctx.sampleRate);
    const buffers = m.faixas.map((dados) => {
      const b = ctx.createBuffer(1, dados.length, ctx.sampleRate);
      b.copyToChannel(dados, 0);
      return b;
    });
    this.musicaGerada = {
      faixas: MUSICA.faixas.map((f, i) => ({ ...f, buffer: buffers[i] })),
      duracao: m.duracao,
      batida: m.batida,
      batidas: m.batidas,
      bpm: MUSICA.bpm,
      origem: 'exemplo',
    };
    return this.musicaGerada;
  }

  async obterMusicaUsuario() {
    const faixas = this.faixasDoUsuario();
    if (!faixas.length) return null;
    const lista = [];
    for (let i = 0; i < faixas.length; i++) {
      const f = faixas[i];
      const buffer = await this.obter(f.id);
      lista.push({ id: f.id, nome: f.nome.replace(/\.[a-z0-9]+$/i, ''), pan: 0, ganho: 0.8, cor: CORES_USUARIO[i % CORES_USUARIO.length], buffer });
    }
    const duracao = Math.max(...lista.map((f) => f.buffer.duration));
    return { faixas: lista, duracao, batida: null, batidas: null, bpm: null, origem: 'usuario' };
  }
}
