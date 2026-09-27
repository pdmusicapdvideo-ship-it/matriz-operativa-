exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Método no permitido." };

  try {
    const payload = JSON.parse(event.body || "{}");
    const { accion, agente, tema, id_registro, tiempos_audio } = payload;
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
        throw new Error("Variables de entorno ausentes. El servidor no puede autenticarse.");
    }

    const promptPsique = "Actúa como Mentor y Senior Prompt Engineer. Tono clínico, analítico y directo. Enfoque exclusivo en mente humana, conducta y cultura pop. Prohibido misticismo, religión o espiritualidad. Economía del lenguaje y síntesis profunda.";
    const promptCodex = "Actúa como Mentor y Senior Prompt Engineer para CODEX ANCESTRAL. Tono Faraónico (estilo Narritvs): autoritario, potente, analítico, con profunda carga espiritual y teológica. Deconstruye mitos desde la psicología del Yo y la gnosis.";

    const systemInstruction = agente === 'codex' ? promptCodex : promptPsique;
    // Nomenclatura exacta requerida por la API v1beta
    const geminiModel = "gemini-1.5-flash-latest";

    // ==========================================
    // FASE 1: EXTRACCIÓN DE NARRATIVA Y SEO
    // ==========================================
    if (accion === 'fase_1') {
      if (!tema || !agente) throw new Error("Faltan parámetros en la Fase 1.");

      const geminiPayload = {
        contents: [{ parts: [{ text: `Tema: ${tema}\n\nInstrucción: Genera un guion técnico de 3 bloques (Fase 1 y 2). Usa pausas (...) para ElevenLabs. Luego, genera la Fase 4 (SEO: Títulos, miniatura, etiquetas y comentario). Estructura el texto claramente separando GUION y SEO.` }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] }
      };

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
      
      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) throw new Error(`Rechazo de Google Gemini: ${geminiData.error?.message || 'Error en la petición.'}`);
      if (!geminiData.candidates) throw new Error("Gemini no devolvió texto estructurado.");
      
      const resultadoTexto = geminiData.candidates[0].content.parts[0].text;
      const mitad = Math.floor(resultadoTexto.length / 2);
      const guionExtract = resultadoTexto.substring(0, mitad);
      const seoExtract = resultadoTexto.substring(mitad);

      const supaRes = await fetch(`${supabaseUrl}/rest/v1/matriz_ia`, {
        method: "POST",
        headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ agente, tema, guion: guionExtract, seo: seoExtract, estado: "fase_2_pendiente" })
      });

      const supaData = await supaRes.json();
      if (!supaRes.ok) throw new Error(`Rechazo de Supabase: ${supaData.message || supaData.hint || 'Error de base de datos.'}`);

      return { statusCode: 200, body: JSON.stringify({ id: supaData[0].id, mensaje: "Narrativa extraída.", guion: guionExtract, seo: seoExtract }) };
    } 
    
    // ==========================================
    // FASE 2: CALIBRACIÓN VISUAL SINCRO
    // ==========================================
    if (accion === 'fase_2') {
      if (!id_registro || !tiempos_audio) throw new Error("Faltan parámetros en la Fase 2.");

      const fetchContext = await fetch(`${supabaseUrl}/rest/v1/matriz_ia?id=eq.${id_registro}&select=guion,agente`, {
        headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
      });
      const contextData = await fetchContext.json();
      if (!fetchContext.ok || !contextData.length) throw new Error("Supabase no encontró el ID del registro.");
      
      const guionPrevio = contextData[0].guion;
      const agentePrevio = contextData[0].agente;
      const systemInstVisual = agentePrevio === 'codex' ? promptCodex : promptPsique;

      const visualPayload = {
        contents: [{ parts: [{ text: `Guion Base:\n${guionPrevio}\n\nTiempos de Audio: ${tiempos_audio}\n\nInstrucción: Calcula la cantidad de clips visuales necesarios. Genera Prompts Cinemátográficos de alta gama, claroscuro dramático, colores vibrantes. Estilo digital minimalista. Crea secuencias de 3 clips de historia seguidos de 3 de relleno. Entregar en Inglés con traducción al Español.` }] }],
        systemInstruction: { parts: [{ text: systemInstVisual }] }
      };

      const geminiResVisual = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visualPayload)
      });
      
      const geminiDataVisual = await geminiResVisual.json();
      if (!geminiResVisual.ok) throw new Error(`Rechazo de Google Gemini (Fase 2): ${geminiDataVisual.error?.message || 'Error en prompt visual.'}`);
      
      const visualTexto = geminiDataVisual.candidates[0].content.parts[0].text;

      const updateRes = await fetch(`${supabaseUrl}/rest/v1/matriz_ia?id=eq.${id_registro}`, {
        method: "PATCH",
        headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ tiempos_audio, prompts_visuales: visualTexto, estado: "completado" })
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(`Rechazo de Supabase (Actualización): ${updateData.message || 'Error al guardar.'}`);

      return { statusCode: 200, body: JSON.stringify({ id: id_registro, mensaje: "Vectores sincronizados.", visuales: visualTexto }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Acción no reconocida." }) };

  } catch (error) {
    console.error("DIAGNÓSTICO CRÍTICO:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
