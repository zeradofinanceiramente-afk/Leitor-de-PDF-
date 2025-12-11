
import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { signInWithGoogleDrive, logout } from './services/authService';
import { addRecentFile, getSyncQueue, removeSyncQueueItem } from './services/storageService';
import { uploadFileToDrive, updateDriveFile } from './services/driveService';
import { DriveBrowser } from './components/DriveBrowser';
import { PdfViewer } from './components/PdfViewer';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { MindMapEditor } from './components/MindMapEditor';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DriveFile } from './types';
import { ShieldCheck, LogIn, RefreshCw, AlertCircle, XCircle, Copy, Menu, Lock, Loader2, HardDrive, Wifi } from 'lucide-react';

// Helpers para Local Storage (Token do Drive)
const TOKEN_KEY = 'drive_access_token';

const getStoredToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

const saveToken = (token: string) => {
  localStorage.setItem(TOKEN_KEY, token);
};

const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredToken());
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<{title: string, message: string, code?: string} | null>(null);
  
  const [sessionExpired, setSessionExpired] = useState(false);
  
  // activeTab controls what is currently visible: 'dashboard' | 'browser' | 'mindmaps' | 'offline' | [fileId]
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [openFiles, setOpenFiles] = useState<DriveFile[]>([]);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth > 768);
  const [isPopup, setIsPopup] = useState(false);
  const [isCreatingMap, setIsCreatingMap] = useState(false); // Spinner for creating map
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const isViewerActive = !['dashboard', 'browser', 'mindmaps', 'offline'].includes(activeTab);

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
    // O Firebase agora persiste a sessão. Isso roda automaticamente ao recarregar a página.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (!currentUser) {
        // Se realmente não tiver usuário no Firebase, limpamos tudo
        setAccessToken(null);
        clearToken();
        if (!isPopup) {
            setOpenFiles([]);
            setActiveTab('dashboard');
        }
      } else {
        // Se temos usuário Firebase, verificamos se temos o token do Drive salvo
        const storedToken = getStoredToken();
        if (storedToken) {
          setAccessToken(storedToken);
        }
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [isPopup]);

  // --- SYNC QUEUE PROCESSING ---
  const processSyncQueue = async () => {
    if (!accessToken || isSyncing || !navigator.onLine) return;
    
    setIsSyncing(true);
    try {
        const queue = await getSyncQueue();
        if (queue.length === 0) return;

        setSyncMessage(`Sincronizando ${queue.length} arquivos pendentes...`);
        
        for (const item of queue) {
            try {
                if (item.action === 'create') {
                    await uploadFileToDrive(accessToken, item.blob, item.name, item.parents, item.mimeType);
                } else if (item.action === 'update') {
                    await updateDriveFile(accessToken, item.fileId, item.blob, item.mimeType);
                }
                await removeSyncQueueItem(item.id);
            } catch (e: any) {
                console.error(`Failed to sync item ${item.id}`, e);
                // Continue to next item even if one fails
            }
        }
        setSyncMessage("Sincronização concluída.");
        setTimeout(() => setSyncMessage(null), 3000);
    } catch (e) {
        console.error("Sync error:", e);
    } finally {
        setIsSyncing(false);
    }
  };

  // Monitor Online Status for Sync
  useEffect(() => {
    const handleOnline = () => {
        console.log("Network back online. Processing sync queue...");
        processSyncQueue();
    };
    window.addEventListener('online', handleOnline);
    // Try sync on mount if online
    if (navigator.onLine && accessToken) {
        processSyncQueue();
    }
    return () => window.removeEventListener('online', handleOnline);
  }, [accessToken]);


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
    // Chamado quando a API do Drive retorna 401
    setSessionExpired(true);
  };

  // --- Tab Management Logic ---

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
      // Determine mimetype based on extension
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
    // OFFLINE MODE / LOCAL CREATION FALLBACK
    // If no access token OR offline, create local map immediately
    // Note: !accessToken handles Guest Mode as well.
    if (!accessToken || !navigator.onLine) {
        const defaultMap = {
            nodes: [{
                id: `root-${Date.now()}`,
                text: "Ideia Central",
                x: window.innerWidth / 2 - 75,
                y: window.innerHeight / 2 - 30,
                width: 150,
                height: 60,
                color: '#a855f7',
                isRoot: true,
                scale: 1.2
            }],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 }
        };

        const blob = new Blob([JSON.stringify(defaultMap)], { type: 'application/json' });
        const name = "Novo Mapa Mental (Local).mindmap";
        
        const newFile: DriveFile = {
            id: `local-map-${Date.now()}`,
            name: name,
            mimeType: 'application/json',
            blob: blob
        };
        handleOpenFile(newFile);
        return;
    }
    
    // ONLINE MODE: CREATE IN DRIVE
    setIsCreatingMap(true);
    try {
        const defaultMap = {
            nodes: [{
                id: `root-${Date.now()}`,
                text: "Ideia Central",
                x: 0,
                y: 0,
                width: 150,
                height: 60,
                color: '#a855f7',
                isRoot: true,
                scale: 1.2
            }],
            edges: [],
            viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 1 }
        };

        const blob = new Blob([JSON.stringify(defaultMap)], { type: 'application/json' });
        const name = "Novo Mapa Mental.mindmap";
        
        // Upload to root folder by default
        const result = await uploadFileToDrive(accessToken, blob, name, [], 'application/json');
        
        if (result && result.id) {
            const newFile: DriveFile = {
                id: result.id,
                name: result.name || name,
                mimeType: 'application/json' // Treat as json
            };
            handleOpenFile(newFile);
        }
    } catch (e: any) {
        console.error("Failed to create map", e);
        // Fallback to local if drive creation fails
        if (e.message === "Unauthorized" || e.message === "Failed to fetch") {
            const defaultMap = {
              nodes: [{
                  id: `root-${Date.now()}`,
                  text: "Ideia Central",
                  x: 0, y: 0, width: 150, height: 60, color: '#a855f7', isRoot: true, scale: 1.2
              }],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 }
            };
            const blob = new Blob([JSON.stringify(defaultMap)], { type: 'application/json' });
            const newFile: DriveFile = {
                id: `local-map-${Date.now()}`,
                name: "Novo Mapa (Local).mindmap",
                mimeType: 'application/json',
                blob: blob
            };
            handleOpenFile(newFile);
        } else {
             setAuthError({ title: "Erro", message: "Falha ao criar mapa mental: " + e.message });
        }
    } finally {
        setIsCreatingMap(false);
    }
  };

  const handleTabSwitch = (tabId: string) => {
    setActiveTab(tabId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  // Callback to recover from ErrorBoundary
  const handleRecover = () => {
    setActiveTab('dashboard');
  };

  if (loadingAuth) {
    return <div className="h-screen w-full flex items-center justify-center bg-bg text-text">Carregando...</div>;
  }

  // --- POPUP MODE (LEGACY) ---
  if (isPopup) {
    const activeFile = openFiles.find(f => f.id === activeTab);
    
    if (!user) {
       return (
          <div className="flex h-screen flex-col items-center justify-center p-6 text-center bg-bg text-text">
               <ShieldCheck size={48} className="text-text-sec mb-4" />
               <h2 className="text-2xl font-bold mb-2">Autenticação Necessária</h2>
               <button onClick={handleLogin} className="flex items-center gap-2 py-3 px-6 bg-brand text-bg rounded-full font-medium">
                 <LogIn size={18} /> Entrar com Google
              </button>
          </div>
       );
    }
    if (!activeFile) return <div className="p-10 text-text">Arquivo não encontrado.</div>;
    
    // Popup Mode can technically open Mind Maps too if links are shared
    if (activeFile.name.endsWith('.mindmap')) {
       return (
         <ErrorBoundary>
            {accessToken && (
                <MindMapEditor 
                   fileId={activeFile.id}
                   fileName={activeFile.name}
                   accessToken={accessToken}
                   onToggleMenu={() => {}}
                   onAuthError={handleAuthError}
                />
            )}
         </ErrorBoundary>
       );
    }

    return (
      <ErrorBoundary>
        <PdfViewer 
          accessToken={accessToken}
          fileId={activeFile.id}
          fileName={activeFile.name}
          fileParents={activeFile.parents}
          uid={user.uid}
          onBack={() => window.close()}
          fileBlob={activeFile.blob}
          isPopup={true}
          onAuthError={handleAuthError} 
        />
      </ErrorBoundary>
    );
  }

  // --- MAIN APP LAYOUT ---
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
        
        {/* Main Content Area */}
        <main className="flex-1 relative overflow-hidden flex flex-col bg-bg">
          
          {/* Sync Status Toast */}
          {syncMessage && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-brand text-bg px-4 py-2 rounded-full font-bold shadow-lg animate-in slide-in-from-top-2 flex items-center gap-2">
                 {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
                 {syncMessage}
             </div>
          )}

          {/* 
              WALL 1: GUEST MODE 
              Show when NO Firebase User is logged in.
              (Excluding 'offline' tab because offline files are local)
          */}
          {!user && (activeTab === 'browser' || activeTab === 'mindmaps') && (
             <div className="absolute inset-0 z-20 bg-bg p-6 flex flex-col animate-in fade-in">
                <div className="mb-6">
                   <button onClick={() => setIsSidebarOpen(true)} className="p-3 -ml-3 text-text-sec hover:text-text">
                     <Menu size={32} />
                   </button>
                 </div>
                 <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <ShieldCheck size={64} className="text-text-sec mb-6" />
                    <h2 className="text-4xl font-bold mb-4 text-text">Login Necessário</h2>
                    <p className="text-xl text-text-sec mb-8">Acesse seus arquivos do Drive com segurança.</p>
                    <button onClick={handleLogin} className="btn-primary flex items-center gap-3 py-4 px-8 bg-brand text-bg rounded-full text-lg font-bold">
                      <LogIn size={24} /> Entrar com Google
                    </button>
                 </div>
             </div>
          )}

          {/* 
              WALL 2: RECONNECT DRIVE
              Show when Firebase User IS logged in, BUT Access Token is missing/null.
              (Excluding 'offline' tab)
          */}
          {user && !accessToken && (activeTab === 'browser' || activeTab === 'mindmaps') && (
             <div className="absolute inset-0 z-20 bg-bg p-6 flex flex-col animate-in fade-in">
                <div className="mb-6">
                   <button onClick={() => setIsSidebarOpen(true)} className="p-3 -ml-3 text-text-sec hover:text-text">
                     <Menu size={32} />
                   </button>
                 </div>
                 <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-brand/10 text-brand rounded-full flex items-center justify-center mb-6">
                       <HardDrive size={32} />
                    </div>
                    <h2 className="text-3xl font-bold mb-2 text-text">Conectar ao Drive</h2>
                    <p className="text-lg text-text-sec mb-8 max-w-md">
                       Olá, <strong>{user.displayName?.split(' ')[0]}</strong>! <br/>
                       Precisamos de permissão para listar seus arquivos novamente.
                    </p>
                    <button onClick={handleLogin} className="btn-primary flex items-center gap-3 py-3 px-8 bg-brand text-bg rounded-full text-lg font-bold shadow-lg shadow-brand/20">
                      <RefreshCw size={20} /> Conectar Drive
                    </button>
                 </div>
             </div>
          )}

           {/* CREATING MAP OVERLAY */}
           {isCreatingMap && (
             <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                <div className="bg-surface rounded-3xl p-8 flex flex-col items-center shadow-2xl">
                    <Loader2 size={48} className="animate-spin text-brand mb-4" />
                    <h3 className="text-xl font-bold text-text">Criando Mapa Mental...</h3>
                </div>
             </div>
           )}

           {/* 
               SESSION EXPIRED OVERLAY (API 401 Error)
               Show when we THOUGHT we had a token, but it failed during usage.
           */}
           {user && sessionExpired && (
             <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                 <div className="bg-surface border border-border rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
                    <div className="w-16 h-16 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
                       <Lock size={32} />
                    </div>
                    <h2 className="text-2xl font-bold mb-3 text-text">Sessão Pausada</h2>
                    <p className="text-text-sec mb-8 leading-relaxed">
                       Por segurança, o Google requer que você renove o acesso aos arquivos a cada hora.
                    </p>
                    <button 
                      onClick={handleRefreshSession} 
                      className="w-full flex items-center justify-center gap-3 py-4 bg-brand text-bg rounded-xl text-lg font-bold hover:brightness-110 transition-all"
                    >
                      <RefreshCw size={20} /> Renovar Sessão
                    </button>
                 </div>
             </div>
           )}

          {/* DASHBOARD VIEW */}
          <div className="w-full h-full" style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
            <ErrorBoundary onReset={handleRecover}>
              <Dashboard 
                userName={user?.displayName}
                onOpenFile={handleOpenFile}
                onUploadLocal={handleLocalUpload}
                onCreateMindMap={handleCreateMindMap} // New Handler
                onChangeView={(v) => handleTabSwitch(v)}
                onToggleMenu={() => setIsSidebarOpen(prev => !prev)}
              />
            </ErrorBoundary>
          </div>

          {/* BROWSER VIEW (Folders) */}
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

          {/* MINDMAPS VIEW (Gallery) */}
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

          {/* OFFLINE FILES VIEW */}
          <div className="w-full h-full" style={{ display: activeTab === 'offline' ? 'block' : 'none' }}>
             <ErrorBoundary onReset={handleRecover}>
                <DriveBrowser 
                  accessToken={accessToken || ''} // Token not strictly needed for offline mode
                  onSelectFile={handleOpenFile}
                  onLogout={handleLogout}
                  onAuthError={handleAuthError} 
                  onToggleMenu={() => setIsSidebarOpen(prev => !prev)}
                  onCreateMindMap={handleCreateMindMap}
                  mode="offline"
                />
             </ErrorBoundary>
          </div>

          {/* OPEN FILES VIEWS (Keep-Alive) */}
          {openFiles.map(file => (
            <div 
              key={file.id} 
              className="w-full h-full absolute inset-0 bg-bg"
              style={{ display: activeTab === file.id ? 'block' : 'none' }}
            >
              <ErrorBoundary onReset={() => handleCloseFile(file.id)}>
                {/* RENDER LOGIC: PDF OR MIND MAP */}
                {file.name.endsWith('.mindmap') ? (
                    <MindMapEditor 
                        fileId={file.id}
                        fileName={file.name}
                        fileBlob={file.blob}
                        accessToken={accessToken || ''} // Allow empty token for offline/local
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
      
      {/* Error Toast */}
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
