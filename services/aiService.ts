
import { GoogleGenAI } from "@google/genai";
import { MindMapData } from "./storageService";

interface AiNode {
  id: string;
  label: string;
  parentId?: string | null;
  summary?: string;
}

// Paleta "Neon/Dark" (Alto Contraste no Fundo Preto)
// Baseado no estilo visual solicitado: Verde Neon, Amarelo, Ciano
const COLORS = [
  '#39FF14', // Neon Green (Principal)
  '#FFFF00', // Neon Yellow (Destaque)
  '#00FFFF', // Cyan (Conexões)
  '#FF00FF', // Magenta (Contraste)
  '#ADFF2F', // Green Yellow
  '#FFA500', // Neon Orange
];

// Algoritmo simples de layout em árvore
function applyLayout(nodes: any[], rootId: string) {
  const levelHeight = 160; // Altura aumentada para comportar nós descritivos (texto denso)
  const hierarchy: Record<string, any[]> = {};

  // Agrupar por parentId
  nodes.forEach(n => {
    const pid = n.parentId || 'root';
    if (!hierarchy[pid]) hierarchy[pid] = [];
    hierarchy[pid].push(n);
  });

  // Função recursiva para posicionar
  const positionNode = (nodeId: string, depth: number, startY: number) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return 0;

    const children = hierarchy[nodeId] || [];
    
    // Altura necessária para este nó e seus filhos
    let myHeight = 0;

    if (children.length === 0) {
      myHeight = levelHeight;
      node.y = startY;
    } else {
      let childY = startY;
      children.forEach(child => {
        const h = positionNode(child.id, depth + 1, childY);
        childY += h;
        myHeight += h;
      });
      // Centraliza o pai em relação aos filhos
      node.y = startY + (myHeight / 2) - (levelHeight / 2);
    }

    // Espaçamento horizontal aumentado para caixas de texto largas (estilo acadêmico)
    node.x = depth * 450; 
    return myHeight;
  };

  const root = nodes.find(n => n.id === rootId);
  if (root) {
      positionNode(rootId, 0, 0);
      root.x = 0;
      root.y = 0;
  }
}

export async function generateMindMapFromText(text: string): Promise<MindMapData> {
  if (!process.env.API_KEY) {
    throw new Error("Chave de API não configurada.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Prompt ajustado para Estilo Acadêmico e JSON manual (sem mimeType forçado)
  const prompt = `
    Atue como um pesquisador acadêmico especialista criando um Mapa Mental Conceitual Avançado.
    
    ENTRADA DO USUÁRIO:
    "${text.substring(0, 30000)}"

    OBJETIVO:
    Criar uma estrutura JSON para um mapa mental que organize o conhecimento do texto, enriquecido com validação externa via Google Search.
    
    DIRETRIZES DE ESTILO (RIGOR ACADÊMICO):
    1. **Nós Descritivos**: NUNCA use apenas palavras-chave soltas (ex: "Memória"). Os nós devem ser parágrafos curtos, definições densas ou teses (20-50 palavras). 
       Exemplo: Ao invés de "Identidade", use "Identidade: processo de construção contínua sujeita a fluxos sociais, não um dado imutável".
    2. **Grounding (Validação Externa)**: Use o Google Search para verificar se os conceitos estão alinhados com a teoria acadêmica. Se o texto citar autores (ex: Bourdieu, Foucault), garanta que a definição do conceito (ex: Habitus, Biopoder) esteja teoricamente correta.
    3. **Hierarquia Lógica**: 
       - Raiz: O tema central ou tese principal.
       - Ramos: Argumentos teóricos, conceitos-chave e seus desdobramentos.
    
    FORMATO DE SAÍDA:
    Retorne APENAS um JSON válido. Não use markdown se possível, ou envolva em bloco de código json.
    Formato esperado:
    {
      "rootLabel": "Título Central (Conceito/Autor)",
      "nodes": [
        { "id": "1", "label": "Conceito Principal: explicação densa e validada...", "parentId": "root" },
        { "id": "2", "label": "Desdobramento: consequência teórica ou prática...", "parentId": "1" }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        // REMOVIDO responseMimeType: 'application/json' pois conflita com ferramentas (googleSearch)
        tools: [{ googleSearch: {} }],
        temperature: 0.3, // Temperatura baixa para maior rigor acadêmico
      }
    });

    let jsonText = response.text;
    if (!jsonText) throw new Error("Sem resposta da IA");

    // Limpeza manual do JSON (Markdown strip)
    jsonText = jsonText.trim();
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let rawData;
    try {
        rawData = JSON.parse(jsonText);
    } catch (e) {
        console.error("Falha ao parsear JSON da IA:", jsonText);
        throw new Error("A IA não retornou um formato válido. Tente novamente.");
    }
    
    const nodes: any[] = [];
    const edges: any[] = [];

    // 1. Criar Raiz
    const rootId = `root-${Date.now()}`;
    nodes.push({
      id: rootId,
      text: rawData.rootLabel || "Tema Central",
      x: 0,
      y: 0,
      width: 280, 
      height: 100,
      color: '#ffffff',
      isRoot: true,
      scale: 1.4
    });

    // 2. Processar Filhos
    const idMap: Record<string, string> = { 'root': rootId };

    if (Array.isArray(rawData.nodes)) {
        rawData.nodes.forEach((n: AiNode) => {
            idMap[n.id] = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        });

        rawData.nodes.forEach((n: AiNode, index: number) => {
            const realId = idMap[n.id];
            // Se o parentId não for encontrado, liga à raiz para não perder o nó
            const realParentId = idMap[n.parentId || 'root'] || rootId;
            
            // Cálculo de tamanho baseado na densidade do texto (Estilo Acadêmico = Mais Texto)
            const textLength = n.label.length;
            const estimatedWidth = Math.min(500, Math.max(250, textLength * 6)); 
            const estimatedHeight = Math.max(80, Math.ceil(textLength / 35) * 30); 

            nodes.push({
                id: realId,
                text: n.label,
                x: 0, 
                y: 0, 
                width: estimatedWidth,
                height: estimatedHeight,
                color: '#a3e635', // Será colorido no passo 3
                parentId: realParentId,
                scale: 1
            });

            edges.push({
                id: `edge-${index}-${Date.now()}`,
                from: realParentId,
                to: realId
            });
        });
    }

    // 3. Aplicar Cores Estilo "Neon/Dark"
    const level1Nodes = nodes.filter(n => n.parentId === rootId);
    level1Nodes.forEach((l1, idx) => {
        const branchColor = COLORS[idx % COLORS.length];
        l1.color = branchColor;
        
        // Propagar cor para os filhos
        const stack = [l1.id];
        while(stack.length > 0) {
            const currentId = stack.pop();
            const children = nodes.filter(n => n.parentId === currentId);
            children.forEach(child => {
                child.color = branchColor;
                stack.push(child.id);
            });
        }
    });

    // 4. Calcular Layout
    applyLayout(nodes, rootId);

    // Adicionar nó de metadados/grounding se disponível (Opcional)
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        // Poderíamos adicionar um nó de "Fontes" aqui, mas por hora mantemos a estrutura limpa
        console.log("Grounding Sources:", response.candidates[0].groundingMetadata.groundingChunks);
    }
    
    return {
        id: `gen-${Date.now()}`,
        name: rawData.rootLabel ? `${rawData.rootLabel} (IA).mindmap` : "Mapa Mental IA.mindmap",
        nodes,
        edges,
        viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, zoom: 0.5 }, // Zoom out inicial para ver o mapa grande
        updatedAt: new Date().toISOString()
    };

  } catch (error: any) {
    console.error("Erro na geração IA:", error);
    throw new Error("Falha ao gerar mapa mental: " + error.message);
  }
}
