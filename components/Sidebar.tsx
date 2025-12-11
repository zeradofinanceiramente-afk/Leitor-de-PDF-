
import React, { useState, useEffect } from 'react';
import { Home, FolderOpen, LogOut, User as UserIcon, X, Palette, ChevronDown, ChevronRight, FileText, Workflow, DownloadCloud, CheckCircle, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { User } from 'firebase/auth';
import { ThemeSwitcher } from './ThemeSwitcher';
import { DriveFile } from '../types';
import { cacheAppResources, getOfflineCacheSize } from '../services/offlineService';

interface SidebarProps {
  activeTab: string;
  onSwitchTab: (tabId: string) => void;
  openFiles: DriveFile[];
  onCloseFile: (fileId: string) => void;
  user: User | null;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  docked?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  onSwitchTab, 
  openFiles, 
  onCloseFile, 
  user, 
  onLogout, 
  isOpen, 
  onClose,
  docked = true
}) => {
  const [isThemesOpen, setIsThemesOpen] = useState(false);
  
  // Offline Download State
  const [cachingStatus, setCachingStatus] = useState<'idle' | 'caching' | 'done'>('idle');
  const [cacheProgress, setCacheProgress] = useState(0);
  const [downloadSize, setDownloadSize] = useState<string | null>(null);

  // Verificar status do cache ao montar o componente
  useEffect(() => {
    let active = true;
    getOfflineCacheSize().then(size => {
        if (active && size) {
            setDownloadSize(size);
            setCachingStatus('done');
        }
    });
    return () => { active = false; };
  }, []);

  const handleDownloadOffline = async () => {
    // Se já estiver feito, clicar novamente funciona como um "Atualizar Cache"
    setCachingStatus('caching');
    setCacheProgress(0);
    
    try {
        const size = await cacheAppResources((progress) => setCacheProgress(progress));
        setDownloadSize(size);
        setCachingStatus('done');
    } catch (e) {
        console.error("Cache failed", e);
        setCachingStatus('idle'); // Volta ao normal em caso de erro
        alert("Erro ao baixar recursos. Verifique sua conexão.");
    }
  };

  const handleMyFilesClick = () => {
    if (navigator.onLine) {
      onSwitchTab('browser');
    } else {
      onSwitchTab('offline');
    }
    onClose();
  };

  // Dynamic classes based on docked state
  const dockedClasses = docked 
    ? "md:relative md:translate-x-0 md:w-80 md:shadow-none" 
    : "";

  const backdropClasses = docked
    ? "md:hidden"
    : "";

  return (
    <>
      {/* Mobile/Overlay Backdrop */}
      {isOpen && (
        <div 
          className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-200 ${backdropClasses}`}
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-sidebar border-r border-border transition-transform duration-300 shadow-2xl flex flex-col
        ${dockedClasses}
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* App Logo Area */}
        <div className="h-20 flex items-center justify-between px-6 border-b border-border shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center shadow-lg shadow-brand/20 shrink-0">
              <FolderOpen className="text-bg font-bold" size={26} />
            </div>
            <span className="font-bold text-2xl text-text tracking-tight sidebar-text">Leitor de PDF</span>
          </div>
          <button onClick={onClose} className={`p-2 text-text-sec hover:text-text rounded-full hover:bg-white/5 ${docked ? 'md:hidden' : ''}`}>
            <X size={28} />
          </button>
        </div>

        {/* Navigation Scroll Area */}
        <nav className="flex-1 py-8 px-5 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* Main Actions */}
          <div className="space-y-3">
            <button
              onClick={() => { onSwitchTab('dashboard'); onClose(); }}
              className={`w-full flex items-center gap-5 px-5 py-4 rounded-2xl transition-all duration-200 group sidebar-text ${
                activeTab === 'dashboard' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <Home size={26} className={activeTab === 'dashboard' ? "fill-brand/20" : ""} />
              <span className="text-lg">Início</span>
            </button>

            <button
              onClick={handleMyFilesClick}
              className={`w-full flex items-center gap-5 px-5 py-4 rounded-2xl transition-all duration-200 group sidebar-text ${
                activeTab === 'browser' || activeTab === 'offline' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              {activeTab === 'offline' ? (
                 <WifiOff size={26} className="text-brand" />
              ) : (
                 <FolderOpen size={26} className={activeTab === 'browser' ? "fill-brand/20" : ""} />
              )}
              <span className="text-lg">Meus Arquivos</span>
            </button>

            <button
              onClick={() => { onSwitchTab('mindmaps'); onClose(); }}
              className={`w-full flex items-center gap-5 px-5 py-4 rounded-2xl transition-all duration-200 group sidebar-text ${
                activeTab === 'mindmaps' 
                  ? 'bg-brand/10 text-brand font-medium' 
                  : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              <Workflow size={26} className={activeTab === 'mindmaps' ? "text-brand" : ""} />
              <span className="text-lg">Mapas Mentais</span>
            </button>
          </div>

          {/* Offline Actions */}
          <div className="space-y-3 border-t border-border pt-6">
             <div className="px-4 text-xs font-bold text-text-sec uppercase tracking-wider">Sistema</div>
             <button
              onClick={handleDownloadOffline}
              disabled={cachingStatus === 'caching'}
              className={`w-full flex items-center gap-5 px-5 py-4 rounded-2xl transition-all duration-200 group sidebar-text ${
                  cachingStatus === 'done' 
                    ? 'bg-green-500/10 text-green-500 border border-green-500/20' 
                    : 'text-text-sec hover:bg-white/5 hover:text-text'
              }`}
            >
              {cachingStatus === 'caching' ? (
                  <Loader2 size={26} className="animate-spin text-brand" />
              ) : cachingStatus === 'done' ? (
                  <CheckCircle size={26} className="text-green-500" />
              ) : (
                  <DownloadCloud size={26} />
              )}
              
              <div className="flex flex-col items-start min-w-0">
                  <span className={`text-lg font-medium truncate ${cachingStatus === 'done' ? 'text-green-500' : ''}`}>
                      {cachingStatus === 'caching' 
                        ? `Baixando ${cacheProgress}%` 
                        : cachingStatus === 'done' 
                           ? `Baixado (${downloadSize})` 
                           : 'Baixar Recursos'}
                  </span>
                  <span className={`text-xs ${cachingStatus === 'done' ? 'text-green-500/70' : 'opacity-60'}`}>
                    {cachingStatus === 'done' 
                      ? 'App disponível offline' 
                      : 'Disponibilizar App Offline'
                    }
                  </span>
              </div>
            </button>
          </div>

          {/* Open Files Section */}
          {openFiles.length > 0 && (
            <div className="animate-in fade-in slide-in-from-left-2 border-t border-border pt-6">
              <div className="px-4 mb-3 text-sm font-bold text-text-sec uppercase tracking-wider">
                Arquivos Abertos
              </div>
              <div className="space-y-2">
                {openFiles.map(file => (
                  <div 
                    key={file.id}
                    className={`group relative flex items-center gap-4 px-5 py-3 rounded-2xl transition-all cursor-pointer ${
                      activeTab === file.id 
                        ? 'bg-surface text-text font-medium border border-border shadow-sm' 
                        : 'text-text-sec hover:bg-white/5 hover:text-text border border-transparent'
                    }`}
                    onClick={() => { onSwitchTab(file.id); onClose(); }}
                  >
                    <FileText size={20} className={activeTab === file.id ? 'text-brand' : 'opacity-70'} />
                    <span className="truncate text-base flex-1 pr-8">{file.name}</span>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseFile(file.id);
                      }}
                      className="absolute right-2 p-2 text-text-sec hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-red-500/10"
                      title="Fechar guia"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Theme Accordion */}
          <div className="pt-6 border-t border-border">
            <button 
              onClick={() => setIsThemesOpen(!isThemesOpen)}
              className="w-full flex items-center justify-between px-5 py-4 text-text-sec hover:text-text rounded-2xl hover:bg-white/5 transition-colors sidebar-text"
            >
              <div className="flex items-center gap-5">
                <Palette size={26} />
                <span className="text-lg">Temas</span>
              </div>
              {isThemesOpen ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}
            </button>
            
            {isThemesOpen && (
              <div className="pl-14 pr-2 py-2 animate-in slide-in-from-top-2">
                 <ThemeSwitcher />
              </div>
            )}
          </div>
        </nav>

        {/* User Profile Footer */}
        <div className="p-5 border-t border-border mt-auto shrink-0">
          {user ? (
            <div className="flex flex-col gap-4 bg-surface/50 rounded-2xl p-4">
              <div className="flex items-center gap-4 overflow-hidden">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="User" className="w-12 h-12 rounded-full border border-border" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center border border-border">
                    <UserIcon size={24} className="text-text-sec" />
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-base font-medium text-text truncate sidebar-text">{user.displayName}</span>
                  <span className="text-sm text-text-sec truncate sidebar-text">{user.email}</span>
                </div>
              </div>
              <button 
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-base py-3 rounded-xl transition-all sidebar-text"
              >
                <LogOut size={20} />
                <span>Sair</span>
              </button>
            </div>
          ) : (
            <div className="text-center text-sm text-text-sec p-3 sidebar-text">Modo Visitante</div>
          )}
        </div>
      </div>
    </>
  );
};
