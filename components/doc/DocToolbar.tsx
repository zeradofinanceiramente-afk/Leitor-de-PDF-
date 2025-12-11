
import React from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, Italic, Strikethrough, Code, 
  Heading1, Heading2, Heading3, 
  List, ListOrdered, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Image as ImageIcon, Table, Sigma, Workflow, QrCode, 
  CheckSquare, Superscript, Subscript, Baseline, Highlighter, Type, Palette, ArrowUpFromLine
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  onInsertImage: () => void;
}

export const DocToolbar: React.FC<Props> = ({ editor, onInsertImage }) => {
  if (!editor) return null;

  const Button = ({ onClick, isActive, title, children, className }: any) => (
    <button 
      onClick={onClick}
      className={`p-2 rounded-lg transition-all flex items-center justify-center shrink-0 ${
        isActive 
          ? 'bg-brand text-bg shadow-sm' 
          : 'hover:bg-white/10 text-text-sec hover:text-text'
      } ${className || ''}`}
      title={title}
    >
      {children}
    </button>
  );

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const setFont = (font: string) => {
    if (font === 'Sans Serif') editor.chain().focus().unsetFontFamily().run();
    else editor.chain().focus().setFontFamily(font).run();
  };

  const setFontSize = (size: string) => {
    if (!size) editor.chain().focus().unsetFontSize().run();
    else editor.chain().focus().setFontSize(size).run();
  };

  const setLineHeight = (height: string) => {
    editor.chain().focus().setLineHeight(height).run();
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-black border border-border p-2 rounded-2xl shadow-2xl flex items-center gap-1 animate-in slide-in-from-bottom-4 fade-in duration-500 overflow-x-auto max-w-[95vw] scrollbar-none">
      
      {/* Font Family & Size Dropdown */}
      <div className="flex items-center gap-1 shrink-0 px-2 bg-white/5 rounded-lg mr-1">
        <select 
            className="bg-transparent text-text text-sm font-medium outline-none cursor-pointer max-w-[100px]"
            onChange={(e) => setFont(e.target.value)}
            value={editor.getAttributes('textStyle').fontFamily || 'Times New Roman'}
        >
            <option value="Times New Roman">Times New Roman</option>
            <option value="Arial">Arial</option>
            <option value="Sans Serif">Sans Serif</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
        </select>
        <div className="w-px h-4 bg-white/20 mx-1"></div>
        <select 
            className="bg-transparent text-text text-sm font-medium outline-none cursor-pointer w-12"
            onChange={(e) => setFontSize(e.target.value)}
            value={editor.getAttributes('textStyle').fontSize || ''}
            title="Tamanho da fonte"
        >
            <option value="">12</option>
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="18">18</option>
            <option value="24">24</option>
            <option value="36">36</option>
        </select>
      </div>

      {/* Line Height */}
      <div className="flex items-center gap-1 shrink-0 px-2 bg-white/5 rounded-lg mr-1" title="Espaçamento entre linhas">
         <ArrowUpFromLine size={16} className="text-text-sec"/>
         <select
            className="bg-transparent text-text text-sm font-medium outline-none cursor-pointer w-12"
            onChange={(e) => setLineHeight(e.target.value)}
            value={editor.getAttributes('paragraph').lineHeight || '1.5'}
         >
            <option value="1.0">1.0</option>
            <option value="1.15">1.15</option>
            <option value="1.5">1.5</option>
            <option value="2.0">2.0</option>
            <option value="2.5">2.5</option>
         </select>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Text Format */}
      <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-lg shrink-0">
        <Button onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Negrito"><Bold size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Itálico"><Italic size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Tachado"><Strikethrough size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} title="Subscrito"><Subscript size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} title="Sobrescrito"><Superscript size={16} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>
      
      {/* Color & Highlight */}
      <div className="flex items-center gap-1 shrink-0">
         <div className="relative group flex items-center justify-center p-2 hover:bg-white/10 rounded-lg cursor-pointer">
             <input 
                type="color" 
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onInput={(e) => editor.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
                value={editor.getAttributes('textStyle').color || '#000000'}
                title="Cor do Texto"
             />
             <Baseline size={16} className="text-text-sec group-hover:text-text" style={{ color: editor.getAttributes('textStyle').color }} />
         </div>
         <div className="relative group flex items-center justify-center p-2 hover:bg-white/10 rounded-lg cursor-pointer">
             <input 
                type="color" 
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                onInput={(e) => editor.chain().focus().toggleHighlight({ color: (e.target as HTMLInputElement).value }).run()}
                title="Cor de Destaque"
             />
             <Highlighter size={16} className="text-text-sec group-hover:text-text" />
         </div>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Headings */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} title="H1"><Heading1 size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="H2"><Heading2 size={16} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Alignment */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Esq"><AlignLeft size={16} /></Button>
        <Button onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Cen"><AlignCenter size={16} /></Button>
        <Button onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Dir"><AlignRight size={16} /></Button>
        <Button onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} title="Just"><AlignJustify size={16} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Lists & Basic */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} title="Checklist"><CheckSquare size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Lista"><List size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Numerada"><ListOrdered size={16} /></Button>
        <Button onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Citação (ABNT)"><Quote size={16} /></Button>
      </div>

      <div className="w-px h-6 bg-border shrink-0 mx-1"></div>

      {/* Insertables */}
      <div className="flex items-center gap-0.5 bg-brand/5 p-1 rounded-lg shrink-0 border border-brand/20">
        <Button onClick={onInsertImage} title="Imagem"><ImageIcon size={16} className="text-brand" /></Button>
        <Button onClick={addTable} title="Tabela"><Table size={16} className="text-brand" /></Button>
        <Button onClick={() => editor.chain().focus().insertContent({ type: 'mathNode', attrs: { latex: '' } }).run()} title="Fórmula"><Sigma size={16} className="text-brand" /></Button>
        <Button onClick={() => editor.chain().focus().insertContent({ type: 'mermaidNode', attrs: { chart: '' } }).run()} title="Diagrama"><Workflow size={16} className="text-brand" /></Button>
        <Button onClick={() => editor.chain().focus().insertContent({ type: 'qrCodeNode', attrs: { value: 'https://' } }).run()} title="QR Code"><QrCode size={16} className="text-brand" /></Button>
      </div>
    </div>
  );
};