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

    // Nomenclatura del motor de producción más rápido y estable
    const geminiModel = "gemini-3.8-flash";

    const promptPsique = "Actúa como Mentor y Senior Prompt Engineer. Tono clínico, analítico y directo. Enfoque exclusivo en mente humana, conducta y cultura pop. Prohibido misticismo, religión o espiritualidad. Economía del lenguaje y síntesis profunda.";
    const promptCodex = "Actúa como Mentor y Senior Prompt Engineer para CODEX ANCESTRAL. Tono Faraónico: autoritario, potente, analítico, con profunda carga espiritual y teológica. Deconstruye mitos desde la psicología del Yo y la gnosis.";
    const systemInstruction = agente === 'codex' ? promptCodex : promptPsique;

    // ==========================================
    // FASE 1: EXTRACCIÓN DE NARRATIVA Y SEO
    // ==========================================
    if (accion === 'fase_1') {
      if (!tema || !agente) throw new Error("Faltan parámetros en la Fase 1.");

      const geminiPayload = {
        contents: [{ parts: [{ text: `Tema: ${tema}\n\nInstrucción: Genera un guion técnico de 3 bloques (Fase 1 y 2). Usa pausas (...) para ElevenLabs. Luego, genera la Fase 4 (SEO). Estructura el texto separando GUION y SEO. Sé directo, de alta densidad y extrema brevedad para optimizar el tiempo de red computacional.` }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        // Límite estricto para evitar el timeout de 10 segundos de Netlify
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
      };

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
      
      // Programación defensiva: Extraer como texto crudo primero para evitar el colapso HTML
      const rawText = await geminiRes.text();
      let geminiData;
      
      try {
          geminiData = JSON.parse(rawText);
      } catch (parseError) {
          throw new Error(`Latencia crítica de red. Netlify cortó la conexión. Respuesta del servidor: ${rawText.substring(0, 50)}...`);
      }

      if (!geminiRes.ok) throw new Error(`Rechazo del Motor Gemini: ${geminiData.error?.message || 'Error de procesamiento.'}`);
      if (!geminiData.candidates) throw new Error("El modelo procesó la solicitud pero no devolvió el paquete de texto.");
      
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
      if (!supaRes.ok) throw new Error(`Rechazo de persistencia en Supabase: ${supaData.message || supaData.hint}`);

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
        contents: [{ parts: [{ text: `Guion Base:\n${guionPrevio}\n\nTiempos de Audio: ${tiempos_audio}\n\nInstrucción: Calcula visuales necesarios. Genera Prompts Cinemátográficos de alta gama. Minimalista. Secuencias: 3 de historia, 3 de relleno. Entregar en Inglés y Español. Máxima brevedad.` }] }],
        systemInstruction: { parts: [{ text: systemInstVisual }] },
        generationConfig: { maxOutputTokens: 800, temperature: 0.7 }
      };

      const geminiResVisual = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visualPayload)
      });
      
      const rawTextVisual = await geminiResVisual.text();
      let geminiDataVisual;
      
      try {
          geminiDataVisual = JSON.parse(rawTextVisual);
      } catch (e) {
          throw new Error("Latencia crítica en Fase 2. El servidor cortó la conexión.");
      }

      if (!geminiResVisual.ok) throw new Error(`Rechazo Visual: ${geminiDataVisual.error?.message}`);
      
      const visualTexto = geminiDataVisual.candidates[0].content.parts[0].text;

      const updateRes = await fetch(`${supabaseUrl}/rest/v1/matriz_ia?id=eq.${id_registro}`, {
        method: "PATCH",
        headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        body: JSON.stringify({ tiempos_audio, prompts_visuales: visualTexto, estado: "completado" })
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(`Rechazo de Supabase (Actualización): ${updateData.message}`);

      return { statusCode: 200, body: JSON.stringify({ id: id_registro, mensaje: "Vectores sincronizados.", visuales: visualTexto }) };
    }

    return { statusCode: 400, body: JSON.stringify({ error: "Acción no reconocida." }) };

  } catch (error) {
    console.error("DIAGNÓSTICO CRÍTICO:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
