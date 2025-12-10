import { useState, useEffect, useRef } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { downloadDriveFile } from '../services/driveService';
import { getOfflineFile } from '../services/storageService';

// Configuração do Worker
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

// Conversão de DPI (72 -> 96 com ajuste visual)
const CSS_UNITS = (96.0 / 72.0) * 1.74;

interface UsePdfDocumentProps {
  fileId: string;
  fileBlob?: Blob;
  accessToken?: string | null;
  onAuthError?: () => void;
}

export const usePdfDocument = ({ fileId, fileBlob, accessToken, onAuthError }: UsePdfDocumentProps) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [pageDimensions, setPageDimensions] = useState<{ width: number, height: number } | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);

        let blob: Blob | undefined;

        // 1. Determinar Fonte do Arquivo
        if (fileBlob) {
          blob = fileBlob;
        } else if (originalBlob) {
          blob = originalBlob; // Cache local em memória
        } else {
          // Tentar carregar do IndexedDB primeiro se estiver offline ou como fallback
          const offlineBlob = await getOfflineFile(fileId);
          
          if (!navigator.onLine && offlineBlob) {
             blob = offlineBlob;
          } else if (accessToken) {
             try {
                blob = await downloadDriveFile(accessToken, fileId);
             } catch (downloadErr: any) {
                // Fallback para offline se download falhar (ex: sem internet momentânea)
                if (offlineBlob) {
                   console.warn("Download falhou, usando versão offline cacheada.");
                   blob = offlineBlob;
                } else {
                   throw downloadErr;
                }
             }
          } else if (offlineBlob) {
             // Caso sem token mas tem offline (ex: modo visitante com arquivo salvo localmente)
             blob = offlineBlob;
          }
        }

        if (!blob) {
          throw new Error("Fonte do arquivo não disponível");
        }

        if (mounted && !originalBlob) setOriginalBlob(blob);

        // 2. Carregar PDF.js
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/standard_fonts/'
        }).promise;

        if (mounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          
          // 3. Get First Page Dimensions for Layout & Auto-Fit
          try {
            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            const dimensions = { width: viewport.width, height: viewport.height };
            setPageDimensions(dimensions);

            // Auto-Fit Width Calculation (Initial)
            const containerWidth = window.innerWidth;
            const isMobile = containerWidth < 768;
            const padding = isMobile ? 10 : 60;
            
            const autoScale = (containerWidth - padding) / viewport.width;
            setScale(Math.min(autoScale, 1.5)); // Cap initial zoom
          } catch (e) {
            console.warn("Erro no auto-fit:", e);
          }
        }
      } catch (err: any) {
        console.error("Erro ao carregar PDF:", err);
        if (mounted) {
          if (err.message === "Unauthorized" || err.message.includes("401")) {
            if (onAuthError) onAuthError();
          } else {
            setError(err.message || "Falha ao abrir arquivo");
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Evita recarregar se já temos o doc pronto e o ID não mudou
    if (!pdfDoc || fileId) {
        loadPdf();
    }

    return () => { mounted = false; };
  }, [fileId, accessToken, fileBlob]);

  return { 
    pdfDoc, 
    originalBlob, 
    setOriginalBlob, // Exposto para updates de salvamento
    numPages, 
    loading, 
    error, 
    scale, 
    setScale,
    pageDimensions,
    cssUnits: CSS_UNITS
  };
};