// Início: como usar e ajustes gerais.
import { titulo, paragrafo, grupoBotoes, subtitulo } from './comum.js';
import { SALAS } from '../audio/motor.js';

export class ModuloInicio {
  constructor() {
    this.id = 'inicio';
    this.nome = 'Início';
  }

  desenhar(p, a) {
    const app = this.app;
    let y = titulo(p, a, 'Laboratório de som do SinalizaAção VR');
    y += 16;
    y += paragrafo(
      p,
      a.x,
      y + 12,
      a.w,
      'Toque nos botões com a ponta do dedo, faça a pinça apontando, ou use o gatilho. ' +
        'O botão no pulso esquerdo (ou B/Y no controle) traz este painel para a sua frente. Arraste a alça de baixo para mover.',
    );
    y += 22;
    p.botao('ini-recentrar', a.x, y, 250, 64, 'Recentrar sala', () => app.recentrar(), { variante: 'primario', tamanho: 23 });
    p.botao('ini-audio', a.x + 266, y, 250, 64, app.motor.pronto ? 'Áudio ligado' : 'Ligar áudio', () => app.iniciarAudio(), {
      variante: app.motor.pronto ? 'ativo' : 'secundario',
      tamanho: 23,
    });
    p.botao('ini-zerar', a.x + 532, y, 230, 64, 'Parar sons', () => app.removerTodasFontes(), { tamanho: 23 });
    y += 92;
    p.slider('ini-volume', a.x, y, a.w, 76, 'Volume geral do laboratório', app.motor.volumeGeral * 100, 0, 100, (v) => {
      app.motor.definirVolumeGeral(v / 100);
      p.marcarSujo();
    }, { formatar: (v) => `${Math.round(v)}%` });
    y += 108;
    subtitulo(p, a.x, y, 'Som 3D');
    grupoBotoes(p, 'ini-hrtf', a.x + 180, y - 32, 380, 50, [[true, 'HRTF (3D)'], [false, 'Simples']], app.estado.hrtf, (v) => app.definirEstado('hrtf', v));
    y += 50;
    subtitulo(p, a.x, y, 'Reverberação da sala');
    y += 14;
    const salas = Object.entries(SALAS).map(([id, s]) => [id, s.nome]);
    grupoBotoes(p, 'ini-sala', a.x, y, a.w, 50, salas, app.motor.salaAtual, (id) => {
      app.motor.definirSala(id);
      p.marcarSujo();
    }, { tamanho: 18, espaco: 8 });
    y += 66;
    paragrafo(
      p,
      a.x,
      y + 8,
      a.w,
      'Tudo aqui é para teste: o simulador de audição é uma aproximação didática e os "testes" não são exames. ' +
        'Volume moderado, sempre.',
      20,
    );
  }
}
