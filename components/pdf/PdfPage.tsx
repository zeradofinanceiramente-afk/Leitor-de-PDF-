
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Loader2, Sparkles, ScanLine, X, Save } from 'lucide-react';
import { renderCustomTextLayer } from '../../utils/pdfRenderUtils';
import { usePageOcr } from '../../hooks/usePageOcr';
import { NoteMarker } from './NoteMarker';
import { usePdfContext } from '../../context/PdfContext';
import { PDFDocumentProxy } from 'pdfjs-dist';

interface PdfPageProps {
  pageNumber: number;
  filterValues: string;
  pdfDoc?: PDFDocumentProxy | null;
}

export const PdfPage: React.FC<PdfPageProps> = ({ 
  pageNumber, filterValues, pdfDoc 
}) => {
  const { 
    scale, activeTool, settings, 
    annotations, addAnnotation, removeAnnotation 
  } = usePdfContext();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  
  const renderTaskRef = useRef<any>(null);
  const textItemsRef = useRef<any[]>([]);

  const [rendered, setRendered] = useState(false);
  const [hasText, setHasText] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [pageProxy, setPageProxy] = useState<any>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [draftNote, setDraftNote] = useState<{x: number, y: number, text: string} | null>(null);

  // FIX: Dark Mode Detection for Highlight Visibility
  const isDarkPage = useMemo(() => {
    if (settings.disableColorFilter) return false;
    
    const hex = settings.pageColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 2), 16);
    const b = parseInt(hex.substring(4, 2), 16);
    // Standard luminance formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    return brightness < 128; // Returns true if background is dark
  }, [settings.pageColor, settings.disableColorFilter]);

  // Intersection Observer
  useEffect(() => {
    const element = pageContainerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: '50% 0px', threshold: 0 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Load Page Proxy
  useEffect(() => {
    if (!pdfDoc) return;
    let active = true;
    pdfDoc.getPage(pageNumber).then(page => {
      if (active) setPageProxy(page);
    });
    return () => { active = false; };
  }, [pdfDoc, pageNumber]);

  // Dimensions
  const pageDimensions = useMemo(() => {
    if (!pageProxy) return null;
    const viewport = pageProxy.getViewport({ scale: scale });
    return { width: viewport.width, height: viewport.height };
  }, [pageProxy, scale]);

  // Render Canvas
  useEffect(() => {
    if (!isVisible || !pageDimensions || !pageProxy || !canvasRef.current) return;
    let active = true;

    const render = async () => {
      try {
        const viewport = pageProxy.getViewport({ scale: scale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        if (renderTaskRef.current) {
             try { renderTaskRef.current.cancel(); } catch {}
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const task = pageProxy.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (renderTaskRef.current !== task || !active) return;

        const textContent = await pageProxy.getTextContent();
        if (!active) return;
        textItemsRef.current = textContent.items;
        
        const hasContent = textContent.items.length > 5;
        setHasText(hasContent);

        if (textLayerRef.current) {
           textLayerRef.current.style.width = `${viewport.width}px`;
           textLayerRef.current.style.height = `${viewport.height}px`;
           if (hasContent) renderCustomTextLayer(textContent, textLayerRef.current, viewport, settings.detectColumns);
           else textLayerRef.current.innerHTML = '';
        }
        setRendered(true);
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') console.error(e);
      }
    };
    render();
    return () => { 
        active = false; 
        if (renderTaskRef.current) try { renderTaskRef.current.cancel(); } catch {}
    };
  }, [pageProxy, scale, isVisible, settings.detectColumns]);

  // OCR
  const { status: ocrStatus, progress: ocrProgress, ocrData } = usePageOcr({
    pageNumber, canvasRef, rendered, hasText, isVisible, scale
  });

  // Inject OCR
  useEffect(() => {
    if (ocrStatus === 'done' && ocrData.length > 0 && textLayerRef.current) {
        const container = textLayerRef.current;
        container.innerHTML = '';
        const dpr = window.devicePixelRatio || 1;
        
        textItemsRef.current = ocrData.map(w => ({
            str: w.text,
            customRect: {
                x: (w.bbox.x0 / dpr) / scale,
                y: (w.bbox.y0 / dpr) / scale,
                w: ((w.bbox.x1 - w.bbox.x0) / dpr) / scale,
                h: ((w.bbox.y1 - w.bbox.y0) / dpr) / scale
            }
        }));

        ocrData.forEach(word => {
            const span = document.createElement('span');
            span.textContent = word.text + ' ';
            const x = word.bbox.x0 / dpr;
            const y = word.bbox.y0 / dpr;
            const w = (word.bbox.x1 - word.bbox.x0) / dpr;
            const h = (word.bbox.y1 - word.bbox.y0) / dpr;

            span.style.left = `${x}px`;
            span.style.top = `${y}px`;
            span.style.width = `${w}px`;
            span.style.height = `${h}px`;
            span.style.fontSize = `${h}px`;
            span.style.position = 'absolute';
            span.style.color = 'transparent';
            span.style.cursor = 'text';
            span.style.lineHeight = '1';
            span.style.whiteSpace = 'pre';
            container.appendChild(span);
        });
    }
  }, [ocrStatus, ocrData, scale]);

  const pointsToSvgPath = (points: number[][]) => {
    if (points.length === 0) return '';
    return points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (activeTool !== 'note' || !pageContainerRef.current) return;
    if ((e.target as HTMLElement).closest('.annotation-item')) return;
    if ((e.target as HTMLElement).closest('.note-editor')) return;

    const rect = pageContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setDraftNote({ x, y, text: '' });
  };

  const handleSaveDraftNote = () => {
    if (draftNote?.text.trim()) {
      addAnnotation({
        id: `temp-note-${Date.now()}`,
        page: pageNumber,
        bbox: [draftNote.x, draftNote.y, 0, 0],
        type: 'note',
        text: draftNote.text,
        color: '#fef9c3',
        createdAt: new Date().toISOString()
      });
    }
    setDraftNote(null);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool !== 'ink' || !pageContainerRef.current) return;
    e.preventDefault(); 
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = pageContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setIsDrawing(true);
    setCurrentPoints([[x, y]]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || activeTool !== 'ink' || !pageContainerRef.current) return;
    e.preventDefault();
    const rect = pageContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setCurrentPoints(prev => [...prev, [x, y]]);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || activeTool !== 'ink') return;
    setIsDrawing(false);
    if (currentPoints.length > 1) {
       addAnnotation({
         id: `temp-ink-${Date.now()}`,
         page: pageNumber,
         bbox: [0, 0, 0, 0],
         type: 'ink',
         points: currentPoints,
         color: settings.inkColor,
         strokeWidth: settings.inkStrokeWidth,
         opacity: settings.inkOpacity,
       });
    }
    setCurrentPoints([]);
  };

  const layoutWidth = pageDimensions ? pageDimensions.width : '100%';
  const layoutHeight = pageDimensions ? pageDimensions.height : `${800 * scale}px`;

  // Filter annotations for this page
  const pageAnnotations = annotations.filter(a => a.page === pageNumber);

  return (
    <div 
      ref={pageContainerRef}
      className={`pdf-page relative mb-4 mx-auto transition-cursor select-none ${activeTool === 'text' ? 'cursor-text' : activeTool === 'ink' ? 'cursor-crosshair touch-none' : activeTool === 'note' ? 'cursor-copy' : activeTool === 'eraser' ? 'cursor-[url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png),_pointer]' : ''}`}
      data-page-number={pageNumber}
      style={{ width: layoutWidth, height: layoutHeight, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
      onClick={handleContainerClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
         {!hasText && rendered && isVisible && (
           <div className="absolute -top-6 left-0 flex items-center gap-2 text-xs text-text-sec opacity-90">
              {ocrStatus === 'loading' ? (
                <div className="flex items-center gap-2"><Loader2 size={12} className="animate-spin text-brand" /> <span className="text-brand font-medium">OCR: {ocrProgress}%</span></div>
              ) : ocrStatus === 'done' ? (
                 <><Sparkles size={12} className="text-yellow-400" /> <span>IA Texto</span></>
              ) : (
                 <><ScanLine size={12} /> <span>Imagem</span></>
              )}
           </div>
         )}
         
         <canvas 
            ref={canvasRef}
            style={{ 
               filter: settings.disableColorFilter ? 'none' : 'url(#pdf-recolor)',
               display: 'block', 
               visibility: isVisible ? 'visible' : 'hidden'
            }} 
         />
         
         {draftNote && (
            <div className="absolute z-50 animate-in zoom-in" style={{ left: draftNote.x * scale, top: draftNote.y * scale }}>
               <div className="bg-yellow-100 p-2 rounded w-64 shadow-xl border border-yellow-300">
                  <textarea 
                     ref={noteInputRef}
                     autoFocus
                     value={draftNote.text}
                     onChange={e => setDraftNote({...draftNote, text: e.target.value})}
                     className="bg-transparent w-full text-sm outline-none text-yellow-900"
                     placeholder="Sua nota..."
                  />
                  <div className="flex justify-end gap-2 mt-2">
                     <button onClick={() => setDraftNote(null)}><X size={16} className="text-yellow-800"/></button>
                     <button onClick={handleSaveDraftNote}><Save size={16} className="text-yellow-800"/></button>
                  </div>
               </div>
            </div>
         )}

         {isVisible && (
            <div className="absolute inset-0 pointer-events-none">
               <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 15 }}>
                  <g transform={`scale(${scale})`}>
                     {pageAnnotations.filter(a => a.type === 'ink' && !a.isBurned).map(ann => (
                        <path 
                           key={ann.id}
                           d={pointsToSvgPath(ann.points || [])}
                           stroke={ann.color}
                           strokeWidth={ann.strokeWidth || 3}
                           fill="none"
                           strokeLinecap="round"
                           strokeLinejoin="round"
                           opacity={ann.opacity}
                           className={activeTool === 'eraser' ? 'pointer-events-auto cursor-pointer' : ''}
                           onClick={e => { if(activeTool === 'eraser') { e.stopPropagation(); removeAnnotation(ann); }}}
                        />
                     ))}
                     {isDrawing && (
                        <path 
                           d={pointsToSvgPath(currentPoints)}
                           stroke={settings.inkColor}
                           strokeWidth={settings.inkStrokeWidth}
                           fill="none"
                           strokeLinecap="round"
                           strokeLinejoin="round"
                           opacity={settings.inkOpacity}
                        />
                     )}
                  </g>
               </svg>
               {pageAnnotations.filter(a => !a.isBurned).map((ann, i) => {
                  if (ann.type === 'highlight') {
                     return (
                        <div 
                           key={ann.id || i}
                           // FIX: Use 'mix-blend-screen' for dark backgrounds to ensure visibility, 'multiply' for light
                           className={`absolute pointer-events-auto ${isDarkPage ? 'mix-blend-screen' : 'mix-blend-multiply'}`}
                           style={{
                              left: ann.bbox[0] * scale,
                              top: ann.bbox[1] * scale,
                              width: ann.bbox[2] * scale,
                              height: ann.bbox[3] * scale,
                              backgroundColor: ann.color,
                              opacity: ann.opacity,
                              cursor: activeTool === 'eraser' ? 'url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png), pointer' : 'default'
                           }}
                           onClick={e => { if(activeTool === 'eraser') { e.stopPropagation(); removeAnnotation(ann); }}}
                        />
                     )
                  }
                  if (ann.type === 'note') {
                     return <NoteMarker key={ann.id || i} ann={ann} scale={scale} activeTool={activeTool} onDelete={removeAnnotation} />
                  }
               })}
            </div>
         )}

         <div 
            ref={textLayerRef}
            className={`textLayer ${activeTool === 'text' ? 'pointer-events-none' : ''}`}
            style={{ 
               zIndex: 10,
               pointerEvents: ['ink', 'eraser', 'note'].includes(activeTool) ? 'none' : 'auto',
               visibility: isVisible ? 'visible' : 'hidden'
            }}
         />
      </div>
    </div>
  );
};
