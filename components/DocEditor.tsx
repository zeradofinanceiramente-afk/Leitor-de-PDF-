
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, Node as TiptapNode, Extension, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Menu, ArrowLeft, Loader2, WifiOff, CloudOff, CheckCircle2, Star, FileText as FileIcon, X, Type, AlignLeft, AlignCenter, AlignRight, Settings } from 'lucide-react';
import mammoth from 'mammoth';

import { DocToolbar } from './doc/DocToolbar';
import { TopMenuBar } from './doc/TopMenuBar';
import { AiBubbleMenu } from './doc/AiBubbleMenu';
import { Ruler } from './doc/Ruler';
import MathNode from './doc/extensions/MathNode';
import MermaidNode from './doc/extensions/MermaidNode';
import QrCodeNode from './doc/extensions/QrCodeNode';

import { updateDriveFile, downloadDriveFile, renameDriveFile, deleteDriveFile } from '../services/driveService';
import { saveOfflineFile, addToSyncQueue, deleteOfflineFile } from '../services/storageService';
import { generateDocxBlob } from '../services/docxService';
import { MIME_TYPES } from '../types';

// --- CUSTOM EXTENSIONS ---

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize.replace('pt', ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}pt` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize }).run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).run();
      },
    };
  },
});

const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      defaultLineHeight: '1.5',
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultLineHeight,
            parseHTML: element => element.style.lineHeight || this.options.defaultLineHeight,
            renderHTML: attributes => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setLineHeight: lineHeight => ({ commands }) => {
        return commands.updateAttributes('paragraph', { lineHeight }) || 
               commands.updateAttributes('heading', { lineHeight });
      },
    };
  },
});

const MathExtension = TiptapNode.create({
  name: 'mathNode',
  group: 'block',
  atom: true,
  addAttributes() { return { latex: { default: 'E = mc^2' } }; },
  parseHTML() { return [{ tag: 'math-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['math-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(MathNode); },
});

const MermaidExtension = TiptapNode.create({
  name: 'mermaidNode',
  group: 'block',
  atom: true,
  addAttributes() { return { chart: { default: '' } }; },
  parseHTML() { return [{ tag: 'mermaid-node' }]; },
  renderHTML({ HTMLAttributes }) { return ['mermaid-node', HTMLAttributes]; },
  addNodeView() { return ReactNodeViewRenderer(MermaidNode); },
});

const QrCodeExtension = TiptapNode.create({
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

// --- PAPER CONSTANTS ---
const DPI = 96;
const CM_TO_PX = 37.795275591; // 1cm in pixels at 96 DPI

const PAPER_SIZES: Record<string, { name: string, widthCm: number, heightCm: number }> = {
  'letter': { name: 'Carta (21,6 cm x 27,9 cm)', widthCm: 21.59, heightCm: 27.94 },
  'tabloid': { name: 'Tabloide (27,9 cm x 43,2 cm)', widthCm: 27.94, heightCm: 43.18 },
  'legal': { name: 'Ofício (21,6 cm x 35,6 cm)', widthCm: 21.59, heightCm: 35.56 },
  'statement': { name: 'Declaração (14 cm x 21,6 cm)', widthCm: 13.97, heightCm: 21.59 },
  'executive': { name: 'Executivo (18,4 cm x 26,7 cm)', widthCm: 18.41, heightCm: 26.67 },
  'folio': { name: 'Fólio (21,6 cm x 33 cm)', widthCm: 21.59, heightCm: 33.02 },
  'a3': { name: 'A3 (29,7 cm x 42 cm)', widthCm: 29.7, heightCm: 42 },
  'a4': { name: 'A4 (21 cm x 29,7 cm)', widthCm: 21, heightCm: 29.7 },
  'a5': { name: 'A5 (14,8 cm x 21 cm)', widthCm: 14.8, heightCm: 21 },
  'b4': { name: 'B4 (25 cm x 35,3 cm)', widthCm: 25, heightCm: 35.3 },
  'b5': { name: 'B5 (17,6 cm x 25 cm)', widthCm: 17.6, heightCm: 25 },
};

export const DocEditor: React.FC<Props> = ({ fileId, fileName, fileBlob, accessToken, onToggleMenu, onBack, onAuthError }) => {
  const [zoom, setZoom] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'error'>('saved');
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  
  // View & Menu States
  const [viewMode, setViewMode] = useState<'paged' | 'continuous'>('paged');
  const [showRuler, setShowRuler] = useState(true);
  const [isStarred, setIsStarred] = useState(false);
  
  // Page Settings State
  const [pageSettings, setPageSettings] = useState({
    paperSize: 'a4',
    orientation: 'portrait' as 'portrait' | 'landscape',
    pageColor: '#ffffff',
    marginTop: 2.54,
    marginBottom: 2.54,
    marginLeft: 2.54,
    marginRight: 2.54,
  });
  const [showPageSetup, setShowPageSetup] = useState(false);
  const [tempPageSettings, setTempPageSettings] = useState(pageSettings); // For Modal

  // Header/Footer State
  const [headerContent, setHeaderContent] = useState('');
  
  // Word Count State
  const [showWordCount, setShowWordCount] = useState(false);
  const [stats, setStats] = useState({ words: 0, chars: 0, charsNoSpace: 0 });

  // Rename State
  const [currentName, setCurrentName] = useState(fileName.replace('.docx', '').replace('.umo', ''));
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const isLocalFile = fileId.startsWith('local-') || !accessToken;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph', 'image'], defaultAlignment: 'justify' }),
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      FontFamily.configure({ types: ['textStyle'] }),
      FontSize,
      LineHeight,
      Subscript,
      Superscript,
      MathExtension,
      MermaidExtension,
      QrCodeExtension
    ],
    editorProps: {
        attributes: {
            class: 'focus:outline-none doc-content',
            style: 'min-height: 100%;' 
        },
    },
    onUpdate: ({ editor }) => {
        setSaveStatus('unsaved');
        if (!isLocalFile) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(handleSave, 3000); // Autosave
        }
    }
  });

  // Calculate current paper dimensions in PX
  const currentPaper = useMemo(() => {
    const size = PAPER_SIZES[pageSettings.paperSize] || PAPER_SIZES['a4'];
    const isPortrait = pageSettings.orientation === 'portrait';
    const widthCm = isPortrait ? size.widthCm : size.heightCm;
    const heightCm = isPortrait ? size.heightCm : size.widthCm;
    
    return {
        widthPx: widthCm * CM_TO_PX,
        heightPx: heightCm * CM_TO_PX,
        widthCm,
        heightCm,
        // Gap between pages in PX
        pageGap: 20
    };
  }, [pageSettings.paperSize, pageSettings.orientation]);

  // Apply Global Styles dynamically
  useEffect(() => {
    if (editor && editor.view.dom) {
       // Styles for the Text Content itself (ProseMirror)
       editor.view.dom.style.padding = '0'; 
       
       // Background transparent because the wrapper handles the page look
       editor.view.dom.style.backgroundColor = 'transparent';
       
       // Default global styles (Academic Standard)
       editor.view.dom.style.lineHeight = '1.5'; 
       editor.view.dom.style.fontSize = '12pt';
       editor.view.dom.style.fontFamily = '"Times New Roman", Times, serif';
       editor.view.dom.style.color = '#000000';
    }
  }, [editor, pageSettings]);

  // Calculate stats when modal opens or content changes
  useEffect(() => {
    if (showWordCount && editor) {
        const text = editor.state.doc.textContent;
        setStats({
            words: text.split(/\s+/).filter(w => w !== '').length,
            chars: text.length,
            charsNoSpace: text.replace(/\s/g, '').length
        });
    }
  }, [showWordCount, editor?.state.doc.textContent]);

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
                  // If it's a DOCX (Blob), parse with Mammoth
                  if (fileName.endsWith('.docx') || blobToRead.type.includes('wordprocessingml')) {
                     try {
                        const arrayBuffer = await blobToRead.arrayBuffer();
                        // CRITICAL: Configure Mammoth to convert images to Base64 AND Map Styles
                        const options = {
                            ignoreEmptyParagraphs: false,
                            // Mapeamento de estilos explícito para evitar perda de formatação
                            styleMap: [
                                "p[style-name='Heading 1'] => h1:fresh",
                                "p[style-name='Heading 2'] => h2:fresh",
                                "p[style-name='Heading 3'] => h3:fresh",
                                "p[style-name='Heading 4'] => h4:fresh",
                                "p[style-name='Title'] => h1:fresh",
                                "p[style-name='Subtitle'] => h2:fresh",
                                "r[style-name='Strong'] => strong",
                                "r[style-name='Emphasis'] => em",
                                "p[style-name='List Paragraph'] => ul > li:fresh"
                            ],
                            convertImage: mammoth.images.imgElement(function(image) {
                                return image.read("base64").then(function(imageBuffer) {
                                    return {
                                        src: "data:" + image.contentType + ";base64," + imageBuffer
                                    };
                                });
                            })
                        };
                        const result = await mammoth.convertToHtml({ arrayBuffer }, options);
                        if (active) {
                             editor.commands.setContent(result.value);
                             // Se houver mensagens de aviso do Mammoth, logamos
                             if (result.messages.length > 0) console.warn("Mammoth Import Warnings:", result.messages);
                        }
                     } catch(e) {
                        console.error("Mammoth import error", e);
                        if(active) editor.commands.setContent("<p>Erro ao ler arquivo Word.</p>");
                     }
                  } else {
                      // Fallback for legacy JSON (.umo)
                      try {
                          const text = await blobToRead.text();
                          const json = JSON.parse(text);
                          if (json.content) editor.commands.setContent(json.content);
                          else editor.commands.setContent(json);
                      } catch (e) {
                          // Try HTML fallback
                          const text = await blobToRead.text();
                          editor.commands.setContent(text);
                      }
                  }
              } else if (fileId.startsWith('new-') || isLocalFile) {
                  if (editor.isEmpty) {
                      editor.commands.setContent(`<h1>${currentName}</h1><p></p>`);
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
      
      const fullName = currentName.endsWith('.docx') ? currentName : `${currentName}.docx`;

      // GENERATE DOCX BLOB
      const jsonContent = editor.getJSON();
      let blob: Blob;
      
      try {
        blob = await generateDocxBlob(jsonContent);
      } catch (e) {
          console.error("Failed to generate docx", e);
          alert("Erro ao gerar arquivo DOCX.");
          setIsSaving(false);
          setSaveStatus('error');
          return;
      }

      if (isLocalFile) {
          setSaveStatus('saved');
          setIsSaving(false);
          return;
      }

      // Offline Save Handling
      if (!navigator.onLine) {
          try {
              await saveOfflineFile({
                  id: fileId,
                  name: fullName,
                  mimeType: MIME_TYPES.DOCX
              }, blob);

              await addToSyncQueue({
                  fileId: fileId,
                  action: 'update',
                  blob: blob,
                  name: fullName,
                  mimeType: MIME_TYPES.DOCX
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
          await updateDriveFile(accessToken, fileId, blob, MIME_TYPES.DOCX);
          setSaveStatus('saved');
          setIsOfflineSaved(false);
      } catch (e: any) {
          console.error("Save failed", e);
          if (e.message !== "Unauthorized") {
              try {
                  await saveOfflineFile({ id: fileId, name: fullName, mimeType: MIME_TYPES.DOCX }, blob);
                  await addToSyncQueue({ fileId: fileId, action: 'update', blob: blob, name: fullName, mimeType: MIME_TYPES.DOCX });
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

  const handleRename = async () => {
      if (isLocalFile || !currentName.trim()) return;
      const newName = currentName.endsWith('.docx') ? currentName : `${currentName}.docx`;
      try {
          await renameDriveFile(accessToken, fileId, newName);
      } catch (e) {
          console.error("Failed to rename", e);
      }
  };

  const handleTrash = async () => {
      if (!window.confirm(`Tem certeza que deseja excluir "${currentName}"?`)) return;
      
      try {
          if (isLocalFile) {
               if (onBack) onBack();
               return;
          }

          if (!navigator.onLine) {
               await deleteOfflineFile(fileId);
          } else {
               await deleteDriveFile(accessToken, fileId);
          }
          
          if (onBack) onBack();
      } catch (e: any) {
          alert("Erro ao excluir: " + e.message);
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

  const handleExportPdf = () => window.print();

  const handleExportHtml = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
      if (!editor) return;
      const json = editor.getJSON();
      const blob = await generateDocxBlob(json);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentName.endsWith('.docx') ? currentName : `${currentName}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleNewDocument = () => {
      if (window.confirm("Isso limpará o documento atual. Deseja continuar?")) {
          editor?.commands.clearContent(true);
          editor?.commands.setContent('<h1>Novo Documento</h1><p></p>');
          setCurrentName('Novo Documento');
          setPageSettings({
            paperSize: 'a4',
            orientation: 'portrait',
            pageColor: '#ffffff',
            marginTop: 2.54, marginBottom: 2.54, marginLeft: 2.54, marginRight: 2.54
          });
          setHeaderContent('');
      }
  };
  
  const openPageSetup = () => {
      setTempPageSettings(pageSettings);
      setShowPageSetup(true);
  };

  const applyPageSetup = () => {
      setPageSettings(tempPageSettings);
      setShowPageSetup(false);
  };

  const handleLanguage = () => {
    alert("Seleção de idioma ainda não implementada.");
  };

  const handleSpellCheck = () => {
    alert("Verificação ortográfica depende do navegador.");
  };

  if (!editor || isLoadingContent) {
    return <div className="flex h-full items-center justify-center bg-bg text-text"><Loader2 className="animate-spin text-brand" /></div>;
  }

  // --- Dynamic Style for "Paged" Look ---
  // We use a Repeating Linear Gradient on the background to simulate page breaks
  // White -> Paper Height -> Gray Gap -> Repeat
  const pagedBackgroundStyle = viewMode === 'paged' ? {
      backgroundImage: `repeating-linear-gradient(
          to bottom,
          ${pageSettings.pageColor} 0px,
          ${pageSettings.pageColor} ${currentPaper.heightPx}px,
          #525659 ${currentPaper.heightPx}px,
          #525659 ${currentPaper.heightPx + currentPaper.pageGap}px
      )`,
      backgroundSize: '100% ' + (currentPaper.heightPx + currentPaper.pageGap) + 'px'
  } : {
      backgroundColor: pageSettings.pageColor
  };

  return (
    <div 
        className="flex flex-col h-full bg-[#18181b] text-text overflow-hidden relative"
        onContextMenu={(e) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            e.preventDefault();
        }}
    >
        {/* Page Setup Modal */}
        {showPageSetup && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
               <div className="bg-[#1e1e1e] text-white rounded-3xl shadow-2xl p-6 w-full max-w-md relative animate-in zoom-in-95 border border-[#444746]">
                  <h3 className="text-2xl font-normal mb-6">Configuração da página</h3>
                  
                  {/* Tabs */}
                  <div className="flex border-b border-[#444746] mb-6">
                      <button className="px-4 py-2 text-[#a8c7fa] border-b-2 border-[#a8c7fa] font-medium">Páginas</button>
                      <button className="px-4 py-2 text-gray-400 cursor-not-allowed">Sem páginas</button>
                  </div>

                  <div className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                     {/* Orientação */}
                     <div className="space-y-2">
                         <label className="text-sm font-medium text-gray-300">Orientação</label>
                         <div className="flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${tempPageSettings.orientation === 'portrait' ? 'border-[#a8c7fa]' : 'border-gray-500'}`}>
                                    {tempPageSettings.orientation === 'portrait' && <div className="w-2 h-2 rounded-full bg-[#a8c7fa]"></div>}
                                </div>
                                <input type="radio" name="orientation" className="hidden" checked={tempPageSettings.orientation === 'portrait'} onChange={() => setTempPageSettings(p => ({...p, orientation: 'portrait'}))} />
                                <span>Retrato</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${tempPageSettings.orientation === 'landscape' ? 'border-[#a8c7fa]' : 'border-gray-500'}`}>
                                    {tempPageSettings.orientation === 'landscape' && <div className="w-2 h-2 rounded-full bg-[#a8c7fa]"></div>}
                                </div>
                                <input type="radio" name="orientation" className="hidden" checked={tempPageSettings.orientation === 'landscape'} onChange={() => setTempPageSettings(p => ({...p, orientation: 'landscape'}))} />
                                <span>Paisagem</span>
                            </label>
                         </div>
                     </div>

                     {/* Tamanho do papel & Cor */}
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                             <label className="text-sm font-medium text-gray-300">Tamanho do papel</label>
                             <div className="relative">
                                <select 
                                    className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 text-sm appearance-none outline-none focus:border-[#a8c7fa] truncate pr-8"
                                    value={tempPageSettings.paperSize}
                                    onChange={(e) => setTempPageSettings(p => ({...p, paperSize: e.target.value}))}
                                >
                                    {Object.entries(PAPER_SIZES).map(([key, size]) => (
                                        <option key={key} value={key}>{size.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                             </div>
                        </div>
                        <div className="space-y-2">
                             <label className="text-sm font-medium text-gray-300">Cor da página</label>
                             <div className="relative">
                                 <div className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-3 py-2 flex items-center gap-2 cursor-pointer relative group">
                                     <div className="w-4 h-4 rounded-full border border-gray-500" style={{ backgroundColor: tempPageSettings.pageColor }}></div>
                                     <input 
                                        type="color" 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        value={tempPageSettings.pageColor}
                                        onChange={(e) => setTempPageSettings(p => ({...p, pageColor: e.target.value}))}
                                     />
                                     <div className="ml-auto text-gray-400 text-xs">▼</div>
                                 </div>
                             </div>
                        </div>
                     </div>

                     {/* Margens */}
                     <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300">Margens (centímetros)</label>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">Início</label>
                                <input type="number" step="0.1" value={tempPageSettings.marginTop} onChange={e => setTempPageSettings(p => ({...p, marginTop: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">Fim</label>
                                <input type="number" step="0.1" value={tempPageSettings.marginBottom} onChange={e => setTempPageSettings(p => ({...p, marginBottom: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">Esquerda</label>
                                <input type="number" step="0.1" value={tempPageSettings.marginLeft} onChange={e => setTempPageSettings(p => ({...p, marginLeft: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400">Direita</label>
                                <input type="number" step="0.1" value={tempPageSettings.marginRight} onChange={e => setTempPageSettings(p => ({...p, marginRight: parseFloat(e.target.value)}))} className="w-full bg-[#2c2c2c] border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-[#a8c7fa] outline-none" />
                            </div>
                        </div>
                     </div>
                  </div>

                  <div className="mt-8 flex justify-end gap-3">
                      <button className="text-[#a8c7fa] font-medium px-4 py-2 hover:bg-[#a8c7fa]/10 rounded transition-colors text-sm">Salvo como padrão</button>
                      <button onClick={() => setShowPageSetup(false)} className="text-[#a8c7fa] font-medium px-6 py-2 hover:bg-[#a8c7fa]/10 rounded-full transition-colors border border-transparent">Cancelar</button>
                      <button onClick={applyPageSetup} className="bg-[#a8c7fa] text-[#0b141a] font-medium px-6 py-2 rounded-full hover:bg-[#d8e5ff] transition-colors">OK</button>
                  </div>
               </div>
            </div>
        )}

        {/* Word Count Modal */}
        {showWordCount && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-surface border border-border rounded-xl shadow-2xl p-6 w-full max-w-sm relative animate-in zoom-in-95">
                    <button onClick={() => setShowWordCount(false)} className="absolute top-4 right-4 text-text-sec hover:text-text"><X size={20}/></button>
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Type size={20} className="text-brand"/> Contagem de Palavras</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-text-sec">Palavras</span>
                            <span className="text-2xl font-mono font-bold">{stats.words}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-text-sec">Caracteres</span>
                            <span className="text-2xl font-mono font-bold">{stats.chars}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-text-sec">Caracteres (sem espaço)</span>
                            <span className="text-2xl font-mono font-bold">{stats.charsNoSpace}</span>
                        </div>
                    </div>
                    <button onClick={() => setShowWordCount(false)} className="w-full mt-6 bg-brand text-bg font-bold py-2 rounded-lg">OK</button>
                </div>
            </div>
        )}

        {/* Header - Google Docs Style */}
        <div className="border-b border-border flex flex-col bg-[#1e1e20] shrink-0 z-50 no-print">
            <div className="flex items-center justify-between px-3 pt-2 pb-0">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full text-text-sec hover:text-text">
                            <ArrowLeft size={20} />
                        </button>
                    )}
                    <div className="bg-[#4285f4] p-1.5 rounded text-white">
                        <FileIcon size={20} fill="currentColor" className="text-white" />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <input 
                                ref={titleInputRef}
                                className="bg-transparent text-lg font-medium text-text outline-none border border-transparent hover:border-border rounded px-1 -ml-1 focus:border-brand focus:bg-black/20 truncate max-w-[200px] md:max-w-md"
                                value={currentName}
                                onChange={(e) => setCurrentName(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                            
                            <button 
                                onClick={() => setIsStarred(!isStarred)}
                                className={`p-1 rounded-full hover:bg-white/10 transition-colors ${isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-text-sec hover:text-text'}`}
                            >
                                <Star size={18} fill={isStarred ? "currentColor" : "none"} />
                            </button>

                            <div className="ml-2 text-text-sec">
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : saveStatus === 'error' ? <WifiOff size={18} className="text-red-400" /> : isOfflineSaved ? <CloudOff size={18} /> : <CheckCircle2 size={18} className="text-text-sec" />}
                            </div>
                        </div>

                        <TopMenuBar 
                            editor={editor}
                            fileName={currentName}
                            onSave={handleSave}
                            onNew={handleNewDocument}
                            onRename={() => titleInputRef.current?.focus()}
                            onWordCount={() => setShowWordCount(true)}
                            onDownload={handleDownload}
                            onExportPdf={handleExportPdf}
                            onExportHtml={handleExportHtml}
                            onInsertImage={() => fileInputRef.current?.click()}
                            onTrash={handleTrash}
                            onPageSetup={openPageSetup}
                            onPrint={() => window.print()}
                            onLanguage={handleLanguage}
                            onSpellCheck={handleSpellCheck}
                            zoom={zoom}
                            setZoom={setZoom}
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            showRuler={showRuler}
                            setShowRuler={setShowRuler}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                   <button onClick={onToggleMenu} className="p-2 md:hidden hover:bg-white/10 rounded-full text-text-sec">
                       <Menu size={24} />
                   </button>
                </div>
            </div>
        </div>

        {/* Editor Workspace */}
        <div 
            className="flex-1 overflow-y-auto bg-[#1b1b1f] p-4 md:p-8 custom-scrollbar flex justify-center cursor-text relative" 
            onClick={(e) => {
                // Focus editor if clicking in the gray area
                if (e.target === e.currentTarget) editor.commands.focus();
            }}
        >
             <div className="relative flex flex-col items-center">
                 
                 {/* Ruler (Attached to Page Top) */}
                 {showRuler && viewMode === 'paged' && (
                    <div className="sticky top-0 z-30 mb-2 no-print" style={{ width: viewMode === 'continuous' ? '100%' : `${currentPaper.widthPx}px` }}>
                       <Ruler marginLeft={pageSettings.marginLeft} marginRight={pageSettings.marginRight} width={currentPaper.widthPx} />
                    </div>
                 )}

                 {/* The Page Container - "This is the text container" */}
                 {/* The Paged Background Trick applied here */}
                 <div 
                    ref={contentRef}
                    className={`shadow-xl transition-all duration-300 relative print:shadow-none print:m-0 print:bg-white`}
                    style={{
                        // Dimensions
                        width: viewMode === 'continuous' ? '100%' : `${currentPaper.widthPx}px`,
                        // Use min-height so it grows, but styling simulates pages
                        minHeight: `${currentPaper.heightPx}px`,
                        
                        // Margins (Padding on the paper)
                        paddingTop: `${pageSettings.marginTop}cm`,
                        paddingBottom: `${pageSettings.marginBottom}cm`,
                        paddingLeft: `${pageSettings.marginLeft}cm`,
                        paddingRight: `${pageSettings.marginRight}cm`,
                        
                        // Scale for zoom
                        transform: viewMode === 'continuous' ? 'none' : `scale(${zoom})`,
                        transformOrigin: 'top center',
                        marginBottom: '100px',
                        
                        // Background Style (Gradient for Pages)
                        ...pagedBackgroundStyle
                    }}
                >
                    {/* Header Area inside the Margin */}
                    <div 
                        className="absolute left-0 right-0 top-0 group hover:bg-gray-50/50 transition-colors z-20 no-print"
                        style={{ 
                            height: `${pageSettings.marginTop}cm`, 
                            paddingLeft: `${pageSettings.marginLeft}cm`, 
                            paddingRight: `${pageSettings.marginRight}cm`,
                            paddingTop: '0.5cm'
                        }}
                    >
                         <div className="w-full h-full relative">
                            {!headerContent && (
                                <span className="absolute top-0 left-0 text-xs text-gray-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                                    Cabeçalho
                                </span>
                            )}
                            <div 
                              contentEditable
                              suppressContentEditableWarning
                              className="w-full h-full outline-none text-sm text-gray-500"
                              onBlur={(e) => setHeaderContent(e.currentTarget.innerText)}
                              dangerouslySetInnerHTML={{ __html: headerContent }}
                            />
                         </div>
                    </div>

                    <AiBubbleMenu editor={editor} />
                    
                    {/* Image Bubble Menu */}
                    {editor.isActive('image') && (
                        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} shouldShow={({ editor }) => editor.isActive('image')}>
                            <div className="flex bg-surface shadow-xl border border-border rounded-lg p-1 gap-1">
                                <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className="p-2 hover:bg-white/10 rounded text-text"><AlignLeft size={16}/></button>
                                <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className="p-2 hover:bg-white/10 rounded text-text"><AlignCenter size={16}/></button>
                                <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className="p-2 hover:bg-white/10 rounded text-text"><AlignRight size={16}/></button>
                                <div className="w-px bg-border mx-1"></div>
                                <button onClick={() => editor.commands.updateAttributes('image', { style: `width: 25%` })} className="p-2 hover:bg-white/10 rounded text-text text-xs font-bold">25%</button>
                                <button onClick={() => editor.commands.updateAttributes('image', { style: `width: 50%` })} className="p-2 hover:bg-white/10 rounded text-text text-xs font-bold">50%</button>
                                <button onClick={() => editor.commands.updateAttributes('image', { style: `width: 100%` })} className="p-2 hover:bg-white/10 rounded text-text text-xs font-bold">100%</button>
                            </div>
                        </BubbleMenu>
                    )}

                    {/* The Editor (Content Flow) */}
                    <EditorContent editor={editor} />
                </div>
            </div>
        </div>

        <div className="no-print">
            <DocToolbar editor={editor} onInsertImage={() => fileInputRef.current?.click()} />
        </div>
        
        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
    </div>
  );
};
