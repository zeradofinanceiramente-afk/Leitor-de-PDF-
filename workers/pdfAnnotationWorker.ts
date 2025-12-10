import { PDFDocument, rgb } from 'https://aistudiocdn.com/pdf-lib@^1.17.1';

// Definição de tipos mínimos para o worker
interface Annotation {
  id?: string;
  page: number;
  bbox: [number, number, number, number];
  text?: string;
  type: 'highlight' | 'note' | 'ink';
  points?: number[][];
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  isBurned?: boolean;
}

self.onmessage = async (e: MessageEvent) => {
  const { pdfBytes, annotations } = e.data as { pdfBytes: ArrayBuffer, annotations: Annotation[] };

  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // 1. EMBED ANNOTATIONS DATA INTO PDF METADATA
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
                const p2 = ann.points[i + 1];
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

    const newPdfBytes = await pdfDoc.save();
    
    // Post back the result
    // Cast self to any to avoid window vs worker context issues with Transferable overload
    (self as any).postMessage({ success: true, pdfBytes: newPdfBytes }, [newPdfBytes.buffer]);

  } catch (error: any) {
    (self as any).postMessage({ success: false, error: error.message });
  }
};