import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import { Calculator } from 'lucide-react';

export default (props: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [latex, setLatex] = useState(props.node.attrs.latex || 'E = mc^2');
  const previewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewRef.current) {
      try {
        katex.render(latex, previewRef.current, {
          throwOnError: false,
          displayMode: true
        });
      } catch (e) {
        previewRef.current.innerText = 'Erro na fórmula';
      }
    }
  }, [latex]);

  const updateLatex = (val: string) => {
    setLatex(val);
    props.updateAttributes({ latex: val });
  };

  return (
    <NodeViewWrapper className="react-renderer my-4">
      <div 
        className="relative group cursor-pointer p-2 rounded hover:bg-white/5 border border-transparent hover:border-border transition-colors"
        onClick={() => setIsEditing(true)}
      >
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Calculator size={14} className="text-text-sec" />
        </div>
        
        {isEditing ? (
          <div className="flex flex-col gap-2 bg-surface p-3 rounded shadow-xl border border-brand z-10 relative">
             <span className="text-xs text-brand font-bold uppercase">LaTeX Editor</span>
             <input
               ref={inputRef}
               autoFocus
               type="text"
               value={latex}
               onChange={(e) => updateLatex(e.target.value)}
               onBlur={() => setIsEditing(false)}
               onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
               className="bg-bg border border-border rounded p-2 text-sm font-mono text-text outline-none focus:border-brand w-full"
               placeholder="Digite LaTeX aqui..."
             />
             <div className="text-[10px] text-text-sec">Pressione Enter para visualizar</div>
          </div>
        ) : (
          <div ref={previewRef} className="pointer-events-none" />
        )}
      </div>
    </NodeViewWrapper>
  );
};