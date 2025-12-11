import React, { useState } from 'react';
import { BubbleMenu, Editor } from '@tiptap/react';
import { GoogleGenAI } from "@google/genai";
import { Sparkles, Loader2, RefreshCw, Scissors, Wand2, Bold, Italic, Link, ChevronRight } from 'lucide-react';

interface Props {
  editor: Editor;
}

export const AiBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showAiSubmenu, setShowAiSubmenu] = useState(false);

  const processAi = async (promptType: 'rewrite' | 'summarize' | 'expand') => {
    const selection = editor.state.selection;
    const text = editor.state.doc.textBetween(selection.from, selection.to, ' ');
    
    if (!text || text.length < 5) return;

    setIsLoading(true);
    try {
      if (!process.env.API_KEY) throw new Error("API Key missing");
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let prompt = "";
      if (promptType === 'rewrite') prompt = `Reescreva o seguinte texto de forma mais clara, profissional e corrigida:\n"${text}"`;
      if (promptType === 'summarize') prompt = `Resuma o seguinte texto em um único parágrafo conciso:\n"${text}"`;
      if (promptType === 'expand') prompt = `Expanda o seguinte texto com mais detalhes e contexto relevante:\n"${text}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const result = response.text;
      if (result) {
        editor.chain().focus().insertContent(result).run();
      }
    } catch (e) {
      console.error(e);
      alert("Erro na IA. Tente novamente.");
    } finally {
      setIsLoading(false);
      setShowAiSubmenu(false);
    }
  };

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <BubbleMenu editor={editor} tippyOptions={{ duration: 100, zIndex: 50 }} className="flex bg-surface shadow-2xl border border-border rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200">
      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-brand">
           <Loader2 size={16} className="animate-spin" />
           Processando...
        </div>
      ) : showAiSubmenu ? (
        <>
          <button 
            onClick={() => processAi('rewrite')}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text"
          >
            <RefreshCw size={14} className="text-blue-400"/>
            Reescrever
          </button>
          <div className="w-px bg-border my-1"></div>
          <button 
            onClick={() => processAi('summarize')}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text"
          >
            <Scissors size={14} className="text-orange-400"/>
            Resumir
          </button>
          <div className="w-px bg-border my-1"></div>
          <button 
            onClick={() => processAi('expand')}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text"
          >
            <Wand2 size={14} className="text-purple-400"/>
            Expandir
          </button>
          <div className="w-px bg-border my-1"></div>
          <button onClick={() => setShowAiSubmenu(false)} className="px-2 py-2 hover:bg-white/10 text-text-sec text-xs">
             Voltar
          </button>
        </>
      ) : (
        <>
          {/* Formatação Rápida */}
          <button 
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-3 py-2 hover:bg-white/10 transition-colors ${editor.isActive('bold') ? 'text-brand' : 'text-text'}`}
          >
            <Bold size={16} />
          </button>
          <button 
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-3 py-2 hover:bg-white/10 transition-colors ${editor.isActive('italic') ? 'text-brand' : 'text-text'}`}
          >
            <Italic size={16} />
          </button>
          <button 
            onClick={toggleLink}
            className={`px-3 py-2 hover:bg-white/10 transition-colors ${editor.isActive('link') ? 'text-brand' : 'text-text'}`}
          >
            <Link size={16} />
          </button>

          <div className="w-px bg-border my-1"></div>

          {/* Botão para abrir Submenu IA */}
          <button 
            onClick={() => setShowAiSubmenu(true)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-sm font-medium transition-colors text-text group"
          >
            <Sparkles size={16} className="text-purple-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline">IA</span>
            <ChevronRight size={14} className="text-text-sec" />
          </button>
        </>
      )}
    </BubbleMenu>
  );
};