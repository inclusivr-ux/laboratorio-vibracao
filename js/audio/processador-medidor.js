// Medidor de loudness (LUFS) e pico, na thread de áudio. Envia leituras cerca de 10 vezes por segundo.
import { MedidorLoudness } from './dsp-nucleo.js';

class ProcessadorMedidor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.medidor = new MedidorLoudness(sampleRate, 2);
    this.picoJanela = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.tipo === 'zerar') this.medidor.zerar();
    };
  }

  process(inputs, outputs) {
    const entrada = inputs[0];
    if (entrada && entrada.length > 0) {
      const canais = entrada.length > 1 ? [entrada[0], entrada[1]] : [entrada[0], entrada[0]];
      const novoBloco = this.medidor.processar(canais);
      if (this.medidor.pico > this.picoJanela) this.picoJanela = this.medidor.pico;
      if (novoBloco) {
        const m = this.medidor;
        this.port.postMessage({
          tipo: 'leitura',
          momentaneo: m.momentaneo,
          curto: m.curto,
          integrado: m.integrado,
          pico: this.picoJanela,
          picoMax: m.picoMax,
        });
        this.picoJanela = 0;
      }
    }
    // Saída em silêncio: só existe para o navegador manter o nó ativo.
    const saida = outputs[0];
    if (saida) for (const canal of saida) canal.fill(0);
    return true;
  }
}

registerProcessor('medidor-lufs', ProcessadorMedidor);
