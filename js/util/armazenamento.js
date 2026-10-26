// Armazenamento local: preferências e resultados (localStorage) e arquivos de som (IndexedDB).
// Tudo dentro de try/catch: em janela privada ou com dados bloqueados, o app continua funcionando.

const PREFIXO = 'vibracao:';

export function lerPreferencia(chave, padrao) {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v === null ? padrao : JSON.parse(v);
  } catch {
    return padrao;
  }
}

export function salvarPreferencia(chave, valor) {
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

// --- IndexedDB (arquivos de som do usuário) ---
const NOME_BANCO = 'laboratorio-vibracao';
const LOJA = 'arquivos';
let bancoPromessa = null;

function abrirBanco() {
  if (bancoPromessa) return bancoPromessa;
  bancoPromessa = new Promise((resolver, rejeitar) => {
    try {
      const req = indexedDB.open(NOME_BANCO, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' });
      };
      req.onsuccess = () => resolver(req.result);
      req.onerror = () => rejeitar(req.error);
    } catch (e) {
      rejeitar(e);
    }
  });
  return bancoPromessa;
}

function transacao(modo, fn) {
  return abrirBanco().then(
    (db) =>
      new Promise((resolver, rejeitar) => {
        const tx = db.transaction(LOJA, modo);
        const loja = tx.objectStore(LOJA);
        const req = fn(loja);
        tx.oncomplete = () => resolver(req ? req.result : undefined);
        tx.onerror = () => rejeitar(tx.error);
        tx.onabort = () => rejeitar(tx.error);
      }),
  );
}

export async function salvarArquivo(registro) {
  try {
    await transacao('readwrite', (loja) => loja.put(registro));
    return true;
  } catch {
    return false;
  }
}

export async function listarArquivos() {
  try {
    return (await transacao('readonly', (loja) => loja.getAll())) || [];
  } catch {
    return [];
  }
}

export async function apagarArquivo(id) {
  try {
    await transacao('readwrite', (loja) => loja.delete(id));
    return true;
  } catch {
    return false;
  }
}

// --- Resultados dos testes ---
export function lerResultados() {
  return lerPreferencia('resultados', []);
}

export function adicionarResultado(resultado) {
  const lista = lerResultados();
  lista.push({ ...resultado, quando: new Date().toISOString() });
  salvarPreferencia('resultados', lista);
  return lista;
}

export function apagarResultados() {
  salvarPreferencia('resultados', []);
}

// Baixa um arquivo de texto (fora do VR).
export function baixarTexto(nome, conteudo, tipo = 'application/json') {
  try {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export function resultadosParaCSV(lista) {
  const linhas = [['quando', 'modulo', 'resumo', 'dados'].join(';')];
  for (const r of lista) {
    const dados = JSON.stringify(r.dados || {}).replace(/;/g, ',');
    const resumo = String(r.resumo || '').replace(/;/g, ',');
    linhas.push([r.quando, r.modulo, resumo, dados].join(';'));
  }
  return '﻿' + linhas.join('\n');
}
