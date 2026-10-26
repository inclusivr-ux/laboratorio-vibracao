// Processador de áudio (roda na thread de áudio do navegador).
// Recebe o som estéreo já espacializado e aplica a simulação de cada orelha.
import { SimuladorAuditivo } from './dsp-nucleo.js';

class ProcessadorSimulador extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate é global dentro do AudioWorklet.
    this.sim = new SimuladorAuditivo({ taxa: sampleRate, tamanho: 1024, salto: 256 });
    this.vazioE = new Float32Array(128);
    this.vazioD = new Float32Array(128);
    this.port.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.tipo === 'config') {
        try {
          this.sim.configurar(msg.config || {});
          this.port.postMessage({ tipo: 'ok', latencia: this.sim.latenciaAmostras });
        } catch (erro) {
          this.port.postMessage({ tipo: 'erro', mensagem: String(erro && erro.message ? erro.message : erro) });
        }
      }
    };
  }

  process(inputs, outputs) {
    const saida = outputs[0];
    if (!saida || saida.length === 0) return true;
    const entrada = inputs[0];
    const n = saida[0].length;
    if (this.vazioE.length !== n) {
      this.vazioE = new Float32Array(n);
      this.vazioD = new Float32Array(n);
    }
    let entE = this.vazioE;
    let entD = this.vazioD;
    if (entrada && entrada.length > 0) {
      entE = entrada[0];
      entD = entrada.length > 1 ? entrada[1] : entrada[0];
    } else {
      this.vazioE.fill(0);
      this.vazioD.fill(0);
    }
    const saiE = saida[0];
    const saiD = saida.length > 1 ? saida[1] : this.vazioD;
    this.sim.processar(entE, entD, saiE, saiD);
    return true;
  }
}

registerProcessor('simulador-auditivo', ProcessadorSimulador);
