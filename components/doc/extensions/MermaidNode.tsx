import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import mermaid from 'mermaid';
import { Workflow, Edit2 } from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
});

export default (props: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [chart, setChart] = useState(props.node.attrs.chart || 'graph TD\nA[Início] --> B{Processo}\nB -->|Sim| C[Fim]\nB -->|Não| A');
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let active = true;
    const render = async () => {
      if (!containerRef.current) return;
      try {
        containerRef.current.innerHTML = '';
        const { svg } = await mermaid.render(idRef.current, chart);
        if (active && containerRef.current) {
            containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (containerRef.current) containerRef.current.innerHTML = '<div class="text-red-500 text-xs p-2">Erro no diagrama</div>';
      }
    };
    render();
    return () => { active = false; };
  }, [chart]);

  const updateChart = (val: string) => {
    setChart(val);
    props.updateAttributes({ chart: val });
  };

  return (
    <NodeViewWrapper className="react-renderer my-4">
      <div className="relative group p-2 rounded hover:bg-white/5 border border-transparent hover:border-border transition-colors">
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
            <button 
                onClick={() => setIsEditing(!isEditing)} 
                className="p-1.5 bg-surface rounded-full text-brand shadow-sm border border-border hover:brightness-110"
            >
                {isEditing ? <Workflow size={14}/> : <Edit2 size={14}/>}
            </button>
        </div>

        <div ref={containerRef} className="flex justify-center min-h-[100px] overflow-x-auto" />

        {isEditing && (
          <div className="mt-2 bg-surface p-3 rounded shadow-xl border border-brand">
             <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-brand font-bold uppercase">Mermaid Code</span>
                <a href="https://mermaid.js.org/intro/" target="_blank" className="text-[10px] text-text-sec hover:text-brand underline">Docs</a>
             </div>
             <textarea
               autoFocus
               value={chart}
               onChange={(e) => updateChart(e.target.value)}
               className="bg-bg border border-border rounded p-2 text-xs font-mono text-text outline-none focus:border-brand w-full h-32"
               placeholder="graph TD..."
             />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};