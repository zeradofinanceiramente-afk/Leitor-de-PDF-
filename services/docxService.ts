
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType, ImageRun } from "docx";

// Helper para converter Base64 string para Uint8Array para o docx
const base64ToUint8Array = (base64String: string) => {
    // Strip metadata prefix if present (e.g. "data:image/png;base64,")
    const base64 = base64String.split(',')[1] || base64String;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// Mapeia o alinhamento do Tiptap para o do docx
const mapAlignment = (align: string): AlignmentType => {
  switch (align) {
    case 'center': return AlignmentType.CENTER;
    case 'right': return AlignmentType.RIGHT;
    case 'justify': return AlignmentType.JUSTIFIED;
    default: return AlignmentType.LEFT;
  }
};

// Processa nós de texto e marcas (negrito, itálico, cor, fonte)
const processTextNode = (node: any): TextRun => {
  const marks = node.marks || [];
  const isBold = marks.some((m: any) => m.type === 'bold');
  const isItalic = marks.some((m: any) => m.type === 'italic');
  const isUnderline = marks.some((m: any) => m.type === 'underline');
  const isStrike = marks.some((m: any) => m.type === 'strike');
  
  // Extrair cor, tamanho da fonte e família da fonte
  const textStyle = marks.find((m: any) => m.type === 'textStyle');
  const color = textStyle?.attrs?.color;
  
  // docx usa "half-points" (ex: 24 = 12pt). Tiptap salva em pt.
  let size = 24; // Padrão 12pt
  if (textStyle?.attrs?.fontSize) {
      const parsed = parseInt(textStyle.attrs.fontSize);
      if (!isNaN(parsed)) size = parsed * 2;
  }

  // Fonte
  let font = "Times New Roman";
  if (textStyle?.attrs?.fontFamily) {
      // Remove quotes if present
      font = textStyle.attrs.fontFamily.replace(/['"]/g, '');
  }

  return new TextRun({
    text: node.text,
    bold: isBold,
    italics: isItalic,
    underline: isUnderline ? { type: UnderlineType.SINGLE, color: "000000" } : undefined,
    strike: isStrike,
    color: color ? color.replace('#', '') : "000000",
    size: size,
    font: font
  });
};

export const generateDocxBlob = async (editorJSON: any): Promise<Blob> => {
  const docChildren: any[] = [];
  const content = editorJSON.content || [];

  for (const node of content) {
    // PARAGRAPH
    if (node.type === 'paragraph') {
      const children = (node.content || []).map(processTextNode);
      
      docChildren.push(new Paragraph({
        children: children,
        alignment: mapAlignment(node.attrs?.textAlign),
        spacing: { after: 200 } // Espaço padrão após parágrafo
      }));
    } 
    // HEADING
    else if (node.type === 'heading') {
      const children = (node.content || []).map(processTextNode);
      let level = HeadingLevel.HEADING_1;
      if (node.attrs?.level === 2) level = HeadingLevel.HEADING_2;
      if (node.attrs?.level === 3) level = HeadingLevel.HEADING_3;
      
      docChildren.push(new Paragraph({
        children: children,
        heading: level,
        alignment: mapAlignment(node.attrs?.textAlign),
        spacing: { before: 240, after: 120 }
      }));
    }
    // IMAGEM
    else if (node.type === 'image') {
       if (node.attrs?.src && node.attrs.src.startsWith('data:image')) {
           try {
               const imageBuffer = base64ToUint8Array(node.attrs.src);
               // Simple heuristic for dimensions: default to 400px width if style not parsed
               // docx image needs transformation (width/height)
               docChildren.push(new Paragraph({
                   children: [
                       new ImageRun({
                           data: imageBuffer,
                           transformation: {
                               width: 400,
                               height: 300 // Aspect ratio is hard to guess without Image object loading, assume generic
                           }
                       })
                   ],
                   alignment: mapAlignment(node.attrs?.textAlign || 'center')
               }));
           } catch (e) {
               console.warn("Failed to process image for docx export", e);
           }
       }
    }
    // LISTAS (Bullet / Ordered)
    else if (node.type === 'bulletList' || node.type === 'orderedList') {
        const isOrdered = node.type === 'orderedList';
        
        (node.content || []).forEach((listItem: any) => {
             (listItem.content || []).forEach((p: any) => {
                 const children = (p.content || []).map(processTextNode);
                 
                 // Simulação simples de lista, já que numeração complexa requer config separada
                 docChildren.push(new Paragraph({
                     children: children,
                     bullet: { level: 0 } // Level 0 funciona para ambos visualmente no modo básico
                 }));
             });
        });
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children: docChildren,
    }],
  });

  return await Packer.toBlob(doc);
};
