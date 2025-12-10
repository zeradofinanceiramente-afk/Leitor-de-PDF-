
// --- Dynamic Font Loader ---
const attemptedFonts = new Set<string>();

/**
 * Tenta baixar automaticamente uma fonte do Google Fonts se ela não estiver no sistema.
 * Remove prefixos de subset (Ex: "ABCDE+Roboto-Bold" -> "Roboto")
 */
export const tryAutoDownloadFont = (rawFontName: string) => {
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

// --- Custom Text Renderer with De-Fragmentation & Geometry Normalization ---
export const renderCustomTextLayer = (textContent: any, container: HTMLElement, viewport: any, detectColumns: boolean) => {
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

    const yDiff = a.y - b.y;
    
    // Tolerance for grouping lines (roughly 20% of font size)
    if (Math.abs(yDiff) < (Math.min(a.fontSize, b.fontSize) * 0.4)) { 
       return a.x - b.x; 
    }
    // Otherwise, top lines come first (smaller Y values first)
    return yDiff; 
  });

  // 3. Merge / De-fragmentation Pass
  const mergedItems: any[] = [];
  if (rawItems.length > 0) {
    let current = rawItems[0];
    
    for (let i = 1; i < rawItems.length; i++) {
      const next = rawItems[i];
      
      const sameLine = Math.abs(current.y - next.y) < (current.fontSize * 0.5);
      const sameFont = current.fontName === next.fontName && Math.abs(current.fontSize - next.fontSize) < 2;
      
      const expectedNextX = current.x + current.width;
      const gap = next.x - expectedNextX;
      
      const spaceWidth = current.fontSize * 0.25;
      
      const maxGap = detectColumns ? (current.fontSize * 1.5) : (current.fontSize * 4.0);
      
      const isConsecutive = gap > -(current.fontSize * 0.5) && gap < maxGap;
      const isWhitespace = current.str.trim().length === 0 || next.str.trim().length === 0;

      if (sameLine && sameFont && (isConsecutive || isWhitespace)) {
        if (gap > spaceWidth && !current.str.endsWith(' ') && !next.str.startsWith(' ')) {
             current.str += ' ';
        }

        current.str += next.str;
        current.width = (next.x + next.width) - current.x;
      } else {
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
    if (!part.str || part.str.length === 0) return;

    const span = document.createElement('span');
    span.textContent = part.str;

    let fontAscent = 0.85; 
    let fontFamily = "'Google Sans', 'Inter', sans-serif";
    
    if (textContent.styles && part.fontName && textContent.styles[part.fontName]) {
        const style = textContent.styles[part.fontName];
        if (style.ascent) fontAscent = style.ascent;
        
        if (style.fontFamily) {
             fontFamily = style.fontFamily;
             if (style.fontFamily.toLowerCase().includes('times') || style.fontFamily.toLowerCase().includes('serif')) {
                 fontAscent = 0.89;
             }
             if (!document.fonts.check(`12px "${style.fontFamily}"`)) {
                 tryAutoDownloadFont(style.fontFamily);
             }
        }
    }

    const calculatedTop = part.y - (part.fontSize * fontAscent);
    const verticalPaddingFactor = 0.20; 
    const paddingPx = part.fontSize * verticalPaddingFactor;

    span.style.left = `${part.x}px`;
    span.style.top = `${calculatedTop - paddingPx}px`;
    span.style.fontSize = `${part.fontSize}px`;
    span.style.fontFamily = fontFamily;
    
    span.style.paddingTop = `${paddingPx}px`;
    span.style.paddingBottom = `${paddingPx}px`;
    span.style.boxSizing = 'content-box'; 

    span.style.position = 'absolute';
    span.style.transformOrigin = '0% 0%';
    span.style.whiteSpace = 'pre';
    span.style.cursor = 'text';
    span.style.color = 'transparent';
    span.style.lineHeight = '1.0'; 
    span.style.pointerEvents = 'all';

    span.dataset.pdfX = part.x.toString();
    span.dataset.pdfTop = calculatedTop.toString();
    span.dataset.pdfWidth = part.width.toString();
    span.dataset.pdfHeight = part.fontSize.toString();

    container.appendChild(span);
    itemsToMeasure.push({ span, part });

    if (index < mergedItems.length - 1) {
        const nextPart = mergedItems[index + 1];
        const verticalDiff = nextPart.y - part.y;
        
        if (verticalDiff > part.fontSize * 0.5) {
             container.appendChild(document.createElement('br'));
        } 
        else if (detectColumns && (nextPart.y < part.y - 100)) {
             container.appendChild(document.createElement('br'));
             container.appendChild(document.createElement('br'));
        }
        else if (nextPart.x > (part.x + part.width)) {
             const gap = nextPart.x - (part.x + part.width);
             if (gap > part.fontSize * 0.1) {
                 container.appendChild(document.createTextNode(' '));
             }
        }
    }
  });

  // 5. Normalize Width (Second Pass: Batch Measure & Correct)
  const naturalWidths = itemsToMeasure.map(item => item.span.getBoundingClientRect().width);

  itemsToMeasure.forEach((item, index) => {
      const { span, part } = item;
      const naturalWidth = naturalWidths[index];
      const targetWidth = part.width; 

      let finalScale = part.scaleX;

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
