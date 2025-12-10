
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { createWorker } from 'tesseract.js'; // Import Tesseract
import { Annotation, DriveFile } from '../types';
import { saveAnnotation, loadAnnotations, deleteAnnotation } from '../services/storageService';
import { downloadDriveFile, uploadFileToDrive, deleteDriveFile, updateDriveFile } from '../services/driveService';
import { fetchDefinition } from '../services/dictionaryService';
import { GoogleGenAI } from "@google/genai"; // Import Google GenAI
import { ArrowLeft, Highlighter, Loader2, X, Type, List, MousePointer2, Save, ScanLine, ZoomIn, ZoomOut, Menu, PaintBucket, Sliders, MoveHorizontal, Pen, Eraser, Copy, Download, FileText, Hash, Check, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Lock, AlertTriangle, FileInput, Sparkles, BrainCircuit, Minus, Plus, ImageOff, Eye, StickyNote, Trash2, Maximize2, Minimize2, Columns, Book, Search, ExternalLink, Bot } from 'lucide-react';

// Explicitly set worker to specific version (4.8.69 Stable) to avoid "Dependent image isn't ready yet" errors
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs`;

// --- CONSTANTS ---
// Standard conversion: 1 PDF Point (1/72 inch) -> 1 CSS Pixel (1/96 inch) is 1.33.
// Ajuste baseado em feedback: 174% do tamanho padrão de 96DPI é percebido como o tamanho "real" ideal.
// Aplicamos esse fator de 1.74 na base para que o nível de zoom 1.0 (100%) reflita esse tamanho confortável.
const CSS_UNITS = (96.0 / 72.0) * 1.74; 

// --- Dynamic Font Loader ---
const attemptedFonts = new Set<string>();

/**
 * Tenta baixar automaticamente uma fonte do Google Fonts se ela não estiver no sistema.
 * Remove prefixos de subset (Ex: "ABCDE+Roboto-Bold" -> "Roboto")
 */
const tryAutoDownloadFont = (rawFontName: string) => {
  if (!navigator.onLine) return; // Não faz nada se offline
  
  // Limpeza do nome da fonte
  // 1. Remove aspas
  let cleanName = rawFontName.replace(/['"]/g, '').trim();
  
  // 2. Remove prefixo de subset do PDF (6 letras maiúsculas + '+')
  if (cleanName.includes('+')) {
    cleanName = cleanName.split('+')[1];
  }

  // 3. Extrai apenas o nome da família (remove -Bold, -Italic, etc para a busca na API)
  // Ex: "Roboto-Bold" -> "Roboto"
  const familyName = cleanName.split('-')[0];

  // Evita requisições duplicadas ou desnecessárias para fontes padrão
  const skipList = ['Arial', 'Helvetica', 'Times', 'Courier', 'Verdana', 'Georgia', 'sans-serif', 'serif', 'monospace'];
  if (attemptedFonts.has(familyName) || skipList.some(s => familyName.toLowerCase().includes(s.toLowerCase()))) {
    return;
  }

  attemptedFonts.add(familyName);
  console.log(`[Auto-Font] Tentando baixar fonte ausente: ${familyName}`);

  // Constrói URL do Google Fonts (solicitando pesos comuns para garantir compatibilidade)
  const googleFontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyName)}:wght@300;400;500;700&display=swap`;

  const link = document.createElement('link');
  link.href = googleFontUrl;
  link.rel = 'stylesheet';
  link.id = `dynamic-font-${familyName}`;

  link.onload = () => {
    console.log(`[Auto-Font] Fonte carregada com sucesso: ${familyName}`);
    // Força um reflow leve ou re-verificação se necessário, mas o browser costuma aplicar automaticamente
  };
  
  link.onerror = () => {
    console.warn(`[Auto-Font] Fonte não encontrada no Google Fonts: ${familyName}`);
    link.remove(); // Limpa se falhar
  };

  document.head.appendChild(link);
};

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
  onAuthError?: () => void; // Prop para notificar erro de autenticação
}

interface SelectionState {
  page: number;
  text: string;
  // Position relative to the scrolling container
  popupX: number;
  popupY: number;
  // Rects normalized to PDF coordinates (scale=1)
  relativeRects: { x: number; y: number; width: number; height: number }[];
  position: 'top' | 'bottom'; // Control if popup is above or below selection
}

// --- Helper: Convert Points to SVG Path ---
const pointsToSvgPath = (points: number[][]) => {
  if (points.length === 0) return '';
  const d = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  return d;
};

// --- Custom Text Renderer with De-Fragmentation & Geometry Normalization (Action 1.1 + 1.2 + 3.1) ---
const renderCustomTextLayer = (textContent: any, container: HTMLElement, viewport: any, detectColumns: boolean) => {
  container.innerHTML = '';
  
  // 1. Extract Geometry & Data
  const rawItems = textContent.items.map((item: any) => {
    const tx = item.transform;
    const fontHeight = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
    const fontWidth = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1]);
    const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);
    const fontSize = fontHeight * viewport.scale;
    
    // Estimate width in viewport pixels
    // item.width is usually in PDF units.
    const itemWidth = item.width ? item.width * viewport.scale : (item.str.length * fontSize * 0.5);

    return {
      item,
      str: item.str,
      x,
      y, // This is the baseline Y
      width: itemWidth,
      fontSize,
      fontName: item.fontName,
      tx: tx,
      // Calculate font scale for CSS transform (Aspect Ratio of the font glyphs defined in PDF)
      scaleX: fontHeight > 0 ? (fontWidth / fontHeight) : 1,
      angle: Math.atan2(tx[1], tx[0])
    };
  });

  // 2. Sort Items (Y Descending - Top to Bottom, then X Ascending - Left to Right)
  rawItems.sort((a: any, b: any) => {
    // FIX: Double Page / Column Sorting Logic
    // If detectColumns is ON, we first sort items by which side of the page they are on.
    // This creates a DOM order of [Left Page Content] then [Right Page Content].
    // This forces the browser selection to flow down the left page before jumping to the right,
    // preventing selection from spanning across the gutter on the same visual line.
    if (detectColumns) {
      const mid = viewport.width / 2;
      const centerA = a.x + (a.width / 2);
      const centerB = b.x + (b.width / 2);
      const isLeftA = centerA < mid;
      const isLeftB = centerB < mid;

      if (isLeftA !== isLeftB) {
        return isLeftA ? -1 : 1;
      }
    }

    // Note: In viewport coordinates, Y increases downwards. 
    // So 'a.y' < 'b.y' means 'a' is visually above 'b'.
    const yDiff = a.y - b.y;
    
    // Tolerance for grouping lines (roughly 20% of font size)
    // If items are on the same visual line, we sort by X.
    if (Math.abs(yDiff) < (Math.min(a.fontSize, b.fontSize) * 0.4)) { 
       return a.x - b.x; 
    }
    // Otherwise, top lines come first (smaller Y values first)
    return yDiff; 
  });

  // 3. Merge / De-fragmentation Pass (ACTION 1.2: Intelligent Merging)
  const mergedItems: any[] = [];
  if (rawItems.length > 0) {
    let current = rawItems[0];
    
    for (let i = 1; i < rawItems.length; i++) {
      const next = rawItems[i];
      
      // Check if they are on the same visual line
      const sameLine = Math.abs(current.y - next.y) < (current.fontSize * 0.5);
      const sameFont = current.fontName === next.fontName && Math.abs(current.fontSize - next.fontSize) < 2;
      
      const expectedNextX = current.x + current.width;
      const gap = next.x - expectedNextX;
      
      // Heuristic: A normal space is usually ~0.2-0.3em. A large gap means separate columns/words.
      const spaceWidth = current.fontSize * 0.25;
      
      // Merge condition:
      // 1. Same Line & Same Font
      // 2. Not too far apart
      // 3. Not overlapping backwards (gap > -0.5em)
      
      // FIX DOUBLE PAGE: If detectColumns is true, we enforce a strict maxGap (e.g. 1.5em).
      // If false (legacy behavior), we allow up to 4.0em which tends to bridge book gutters.
      const maxGap = detectColumns ? (current.fontSize * 1.5) : (current.fontSize * 4.0);
      
      const isConsecutive = gap > -(current.fontSize * 0.5) && gap < maxGap;
      
      // Check if one of them is purely whitespace, we should treat it as a connector
      const isWhitespace = current.str.trim().length === 0 || next.str.trim().length === 0;

      if (sameLine && sameFont && (isConsecutive || isWhitespace)) {
        // Handle Implicit Spaces
        // If there is a visual gap big enough to be a space, but no space character exists at boundary:
        if (gap > spaceWidth && !current.str.endsWith(' ') && !next.str.startsWith(' ')) {
             current.str += ' ';
        }

        // MERGE
        current.str += next.str;
        // Extend width to cover the next item geometrically
        current.width = (next.x + next.width) - current.x;
        // Keep current's X and Y as the anchor
      } else {
        // PUSH AND START NEW
        mergedItems.push(current);
        current = next;
      }
    }
    mergedItems.push(current);
  }

  // Array to hold items for batch DOM measurement
  const itemsToMeasure: { span: HTMLSpanElement, part: any }[] = [];

  // 4. Render Merged Items (First Pass: DOM Injection)
  mergedItems.forEach((part: any, index: number) => {
    // ACTION: We render even empty strings if they have width (spaces), 
    // but usually we skip empty unless they bridge content. 
    // Since we merged, only non-empty matters effectively.
    if (!part.str || part.str.length === 0) return;

    const span = document.createElement('span');
    span.textContent = part.str;

    // --- Font Metrics & Vertical Alignment ---
    // Try to get accurate ascent from PDF font metadata
    let fontAscent = 0.85; // Default fallback
    let fontFamily = "'Google Sans', 'Inter', sans-serif";
    
    if (textContent.styles && part.fontName && textContent.styles[part.fontName]) {
        const style = textContent.styles[part.fontName];
        if (style.ascent) fontAscent = style.ascent;
        
        // Heuristic: Serifs usually need higher ascent factor
        if (style.fontFamily) {
             fontFamily = style.fontFamily;
             if (style.fontFamily.toLowerCase().includes('times') || style.fontFamily.toLowerCase().includes('serif')) {
                 // ADJUSTED: Reduced from 0.95 to 0.89 to fix floating boxes (Adobe style)
                 fontAscent = 0.89;
             }
             if (!document.fonts.check(`12px "${style.fontFamily}"`)) {
                 tryAutoDownloadFont(style.fontFamily);
             }
        }
    }

    const calculatedTop = part.y - (part.fontSize * fontAscent);

    // ACTION 3.1: Magnetic Vertical Padding
    // ADJUSTED: Reduced from 0.50 to 0.20 to reduce line overlap visual confusion.
    const verticalPaddingFactor = 0.20; 
    const paddingPx = part.fontSize * verticalPaddingFactor;

    span.style.left = `${part.x}px`;
    
    // Visually shift the box UP by the padding amount so the text stays in the correct baseline position.
    span.style.top = `${calculatedTop - paddingPx}px`;
    
    span.style.fontSize = `${part.fontSize}px`;
    span.style.fontFamily = fontFamily;
    
    // Apply Magnetic Padding
    span.style.paddingTop = `${paddingPx}px`;
    span.style.paddingBottom = `${paddingPx}px`;
    span.style.boxSizing = 'content-box'; // Ensure padding adds to total height

    span.style.position = 'absolute';
    span.style.transformOrigin = '0% 0%';
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
    span.style.color = 'transparent';
    
    // Strict Line Height of 1.0 keeps the 'content' box tight to the font size, 
    // while padding handles the hit area.
    span.style.lineHeight = '1.0'; 
    span.style.pointerEvents = 'all';

    // ACTION 2.1: Inject PDF Geometry Data for precise highlighting
    span.dataset.pdfX = part.x.toString();
    // CRITICAL: Store the ORIGINAL calculatedTop (visual top), ignoring the padding offset.
    span.dataset.pdfTop = calculatedTop.toString();
    span.dataset.pdfWidth = part.width.toString();
    span.dataset.pdfHeight = part.fontSize.toString();

    container.appendChild(span);
    itemsToMeasure.push({ span, part });

    // ACTION: FIX COPY-PASTE JOINING WORDS
    // Check if the next item requires a separator (line break or space)
    if (index < mergedItems.length - 1) {
        const nextPart = mergedItems[index + 1];
        
        // COLUMN AWARENESS FOR COPY-PASTE:
        // If sorting by column, current and next might be vertically far apart (end of col 1 vs start of col 2).
        // Or they might be on same page side but next line.
        
        // Standard check: vertical diff
        const verticalDiff = nextPart.y - part.y;
        
        // Case 1: New Line (or New Column which looks like huge negative vertical diff usually, or huge positive)
        // If next part is significantly lower (larger Y) -> New Line
        if (verticalDiff > part.fontSize * 0.5) {
             container.appendChild(document.createElement('br'));
        } 
        // If we jump from bottom of Left Col to top of Right Col (Y decreases significantly)
        else if (detectColumns && (nextPart.y < part.y - 100)) {
             // This is a column break. Add double newline for separation.
             container.appendChild(document.createElement('br'));
             container.appendChild(document.createElement('br'));
        }
        // Case 2: Same Line, but distinct items
        else if (nextPart.x > (part.x + part.width)) {
             const gap = nextPart.x - (part.x + part.width);
             if (gap > part.fontSize * 0.1) {
                 container.appendChild(document.createTextNode(' '));
             }
        }
    }
  });

  // 5. Action 1.1: Normalize Width (Second Pass: Batch Measure & Correct)
  const naturalWidths = itemsToMeasure.map(item => item.span.getBoundingClientRect().width);

  itemsToMeasure.forEach((item, index) => {
      const { span, part } = item;
      const naturalWidth = naturalWidths[index];
      const targetWidth = part.width; 

      let finalScale = part.scaleX;

      // Correction Logic: Stretch text to match PDF geometric width exactly
      if (naturalWidth > 0 && targetWidth > 0) {
          const correctionFactor = targetWidth / naturalWidth;
          finalScale = part.scaleX * correctionFactor;
      }

      let transformCSS = `scaleX(${finalScale})`;
      if (part.angle !== 0) {
         transformCSS = `rotate(${part.angle}rad) ` + transformCSS;
      }

      span.style.transform = transformCSS;
  });
};

// --- Sub-Component: Note Marker (Collapsed/Expanded) ---
interface NoteMarkerProps {
  ann: Annotation;
  scale: number; // Counter-scale
  activeTool: string;
  onDelete: (ann: Annotation) => void;
}

const NoteMarker: React.FC<NoteMarkerProps> = ({ ann, scale, activeTool, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand newly created notes (simple heuristic: if created in last 2 seconds)
  useEffect(() => {
    if (ann.createdAt && (Date.now() - new Date(ann.createdAt).getTime() < 2000)) {
      setIsExpanded(true);
    }
  }, [ann.createdAt]);

  // Coordinates from annotation are PDF Point (Scale 1)
  // But our container is scaled.
  const x = ann.bbox[0] * scale;
  const y = ann.bbox[1] * scale;

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleMarkerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTool === 'eraser') {
      onDelete(ann);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(ann);
  };

  if (!isExpanded) {
    return (
      <div 
        className="absolute z-30 group cursor-pointer transition-transform hover:scale-110 pointer-events-auto"
        style={{
           left: x,
           top: y,
           // Center the marker: translate(-50%, -50%). 
           // NOTE: No CSS transform on parent anymore, so we don't counter-scale.
           // However, if we want the marker to stay fixed size (e.g. 24px) regardless of zoom,
           // we could scale it by 1/scale. But usually markers scale with document in PDF viewers.
           // Let's keep it constant relative to document for now (easier tap targets).
           transform: `translate(-50%, -50%)`, 
           transformOrigin: 'center',
           cursor: activeTool === 'eraser' ? 'url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png), pointer' : 'pointer'
        }}
        onClick={handleMarkerClick}
        title={activeTool === 'eraser' ? "Apagar Nota" : "Ver nota"}
      >
        {/* 24px = w-6 h-6 */}
        <div className={`w-6 h-6 rounded-full bg-yellow-400 border-2 border-yellow-600 shadow-md flex items-center justify-center ${activeTool === 'eraser' ? 'bg-red-500 border-red-700' : ''}`}>
           {activeTool === 'eraser' ? (
             <X size={12} className="text-white"/>
           ) : (
             <StickyNote size={12} className="text-yellow-900 opacity-75" />
           )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="annotation-item absolute z-30 group pointer-events-auto animate-in zoom-in duration-200"
      style={{
        left: x,
        top: y,
        transform: `scale(1)`,
        transformOrigin: 'top left'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className={`bg-yellow-100 text-gray-900 text-sm p-3 rounded-br-xl rounded-bl-xl rounded-tr-xl rounded-tl-none shadow-xl border border-yellow-300 relative flex flex-col gap-2 min-w-[200px] max-w-[300px]`}
        style={{ backgroundColor: ann.color || '#fef9c3' }}
      >
        <div className="flex items-center justify-between border-b border-yellow-500/10 pb-1 mb-1">
          <span className="text-[10px] uppercase font-bold text-yellow-800/60 tracking-wider">Nota</span>
          <div className="flex gap-1">
             <button 
                onClick={toggleExpand}
                className="p-1 text-yellow-800 hover:bg-yellow-200 rounded transition-colors"
                title="Fechar (Colapsar)"
             >
                <X size={14} />
             </button>
             {/* Delete Button inside Note */}
             {ann.id && !ann.isBurned && (
                <button 
                  onClick={handleDelete}
                  className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors ml-1"
                  title="Excluir Nota Permanentemente"
                >
                  <Trash2 size={14} />
                </button>
             )}
          </div>
        </div>
        <p className="whitespace-pre-wrap break-words font-medium leading-relaxed text-sm text-yellow-900">{ann.text}</p>
      </div>
    </div>
  );
};


// --- Sub-Component: Individual Page Renderer ---
interface PdfPageProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number; // Direct scale to render (visual size)
  filterValues: string;
  annotations: Annotation[];
  activeTool: 'cursor' | 'text' | 'ink' | 'eraser' | 'note';
  inkColor: string;
  inkStrokeWidth: number;
  inkOpacity: number;
  disableColorFilter: boolean;
  detectColumns: boolean; // NEW PROP
  onPageClick: (page: number, x: number, y: number) => void;
  onDeleteAnnotation: (annotation: Annotation) => void;
  onAddInk: (ann: Annotation) => void;
  onAddNote: (ann: Annotation) => void;
}

const PdfPage: React.FC<PdfPageProps> = ({ 
  pdfDoc, 
  pageNumber, 
  scale,
  filterValues, 
  annotations,
  activeTool,
  inkColor,
  inkStrokeWidth,
  inkOpacity,
  disableColorFilter,
  detectColumns,
  onPageClick,
  onDeleteAnnotation,
  onAddInk,
  onAddNote
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null); // Ref to track current render task
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const textItemsRef = useRef<any[]>([]); // Store text items for ink collision detection
  
  // States
  const [rendered, setRendered] = useState(false);
  const [hasText, setHasText] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  
  // OCR State
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);

  // Optimization: Cache page proxy to avoid async getPage calls on zoom
  const [pageProxy, setPageProxy] = useState<any>(null);

  // Ink State
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);

  // Draft Note State (for inline editor)
  const [draftNote, setDraftNote] = useState<{x: number, y: number, text: string} | null>(null);

  // Clear draft note if tool changes
  useEffect(() => {
    if (activeTool !== 'note') {
      setDraftNote(null);
    }
  }, [activeTool]);

  // Focus textarea when draft note opens
  useEffect(() => {
    if (draftNote && noteInputRef.current) {
      noteInputRef.current.focus();
    }
  }, [draftNote]);

  // 1. Setup Intersection Observer
  useEffect(() => {
    const element = pageContainerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null, // viewport
        rootMargin: '100% 0px', // Renderiza 1 tela inteira antes e depois (pre-load suave)
        threshold: 0
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 2. Fetch Page Proxy (Once per page mount)
  useEffect(() => {
    let active = true;
    const fetchPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (active) {
          setPageProxy(page);
        }
      } catch (e) {
        console.error(`Error loading page ${pageNumber}`, e);
      }
    };
    fetchPage();
    return () => { active = false; };
  }, [pdfDoc, pageNumber]);

  // 3. Calculate Dimensions synchronously
  const pageDimensions = useMemo(() => {
    if (!pageProxy) return null;
    const viewport = pageProxy.getViewport({ scale: scale });
    return { width: viewport.width, height: viewport.height };
  }, [pageProxy, scale]);

  // 4. Render Content (Only when Visible AND Dimensions set)
  // Re-runs when `scale` changes (Native Zooming)
  useEffect(() => {
    if (!isVisible || !pageDimensions || !pageProxy || !canvasRef.current || !textLayerRef.current) return;
    
    let active = true;

    const render = async () => {
      try {
        const viewport = pageProxy.getViewport({ scale: scale });
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Use willReadFrequently: true for better performance with OCR (frequent getImageData)
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); 
        if (!ctx) return;

        // Cancel previous render task if it exists to avoid "Same canvas" error
        if (renderTaskRef.current) {
          try {
            await renderTaskRef.current.cancel();
          } catch (e) {
            // Ignore cancellation errors
          }
        }

        // Support High DPI Screens (Retina)
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Reset transform to identity before scaling
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
          
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport,
            enableWebGL: false,
            renderInteractiveForms: false
        };

        // Render Canvas
        const task = pageProxy.render(renderContext);
        
        renderTaskRef.current = task;
        
        await task.promise;
        
        // If this task finished successfully and wasn't cancelled/replaced, clear ref
        if (renderTaskRef.current === task) {
             renderTaskRef.current = null;
        }
          
        if (!active) return;
          
        // Render Text
        const textContent = await pageProxy.getTextContent({ disableCombineTextItems: false });
        if (!active) return;
        
        // Store text items for ink analysis
        textItemsRef.current = textContent.items;
          
        // If very few text items, treat as image (candidates for OCR)
        const hasTextContent = textContent.items.length > 5;
        setHasText(hasTextContent);

        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;
            
            if (hasTextContent) {
                renderCustomTextLayer(textContent, textLayerDiv, viewport, detectColumns);
            } else {
                textLayerDiv.innerHTML = ''; // Clear if no text
            }
        }
          
        setRendered(true);
      } catch (err: any) {
        // Ignore rendering cancelled errors as they are expected when scrolling fast
        if (err?.name === 'RenderingCancelledException') {
            return;
        }
        if (active) console.error(`Error rendering page ${pageNumber}`, err);
      }
    };

    render();
    
    // Cleanup: cancel any pending render
    return () => { 
      active = false; 
      if (renderTaskRef.current) {
          try {
              const cancelResult = renderTaskRef.current.cancel();
              if (cancelResult && typeof cancelResult.catch === 'function') {
                  cancelResult.catch(() => {});
              }
          } catch (e) {
              // ignore synchronous errors
          }
          renderTaskRef.current = null;
      }
    };
  }, [pageProxy, scale, isVisible, pageDimensions, detectColumns]); // Added detectColumns to deps

  // --- AUTOMATIC OCR LOGIC ---
  useEffect(() => {
    // Trigger OCR only if:
    // 1. Page is rendered
    // 2. Page has no native text (!hasText)
    // 3. Page is visible to user
    // 4. OCR hasn't started yet (idle)
    if (rendered && !hasText && isVisible && ocrStatus === 'idle') {
      const runOcr = async () => {
        if (!canvasRef.current) return;
        setOcrStatus('loading');
        setOcrProgress(0);
        
        try {
            console.log(`[OCR] Iniciando OCR na página ${pageNumber}...`);
            // Create worker for Portuguese with logger for progress
            const worker = await createWorker('por', 1, {
              logger: m => {
                if (m.status === 'recognizing text') {
                   setOcrProgress(Math.floor(m.progress * 100));
                }
              }
            });
            
            const canvas = canvasRef.current;
            // Run recognition
            const { data } = await worker.recognize(canvas);
            
            if (data && data.words && data.words.length > 0) {
                // Populate textItemsRef so Ink can select OCR text too!
                const mockItems = data.words.map(w => {
                    return {
                        str: w.text,
                        // Custom prop to skip transform calculation in detectTextUnderInk
                        // Store as: x, y, w, h (Scale 1)
                        customRect: {
                            x: w.bbox.x0 / scale,
                            y: w.bbox.y0 / scale,
                            w: (w.bbox.x1 - w.bbox.x0) / scale,
                            h: (w.bbox.y1 - w.bbox.y0) / scale
                        }
                    };
                });
                textItemsRef.current = mockItems;

                renderOcrToTextLayer(data.words);
                setOcrStatus('done');
                console.log(`[OCR] Sucesso pág ${pageNumber}: ${data.words.length} palavras.`);
            } else {
                setOcrStatus('done'); // Done but empty
            }
            
            await worker.terminate();
        } catch (err) {
            console.error("[OCR] Erro:", err);
            setOcrStatus('failed');
        }
      };

      // Small delay to ensure UI is responsive and canvas is fully painted
      const timer = setTimeout(runOcr, 500);
      return () => clearTimeout(timer);
    }
  }, [rendered, hasText, isVisible, ocrStatus, pageNumber, scale]);

  const renderOcrToTextLayer = (words: any[]) => {
      const container = textLayerRef.current;
      if (!container) return;
      
      container.innerHTML = ''; // Clear existing
      
      words.forEach(word => {
          const { bbox, text } = word; // bbox from tesseract: x0, y0, x1, y1
          // NOTE: Tesseract runs on the canvas image. The canvas is already scaled by scale.
          // The textLayer is also sized to the canvas dimensions.
          // So Tesseract bbox coordinates map 1:1 to textLayer pixels (CSS pixels).

          const span = document.createElement('span');
          span.textContent = text + ' '; // Add space for natural selection
          
          const width = bbox.x1 - bbox.x0;
          const height = bbox.y1 - bbox.y0;
          
          // Basic validation to avoid crazy boxes
          if (width <= 0 || height <= 0) return;

          span.style.left = `${bbox.x0}px`;
          span.style.top = `${bbox.y0}px`;
          span.style.width = `${width}px`;
          span.style.height = `${height}px`;
          span.style.fontSize = `${height}px`; // Approx font size
          span.style.position = 'absolute';
          span.style.color = 'transparent';
          span.style.cursor = 'text';
          span.style.lineHeight = '1';
          span.style.whiteSpace = 'pre';
          span.style.transformOrigin = '0 0';

          container.appendChild(span);
      });
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    // Only allow Note Creation if tool is 'note'
    if (activeTool !== 'note' || !pageContainerRef.current) return;
    if ((e.target as HTMLElement).closest('.annotation-item')) return;
    if ((e.target as HTMLElement).closest('.note-editor')) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    // Normalize coordinates to PDF scale=1 using current scale (no css transform)
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    // Start Draft Note
    setDraftNote({ x, y, text: '' });
  };

  const handleSaveDraftNote = () => {
    if (draftNote && draftNote.text.trim()) {
      onAddNote({
        id: `temp-note-${Date.now()}-${Math.random()}`,
        page: pageNumber,
        bbox: [draftNote.x, draftNote.y, 0, 0],
        type: 'note',
        text: draftNote.text,
        color: '#fef9c3',
        opacity: 1,
        createdAt: new Date().toISOString() // Marked for auto-expand
      });
    }
    setDraftNote(null);
  };

  // --- Ink Handling ---
  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool !== 'ink' || !pageContainerRef.current) return;
    e.preventDefault(); 
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const rect = pageContainerRef.current.getBoundingClientRect();
    // Normalize coordinates to PDF scale=1
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    setIsDrawing(true);
    setCurrentPoints([[x, y]]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || activeTool !== 'ink' || !pageContainerRef.current) return;
    e.preventDefault();

    const rect = pageContainerRef.current.getBoundingClientRect();
    // Normalize coordinates to PDF scale=1
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    setCurrentPoints(prev => [...prev, [x, y]]);
  };

  // Helper to detect text under the ink bounding box
  const detectTextUnderInk = (points: number[][]) => {
    if (points.length < 2 || !pageProxy || !textItemsRef.current) return '';
    
    // 1. Calculate Ink Bounding Box (Scale 1)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    });

    // Add padding to make selection easier (5px padding)
    const padding = 5;
    minX -= padding; minY -= padding;
    maxX += padding; maxY += padding;

    // 2. Get Viewport at Scale 1 (matches ink coordinates)
    const viewport = pageProxy.getViewport({ scale: 1 });
    const extractedItems: { str: string, x: number, y: number }[] = [];

    // 3. Iterate Text Items
    textItemsRef.current.forEach(item => {
        if (!item.str || item.str.trim().length === 0) return;
        
        let vx, vy, vw, vh;

        // OCR/Custom handling
        if (item.customRect) {
            vx = item.customRect.x;
            vy = item.customRect.y;
            vw = item.customRect.w;
            vh = item.customRect.h;
        } else {
            // Standard PDF Text Item
            const tx = item.transform;
            // tx[4], tx[5] are PDF x, y. Convert to Viewport (Scale 1) x, y.
            // convertToViewportPoint returns [x, y] where y is baseline.
            const [baseX, baseY] = viewport.convertToViewportPoint(tx[4], tx[5]);
            
            // Calculate approximate height (font size)
            // tx[3] is roughly font size in Y
            const fontSize = Math.sqrt(tx[3] * tx[3] + tx[2] * tx[2]);
            
            // Calculate width. item.width is usually raw PDF width? No, in getTextContent it is adjusted.
            // Using a safe approximation for intersection
            vw = item.width ? item.width : (item.str.length * fontSize * 0.5);
            vh = fontSize;
            vx = baseX;
            vy = baseY - vh; // Top-Left Y
        }

        // 4. Check Intersection (AABB)
        // Box 1: Ink (minX, minY, maxX, maxY)
        // Box 2: Text (vx, vy, vx+vw, vy+vh)
        
        const textMaxX = vx + vw;
        const textMaxY = vy + vh;
        
        const isOverlapping = 
            minX < textMaxX &&
            maxX > vx &&
            minY < textMaxY &&
            maxY > vy;
            
        if (isOverlapping) {
            extractedItems.push({ str: item.str, x: vx, y: vy });
        }
    });

    // 5. Sort Extracted Text
    // Sort by Y (Top to Bottom), then X (Left to Right)
    // Tolerance for Y to group lines
    extractedItems.sort((a, b) => {
        const lineTolerance = 10;
        if (Math.abs(a.y - b.y) > lineTolerance) {
            return a.y - b.y;
        }
        return a.x - b.x;
    });

    // 6. Join Text
    // We add a space between items to ensure separation
    return extractedItems.map(i => i.str).join('');
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || activeTool !== 'ink') return;
    e.preventDefault();
    setIsDrawing(false);

    if (currentPoints.length > 1) {
      // Run extraction logic
      const extractedText = detectTextUnderInk(currentPoints);
      
      onAddInk({
        id: `temp-${Date.now()}-${Math.random()}`, 
        page: pageNumber,
        bbox: [0, 0, 0, 0], 
        type: 'ink',
        points: currentPoints, // Already normalized
        color: inkColor,
        strokeWidth: inkStrokeWidth,
        opacity: inkOpacity,
        text: extractedText // <--- Save the extracted text!
      });
    }
    setCurrentPoints([]);
  };

  // Layout Dimensions (The spacer container)
  const layoutWidth = pageDimensions ? pageDimensions.width : '100%';
  const layoutHeight = pageDimensions ? pageDimensions.height : `${800 * scale}px`;

  return (
    <div 
      ref={pageContainerRef}
      className={`pdf-page relative mb-4 md:mb-8 mx-auto transition-cursor select-none ${activeTool === 'text' ? 'cursor-text' : activeTool === 'ink' ? 'cursor-crosshair touch-none' : activeTool === 'note' ? 'cursor-copy' : activeTool === 'eraser' ? 'cursor-[url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png),_pointer]' : ''}`}
      data-page-number={pageNumber}
      style={{ 
        width: layoutWidth, 
        height: layoutHeight,
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
      }}
      onClick={handleContainerClick}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Content Container - No CSS Transform anymore */}
      <div 
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      >
        {/* OCR Status Indicator */}
        {!hasText && rendered && isVisible && (
           <div className="absolute -top-6 left-0 flex items-center gap-2 text-xs text-text-sec opacity-90 transition-all">
              {ocrStatus === 'loading' ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-brand" />
                  <span className="text-brand font-medium">OCR: {ocrProgress}%</span>
                  <div className="w-16 h-1 bg-gray-700/30 rounded-full overflow-hidden">
                    <div className="h-full bg-brand transition-all duration-300" style={{width: `${ocrProgress}%`}} />
                  </div>
                </div>
              ) : ocrStatus === 'done' ? (
                <>
                  <Sparkles size={12} className="text-yellow-400" />
                  <span className="text-text font-medium">Texto reconhecido via IA</span>
                </>
              ) : ocrStatus === 'failed' ? (
                <>
                  <AlertTriangle size={12} className="text-red-400" />
                  <span>Falha no OCR</span>
                </>
              ) : (
                <>
                  <ScanLine size={12} />
                  <span>Imagem (aguardando OCR)</span>
                </>
              )}
           </div>
        )}

        {/* Placeholder Loading State */}
        {!rendered && isVisible && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300">
             <Loader2 className="animate-spin w-8 h-8" />
          </div>
        )}

        <canvas 
          ref={canvasRef}
          style={{ 
            filter: disableColorFilter ? 'none' : 'url(#pdf-recolor)',
            display: 'block',
            visibility: isVisible ? 'visible' : 'hidden'
          }}
        />

        {/* Draft Note Editor (Visual Input) */}
        {draftNote && (
          <div 
            className="note-editor absolute z-50 animate-in zoom-in duration-200"
            style={{
              left: draftNote.x * scale,
              top: draftNote.y * scale,
              maxWidth: '250px',
              transform: `scale(1)`, // Reset scale
              transformOrigin: 'top left'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-yellow-100 text-gray-900 rounded-lg shadow-xl border border-yellow-300 p-2 flex flex-col gap-2 w-64">
               <div className="flex items-center justify-between border-b border-yellow-200/50 pb-1 mb-1">
                 <span className="text-[10px] uppercase font-bold text-yellow-800 tracking-wider">Nova Nota</span>
               </div>
               <textarea 
                 ref={noteInputRef}
                 value={draftNote.text}
                 onChange={(e) => setDraftNote({ ...draftNote, text: e.target.value })}
                 placeholder="Digite sua anotação..."
                 className="bg-transparent w-full text-sm resize-none outline-none min-h-[80px] leading-relaxed placeholder:text-yellow-700/50"
               />
               <div className="flex items-center gap-2 justify-end pt-1">
                 <button 
                    onClick={() => setDraftNote(null)}
                    className="p-1.5 rounded-md hover:bg-yellow-200 text-yellow-800 transition-colors"
                    title="Cancelar"
                 >
                    <X size={16} />
                 </button>
                 <button 
                    onClick={handleSaveDraftNote}
                    className="flex items-center gap-1 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-950 rounded-md text-xs font-bold transition-colors shadow-sm"
                 >
                    <Check size={14} />
                    Salvar
                 </button>
               </div>
            </div>
          </div>
        )}

        {/* Annotations Layer */}
        {isVisible && (
          <div className="absolute inset-0 pointer-events-none">
            {/* SVG Layer for Ink - Scaled via Group transform to match current zoom */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 15 }}>
              <g transform={`scale(${scale})`}>
                {/* Group Ink by Color/Opacity for 'Single Layer' effect */}
                {(() => {
                    const inkAnns = annotations.filter(a => a.type === 'ink' && !a.isBurned);
                    
                    // Grouping key: "color|opacity"
                    // If we want strokes of different widths to blend, we should group them if color/opacity matches.
                    const groups: Record<string, Annotation[]> = {};
                    
                    inkAnns.forEach(ann => {
                         const op = ann.opacity ?? 1;
                         const col = ann.color || '#000000';
                         // We group by color and opacity to apply the opacity to the group
                         const key = `${col}|${op}`;
                         if (!groups[key]) groups[key] = [];
                         groups[key].push(ann);
                    });

                    // Determine which group the CURRENT drawing belongs to
                    const currentOp = inkOpacity;
                    const currentCol = inkColor;
                    const currentKey = `${currentCol}|${currentOp}`;

                    return (
                        <>
                            {Object.entries(groups).map(([key, anns]) => {
                                const [col, opStr] = key.split('|');
                                const op = parseFloat(opStr);
                                const isCurrentGroup = isDrawing && key === currentKey;

                                return (
                                    <g key={key} style={{ opacity: op }}>
                                         {anns.map((ann, i) => (
                                             <path
                                                key={ann.id || `ink-${i}`}
                                                d={pointsToSvgPath(ann.points || [])}
                                                stroke={ann.color || 'red'}
                                                strokeWidth={ann.strokeWidth || 3}
                                                // Set path opacity to 1 so they don't blend within the group
                                                strokeOpacity={1}
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                className={activeTool === 'eraser' ? 'hover:opacity-50 cursor-pointer' : ''}
                                                style={{ 
                                                  pointerEvents: activeTool === 'eraser' ? 'visibleStroke' : 'none',
                                                  cursor: activeTool === 'eraser' ? 'url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png), pointer' : 'none'
                                                }}
                                                onClick={(e) => {
                                                  if (activeTool === 'eraser' && ann.id) {
                                                    e.stopPropagation();
                                                    onDeleteAnnotation(ann); 
                                                  }
                                                }}
                                             />
                                         ))}
                                         {/* Render current drawing in this group if it matches */}
                                         {isCurrentGroup && (
                                            <path 
                                                d={pointsToSvgPath(currentPoints)}
                                                stroke={inkColor}
                                                strokeWidth={inkStrokeWidth}
                                                strokeOpacity={1} // Opaque inside group
                                                fill="none"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                         )}
                                    </g>
                                );
                            })}
                            
                            {/* If current drawing doesn't match any existing group, render it in a new group */}
                            {isDrawing && !groups[currentKey] && (
                                 <g style={{ opacity: inkOpacity }}>
                                    <path 
                                        d={pointsToSvgPath(currentPoints)}
                                        stroke={inkColor}
                                        strokeWidth={inkStrokeWidth}
                                        strokeOpacity={1}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                 </g>
                            )}
                        </>
                    );
                })()}
              </g>
            </svg>

            {annotations.map((ann, i) => {
              if (ann.isBurned) return null;

              const isHighlight = ann.type === 'highlight';
              
              if (isHighlight) {
                const x = ann.bbox[0] * scale;
                const y = ann.bbox[1] * scale;
                const w = ann.bbox[2] * scale;
                const h = ann.bbox[3] * scale;

                return (
                  <div 
                    key={ann.id || i}
                    id={`ann-${ann.id}`}
                    className="annotation-item absolute mix-blend-multiply group pointer-events-auto"
                    style={{
                      left: x,
                      top: y,
                      width: w,
                      height: h,
                      backgroundColor: ann.color || '#facc15',
                      opacity: ann.opacity ?? 0.4,
                      pointerEvents: activeTool === 'cursor' ? 'none' : 'auto',
                      cursor: activeTool === 'eraser' ? 'url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png), pointer' : 'default'
                    }}
                    onClick={(e) => {
                      if (activeTool === 'eraser' && ann.id) {
                        e.stopPropagation();
                        onDeleteAnnotation(ann);
                      }
                    }}
                  />
                );
              } else if (ann.type === 'note') {
                return (
                  <NoteMarker 
                    key={ann.id || i}
                    ann={ann}
                    scale={scale} // Pass current scale
                    activeTool={activeTool}
                    onDelete={onDeleteAnnotation}
                  />
                );
              }
              return null;
            })}
          </div>
        )}

        <div 
          ref={textLayerRef} 
          className={`textLayer ${activeTool === 'text' ? 'pointer-events-none' : ''}`}
          style={{ 
            zIndex: 10, 
            pointerEvents: activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'note' ? 'none' : 'auto',
            visibility: isVisible ? 'visible' : 'hidden'
          }}
        />
      </div>
    </div>
  );
};
// --- Main Component ---

export const PdfViewer: React.FC<Props> = ({ accessToken, fileId, fileName, fileParents, uid, onBack, fileBlob, isPopup, onToggleNavigation, onAuthError }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // --- Header Visibility State ---
  const lastScrollY = useRef(0);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Page Navigation State
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [tempPageInput, setTempPageInput] = useState("1");
  
  // Visual scale state (1.0 = 100% Zoom = Actual Size on 96DPI screen)
  const [scale, setScale] = useState(1.0); 
  
  // Selection & Tools State
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [activeTool, setActiveTool] = useState<'cursor' | 'text' | 'ink' | 'eraser' | 'note'>('cursor');
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'annotations' | 'settings' | 'fichamento' | 'ai'>('annotations');

  // Save Modal State
  const [showSaveModal, setShowSaveModal] = useState(false);
  
  // Permission Error Modal State (NEW)
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // Dictionary Modal State
  const [showDefinitionModal, setShowDefinitionModal] = useState(false);
  const [definition, setDefinition] = useState<{ word: string, meanings: string[], source: string, url?: string } | null>(null);
  const [isLoadingDefinition, setIsLoadingDefinition] = useState(false);

  // AI State
  const [aiExplanation, setAiExplanation] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Settings State
  const [pageColor, setPageColor] = useState("#ffffff");
  const [textColor, setTextColor] = useState("#000000");
  const [highlightColor, setHighlightColor] = useState("#4ade80"); 
  const [highlightOpacity, setHighlightOpacity] = useState(0.4);
  const [pageOffset, setPageOffset] = useState(1);
  const [disableColorFilter, setDisableColorFilter] = useState(false);
  const [detectColumns, setDetectColumns] = useState(false); // DISABLED by default per user request
  
  // Ink Settings
  const [inkColor, setInkColor] = useState("#22c55e"); // Green by default
  const [inkStrokeWidth, setInkStrokeWidth] = useState(20); // 20px by default
  const [inkOpacity, setInkOpacity] = useState(0.35); // Decreased default opacity (approx 15% reduction from 0.5)

  const isLocalFile = useMemo(() => {
    return fileId.startsWith('local-') || !accessToken;
  }, [fileId, accessToken]);

  // Update Page Title (Native Multi-Window Task Label)
  useEffect(() => {
    document.title = fileName;
    return () => {
      document.title = "Anotador de PDF Drive";
    };
  }, [fileName]);

  // Fichamento Text Generation
  const fichamentoText = useMemo(() => {
    // Filter annotations that have text
    const textAnnotations = annotations
      .filter(a => (a.type === 'highlight' || a.type === 'ink') && a.text && a.text.trim().length > 0)
      .sort((a, b) => {
        // Sort by page first
        if (a.page !== b.page) return a.page - b.page;
        // Then by vertical position (top to bottom)
        return a.bbox[1] - b.bbox[1];
      });

    if (textAnnotations.length === 0) return "";

    // DEDUPLICATION:
    const seenTexts = new Set<string>();
    const uniqueAnnotations: Annotation[] = [];

    textAnnotations.forEach(ann => {
      // Create a unique key for the content on this page
      const key = `${ann.page}|${ann.text}`;
      
      if (!seenTexts.has(key)) {
        seenTexts.add(key);
        uniqueAnnotations.push(ann);
      }
    });

    return uniqueAnnotations
      .map(a => `Página ${a.page + pageOffset - 1}\n${a.text}`)
      .join('\n\n');
  }, [annotations, pageOffset]);

  // Sidebar List Generation (Annotations Tab)
  const sidebarAnnotations = useMemo(() => {
    const sorted = [...annotations].sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return a.bbox[1] - b.bbox[1];
    });

    const uniqueList: Annotation[] = [];
    const seenTextOnPage = new Set<string>();

    sorted.forEach(ann => {
        // Always include items without text
        if (!ann.text) {
          uniqueList.push(ann);
          return;
        }

        // For text-based annotations, check duplicates based on page + text content
        const key = `${ann.page}|${ann.text}`;
        if (!seenTextOnPage.has(key)) {
            seenTextOnPage.add(key);
            uniqueList.push(ann);
        }
    });

    return uniqueList;
  }, [annotations]);

  const handleCopyFichamento = () => {
    navigator.clipboard.writeText(fichamentoText);
    alert("Fichamento copiado para a área de transferência!");
  };

  const handleDownloadFichamento = () => {
    const blob = new Blob([fichamentoText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fichamento - ${fileName}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDeleteAnnotation = useCallback(async (target: Annotation) => {
    // If burned, cannot delete
    if (target.isBurned) {
        alert("Anotações salvas no documento não podem ser removidas.");
        return;
    }

    // If it's a Note or Ink, try deleting by ID first
    if (target.type === 'ink' || target.type === 'note') {
         // Delete specific item (Ink or valid ID)
         if (target.id) {
            await deleteAnnotation(target.id);
            setAnnotations(prev => prev.filter(a => a.id !== target.id));
         }
    } else {
         // Delete all highlights with same text on this page (removes the "ghost" fragments of a multi-line highlight)
         const toDelete = annotations.filter(a => 
             a.page === target.page && a.text === target.text && a.type === target.type
         );
         
         for (const ann of toDelete) {
             if (ann.id) await deleteAnnotation(ann.id);
         }
         
         setAnnotations(prev => prev.filter(a => 
             !(a.page === target.page && a.text === target.text && a.type === target.type)
         ));
    }
  }, [annotations]);

  // Load PDF
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        let blob: Blob;

        // Use existing blob if available (prevents error on auth refresh/logout if file is already loaded)
        if (fileBlob) {
          blob = fileBlob;
        } else if (originalBlob) {
          blob = originalBlob;
        } else if (accessToken) {
          blob = await downloadDriveFile(accessToken, fileId);
        } else {
          // If we have no source at all (and no cached blob), we can't load.
          throw new Error("No file source provided");
        }
        
        // If reusing existing blob and doc is ready, skip
        if (originalBlob && pdfDoc) {
             return;
        }

        setLoading(true);

        if (mounted && !originalBlob) setOriginalBlob(blob);

        const arrayBuffer = await blob.arrayBuffer();
        
        // Use cMapUrl for better support of scanned/complex PDFs
        const pdf = await getDocument({ 
            data: arrayBuffer,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/standard_fonts/'
        }).promise;
        
        if (mounted) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          
          // 1. Load Local Annotations (IndexedDB)
          const localAnns = await loadAnnotations(uid, fileId);
          
          // 2. Load Embedded Annotations from PDF Metadata
          let embeddedAnns: Annotation[] = [];
          try {
            const metadata = await pdf.getMetadata();
            const info = metadata.info as any; // Cast to any to access dynamic properties
            
            // info.Keywords can be a string or array depending on PDF format
            let keywords = '';
            if (info && info.Keywords) {
                if (Array.isArray(info.Keywords)) {
                    keywords = info.Keywords.join(' ');
                } else {
                    keywords = info.Keywords;
                }
            }
            
            // Look for our data signature
            const prefix = "PDF_ANNOTATOR_DATA:::";
            if (keywords && keywords.includes(prefix)) {
                // Regex to extract the JSON string after the prefix
                // The data might be in the middle of other keywords, but usually we append it.
                // We use split to be safer if there's text after.
                const parts = keywords.split(prefix);
                if (parts.length > 1) {
                    const jsonStr = parts[1]; // Get everything after prefix
                    // Defensive parsing
                    try {
                        const parsed = JSON.parse(jsonStr);
                        if (Array.isArray(parsed)) {
                            // Ensure isBurned is true for these loaded annotations
                            // EXCEPT NOTES: Notes should remain interactive if we don't draw them
                            embeddedAnns = parsed.map(a => ({ 
                                ...a, 
                                isBurned: a.type !== 'note' 
                            }));
                            console.log(`[Metadata] ${embeddedAnns.length} anotações recuperadas do PDF.`);
                        }
                    } catch (e) {
                        console.warn("[Metadata] Falha ao parsear anotações embutidas", e);
                    }
                }
            }
          } catch (e) {
            console.warn("[Metadata] Erro ao ler metadados do PDF", e);
          }

          // Merge: Prefer embedded (burned) if ID conflicts, or just concat
          // Since local IDs are unique timestamps and embedded are old, they likely won't conflict unless re-opened same file session.
          const combined = [...embeddedAnns, ...localAnns];
          
          // Remove exact duplicates if any (based on ID if present)
          const uniqueAnns = Array.from(new Map(combined.map(item => [item.id, item])).values());
          
          setAnnotations(uniqueAnns);

          // Calculate Auto-Fit Width
          try {
            const page = await pdf.getPage(1);
            // Get viewport at standard scale to calculate fit
            // Use scale 1.0 (72DPI) as base, but we will adjust for screen DPI
            const viewport = page.getViewport({ scale: 1 });
            const containerWidth = window.innerWidth;
            const isMobile = containerWidth < 768;
            
            // On mobile, use minimal padding (10px). On desktop, larger padding (80px).
            const padding = isMobile ? 10 : 80; 
            
            // Adjust calculation so 100% = 96DPI (Actual Size on Screen)
            const effectiveWidth = viewport.width * CSS_UNITS;
            const autoScale = (containerWidth - padding) / effectiveWidth;
            
            // Limit max auto-scale to avoid extreme zoom on very small docs
            setScale(Math.min(autoScale, 2.0)); 
          } catch (e) {
            console.error("Error calculating auto-width:", e);
            setScale(1.0); // Fallback
          }
        }
      } catch (err: any) {
        console.error("Error loading PDF:", err);
        // Intercept 401 Unauthorized
        if (err.message === "Unauthorized" || (err.message && err.message.includes("401"))) {
            if (onAuthError) {
                onAuthError();
                // We do NOT set loading to false here to avoid flashing empty state before renewal overlay appears
                return;
            }
        }
        
        if (mounted) {
            alert(`Falha ao carregar PDF. Verifique se o arquivo é válido. (Erro: ${err instanceof Error ? err.message : String(err)})`);
            setLoading(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [accessToken, fileId, uid, fileBlob]); // Dependencies dictate when to run. We use state refs inside to be smart.

  // Helper to manually trigger Fit Width
  const handleFitWidth = async () => {
    if (!pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth;
      const isMobile = window.innerWidth < 768;
      const padding = isMobile ? 10 : 80;
      
      const effectiveWidth = viewport.width * CSS_UNITS;
      const newScale = (containerWidth - padding) / effectiveWidth;
      setScale(newScale);
    } catch (e) {
      console.error(e);
    }
  };

  // --- Scroll Detection Logic ---
  const handleScroll = useCallback(() => {
    if (scrollTimeoutRef.current) return;
    
    // Throttle scroll events (100ms)
    scrollTimeoutRef.current = setTimeout(() => {
        if (!containerRef.current) {
            scrollTimeoutRef.current = null;
            return;
        }

        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        
        // Find which page is most visible (closest to vertical center of viewport)
        const centerY = containerRect.top + (containerRect.height / 2);
        
        const pages = container.querySelectorAll('.pdf-page');
        let closestPage = currentPageNumber;
        let minDistance = Infinity;

        pages.forEach((page) => {
            const rect = page.getBoundingClientRect();
            // Distance from page center to viewport center
            const pageCenterY = rect.top + (rect.height / 2);
            const distance = Math.abs(pageCenterY - centerY);

            if (distance < minDistance) {
                minDistance = distance;
                const pageNum = parseInt(page.getAttribute('data-page-number') || '1');
                if (!isNaN(pageNum)) {
                    closestPage = pageNum;
                }
            }
        });

        if (closestPage !== currentPageNumber && !isEditingPage) {
            setCurrentPageNumber(closestPage);
        }

        scrollTimeoutRef.current = null;
    }, 100);
  }, [currentPageNumber, isEditingPage]);

  // --- Container Scroll Wrapper for Header Visibility ---
  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // 1. Run Page Detection (Throttled)
    handleScroll();

    // 2. Header Visibility Logic (Immediate)
    const currentScrollY = e.currentTarget.scrollTop;
    const diff = currentScrollY - lastScrollY.current;

    // Threshold to prevent jitter on small movements
    if (Math.abs(diff) > 20) {
        // Scrolling Down AND not at top -> Hide
        if (diff > 0 && currentScrollY > 100) {
            setIsHeaderVisible(false);
        } 
        // Scrolling Up -> Show
        else if (diff < 0) {
            setIsHeaderVisible(true);
        }
        lastScrollY.current = currentScrollY;
    }
  };

  // --- Jump to Page Logic ---
  const jumpToPage = useCallback((pageNumber: number) => {
     if (pageNumber < 1) pageNumber = 1;
     if (pageNumber > numPages) pageNumber = numPages;

     const pageEl = containerRef.current?.querySelector(`.pdf-page[data-page-number="${pageNumber}"]`);
     if (pageEl) {
         // Fix: Use 'auto' instead of 'smooth' to prevent rendering intermediate pages during scroll
         pageEl.scrollIntoView({ behavior: 'auto', block: 'start' });
         setCurrentPageNumber(pageNumber); // Optimistic update
     }
  }, [numPages]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(tempPageInput);
    if (!isNaN(page)) {
        jumpToPage(page);
    }
    setIsEditingPage(false);
  };
  
  // Handlers for "Dynamic Island"
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handlePagePrev = () => jumpToPage(currentPageNumber - 1);
  const handlePageNext = () => jumpToPage(currentPageNumber + 1);


  // Global Selection Handler (For Highlight)
  useEffect(() => {
    // Helper to process the selection logic
    const processSelection = () => {
      if (activeTool === 'text' || activeTool === 'ink' || activeTool === 'eraser' || activeTool === 'note') return;
      
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      
      const range = sel.getRangeAt(0);

      const text = sel.toString().trim();
      if (text.length === 0) {
        setSelection(null);
        return;
      }

      // Check if the selection is inside a PDF page
      // We use range.commonAncestorContainer to find the page
      let containerNode = range.commonAncestorContainer;
      if (containerNode.nodeType === 3) containerNode = containerNode.parentNode as Node;
      
      const pageElement = (containerNode as Element)?.closest('.pdf-page');
      if (!pageElement || !containerRef.current) {
        return;
      }

      const pageNumAttr = pageElement.getAttribute('data-page-number');
      if (!pageNumAttr) return;
      const pageNum = parseInt(pageNumAttr);

      const textLayer = pageElement.querySelector('.textLayer');
      if (!textLayer) return;

      const spans = Array.from(textLayer.querySelectorAll('span'));
      const relativeRects: { x: number; y: number; width: number; height: number }[] = [];
      
      // Calculate effective scale being rendered
      const effectiveScale = scale * CSS_UNITS;

      // ACTION 2.1 FIX: Multi-line selection robustness
      // Use Intersection Logic instead of sequential start/end matching
      for (const span of spans) {
          if (range.intersectsNode(span)) {
              const spanRange = document.createRange();
              spanRange.selectNodeContents(span);
              
              // Skip if strictly touching boundaries without overlap (optional optimization, logic handles it)
              if (range.compareBoundaryPoints(Range.END_TO_START, spanRange) >= 0) continue; // Range ends before span starts
              if (range.compareBoundaryPoints(Range.START_TO_END, spanRange) <= 0) continue; // Range starts after span ends

              const pdfX = parseFloat(span.dataset.pdfX || '0');
              const pdfTop = parseFloat(span.dataset.pdfTop || '0');
              const pdfW = parseFloat(span.dataset.pdfWidth || '0');
              const pdfH = parseFloat(span.dataset.pdfHeight || '0');

              if (pdfW > 0) {
                  let startRatio = 0;
                  let endRatio = 1;

                  // Calculate Start Ratio
                  if (range.compareBoundaryPoints(Range.START_TO_START, spanRange) > 0) {
                      // Selection starts inside this span
                      // Note: startContainer can be the text node OR the span itself
                      if (range.startContainer.nodeType === 3 && span.contains(range.startContainer)) {
                           const len = range.startContainer.textContent?.length || 1;
                           startRatio = range.startOffset / len;
                      } else if (range.startContainer === span) {
                           startRatio = range.startOffset === 0 ? 0 : 1;
                      }
                  }

                  // Calculate End Ratio
                  if (range.compareBoundaryPoints(Range.END_TO_END, spanRange) < 0) {
                      // Selection ends inside this span
                      if (range.endContainer.nodeType === 3 && span.contains(range.endContainer)) {
                           const len = range.endContainer.textContent?.length || 1;
                           endRatio = range.endOffset / len;
                      } else if (range.endContainer === span) {
                           endRatio = range.endOffset === 0 ? 0 : 1;
                      }
                  }

                  // Clamp ratios
                  startRatio = Math.max(0, Math.min(1, startRatio));
                  endRatio = Math.max(0, Math.min(1, endRatio));

                  if (endRatio > startRatio) {
                      // ACTION: Adobe-like visual correction
                      // Measure actual rendered width to handle font mismatches
                      const domRect = span.getBoundingClientRect();
                      // Convert to PDF Coordinate Space (Scale 1)
                      const visualW = domRect.width / effectiveScale;
                      
                      // Use the wider of the two (PDF logical vs Browser Visual)
                      // We add a tiny buffer (1%) to visual to ensure it covers edge pixels
                      const effectiveW = Math.max(pdfW, visualW * 1.01);
                      
                      // Geometric interpolation
                      const rectX = pdfX + (effectiveW * startRatio);
                      const rectW = effectiveW * (endRatio - startRatio);
                      
                      relativeRects.push({
                          x: rectX / effectiveScale,
                          y: pdfTop / effectiveScale,
                          width: rectW / effectiveScale,
                          height: pdfH / effectiveScale
                      });
                  }
              }
          }
      }

      // --- POPUP POSITIONING ---
      const boundingRect = range.getBoundingClientRect();
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      let popupY = boundingRect.top - containerRect.top + container.scrollTop - 60;
      let position: 'top' | 'bottom' = 'top';

      const gapAbove = boundingRect.top - containerRect.top;
      if (gapAbove < 60) {
         popupY = boundingRect.bottom - containerRect.top + container.scrollTop + 10;
         position = 'bottom';
      }

      const popupX = boundingRect.left - containerRect.left + container.scrollLeft + (boundingRect.width / 2);

      setSelection({
        page: pageNum,
        text: text,
        popupX,
        popupY,
        relativeRects,
        position
      });
    };

    // Debounce reference
    let selectionDebounce: ReturnType<typeof setTimeout>;

    const handleSelectionChange = () => {
      // Clear popup immediately if selection is gone
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        return;
      }

      // Debounce the processing for smooth dragging (catches cases where mouseup missed)
      clearTimeout(selectionDebounce);
      selectionDebounce = setTimeout(() => {
        processSelection();
      }, 300); 
    };

    const handleInteractionEnd = (e: Event) => {
      // Ignore interactions on UI elements
      if (e.target instanceof Element && e.target.closest('button, input, select, .ui-panel, textarea, .note-editor')) return;

      // Force immediate processing on interaction end (makes it feel instant)
      clearTimeout(selectionDebounce);
      // Small timeout to allow browser to finalize selection range properties
      setTimeout(() => processSelection(), 10);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleInteractionEnd);
    document.addEventListener('touchend', handleInteractionEnd);
    document.addEventListener('keyup', handleInteractionEnd);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleInteractionEnd);
      document.removeEventListener('touchend', handleInteractionEnd);
      document.removeEventListener('keyup', handleInteractionEnd);
      clearTimeout(selectionDebounce);
    };
  }, [activeTool, scale]);


  const createHighlight = async () => {
    if (!selection) return;

    const newAnns: Annotation[] = selection.relativeRects.map(rect => {
      return {
        // Ensure ID is generated for local storage
        id: `temp-hl-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        page: selection.page,
        bbox: [
          rect.x, 
          rect.y, 
          rect.width, 
          rect.height
        ], // Already normalized
        type: 'highlight',
        text: selection.text,
        color: highlightColor,
        opacity: highlightOpacity
      };
    });

    setAnnotations(prev => [...prev, ...newAnns]);
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    saveAnnotationsList(newAnns);
  };

  const handleAddNote = useCallback(async (ann: Annotation) => {
    setAnnotations(prev => [...prev, ann]);
    saveAnnotationsList([ann]);
    setActiveTool('cursor'); // Reset tool after adding
  }, []);

  const addInkAnnotation = useCallback(async (ann: Annotation) => {
    // ann already has temp id from PdfPage and normalized points
    setAnnotations(prev => [...prev, ann]);
    saveAnnotationsList([ann]);
  }, []);

  const saveAnnotationsList = async (anns: Annotation[]) => {
    setIsSaving(true);
    try {
      for (const ann of anns) {
         // Now saves to IndexedDB locally
         await saveAnnotation(uid, fileId, ann);
      }
    } catch (err) {
      console.error("Failed to save annotation locally", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!originalBlob) {
      alert("Erro: Arquivo ou sessão inválida.");
      return;
    }

    if (isLocalFile) {
        // Local files just execute save immediately (download)
        executeSave('local');
    } else {
        // Drive files show choice dialog
        setShowSaveModal(true);
    }
  };

  const executeSave = async (mode: 'local' | 'overwrite' | 'copy') => {
    if (!originalBlob) return;
    
    setIsExporting(true);
    setShowSaveModal(false);

    try {
      const existingPdfBytes = await originalBlob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(existingPdfBytes);
      const pages = pdfDoc.getPages();

      // --- 1. EMBED ANNOTATIONS DATA INTO PDF METADATA ---
      const annotationsToBurn = annotations.map(a => ({
        ...a,
        isBurned: true 
      }));
      const serializedData = JSON.stringify(annotationsToBurn);
      pdfDoc.setKeywords([`PDF_ANNOTATOR_DATA:::${serializedData}`]);

      const hexToRgb = (hex: string) => {
        const bigint = parseInt(hex.replace('#', ''), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return rgb(r / 255, g / 255, b / 255);
      };

      for (const ann of annotations) {
        if (ann.isBurned) continue;
        if (ann.page > pages.length) continue;
        const page = pages[ann.page - 1]; 
        const { height } = page.getSize();
        
        if (ann.type === 'highlight') {
          const rectX = ann.bbox[0];
          const rectY = ann.bbox[1];
          const rectW = ann.bbox[2];
          const rectH = ann.bbox[3];
          const pdfY = height - rectY - rectH;

          page.drawRectangle({
            x: rectX,
            y: pdfY,
            width: rectW,
            height: rectH,
            color: hexToRgb(ann.color || '#facc15'),
            opacity: ann.opacity ?? 0.4,
          });
        } else if (ann.type === 'ink' && ann.points && ann.points.length > 0) {
           const color = hexToRgb(ann.color || '#ff0000');
           const width = ann.strokeWidth || 3; 
           
           for (let i = 0; i < ann.points.length - 1; i++) {
             const p1 = ann.points[i];
             const p2 = ann.points[i+1];
             page.drawLine({
               start: { x: p1[0], y: height - p1[1] },
               end: { x: p2[0], y: height - p2[1] },
               thickness: width,
               color: color,
               opacity: ann.opacity ?? 0.5
             });
           }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const newPdfBlob = new Blob([pdfBytes as any], { type: 'application/pdf' });

      if (mode === 'local') {
        const url = window.URL.createObjectURL(newPdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Anotado - ${fileName}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        alert("Arquivo baixado com sucesso!");
      } else {
        if (!accessToken) throw new Error("Sem permissão de acesso ao Drive");
        
        if (mode === 'overwrite') {
            try {
                // Try to UPDATE existing file (Preserve ID & Permissions)
                await updateDriveFile(accessToken, fileId, newPdfBlob);
                alert(`Sucesso! O arquivo original foi atualizado.`);
                setOriginalBlob(newPdfBlob); // Update local blob state
                
                // Note: We don't close the file or refresh because 
                // we want to keep the user context.
            } catch (err: any) {
                console.warn("Overwrite failed, checking permissions...", err);
                
                // Check if it's a permission/write access error
                const isPermError = err.message.toLowerCase().includes('write access') || 
                                    err.message.toLowerCase().includes('permission') ||
                                    err.message.includes('403');
                                    
                if (isPermError) {
                    // Substituição do confirm nativo pelo Modal
                    setShowPermissionModal(true);
                } else {
                    throw err; // Re-throw unknown errors
                }
            }
        } else {
            // COPY MODE
            const nameWithoutExt = fileName.replace(/\.pdf$/i, '');
            const newFileName = `${nameWithoutExt} (Anotado).pdf`;
            await uploadFileToDrive(accessToken, newPdfBlob, newFileName, fileParents);
            alert(`Cópia salva com sucesso como: ${newFileName}`);
        }
      }

    } catch (err: any) {
      console.error("Export error:", err);
      if (err.message === "Unauthorized" || (err.message && err.message.includes("401"))) {
         if (onAuthError) {
             onAuthError();
             return;
         }
      }
      alert("Falha ao salvar: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };


  const scrollToAnnotation = (ann: Annotation) => {
    const pageEl = document.querySelector(`.pdf-page[data-page-number="${ann.page}"]`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // We don't flash ID highlight for burned items as they are not DOM elements anymore
      if (ann.id && !ann.isBurned) {
        setTimeout(() => {
          const el = document.getElementById(`ann-${ann.id}`);
          if (el) {
            el.style.outline = '2px solid red';
            setTimeout(() => el.style.outline = 'none', 1000);
          }
        }, 500);
      }
    }
    // Close sidebar on mobile after clicking
    if (window.innerWidth < 768) setShowSidebar(false);
  };

  const filterValues = useMemo(() => {
    const hexToRgb = (hex: string) => {
      const bigint = parseInt(hex.slice(1), 16);
      return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
    };

    const [tr, tg, tb] = hexToRgb(textColor);
    const [br, bg, bb] = hexToRgb(pageColor);

    const rScale = (br - tr) / 255;
    const gScale = (bg - tg) / 255;
    const bScale = (bb - tb) / 255;

    const rOffset = tr / 255;
    const gOffset = tg / 255;
    const bOffset = tb / 255;

    return `
      ${rScale} 0 0 0 ${rOffset}
      0 ${gScale} 0 0 ${gOffset}
      0 0 ${bScale} 0 ${bOffset}
      0 0 0 1 0
    `;
  }, [textColor, pageColor]);

  // Handle Text Copy from Selection Menu
  const handleCopyText = async () => {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      // Optional: Maybe a small toast or just close. Closing is standard behavior.
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Handle Define Word
  const handleDefine = async () => {
    if (!selection) return;
    
    // Close selection immediately for better UX
    const word = selection.text;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    
    // Reset and open modal
    setDefinition(null);
    setShowDefinitionModal(true);
    setIsLoadingDefinition(true);

    try {
        const def = await fetchDefinition(word);
        if (def) {
            setDefinition(def);
        } else {
            setDefinition({
                word: word,
                meanings: ["Definição não encontrada."],
                source: ""
            });
        }
    } catch (e: any) {
        setDefinition({
            word: word,
            meanings: [e.message || "Erro ao buscar definição."],
            source: ""
        });
    } finally {
        setIsLoadingDefinition(false);
    }
  };

  const handleExplainAI = async () => {
    if (!selection) return;
    const textToExplain = selection.text;
    
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    
    // Open AI Tab
    setSidebarTab('ai');
    setShowSidebar(true);
    setIsAiLoading(true);
    setAiExplanation("");

    try {
        // Validate API Key existence to prevent crash
        if (!process.env.API_KEY) {
            throw new Error("Chave de API não configurada (API_KEY missing).");
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Explique este texto: "${textToExplain}"`,
            config: {
              systemInstruction: `Você recebe um trecho de texto selecionado pelo usuário no meu leitor de PDF. 
Sua tarefa é explicar esse trecho de forma clara, objetiva e enxuta, sem enrolação.

Instruções:
- Explique o trecho como se estivesse conversando com alguém que gosta de praticidade.
- Vá direto ao ponto.
- Não repita o texto original.
- Não invente informação.
- Se o trecho estiver confuso, resuma e organize.
- Traga significado histórico, contexto ou lógica interna quando fizer sentido.
- Se houver jargões, traduza para linguagem simples.
- Pode usar leveza e humor rápido, mas sem exagerar.
- Mantenha a explicação curta e útil, como se fosse para alguém cansado de textos prolixos.

Formato da resposta:
1. Explicação direta do trecho.
2. Se houver, destaque o ponto central em uma frase final curta.`
            }
        });
        
        // Safety check for empty response
        if (response && response.text) {
             setAiExplanation(response.text);
        } else {
             setAiExplanation("A IA analisou o texto mas não retornou uma explicação textual.");
        }
    } catch (error: any) {
        console.error("AI Error:", error);
        
        // Enhanced Error Handling
        let errorMsg = "Erro ao conectar com a IA.";
        
        if (error.message) {
            if (error.message.includes("403") || error.message.includes("API key") || error.message.includes("PERMISSION_DENIED")) {
                errorMsg = "Acesso negado: A chave de API foi revogada ou é inválida (Erro 403).";
            } else if (error.message.includes("429")) {
                errorMsg = "Muitas requisições. Por favor, aguarde alguns instantes.";
            } else if (error.message.includes("500") || error.message.includes("503")) {
                errorMsg = "Serviço de IA temporariamente indisponível.";
            } else {
                errorMsg = `Erro: ${error.message}`;
            }
        }
        
        setAiExplanation(errorMsg);
    } finally {
        setIsAiLoading(false);
    }
  };


  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg text-text">
        <Loader2 className="animate-spin h-10 w-10 text-brand mx-auto mb-4" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-text relative transition-colors duration-300">
      <svg style={{ width: 0, height: 0, position: 'absolute', overflow: 'hidden' }} aria-hidden="true">
        <filter id="pdf-recolor">
          <feColorMatrix type="matrix" values={filterValues} />
        </filter>
      </svg>

      {/* Permission Error Modal */}
      {showPermissionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setShowPermissionModal(false)}
              className="absolute top-4 right-4 text-text-sec hover:text-text p-1 rounded-full hover:bg-white/5"
            >
              <X size={20} />
            </button>
            
            <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
               <Lock size={24} />
            </div>

            <h3 className="text-xl font-bold text-text mb-2">Permissão Negada</h3>
            <p className="text-text-sec mb-6 text-sm leading-relaxed">
               O Google Drive bloqueou a substituição deste arquivo. Você provavelmente não tem permissão de escrita nesta pasta da organização.
            </p>

            <div className="flex flex-col gap-3">
               <button 
                  onClick={() => {
                      setShowPermissionModal(false);
                      executeSave('copy');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-brand text-bg rounded-xl font-bold hover:brightness-110 transition-all"
               >
                  <Copy size={18} />
                  Salvar como Cópia
               </button>
               <button 
                  onClick={() => setShowPermissionModal(false)}
                  className="w-full py-3 text-text-sec hover:text-text font-medium"
               >
                  Cancelar
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Dictionary Modal */}
      {showDefinitionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setShowDefinitionModal(false)}
              className="absolute top-4 right-4 text-text-sec hover:text-text p-1 rounded-full hover:bg-white/5"
            >
              <X size={20} />
            </button>
            
            {isLoadingDefinition ? (
               <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="animate-spin text-brand mb-3" size={32} />
                  <p className="text-text-sec">Buscando definição...</p>
               </div>
            ) : definition ? (
               <div className="flex flex-col h-full max-h-[70vh]">
                  <div className="mb-4">
                    <h3 className="text-2xl font-serif font-bold text-text mb-1 capitalize">{definition.word}</h3>
                    {definition.source && <span className="text-xs text-text-sec uppercase tracking-wide block">Fonte: {definition.source}</span>}
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4">
                     <ul className="space-y-3">
                       {definition.meanings.map((m, i) => (
                         <li key={i} className="text-sm md:text-base leading-relaxed text-text">
                           {m}
                         </li>
                       ))}
                     </ul>
                  </div>

                  <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-border">
                    {/* Botão de Link da Fonte (Wiki) */}
                    {definition.url && (
                        <a 
                          href={definition.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-surface hover:bg-white/5 border border-border rounded-lg text-sm font-medium transition-colors"
                        >
                           <ExternalLink size={16} />
                           Ler artigo completo
                        </a>
                    )}
                    
                    {/* Botão de Fallback - Google */}
                    <a 
                      href={`https://www.google.com/search?q=definição+${encodeURIComponent(definition.word)}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand rounded-lg text-sm font-medium transition-colors"
                    >
                       <Search size={16} />
                       Pesquisar no Google
                    </a>
                  </div>
               </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Save Options Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button 
              onClick={() => setShowSaveModal(false)}
              className="absolute top-4 right-4 text-text-sec hover:text-text p-1 rounded-full hover:bg-white/5"
            >
              <X size={20} />
            </button>
            
            <h3 className="text-xl font-bold text-text mb-2">Salvar Arquivo</h3>
            <p className="text-text-sec mb-6 leading-relaxed">
              Como deseja salvar as alterações no Google Drive?
            </p>

            <div className="space-y-3">
              <button 
                onClick={() => executeSave('copy')}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-brand/10 border border-brand/20 hover:bg-brand/20 transition-all text-left group"
              >
                <div className="bg-brand text-bg p-3 rounded-lg shrink-0">
                  <Copy size={24} />
                </div>
                <div>
                  <div className="font-bold text-brand group-hover:underline">Salvar como Cópia</div>
                  <div className="text-sm text-text-sec">Cria um novo arquivo e mantém o original intacto. (Recomendado)</div>
                </div>
              </button>

              <button 
                onClick={() => executeSave('overwrite')}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:bg-red-500/10 hover:border-red-500/30 transition-all text-left group"
              >
                <div className="bg-surface border border-border text-text-sec p-3 rounded-lg shrink-0 group-hover:text-red-500 group-hover:border-red-500/30">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <div className="font-bold text-text group-hover:text-red-500">Substituir Original</div>
                  <div className="text-sm text-text-sec">Tenta atualizar o arquivo existente. (Pode falhar se você não for o dono)</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimal Header */}
      <div className={`h-14 bg-surface/80 backdrop-blur border-b border-border flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm transition-all duration-300 ease-in-out ${isHeaderVisible ? 'translate-y-0 opacity-100' : '-translate-y-full -mt-14 opacity-0 pointer-events-none'}`}>
        <div className="flex items-center gap-3 min-w-0">
          {!isPopup && onToggleNavigation && (
            <button 
                onClick={onToggleNavigation}
                className="p-2 -ml-2 hover:bg-white/10 rounded-full transition text-text mr-1"
                title="Menu"
            >
                <Menu size={20} />
            </button>
          )}
          <button 
            onClick={onBack} 
            className={`p-2 hover:bg-white/10 rounded-full transition text-text ${!onToggleNavigation ? '-ml-2' : ''}`}
            title={isPopup ? "Fechar Janela" : "Voltar e Fechar"}
          >
            {isPopup ? <X size={20} /> : <ArrowLeft size={20} />}
          </button>
          <div className="flex flex-col min-w-0">
             <h1 className="text-text font-medium truncate text-sm md:text-base">{fileName}</h1>
             <span className="text-xs text-text-sec">{numPages} páginas</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {isSaving && <Loader2 size={16} className="animate-spin text-brand" />}
            
            {/* Save Button */}
            <button 
                onClick={handleSave}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium hover:brightness-110 transition-all shadow-lg ${isLocalFile ? 'bg-surface border border-border text-text hover:bg-white/5' : 'bg-brand text-bg shadow-brand/20'}`}
                title={isLocalFile ? "Baixar PDF com anotações" : "Salvar alterações no Drive"}
            >
                {isLocalFile ? <Download size={16} /> : <Save size={16} />}
                <span className="hidden sm:inline">{isLocalFile ? "Baixar" : "Salvar"}</span>
            </button>

            <button 
                onClick={() => setShowSidebar(true)} 
                className="p-2 hover:bg-white/10 rounded-full transition text-text"
            >
                <Menu size={20} />
            </button>
        </div>
      </div>

      {/* Main Content Area: Viewer + Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Sidebar Overlay (Mobile & Desktop) */}
        {showSidebar && (
            <div className="absolute inset-0 z-[60] flex justify-end">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSidebar(false)} />
                <div className="relative w-80 bg-surface h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-200">
                    
                    {/* Sidebar Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border">
                        <span className="font-semibold text-text">Menu</span>
                        <button onClick={() => setShowSidebar(false)} className="text-text-sec hover:text-text">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Sidebar Tabs */}
                    <div className="flex border-b border-border">
                        <button 
                            onClick={() => setSidebarTab('annotations')}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${sidebarTab === 'annotations' ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                        >
                            Anotações
                        </button>
                        <button 
                            onClick={() => setSidebarTab('fichamento')}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${sidebarTab === 'fichamento' ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                        >
                            Fichamento
                        </button>
                        <button 
                            onClick={() => setSidebarTab('ai')}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${sidebarTab === 'ai' ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                        >
                            IA
                        </button>
                        <button 
                            onClick={() => setSidebarTab('settings')}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${sidebarTab === 'settings' ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                        >
                            Ajustes
                        </button>
                    </div>

                    {/* Sidebar Content */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {sidebarTab === 'annotations' ? (
                            <div className="space-y-3">
                                {sidebarAnnotations.length === 0 && (
                                    <div className="text-center text-text-sec py-10 text-sm">
                                        Nenhuma anotação. <br/> Selecione texto ou desenhe para começar.
                                    </div>
                                )}
                                {sidebarAnnotations.map((ann, idx) => (
                                    <div 
                                        key={ann.id || idx}
                                        onClick={() => scrollToAnnotation(ann)}
                                        className="bg-bg p-3 rounded-lg border border-border hover:border-brand cursor-pointer group transition-colors relative"
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: ann.color || (ann.type === 'highlight' ? highlightColor : '#fef9c3') }} />
                                            <span className="text-xs text-text-sec uppercase font-bold tracking-wider">Pág {ann.page + pageOffset - 1}</span>
                                            {ann.type === 'ink' && <span className="text-xs text-text-sec bg-surface px-1 rounded border border-border">Desenho</span>}
                                            {ann.type === 'note' && <span className="text-xs text-text-sec bg-surface px-1 rounded border border-border">Nota</span>}
                                            {ann.isBurned && <span className="text-[10px] bg-surface border border-border px-1 rounded text-text-sec ml-auto flex items-center gap-1" title="Salvo no documento"><Lock size={8}/> Salvo</span>}
                                        </div>
                                        <p className="text-sm text-text line-clamp-2 leading-relaxed">
                                            {ann.text || (ann.type === 'ink' ? "Desenho manual" : "Sem conteúdo")}
                                        </p>
                                        {!ann.isBurned && (
                                          <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                handleDeleteAnnotation(ann);
                                            }}
                                            className="absolute top-2 right-2 text-text-sec hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                            title="Excluir"
                                          >
                                            <X size={14} />
                                          </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : sidebarTab === 'fichamento' ? (
                            <div className="space-y-4 animate-in fade-in flex flex-col h-full">
                                <div className="bg-bg rounded-lg border border-border p-3 flex items-center gap-2 text-text-sec text-xs">
                                  <FileText size={16} />
                                  <p>Este fichamento contém os trechos de texto destacados e textos detectados nos desenhos.</p>
                                </div>
                                
                                <textarea 
                                  value={fichamentoText}
                                  readOnly
                                  className="flex-1 w-full bg-bg border border-border rounded-lg p-3 text-sm text-text resize-none focus:outline-none focus:border-brand custom-scrollbar leading-relaxed"
                                  placeholder="Nenhum trecho de texto detectado..."
                                />
                                
                                <div className="flex gap-2 shrink-0">
                                  <button 
                                    onClick={handleCopyFichamento}
                                    disabled={!fichamentoText}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg hover:bg-white/5 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Copy size={16} />
                                    Copiar
                                  </button>
                                  <button 
                                    onClick={handleDownloadFichamento}
                                    disabled={!fichamentoText}
                                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-brand text-bg rounded-lg hover:brightness-110 transition-colors text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <Download size={16} />
                                    Baixar .txt
                                  </button>
                                </div>
                            </div>
                        ) : sidebarTab === 'ai' ? (
                            <div className="space-y-4 animate-in fade-in h-full flex flex-col">
                                <div className="bg-bg rounded-lg border border-border p-3 flex items-center gap-2 text-text-sec text-xs">
                                    <Sparkles size={16} />
                                    <p>Explicação gerada pela IA Gemini sobre o texto selecionado.</p>
                                </div>
                                
                                {isAiLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full">
                                        <Loader2 className="animate-spin text-brand mb-3" size={32} />
                                        <p className="text-text-sec text-sm">Analisando texto...</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-y-auto bg-bg border border-border rounded-lg p-3 text-sm text-text custom-scrollbar leading-relaxed whitespace-pre-wrap">
                                        {aiExplanation || "Selecione um texto e clique em 'Explicar' para ver a mágica acontecer."}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6 animate-in fade-in">
                                {/* Page Numbering Settings */}
                                <div className="space-y-3">
                                    <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2">
                                        <Hash size={14} /> Paginação
                                    </h4>
                                    <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                        <label className="text-sm text-text">Página Inicial</label>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            value={pageOffset} 
                                            onChange={(e) => setPageOffset(Math.max(1, parseInt(e.target.value) || 1))} 
                                            className="bg-transparent border-b border-border w-16 text-right focus:outline-none focus:border-brand" 
                                        />
                                    </div>
                                    <p className="text-xs text-text-sec">Ajusta a numeração exibida (ex: se o artigo começa na pág. 180).</p>
                                </div>

                                <div className="w-full h-px bg-border my-2"></div>

                                {/* Color Settings */}
                                <div className="space-y-3">
                                    <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2">
                                        <PaintBucket size={14} /> Leitura
                                    </h4>

                                    {/* Toggle for Original Mode (Disable Filters) */}
                                    <div className="flex items-center justify-between bg-bg p-3 rounded-lg border border-border mb-2">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm text-text font-medium flex items-center gap-2">
                                                {disableColorFilter ? <Eye size={16} className="text-brand"/> : <ImageOff size={16} className="text-text-sec"/>}
                                                Modo Original
                                            </span>
                                            <span className="text-[10px] text-text-sec leading-tight">Melhora nitidez em scans ruins</span>
                                        </div>
                                        <button 
                                            onClick={() => setDisableColorFilter(!disableColorFilter)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${disableColorFilter ? 'bg-brand' : 'bg-surface border border-text-sec'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${disableColorFilter ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    {/* Toggle for Column Detection (NEW) */}
                                    <div className="flex items-center justify-between bg-bg p-3 rounded-lg border border-border mb-2">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm text-text font-medium flex items-center gap-2">
                                                <Columns size={16} className="text-text-sec"/>
                                                Colunas / Pág. Dupla
                                            </span>
                                            <span className="text-[10px] text-text-sec leading-tight">Evita seleção através do meio</span>
                                        </div>
                                        <button 
                                            onClick={() => setDetectColumns(!detectColumns)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${detectColumns ? 'bg-brand' : 'bg-surface border border-text-sec'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${detectColumns ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    {/* Color controls - Dimmed if Original Mode is ON */}
                                    <div className={`space-y-3 transition-opacity duration-300 ${disableColorFilter ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
                                        
                                        {/* Theme Presets */}
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                        <button 
                                            onClick={() => { setPageColor('#ffffff'); setTextColor('#000000'); }}
                                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-brand bg-white text-black transition-all"
                                            title="Tema Claro"
                                        >
                                            <div className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center font-serif font-bold text-xs bg-white text-black">A</div>
                                            <span className="text-[10px] font-medium text-gray-900">Claro</span>
                                        </button>

                                        <button 
                                            onClick={() => { setPageColor('#0f172a'); setTextColor('#ffffff'); }}
                                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-brand bg-[#0f172a] text-white transition-all"
                                            title="Tema Escuro (Azulado)"
                                        >
                                            <div className="w-6 h-6 rounded-full border border-gray-700 flex items-center justify-center font-serif font-bold text-xs bg-[#0f172a] text-white">A</div>
                                            <span className="text-[10px] font-medium text-gray-200">Escuro</span>
                                        </button>

                                        <button 
                                            onClick={() => { setPageColor('#000000'); setTextColor('#ffffff'); }}
                                            className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-brand bg-black text-white transition-all"
                                            title="Tema OLED"
                                        >
                                            <div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center font-serif font-bold text-xs bg-black text-white">A</div>
                                            <span className="text-[10px] font-medium text-gray-200">OLED</span>
                                        </button>
                                        </div>

                                        <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                            <label className="text-sm text-text">Fundo</label>
                                            <input type="color" value={pageColor} onChange={(e) => setPageColor(e.target.value)} className="bg-transparent border-0 w-8 h-8 cursor-pointer" />
                                        </div>
                                        <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                            <label className="text-sm text-text">Texto</label>
                                            <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="bg-transparent border-0 w-8 h-8 cursor-pointer" />
                                        </div>
                                        <button 
                                        onClick={() => { setPageColor('#ffffff'); setTextColor('#000000'); }}
                                        className="w-full text-xs text-text-sec hover:text-text border border-border rounded py-1"
                                        >
                                        Resetar Cores
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2">
                                        <Highlighter size={14} /> Destaque
                                    </h4>
                                    <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                        <label className="text-sm text-text">Cor</label>
                                        <div className="flex gap-1">
                                            {['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa'].map(c => (
                                                <button 
                                                    key={c}
                                                    onClick={() => setHighlightColor(c)}
                                                    className={`w-6 h-6 rounded-full border border-border ${highlightColor === c ? 'ring-2 ring-text' : ''}`}
                                                    style={{ backgroundColor: c }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-bg p-2 rounded-lg border border-border">
                                        <div className="flex justify-between mb-1">
                                            <label className="text-sm text-text">Opacidade</label>
                                            <span className="text-xs text-text-sec">{Math.round(highlightOpacity * 100)}%</span>
                                        </div>
                                        <input 
                                            type="range" min="0.1" max="1" step="0.1" 
                                            value={highlightOpacity} 
                                            onChange={(e) => setHighlightOpacity(parseFloat(e.target.value))}
                                            className="w-full accent-brand"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2">
                                        <Pen size={14} /> Caneta
                                    </h4>
                                    <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                        <label className="text-sm text-text">Cor</label>
                                        <input type="color" value={inkColor} onChange={(e) => setInkColor(e.target.value)} className="bg-transparent border-0 w-8 h-8 cursor-pointer" />
                                    </div>
                                    <div className="bg-bg p-2 rounded-lg border border-border">
                                        <div className="flex justify-between mb-1">
                                            <label className="text-sm text-text">Espessura</label>
                                            <span className="text-xs text-text-sec">{inkStrokeWidth}px</span>
                                        </div>
                                        <input 
                                            type="range" min="1" max="50" step="1" 
                                            value={inkStrokeWidth} 
                                            onChange={(e) => setInkStrokeWidth(parseInt(e.target.value))}
                                            className="w-full accent-brand"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* PDF Pages Container */}
        <div 
            className="flex-1 overflow-auto bg-gray-100/50 relative flex justify-center" 
            ref={containerRef}
            onScroll={handleContainerScroll}
            onClick={(e) => {
              if (activeTool === 'note') {
                  const target = e.target as HTMLElement;
                  // If clicking empty space between pages (gray background)
                  if (target === containerRef.current) {
                      // Do nothing
                  }
              }
            }}
            style={{ overflowAnchor: 'none' }} // PREVENTS SCROLL JUMPING ON DOM CHANGES
        >

            {/* --- THE ISLAND (Floating Control Bar) --- */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-2 rounded-full shadow-2xl flex items-center gap-4 text-white animate-in slide-in-from-bottom-4 fade-in duration-500">
              {/* Tools Group */}
              <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full">
                <button onClick={() => setActiveTool('cursor')} className={`p-2 rounded-full transition-all ${activeTool === 'cursor' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/10 text-zinc-400'}`} title="Selecionar">
                  <MousePointer2 size={18} />
                </button>
                <button onClick={() => setActiveTool('note')} className={`p-2 rounded-full transition-all ${activeTool === 'note' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/10 text-zinc-400'}`} title="Nota">
                  <StickyNote size={18} />
                </button>
                <button onClick={() => setActiveTool('ink')} className={`p-2 rounded-full transition-all ${activeTool === 'ink' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/10 text-zinc-400'}`} title="Desenhar">
                  <Pen size={18} />
                </button>
                <button onClick={() => setActiveTool('eraser')} className={`p-2 rounded-full transition-all ${activeTool === 'eraser' ? 'bg-white text-black shadow-sm' : 'hover:bg-white/10 text-zinc-400'}`} title="Apagar">
                  <Eraser size={18} />
                </button>
              </div>
              
              <div className="w-px h-6 bg-white/10"></div>

              {/* Page Group */}
              <div className="flex items-center gap-2">
                <button onClick={handlePagePrev} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><ChevronLeft size={20}/></button>
                
                {isEditingPage ? (
                  <form onSubmit={handlePageSubmit} className="flex items-center">
                    <input 
                      autoFocus
                      type="number"
                      min="1"
                      max={numPages}
                      value={tempPageInput}
                      onChange={(e) => setTempPageInput(e.target.value)}
                      onBlur={() => setIsEditingPage(false)}
                      className="w-10 bg-transparent text-center font-mono text-sm font-bold border-b border-white outline-none appearance-none text-white p-0 m-0"
                    />
                  </form>
                ) : (
                  <button 
                    onClick={() => {
                      setTempPageInput(currentPageNumber.toString());
                      setIsEditingPage(true);
                    }}
                    className="font-mono text-sm font-bold min-w-[3ch] text-center hover:bg-white/10 rounded px-1 transition-colors"
                  >
                    {currentPageNumber}
                  </button>
                )}
                
                <span className="text-zinc-500 text-xs">/ {numPages}</span>
                <button onClick={handlePageNext} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><ChevronRight size={20}/></button>
              </div>

              <div className="w-px h-6 bg-white/10"></div>

              {/* Zoom Group */}
              <div className="flex items-center gap-2 pr-2">
                <button 
                  onClick={handleFitWidth} 
                  className="p-1 hover:bg-white/10 rounded-full text-zinc-300"
                  title="Ajustar à Largura"
                >
                  <MoveHorizontal size={16}/>
                </button>

                <button onClick={handleZoomOut} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><Minus size={16}/></button>
                <span className="text-xs font-medium min-w-[3ch] text-center">{Math.round(scale * 100)}%</span>
                <button onClick={handleZoomIn} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><Plus size={16}/></button>
              </div>
            </div>

            {/* Floating Selection Menu - MOVED INSIDE SCROLL CONTAINER */}
            {selection && (
              <div 
                className="absolute z-50 flex flex-col gap-1 animate-in fade-in zoom-in duration-200"
                style={{ 
                  left: selection.popupX,
                  top: selection.popupY,
                  transform: 'translateX(-50%)'
                }}
              >
                <div className="bg-surface shadow-2xl rounded-xl p-1.5 flex items-center gap-1 border border-border">
                    <button 
                      onClick={createHighlight}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
                    >
                      <Highlighter size={16} className="text-green-400" />
                      Destacar
                    </button>
                    
                    <div className="w-px h-6 bg-border mx-1"></div>

                    {/* NEW AI EXPLAIN BUTTON */}
                    <button 
                      onClick={handleExplainAI}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
                      title="Explicar com IA"
                    >
                      <Sparkles size={16} className="text-purple-400" />
                      Explicar
                    </button>

                    <div className="w-px h-6 bg-border mx-1"></div>

                    {/* DICTIONARY BUTTON */}
                    <button 
                      onClick={handleDefine}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
                      title="Definir palavra"
                    >
                      <Book size={16} className="text-yellow-500" />
                      Definir
                    </button>

                    <div className="w-px h-6 bg-border mx-1"></div>

                    {/* COPY BUTTON */}
                    <button 
                      onClick={handleCopyText}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
                      title="Copiar texto"
                    >
                      <Copy size={16} className="text-red-500" />
                      Copiar
                    </button>

                    <div className="w-px h-6 bg-border mx-1"></div>

                    <button 
                      onClick={() => setSelection(null)}
                      className="p-2 hover:bg-red-500/10 text-text-sec hover:text-red-500 rounded-lg transition-colors"
                    >
                      <X size={16} />
                    </button>
                </div>
                {/* Arrow Pointer */}
                {selection.position === 'top' ? (
                   <div className="w-3 h-3 bg-surface border-b border-r border-border transform rotate-45 absolute -bottom-1.5 left-1/2 -translate-x-1/2"></div>
                ) : (
                   <div className="w-3 h-3 bg-surface border-t border-l border-border transform rotate-45 absolute -top-1.5 left-1/2 -translate-x-1/2"></div>
                )}
              </div>
            )}

          <div className="py-8 md:py-10 px-2 md:px-0">
            {Array.from({ length: numPages }, (_, i) => (
              <PdfPage 
                key={i + 1}
                pageNumber={i + 1}
                pdfDoc={pdfDoc!}
                // Apply CSS_UNITS correction here.
                // scale 1.0 = 96DPI (Actual Size).
                // PDF requires scale to be relative to Points (72DPI).
                // So we multiply by (96/72).
                scale={scale * CSS_UNITS} 
                filterValues={filterValues}
                annotations={annotations.filter(a => a.page === i + 1)}
                activeTool={activeTool}
                inkColor={inkColor}
                inkStrokeWidth={inkStrokeWidth}
                inkOpacity={inkOpacity}
                disableColorFilter={disableColorFilter}
                detectColumns={detectColumns} // Pass new prop
                onPageClick={() => {}} // Legacy prop unused for new notes
                onAddNote={handleAddNote}
                onDeleteAnnotation={handleDeleteAnnotation}
                onAddInk={addInkAnnotation}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
