import React from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, Italic, Strikethrough, Code, 
  Heading1, Heading2, Heading3, 
  List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Image as ImageIcon, Table, Sigma, Workflow, QrCode, Grid3X3
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  onInsertImage: () => void;
}

export const DocToolbar: React.FC<Props> = ({ editor, onInsertImage }) => {
  if (!editor) return null;

  const Button = ({ onClick, isActive, title, children }: any) => (
    <button 
      onClick={onClick}
      className={`p-2 rounded-full transition-all flex items-center justify-center shrink-0 ${
        isActive 
          ? 'bg-brand text-bg shadow-sm' 
          : 'hover:bg-white/10 text-text-sec hover:text-text'
      }`}
      title={title}
    >
      {children}
    </button>
  );

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-surface/90 backdrop-blur-xl border border-border p-2 rounded-full shadow-2xl flex items-center gap-1 animate-in slide-in-from-bottom-4 fade-in duration-500 overflow-x-auto max-w-[95vw] scrollbar-none">
      {/* Text Format */}
      <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-full shrink-0">
        <Button onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrito"><Bold size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Itálico"><Italic size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado"><Strikethrough size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} title="Código"><Code size={18} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Headings */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="H1"><Heading1 size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="H2"><Heading2 size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="H3"><Heading3 size={18} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Alignment */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Esq"><AlignLeft size={18} /></Button>
        <Button onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Cen"><AlignCenter size={18} /></Button>
        <Button onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Dir"><AlignRight size={18} /></Button>
        <Button onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Just"><AlignJustify size={18} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Lists & Basic */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista"><List size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numerada"><ListOrdered size={18} /></Button>
        <Button onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Citação"><Quote size={18} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Insertables */}
      <div className="flex items-center gap-0.5 bg-brand/5 p-1 rounded-full shrink-0 border border-brand/20">
        <Button onClick={onInsertImage} title="Imagem"><ImageIcon size={18} className="text-brand" /></Button>
        <Button onClick={addTable} title="Tabela"><Table size={18} className="text-brand" /></Button>
        <Button onClick={() => editor.chain().focus().insertContent({ type: 'mathNode', attrs: { latex: '' } }).run()} title="Fórmula"><Sigma size={18} className="text-brand" /></Button>
        <Button onClick={() => editor.chain().focus().insertContent({ type: 'mermaidNode', attrs: { chart: '' } }).run()} title="Diagrama"><Workflow size={18} className="text-brand" /></Button>
        <Button onClick={() => editor.chain().focus().insertContent({ type: 'qrCodeNode', attrs: { value: 'https://' } }).run()} title="QR Code"><QrCode size={18} className="text-brand" /></Button>
      </div>
    </div>
  );
};