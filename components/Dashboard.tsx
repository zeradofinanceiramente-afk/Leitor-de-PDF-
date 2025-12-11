
import React, { useEffect, useState } from 'react';
import { DriveFile } from '../types';
import { getRecentFiles } from '../services/storageService';
import { generateMindMapFromText } from '../services/aiService';
import { FileText, Clock, ArrowRight, Upload, Menu, Workflow, WifiOff, Sparkles, Loader2, FilePlus } from 'lucide-react';

interface DashboardProps {
  userName?: string | null;
  onOpenFile: (file: DriveFile) => void;
  onUploadLocal: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateMindMap: () => void;
  onCreateDocument: () => void;
  onChangeView: (view: 'browser' | 'offline') => void;
  onToggleMenu: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ userName, onOpenFile, onUploadLocal, onCreateMindMap, onCreateDocument, onChangeView, onToggleMenu }) => {
  const [recents, setRecents] = useState<(DriveFile & { lastOpened: Date })[]>([]);
  const [greeting, setGreeting] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // AI Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);

  useEffect(() => {
    getRecentFiles().then(setRecents);
    
    const hr = new Date().getHours();
    if (hr < 12) setGreeting('Bom dia');
    else if (hr < 18) setGreeting('Boa tarde');
    else setGreeting('Boa noite');

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleTxtForAiUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setIsGenerating(true);
          setGenerationStatus("Lendo arquivo...");
          
          try {
              const text = await file.text();
              
              setGenerationStatus("A IA está estruturando as ideias...");
              const mindMapData = await generateMindMapFromText(text);

              setGenerationStatus("Finalizando...");
              
              const blob = new Blob([JSON.stringify(mindMapData)], { type: 'application/json' });
              const newFile: DriveFile = {
                  id: `ai-map-${Date.now()}`,
                  name: file.name.replace('.txt', '') + ' (Mapa Mental).mindmap',
                  mimeType: 'application/json',
                  blob: blob
              };

              onOpenFile(newFile);
          } catch (err: any) {
              alert("Erro ao gerar mapa: " + err.message);
          } finally {
              setIsGenerating(false);
              setGenerationStatus(null);
              // Reset input
              e.target.value = ''; 
          }
      }
  };

  const handleDriveNavigation = () => {
    if (isOnline) {
      onChangeView('browser');
    } else {
      onChangeView('offline');
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-bg text-text p-6 md:p-12 relative">
      
      {/* AI Loading Overlay */}
      {isGenerating && (
         <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in">
            <div className="bg-surface border border-border rounded-3xl p-8 flex flex-col items-center shadow-2xl max-w-sm w-full text-center">
                <div className="relative mb-6">
                    <div className="absolute inset-0 bg-brand/20 rounded-full blur-xl animate-pulse"></div>
                    <Sparkles size={48} className="text-brand relative z-10 animate-bounce" />
                </div>
                <h3 className="text-xl font-bold text-text mb-2">Criando Mapa Mental</h3>
                <p className="text-text-sec mb-6">{generationStatus}</p>
                <Loader2 size={24} className="animate-spin text-brand" />
            </div>
         </div>
      )}

      {/* Menu Button (Always Visible now to control sidebar) */}
      <div className="mb-6 md:mb-8 flex justify-between items-center">
        <button onClick={onToggleMenu} className="custom-menu-btn p-3 -ml-3 text-text-sec hover:text-text rounded-full hover:bg-surface transition">
          <Menu size={32} />
        </button>
        {!isOnline && (
          <div className="flex items-center gap-2 px-3 py-1 bg-surface border border-border rounded-full text-text-sec text-xs animate-pulse">
            <WifiOff size={14} />
            <span>Modo Offline</span>
          </div>
        )}
      </div>

      {/* Hero Header */}
      <header className="mb-12 md:mb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-4xl md:text-6xl font-normal text-text mb-4 tracking-tight leading-tight">
          {greeting}, <br className="lg:hidden" />
          <span className="text-brand font-medium">{userName?.split(' ')[0] || 'Visitante'}</span>
        </h1>
        <p className="text-lg md:text-2xl text-text-sec">Pronto para continuar de onde parou?</p>
      </header>

      {/* Quick Actions - Larger Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
        <button 
          onClick={handleDriveNavigation}
          className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border hover:border-brand/50 flex flex-col items-start gap-6 shadow-sm hover:shadow-xl relative overflow-hidden"
          disabled={!isOnline && !userName && recents.length === 0} // Disable only if guest with no recents and no net
        >
          <div className="w-16 h-16 rounded-2xl bg-brand/10 text-brand flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            {isOnline ? <FileText size={32} /> : <WifiOff size={32} />}
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">
                {isOnline ? 'Navegar no Drive' : 'Arquivos Offline'}
             </h3>
             <p className="text-base text-text-sec">
                {isOnline ? 'Acesse sua biblioteca' : 'Acesse arquivos baixados'}
             </p>
          </div>
        </button>

        <button 
          onClick={onCreateDocument}
          className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border hover:border-brand/50 flex flex-col items-start gap-6 shadow-sm hover:shadow-xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <FilePlus size={32} />
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">Novo Documento</h3>
             <p className="text-base text-text-sec">
               {isOnline && userName ? 'Criar no Drive' : 'Criar Localmente'}
             </p>
          </div>
        </button>

        <button 
          onClick={onCreateMindMap}
          className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border hover:border-brand/50 flex flex-col items-start gap-6 shadow-sm hover:shadow-xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Workflow size={32} />
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">Novo Mapa Mental</h3>
             <p className="text-base text-text-sec">
               {isOnline && userName ? 'Criar no Drive' : 'Criar Localmente'}
             </p>
          </div>
        </button>

        <label className="p-8 rounded-[2rem] bg-surface hover:brightness-110 transition-all group text-left border border-border hover:border-brand/50 cursor-pointer flex flex-col items-start gap-6 shadow-sm hover:shadow-xl">
           <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
            <Upload size={32} />
          </div>
          <div>
             <h3 className="text-2xl font-medium mb-2 text-text">Arquivo Local</h3>
             <p className="text-base text-text-sec">PDF, Mapa Mental ou Documento</p>
          </div>
          <input 
              type="file" 
              accept="application/pdf,.mindmap,.umo,application/json" 
              className="hidden" 
              id="local-upload-dash"
              onChange={onUploadLocal}
            />
        </label>
      </div>

      {/* Recent Files Section */}
      <div className="mb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl md:text-3xl font-normal text-text">Arquivos Recentes</h2>
          {recents.length > 0 && isOnline && (
            <button onClick={() => onChangeView('browser')} className="text-lg text-brand hover:text-brand/80 flex items-center gap-2 px-4 py-2 hover:bg-brand/5 rounded-full transition">
              Ver todos <ArrowRight size={20} />
            </button>
          )}
        </div>

        {recents.length === 0 ? (
          <div className="h-64 rounded-3xl border-2 border-dashed border-border flex flex-col items-center justify-center text-text-sec text-center p-8">
            <Clock size={48} className="mb-4 opacity-50" />
            <p className="text-lg">Nenhum arquivo aberto recentemente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recents.map((file) => {
               const isMindMap = file.name.endsWith('.mindmap');
               const isDoc = file.name.endsWith('.umo');
               
               return (
                <div 
                  key={file.id}
                  onClick={() => onOpenFile(file)}
                  className="group relative bg-surface rounded-[1.5rem] p-5 hover:brightness-110 transition-all cursor-pointer border border-border hover:border-brand/50 flex flex-col gap-4 shadow-sm hover:shadow-xl"
                >
                  <div className="w-full aspect-[4/5] bg-bg rounded-xl overflow-hidden relative shadow-inner shrink-0">
                    {file.thumbnailLink && !isMindMap && !isDoc ? (
                      <img src={file.thumbnailLink} alt="" className="w-full h-full object-cover object-top opacity-80 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center bg-bg ${isMindMap ? 'text-purple-400' : isDoc ? 'text-blue-400' : 'text-text-sec'}`}>
                        {isMindMap ? <Workflow size={64} className="opacity-80"/> : 
                         isDoc ? <FilePlus size={64} className="opacity-80"/> : 
                         <FileText size={64} className="opacity-20" />}
                      </div>
                    )}
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center hidden md:flex backdrop-blur-[2px]">
                      <span className="bg-brand text-bg px-6 py-3 rounded-full text-base font-bold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform">Abrir</span>
                    </div>
                  </div>
                  
                  <div className="min-w-0">
                    <h3 className="font-medium text-text truncate mb-2 text-lg" title={file.name}>{file.name}</h3>
                    <div className="flex items-center text-sm text-text-sec gap-2">
                      <Clock size={16} />
                      <span>{new Date(file.lastOpened).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
               );
            })}
          </div>
        )}
      </div>
    </div>
  );
};