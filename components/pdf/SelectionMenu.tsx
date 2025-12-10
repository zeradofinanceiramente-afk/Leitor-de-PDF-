import React from 'react';
import { Highlighter, Sparkles, Book, Copy, X } from 'lucide-react';

export interface SelectionState {
  page: number;
  text: string;
  popupX: number;
  popupY: number;
  relativeRects: { x: number; y: number; width: number; height: number }[];
  position: 'top' | 'bottom';
}

interface Props {
  selection: SelectionState;
  onHighlight: () => void;
  onExplainAi: () => void;
  onDefine: () => void;
  onCopy: () => void;
  onClose: () => void;
}

export const SelectionMenu: React.FC<Props> = ({
  selection,
  onHighlight,
  onExplainAi,
  onDefine,
  onCopy,
  onClose
}) => {
  return (
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
            onClick={onHighlight}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
          >
            <Highlighter size={16} className="text-green-400" />
            Destacar
          </button>
          
          <div className="w-px h-6 bg-border mx-1"></div>

          <button 
            onClick={onExplainAi}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
            title="Explicar com IA"
          >
            <Sparkles size={16} className="text-purple-400" />
            Explicar
          </button>

          <div className="w-px h-6 bg-border mx-1"></div>

          <button 
            onClick={onDefine}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
            title="Definir palavra"
          >
            <Book size={16} className="text-yellow-500" />
            Definir
          </button>

          <div className="w-px h-6 bg-border mx-1"></div>

          <button 
            onClick={onCopy}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm font-medium text-text transition-colors"
            title="Copiar texto"
          >
            <Copy size={16} className="text-red-500" />
            Copiar
          </button>

          <div className="w-px h-6 bg-border mx-1"></div>

          <button 
            onClick={onClose}
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
  );
};