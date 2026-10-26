// Resultados salvos neste aparelho. Para exportar, saia do VR e use os botões da página.
import { titulo, paragrafo } from './comum.js';
import { lerResultados, apagarResultados } from '../util/armazenamento.js';
import { COR, FONTE } from '../ui/estilo-ui.js';

export class ModuloResultados {
  constructor() {
    this.id = 'resultados';
    this.nome = 'Resultados';
    this.confirmar = false;
  }

  desenhar(p, a) {
    titulo(p, a, 'Resultados');
    const lista = lerResultados().slice().reverse();
    let y = a.y + 60;
    if (!lista.length) {
      paragrafo(p, a.x, y + 20, a.w, 'Nenhum teste salvo ainda. Os testes de localização, graves e ritmo salvam sozinhos ao terminar.', 22);
    }
    lista.slice(0, 7).forEach((r) => {
      p.retangulo(a.x, y, a.w, 56, 14, 'rgba(255,255,255,0.5)', 'rgba(66,67,58,0.3)', 2);
      const quando = new Date(r.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      p.texto(`${quando} · ${r.modulo}`, a.x + 16, y + 22, { fonte: FONTE.forte(17), cor: COR.carvao, maxLargura: a.w - 32 });
      p.texto(r.resumo, a.x + 16, y + 46, { fonte: FONTE.texto(17), cor: COR.tinta, maxLargura: a.w - 32 });
      y += 62;
    });
    const yb = a.y + a.h - 64;
    p.botao('res-apagar', a.x, yb, 300, 58, this.confirmar ? 'Toque de novo para apagar' : 'Apagar resultados', () => {
      if (this.confirmar) {
        apagarResultados();
        this.confirmar = false;
        this.app.alerta('Resultados apagados.');
      } else {
        this.confirmar = true;
        setTimeout(() => {
          this.confirmar = false;
          p.marcarSujo();
        }, 3000);
      }
      p.marcarSujo();
    }, { variante: 'perigo', tamanho: 19 });
    paragrafo(p, a.x + 320, yb + 24, a.w - 320, 'Para baixar em planilha, saia do VR e use a página.', 18);
  }
}
