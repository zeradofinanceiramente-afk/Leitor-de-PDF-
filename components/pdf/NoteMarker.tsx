
import React, { useState, useEffect } from 'react';
import { StickyNote, X, Trash2 } from 'lucide-react';
import { Annotation } from '../../types';

interface NoteMarkerProps {
  ann: Annotation;
  scale: number; 
  activeTool: string;
  onDelete: (ann: Annotation) => void;
}

export const NoteMarker: React.FC<NoteMarkerProps> = ({ ann, scale, activeTool, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand newly created notes
  useEffect(() => {
    if (ann.createdAt && (Date.now() - new Date(ann.createdAt).getTime() < 2000)) {
      setIsExpanded(true);
    }
  }, [ann.createdAt]);

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

  if (!isExpanded) {
    return (
      <div 
        className="absolute z-30 group cursor-pointer transition-transform hover:scale-110 pointer-events-auto"
        style={{
           left: x,
           top: y,
           transform: `translate(-50%, -50%)`, 
           cursor: activeTool === 'eraser' ? 'url(https://cdn-icons-png.flaticon.com/32/2661/2661282.png), pointer' : 'pointer'
        }}
        onClick={handleMarkerClick}
        title={activeTool === 'eraser' ? "Apagar Nota" : "Ver nota"}
      >
        <div className={`w-6 h-6 rounded-full bg-yellow-400 border-2 border-yellow-600 shadow-md flex items-center justify-center ${activeTool === 'eraser' ? 'bg-red-500 border-red-700' : ''}`}>
           {activeTool === 'eraser' ? <X size={12} className="text-white"/> : <StickyNote size={12} className="text-yellow-900 opacity-75" />}
        </div>
      </div>
    );
  }

  return (
    <div
      className="annotation-item absolute z-30 group pointer-events-auto animate-in zoom-in duration-200"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className={`bg-yellow-100 text-gray-900 text-sm p-3 rounded-br-xl rounded-bl-xl rounded-tr-xl rounded-tl-none shadow-xl border border-yellow-300 relative flex flex-col gap-2 min-w-[200px] max-w-[300px]`}
        style={{ backgroundColor: ann.color || '#fef9c3' }}
      >
        <div className="flex items-center justify-between border-b border-yellow-500/10 pb-1 mb-1">
          <span className="text-[10px] uppercase font-bold text-yellow-800/60 tracking-wider">Nota</span>
          <div className="flex gap-1">
             <button onClick={toggleExpand} className="p-1 text-yellow-800 hover:bg-yellow-200 rounded">
                <X size={14} />
             </button>
             {ann.id && !ann.isBurned && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(ann); }} className="p-1 text-red-600 hover:bg-red-100 rounded ml-1">
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
