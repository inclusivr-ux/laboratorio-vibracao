// Cores e letras do design system InclusiVR (camada Signária para o VR).
export const COR = {
  pergaminho: '#ebf5b8',
  pagina: '#e6f0dc',
  ceu: '#c7edfb',
  tinta: '#231f20',
  carvao: '#444141',
  contorno: '#42433a',
  ambar: '#f4b224',
  ouro: '#f6c744',
  runaBrilho: '#74d0d8',
  runaAura: '#58c4c8',
  cianoSignaria: '#63cbc9',
  cianoClaro: '#a6e4e0',
  rosa: '#f799d1',
  noiteSignaria: '#223d3e',
  profundo: '#162a2c',
  acerto: '#42b23c',
  erro: '#d22027',
  roxo: '#ac2fed',
  roxoProfundo: '#5515a0',
  indigo: '#280eaa',
  noite: '#100448',
  ciano: '#15b0ff',
  aqua: '#31f5ff',
  lima: '#cfd736',
  lilas: '#cb94ff',
  lavanda: '#ae7bff',
  branco: '#ffffff',
};

export const FONTE = {
  titulo: (px) => `800 ${px}px "Fraunces Soft", Fraunces, Georgia, serif`,
  tituloLeve: (px) => `600 ${px}px "Fraunces Soft", Fraunces, Georgia, serif`,
  texto: (px) => `400 ${px}px Lexend, "Segoe UI", sans-serif`,
  forte: (px) => `700 ${px}px Lexend, "Segoe UI", sans-serif`,
  rotulo: (px) => `800 ${px}px Outfit, Lexend, sans-serif`,
};

export async function carregarFontes() {
  if (!document.fonts || !document.fonts.load) return;
  const pedidos = [
    FONTE.titulo(40),
    FONTE.tituloLeve(30),
    FONTE.texto(28),
    FONTE.forte(28),
    FONTE.rotulo(28),
  ].map((f) => document.fonts.load(f, 'AÇÃO áéíóúãõç 0123'));
  try {
    await Promise.all(pedidos);
  } catch {
    /* segue com as letras do sistema */
  }
}
