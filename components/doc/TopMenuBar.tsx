import React, { useState, useRef, useEffect } from 'react';
import Editor from '@hufe921/canvas-editor';
import { 
  FileText, Printer, 
  Undo, Redo, Copy, Clipboard, Scissors, Trash2, Search,
  Image as ImageIcon, Table,
  Bold, Italic, Underline, Strikethrough, 
  Settings, ChevronRight, Download, Save
} from 'lucide-react';

interface Props {
  editor: Editor | null;
  fileName: string;
  onSave: () => void;
  onPrint: () => void;
  onPageSetup: () => void;
  onSearch: () => void;
  onInsertImage: () => void;
}

interface DropdownProps {
  children?: React.ReactNode;
  className?: string;
}

const Dropdown = ({ children, className = "" }: DropdownProps) => (
  <div className={`absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-xl py-2 min-w-[260px] z-[60] flex flex-col text-gray-700 ${className}`}>
    {children}
  </div>
);

const Divider = () => <div className="h-px bg-gray-200 my-1 mx-0" />;

export const TopMenuBar: React.FC<Props> = ({ 
  editor, fileName, 
  onSave, onPrint, onPageSetup, onSearch, onInsertImage
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const closeMenu = () => setActiveMenu(null);

  if (!editor) return null;

  const MenuButton = ({ label, name }: { label: string, name: string }) => (
    <button
      onClick={() => setActiveMenu(activeMenu === name ? null : name)}
      className={`px-2 py-0.5 rounded-[4px] text-sm transition-colors cursor-default ${activeMenu === name ? 'bg-gray-100 text-black' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  );

  const MenuItem = ({ icon: Icon, label, onClick, shortcut, isActive = false }: any) => (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) {
             onClick(e);
             closeMenu();
        }
      }}
      className={`w-full text-left px-4 py-1.5 text-sm flex items-center gap-3 hover:bg-gray-100 transition-colors ${isActive ? 'bg-gray-100' : ''}`}
    >
      <div className="w-5 flex items-center justify-center shrink-0">
         {Icon && <Icon size={18} className="text-gray-500" />}
      </div>
      <span className="flex-1 text-gray-800">{label}</span>
      {shortcut && <span className="text-xs text-gray-400 ml-4">{shortcut}</span>}
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 mt-1 select-none relative" ref={menuRef}>
      
      {/* ARQUIVO */}
      <div className="relative">
        <MenuButton label="Arquivo" name="file" />
        {activeMenu === 'file' && (
          <Dropdown>
            <MenuItem icon={Save} label="Salvar" onClick={onSave} shortcut="Ctrl+S" />
            <MenuItem icon={Download} label="Fazer download (.ceditor)" onClick={onSave} />
            <Divider />
            <MenuItem icon={Printer} label="Imprimir" onClick={onPrint} shortcut="Ctrl+P" />
            <MenuItem icon={Settings} label="Configuração da página" onClick={onPageSetup} />
          </Dropdown>
        )}
      </div>

      {/* EDITAR */}
      <div className="relative">
        <MenuButton label="Editar" name="edit" />
        {activeMenu === 'edit' && (
          <Dropdown>
            <MenuItem icon={Undo} label="Desfazer" onClick={() => editor.command.executeUndo()} shortcut="Ctrl+Z" />
            <MenuItem icon={Redo} label="Refazer" onClick={() => editor.command.executeRedo()} shortcut="Ctrl+Y" />
            <Divider />
            <MenuItem icon={Search} label="Localizar e substituir" onClick={onSearch} shortcut="Ctrl+F" />
          </Dropdown>
        )}
      </div>

      {/* INSERIR */}
      <div className="relative">
        <MenuButton label="Inserir" name="insert" />
        {activeMenu === 'insert' && (
          <Dropdown>
              <MenuItem icon={ImageIcon} label="Imagem" onClick={onInsertImage} />
              <MenuItem icon={Table} label="Tabela" onClick={() => editor.command.executeInsertTable(3, 3)} />
          </Dropdown>
        )}
      </div>

      {/* FORMATAR */}
      <div className="relative">
        <MenuButton label="Formatar" name="format" />
        {activeMenu === 'format' && (
          <Dropdown>
                <MenuItem icon={Bold} label="Negrito" onClick={() => editor.command.executeBold()} />
                <MenuItem icon={Italic} label="Itálico" onClick={() => editor.command.executeItalic()} />
                <MenuItem icon={Underline} label="Sublinhado" onClick={() => editor.command.executeUnderline()} />
                <MenuItem icon={Strikethrough} label="Tachado" onClick={() => editor.command.executeStrikeout()} />
          </Dropdown>
        )}
      </div>

    </div>
  );
};