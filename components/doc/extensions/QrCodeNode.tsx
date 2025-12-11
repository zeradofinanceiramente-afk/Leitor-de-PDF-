import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import QRCode from 'qrcode';
import { QrCode } from 'lucide-react';

export default (props: any) => {
  const [value, setValue] = useState(props.node.attrs.value || 'https://example.com');
  const [isEditing, setIsEditing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
        QRCode.toCanvas(canvasRef.current, value, { 
            width: 150,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' }
        }, (error) => {
            if (error) console.error(error);
        });
    }
  }, [value]);

  const updateValue = (val: string) => {
    setValue(val);
    props.updateAttributes({ value: val });
  };

  return (
    <NodeViewWrapper className="react-renderer inline-block mx-2 align-middle">
      <div 
        className="relative group cursor-pointer inline-flex flex-col items-center p-2 rounded hover:bg-white/5 border border-transparent hover:border-border transition-colors"
        onClick={() => setIsEditing(true)}
      >
        <canvas ref={canvasRef} className="rounded" />
        
        {isEditing ? (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-surface p-3 rounded shadow-xl border border-brand z-20 w-64">
             <div className="flex items-center gap-2 mb-2 text-brand">
                <QrCode size={14} />
                <span className="text-xs font-bold uppercase">Conteúdo do QR</span>
             </div>
             <input
               autoFocus
               type="text"
               value={value}
               onChange={(e) => updateValue(e.target.value)}
               onBlur={() => setIsEditing(false)}
               onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
               className="bg-bg border border-border rounded p-2 text-sm text-text outline-none focus:border-brand w-full"
             />
          </div>
        ) : (
            <span className="text-[10px] text-text-sec mt-1 max-w-[150px] truncate opacity-0 group-hover:opacity-100 transition-opacity">{value}</span>
        )}
      </div>
    </NodeViewWrapper>
  );
};