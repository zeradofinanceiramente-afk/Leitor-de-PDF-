
import { DriveFile, MIME_TYPES } from "../types";

// Parâmetros essenciais para suportar Drives de Organização/Equipe
const LIST_PARAMS = "&supportsAllDrives=true&includeItemsFromAllDrives=true";
const WRITE_PARAMS = "&supportsAllDrives=true";

export async function listDriveContents(accessToken: string, folderId: string = 'root'): Promise<DriveFile[]> {
  let query = "";
  // Alterado para aceitar PDFs, Mapas Mentais (.mindmap) e Docs Umo (.umo)
  const baseConstraints = `trashed=false and (mimeType='${MIME_TYPES.PDF}' or mimeType='${MIME_TYPES.FOLDER}' or name contains '${MIME_TYPES.LEGACY_MINDMAP_EXT}' or name contains '${MIME_TYPES.UMO_DOC_EXT}')`;
  
  if (folderId === 'shared-with-me') {
    query = `sharedWithMe=true and ${baseConstraints}`;
  } else if (folderId === 'starred') {
    query = `starred=true and ${baseConstraints}`;
  } else {
    // Standard folder navigation (including 'root' alias for My Drive)
    query = `'${folderId}' in parents and ${baseConstraints}`;
  }

  const fields = "files(id, name, mimeType, thumbnailLink, parents, starred)";
  
  // Aumentado pageSize para 1000 e adicionado suporte a Drives Compartilhados
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=folder,name${LIST_PARAMS}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("Unauthorized");
    
    try {
      const errorData = await response.json();
      const message = errorData.error?.message || "Erro desconhecido na API do Drive";
      console.error("Drive API Error:", errorData);
      throw new Error(message);
    } catch (e) {
      if (e instanceof Error && (e.message === "Unauthorized" || e.message !== "Erro desconhecido na API do Drive")) {
        throw e;
      }
      throw new Error(`Falha ao buscar arquivos (Status: ${response.status})`);
    }
  }

  const data = await response.json();
  return data.files || [];
}

export async function searchMindMaps(accessToken: string): Promise<DriveFile[]> {
  // Query específica para encontrar todos os mapas mentais, independente da pasta
  const query = `name contains '${MIME_TYPES.LEGACY_MINDMAP_EXT}' and trashed=false`;
  const fields = "files(id, name, mimeType, thumbnailLink, parents, starred, modifiedTime)";
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000&orderBy=modifiedTime desc${LIST_PARAMS}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    if (response.status === 401) throw new Error("Unauthorized");
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || "Falha ao buscar mapas mentais");
  }

  const data = await response.json();
  return data.files || [];
}

export async function downloadDriveFile(accessToken: string, driveFileId: string): Promise<Blob> {
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
  mimeType: string = MIME_TYPES.PDF // Added flexible mimeType
): Promise<any> {
  const metadata = {
    name: name,
    mimeType: mimeType, // Use param
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
  mimeType: string = MIME_TYPES.PDF // Added flexible mimeType
): Promise<any> {
  // PATCH request to update file content
  const metadata = {
    mimeType: mimeType // Use param
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
  // Drive API requires removing old parents and adding new ones
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