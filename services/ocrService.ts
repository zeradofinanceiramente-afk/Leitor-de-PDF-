
import { createWorker, Worker } from 'tesseract.js';

let worker: Worker | null = null;
let workerLoadingPromise: Promise<Worker> | null = null;

export const getOcrWorker = async (): Promise<Worker> => {
  // Se já existe e está pronto, retorna
  if (worker) return worker;

  // Se já está carregando, retorna a promessa em andamento para evitar duplicidade
  if (workerLoadingPromise) return workerLoadingPromise;

  // Inicia o carregamento
  workerLoadingPromise = (async () => {
    try {
      // Cria um worker em português (por)
      // O logger é opcional, mas útil para debug global se necessário
      const w = await createWorker('por', 1, {
        // logger: m => console.log('[Tesseract Global]', m)
      });
      worker = w;
      return w;
    } catch (error) {
      workerLoadingPromise = null; // Reset em caso de erro para permitir nova tentativa
      throw error;
    }
  })();

  return workerLoadingPromise;
};

export const terminateOcrWorker = async () => {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerLoadingPromise = null;
  }
};
