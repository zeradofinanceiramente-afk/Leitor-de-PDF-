
import React, { useEffect, useState, useRef } from 'react';
import { listDriveContents, searchMindMaps, renameDriveFile, deleteDriveFile, moveDriveFile, downloadDriveFile } from '../services/driveService';
import { isFileOffline, saveOfflineFile, removeOfflineFile } from '../services/storageService';
import { DriveFile } from '../types';
import { FileText, Loader2, Search, LayoutGrid, List as ListIcon, AlertTriangle, Menu, Folder, ChevronRight, Home, HardDrive, Users, Star, MoreVertical, Trash2, Edit2, FolderInput, X, Check, ArrowLeft, Workflow, Plus, CheckCircle, WifiOff, Cloud, DownloadCloud } from 'lucide-react';

interface Props {
  accessToken: string;
  onSelectFile: (file: DriveFile) => void;
  onLogout: () => void;
  onAuthError: () => void;
  onToggleMenu: () => void;
  onCreateMindMap?: () => void;
  mode?: 'default' | 'mindmaps';
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

const SECTIONS = [
  { id: 'root', name: 'Meu Drive', icon: HardDrive },
  { id: 'shared-with-me', name: 'Compartilhados', icon: Users },
  { id: 'starred', name: 'Com Estrela', icon: Star },
];

export const DriveBrowser: React.FC<Props> = ({ accessToken, onSelectFile, onAuthError, onToggleMenu, onCreateMindMap, mode = 'default' }) => {
  const [currentFolder, setCurrentFolder] = useState<BreadcrumbItem>(
    mode === 'mindmaps' 
      ? { id: 'mindmaps', name: 'Meus Mapas Mentais' } 
      : SECTIONS[0]
  );
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Offline State
  const [offlineStatus, setOfflineStatus] = useState<Record<string, boolean>>({});
  const [isProcessingOffline, setIsProcessingOffline] = useState(false);

  // Action States
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [actionFile, setActionFile] = useState<DriveFile | null>(null);
  
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showMoveModal, setShowMoveModal] = useState(false);
  
  // Check offline status for loaded files
  useEffect(() => {
    const checkOffline = async () => {
        const status: Record<string, boolean> = {};
        for (const file of files) {
            if (file.mimeType !== 'application/vnd.google-apps.folder') {
                status[file.id] = await isFileOffline(file.id);
            }
        }
        setOfflineStatus(status);
    };
    if (files.length > 0) {
        checkOffline();
    }
  }, [files]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setSearch('');

    const fetcher = currentFolder.id === 'mindmaps' 
        ? searchMindMaps(accessToken) 
        : listDriveContents(accessToken, currentFolder.id);

    fetcher
      .then(data => {
        if (mounted) {
          let sorted = data;
          
          if (currentFolder.id !== 'mindmaps') {
             sorted = data.sort((a, b) => {
                const isFolderA = a.mimeType === 'application/vnd.google-apps.folder';
                const isFolderB = b.mimeType === 'application/vnd.google-apps.folder';
                
                if (isFolderA && !isFolderB) return -1;
                if (!isFolderA && isFolderB) return 1;
                return a.name.localeCompare(b.name);
             });
          }
          
          setFiles(sorted);
          setFilteredFiles(sorted);
        }
      })
      .catch(err => {
        if (mounted) {
          console.error(err);
          if (err.message === "Unauthorized" || err.message.includes("401")) {
            onAuthError();
          } else {
            setError(err.message);
          }
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [accessToken, currentFolder.id, onAuthError]);

  useEffect(() => {
    const results = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));
    setFilteredFiles(results);
  }, [search, files]);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSectionClick = (sectionId: string) => {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (section) {
      setCurrentFolder(section);
      setBreadcrumbs([]);
    }
  };

  const handleFolderClick = (folder: DriveFile) => {
    setBreadcrumbs(prev => [...prev, currentFolder]);
    setCurrentFolder({ id: folder.id, name: folder.name });
  };

  const handleBreadcrumbClick = (item: BreadcrumbItem, index: number) => {
    if (mode === 'mindmaps' && index === 0 && item.id === 'mindmaps') {
        setCurrentFolder({ id: 'mindmaps', name: 'Meus Mapas Mentais' });
        setBreadcrumbs([]);
        return;
    }

    if (SECTIONS.some(s => s.id === item.id)) {
      setBreadcrumbs([]);
      setCurrentFolder(item);
      return;
    }

    const targetIndex = breadcrumbs.findIndex(b => b.id === item.id);
    if (targetIndex !== -1) {
      setBreadcrumbs(breadcrumbs.slice(0, targetIndex));
      setCurrentFolder(item);
    }
  };

  const handleItemClick = (file: DriveFile) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      handleFolderClick(file);
    } else {
      onSelectFile(file);
    }
  };

  // --- Actions Handlers ---

  const handleToggleOffline = async (e: React.MouseEvent, file: DriveFile) => {
      e.stopPropagation();
      setIsProcessingOffline(true);
      setActiveMenuId(null); // Close menu
      
      try {
          const isOffline = offlineStatus[file.id];
          
          if (isOffline) {
              // Remove
              await removeOfflineFile(file.id);
              setOfflineStatus(prev => ({ ...prev, [file.id]: false }));
              alert("Arquivo removido do armazenamento offline.");
          } else {
              // Add (Download & Save)
              if (!navigator.onLine) {
                  alert("Você precisa estar online para tornar este arquivo disponível offline.");
                  return;
              }
              
              // Visual Feedback (Toast could be better, using alert/console for simplicity)
              console.log("Baixando para offline...");
              
              const blob = await downloadDriveFile(accessToken, file.id);
              await saveOfflineFile(file, blob, false);
              
              setOfflineStatus(prev => ({ ...prev, [file.id]: true }));
              alert("Arquivo baixado! Agora disponível offline.");
          }
      } catch (err: any) {
          console.error("Erro ao gerenciar offline:", err);
          alert("Erro: " + err.message);
      } finally {
          setIsProcessingOffline(false);
      }
  };

  const openActionMenu = (e: React.MouseEvent, file: DriveFile) => {
    e.stopPropagation();
    setActiveMenuId(file.id);
    setActionFile(file);
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionFile) {
      setRenameValue(actionFile.name);
      setShowRenameModal(true);
      setActiveMenuId(null);
    }
  };

  const confirmRename = async () => {
    if (!actionFile || !renameValue.trim()) return;
    setIsRenaming(true);
    try {
      await renameDriveFile(accessToken, actionFile.id, renameValue);
      const updatedFiles = files.map(f => f.id === actionFile.id ? { ...f, name: renameValue } : f);
      setFiles(updatedFiles);
      setFilteredFiles(updatedFiles);
      setShowRenameModal(false);
    } catch (e: any) {
      alert("Erro ao renomear: " + e.message);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionFile) {
      setShowDeleteModal(true);
      setActiveMenuId(null);
    }
  };

  const confirmDelete = async () => {
    if (!actionFile) return;
    setIsDeleting(true);
    try {
      await deleteDriveFile(accessToken, actionFile.id);
      const updatedFiles = files.filter(f => f.id !== actionFile.id);
      setFiles(updatedFiles);
      setFilteredFiles(updatedFiles);
      setShowDeleteModal(false);
    } catch (e: any) {
      alert("Erro ao excluir: " + e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (actionFile) {
        setShowMoveModal(true);
        setActiveMenuId(null);
    }
  };

  const activeSectionId = breadcrumbs.length > 0 ? breadcrumbs[0].id : currentFolder.id;

  if (error) {
    return (
      <div className="flex flex-col h-full bg-bg text-text p-10 items-center justify-center text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
          <AlertTriangle size={40} />
        </div>
        <h3 className="text-2xl font-semibold mb-3">Erro ao carregar arquivos</h3>
        <p className="text-text-sec mb-8 max-w-md text-lg">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-surface border border-border rounded-full hover:bg-white/5 transition text-lg"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-bg text-text overflow-hidden">
      
      {/* Modals omitted for brevity, logic identical to original ... */}
      {/* Rename Modal */}
      {showRenameModal && actionFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
             <h3 className="text-xl font-bold mb-4">Renomear Arquivo</h3>
             <input 
               type="text" 
               value={renameValue} 
               onChange={(e) => setRenameValue(e.target.value)}
               className="w-full bg-bg border border-border rounded-lg p-3 text-text mb-6 focus:border-brand outline-none"
               autoFocus
             />
             <div className="flex justify-end gap-3">
               <button onClick={() => setShowRenameModal(false)} className="px-4 py-2 text-text-sec hover:text-text">Cancelar</button>
               <button onClick={confirmRename} disabled={isRenaming} className="px-4 py-2 bg-brand text-bg font-bold rounded-lg flex items-center gap-2">
                 {isRenaming && <Loader2 size={16} className="animate-spin" />}
                 Salvar
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && actionFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-surface border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
                <Trash2 size={24} />
             </div>
             <h3 className="text-xl font-bold mb-2">Excluir Arquivo?</h3>
             <p className="text-text-sec mb-6">
                Tem certeza que deseja excluir <strong>"{actionFile.name}"</strong>? Esta ação enviará o arquivo para a lixeira do Drive.
             </p>
             <div className="flex justify-end gap-3">
               <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-text-sec hover:text-text">Cancelar</button>
               <button onClick={confirmDelete} disabled={isDeleting} className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg flex items-center gap-2">
                 {isDeleting && <Loader2 size={16} className="animate-spin" />}
                 Excluir
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && actionFile && (
         <MoveFileModal 
           accessToken={accessToken} 
           file={actionFile} 
           onClose={() => setShowMoveModal(false)}
           onSuccess={() => {
              setShowMoveModal(false);
              setFiles(prev => prev.filter(f => f.id !== actionFile.id));
              setFilteredFiles(prev => prev.filter(f => f.id !== actionFile.id));
           }}
         />
      )}

      {/* Drive Sidebar (Desktop) */}
      {mode !== 'mindmaps' && (
        <div className="hidden md:flex flex-col w-80 bg-surface/30 border-r border-border p-6 gap-3 shrink-0">
          <div className="text-sm font-bold text-text-sec uppercase tracking-wider mb-2 px-4">Organização</div>
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = activeSectionId === section.id;
            return (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                className={`flex items-center gap-4 px-5 py-4 rounded-2xl text-base font-medium transition-all ${
                  isActive 
                    ? 'bg-brand/10 text-brand' 
                    : 'text-text-sec hover:text-text hover:bg-surface'
                }`}
              >
                <Icon size={22} />
                <span>{section.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative">
        <div className="flex flex-col gap-6 p-6 md:p-10 pb-0">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <button onClick={onToggleMenu} className="custom-menu-btn p-3 -ml-3 text-text-sec hover:text-text rounded-full hover:bg-surface transition">
                <Menu size={32} />
              </button>
              <div className="flex items-center gap-4">
                 <h2 className="text-3xl md:text-5xl font-normal tracking-tight truncate">{currentFolder.name}</h2>
                 {mode === 'mindmaps' && onCreateMindMap && (
                     <button 
                       onClick={onCreateMindMap}
                       className="p-2 md:px-4 md:py-2 bg-brand text-bg rounded-full md:rounded-xl font-bold flex items-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-brand/20"
                       title="Criar Novo Mapa Mental"
                     >
                        <Plus size={24} />
                        <span className="hidden md:inline">Novo</span>
                     </button>
                 )}
              </div>
            </div>
            
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-96 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-sec group-focus-within:text-brand transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="Pesquisar..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-surface border border-border focus:border-brand rounded-full py-3 pl-12 pr-6 text-base outline-none transition-all placeholder:text-text-sec text-text"
                />
              </div>

              <div className="bg-surface border border-border p-1.5 rounded-full flex shrink-0">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-3 rounded-full transition-all ${viewMode === 'grid' ? 'bg-bg text-brand shadow-sm' : 'text-text-sec hover:text-text'}`}
                >
                  <LayoutGrid size={20} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-3 rounded-full transition-all ${viewMode === 'list' ? 'bg-bg text-brand shadow-sm' : 'text-text-sec hover:text-text'}`}
                >
                  <ListIcon size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Breadcrumbs */}
          {mode !== 'mindmaps' && (
            <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none text-base min-h-[40px]">
               {breadcrumbs.length > 0 && (
                 <>
                    <button 
                      onClick={() => handleBreadcrumbClick(breadcrumbs[0], 0)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface transition-colors text-text-sec"
                    >
                      {SECTIONS.some(s => s.id === breadcrumbs[0].id) ? (
                          <>
                             {(() => {
                                 const S = SECTIONS.find(s => s.id === breadcrumbs[0].id);
                                 const Icon = S ? S.icon : Home;
                                 return <Icon size={18} />;
                             })()}
                             <span>{breadcrumbs[0].name}</span>
                          </>
                      ) : (
                          <span>{breadcrumbs[0].name}</span>
                      )}
                    </button>
                    <ChevronRight size={18} className="text-text-sec shrink-0" />
                 </>
               )}
               
               {breadcrumbs.length === 0 && (
                   <div className="flex items-center gap-2 px-3 py-1.5 text-text font-medium">
                       {(() => {
                           const S = SECTIONS.find(s => s.id === currentFolder.id);
                           const Icon = S ? S.icon : Home;
                           return <Icon size={18} />;
                       })()}
                       <span>{currentFolder.name}</span>
                   </div>
               )}

              {breadcrumbs.slice(1).map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <button 
                    onClick={() => handleBreadcrumbClick(crumb, idx + 1)}
                    className="px-3 py-1.5 rounded-lg hover:bg-surface transition-colors text-text-sec whitespace-nowrap"
                  >
                    {crumb.name}
                  </button>
                  <ChevronRight size={18} className="text-text-sec shrink-0" />
                </React.Fragment>
              ))}
              
              {breadcrumbs.length > 0 && (
                  <span className="px-3 py-1.5 text-text font-medium whitespace-nowrap">{currentFolder.name}</span>
              )}
            </div>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-24 custom-scrollbar">
          {loading && (
            <div className="flex flex-col h-full items-center justify-center gap-4 opacity-50">
              <Loader2 className="animate-spin h-12 w-12 text-brand" />
              <span className="text-lg">Carregando...</span>
            </div>
          )}

          {!loading && !error && (
             <>
               {filteredFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-80 text-text-sec/50 gap-6">
                     <Folder size={80} strokeWidth={1} />
                     <p className="text-xl">Pasta vazia</p>
                  </div>
               ) : (
                 <div className={viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 pb-10" : "flex flex-col gap-4 pb-10"}>
                    {/* Back button logic same as before... */}
                    {mode !== 'mindmaps' && breadcrumbs.length > 0 && search === '' && (
                        viewMode === 'grid' ? (
                          <button
                            onClick={() => {
                              const prev = breadcrumbs[breadcrumbs.length - 1];
                              const newCrumbs = breadcrumbs.slice(0, -1);
                              setBreadcrumbs(newCrumbs);
                              setCurrentFolder(prev);
                            }}
                            className="flex flex-col p-8 rounded-[2rem] bg-surface/50 border border-border border-dashed hover:border-text-sec transition-all text-left items-center justify-center min-h-[220px] group"
                          >
                              <div className="h-16 w-16 rounded-full bg-surface flex items-center justify-center text-text-sec mb-4 group-hover:scale-110 transition-transform">
                                <ChevronRight size={32} className="rotate-180"/>
                              </div>
                              <span className="text-lg text-text-sec">Voltar</span>
                          </button>
                        ) : (
                            <button
                            onClick={() => {
                                const prev = breadcrumbs[breadcrumbs.length - 1];
                                setBreadcrumbs(breadcrumbs.slice(0, -1));
                                setCurrentFolder(prev);
                            }}
                            className="flex items-center gap-6 p-6 rounded-3xl bg-surface/30 hover:bg-surface transition-all text-left border border-border border-dashed text-text-sec"
                          >
                              <div className="h-12 w-12 flex items-center justify-center">
                                  <ChevronRight size={24} className="rotate-180"/>
                              </div>
                              <span className="text-lg">Voltar</span>
                          </button>
                        )
                    )}

                    {filteredFiles.map(file => {
                      const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                      const isMindMap = file.name.endsWith('.mindmap');
                      const isMenuOpen = activeMenuId === file.id;
                      const isOffline = offlineStatus[file.id];

                      return (
                        <div key={file.id} className="relative group">
                          {viewMode === 'grid' ? (
                            <button
                              onClick={() => handleItemClick(file)}
                              className="w-full group flex flex-col rounded-[2rem] bg-surface hover:brightness-110 transition-all border border-border hover:border-brand/30 text-left relative overflow-hidden shadow-sm hover:shadow-xl min-h-[260px] p-0"
                            >
                              <div className="h-44 w-full bg-bg/50 relative border-b border-border/50 overflow-hidden">
                                {file.thumbnailLink && !isFolder && !isMindMap ? (
                                   <img 
                                     src={file.thumbnailLink} 
                                     alt="" 
                                     className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" 
                                   />
                                ) : (
                                   <div className={`w-full h-full flex items-center justify-center ${isFolder ? 'text-blue-400' : isMindMap ? 'text-purple-400' : 'text-brand'}`}>
                                      {isFolder ? <Folder size={48} fill="currentColor" className="opacity-50" /> : 
                                       isMindMap ? <Workflow size={48} /> : 
                                       <FileText size={48} />}
                                   </div>
                                )}
                                
                                {file.starred && (
                                   <div className="absolute top-4 right-4 bg-surface/80 backdrop-blur p-1.5 rounded-full shadow-sm border border-border">
                                     <Star size={16} className="text-yellow-400 fill-yellow-400" />
                                   </div>
                                )}
                              </div>

                              <div className="p-6 flex flex-col flex-1 w-full relative">
                                 <div className="flex-1 pr-6 flex items-start justify-between">
                                    <p className="font-medium text-text group-hover:text-brand transition-colors text-lg leading-tight line-clamp-2" title={file.name}>
                                      {file.name}
                                    </p>
                                    {isOffline && <CheckCircle size={18} className="text-green-500 shrink-0 ml-2" />}
                                 </div>
                                 <p className="text-sm text-text-sec mt-3">
                                    {isFolder ? 'Pasta' : isMindMap ? 'Mapa Mental' : 'PDF'}
                                 </p>
                                 
                                 <div className="absolute right-4 bottom-4">
                                     <div 
                                      className="p-2 rounded-full hover:bg-bg/50 text-text-sec hover:text-text transition-colors"
                                      onClick={(e) => openActionMenu(e, file)}
                                     >
                                       <MoreVertical size={20} />
                                     </div>
                                 </div>
                              </div>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleItemClick(file)}
                              className="w-full group flex items-center gap-6 p-5 rounded-3xl bg-surface hover:brightness-110 transition-all text-left border border-border hover:border-brand/30"
                            >
                              <div className={`h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 ${isFolder ? 'bg-blue-500/10 text-blue-400' : isMindMap ? 'bg-purple-500/10 text-purple-400' : 'bg-brand/10 text-brand'}`}>
                                {isFolder ? <Folder size={28} fill="currentColor" className="opacity-50"/> : 
                                 isMindMap ? <Workflow size={28} /> :
                                 <FileText size={28} />}
                              </div>
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <p className="font-medium truncate text-text text-lg">{file.name}</p>
                                {isOffline && <CheckCircle size={16} className="text-green-500" />}
                              </div>
                              <span className="text-base text-text-sec hidden sm:block w-32">
                                {isFolder ? 'Pasta' : isMindMap ? 'Mapa Mental' : 'PDF'}
                              </span>
                              
                              <div 
                                className="p-2 rounded-full hover:bg-bg text-text-sec hover:text-text transition-colors shrink-0"
                                onClick={(e) => openActionMenu(e, file)}
                              >
                                <MoreVertical size={20} />
                              </div>
                            </button>
                          )}

                          {/* Action Dropdown Menu */}
                          {isMenuOpen && (
                             <div className="absolute z-30 right-4 bottom-10 md:bottom-auto md:top-10 bg-surface border border-border rounded-xl shadow-2xl p-1.5 flex flex-col min-w-[180px] animate-in zoom-in-95 duration-100 origin-top-right">
                                {!isFolder && (
                                    <>
                                        <button 
                                            onClick={(e) => handleToggleOffline(e, file)} 
                                            disabled={isProcessingOffline}
                                            className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 rounded-lg text-sm text-text text-left transition-colors"
                                        >
                                            {isOffline ? <WifiOff size={16} className="text-text-sec"/> : <DownloadCloud size={16} className="text-brand"/>}
                                            {isOffline ? 'Remover Offline' : 'Disponível Offline'}
                                        </button>
                                        <div className="h-px bg-border my-1"></div>
                                    </>
                                )}
                                <button 
                                  onClick={handleRenameClick} 
                                  className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 rounded-lg text-sm text-text text-left transition-colors"
                                >
                                   <Edit2 size={16} /> Renomear
                                </button>
                                <button 
                                  onClick={handleMoveClick}
                                  className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 rounded-lg text-sm text-text text-left transition-colors"
                                >
                                   <FolderInput size={16} /> Mover
                                </button>
                                <div className="h-px bg-border my-1"></div>
                                <button 
                                  onClick={handleDeleteClick} 
                                  className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-red-500/10 rounded-lg text-sm text-red-400 hover:text-red-300 text-left transition-colors"
                                >
                                   <Trash2 size={16} /> Excluir
                                </button>
                             </div>
                          )}
                        </div>
                      );
                    })}
                 </div>
               )}
             </>
          )}
        </div>
      </div>
    </div>
  );
};

// ... MoveFileModal Component (unchanged) ...
interface MoveFileModalProps {
  accessToken: string;
  file: DriveFile;
  onClose: () => void;
  onSuccess: () => void;
}

const MoveFileModal: React.FC<MoveFileModalProps> = ({ accessToken, file, onClose, onSuccess }) => {
    // ... Copy-paste existing logic here, omitted for brevity as it is unchanged ...
    const [currentFolder, setCurrentFolder] = useState<BreadcrumbItem>({ id: 'root', name: 'Meu Drive' });
    const [folderHistory, setFolderHistory] = useState<BreadcrumbItem[]>([]);
    const [folders, setFolders] = useState<DriveFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [moving, setMoving] = useState(false);
  
    useEffect(() => {
      let active = true;
      setLoading(true);
      listDriveContents(accessToken, currentFolder.id)
        .then(contents => {
          if (active) {
              const onlyFolders = contents.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
              setFolders(onlyFolders.sort((a, b) => a.name.localeCompare(b.name)));
          }
        })
        .catch(console.error)
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [accessToken, currentFolder]);
  
    const handleFolderClick = (folder: DriveFile) => {
      setFolderHistory(prev => [...prev, currentFolder]);
      setCurrentFolder({ id: folder.id, name: folder.name });
    };
  
    const handleBack = () => {
      if (folderHistory.length === 0) return;
      const prev = folderHistory[folderHistory.length - 1];
      setFolderHistory(prevH => prevH.slice(0, -1));
      setCurrentFolder(prev);
    };
  
    const handleMove = async () => {
      setMoving(true);
      try {
          await moveDriveFile(
              accessToken, 
              file.id, 
              file.parents || [], 
              currentFolder.id
          );
          onSuccess();
      } catch (e: any) {
          alert("Erro ao mover: " + e.message);
          setMoving(false);
      }
    };
  
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in" onClick={e => e.stopPropagation()}>
        <div className="bg-surface border border-border rounded-2xl flex flex-col max-w-md w-full max-h-[80vh] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-border flex items-center gap-3">
               {folderHistory.length > 0 && (
                  <button onClick={handleBack} className="p-1.5 hover:bg-white/5 rounded-full text-text-sec hover:text-text">
                     <ArrowLeft size={20} />
                  </button>
               )}
               <h3 className="text-lg font-bold text-text truncate flex-1">
                  {currentFolder.name}
               </h3>
               <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-full text-text-sec hover:text-text">
                  <X size={20} />
               </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar min-h-[300px]">
               {loading ? (
                  <div className="flex items-center justify-center h-40">
                     <Loader2 size={24} className="animate-spin text-brand" />
                  </div>
               ) : folders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-text-sec opacity-50">
                      <Folder size={40} strokeWidth={1} className="mb-2"/>
                      <p className="text-sm">Pasta vazia</p>
                  </div>
               ) : (
                  <div className="space-y-1">
                     {folders.map(f => (
                        <button 
                          key={f.id}
                          onClick={() => handleFolderClick(f)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl text-left transition-colors group"
                        >
                           <div className="bg-blue-500/10 text-blue-400 p-2 rounded-lg">
                              <Folder size={20} fill="currentColor" className="opacity-70"/>
                           </div>
                           <span className="text-text flex-1 truncate">{f.name}</span>
                           <ChevronRight size={16} className="text-text-sec opacity-0 group-hover:opacity-100"/>
                        </button>
                     ))}
                  </div>
               )}
            </div>
            <div className="p-4 border-t border-border flex justify-between items-center bg-bg/50">
               <div className="text-xs text-text-sec">
                  Movendo: <strong>{file.name}</strong>
               </div>
               <button 
                  onClick={handleMove} 
                  disabled={moving}
                  className="px-4 py-2 bg-brand text-bg font-bold rounded-lg flex items-center gap-2 hover:brightness-110 disabled:opacity-50 transition-all"
               >
                  {moving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Mover Aqui
               </button>
            </div>
        </div>
      </div>
    );
  };
