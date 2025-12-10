
import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogleDrive, logout } from './services/authService';
import { addRecentFile, getDirtyFiles, saveOfflineFile } from './services/storageService';
import { uploadFileToDrive, updateDriveFile, ensureMindMapFolder } from './services/driveService';
import { DriveBrowser } from './components/DriveBrowser';
import { PdfViewer } from './components/PdfViewer';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { MindMapEditor } from './components/MindMapEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DriveFile } from './types';
import { ShieldCheck, LogIn, RefreshCw, AlertCircle, XCircle, Copy, Menu, Lock, Loader2, HardDrive, Wifi } from 'lucide-react';

const TOKEN_KEY = 'drive_access_token';

const getStoredToken = () => localStorage.getItem(TOKEN_KEY);
const saveToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredToken());
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<{title: string, message: string, code?: string} | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [openFiles, setOpenFiles] = useState<DriveFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 768);
  const [isPopup, setIsPopup] = useState(false);
  const [isCreatingMap, setIsCreatingMap] = useState(false);
  
  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const isViewerActive = !['dashboard', 'browser', 'mindmaps'].includes(activeTab);

  // --- SYNC WORKER ---
  useEffect(() => {
    const handleSync = async () => {
        if (!accessToken || !navigator.onLine) return;
        
        const dirtyFiles = await getDirtyFiles();
        if (dirtyFiles.length === 0) return;

        setIsSyncing(true);
        setSyncMessage(`Sincronizando ${dirtyFiles.length} arquivos pendentes...`);
        console.log(`[Sync] Encontrados ${dirtyFiles.length} arquivos sujos.`);

        let successCount = 0;
        for (const file of dirtyFiles) {
            try {
                // Update in Drive
                await updateDriveFile(accessToken, file.id, file.blob, file.mimeType);
                // Mark clean in local DB
                await saveOfflineFile(file, file.blob, false);
                successCount++;
            } catch (err) {
                console.error(`[Sync] Falha ao sincronizar ${file.name}`, err);
            }
        }
        
        setSyncMessage(successCount > 0 ? "Sincronização concluída!" : "Erro na sincronização.");
        setTimeout(() => {
            setIsSyncing(false);
            setSyncMessage(null);
        }, 3000);
    };

    const onOnline = () => {
        console.log("[App] Online detectado. Iniciando sync...");
        handleSync();
    };

    window.addEventListener('online', onOnline);
    // Try sync on mount if online
    if (navigator.onLine) handleSync();

    return () => window.removeEventListener('online', onOnline);
  }, [accessToken]);

  // Monitor URL Params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    
    if (mode === 'viewer') {
      const fileId = params.get('fileId');
      const fileName = params.get('fileName');
      const parentsStr = params.get('parents');
      
      if (fileId && fileName) {
        setIsPopup(true);
        const parents = parentsStr ? JSON.parse(decodeURIComponent(parentsStr)) : undefined;
        
        const fileFromUrl: DriveFile = {
          id: fileId,
          name: fileName,
          mimeType: fileName.endsWith('.mindmap') ? 'application/json' : 'application/pdf',
          parents
        };
        
        setOpenFiles([fileFromUrl]);
        setActiveTab(fileId);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (!currentUser) {
        setAccessToken(null);
        clearToken();
        if (!isPopup) {
            setOpenFiles([]);
            setActiveTab('dashboard');
        }
      } else {
        const storedToken = getStoredToken();
        if (storedToken) {
          setAccessToken(storedToken);
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [isPopup]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      const result = await signInWithGoogleDrive();
      setAccessToken(result.accessToken);
      saveToken(result.accessToken);
      setSessionExpired(false);
    } catch (e: any) {
      console.error("Login error full:", e);
      let errorData = {
        title: "Falha no Login",
        message: "Ocorreu um erro inesperado. Tente novamente.",
        code: e.code
      };
      if (e.code === 'auth/unauthorized-domain') {
        errorData = {
          title: "Domínio Não Autorizado",
          message: `O domínio atual (${window.location.hostname}) não está autorizado no Firebase Console.`,
          code: e.code
        };
      } else if (e.message) {
         errorData.message = e.message;
      }
      setAuthError(errorData);
    }
  };

  const handleRefreshSession = async () => {
    await handleLogin();
  };

  const handleLogout = async () => {
    setAuthError(null);
    setSessionExpired(false);
    await logout();
    setAccessToken(null);
    clearToken();
    setOpenFiles([]);
    setActiveTab('dashboard');
    setIsSidebarOpen(false);
  };

  const handleAuthError = () => {
    setSessionExpired(true);
  };

  const handleOpenFile = (file: DriveFile) => {
    addRecentFile(file);
    if (!openFiles.find(f => f.id === file.id)) {
      setOpenFiles(prev => [...prev, file]);
    }
    setActiveTab(file.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleCloseFile = (fileId: string) => {
    const newFiles = openFiles.filter(f => f.id !== fileId);
    setOpenFiles(newFiles);
    
    if (activeTab === fileId) {
      if (newFiles.length > 0) {
        setActiveTab(newFiles[newFiles.length - 1].id);
      } else {
        setActiveTab('dashboard');
      }
    }
  };

  const handleLocalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      let mimeType = file.type;
      if (file.name.endsWith('.mindmap')) {
          mimeType = 'application/json';
      }

      const newFile: DriveFile = {
        id: `local-${Date.now()}`,
        name: file.name,
        mimeType: mimeType,
        blob: file
      };
      handleOpenFile(newFile);
    }
  };

  const handleCreateMindMap = async () => {
    if (!accessToken || !navigator.onLine) {
        // ... (Offline fallback logic same as before) ...
        const defaultMap = { nodes: [{ id: `root-${Date.now()}`, text: "Ideia Central", x: window.innerWidth / 2 - 75, y: window.innerHeight / 2 - 30, width: 150, height: 60, color: '#a855f7', isRoot: true, scale: 1.2 }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
        const blob = new Blob([JSON.stringify(defaultMap)], { type: 'application/json' });
        const newFile: DriveFile = { id: `local-map-${Date.now()}`, name: "Novo Mapa (Local).mindmap", mimeType: 'application/json', blob: blob };
        handleOpenFile(newFile);
        return;
    }
    
    setIsCreatingMap(true);
    try {
        const defaultMap = { nodes: [{ id: `root-${Date.now()}`, text: "Ideia Central", x: 0, y: 0, width: 150, height: 60, color: '#a855f7', isRoot: true, scale: 1.2 }], edges: [], viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 } };
        const blob = new Blob([JSON.stringify(defaultMap)], { type: 'application/json' });
        const name = "Novo Mapa Mental.mindmap";
        
        // 1. Garantir que a pasta existe
        const parentFolderId = await ensureMindMapFolder(accessToken);
        
        // 2. Upload dentro dessa pasta
        const result = await uploadFileToDrive(accessToken, blob, name, [parentFolderId], 'application/json');
        
        if (result && result.id) {
            const newFile: DriveFile = { id: result.id, name: result.name || name, mimeType: 'application/json' };
            handleOpenFile(newFile);
        }
    } catch (e: any) {
        console.error("Failed to create map", e);
        // ... (Fallback logic) ...
        const defaultMap = { nodes: [{ id: `root-${Date.now()}`, text: "Ideia Central", x: 0, y: 0, width: 150, height: 60, color: '#a855f7', isRoot: true, scale: 1.2 }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
        const blob = new Blob([JSON.stringify(defaultMap)], { type: 'application/json' });
        const newFile: DriveFile = { id: `local-map-${Date.now()}`, name: "Novo Mapa (Local).mindmap", mimeType: 'application/json', blob: blob };
        handleOpenFile(newFile);
    } finally {
        setIsCreatingMap(false);
    }
  };

  const handleTabSwitch = (tabId: string) => {
    setActiveTab(tabId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleRecover = () => {
    setActiveTab('dashboard');
  };

  if (loadingAuth) {
    return <div className="h-screen w-full flex items-center justify-center bg-bg text-text">Carregando...</div>;
  }

  // --- POPUP MODE ---
  if (isPopup) {
     // ... (Popup logic unchanged) ...
     const activeFile = openFiles.find(f => f.id === activeTab);
     if (!user) return <div>Login Required</div>;
     if (!activeFile) return <div>File not found</div>;
     if (activeFile.name.endsWith('.mindmap')) return <MindMapEditor fileId={activeFile.id} fileName={activeFile.name} accessToken={accessToken || ''} onToggleMenu={() => {}} />;
     return <PdfViewer accessToken={accessToken} fileId={activeFile.id} fileName={activeFile.name} uid={user.uid} onBack={() => window.close()} fileBlob={activeFile.blob} isPopup={true} />;
  }

  return (
    <>
      <div className="flex h-screen w-full bg-bg overflow-hidden transition-colors duration-300 relative">
        <Sidebar 
          activeTab={activeTab}
          onSwitchTab={handleTabSwitch}
          openFiles={openFiles}
          onCloseFile={handleCloseFile}
          user={user}
          onLogout={handleLogout}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          docked={!isViewerActive && isSidebarOpen} 
        />
        
        <main className="flex-1 relative overflow-hidden flex flex-col bg-bg">
          
          {/* SYNC TOAST */}
          {isSyncing && (
             <div className="absolute top-4 right-4 z-50 bg-brand text-bg px-4 py-2 rounded-full shadow-lg flex items-center gap-2 font-bold animate-in slide-in-from-top-2">
                 <RefreshCw size={16} className="animate-spin" />
                 {syncMessage}
             </div>
          )}
          {!isSyncing && syncMessage && (
             <div className="absolute top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 font-bold animate-in slide-in-from-top-2">
                 <Wifi size={16} />
                 {syncMessage}
             </div>
          )}

          {/* ... WALLS (Guest, Reconnect) logic remains same ... */}
          {!user && (activeTab === 'browser' || activeTab === 'mindmaps') && (
             <div className="absolute inset-0 z-20 bg-bg p-6 flex flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-bold mb-4">Login Necessário</h2>
                <button onClick={handleLogin} className="btn-primary py-2 px-6 rounded-full bg-brand text-bg">Entrar</button>
             </div>
          )}
          
           {isCreatingMap && (
             <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                <div className="bg-surface rounded-3xl p-8 flex flex-col items-center shadow-2xl">
                    <Loader2 size={48} className="animate-spin text-brand mb-4" />
                    <h3 className="text-xl font-bold text-text">Criando Mapa Mental...</h3>
                    <p className="text-sm text-text-sec mt-2">Organizando em "Mapas Mentais - Leitor PDF"</p>
                </div>
             </div>
           )}

           {user && sessionExpired && (
             <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                 <div className="bg-surface border border-border rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
                    <h2 className="text-2xl font-bold mb-3 text-text">Sessão Pausada</h2>
                    <button onClick={handleRefreshSession} className="w-full py-4 bg-brand text-bg rounded-xl font-bold">Renovar Sessão</button>
                 </div>
             </div>
           )}

          {/* VIEWS */}
          <div className="w-full h-full" style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <ErrorBoundary onReset={handleRecover}>
              <Dashboard 
                userName={user?.displayName}
                onOpenFile={handleOpenFile}
                onUploadLocal={handleLocalUpload}
                onCreateMindMap={handleCreateMindMap}
                onChangeView={(v) => handleTabSwitch(v)}
                onToggleMenu={() => setIsSidebarOpen(prev => !prev)}
              />
            </ErrorBoundary>
          </div>

          <div className="w-full h-full" style={{ display: activeTab === 'browser' ? 'block' : 'none' }}>
             {user && accessToken && (
                <ErrorBoundary onReset={handleRecover}>
                  <DriveBrowser 
                    accessToken={accessToken}
                    onSelectFile={handleOpenFile}
                    onLogout={handleLogout}
                    onAuthError={handleAuthError} 
                    onToggleMenu={() => setIsSidebarOpen(prev => !prev)}
                    onCreateMindMap={handleCreateMindMap}
                    mode="default"
                  />
                </ErrorBoundary>
             )}
          </div>

          <div className="w-full h-full" style={{ display: activeTab === 'mindmaps' ? 'block' : 'none' }}>
             {user && accessToken && (
                <ErrorBoundary onReset={handleRecover}>
                  <DriveBrowser 
                    accessToken={accessToken}
                    onSelectFile={handleOpenFile}
                    onLogout={handleLogout}
                    onAuthError={handleAuthError} 
                    onToggleMenu={() => setIsSidebarOpen(prev => !prev)}
                    onCreateMindMap={handleCreateMindMap}
                    mode="mindmaps"
                  />
                </ErrorBoundary>
             )}
          </div>

          {openFiles.map(file => (
            <div 
              key={file.id} 
              className="w-full h-full absolute inset-0 bg-bg"
              style={{ display: activeTab === file.id ? 'block' : 'none' }}
            >
              <ErrorBoundary onReset={() => handleCloseFile(file.id)}>
                {file.name.endsWith('.mindmap') ? (
                    <MindMapEditor 
                        fileId={file.id}
                        fileName={file.name}
                        fileBlob={file.blob}
                        accessToken={accessToken || ''} 
                        onToggleMenu={() => setIsSidebarOpen(prev => !prev)}
                        onAuthError={handleAuthError}
                    />
                ) : (
                    <PdfViewer 
                       accessToken={accessToken}
                       fileId={file.id}
                       fileName={file.name}
                       fileParents={file.parents}
                       uid={user ? user.uid : 'guest'}
                       onBack={() => handleCloseFile(file.id)}
                       fileBlob={file.blob}
                       isPopup={false}
                       onToggleNavigation={() => setIsSidebarOpen(prev => !prev)}
                       onAuthError={handleAuthError}
                    />
                )}
              </ErrorBoundary>
            </div>
          ))}

        </main>
      </div>
      
      {authError && !sessionExpired && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md p-4 animate-in slide-in-from-top-4">
          <div className="bg-surface border border-red-500/50 rounded-xl shadow-2xl p-4 flex gap-4 text-text relative">
            <div className="bg-red-500/10 p-2 rounded-full h-fit text-red-500"><AlertCircle size={24} /></div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-red-500 mb-1">{authError.title}</h3>
              <p className="text-sm text-text-sec mb-2 break-words">{authError.message}</p>
            </div>
            <button onClick={() => setAuthError(null)} className="absolute top-2 right-2 text-text-sec hover:text-text p-1"><XCircle size={18} /></button>
          </div>
        </div>
      )}

      <input type="file" id="local-upload-hidden" accept="application/pdf" onChange={handleLocalUpload} className="hidden" />
    </>
  );
}
