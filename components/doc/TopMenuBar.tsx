import React, { useState, useRef, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { 
  FileText, Printer, 
  Undo, Redo, Scissors, Copy, Clipboard, Trash2, Search,
  Ruler, Eye, Maximize,
  Image as ImageIcon, Table, Minus, Sigma, Workflow, QrCode, Link, PenTool,
  Bold, Italic, Underline, Strikethrough, Superscript, Subscript, Code, Eraser, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify, 
  List, ListOrdered, CheckSquare, 
  ChevronRight, Type, FilePlus, FolderOpen, Share2, Mail, Download, Edit2, FolderInput, History, WifiOff, Info, Globe, Settings,
  ArrowLeft
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  fileName: string;
  onSave: () => void;
  onNew: () => void;
  onRename: () => void;
  onWordCount: () => void;
  onDownload: () => void;
  onExportPdf: () => void;
  onExportHtml: () => void;
  onInsertImage: () => void;
  onTrash: () => void;
  onPageSetup: () => void;
  onPrint: () => void;
  onLanguage: () => void;
  onSpellCheck: () => void;
  showRuler: boolean;
  setShowRuler: (s: boolean) => void;
  zoom: number;
  setZoom: (z: number) => void;
  viewMode: 'paged' | 'continuous';
  setViewMode: (v: 'paged' | 'continuous') => void;
}

interface DropdownProps {
  children?: React.ReactNode;
  className?: string;
}

const Dropdown = ({ children, className = "" }: DropdownProps) => (
  <div className={`absolute top-full left-0 mt-1 bg-black border border-[#444746] rounded-md shadow-2xl py-2 min-w-[260px] z-50 flex flex-col text-[#e3e3e3] ${className}`}>
    {children}
  </div>
);

const Divider = () => <div className="h-px bg-[#444746] my-1 mx-0" />;

export const TopMenuBar: React.FC<Props> = ({ 
  editor, fileName, 
  onSave, onNew, onRename, onWordCount, onDownload, onExportPdf, onExportHtml, onInsertImage, onTrash,
  onPageSetup, onPrint, onLanguage, onSpellCheck,
  showRuler, setShowRuler,
  zoom, setZoom,
  viewMode, setViewMode
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeSubMenu, setActiveSubMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
        setActiveSubMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeMenu = () => {
    setActiveMenu(null);
    setActiveSubMenu(null);
  };

  const handleCopy = async () => {
    if (!editor) return;
    try {
        const selection = window.getSelection();
        if (selection && selection.toString()) {
            await navigator.clipboard.writeText(selection.toString());
        }
        closeMenu();
    } catch (e) {
        alert("Seu navegador bloqueou a cópia automática. Use Ctrl+C.");
    }
  };

  const handleCut = async () => {
    if (!editor) return;
    try {
        const selection = window.getSelection();
        if (selection && selection.toString()) {
             await navigator.clipboard.writeText(selection.toString());
             editor.chain().focus().deleteSelection().run();
        }
        closeMenu();
    } catch (e) {
        alert("Seu navegador bloqueou o recorte automático. Use Ctrl+X.");
    }
  };

  const handlePaste = async () => {
    if (!editor) return;
    try {
        const text = await navigator.clipboard.readText();
        editor.chain().focus().insertContent(text).run();
        closeMenu();
    } catch (e) {
        alert("Para colar, por favor use o atalho de teclado (Ctrl+V).");
    }
  };

  const handleFind = () => {
      const term = window.prompt("Localizar na página:");
      if (term) {
          (window as any).find(term);
      }
      closeMenu();
  };

  const handleShare = async () => {
      if (navigator.share) {
          await navigator.share({
              title: fileName,
              url: window.location.href
          }).catch(() => {});
      } else {
          navigator.clipboard.writeText(window.location.href);
          alert("Link copiado para a área de transferência!");
      }
      closeMenu();
  };

  if (!editor) return null;

  const MenuButton = ({ label, name }: { label: string, name: string }) => (
    <button
      onClick={() => {
          if (activeMenu === name) {
              closeMenu();
          } else {
              setActiveMenu(name);
              setActiveSubMenu(null);
          }
      }}
      className={`px-2 py-0.5 rounded-[4px] text-sm transition-colors cursor-default ${activeMenu === name ? 'bg-[#444746] text-[#e3e3e3]' : 'text-[#e3e3e3] hover:bg-[#303033]'}`}
    >
      {label}
    </button>
  );

  const MenuItem = ({ icon: Icon, label, onClick, shortcut, hasSubmenu = false, isActive = false, className = '' }: any) => (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        if (hasSubmenu) {
            setActiveSubMenu(label); 
        } else if (onClick) {
             onClick(e);
             closeMenu();
        }
      }}
      className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-3 hover:bg-[#303033] transition-colors ${isActive ? 'bg-[#303033]' : ''} ${className}`}
    >
      <div className="w-5 flex items-center justify-center shrink-0">
         {Icon && <Icon size={18} className="text-[#c4c7c5]" />}
      </div>
      <span className="flex-1 text-[#e3e3e3]">{label}</span>
      {shortcut && <span className="text-xs text-[#8e918f] ml-4">{shortcut}</span>}
      {hasSubmenu && <ChevronRight size={14} className="text-[#8e918f]" />}
    </button>
  );

  const SubHeader = ({ label }: { label: string }) => (
      <button 
        onClick={() => setActiveSubMenu(null)}
        className="w-full text-left px-4 py-1.5 text-sm flex items-center gap-2 hover:bg-[#303033] transition-colors border-b border-[#444746] mb-1 font-bold text-[#e3e3e3]"
      >
          <ArrowLeft size={16} />
          {label}
      </button>
  );

  return (
    <div className="flex items-center gap-0.5 mt-1 select-none" ref={menuRef}>
      
      {/* ARQUIVO */}
      <div className="relative">
        <MenuButton label="Arquivo" name="file" />
        {activeMenu === 'file' && (
          <Dropdown>
            <MenuItem icon={FilePlus} label="Novo" onClick={onNew} />
            <MenuItem icon={FolderOpen} label="Abrir" onClick={() => window.location.href = '/?mode=browser'} shortcut="Ctrl+O" />
            <MenuItem icon={FileText} label="Fazer uma cópia" onClick={onSave} />
            <Divider />
            <MenuItem icon={Share2} label="Compartilhar" onClick={handleShare} />
            <MenuItem icon={Mail} label="E-mail" onClick={() => window.location.href = `mailto:?subject=${encodeURIComponent(fileName)}`} />
            <MenuItem icon={Download} label="Fazer download" onClick={onDownload} />
            <Divider />
            <MenuItem icon={Edit2} label="Renomear" onClick={onRename} />
            <MenuItem icon={FolderInput} label="Mover" onClick={() => alert("Funcionalidade disponível apenas na visualização de pastas.")} />
            <MenuItem icon={Trash2} label="Mover para a lixeira" onClick={onTrash} />
            <Divider />
            <MenuItem icon={WifiOff} label="Tornar disponível off-line" onClick={onSave} />
            <Divider />
            <MenuItem icon={Globe} label="Idioma" onClick={onLanguage} />
            <MenuItem icon={Settings} label="Configuração da página" onClick={onPageSetup} />
            <MenuItem icon={Printer} label="Imprimir" onClick={onPrint} shortcut="Ctrl+P" />
          </Dropdown>
        )}
      </div>

      {/* EDITAR */}
      <div className="relative">
        <MenuButton label="Editar" name="edit" />
        {activeMenu === 'edit' && (
          <Dropdown>
            <MenuItem icon={Undo} label="Desfazer" onClick={() => editor.chain().focus().undo().run()} shortcut="Ctrl+Z" />
            <MenuItem icon={Redo} label="Refazer" onClick={() => editor.chain().focus().redo().run()} shortcut="Ctrl+Y" />
            <Divider />
            <MenuItem icon={Scissors} label="Recortar" onClick={handleCut} shortcut="Ctrl+X" />
            <MenuItem icon={Copy} label="Copiar" onClick={handleCopy} shortcut="Ctrl+C" />
            <MenuItem icon={Clipboard} label="Colar" onClick={handlePaste} shortcut="Ctrl+V" />
            <MenuItem icon={Clipboard} label="Colar sem formatação" onClick={handlePaste} shortcut="Ctrl+Shift+V" />
            <Divider />
            <MenuItem icon={CheckSquare} label="Selecionar tudo" onClick={() => editor.chain().focus().selectAll().run()} shortcut="Ctrl+A" />
            <MenuItem icon={Trash2} label="Excluir" onClick={() => editor.chain().focus().deleteSelection().run()} />
            <Divider />
            <MenuItem icon={Search} label="Localizar e substituir" onClick={handleFind} shortcut="Ctrl+H" />
          </Dropdown>
        )}
      </div>

      {/* VER */}
      <div className="relative">
        <MenuButton label="Ver" name="view" />
        {activeMenu === 'view' && (
          <Dropdown>
             <MenuItem icon={FileText} label={`Modo: ${editor.isEditable ? 'Edição' : 'Visualização'}`} onClick={() => editor.setEditable(!editor.isEditable)} />
             <Divider />
             <MenuItem icon={Printer} label="Layout de impressão" onClick={() => setViewMode(viewMode === 'paged' ? 'continuous' : 'paged')} isActive={viewMode === 'paged'} />
             <MenuItem icon={Ruler} label="Exibir régua" onClick={() => setShowRuler(!showRuler)} isActive={showRuler} />
             <Divider />
             <MenuItem icon={Maximize} label="Tela inteira" onClick={() => {
                if (!document.fullscreenElement) document.documentElement.requestFullscreen();
                else document.exitFullscreen();
             }} />
          </Dropdown>
        )}
      </div>

      {/* INSERIR */}
      <div className="relative">
        <MenuButton label="Inserir" name="insert" />
        {activeMenu === 'insert' && (
          <Dropdown>
            {!activeSubMenu ? (
                <>
                    <MenuItem icon={ImageIcon} label="Imagem" onClick={onInsertImage} />
                    <MenuItem icon={Table} label="Tabela" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
                    <MenuItem icon={PenTool} label="Desenho" onClick={() => editor.chain().focus().insertContent({ type: 'mermaidNode', attrs: { chart: '' } }).run()} />
                    <MenuItem icon={Link} label="Link" onClick={() => {
                        const url = window.prompt('URL');
                        if (url) editor.chain().focus().setLink({ href: url }).run();
                    }} shortcut="Ctrl+K" />
                    <Divider />
                    <MenuItem icon={Minus} label="Linha horizontal" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
                    <MenuItem icon={Type} label="Quebra de página" onClick={() => editor.chain().focus().setHardBreak().run()} />
                    <Divider />
                    <MenuItem icon={Sigma} label="Equação" onClick={() => editor.chain().focus().insertContent({ type: 'mathNode', attrs: { latex: '' } }).run()} />
                    <MenuItem icon={QrCode} label="QR Code" onClick={() => editor.chain().focus().insertContent({ type: 'qrCodeNode', attrs: { value: 'https://' } }).run()} />
                </>
            ) : null}
          </Dropdown>
        )}
      </div>

      {/* FORMATAR */}
      <div className="relative">
        <MenuButton label="Formatar" name="format" />
        {activeMenu === 'format' && (
          <Dropdown>
             {!activeSubMenu ? (
                <>
                    <MenuItem icon={Bold} label="Texto" hasSubmenu />
                    <MenuItem icon={Type} label="Estilos de parágrafo" hasSubmenu />
                    <MenuItem icon={AlignLeft} label="Alinhar e recuar" hasSubmenu />
                    <MenuItem icon={List} label="Marcadores e numeração" hasSubmenu />
                    <Divider />
                    <MenuItem icon={Eraser} label="Limpar formatação" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} shortcut="Ctrl+\" />
                </>
             ) : activeSubMenu === 'Texto' ? (
                <>
                    <SubHeader label="Texto" />
                    <MenuItem icon={Bold} label="Negrito" onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} />
                    <MenuItem icon={Italic} label="Itálico" onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} />
                    <MenuItem icon={Underline} label="Sublinhado" onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} />
                    <MenuItem icon={Strikethrough} label="Tachado" onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} />
                    <MenuItem icon={Superscript} label="Sobrescrito" onClick={() => editor.chain().focus().toggleSuperscript().run()} isActive={editor.isActive('superscript')} />
                    <MenuItem icon={Subscript} label="Subscrito" onClick={() => editor.chain().focus().toggleSubscript().run()} isActive={editor.isActive('subscript')} />
                    <MenuItem icon={Code} label="Código" onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive('code')} />
                </>
             ) : activeSubMenu === 'Estilos de parágrafo' ? (
                <>
                    <SubHeader label="Estilos" />
                    <MenuItem icon={Type} label="Texto normal" onClick={() => editor.chain().focus().setParagraph().run()} isActive={editor.isActive('paragraph')} />
                    <MenuItem icon={Type} label="Título 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} />
                    <MenuItem icon={Type} label="Título 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} />
                    <MenuItem icon={Type} label="Título 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} />
                </>
             ) : activeSubMenu === 'Alinhar e recuar' ? (
                 <>
                    <SubHeader label="Alinhamento" />
                    <MenuItem icon={AlignLeft} label="Esquerda" onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} />
                    <MenuItem icon={AlignCenter} label="Centro" onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} />
                    <MenuItem icon={AlignRight} label="Direita" onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} />
                    <MenuItem icon={AlignJustify} label="Justificado" onClick={() => editor.chain().focus().setTextAlign('justify').run()} isActive={editor.isActive({ textAlign: 'justify' })} />
                 </>
             ) : activeSubMenu === 'Marcadores e numeração' ? (
                 <>
                    <SubHeader label="Listas" />
                    <MenuItem icon={List} label="Lista com marcadores" onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} />
                    <MenuItem icon={ListOrdered} label="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} />
                    <MenuItem icon={CheckSquare} label="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} />
                 </>
             ) : null}
          </Dropdown>
        )}
      </div>

      {/* FERRAMENTAS */}
      <div className="relative">
        <MenuButton label="Ferramentas" name="tools" />
        {activeMenu === 'tools' && (
          <Dropdown>
              <MenuItem icon={Type} label="Contagem de palavras" onClick={onWordCount} shortcut="Ctrl+Shift+C" />
              <MenuItem icon={FileText} label="Ortografia e gramática" onClick={onSpellCheck} />
          </Dropdown>
        )}
      </div>

       {/* AJUDA */}
       <div className="relative">
        <MenuButton label="Ajuda" name="help" />
        {activeMenu === 'help' && (
            <Dropdown>
                <MenuItem icon={Info} label="Atalhos do teclado" onClick={() => alert("Use Ctrl+B para negrito, Ctrl+I para itálico, etc.")} />
                <MenuItem icon={Mail} label="Informar um problema" onClick={() => {}} />
            </Dropdown>
        )}
      </div>

    </div>
  );
};
