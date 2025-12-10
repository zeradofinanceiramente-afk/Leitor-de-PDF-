import React, { useState, useEffect, useRef } from 'react';
import { getOcrWorker } from '../services/ocrService';

interface UsePageOcrProps {
  pageNumber: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  rendered: boolean;
  hasText: boolean;
  isVisible: boolean;
  scale: number; // Dependency only to re-trigger if needed
}

export const usePageOcr = ({ pageNumber, canvasRef, rendered, hasText, isVisible, scale }: UsePageOcrProps) => {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [ocrData, setOcrData] = useState<any[]>([]); // Words

  // Ref para evitar execução duplicada em re-renders rápidos
  const processingRef = useRef(false);

  useEffect(() => {
    // Conditions to run: Rendered, Is Image (no text), Visible, Idle
    if (rendered && !hasText && isVisible && status === 'idle' && !processingRef.current) {
      const run = async () => {
        if (!canvasRef.current) return;
        
        processingRef.current = true;
        setStatus('loading');
        setProgress(0);
        
        try {
          const worker = await getOcrWorker();
          
          // O recognize aceita um callback de logger na versão 5 para progresso específico desta tarefa
          const { data } = await worker.recognize(canvasRef.current, {}, {
            blocks: true,
          });
          
          if (data && data.words && data.words.length > 0) {
            setOcrData(data.words);
            setStatus('done');
          } else {
            setStatus('done'); // Empty result
          }
        } catch (err) {
          console.error(`[OCR] Erro na pág ${pageNumber}:`, err);
          setStatus('failed');
        } finally {
          processingRef.current = false;
        }
      };

      // Pequeno delay para garantir que o canvas terminou de pintar visualmente e não bloquear scroll inicial
      const timer = setTimeout(run, 800);
      return () => {
        clearTimeout(timer);
        // Não podemos "cancelar" a promise do worker singleton facilmente, 
        // mas o flag processingRef ajuda a controlar o fluxo.
      };
    }
  }, [rendered, hasText, isVisible, status, pageNumber, scale]);

  return { status, progress, ocrData };
};