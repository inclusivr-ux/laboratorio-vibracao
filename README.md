# Laboratório VibrAção

Laboratório de som do **SinalizaAção VR** (InclusiVR), para o sound designer testar músicas, efeitos, áudio 3D e acessibilidade direto no Meta Quest. Funciona no navegador do Quest (WebXR), sem instalar APK. "VibrAção" é nome provisório.

**Endereço:** https://inclusivr-ux.github.io/laboratorio-vibracao/

Documento de referência: "Som, surdez e música no SinalizaAção VR" (Claude Docs).

## O que tem

| Aba | Para quê |
| --- | --- |
| Início | Volume geral, som 3D (HRTF ou simples), reverberação da sala, recentrar a sala |
| Sala da Maga | A cena do "barbeiro virtual" com espelho, em 6 passos. Dá para experimentar sem som (só pistas) ou só com som |
| Palco 360° | Colocar qualquer som (de exemplo ou seu) em volta da cabeça, arrastar, fazer girar |
| Localização | Teste: o som toca de uma direção aleatória e a pessoa aponta. Mede o erro e as trocas frente-trás |
| Graves | Dá para ouvir ou sentir o grave nos alto-falantes? Tons e pulsos de 20 a 500 Hz e varreduras |
| Ritmo | Para a Resistência: acompanhar o tempo por som, flash, bola quicando ou mão-guia; mede o atraso |
| Simulador | Aproximação de perdas auditivas e de implante coclear, aplicada a todo o som (A/B instantâneo) |
| Música e luz | Faixas separadas, mix original/essencial/só ritmo, velas, ondas, mãos e vibração no tempo |
| Medidor | Loudness (LUFS momentâneo, curto e integrado) e pico, medidos no próprio aparelho |
| Resultados | Testes salvos no aparelho (exporte pela página, fora do VR) |

## Como usar no Quest

1. No navegador do Meta Quest, abra **inclusivr-ux.github.io/laboratorio-vibracao** e salve nos favoritos.
2. Na página, carregue seus arquivos de som (WAV, MP3, OGG). Eles ficam só no aparelho. Marque "faixa" nas partes de uma música.
3. Toque em **Entrar no VR**.
4. Mãos: toque com a ponta do dedo ou faça a pinça apontando. Controles: gatilho. O botão no pulso esquerdo (ou B/Y) traz o painel. A alça de baixo move o painel.
5. Teste nos alto-falantes do headset **e** com fone na saída P2 (Quest 2 e 3).

Para levar arquivos ao Quest: baixe pelo navegador do Quest (de um Drive, por exemplo) ou copie pelo cabo USB para a pasta Download.

Depois da primeira visita, a página abre também sem internet.

## Para a equipe técnica

- Página estática, sem etapa de build: three.js 0.170 em `vendor/`.
- `npm install` (só para os testes e o emulador), `npm run testar` (testes do processamento de áudio), `npm run servir` (servidor local em http://localhost:8642).
- Teste de VR no PC sem headset: `http://localhost:8642/?emular=1` (controles) ou `?emular=maos` (mãos), com o emulador oficial da Meta (IWER).
- Teste no Quest sem publicar: cabo USB e `adb reverse tcp:8642 tcp:8642`; no Quest, abra `http://localhost:8642`.
- Depois de mudar arquivos, gere de novo o cache offline: `node ferramentas/gerar-sw.mjs`.
- Áudio: Web Audio com PannerNode em HRTF. No jogo (Unity), o equivalente é o Meta XR Audio SDK; os resultados de localização aqui são indicativos.
- Sala de verdade: a página aceita o `cenario.glb` do Estúdio 3D (fica só no aparelho). As âncoras `Ancora_*` do arquivo são usadas para posicionar os sons.

### Publicação

- GitHub Pages do repositório `inclusivr-ux/laboratorio-vibracao`, ramo `main`, pasta raiz. Cada push no `main` publica em 1 a 2 minutos.
- Antes do push: `npm run testar` e `node ferramentas/gerar-sw.mjs`.
- O repositório e a página são públicos. **Nunca suba o `cenario.glb` da Sala da Maga nem outro material inédito.** A página pede aos buscadores para não indexá-la, mas quem tiver o link consegue abrir.

### Licenças

- three.js e IWER: licença MIT (`vendor/`).
- Fontes Lexend, Fraunces, Outfit e Archivo: SIL Open Font License 1.1 (`fontes/licencas/`).

## Avisos

- O simulador de audição é uma aproximação didática para conferir a mixagem. Não mostra como uma pessoa surda ouve.
- Os testes não são exames. Para isso, procure uma fonoaudióloga.
- Comece sempre com volume baixo.
