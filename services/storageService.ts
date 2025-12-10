import { openDB } from "idb";
import { Annotation, DriveFile, SyncQueueItem } from "../types";

// --- IndexedDB Setup ---
const dbPromise = openDB("pwa-drive-annotator", 5, {
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

    // NEW: Store para Arquivos Offline (Cache Completo)
    if (!db.objectStoreNames.contains("offlineFiles")) {
      db.createObjectStore("offlineFiles", { keyPath: "id" });
    }

    // NEW: Store para Fila de Sincronização (Uploads Pendentes)
    if (!db.objectStoreNames.contains("syncQueue")) {
      const store = db.createObjectStore("syncQueue", { keyPath: "id" });
      store.createIndex("createdAt", "createdAt");
    }
  }
});

// --- Recent Files Logic ---

export async function addRecentFile(file: DriveFile) {
  const idb = await dbPromise;
  await idb.put("recentFiles", {
    ...file,
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

export async function syncPendingAnnotations() {
  return;
}

// --- Offline Files Logic ---

export async function saveOfflineFile(fileId: string, blob: Blob) {
  const idb = await dbPromise;
  await idb.put("offlineFiles", { id: fileId, blob, storedAt: Date.now() });
}

export async function getOfflineFile(fileId: string): Promise<Blob | undefined> {
  const idb = await dbPromise;
  const record = await idb.get("offlineFiles", fileId);
  return record?.blob;
}

export async function deleteOfflineFile(fileId: string) {
  const idb = await dbPromise;
  await idb.delete("offlineFiles", fileId);
}

export async function isFileOffline(fileId: string): Promise<boolean> {
  const idb = await dbPromise;
  const record = await idb.get("offlineFiles", fileId);
  return !!record;
}

export async function getOfflineFileIds(): Promise<string[]> {
  const idb = await dbPromise;
  const keys = await idb.getAllKeys("offlineFiles");
  return keys.map(k => String(k));
}

// --- Sync Queue Logic ---

export async function addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt'>) {
  const idb = await dbPromise;
  const newItem: SyncQueueItem = {
    ...item,
    id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    createdAt: Date.now()
  };
  await idb.put("syncQueue", newItem);
  return newItem;
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const idb = await dbPromise;
  const items = await idb.getAllFromIndex("syncQueue", "createdAt");
  return items;
}

export async function removeSyncQueueItem(id: string) {
  const idb = await dbPromise;
  await idb.delete("syncQueue", id);
}