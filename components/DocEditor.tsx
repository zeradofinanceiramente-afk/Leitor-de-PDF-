import React, { useEffect, useState, useRef } from 'react';
import Editor from '@hufe921/canvas-editor';
import { Menu, ArrowLeft, Loader2, WifiOff, CloudOff, CheckCircle2, FileText as FileIcon, Star } from 'lucide-react';

import { DocToolbar } from './doc/DocToolbar';
import { TopMenuBar } from './doc/TopMenuBar';

import { updateDriveFile, downloadDriveFile, renameDriveFile, deleteDriveFile } from '../services/driveService';
import { saveOfflineFile, addToSyncQueue, deleteOfflineFile } from '../services/storageService';
import { MIME_TYPES } from '../types';

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
  const [editor, setEditor] = useState<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'error'>('saved');
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(true);
  
  const [currentName, setCurrentName] = useState(fileName.replace(MIME_TYPES.CEDITOR_EXT, '').replace('.docx', '').replace('.umo', ''));
  const [isStarred, setIsStarred] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocalFile = fileId.startsWith('local-') || !accessToken;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- INITIALIZE EDITOR ---
  useEffect(() => {
    let instance: Editor | null = null;
    
    if (containerRef.current) {
        // Initialize the Canvas Editor
        instance = new Editor(containerRef.current, [], {
            // Optionals from API
            pageNumber: {
                format: 'Página {no} de {total}',
            },
            header: [
                {
                    value: 'Documento',
                }
            ]
        });
        setEditor(instance);

        // Resize observer to handle window resizing
        const resizeObserver = new ResizeObserver(() => {
            // Currently canvas-editor doesn't have an auto-resize method exposed publicly in docs widely, 
            // but we can try re-rendering or just letting it handle via CSS container
            // Some versions might need instance.render() called
        });
        resizeObserver.observe(containerRef.current);

        // Listener for changes to trigger auto-save status
        // Note: canvas-editor listener API might vary, assuming a standard one or manual trigger
        // For this implementation, we will assume user triggers save or we poll/hook into command execution wrapper if needed.
        // A simple workaround for "unsaved" status is wrapping the toolbar commands.
    }

    return () => {
        if (instance) {
            instance.destroy();
        }
    };
  }, []);

  // --- LOAD CONTENT ---
  useEffect(() => {
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
                  try {
                      const text = await blobToRead.text();
                      const json = JSON.parse(text);
                      // Validar se é um array (formato do canvas-editor)
                      if (Array.isArray(json)) {
                          editor.command.executeSetValue(json);
                      } else {
                          // Fallback para arquivos antigos ou texto plano
                          console.warn("Formato desconhecido, carregando como texto plano");
                          editor.command.executeSetValue([{ value: text }]);
                      }
                  } catch (e) {
                      console.error("Erro ao ler arquivo", e);
                      editor.command.executeSetValue([{ value: "Erro ao carregar conteúdo." }]);
                  }
              } else if (fileId.startsWith('new-') || isLocalFile) {
                  // New empty document
                  editor.command.executeSetValue([]);
              }
              setSaveStatus('saved');
              setIsLoadingContent(false);
          }
      };
      
      if (editor) {
          load();
      }
  }, [editor, fileId, accessToken]);

  // --- SAVE LOGIC ---
  const handleSave = async () => {
      if (!editor) return;
      setIsSaving(true);
      
      const fullName = currentName.endsWith(MIME_TYPES.CEDITOR_EXT) ? currentName : `${currentName}${MIME_TYPES.CEDITOR_EXT}`;
      
      // Get JSON Data from Editor
      const data = editor.command.getValue();
      const jsonString = JSON.stringify(data);
      const blob = new Blob([jsonString], { type: 'application/json' });

      if (isLocalFile) {
          // Download locally if it's a local file
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fullName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setSaveStatus('saved');
          setIsSaving(false);
          return;
      }

      // Offline Handling
      if (!navigator.onLine) {
          try {
              await saveOfflineFile({
                  id: fileId,
                  name: fullName,
                  mimeType: 'application/json'
              }, blob);
              
              await addToSyncQueue({
                  fileId: fileId,
                  action: 'update',
                  blob: blob,
                  name: fullName,
                  mimeType: 'application/json'
              });

              setSaveStatus('saved');
              setIsOfflineSaved(true);
          } catch (e) {
              setSaveStatus('error');
          } finally {
              setIsSaving(false);
          }
          return;
      }

      // Online Save
      try {
          await updateDriveFile(accessToken, fileId, blob, 'application/json');
          setSaveStatus('saved');
          setIsOfflineSaved(false);
      } catch (e: any) {
          console.error("Save failed", e);
          setSaveStatus('error');
          if (onAuthError && e.message === "Unauthorized") onAuthError();
      } finally {
          setIsSaving(false);
      }
  };

  const handleRename = async () => {
      if (isLocalFile || !currentName.trim()) return;
      const newName = currentName.endsWith(MIME_TYPES.CEDITOR_EXT) ? currentName : `${currentName}${MIME_TYPES.CEDITOR_EXT}`;
      try {
          await renameDriveFile(accessToken, fileId, newName);
      } catch (e) {
          console.error("Failed to rename", e);
      }
  };

  const handleInsertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && editor) {
          const reader = new FileReader();
          reader.onload = (event) => {
              const base64 = event.target?.result as string;
              if (base64) {
                  editor.command.executeInsertImage(100, 100, base64);
              }
          };
          reader.readAsDataURL(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- ACTIONS ---
  const handlePrint = () => {
      editor?.command.executePrint();
  };

  const handlePageSetup = () => {
     editor?.command.executePageSetting();
  };

  const handleSearch = () => {
     editor?.command.executeSearch(null); // Opens search dialog if supported or implements custom
  };

  if (isLoadingContent) {
      return <div className="flex h-full items-center justify-center bg-bg text-text"><Loader2 className="animate-spin text-brand" /></div>;
  }

  return (
    <div className="flex flex-col h-screen bg-[#f1f1f1] text-text relative overflow-hidden">
        
        {/* Header - Google Docs Style */}
        <div className="border-b border-gray-300 flex flex-col bg-white shrink-0 z-50 no-print">
            <div className="flex items-center justify-between px-3 pt-2 pb-0">
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
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
                                className="bg-transparent text-lg font-medium text-gray-800 outline-none border border-transparent hover:border-gray-400 rounded px-1 -ml-1 focus:border-blue-500 focus:bg-white truncate max-w-[200px] md:max-w-md"
                                value={currentName}
                                onChange={(e) => setCurrentName(e.target.value)}
                                onBlur={handleRename}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                            
                            <button 
                                onClick={() => setIsStarred(!isStarred)}
                                className={`p-1 rounded-full hover:bg-gray-100 transition-colors ${isStarred ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <Star size={18} fill={isStarred ? "currentColor" : "none"} />
                            </button>

                            <div className="ml-2 text-gray-500">
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : saveStatus === 'error' ? <WifiOff size={18} className="text-red-400" /> : isOfflineSaved ? <CloudOff size={18} /> : <CheckCircle2 size={18} className="text-gray-400" />}
                            </div>
                        </div>

                        <TopMenuBar 
                            editor={editor}
                            fileName={currentName}
                            onSave={handleSave}
                            onPrint={handlePrint}
                            onPageSetup={handlePageSetup}
                            onSearch={handleSearch}
                            onInsertImage={() => fileInputRef.current?.click()}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                   <button onClick={onToggleMenu} className="p-2 md:hidden hover:bg-gray-100 rounded-full text-gray-600">
                       <Menu size={24} />
                   </button>
                </div>
            </div>
        </div>

        {/* Editor Container */}
        <div className="flex-1 overflow-hidden relative bg-[#f1f1f1] flex justify-center">
            <div 
                ref={containerRef} 
                className="w-full h-full"
                style={{ overflowY: 'auto' }}
            >
                {/* Canvas will be injected here by @hufe921/canvas-editor */}
            </div>
        </div>

        {/* Floating Toolbar */}
        <div className="no-print">
            <DocToolbar editor={editor} onInsertImage={() => fileInputRef.current?.click()} />
        </div>
        
        <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleInsertImage} />
    </div>
  );
};