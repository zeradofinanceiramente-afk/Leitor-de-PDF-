import { User } from "firebase/auth";

export const MIME_TYPES = {
  PDF: 'application/pdf',
  FOLDER: 'application/vnd.google-apps.folder',
  MINDMAP: 'application/json', // Using JSON for mindmaps for compatibility
  UMO_DOC: 'application/umo+json', // Custom mime type for Umo Editor docs (stored as JSON)
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  LEGACY_MINDMAP_EXT: '.mindmap',
  UMO_DOC_EXT: '.umo',
  DOCX_EXT: '.docx'
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  parents?: string[]; // Pasta onde o arquivo está
  blob?: Blob; // Optional: for local files or pre-loaded content
  starred?: boolean;
}

export interface Annotation {
  id?: string;
  page: number;
  bbox: [number, number, number, number]; // x, y, width, height relative to canvas at specific scale
  text?: string;
  type: 'highlight' | 'note' | 'ink';
  points?: number[][]; // Array de coordenadas [x, y] para desenhos
  author?: string;
  createdAt?: any;
  updatedAt?: any;
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  isBurned?: boolean; // Indica se a anotação já foi fundida (renderizada permanentemente) no PDF visualmente
}

export interface AppState {
  user: User | null;
  accessToken: string | null;
  currentFile: DriveFile | null;
  view: 'login' | 'browser' | 'viewer';
}

export interface ThemeColors {
  brand: string;
  bg: string;
  surface: string;
  text: string;
}

export interface SyncQueueItem {
  id: string;
  fileId: string;
  action: 'create' | 'update';
  blob: Blob;
  name: string;
  parents?: string[];
  mimeType: string;
  createdAt: number;
}