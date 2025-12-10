import React, { useState, useEffect } from 'react';
import { MousePointer2, StickyNote, Pen, Eraser, ChevronLeft, ChevronRight, MoveHorizontal, Minus, Plus } from 'lucide-react';
import { usePdfContext } from '../../context/PdfContext';

interface Props {
  onFitWidth: () => void;
}

export const PdfToolbar: React.FC<Props> = ({ onFitWidth }) => {
  const { 
    activeTool, setActiveTool,
    currentPage, jumpToPage, numPages,
    scale, setScale
  } = usePdfContext();

  const [isEditingPage, setIsEditingPage] = useState(false);
  const [tempPageInput, setTempPageInput] = useState("1");

  useEffect(() => {
    if (!isEditingPage) {
      setTempPageInput(currentPage.toString());
    }
  }, [currentPage, isEditingPage]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(tempPageInput);
    if (!isNaN(page) && page >= 1 && page <= numPages) {
      jumpToPage(page);
    } else {
      setTempPageInput(currentPage.toString());
    }
    setIsEditingPage(false);
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-2 rounded-full shadow-2xl flex items-center gap-4 text-white animate-in slide-in-from-bottom-4 fade-in duration-500">
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

      <div className="flex items-center gap-2">
        <button onClick={() => jumpToPage(currentPage - 1)} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><ChevronLeft size={20}/></button>
        
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
              setTempPageInput(currentPage.toString());
              setIsEditingPage(true);
            }}
            className="font-mono text-sm font-bold min-w-[3ch] text-center hover:bg-white/10 rounded px-1 transition-colors"
          >
            {currentPage}
          </button>
        )}
        
        <span className="text-zinc-500 text-xs">/ {numPages}</span>
        <button onClick={() => jumpToPage(currentPage + 1)} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><ChevronRight size={20}/></button>
      </div>

      <div className="w-px h-6 bg-white/10"></div>

      <div className="flex items-center gap-2 pr-2">
        <button onClick={onFitWidth} className="p-1 hover:bg-white/10 rounded-full text-zinc-300" title="Ajustar à Largura"><MoveHorizontal size={16}/></button>

        <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><Minus size={16}/></button>
        <span className="text-xs font-medium min-w-[3ch] text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1 hover:bg-white/10 rounded-full text-zinc-300"><Plus size={16}/></button>
      </div>
    </div>
  );
};
