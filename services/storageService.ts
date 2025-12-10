import { openDB } from "idb";
import { Annotation, DriveFile } from "../types";

// --- IndexedDB Setup ---
const dbPromise = openDB("pwa-drive-annotator", 5, { // Incremented to version 5
  upgrade(db, oldVersion, newVersion, transaction) {
    // Store para anotações locais
    if (!db.objectStoreNames.contains("annotations")) {
      const store = db.createObjectStore("annotations", { keyPath: "id" });
      store.createIndex("fileId", "fileId", { unique: false });
    }
    
    // Remover store antiga se existir (limpeza)
    if (db.objectStoreNames.contains("pendingAnnotations")) {
      db.deleteObjectStore("pendingAnnotations");
    }

    // Store para Histórico de Arquivos Recentes
    if (!db.objectStoreNames.contains("recentFiles")) {
      const store = db.createObjectStore("recentFiles", { keyPath: "id" });
      store.createIndex("lastOpened", "lastOpened");
    }

    // Store para Mapas Mentais
    if (!db.objectStoreNames.contains("mindmaps")) {
      db.createObjectStore("mindmaps", { keyPath: "id" });
    }

    // NEW: Store para Cache de Listagem de Pastas (Estrutura)
    if (!db.objectStoreNames.contains("driveCache")) {
      db.createObjectStore("driveCache", { keyPath: "folderId" });
    }

    // NEW: Store para Arquivos Offline (Binário)
    if (!db.objectStoreNames.contains("offlineFiles")) {
      const store = db.createObjectStore("offlineFiles", { keyPath: "id" });
      store.createIndex("dirty", "dirty"); // Índice para achar arquivos pendentes de sync
    }
  }
});

// --- Recent Files Logic ---

export async function addRecentFile(file: DriveFile) {
  const idb = await dbPromise;
  // Remove blob from recent files to save space, we only need metadata there
  // (Actual blob is stored in offlineFiles if user requested offline access)
  const { blob, ...fileData } = file;
  
  await idb.put("recentFiles", {
    ...fileData,
    lastOpened: new Date()
  });
}

export async function getRecentFiles(): Promise<(DriveFile & { lastOpened: Date })[]> {
  const idb = await dbPromise;
  const files = await idb.getAll("recentFiles");
  return files.sort((a, b) => b.lastOpened - a.lastOpened);
}

// --- Annotation Logic (Local Only) ---

export async function saveAnnotation(uid: string, fileId: string, ann: Annotation) {
  const idb = await dbPromise;
  const finalId = ann.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const annotationToSave = {
    ...ann,
    id: finalId,
    fileId: fileId,
    updatedAt: new Date().toISOString()
  };

  await idb.put("annotations", annotationToSave);
  return annotationToSave;
}

export async function loadAnnotations(uid: string, fileId: string): Promise<Annotation[]> {
  const idb = await dbPromise;
  const allAnns = await idb.getAllFromIndex("annotations", "fileId", fileId);
  return allAnns;
}

export async function deleteAnnotation(id: string) {
  const idb = await dbPromise;
  await idb.delete("annotations", id);
}

// --- Mind Map Logic ---

export interface MindMapData {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
  viewport: { x: number, y: number, zoom: number };
  updatedAt: string;
}

export async function saveMindMap(data: MindMapData) {
  const idb = await dbPromise;
  await idb.put("mindmaps", { ...data, updatedAt: new Date().toISOString() });
}

export async function getMindMaps(): Promise<MindMapData[]> {
  const idb = await dbPromise;
  return await idb.getAll("mindmaps");
}

export async function getMindMap(id: string): Promise<MindMapData | undefined> {
  const idb = await dbPromise;
  return await idb.get("mindmaps", id);
}

export async function deleteMindMap(id: string) {
  const idb = await dbPromise;
  await idb.delete("mindmaps", id);
}

// --- OFFLINE & CACHE LOGIC ---

// 1. Folder Structure Cache
export async function cacheDriveList(folderId: string, files: DriveFile[]) {
  const idb = await dbPromise;
  // Remove blobs before caching structure to keep it light
  const lightweightFiles = files.map(({ blob, ...f }) => f);
  await idb.put("driveCache", {
    folderId,
    files: lightweightFiles,
    cachedAt: Date.now()
  });
}

export async function getCachedDriveList(folderId: string): Promise<DriveFile[] | null> {
  const idb = await dbPromise;
  const data = await idb.get("driveCache", folderId);
  return data ? data.files : null;
}

// 2. Offline Binary Files
export interface OfflineFile extends DriveFile {
  blob: Blob;
  dirty: boolean; // True if modified offline and needs sync
  syncedAt: number;
}

export async function saveOfflineFile(file: DriveFile, blob: Blob, dirty: boolean = false) {
  const idb = await dbPromise;
  const offlineData: OfflineFile = {
    ...file,
    blob,
    dirty,
    syncedAt: Date.now()
  };
  await idb.put("offlineFiles", offlineData);
}

export async function getOfflineFile(id: string): Promise<OfflineFile | undefined> {
  const idb = await dbPromise;
  return await idb.get("offlineFiles", id);
}

export async function removeOfflineFile(id: string) {
  const idb = await dbPromise;
  await idb.delete("offlineFiles", id);
}

export async function getDirtyFiles(): Promise<OfflineFile[]> {
  const idb = await dbPromise;
  return await idb.getAllFromIndex("offlineFiles", "dirty", 1); // 1 = true (boolean index)
}

export async function isFileOffline(id: string): Promise<boolean> {
  const idb = await dbPromise;
  const keys = await idb.getAllKeys("offlineFiles");
  return keys.includes(id);
}

export async function syncPendingAnnotations() {
  return;
}