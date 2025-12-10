import { Annotation } from '../types';

/**
 * Pega um Blob de PDF e uma lista de anotações, e retorna um novo Blob.
 * Processamento movido para Web Worker para não travar a UI.
 */
export async function burnAnnotationsToPdf(originalBlob: Blob, annotations: Annotation[]): Promise<Blob> {
    const arrayBuffer = await originalBlob.arrayBuffer();
    
    return new Promise((resolve, reject) => {
        // Criação do Worker
        const worker = new Worker(new URL('../workers/pdfAnnotationWorker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (e) => {
            if (e.data.success) {
                const blob = new Blob([e.data.pdfBytes], { type: 'application/pdf' });
                worker.terminate();
                resolve(blob);
            } else {
                worker.terminate();
                reject(new Error(e.data.error || 'Erro desconhecido no worker'));
            }
        };

        worker.onerror = (e) => {
            worker.terminate();
            reject(new Error('Falha no worker de PDF: ' + e.message));
        };

        // Envia dados (usando Transferable para o buffer)
        worker.postMessage(
            { pdfBytes: arrayBuffer, annotations }, 
            [arrayBuffer]
        );
    });
}
