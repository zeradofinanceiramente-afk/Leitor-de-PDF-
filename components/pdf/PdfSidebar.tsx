
import React from 'react';
import { X, Lock, FileText, Copy, Download, Sparkles, Loader2, Hash, PaintBucket, Eye, ImageOff, Columns, Highlighter, Pen } from 'lucide-react';
import { Annotation } from '../../types';
import { usePdfContext } from '../../context/PdfContext';

export type SidebarTab = 'annotations' | 'settings' | 'fichamento' | 'ai';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  
  // Data props that are calculated in parent still passed, but settings come from context
  sidebarAnnotations: Annotation[]; 
  fichamentoText: string;
  aiExplanation: string;
  isAiLoading: boolean;

  onCopyFichamento: () => void;
  onDownloadFichamento: () => void;
}

export const PdfSidebar: React.FC<Props> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  sidebarAnnotations,
  fichamentoText,
  aiExplanation,
  isAiLoading,
  onCopyFichamento,
  onDownloadFichamento,
}) => {
  const { settings, updateSettings, jumpToPage, removeAnnotation } = usePdfContext();

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[60] flex justify-end">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-80 bg-surface h-full shadow-2xl flex flex-col animate-in slide-in-from-right-10 duration-200">
            
            <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2"><span className="font-semibold text-text">Menu</span></div>
                <button onClick={onClose} className="text-text-sec hover:text-text"><X size={20} /></button>
            </div>

            <div className="flex border-b border-border">
                {['annotations', 'fichamento', 'ai', 'settings'].map(tab => (
                    <button 
                        key={tab}
                        onClick={() => onTabChange(tab as SidebarTab)}
                        className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 capitalize ${activeTab === tab ? 'border-brand text-brand' : 'border-transparent text-text-sec hover:text-text'}`}
                    >
                        {tab === 'annotations' ? 'Anotações' : tab === 'ai' ? 'IA' : tab === 'fichamento' ? 'Fichamento' : 'Ajustes'}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {activeTab === 'annotations' ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-text-sec font-bold uppercase tracking-wider mb-2">
                             <div className="flex items-center gap-2">
                                 <span>Lista de Anotações</span>
                                 {sidebarAnnotations.length > 0 && <span className="bg-brand/10 text-brand text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-brand/20">{sidebarAnnotations.length}</span>}
                             </div>
                        </div>

                        {sidebarAnnotations.length === 0 && <div className="text-center text-text-sec py-10 text-sm">Nenhuma anotação.</div>}
                        
                        {sidebarAnnotations.map((ann, idx) => (
                            <div 
                                key={ann.id || idx}
                                onClick={() => jumpToPage(ann.page)}
                                className="bg-bg p-3 rounded-lg border border-border hover:border-brand cursor-pointer group transition-colors relative"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: ann.color || (ann.type === 'highlight' ? settings.highlightColor : '#fef9c3') }} />
                                    <span className="text-xs text-text-sec uppercase font-bold tracking-wider">Pág {ann.page + settings.pageOffset - 1}</span>
                                    {ann.isBurned && <span className="text-[10px] bg-surface border border-border px-1 rounded text-text-sec ml-auto flex items-center gap-1"><Lock size={8}/> Salvo</span>}
                                </div>
                                <p className="text-sm text-text line-clamp-2 leading-relaxed">{ann.text || "Sem conteúdo"}</p>
                                {!ann.isBurned && (
                                  <button onClick={(e) => { e.stopPropagation(); removeAnnotation(ann); }} className="absolute top-2 right-2 text-text-sec hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"><X size={14} /></button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : activeTab === 'settings' ? (
                    <div className="space-y-6 animate-in fade-in">
                        {/* Pagination Settings */}
                        <div className="space-y-3">
                            <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2"><Hash size={14} /> Paginação</h4>
                            <div className="flex justify-between items-center bg-bg p-2 rounded-lg border border-border">
                                <label className="text-sm text-text">Página Inicial</label>
                                <input type="number" min="1" value={settings.pageOffset} onChange={(e) => updateSettings({ pageOffset: Math.max(1, parseInt(e.target.value) || 1) })} className="bg-transparent border-b border-border w-16 text-right focus:outline-none focus:border-brand" />
                            </div>
                        </div>

                        <div className="w-full h-px bg-border my-2"></div>

                        {/* Reading Settings */}
                        <div className="space-y-3">
                            <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2"><PaintBucket size={14} /> Leitura</h4>

                            {/* Original Mode Toggle */}
                            <div className="flex items-center justify-between bg-bg p-3 rounded-lg border border-border mb-2">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm text-text font-medium flex items-center gap-2">{settings.disableColorFilter ? <Eye size={16} className="text-brand"/> : <ImageOff size={16} className="text-text-sec"/>} Modo Original</span>
                                </div>
                                <button onClick={() => updateSettings({ disableColorFilter: !settings.disableColorFilter })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.disableColorFilter ? 'bg-brand' : 'bg-surface border border-text-sec'}`}>
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${settings.disableColorFilter ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Double Page / Columns Toggle */}
                            <div className="flex items-center justify-between bg-bg p-3 rounded-lg border border-border mb-2">
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm text-text font-medium flex items-center gap-2">
                                        <Columns size={16} className={settings.detectColumns ? "text-brand" : "text-text-sec"}/> 
                                        Colunas / Pág. Dupla
                                    </span>
                                    <span className="text-[10px] text-text-sec leading-none">Evita seleção através do meio</span>
                                </div>
                                <button onClick={() => updateSettings({ detectColumns: !settings.detectColumns })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.detectColumns ? 'bg-brand' : 'bg-surface border border-text-sec'}`}>
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${settings.detectColumns ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className={`space-y-3 transition-opacity duration-300 ${settings.disableColorFilter ? 'opacity-40 pointer-events-none grayscale' : 'opacity-100'}`}>
                                <div className="grid grid-cols-3 gap-2 mb-2">
                                    <button onClick={() => updateSettings({ pageColor: '#ffffff', textColor: '#000000' })} className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-brand bg-white text-black transition-all">
                                        <div className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center font-serif font-bold text-xs bg-white text-black">A</div><span className="text-[10px] font-medium text-gray-900">Claro</span>
                                    </button>
                                    <button onClick={() => updateSettings({ pageColor: '#0f172a', textColor: '#ffffff' })} className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-brand bg-[#0f172a] text-white transition-all">
                                        <div className="w-6 h-6 rounded-full border border-gray-700 flex items-center justify-center font-serif font-bold text-xs bg-[#0f172a] text-white">A</div><span className="text-[10px] font-medium text-gray-200">Escuro</span>
                                    </button>
                                    <button onClick={() => updateSettings({ pageColor: '#000000', textColor: '#ffffff' })} className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border hover:border-brand bg-black text-white transition-all">
                                        <div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center font-serif font-bold text-xs bg-black text-white">A</div><span className="text-[10px] font-medium text-gray-200">OLED</span>
                                    </button>
                                </div>
                                
                                {/* Custom Colors */}
                                <div className="bg-bg p-3 rounded-lg border border-border space-y-3">
                                    <label className="text-xs font-bold text-text-sec uppercase">Personalizado</label>
                                    
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-sm text-text">Fundo</label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-text-sec uppercase">{settings.pageColor}</span>
                                                <input 
                                                  type="color" 
                                                  value={settings.pageColor} 
                                                  onChange={(e) => updateSettings({ pageColor: e.target.value })} 
                                                  className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-border pt-2">
                                        <label className="text-sm text-text">Texto</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-text-sec uppercase">{settings.textColor}</span>
                                            <input 
                                              type="color" 
                                              value={settings.textColor} 
                                              onChange={(e) => updateSettings({ textColor: e.target.value })} 
                                              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Highlight Settings */}
                        <div className="space-y-3">
                            <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2"><Highlighter size={14} /> Destaque</h4>
                            <div className="bg-bg p-3 rounded-lg border border-border space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm text-text">Cor</label>
                                    <div className="flex gap-1">
                                        {['#facc15', '#4ade80', '#60a5fa', '#f472b6', '#a78bfa'].map(c => (
                                            <button key={c} onClick={() => updateSettings({ highlightColor: c })} className={`w-6 h-6 rounded-full border border-border ${settings.highlightColor === c ? 'ring-2 ring-text' : ''}`} style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm text-text">Opacidade</label>
                                        <span className="text-xs text-text-sec font-mono">{Math.round(settings.highlightOpacity * 100)}%</span>
                                    </div>
                                    <input 
                                      type="range" 
                                      min="10" 
                                      max="100" 
                                      value={settings.highlightOpacity * 100} 
                                      onChange={(e) => updateSettings({ highlightOpacity: parseInt(e.target.value) / 100 })}
                                      className="w-full accent-brand h-1 bg-surface rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Ink/Pen Settings */}
                        <div className="space-y-3">
                            <h4 className="text-xs text-text-sec uppercase font-bold tracking-wider flex items-center gap-2"><Pen size={14} /> Caneta</h4>
                            <div className="bg-bg p-3 rounded-lg border border-border space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm text-text">Cor</label>
                                    <div className="flex items-center gap-2">
                                         <input 
                                           type="color" 
                                           value={settings.inkColor} 
                                           onChange={(e) => updateSettings({ inkColor: e.target.value })}
                                           className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                         />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <label className="text-sm text-text">Espessura</label>
                                        <span className="text-xs text-text-sec font-mono">{settings.inkStrokeWidth}px</span>
                                    </div>
                                    <input 
                                      type="range" 
                                      min="1" 
                                      max="50" 
                                      value={settings.inkStrokeWidth} 
                                      onChange={(e) => updateSettings({ inkStrokeWidth: parseInt(e.target.value) })}
                                      className="w-full accent-brand h-1 bg-surface rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                    </div>
                ) : (
                    // Fichamento or AI logic (simplified for brevity, logic remains same)
                    <div className="space-y-4">
                        {activeTab === 'fichamento' ? (
                            <>
                                <textarea value={fichamentoText} readOnly className="w-full h-64 bg-bg border border-border rounded-lg p-3 text-sm" />
                                <div className="flex gap-2">
                                    <button onClick={onCopyFichamento} className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm">Copiar</button>
                                    <button onClick={onDownloadFichamento} className="flex-1 px-3 py-2 bg-brand text-bg rounded-lg text-sm font-bold">Baixar</button>
                                </div>
                            </>
                        ) : (
                            <div className="bg-bg border border-border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap">
                                {isAiLoading ? <Loader2 className="animate-spin mx-auto"/> : aiExplanation || "Selecione texto para explicar com IA."}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};
