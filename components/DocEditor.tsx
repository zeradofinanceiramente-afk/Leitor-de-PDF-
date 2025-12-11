import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { Menu, ArrowLeft, Loader2, Save, WifiOff, RefreshCw, MoreVertical, FileDown, Printer, FileType, ScrollText, StickyNote, CloudOff } from 'lucide-react';

import { DocToolbar } from './doc/DocToolbar';
import { AiBubbleMenu } from './doc/AiBubbleMenu';
import MathNode from './doc/extensions/MathNode';
import MermaidNode from './doc/extensions/MermaidNode';
import QrCodeNode from './doc/extensions/QrCodeNode';

import { updateDriveFile, downloadDriveFile } from '../services/driveService';
import { saveOfflineFile, addToSyncQueue } from '../services/storageService';
import { MIME_TYPES } from '../types';

// Custom Extension Definitions (Math, Mermaid, QrCode) keep same...
const MathExtension = Node.create({
  name: 'mathNode',
  group: 'block',
  atom: true,
  addAttributes() { return { latex: { default: 'E = mc^2' } }; },
  parseHTML() { return [{ tag: 'math-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['math-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(MathNode); },
});

const MermaidExtension = Node.create({
  name: 'mermaidNode',
  group: 'block',
  atom: true,
  addAttributes() { return { chart: { default: '' } }; },
  parseHTML() { return [{ tag: 'mermaid-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['mermaid-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(MermaidNode); },
});

const QrCodeExtension = Node.create({
  name: 'qrCodeNode',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() { return { value: { default: 'https://' } }; },
  parseHTML() { return [{ tag: 'qrcode-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['qrcode-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(QrCodeNode); },
});

interface Props {
  fileId: string;
  fileName: string;
  fileBlob?: Blob;
  accessToken: string;
  onToggleMenu: () => void;
  onAuthError?: () => void;
  onBack?: () => void;
}

export const DocEditor: React.FC<Props> = ({ fileId, fileName, fileBlob, accessToken, onToggleMenu, onBack, onAuthError }) => {
  const [zoom, setZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'error'>('saved');
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  
  // View & Menu States
  const [viewMode, setViewMode] = useState<'paged' | 'continuous'>('paged');
  const [showExportMenu, setShowExportMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isLocalFile = fileId.startsWith('local-') || !accessToken;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      MathExtension,
      MermaidExtension,
      QrCodeExtension
    ],
    editorProps: {
        attributes: {
            class: 'focus:outline-none min-h-[900px] px-12 py-12',
        },
    },
    onUpdate: () => {
        setSaveStatus('unsaved');
        if (!isLocalFile) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(handleSave, 3000); // Autosave
        }
    }
  });

  // Load Content
  useEffect(() => {
      let active = true;
      const load = async () => {
          setIsLoadingContent(true);
          let blobToRead = fileBlob;

          if (!blobToRead && !isLocalFile && accessToken) {
              try {
                  blobToRead = await downloadDriveFile(accessToken, fileId);
              } catch (e) {
                  console.error("Failed to download doc", e);
              }
          }

          if (editor) {
              if (blobToRead) {
                  const text = await blobToRead.text();
                  if (active) {
                      try {
                          const json = JSON.parse(text);
                          editor.commands.setContent(json);
                      } catch (e) {
                          editor.commands.setContent(text);
                      }
                      editor.commands.clearHistory(); 
                  }
              } else if (fileId.startsWith('new-') || isLocalFile) {
                  if (editor.isEmpty) {
                      editor.commands.setContent(`<h1>${fileName.replace('.umo', '')}</h1><p>Comece a escrever...</p>`);
                  }
              }
              if (active) {
                  setSaveStatus('saved');
                  setIsLoadingContent(false);
              }
          }
      };
      
      load();
      return () => { active = false; };
  }, [editor, fileId, accessToken]); 

  // Handlers
  const handleSave = async () => {
      if (!editor) return;
      setIsSaving(true);
      
      const json = editor.getJSON();
      const blob = new Blob([JSON.stringify(json)], { type: MIME_TYPES.UMO_DOC });

      if (isLocalFile) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName.endsWith(MIME_TYPES.UMO_DOC_EXT) ? fileName : `${fileName}${MIME_TYPES.UMO_DOC_EXT}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSaveStatus('saved');
          setIsSaving(false);
          return;
      }

      // Offline Save Handling
      if (!navigator.onLine) {
          try {
              // 1. Salvar no cache offline (acesso imediato)
              await saveOfflineFile({
                  id: fileId,
                  name: fileName,
                  mimeType: MIME_TYPES.UMO_DOC
              }, blob);

              // 2. Adicionar à fila de sincronização
              await addToSyncQueue({
                  fileId: fileId,
                  action: 'update',
                  blob: blob,
                  name: fileName,
                  mimeType: MIME_TYPES.UMO_DOC
              });

              setSaveStatus('saved');
              setIsOfflineSaved(true);
          } catch (e) {
              console.error("Offline save failed", e);
              setSaveStatus('error');
          } finally {
              setIsSaving(false);
          }
          return;
      }

      // Online Save
      try {
          await updateDriveFile(accessToken, fileId, blob, MIME_TYPES.UMO_DOC);
          setSaveStatus('saved');
          setIsOfflineSaved(false);
      } catch (e: any) {
          console.error("Save failed", e);
          
          // Se falhar e não for erro de auth, tenta salvar offline como fallback
          if (e.message !== "Unauthorized") {
              try {
                  await saveOfflineFile({ id: fileId, name: fileName, mimeType: MIME_TYPES.UMO_DOC }, blob);
                  await addToSyncQueue({ fileId: fileId, action: 'update', blob: blob, name: fileName, mimeType: MIME_TYPES.UMO_DOC });
                  setSaveStatus('saved');
                  setIsOfflineSaved(true);
              } catch (offlineErr) {
                  setSaveStatus('error');
              }
          } else {
              setSaveStatus('error');
              if (onAuthError) onAuthError();
          }
      } finally {
          setIsSaving(false);
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editor) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
            const base64 = readerEvent.target?.result as string;
            editor.chain().focus().setImage({ src: base64 }).run();
        };
        reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Export Actions
  const handleExportPdf = () => {
    window.print();
    setShowExportMenu(false);
  };

  const handleExportHtml = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace('.umo', '.html');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  if (!editor || isLoadingContent) {
    return <div className="flex h-full items-center justify-center bg-bg text-text"><Loader2 className="animate-spin text-brand" /></div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-text overflow-hidden relative">
        {/* Header - No Print */}
        <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-surface/90 backdrop-blur shrink-0 z-50 no-print">
            <div className="flex items-center gap-3">
                {onBack && (
                    <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full text-text-sec hover:text-text">
                        <ArrowLeft size={20} />
                    </button>
                )}
                <button onClick={onToggleMenu} className="p-2 hover:bg-white/10 rounded-full text-text-sec hover:text-text md:hidden">
                    <Menu size={20} />
                </button>
                <div className="flex flex-col">
                    <h1 className="font-medium text-lg truncate max-w-[200px] md:max-w-md">{fileName.replace('.umo', '')}</h1>
                    <div className="flex items-center gap-2 text-xs text-text-sec">
                        {isLocalFile ? (
                            <span className="flex items-center gap-1"><WifiOff size={10}/> Local</span> 
                        ) : isOfflineSaved ? (
                            <span className="flex items-center gap-1 text-yellow-500 font-medium"><CloudOff size={10}/> Salvo Offline</span>
                        ) : (
                            <span>Salvo no Drive</span>
                        )}
                        <span>•</span>
                        <span className={saveStatus === 'error' ? 'text-red-400' : ''}>
                            {saveStatus === 'saved' ? 'Pronto' : saveStatus === 'unsaved' ? 'Editando...' : 'Erro ao salvar'}
                        </span>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                {/* View Mode Toggle */}
                <div className="hidden md:flex bg-surface border border-border rounded-lg p-0.5 mr-2">
                    <button 
                        onClick={() => setViewMode('paged')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'paged' ? 'bg-brand text-bg shadow-sm' : 'text-text-sec hover:text-text'}`}
                        title="Modo Página"
                    >
                        <StickyNote size={16} />
                    </button>
                    <button 
                        onClick={() => setViewMode('continuous')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'continuous' ? 'bg-brand text-bg shadow-sm' : 'text-text-sec hover:text-text'}`}
                        title="Modo Contínuo"
                    >
                        <ScrollText size={16} />
                    </button>
                </div>

                <div className="hidden md:flex items-center bg-white/5 rounded-lg mr-2">
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="px-3 py-1.5 text-text-sec hover:text-text hover:bg-white/5 text-sm">-</button>
                    <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="px-3 py-1.5 text-text-sec hover:text-text hover:bg-white/5 text-sm">+</button>
                </div>

                <button 
                    onClick={handleSave} 
                    disabled={saveStatus === 'saved' || isSaving}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                        saveStatus === 'error' ? 'bg-red-500/10 text-red-500' :
                        saveStatus === 'unsaved' ? 'bg-brand text-bg hover:brightness-110' :
                        'bg-surface border border-border text-text-sec opacity-80'
                    }`}
                >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : saveStatus === 'error' ? <RefreshCw size={16} /> : isOfflineSaved ? <CloudOff size={16} /> : <Save size={16} />}
                    <span className="hidden sm:inline">{isLocalFile ? 'Baixar' : 'Salvar'}</span>
                </button>

                {/* Export Menu */}
                <div className="relative">
                    <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        className="p-2 hover:bg-white/10 rounded-full text-text-sec hover:text-text"
                    >
                        <MoreVertical size={20} />
                    </button>
                    
                    {showExportMenu && (
                        <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                            <button onClick={handleExportPdf} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 rounded-lg text-sm text-text text-left">
                                <Printer size={16} /> Imprimir / PDF
                            </button>
                            <button onClick={handleExportHtml} className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 rounded-lg text-sm text-text text-left">
                                <FileType size={16} /> Exportar HTML
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Editor Area */}
        <div 
            className="flex-1 overflow-y-auto bg-bg p-4 md:p-8 custom-scrollbar flex justify-center cursor-text" 
            onClick={(e) => {
                if (e.target === e.currentTarget) editor.chain().focus().run();
            }}
        >
            <div 
                className={`doc-page transition-all duration-300 ${
                    viewMode === 'continuous' 
                        ? 'w-full max-w-3xl min-h-screen my-0 shadow-none' 
                        : 'shadow-2xl my-8 origin-top'
                }`}
                style={{
                    backgroundColor: 'var(--bg-paper)',
                    color: 'var(--text-main)',
                    width: viewMode === 'continuous' ? '100%' : '794px', // A4 Width approx
                    minHeight: viewMode === 'continuous' ? '100vh' : '1123px', // A4 Height approx
                    transform: viewMode === 'continuous' ? 'none' : `scale(${zoom})`,
                    marginBottom: viewMode === 'continuous' ? '100px' : '100px', // Space for toolbar
                }}
            >
                <AiBubbleMenu editor={editor} />
                <EditorContent editor={editor} />
            </div>
        </div>

        {/* Floating Toolbar - No Print */}
        <div className="no-print">
            <DocToolbar editor={editor} onInsertImage={() => fileInputRef.current?.click()} />
        </div>
        
        {/* Hidden Input for Image Upload */}
        <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleImageUpload} 
        />
        
        {/* Export Menu Backdrop */}
        {showExportMenu && (
            <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowExportMenu(false)} />
        )}
    </div>
  );
};