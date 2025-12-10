
interface DefinitionResult {
  word: string;
  meanings: string[];
  source: string;
  url?: string;
}

export async function fetchDefinition(term: string): Promise<DefinitionResult | null> {
  const cleanTerm = term.trim();
  
  // Validação básica
  if (cleanTerm.split(' ').length > 6) {
    throw new Error("Selecione um termo mais curto.");
  }

  // 1. Tentar Dicionário Aberto (Português - Palavras Comuns)
  // Bom para: "Casa", "Correr", "Azul"
  try {
    const res = await fetch(`https://api.dicionario-aberto.net/word/${encodeURIComponent(cleanTerm.toLowerCase())}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        const xmlString = data[0].xml;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        const defs = xmlDoc.getElementsByTagName("def");
        
        const meanings: string[] = [];
        for (let i = 0; i < defs.length; i++) {
          const text = defs[i].textContent?.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
          if (text) meanings.push(text);
        }

        if (meanings.length > 0) {
          return {
            word: term,
            meanings: meanings,
            source: 'Dicionário Aberto'
          };
        }
      }
    }
  } catch (e) {
    console.warn("Dicionário Aberto falhou, tentando próxima fonte...", e);
  }

  // 2. Tentar Wikipédia Search API (PT) - A SOLUÇÃO TÉCNICA
  // Diferente de apenas tentar o link direto, a API de busca encontra o termo correto.
  // Ex: Usuário seleciona "Termodinâmico" -> API acha "Termodinâmica".
  try {
    // Passo A: Pesquisar o título correto
    const searchRes = await fetch(`https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanTerm)}&utf8=&format=json&origin=*`);
    const searchData = await searchRes.json();

    if (searchData.query && searchData.query.search && searchData.query.search.length > 0) {
      // Pega o melhor resultado
      const bestMatch = searchData.query.search[0];
      
      // Passo B: Pegar o resumo deste título
      const summaryRes = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestMatch.title)}`);
      if (summaryRes.ok) {
        const wikiData = await summaryRes.json();
        
        // Filtra desambiguações inúteis
        if (wikiData.type === 'standard' && wikiData.extract) {
          return {
            word: wikiData.title, // Usa o título oficial da Wiki
            meanings: [wikiData.extract],
            source: 'Wikipédia (Enciclopédia)',
            url: wikiData.content_urls?.desktop?.page
          };
        }
      }
    }
  } catch (e) {
    console.warn("Wikipédia falhou...", e);
  }

  // 3. Tentar Free Dictionary API (Inglês) - Fallback para termos em inglês
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanTerm.toLowerCase())}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const meanings: string[] = [];
        
        data[0].meanings.forEach((m: any) => {
          m.definitions.forEach((d: any) => {
            meanings.push(`(${m.partOfSpeech}) ${d.definition}`);
          });
        });

        return {
          word: data[0].word,
          meanings: meanings.slice(0, 3), 
          source: 'Dictionary API (EN)'
        };
      }
    }
  } catch (e) {
    console.warn("Dictionary API (EN) falhou", e);
  }

  return null;
}
