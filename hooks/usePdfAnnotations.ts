
import { useState, useEffect, useCallback } from 'react';
import { Annotation } from '../types';
import { loadAnnotations, saveAnnotation, deleteAnnotation as deleteLocalAnnotation } from '../services/storageService';
import { PDFDocumentProxy } from 'pdfjs-dist';

export const usePdfAnnotations = (fileId: string, uid: string, pdfDoc: PDFDocumentProxy | null) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Carregar Anotações (Local + PDF Metadata)
  useEffect(() => {
    if (!pdfDoc) return;

    const load = async () => {
      // 1. Load Local
      const localAnns = await loadAnnotations(uid, fileId);

      // 2. Load Embedded from PDF Metadata
      let embeddedAnns: Annotation[] = [];
      try {
        const metadata = await pdfDoc.getMetadata();
        const info = metadata.info as any;
        let keywords = '';
        
        if (info && info.Keywords) {
          keywords = Array.isArray(info.Keywords) ? info.Keywords.join(' ') : info.Keywords;
        }

        const prefix = "PDF_ANNOTATOR_DATA:::";
        if (keywords && keywords.includes(prefix)) {
          const parts = keywords.split(prefix);
          if (parts.length > 1) {
            const parsed = JSON.parse(parts[1]);
            if (Array.isArray(parsed)) {
              // Marca como 'burned' (não editável visualmente, exceto notas)
              embeddedAnns = parsed.map(a => ({ 
                ...a, 
                isBurned: a.type !== 'note' 
              }));
            }
          }
        }
      } catch (e) {
        console.warn("Erro ao ler metadados:", e);
      }

      // 3. Robust Merge & Deduplication
      // Strategy: Keep all Local annotations. Only keep Embedded annotations if they don't visually overlap
      // significantly with a local one. This prevents "Ghost" duplicates after saving.
      
      const merged: Annotation[] = [...localAnns];
      
      embeddedAnns.forEach(embedded => {
         // Check if this embedded annotation is already present in local (by ID or visual match)
         const isDuplicate = merged.some(local => {
            // Exact ID match
            if (local.id && embedded.id && local.id === embedded.id) return true;

            // Visual Match (Same page, same type)
            if (local.page === embedded.page && local.type === embedded.type) {
                // Check Bounds Tolerance (2.0 pixels)
                const delta = 2.0; 
                const boxMatch = 
                    Math.abs(local.bbox[0] - embedded.bbox[0]) < delta &&
                    Math.abs(local.bbox[1] - embedded.bbox[1]) < delta &&
                    Math.abs(local.bbox[2] - embedded.bbox[2]) < delta &&
                    Math.abs(local.bbox[3] - embedded.bbox[3]) < delta;
                
                if (!boxMatch) return false;

                // Check Text Content (if exists)
                if (local.text || embedded.text) {
                    const localText = (local.text || '').trim();
                    const embeddedText = (embedded.text || '').trim();
                    // If text differs significantly, treat as different
                    return localText === embeddedText;
                }

                // If no text (e.g. ink without OCR), assume duplicate if box matches
                return true;
            }
            return false;
         });

         if (!isDuplicate) {
            merged.push(embedded);
         }
      });

      setAnnotations(merged);
    };

    load();
  }, [fileId, uid, pdfDoc]);

  // Adicionar Anotação
  const addAnnotation = useCallback(async (ann: Annotation) => {
    setAnnotations(prev => [...prev, ann]);
    try {
      await saveAnnotation(uid, fileId, ann);
    } catch (e) {
      console.error("Erro ao salvar anotação localmente:", e);
    }
  }, [fileId, uid]);

  // Remover Anotação
  const removeAnnotation = useCallback(async (target: Annotation) => {
    if (target.isBurned) {
      alert("Anotações salvas no documento não podem ser removidas.");
      return;
    }

    let idsToDelete: string[] = [];

    if (target.type === 'ink' || target.type === 'note') {
      if (target.id) idsToDelete.push(target.id);
    } else {
      // Para highlights, remove fragmentos relacionados (mesmo texto e página)
      const related = annotations.filter(a => 
        a.page === target.page && a.text === target.text && a.type === target.type
      );
      related.forEach(a => { if (a.id) idsToDelete.push(a.id); });
    }

    // Update State
    setAnnotations(prev => prev.filter(a => !idsToDelete.includes(a.id || '')));

    // Update Storage
    for (const id of idsToDelete) {
      await deleteLocalAnnotation(id);
    }
  }, [annotations]);

  return { annotations, setAnnotations, addAnnotation, removeAnnotation };
};
