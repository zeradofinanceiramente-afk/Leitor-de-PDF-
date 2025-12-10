import { openDB } from "idb";
import { Annotation, DriveFile } from "../types";

// --- IndexedDB Setup ---
const dbPromise = openDB("pwa-drive-annotator", 4, {
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

    // NEW: Store para Mapas Mentais
    if (!db.objectStoreNames.contains("mindmaps")) {
      db.createObjectStore("mindmaps", { keyPath: "id" });
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