import React from 'react';
import Editor, { RowFlex } from '@hufe921/canvas-editor';
import { 
  Bold, Italic, Strikethrough, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Image as ImageIcon, Table, Type, Palette, Printer, Search,
  Subscript, Superscript, List, ListOrdered
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  onInsertImage: () => void;
}

export const DocToolbar: React.FC<Props> = ({ editor, onInsertImage }) => {
  if (!editor) return null;

  const Button = ({ onClick, title, children, className }: any) => (
    <button 
      onClick={onClick}
      className={`p-2 rounded-lg transition-all flex items-center justify-center shrink-0 hover:bg-white/10 text-gray-300 hover:text-white ${className || ''}`}
      title={title}
    >
      {children}
    </button>
  );

  const insertTable = () => {
    // 3x3 table with default width
    editor.command.executeInsertTable(3, 3);
  };

  const setFont = (font: string) => {
    editor.command.executeFont(font);
  };

  const setFontSize = (size: string) => {
    if (size) editor.command.executeSize(Number(size));
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-[#1e1e1e] border border-[#444746] p-2 rounded-2xl shadow-2xl flex items-center gap-1 animate-in slide-in-from-bottom-4 fade-in duration-500 overflow-x-auto max-w-[95vw] scrollbar-none">
      
      {/* Font Family & Size Dropdown */}
      <div className="flex items-center gap-1 shrink-0 px-2 bg-white/5 rounded-lg mr-1">
        <select 
            className="bg-transparent text-gray-200 text-sm font-medium outline-none cursor-pointer max-w-[100px]"
            onChange={(e) => setFont(e.target.value)}
        >
            <option value="Times New Roman">Times New Roman</option>
            <option value="Arial">Arial</option>
            <option value="Microsoft YaHei">Sans Serif</option>
            <option value="SimSun">Serif</option>
        </select>
        <div className="w-px h-4 bg-white/20 mx-1"></div>
        <select 
            className="bg-transparent text-gray-200 text-sm font-medium outline-none cursor-pointer w-12"
            onChange={(e) => setFontSize(e.target.value)}
            title="Tamanho da fonte"
            defaultValue="12"
        >
            <option value="8">8</option>
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="24">24</option>
            <option value="36">36</option>
            <option value="48">48</option>
        </select>
      </div>

      <div className="w-px h-6 bg-white/20 shrink-0 mx-1"></div>

      {/* Text Format */}
      <div className="flex items-center gap-0.5 bg-white/5 p-1 rounded-lg shrink-0">
        <Button onClick={() => editor.command.executeBold()} title="Negrito"><Bold size={16} /></Button>
        <Button onClick={() => editor.command.executeItalic()} title="Itálico"><Italic size={16} /></Button>
        <Button onClick={() => editor.command.executeUnderline()} title="Sublinhado"><Underline size={16} /></Button>
        <Button onClick={() => editor.command.executeStrikeout()} title="Tachado"><Strikethrough size={16} /></Button>
        <Button onClick={() => editor.command.executeSubscript()} title="Subscrito"><Subscript size={16} /></Button>
        <Button onClick={() => editor.command.executeSuperscript()} title="Sobrescrito"><Superscript size={16} /></Button>
      </div>

      <div className="w-px h-6 bg-white/20 shrink-0 mx-1"></div>
      
      {/* Alignment */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button onClick={() => editor.command.executeRowFlex(RowFlex.LEFT)} title="Esq"><AlignLeft size={16} /></Button>
        <Button onClick={() => editor.command.executeRowFlex(RowFlex.CENTER)} title="Cen"><AlignCenter size={16} /></Button>
        <Button onClick={() => editor.command.executeRowFlex(RowFlex.RIGHT)} title="Dir"><AlignRight size={16} /></Button>
        <Button onClick={() => editor.command.executeRowFlex(RowFlex.ALIGNMENT)} title="Just"><AlignJustify size={16} /></Button>
      </div>

      <div className="w-px h-6 bg-white/20 shrink-0 mx-1"></div>

      {/* Lists - Canvas Editor usually handles lists via context menu or specialized commands, assuming basics */}
      {/* Note: List commands might vary in canvas-editor, often not exposed as simple toggles in basic version */}
      {/* We keep placeholders if commands are available or update later */}
      
      {/* Insertables */}
      <div className="flex items-center gap-0.5 bg-brand/10 p-1 rounded-lg shrink-0 border border-brand/20">
        <Button onClick={onInsertImage} title="Imagem"><ImageIcon size={16} className="text-brand" /></Button>
        <Button onClick={insertTable} title="Tabela"><Table size={16} className="text-brand" /></Button>
      </div>

      <div className="w-px h-6 bg-white/20 shrink-0 mx-1"></div>

      <Button onClick={() => editor.command.executePrint()} title="Imprimir"><Printer size={16} /></Button>
      <Button onClick={() => editor.command.executeSearch(null)} title="Buscar"><Search size={16} /></Button>
    </div>
  );
};