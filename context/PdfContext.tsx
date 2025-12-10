import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Annotation } from '../types';

export type ToolType = 'cursor' | 'text' | 'ink' | 'eraser' | 'note';

interface PdfSettings {
  pageOffset: number;
  disableColorFilter: boolean;
  detectColumns: boolean;
  pageColor: string;
  textColor: string;
  highlightColor: string;
  highlightOpacity: number;
  inkColor: string;
  inkStrokeWidth: number;
  inkOpacity: number;
}

interface PdfContextState {
  // Navigation & View
  scale: number;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  numPages: number;
  
  // Tools
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  
  // Settings
  settings: PdfSettings;
  updateSettings: (newSettings: Partial<PdfSettings>) => void;
  
  // Data
  annotations: Annotation[];
  addAnnotation: (ann: Annotation) => void;
  removeAnnotation: (ann: Annotation) => void;
  
  // Actions
  jumpToPage: (page: number) => void;
}

const PdfContext = createContext<PdfContextState | null>(null);

export const usePdfContext = () => {
  const context = useContext(PdfContext);
  if (!context) {
    throw new Error('usePdfContext must be used within a PdfProvider');
  }
  return context;
};

interface PdfProviderProps {
  children: React.ReactNode;
  initialScale: number;
  numPages: number;
  annotations: Annotation[];
  onAddAnnotation: (ann: Annotation) => void;
  onRemoveAnnotation: (ann: Annotation) => void;
  onJumpToPage: (page: number) => void;
}

export const PdfProvider: React.FC<PdfProviderProps> = ({ 
  children, 
  initialScale, 
  numPages,
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  onJumpToPage
}) => {
  const [scale, setScale] = useState(initialScale);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTool, setActiveTool] = useState<ToolType>('cursor');
  
  const [settings, setSettings] = useState<PdfSettings>({
    pageOffset: 1,
    disableColorFilter: false,
    detectColumns: false,
    pageColor: "#ffffff",
    textColor: "#000000",
    highlightColor: "#4ade80",
    highlightOpacity: 0.4,
    inkColor: "#22c55e",
    inkStrokeWidth: 20,
    inkOpacity: 0.35,
  });

  const updateSettings = useCallback((newSettings: Partial<PdfSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const jumpToPage = useCallback((page: number) => {
    setCurrentPage(page);
    onJumpToPage(page);
  }, [onJumpToPage]);

  // Keep local scale updated if initial prop changes heavily (e.g. rotate/resize events), 
  // but mostly we want local control
  React.useEffect(() => {
    if (Math.abs(initialScale - scale) > 0.5) {
       // Only sync if drastic change to avoid jitter
       setScale(initialScale);
    }
  }, [initialScale]);

  const value = useMemo(() => ({
    scale, setScale,
    currentPage, setCurrentPage,
    numPages,
    activeTool, setActiveTool,
    settings, updateSettings,
    annotations, addAnnotation: onAddAnnotation, removeAnnotation: onRemoveAnnotation,
    jumpToPage
  }), [scale, currentPage, numPages, activeTool, settings, annotations, onAddAnnotation, onRemoveAnnotation, jumpToPage]);

  return (
    <PdfContext.Provider value={value}>
      {children}
    </PdfContext.Provider>
  );
};
