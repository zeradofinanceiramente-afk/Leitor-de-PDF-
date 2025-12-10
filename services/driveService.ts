
import { DriveFile } from "../types";
import { cacheDriveList, getCachedDriveList, getOfflineFile } from "./storageService";

// Parâmetros essenciais para suportar Drives de Organização/Equipe
const LIST_PARAMS = "&supportsAllDrives=true&includeItemsFromAllDrives=true";
const WRITE_PARAMS = "&supportsAllDrives=true";

export async function listDriveContents(accessToken: string, folderId: string = 'root'): Promise<DriveFile[]> {
  const isOnline = navigator.onLine;

  if (!isOnline) {
    console.log(`[Offline] Buscando cache da pasta: ${folderId}`);
    const cached = await getCachedDriveList(folderId);
    if (cached) return cached;
    throw new Error("Você está offline e esta pasta não foi cacheada.");
  }

  let query = "";
  // Alterado para aceitar PDFs E arquivos .mindmap
  const baseConstraints = "trashed=false and (mimeType='application/pdf' or mimeType='application/vnd.google-apps.folder' or name contains '.mindmap')";
  
  if (folderId === 'shared-with-me') {
    query = `sharedWithMe=true and ${baseConstraints}`;
  } else if (folderId === 'starred') {
    query = `starred=true and ${baseConstraints}`;
  } else {
    query = `'${folderId}' in parents and ${baseConstraints}`;
  }

  const fields = "files(id, name, mimeType, thumbnailLink, parents, starred)";
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=folder,name${LIST_PARAMS}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!response.ok) {
        if (response.status === 401) throw new Error("Unauthorized");
        // Se falhar (ex: timeout), tentar fallback pro cache
        throw new Error("Network request failed");
    }

    const data = await response.json();
    const files = data.files || [];
    
    // Atualizar cache
    await cacheDriveList(folderId, files);
    
    return files;
  } catch (error: any) {
    console.warn("Erro ao buscar Drive (tentando cache):", error);
    if (error.message === "Unauthorized") throw error; // Não usar cache se token expirou
    
    // Fallback para cache em caso de erro de rede
    const cached = await getCachedDriveList(folderId);
    if (cached) return cached;
    throw error;
  }
}

export async function searchMindMaps(accessToken: string): Promise<DriveFile[]> {
    // Para mapas mentais, a estratégia de cache é similar, mas usando 'mindmaps' como chave virtual
    const isOnline = navigator.onLine;
    const CACHE_KEY = 'mindmaps_search_results';

    if (!isOnline) {
        const cached = await getCachedDriveList(CACHE_KEY);
        if (cached) return cached;
        throw new Error("Você está offline e a busca não foi cacheada.");
    }

  const query = "name contains '.mindmap' and trashed=false";
  const fields = "files(id, name, mimeType, thumbnailLink, parents, starred, modifiedTime)";
  
  try {
    const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=modifiedTime desc${LIST_PARAMS}`,
        {
        headers: { Authorization: `Bearer ${accessToken}` }
        }
    );

    if (!response.ok) {
        if (response.status === 401) throw new Error("Unauthorized");
        throw new Error("Falha na rede");
    }

    const data = await response.json();
    const files = data.files || [];
    await cacheDriveList(CACHE_KEY, files);
    return files;
  } catch (error: any) {
      if (error.message === "Unauthorized") throw error;
      const cached = await getCachedDriveList(CACHE_KEY);
      if (cached) return cached;
      throw error;
  }
}

export async function ensureMindMapFolder(accessToken: string): Promise<string> {
  const FOLDER_NAME = "Mapas Mentais - Leitor PDF";
  
  // 1. Procurar pasta existente
  const query = `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`;
  
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)${LIST_PARAMS}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) throw new Error("Falha ao buscar pasta de mapas mentais");
  
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Se não existir, criar
  const metadata = {
    name: FOLDER_NAME,
    mimeType: "application/vnd.google-apps.folder"
  };

  const createRes = await fetch(`https://www.googleapis.com/drive/v3/files?${WRITE_PARAMS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!createRes.ok) throw new Error("Falha ao criar pasta de mapas mentais");
  
  const createData = await createRes.json();
  return createData.id;
}

export async function downloadDriveFile(accessToken: string, driveFileId: string): Promise<Blob> {
  // 1. Tentar Cache Offline Primeiro
  // Isso permite que arquivos marcados como "Disponível Offline" carreguem instantaneamente
  // mesmo se estiver Online, economizando dados.
  const offlineFile = await getOfflineFile(driveFileId);
  if (offlineFile && offlineFile.blob) {
      console.log(`[DriveService] Carregando ${driveFileId} do cache offline.`);
      return offlineFile.blob;
  }

  // Se não estiver no cache e estivermos offline
  if (!navigator.onLine) {
      throw new Error("Arquivo não disponível offline. Conecte-se para baixar.");
  }

  // 2. Buscar da Rede
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media${WRITE_PARAMS}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  
  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    if (res.status === 403) throw new Error("Permissão negada (403). Verifique se a API do Drive está ativada.");
    try {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro no download");
    } catch {
        throw new Error("Falha no download do Drive");
    }
  }
  return res.blob();
}

export async function uploadFileToDrive(
  accessToken: string, 
  file: Blob, 
  name: string, 
  parents: string[] = [],
  mimeType: string = 'application/pdf' 
): Promise<any> {
  const metadata = {
    name: name,
    mimeType: mimeType, 
    parents: parents.length > 0 ? parents : undefined
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart${WRITE_PARAMS}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const err = await res.json();
    throw new Error(err.error?.message || "Falha ao fazer upload");
  }

  return res.json();
}

export async function updateDriveFile(
  accessToken: string, 
  fileId: string, 
  file: Blob,
  mimeType: string = 'application/pdf' 
): Promise<any> {
  // PATCH request to update file content
  const metadata = {
    mimeType: mimeType 
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart${WRITE_PARAMS}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const err = await res.json();
    throw new Error(err.error?.message || "Falha ao atualizar arquivo");
  }

  return res.json();
}

export async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Falha ao deletar arquivo original");
  }
}

export async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  const metadata = { name: newName };
  
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Falha ao renomear arquivo");
  }
}

export async function moveDriveFile(accessToken: string, fileId: string, previousParents: string[], newParentId: string): Promise<void> {
  const prevParentsStr = previousParents.join(',');
  
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${newParentId}&removeParents=${prevParentsStr}&supportsAllDrives=true`;
  
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Unauthorized");
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Falha ao mover arquivo");
  }
}
