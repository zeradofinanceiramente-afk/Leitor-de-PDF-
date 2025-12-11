
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { Loader2, ArrowLeft, Menu, Save, Copy, Lock, AlertTriangle, X, Download, CloudOff } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { PDFDocumentProxy } from 'pdfjs-dist';

// Hooks & Context
import { usePdfDocument } from '../hooks/usePdfDocument';
import { usePdfAnnotations } from '../hooks/usePdfAnnotations';
import { usePdfSelection } from '../hooks/usePdfSelection';
import { PdfProvider, usePdfContext } from '../context/PdfContext';

// Components
import { PdfPage } from './pdf/PdfPage';
import { PdfToolbar } from './pdf/PdfToolbar';
import { PdfSidebar, SidebarTab } from './pdf/PdfSidebar';
import { SelectionMenu } from './pdf/SelectionMenu';

// Services
import { burnAnnotationsToPdf } from '../services/pdfModifierService';
import { updateDriveFile, uploadFileToDrive } from '../services/driveService';
import { fetchDefinition } from '../services/dictionaryService';
import { saveOfflineFile, isFileOffline, addToSyncQueue } from '../services/storageService';
import { Annotation } from '../types';

interface Props {
  accessToken?: string | null;
  fileId: string;
  fileName: string;
  fileParents?: string[];
  uid: string;
  onBack: () => void;
  fileBlob?: Blob;
  isPopup?: boolean;
  onToggleNavigation?: () => void;
  onAuthError?: () => void;
}

interface PdfViewerContentProps extends Props {
  originalBlob: Blob | null;
  setOriginalBlob: (b: Blob) => void;
  pdfDoc: PDFDocumentProxy | null;
  pageDimensions: { width: number, height: number } | null;
  jumpToPageRef: React.MutableRefObject<((page: number) => void) | null>;
}

// Inner Component to consume Context
const PdfViewerContent: React.FC<PdfViewerContentProps> = ({ 
  accessToken, fileId, fileName, fileParents, onBack, originalBlob, setOriginalBlob, pdfDoc, pageDimensions, jumpToPageRef 
}) => {
  const { 
    scale, setScale, activeTool, settings, 
    annotations, addAnnotation, removeAnnotation,
    currentPage, setCurrentPage, numPages
  } = usePdfContext();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<FixedSizeList>(null);

  // Bind jumpToPage logic for Provider
  useEffect(() => {
    jumpToPageRef.current = (page: number) => {
        if (listRef.current) {
            listRef.current.scrollToItem(page - 1, 'start');
        }
    };
  }, [jumpToPageRef]);

  // --- Interaction State ---
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('annotations');
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // --- Selection Logic Hook ---
  const { selection, setSelection } = usePdfSelection({
    activeTool, scale, containerRef
  });

  // --- Auxiliary States (UI/Modals) ---
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  
  // --- Offline State (Only for save queue check, visual removed from header) ---
  const [isOfflineAvailable, setIsOfflineAvailable] = useState(false);

  // --- AI & Dictionary State ---
  const [aiExplanation, setAiExplanation] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showDefinitionModal, setShowDefinitionModal] = useState(false);
  const [definition, setDefinition] = useState<any>(null);
  
  // --- Pinch to Zoom State ---
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);

  useEffect(() => {
    isFileOffline(fileId).then(setIsOfflineAvailable);
  }, [fileId]);

  // --- Handlers ---
  const createHighlight = () => {
    if (!selection) return;
    selection.relativeRects.forEach(rect => {
      addAnnotation({
        id: `hl-${Date.now()}-${Math.random()}`,
        page: selection.page,
        bbox: [rect.x, rect.y, rect.width, rect.height],
        type: 'highlight',
        text: selection.text,
        color: settings.highlightColor,
        opacity: settings.highlightOpacity
      });
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleDownload = async () => {
     if (!originalBlob) return;
     try {
         const newBlob = await burnAnnotationsToPdf(originalBlob, annotations);
         const url = URL.createObjectURL(newBlob);
         const a = document.createElement('a');
         a.href = url;
         a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         URL.revokeObjectURL(url);
         setShowSaveModal(false);
     } catch (e: any) {
         alert("Erro ao gerar download: " + e.message);
     }
  };

  const handleSave = async (mode: 'local' | 'overwrite' | 'copy') => {
    if (!originalBlob) return;
    
    // Download Option
    if (mode === 'local') {
        handleDownload();
        return;
    }

    setIsSaving(true);
    setShowSaveModal(false);
    setShowPermissionModal(false);

    try {
      const newBlob = await burnAnnotationsToPdf(originalBlob, annotations);
      const isLocal = fileId.startsWith('local-') || !accessToken;

      // Queue Logic for Offline Mode
      if (!isLocal && !navigator.onLine && accessToken) {
          // 1. Save locally to ensure user has access immediately
          const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
          await saveOfflineFile(fileMeta, newBlob);
          setIsOfflineAvailable(true);
          
          // 2. Add to Sync Queue
          await addToSyncQueue({
              fileId: mode === 'overwrite' ? fileId : `new-${Date.now()}`,
              action: mode === 'overwrite' ? 'update' : 'create',
              blob: newBlob,
              name: mode === 'overwrite' ? fileName : fileName.replace('.pdf', '') + ' (Anotado).pdf',
              parents: fileParents,
              mimeType: 'application/pdf'
          });
          
          alert("Sem internet. Arquivo atualizado offline e salvo na fila de sincronização.");
          setIsSaving(false);
          return;
      }

      // Online Mode
      if (accessToken && !isLocal) {
        if (mode === 'overwrite') {
           try {
              await updateDriveFile(accessToken, fileId, newBlob);
              setOriginalBlob(newBlob);
              
              // If previously marked offline, update the offline copy too
              if (isOfflineAvailable) {
                  const fileMeta = { id: fileId, name: fileName, mimeType: 'application/pdf', parents: fileParents };
                  await saveOfflineFile(fileMeta, newBlob);
                  alert("Arquivo atualizado no Drive e na cópia Offline!");
              } else {
                  alert("Arquivo atualizado com sucesso!");
              }
           } catch (e: any) {
              if (e.message.includes('403') || e.message.includes('permission')) {
                 setShowPermissionModal(true);
              } else {
                 throw e;
              }
           }
        } else {
           const name = fileName.replace('.pdf', '') + ' (Anotado).pdf';
           await uploadFileToDrive(accessToken, newBlob, name, fileParents);
           alert("Cópia salva com sucesso!");
        }
      }
    } catch (e: any) {
      console.error(e);
      alert("Erro ao salvar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Fit Width Logic
  const handleFitWidth = () => {
    if (!pageDimensions || !containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const isMobile = window.innerWidth < 768;
    const padding = isMobile ? 20 : 60;
    const newScale = (containerWidth - padding) / pageDimensions.width;
    setScale(newScale);
  };

  // AI & Definition Handlers
  const handleExplainAi = async () => {
    if (!selection) return;
    const text = selection.text;
    setSelection(null);
    setSidebarTab('ai');
    setShowSidebar(true);
    setIsAiLoading(true);
    setAiExplanation("");

    const prompt = `Você é meu assistente de leitura. Recebe um texto curto selecionado e deve explicar exatamente o que ele significa de forma clara, direta e contextualizada. Siga as regras:

1. Explique o trecho com precisão, sem enrolação.
2. Traduza ideias difíceis para linguagem simples, sem perder rigor.
3. Mostre rapidamente o contexto histórico, intelectual e temático do que está sendo dito.
4. Aponte qual abordagem teórica aparece no trecho (ex: marxista, estruturalista, culturalista, sociológica, antropológica etc.), mas só se realmente houver sinais claros.
5. Se o trecho citar autores, conceitos, eventos ou obras, explique cada um de forma curta e útil.
6. Se houver ambiguidade, diga as interpretações possíveis.
7. Sempre traga o essencial, nada de discursos longos — eu gosto de objetividade.
8. Envie o resultado em um único bloco de texto, sem listas, sem markdown, e sem formatação que quebre o meu frontend.

Entrada: "${text}"`;
    
    try {
        if (!process.env.API_KEY) throw new Error("Chave de API não configurada");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        setAiExplanation(res.text || "Sem resposta.");
    } catch (e: any) {
        setAiExplanation("Erro ao consultar IA: " + e.message);
    } finally {
        setIsAiLoading(false);
    }
  };

  const handleDefine = async () => {
    if (!selection) return;
    const word = selection.text;
    setSelection(null);
    setDefinition(null);
    setShowDefinitionModal(true);
    try {
        const def = await fetchDefinition(word);
        setDefinition(def || { word, meanings: ["Definição não encontrada"] });
    } catch (e) {
        setDefinition({ word, meanings: ["Erro ao buscar"] });
    }
  };

  // --- ANNOTATION DEDUPLICATION FOR SIDEBAR ---
  const sidebarAnnotations = useMemo(() => {
    const unique: Annotation[] = [];
    const seen = new Set<string>();
    const sorted = [...annotations].sort((a, b) => {
       if (a.page !== b.page) return a.page - b.page;
       return a.bbox[1] - b.bbox[1];
    });

    sorted.forEach(ann => {
       if (ann.type === 'highlight' && ann.text) {
          const key = `${ann.page}-${ann.color}-${ann.text.trim()}`;
          if (seen.has(key)) return;
          seen.add(key);
          unique.push(ann);
       } else {
          unique.push(ann);
       }
    });
    return unique;
  }, [annotations]);

  // --- FICHAMENTO GENERATION ---
  const fichamentoText = useMemo(() => {
    const sorted = [...annotations].sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return a.bbox[1] - b.bbox[1];
    });

    const lines: string[] = [];
    const processedTexts = new Set<string>();

    sorted.forEach(ann => {
        if (!ann.text || !ann.text.trim()) return;
        const cleanText = ann.text.trim();
        const key = `${ann.page}-${cleanText.substring(0, 30)}`;
        if (processedTexts.has(key)) return;
        processedTexts.add(key);

        let typeLabel = "";
        if (ann.type === 'ink') typeLabel = "[Desenho/Texto] ";
        if (ann.type === 'note') typeLabel = "[Nota] ";
        lines.push(`(Pág ${ann.page + settings.pageOffset - 1}) ${typeLabel}\n${cleanText}`);
    });

    return lines.join('\n\n-------------------\n\n');
  }, [annotations, settings.pageOffset]);

  const handleDownloadFichamento = () => {
      const blob = new Blob([fichamentoText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fichamento - ${fileName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  // SVG Filters Construction
  const filterValues = useMemo(() => {
    const hexToRgb = (hex: string) => {
        const bigint = parseInt(hex.slice(1), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    };
    const [tr, tg, tb] = hexToRgb(settings.textColor);
    const [br, bg, bb] = hexToRgb(settings.pageColor);
    
    const rScale = (br - tr) / 255, gScale = (bg - tg) / 255, bScale = (bb - tb) / 255;
    const rOffset = tr / 255, gOffset = tg / 255, bOffset = tb / 255;

    return `${rScale} 0 0 0 ${rOffset} 0 ${gScale} 0 0 ${gOffset} 0 0 ${bScale} 0 ${bOffset} 0 0 0 1 0`;
  }, [settings.textColor, settings.pageColor]);


  // --- VIRTUALIZATION ROW RENDERER ---
  const Row = useCallback(({ index, style }: { index: number, style: React.CSSProperties }) => {
    return (
      <div style={style} className="flex justify-center w-full">
         <PdfPage 
             pageNumber={index + 1}
             filterValues={filterValues}
             pdfDoc={pdfDoc}
         />
      </div>
    );
  }, [filterValues, pdfDoc]);

  // Dynamic Item Size Calculation to prevent gaps
  const itemHeight = useMemo(() => {
    if (!pageDimensions) return 800 * scale + 24;
    return (pageDimensions.height * scale) + 24;
  }, [pageDimensions, scale]);

  // --- Pinch-to-Zoom Logic ---
  const handlePointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      prevPinchDistRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values()) as { x: number, y: number }[];
      const dist = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);

      if (prevPinchDistRef.current) {
        const scaleFactor = dist / prevPinchDistRef.current;
        // Apply sensitivity multiplier to make it feel more responsive
        const sensitivity = 1.0; 
        const delta = scaleFactor - 1;
        const adjustedFactor = 1 + (delta * sensitivity);

        setScale(prev => Math.min(Math.max(0.1, prev * adjustedFactor), 5));
      }
      prevPinchDistRef.current = dist;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      prevPinchDistRef.current = null;
    }
  };

  return (
    <div 
        className="flex flex-col h-screen bg-bg text-text relative"
        onContextMenu={(e) => e.preventDefault()}
    >
      <svg style={{ width: 0, height: 0, position: 'absolute' }}>
        <filter id="pdf-recolor"><feColorMatrix type="matrix" values={filterValues} /></filter>
      </svg>

      {/* Header */}
      <div className={`h-14 bg-black border-b border-border flex items-center justify-between px-4 absolute top-0 left-0 right-0 z-30 transition-transform duration-300 ease-in-out ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}`}>
         <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full"><ArrowLeft size={20}/></button>
            <div className="flex flex-col"><span className="text-sm font-medium truncate max-w-[150px] md:max-w-[300px]">{fileName}</span><span className="text-xs text-text-sec">{numPages} pág.</span></div>
         </div>
         <div className="flex items-center gap-1 md:gap-2">
            <button onClick={() => setShowSaveModal(true)} className="flex items-center gap-2 bg-brand text-bg px-3 py-1.5 rounded-full text-sm font-bold shadow-lg hover:brightness-110 transition-all ml-1">
                <Save size={16}/> 
                <span className="hidden sm:inline">Salvar</span>
            </button>
            <button onClick={() => setShowSidebar(true)} className="p-2 hover:bg-white/10 rounded-full"><Menu size={20}/></button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        <PdfSidebar 
            isOpen={showSidebar} onClose={() => setShowSidebar(false)}
            activeTab={sidebarTab} onTabChange={setSidebarTab}
            sidebarAnnotations={sidebarAnnotations}
            fichamentoText={fichamentoText} aiExplanation={aiExplanation} isAiLoading={isAiLoading}
            onCopyFichamento={() => navigator.clipboard.writeText(fichamentoText)} 
            onDownloadFichamento={handleDownloadFichamento}
        />

        <div 
           ref={containerRef} 
           className="flex-1 overflow-hidden bg-gray-100/50 relative touch-none"
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerLeave={handlePointerUp}
        >
            <PdfToolbar onFitWidth={handleFitWidth} />

            {selection && (
                <SelectionMenu 
                   selection={selection} 
                   onHighlight={createHighlight} 
                   onExplainAi={handleExplainAi} 
                   onDefine={handleDefine} 
                   onCopy={() => navigator.clipboard.writeText(selection.text)} 
                   onClose={() => setSelection(null)}
                />
            )}

            {/* Virtualized List */}
            <AutoSizer>
              {({ height, width }: { height: number, width: number }) => (
                <FixedSizeList
                  ref={listRef}
                  height={height}
                  itemCount={numPages}
                  itemSize={itemHeight} 
                  width={width}
                  overscanCount={2}
                  className="pt-14 outline-none"
                  onScroll={({ scrollOffset, scrollDirection }: { scrollOffset: number; scrollDirection: "forward" | "backward" }) => {
                     // Update current page based on scroll
                     const newPage = Math.floor(scrollOffset / itemHeight) + 1;
                     if (newPage !== currentPage) setCurrentPage(newPage);
                     
                     // Header visibility
                     if (scrollOffset < 60) {
                        setIsHeaderVisible(true);
                     } else {
                        if (scrollDirection === 'forward') setIsHeaderVisible(false);
                        if (scrollDirection === 'backward') setIsHeaderVisible(true);
                     }
                  }}
                >
                  {Row}
                </FixedSizeList>
              )}
            </AutoSizer>
        </div>
      </div>
      
      {/* Modals */}
      {showDefinitionModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-surface p-6 rounded-2xl max-w-md w-full relative">
                  <button onClick={() => setShowDefinitionModal(false)} className="absolute top-4 right-4"><X size={20}/></button>
                  <h3 className="text-xl font-bold mb-4">{definition?.word || "Carregando..."}</h3>
                  <div className="space-y-2 text-sm">{definition?.meanings.map((m: string, i: number) => <p key={i}>{m}</p>)}</div>
              </div>
          </div>
      )}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowSaveModal(false)} className="absolute top-4 right-4 text-text-sec"><X size={20}/></button>
            <h3 className="text-xl font-bold mb-4">Salvar Arquivo</h3>
            <div className="space-y-3">
              <button onClick={() => handleSave('local')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:bg-white/5 text-left transition-colors">
                 <div className="bg-surface border border-border text-text p-2 rounded"><Download size={20}/></div>
                 <div>
                    <div className="font-bold text-text">Fazer Download</div>
                    <div className="text-xs text-text-sec">Baixar cópia no dispositivo</div>
                 </div>
              </button>

              <button onClick={() => handleSave('copy')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-brand/10 border border-brand/20 hover:bg-brand/20 text-left transition-colors">
                <div className="bg-brand text-bg p-2 rounded"><Copy size={20}/></div>
                <div>
                    <div className="font-bold text-brand">Salvar como Cópia</div>
                    <div className="text-xs text-text-sec opacity-80">Criar novo arquivo no Drive</div>
                </div>
              </button>
              
              <button onClick={() => handleSave('overwrite')} className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:bg-red-500/10 text-left transition-colors">
                <div className="bg-surface text-red-500 p-2 rounded"><AlertTriangle size={20}/></div>
                <div>
                    <div className="font-bold text-text">Substituir Original</div>
                    <div className="text-xs text-text-sec">Sobrescrever o arquivo existente</div>
                </div>
              </button>
            </div>
            {!navigator.onLine && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2 text-xs text-yellow-500">
                    <CloudOff size={16} />
                    <span>Modo Offline: Alterações serão sincronizadas quando online.</span>
                </div>
            )}
          </div>
        </div>
      )}
      {showPermissionModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
              <div className="bg-surface p-6 rounded-2xl max-w-sm w-full text-center">
                  <Lock size={40} className="mx-auto text-red-500 mb-4"/>
                  <h3 className="font-bold text-lg mb-2">Permissão Negada</h3>
                  <p className="text-sm text-text-sec mb-4">Não foi possível substituir o arquivo original. Salve como cópia.</p>
                  <button onClick={() => handleSave('copy')} className="w-full bg-brand text-bg py-3 rounded-xl font-bold">Salvar Cópia</button>
              </div>
          </div>
      )}
    </div>
  );
};

export const PdfViewer: React.FC<Props> = (props) => {
  const { pdfDoc, originalBlob, setOriginalBlob, numPages, loading, error, scale: docScale, setScale: setDocScale, pageDimensions } = usePdfDocument({
    fileId: props.fileId,
    fileBlob: props.fileBlob,
    accessToken: props.accessToken,
    onAuthError: props.onAuthError
  });

  const { annotations, addAnnotation, removeAnnotation } = usePdfAnnotations(
    props.fileId, 
    props.uid, 
    pdfDoc
  );

  const jumpToPageRef = useRef<((page: number) => void) | null>(null);

  if (loading) {
     return <div className="flex h-full items-center justify-center bg-bg text-text"><Loader2 className="animate-spin text-brand" size={40}/></div>;
  }

  if (error) {
     return <div className="flex h-full items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <PdfProvider
      initialScale={docScale}
      numPages={numPages}
      annotations={annotations}
      onAddAnnotation={addAnnotation}
      onRemoveAnnotation={removeAnnotation}
      onJumpToPage={(page) => jumpToPageRef.current?.(page)}
    >
       <PdfViewerContent 
          {...props} 
          originalBlob={originalBlob}
          setOriginalBlob={setOriginalBlob}
          pdfDoc={pdfDoc}
          pageDimensions={pageDimensions}
          jumpToPageRef={jumpToPageRef}
       />
    </PdfProvider>
  );
};
