import React, { useState, useRef, useEffect } from 'react';
import { Plus, Minus, Trash2, Type, Menu, Scaling, LayoutTemplate, BoxSelect, Save, Loader2, RefreshCw, Link, XCircle, Download, WifiOff, Sparkles, Upload } from 'lucide-react';
import { updateDriveFile, downloadDriveFile } from '../services/driveService';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Node {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number; // estimated
  height: number; // estimated
  color: string;
  parentId?: string;
  isRoot?: boolean;
  scale?: number;
}

interface Edge {
  id: string;
  from: string;
  to: string;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface MindMapData {
  nodes: Node[];
  edges: Edge[];
  viewport: Viewport;
}

interface Props {
  fileId: string;
  fileName: string;
  fileBlob?: Blob;
  accessToken: string;
  onToggleMenu: () => void;
  onAuthError?: () => void;
}

// --- Constants ---
const COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
];

const AI_PROMPT_TEMPLATE = `
Você vai receber um arquivo .txt gerado pelo meu Leitor de PDF.
O arquivo segue sempre este padrão:

Página X
Citação

Página X
Citação

… (repete)

Essas citações representam trechos que destaquei durante a leitura.
Use isso como prioridade, mas equilibre com pesquisa externa confiável sobre a obra, autor, contexto historiográfico e correntes teóricas — sempre sem inventar nada.

Sua tarefa é:

1. Interpretar o texto e meus destaques (eles indicam o que considero importante).
2. Pesquisar conceitos, contexto da obra, teoria do autor e relevância historiográfica.
3. Criar um mapa mental estruturado, sempre no formato:

[TÍTULO PRINCIPAL]

- Ideia central
  - Subidéia
  - Subidéia

- Conceitos chave
  - Conceito A
  - Conceito B

- Contexto histórico
  - Evento / período
  - Consequências

- Autor e teoria
  - Linha historiográfica
  - Método / abordagem

- Relações com outros temas
  - Comparações
  - Implicações

- Aplicações práticas
  - Por que isso importa
  - Como usar no meu estudo

4. O mapa deve ser objetivo, denso e sem enrolação.
5. Trate a informação como um fichamento avançado, não como resumo infantil.
6. Nunca altere o formato, porque meu frontend depende disso.
7. Priorize concisão, como se estivesse preparando material para estudo rápido.
8. Nunca repita as citações; use-as apenas como base interpretativa.

Perfil do usuário (use para ajustar o estilo sem mencionar explicitamente):
Estudante de História com foco em análise teórica e discursos historiográficos.
Gosta de sínteses inteligentes, diretas e sem firula.
Prefere mapas mentais que mostrem lógica, hierarquia e conexões entre temas.
O objetivo é acelerar leitura, retenção e produção acadêmica.

Saída final: somente o mapa mental estruturado (texto puro), sem comentários adicionais ou markdown block code. Use identação com 2 espaços ou hífen.
`;

export const MindMapEditor: React.FC<Props> = ({ fileId, fileName, fileBlob, accessToken, onToggleMenu, onAuthError }) => {
  // Determine if it's a local file
  const isLocalFile = fileId.startsWith('local-') || !accessToken;

  // State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // Mouse position for panning
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  
  // Multi-touch / Pinch State
  const pointersRef = useRef<Map<number, { x: number, y: number }>>(new Map());
  const prevPinchDistRef = useRef<number | null>(null);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // Linking State (Manual Connection)
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null);
  
  // Save State
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI State
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  
  // Debounce Ref for Auto-Save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Helper to get selected node
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // --- 1. Load Data from Drive Blob ---
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setIsLoading(true);
        let blobToRead = fileBlob;

        // If no blob passed (direct URL open), download it
        if (!blobToRead && accessToken && !isLocalFile) {
             try {
                blobToRead = await downloadDriveFile(accessToken, fileId);
             } catch (err) {
                console.error("Failed to download mind map", err);
                return;
             }
        }

        if (blobToRead) {
            const text = await blobToRead.text();
            try {
                const data: MindMapData = JSON.parse(text);
                if (mounted) {
                    setNodes(data.nodes || []);
                    setEdges(data.edges || []);
                    setViewport(data.viewport || { x: 0, y: 0, zoom: 1 });
                }
            } catch (e) {
                console.error("Invalid JSON content", e);
                // Fallback for empty/corrupt files: Init Default
                if (mounted) initDefaultMap();
            }
        } else {
             // New/Empty
             if (mounted) initDefaultMap();
        }
      } catch (e) {
        console.error("Failed to load mind map", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [fileId, fileBlob, accessToken, isLocalFile]);

  const initDefaultMap = () => {
      setNodes([{
        id: `root-${Date.now()}`,
        text: "Ideia Central",
        x: window.innerWidth / 2 - 75,
        y: window.innerHeight / 2 - 30,
        width: 150,
        height: 60,
        color: '#a855f7',
        isRoot: true,
        scale: 1.2
      }]);
      setEdges([]);
      setViewport({ x: 0, y: 0, zoom: 1 });
  };

  // --- 2. Auto Save Logic (Drive Only) ---
  useEffect(() => {
    if (isLoading) return; // Don't save while loading
    if (nodes.length === 0) return;

    setHasUnsavedChanges(true);
    setSaveError(null);

    // Only auto-save if it's a Drive file
    if (!isLocalFile) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveToDrive();
        }, 3000); // Auto-save every 3s of inactivity
    }

    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [nodes, edges, viewport, isLocalFile]);

  // Cancel linking on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            setLinkingSourceId(null);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --- AI GENERATION LOGIC ---
  const handleAiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsGeneratingAi(true);
    try {
        const fileText = await file.text();
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `${AI_PROMPT_TEMPLATE}\n\n--- INÍCIO DO ARQUIVO TXT ---\n${fileText}\n--- FIM DO ARQUIVO TXT ---`
        });

        const generatedText = response.text;
        if (generatedText) {
            parseAndApplyAiMap(generatedText);
        } else {
            alert("O Gemini não retornou nenhum conteúdo. Tente novamente.");
        }

    } catch (err: any) {
        console.error("Erro na geração IA:", err);
        alert("Erro ao gerar mapa: " + (err.message || "Erro desconhecido"));
    } finally {
        setIsGeneratingAi(false);
        // Clear input
        if (aiFileInputRef.current) aiFileInputRef.current.value = '';
    }
  };

  const parseAndApplyAiMap = (text: string) => {
      // 1. Parsing logic to tree structure
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      const rootId = `root-${Date.now()}`;
      
      let newNodes: Node[] = [];
      let newEdges: Edge[] = [];
      
      // Stack stores: { level, id }
      const stack: { level: number, id: string }[] = [];
      
      let rootNode: Node | null = null;
      let firstLineProcessed = false;

      lines.forEach((line) => {
          const trimmed = line.trim();
          
          // Check for Title (Root) -> Usually formatted as [TITLE] or just the first line if not bullet
          if (!firstLineProcessed && (trimmed.startsWith('[') || !trimmed.startsWith('-'))) {
             const cleanText = trimmed.replace(/^\[|\]$/g, '');
             rootNode = {
                 id: rootId,
                 text: cleanText,
                 x: 0,
                 y: 0,
                 width: 160,
                 height: 60,
                 color: '#a855f7',
                 isRoot: true,
                 scale: 1.3
             };
             newNodes.push(rootNode);
             stack.push({ level: 0, id: rootId });
             firstLineProcessed = true;
             return;
          }

          // List Items
          const indentMatch = line.match(/^(\s*)/);
          const rawIndent = indentMatch ? indentMatch[1].length : 0;
          // Estimate level: 2 spaces = 1 level, or just by bullet hierarchy
          // Standardize: remove bullet
          const content = trimmed.replace(/^[-*]\s*/, '');
          
          if (!content) return;

          // Determine parent based on stack
          // Simple logic: If current indent > last indent, child. If <=, pop until finding parent.
          // Since indenting can vary (2 spaces, 4 spaces, tab), we approximate.
          // Let's assume standard 2-space or tab indentation mapping to levels.
          // Or strictly follow the stack: 
          //   - If new node is Level X, parent must be Level X-1.
          
          // We can't strictly trust spaces from LLMs. 
          // Heuristic: 
          // Level 1: Starts with "- " or "* " with 0 indent relative to line start.
          // Level 2: Starts with space + "- ".
          
          let level = 1;
          if (line.startsWith('    ') || line.startsWith('\t\t')) level = 2;
          else if (line.startsWith('  ') || line.startsWith('\t')) level = 2; // Be flexible
          else level = 1;

          // Special case: Root is level 0. 
          // If we have text but no root yet (shouldn't happen with correct prompt), make it root.
          if (!rootNode) {
             // ... same root logic as above
          }

          // Adjust stack
          // We want to find a parent with level < current level
          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
              stack.pop();
          }

          if (stack.length === 0) {
              // Fallback: attach to root if stack empty
              stack.push({ level: 0, id: rootId });
          }

          const parent = stack[stack.length - 1];
          const nodeId = `node-${Date.now()}-${Math.random().toString(36).substr(2,5)}`;
          
          // Color based on branch (Level 1 decides color)
          let color = '#52525b'; // default zinc
          if (level === 1) {
              color = COLORS[newNodes.length % COLORS.length];
          } else {
              // Inherit parent color logic would require finding parent obj, let's keep it simple or lookup
              const parentNode = newNodes.find(n => n.id === parent.id);
              if (parentNode) color = parentNode.color;
          }

          newNodes.push({
              id: nodeId,
              text: content,
              x: 0, // Will layout later
              y: 0,
              width: Math.min(200, Math.max(100, content.length * 8)),
              height: 50,
              color: color,
              parentId: parent.id,
              scale: level === 1 ? 1.1 : 1.0
          });

          newEdges.push({
              id: `edge-${nodeId}`,
              from: parent.id,
              to: nodeId
          });

          stack.push({ level, id: nodeId });
      });

      // 2. Auto Layout (Radial Tree)
      // We need to position nodes so they don't overlap.
      // Root at 0,0.
      
      const layoutNodes = (nodes: Node[], edges: Edge[]) => {
          const root = nodes.find(n => n.isRoot);
          if (!root) return nodes;

          // Map children
          const hierarchy: Record<string, string[]> = {};
          nodes.forEach(n => {
             if (n.parentId) {
                 if (!hierarchy[n.parentId]) hierarchy[n.parentId] = [];
                 hierarchy[n.parentId].push(n.id);
             }
          });

          // BFS / layer assignment to count needs
          root.x = window.innerWidth / 2;
          root.y = window.innerHeight / 2;

          // Level 1 placement (Circle around root)
          const level1Ids = hierarchy[root.id] || [];
          const l1Count = level1Ids.length;
          const l1Radius = 250;
          
          level1Ids.forEach((id, idx) => {
              const node = nodes.find(n => n.id === id);
              if (!node) return;
              
              const angle = (idx / l1Count) * 2 * Math.PI;
              node.x = root.x + Math.cos(angle) * l1Radius;
              node.y = root.y + Math.sin(angle) * l1Radius;

              // Level 2 placement (Fan out from L1 node)
              // Vector from Root -> L1
              const vecX = Math.cos(angle);
              const vecY = Math.sin(angle);
              
              const l2Ids = hierarchy[id] || [];
              const l2Count = l2Ids.length;
              const l2Radius = 200;
              const spreadAngle = Math.PI / 2; // 90 degrees spread
              
              l2Ids.forEach((childId, cIdx) => {
                  const child = nodes.find(n => n.id === childId);
                  if (!child) return;

                  // Distribute within arc centered on parent's angle
                  // Start angle = angle - spread/2
                  const subAngleStart = angle - (spreadAngle / 2);
                  // Step
                  const step = l2Count > 1 ? spreadAngle / (l2Count - 1) : 0;
                  const finalAngle = l2Count > 1 
                      ? subAngleStart + (cIdx * step) 
                      : angle;

                  child.x = node.x + Math.cos(finalAngle) * l2Radius;
                  child.y = node.y + Math.sin(finalAngle) * l2Radius;
                  
                  // Level 3... linear stacking for simplicity if deeply nested
                  const l3Ids = hierarchy[childId] || [];
                  l3Ids.forEach((grandChildId, gIdx) => {
                       const gChild = nodes.find(n => n.id === grandChildId);
                       if (gChild) {
                           gChild.x = child.x + (gIdx % 2 === 0 ? 20 : -20); // slight stagger
                           gChild.y = child.y + 80 + (gIdx * 60);
                       }
                  });
              });
          });

          return nodes;
      };

      const layoutedNodes = layoutNodes(newNodes, newEdges);
      
      setNodes(layoutedNodes);
      setEdges(newEdges);
      
      // Center view on root
      if (layoutedNodes.length > 0 && layoutedNodes[0].isRoot) {
          const r = layoutedNodes[0];
          setViewport({
              x: window.innerWidth / 2 - r.x - (r.width/2), // Basic centering adjustment
              y: window.innerHeight / 2 - r.y - (r.height/2),
              zoom: 0.8
          });
      }
  };


  const saveToDrive = async () => {
      if (!accessToken || !fileId || isLocalFile) return;

      setIsSaving(true);
      setHasUnsavedChanges(false);

      const data: MindMapData = { nodes, edges, viewport };
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

      try {
          await updateDriveFile(accessToken, fileId, blob, 'application/json');
          console.log("Mind map saved to Drive");
      } catch (e: any) {
          console.error("Failed to save mind map", e);
          setSaveError("Erro ao salvar");
          setHasUnsavedChanges(true); // Retry allowed
          if (e.message === "Unauthorized" && onAuthError) {
              onAuthError();
          }
      } finally {
          setIsSaving(false);
      }
  };

  const saveToLocal = () => {
      const data: MindMapData = { nodes, edges, viewport };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      
      // Force download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.endsWith('.mindmap') ? fileName : `${fileName}.mindmap`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setHasUnsavedChanges(false);
  };

  // Focus Input when editing
  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  // --- Viewport Logic (Corrected Zoom-to-Cursor) ---
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Pinch/Zoom Gesture
      e.preventDefault();
      
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      
      // Cursor position relative to container
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Current world position under cursor
      const worldX = (mouseX - viewport.x) / viewport.zoom;
      const worldY = (mouseY - viewport.y) / viewport.zoom;

      // Calculate new zoom
      // Use exponential zoom for smoother feel: newZoom = oldZoom * factor
      const zoomFactor = 1 - e.deltaY * 0.005; 
      const newZoom = Math.min(Math.max(0.1, viewport.zoom * zoomFactor), 5);

      // New viewport position to keep world coordinate stable under cursor
      const newViewportX = mouseX - worldX * newZoom;
      const newViewportY = mouseY - worldY * newZoom;

      setViewport({ 
        x: newViewportX, 
        y: newViewportY, 
        zoom: newZoom 
      });
    } else {
      // Standard Pan
      setViewport(prev => ({ 
        ...prev, 
        x: prev.x - e.deltaX, 
        y: prev.y - e.deltaY 
      }));
    }
  };

  const screenToWorld = (sx: number, sy: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (sx - rect.left - viewport.x) / viewport.zoom,
      y: (sy - rect.top - viewport.y) / viewport.zoom
    };
  };

  // --- Interaction Logic (Multi-Touch Support) ---
  const handlePointerDown = (e: React.PointerEvent) => {
    // 1. Add pointer to tracker
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const target = e.target as HTMLElement;
    
    // Capture pointer to ensure we receive move/up events outside container
    target.setPointerCapture(e.pointerId);

    // If 2 pointers, we are pinching -> Ignore dragging nodes
    if (pointersRef.current.size === 2) {
       setIsDragging(false);
       setDragNodeId(null);
       prevPinchDistRef.current = null;
       return;
    }

    // Standard Node/Pan interactions (Single Touch)
    if (linkingSourceId) {
        setLinkingSourceId(null);
        return;
    }

    if (target.closest('.mm-node') || target.closest('.mm-toolbar')) return;

    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setSelectedNodeId(null);
    if (editingNodeId) cancelEdit();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Update pointer position
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // --- PINCH ZOOM LOGIC (2 Fingers) ---
    if (pointersRef.current.size === 2) {
        // Convert map values to array and cast to correct type to avoid TS errors
        const points: { x: number; y: number }[] = Array.from(pointersRef.current.values());
        const p1 = points[0];
        const p2 = points[1];

        // Calculate distance
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        
        // Calculate center point between fingers
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;

        if (prevPinchDistRef.current) {
            const container = containerRef.current;
            if (container) {
                const rect = container.getBoundingClientRect();
                const mouseX = centerX - rect.left;
                const mouseY = centerY - rect.top;

                // Zoom Math
                const worldX = (mouseX - viewport.x) / viewport.zoom;
                const worldY = (mouseY - viewport.y) / viewport.zoom;

                const scaleFactor = dist / prevPinchDistRef.current;
                const newZoom = Math.min(Math.max(0.1, viewport.zoom * scaleFactor), 5);

                const newViewportX = mouseX - worldX * newZoom;
                const newViewportY = mouseY - worldY * newZoom;

                setViewport({
                    x: newViewportX,
                    y: newViewportY,
                    zoom: newZoom
                });
            }
        }
        prevPinchDistRef.current = dist;
        return; 
    }

    // --- SINGLE POINTER LOGIC ---
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (dragNodeId) {
       const worldPos = screenToWorld(e.clientX, e.clientY);
       setNodes(prev => prev.map(n => {
         if (n.id === dragNodeId) {
           return { ...n, x: worldPos.x - (n.width / 2), y: worldPos.y - (n.height / 2) };
         }
         return n;
       }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    
    // Reset pinch state if less than 2 fingers
    if (pointersRef.current.size < 2) {
        prevPinchDistRef.current = null;
    }

    if (pointersRef.current.size === 0) {
        setIsDragging(false);
        setDragNodeId(null);
    }
  };

  // --- Linking Logic ---
  const startLinking = (sourceId: string) => {
      setLinkingSourceId(sourceId);
      // Optional: Clear selection to clarify we are in a different mode
      // setSelectedNodeId(null); 
  };

  const completeLinking = (targetId: string) => {
      if (!linkingSourceId) return;
      if (linkingSourceId === targetId) return; // Prevent self-loop

      // Check if connection already exists
      const exists = edges.some(e => 
          (e.from === linkingSourceId && e.to === targetId) || 
          (e.from === targetId && e.to === linkingSourceId)
      );

      if (!exists) {
          const newEdge: Edge = {
              id: `edge-${Date.now()}`,
              from: linkingSourceId,
              to: targetId
          };
          setEdges(prev => [...prev, newEdge]);
      }

      setLinkingSourceId(null);
  };

  // --- Node Logic ---
  const handleNodeDown = (e: React.PointerEvent, id: string) => {
    // If we are currently pinching (2 fingers), disable node selection/dragging
    if (pointersRef.current.size >= 2) return;

    e.stopPropagation();

    // If in linking mode, this click is the "Target" selection
    if (linkingSourceId) {
        completeLinking(id);
        return;
    }

    setSelectedNodeId(id);
    setDragNodeId(id);
  };

  const handleNodeDoubleClick = (e: React.MouseEvent, node: Node) => {
    e.stopPropagation();
    if (linkingSourceId) return; // Ignore double click while linking
    startEdit(node);
  };

  const startEdit = (node: Node) => {
    setEditingNodeId(node.id);
    setEditText(node.text);
  };

  const saveEdit = () => {
    if (editingNodeId) {
      setNodes(prev => prev.map(n => n.id === editingNodeId ? { ...n, text: editText } : n));
      setEditingNodeId(null);
    }
  };

  const cancelEdit = () => {
    setEditingNodeId(null);
  };

  const setNodeScale = (id: string, newScale: number) => {
    setNodes(prev => prev.map(n => {
      if (n.id === id) {
        return { ...n, scale: newScale };
      }
      return n;
    }));
  };

  const addChildNode = () => {
    if (!selectedNodeId) return;
    const parent = nodes.find(n => n.id === selectedNodeId);
    if (!parent) return;

    const newId = `node-${Date.now()}`;
    const color = parent.isRoot 
      ? COLORS[Math.floor(Math.random() * COLORS.length)] 
      : parent.color;

    const angle = Math.random() * Math.PI * 2;
    const dist = 200;
    const nx = parent.x + Math.cos(angle) * dist;
    const ny = parent.y + Math.sin(angle) * dist;

    const newNode: Node = {
      id: newId,
      text: 'Novo Tópico',
      x: nx,
      y: ny,
      width: 120,
      height: 50,
      color,
      parentId: parent.id,
      scale: 1
    };

    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      from: parent.id,
      to: newId
    };

    setNodes(prev => [...prev, newNode]);
    setEdges(prev => [...prev, newEdge]);
    setSelectedNodeId(newId);
    
    setTimeout(() => startEdit(newNode), 100);
  };

  const deleteNode = () => {
    if (!selectedNodeId) return;
    const node = nodes.find(n => n.id === selectedNodeId);
    if (node?.isRoot) {
      alert("Não é possível apagar o tópico central.");
      return;
    }

    const toDeleteIds = new Set<string>();
    const stack = [selectedNodeId];
    
    while(stack.length > 0) {
      const currentId = stack.pop()!;
      toDeleteIds.add(currentId);
      const children = nodes.filter(n => n.parentId === currentId);
      children.forEach(c => stack.push(c.id));
    }

    setNodes(prev => prev.filter(n => !toDeleteIds.has(n.id)));
    setEdges(prev => prev.filter(e => !toDeleteIds.has(e.from) && !toDeleteIds.has(e.to)));
    setSelectedNodeId(null);
  };

  // --- Rendering Helpers ---
  const renderPath = (edge: Edge) => {
    const from = nodes.find(n => n.id === edge.from);
    const to = nodes.find(n => n.id === edge.to);
    if (!from || !to) return null;

    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    const endX = to.x + to.width / 2;
    const endY = to.y + to.height / 2;

    const dx = endX - startX;
    const cp1x = startX + dx * 0.5;
    const cp1y = startY;
    const cp2x = endX - dx * 0.5;
    const cp2y = endY;

    const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;

    return (
      <path
        key={edge.id}
        d={d}
        stroke={to.color}
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
        className="opacity-60 transition-all duration-300"
      />
    );
  };

  if (isLoading) {
      return (
          <div className="flex flex-col h-full w-full items-center justify-center bg-bg text-text">
            <Loader2 className="animate-spin h-10 w-10 text-brand mb-4" />
            <p className="text-text-sec">Carregando mapa mental...</p>
          </div>
      );
  }

  return (
    <div className="w-full h-full bg-[#18181b] relative overflow-hidden flex flex-col font-sans select-none">
      
      {/* AI Loading Overlay */}
      {isGeneratingAi && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in">
           <div className="bg-surface border border-brand/30 rounded-3xl p-8 flex flex-col items-center shadow-2xl max-w-sm text-center">
              <Sparkles size={48} className="animate-pulse text-brand mb-4" />
              <h3 className="text-xl font-bold text-text mb-2">Gemini está trabalhando...</h3>
              <p className="text-text-sec text-sm">Lendo suas citações e estruturando o conhecimento.</p>
           </div>
        </div>
      )}

      {/* Header / Menu Toggle */}
      <div className="absolute top-4 left-4 z-20 flex gap-2 items-center">
        <button onClick={onToggleMenu} className="p-3 bg-surface/80 backdrop-blur rounded-full text-text-sec hover:text-text border border-border shadow-lg">
          <Menu size={24} />
        </button>
        <span className="bg-surface/80 backdrop-blur px-4 py-2 rounded-full border border-border text-text font-medium shadow-lg truncate max-w-[200px]">
            {fileName.replace('.mindmap', '')}
        </span>
        {isLocalFile && (
           <span className="bg-surface/80 backdrop-blur px-3 py-1.5 rounded-full border border-border text-xs text-text-sec flex items-center gap-1">
             <WifiOff size={14} /> Local
           </span>
        )}
      </div>

      <div className="absolute top-4 right-4 z-20 flex gap-2">
         {/* AI BUTTON */}
         <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold shadow-lg transition-all bg-purple-600/20 border-purple-500/50 text-purple-300 hover:bg-purple-600/30 hover:brightness-110">
             <Sparkles size={16} />
             <span className="hidden sm:inline">IA via .txt</span>
             <input 
                type="file" 
                accept=".txt" 
                ref={aiFileInputRef}
                className="hidden" 
                onChange={handleAiFileSelect}
                disabled={isGeneratingAi}
             />
         </label>

         {/* SAVE STATUS INDICATOR */}
         {isLocalFile ? (
            <button 
              onClick={saveToLocal}
              className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold shadow-lg transition-all bg-brand text-bg border-transparent hover:brightness-110`}
              title="Baixar arquivo no dispositivo"
            >
                <Download size={16} />
                <span className="hidden sm:inline">Baixar</span>
            </button>
         ) : (
             <button 
               onClick={saveToDrive}
               disabled={!hasUnsavedChanges || isSaving}
               className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold shadow-lg transition-all ${
                   saveError 
                     ? 'bg-red-500/10 border-red-500 text-red-400' 
                     : hasUnsavedChanges 
                        ? 'bg-surface border-brand text-brand hover:bg-brand/10' 
                        : 'bg-surface/80 backdrop-blur border-border text-text-sec'
               }`}
               title={hasUnsavedChanges ? "Salvar alterações" : "Salvo no Drive"}
             >
               {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span className="hidden sm:inline">Salvando...</span>
                  </>
               ) : saveError ? (
                  <>
                     <RefreshCw size={16} />
                     <span className="hidden sm:inline">Erro. Tentar novamente</span>
                  </>
               ) : hasUnsavedChanges ? (
                  <>
                    <Save size={16} />
                    <span className="hidden sm:inline">Salvar</span>
                  </>
               ) : (
                  <>
                    <Save size={16} />
                    <span className="hidden sm:inline">Salvo</span>
                  </>
               )}
             </button>
         )}
      </div>

      {/* Linking Mode Banner */}
      {linkingSourceId && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-brand text-bg px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <Link size={20} />
            <span className="font-bold">Selecione o nó destino</span>
            <button 
                onClick={() => setLinkingSourceId(null)}
                className="bg-black/20 hover:bg-black/30 p-1 rounded-full ml-2"
            >
                <XCircle size={20} />
            </button>
        </div>
      )}

      {/* Canvas */}
      <div 
        ref={containerRef}
        className={`w-full h-full touch-none ${linkingSourceId ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <div 
          className="w-full h-full transform-gpu origin-top-left transition-transform duration-75 ease-out"
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
        >
          {/* Edges Layer */}
          <svg className="absolute top-0 left-0 w-[50000px] h-[50000px] pointer-events-none" style={{ transform: 'translate(-25000px, -25000px)' }}>
             <g transform="translate(25000, 25000)">
               {edges.map(renderPath)}
             </g>
          </svg>

          {/* Nodes Layer */}
          {nodes.map(node => {
            const isSelected = selectedNodeId === node.id;
            const isEditing = editingNodeId === node.id;
            const isLinkingSource = linkingSourceId === node.id;
            
            return (
              <div
                key={node.id}
                className={`mm-node absolute flex items-center justify-center p-4 rounded-2xl shadow-lg transition-shadow duration-200 border-2 group ${isSelected ? 'ring-4 ring-brand/30 z-10' : 'z-0'} ${isLinkingSource ? 'ring-4 ring-white/50 border-white' : ''}`}
                style={{
                  left: node.x,
                  top: node.y,
                  minWidth: node.width,
                  minHeight: node.height,
                  backgroundColor: '#27272a', // Zinc-800
                  borderColor: node.color,
                  cursor: isDragging ? 'grabbing' : (linkingSourceId ? 'alias' : 'pointer'),
                  transform: `scale(${node.scale || 1})`
                }}
                onPointerDown={(e) => handleNodeDown(e, node.id)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
              >
                 {isEditing ? (
                   <input
                     ref={editInputRef}
                     value={editText}
                     onChange={(e) => setEditText(e.target.value)}
                     onBlur={saveEdit}
                     onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                     className="bg-transparent text-white text-center w-full outline-none font-medium"
                   />
                 ) : (
                   <span className={`text-white text-center pointer-events-none ${node.isRoot ? 'text-lg font-bold' : 'text-base font-medium'}`}>
                     {node.text}
                   </span>
                 )}

                 {/* Floating Actions */}
                 {isSelected && !isEditing && !linkingSourceId && (
                    <div 
                      className="absolute -top-32 left-1/2 -translate-x-1/2 flex gap-4 bg-surface border border-border rounded-2xl p-4 shadow-2xl animate-in fade-in zoom-in duration-200 z-50 cursor-default" 
                      style={{ 
                        transform: `translateX(-50%) scale(${1 / (node.scale || 1)})`,
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                       <button onClick={(e) => { e.stopPropagation(); addChildNode(); }} className="p-4 bg-white/5 hover:bg-white/20 rounded-xl text-green-400 border border-white/5 transition-colors" title="Adicionar Filho">
                         <Plus size={28} />
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); startLinking(node.id); }} className="p-4 bg-white/5 hover:bg-white/20 rounded-xl text-yellow-400 border border-white/5 transition-colors" title="Ligar a outro nó">
                         <Link size={28} />
                       </button>
                       {!node.isRoot && (
                         <button onClick={(e) => { e.stopPropagation(); deleteNode(); }} className="p-4 bg-white/5 hover:bg-white/20 rounded-xl text-red-400 border border-white/5 transition-colors" title="Excluir">
                           <Trash2 size={28} />
                         </button>
                       )}
                       <button onClick={(e) => { e.stopPropagation(); startEdit(node); }} className="p-4 bg-white/5 hover:bg-white/20 rounded-xl text-blue-400 border border-white/5 transition-colors" title="Editar Texto">
                         <Type size={28} />
                       </button>
                    </div>
                 )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div className="mm-toolbar absolute bottom-8 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-md border border-border p-2 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-6 z-50">
         {selectedNode && !linkingSourceId ? (
            <>
               <div className="flex items-center gap-1">
                  <button onClick={() => setNodeScale(selectedNode.id, 1.0)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedNode.scale === 1.0 || !selectedNode.scale ? 'bg-brand text-bg' : 'hover:bg-white/10 text-text-sec'}`}>Normal</button>
                  <button onClick={() => setNodeScale(selectedNode.id, 1.5)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedNode.scale === 1.5 ? 'bg-brand text-bg' : 'hover:bg-white/10 text-text-sec'}`}>Grande</button>
                  <button onClick={() => setNodeScale(selectedNode.id, 2.5)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${selectedNode.scale === 2.5 ? 'bg-brand text-bg' : 'hover:bg-white/10 text-text-sec'}`}>Muito Grande</button>
               </div>
               <div className="w-px h-8 bg-border"></div>
               <div className="flex items-center gap-1">
                 {COLORS.slice(0, 5).map(c => (
                    <button 
                      key={c}
                      onClick={() => setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, color: c } : n))}
                      className={`w-6 h-6 rounded-full border hover:scale-110 transition-transform ${selectedNode.color === c ? 'border-white' : 'border-white/20'}`}
                      style={{ backgroundColor: c }}
                    />
                 ))}
               </div>
            </>
         ) : (
            <>
               <div className="flex items-center gap-1">
                  <button onClick={() => setViewport(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom - 0.2) }))} className="p-3 hover:bg-white/10 rounded-xl text-text-sec hover:text-text transition-colors"><Minus size={20} /></button>
                  <span className="w-12 text-center text-sm font-mono font-bold text-text">{Math.round(viewport.zoom * 100)}%</span>
                  <button onClick={() => setViewport(prev => ({ ...prev, zoom: Math.min(5, prev.zoom + 0.2) }))} className="p-3 hover:bg-white/10 rounded-xl text-text-sec hover:text-text transition-colors"><Plus size={20} /></button>
               </div>
               <div className="w-px h-8 bg-border"></div>
               <button onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })} className="p-3 hover:bg-white/10 rounded-xl text-text-sec hover:text-text transition-colors flex items-center gap-2">
                  <LayoutTemplate size={20} />
                  <span className="text-sm font-bold hidden sm:block">Resetar</span>
               </button>
            </>
         )}
      </div>
    </div>
  );
};