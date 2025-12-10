
import React, { useState, useEffect, useRef } from 'react';
import { SelectionState } from '../components/pdf/SelectionMenu';

interface UsePdfSelectionProps {
  activeTool: string;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const usePdfSelection = ({ activeTool, scale, containerRef }: UsePdfSelectionProps) => {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  
  // Debounce ref
  const selectionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const processSelection = () => {
      // Ignorar se estiver desenhando ou usando outras ferramentas
      if (activeTool !== 'cursor') return;

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

      // Verificar se está dentro de uma página PDF
      let containerNode = range.commonAncestorContainer;
      if (containerNode.nodeType === 3) containerNode = containerNode.parentNode as Node;
      
      const pageElement = (containerNode as Element)?.closest('.pdf-page');
      if (!pageElement || !containerRef.current) return;

      const pageNumAttr = pageElement.getAttribute('data-page-number');
      if (!pageNumAttr) return;
      const pageNum = parseInt(pageNumAttr);

      const textLayer = pageElement.querySelector('.textLayer');
      if (!textLayer) return;

      // Calcular retângulos relativos
      const spans = Array.from(textLayer.querySelectorAll('span'));
      const relativeRects: { x: number; y: number; width: number; height: number }[] = [];
      
      // FIX: Removido 'cssUnits' que causava erro de escala (~2.32x menor). 
      // O 'scale' já é suficiente pois as coordenadas 'pdfX' no DOM já estão escaladas pelo viewport.
      const effectiveScale = scale; 

      for (const span of spans) {
        if (range.intersectsNode(span)) {
          const spanRange = document.createRange();
          spanRange.selectNodeContents(span);

          const pdfX = parseFloat(span.dataset.pdfX || '0');
          const pdfTop = parseFloat(span.dataset.pdfTop || '0');
          const pdfW = parseFloat(span.dataset.pdfWidth || '0');
          const pdfH = parseFloat(span.dataset.pdfHeight || '0');

          if (pdfW > 0) {
            // Lógica de interseção parcial
            let startRatio = 0;
            let endRatio = 1;

            if (range.compareBoundaryPoints(Range.START_TO_START, spanRange) > 0) {
                if (range.startContainer === span || span.contains(range.startContainer)) {
                     const len = range.startContainer.textContent?.length || 1;
                     startRatio = range.startOffset / len;
                }
            }
            if (range.compareBoundaryPoints(Range.END_TO_END, spanRange) < 0) {
                 if (range.endContainer === span || span.contains(range.endContainer)) {
                      const len = range.endContainer.textContent?.length || 1;
                      endRatio = range.endOffset / len;
                 }
            }
            
            startRatio = Math.max(0, Math.min(1, startRatio));
            endRatio = Math.max(0, Math.min(1, endRatio));

            if (endRatio > startRatio) {
                // Adobe-like Correction (Visual vs Logical width)
                const domRect = span.getBoundingClientRect();
                const visualW = domRect.width / effectiveScale;
                const effectiveW = Math.max(pdfW, visualW * 1.01);

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

      // Posicionamento do Popup
      const boundingRect = range.getBoundingClientRect();
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      
      let popupY = boundingRect.top - containerRect.top + container.scrollTop - 60;
      let position: 'top' | 'bottom' = 'top';

      if ((boundingRect.top - containerRect.top) < 60) {
         popupY = boundingRect.bottom - containerRect.top + container.scrollTop + 10;
         position = 'bottom';
      }

      const popupX = boundingRect.left - containerRect.left + container.scrollLeft + (boundingRect.width / 2);

      setSelection({
        page: pageNum,
        text,
        popupX,
        popupY,
        relativeRects,
        position
      });
    };

    const handleSelectionChange = () => {
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
      selectionDebounce.current = setTimeout(processSelection, 300);
    };

    const handleInteractionEnd = (e: Event) => {
      // Ignorar cliques na UI
      if (e.target instanceof Element && e.target.closest('button, input, textarea, .ui-panel')) return;
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
      setTimeout(processSelection, 10);
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
      if (selectionDebounce.current) clearTimeout(selectionDebounce.current);
    };
  }, [activeTool, scale]);

  return { selection, setSelection };
};
