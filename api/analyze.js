// Importamos las librerías necesarias
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const formidable = require('formidable');

// El prompt y las funciones de detección (cópialas de tu versión anterior)
const LEGAL_ANALYSIS_PROMPT = `...`; 
const SPECIALIZED_PROMPTS = { ... };
function detectDocumentType(content) { ... }

// Esta es la función principal que Vercel/Netlify ejecutará
module.exports = async (req, res) => {
    // Permitir CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log("--- [LOG 1] INICIO DE LA FUNCIÓN ---");

    try {
        if (!process.env.GOOGLE_API_KEY) {
            console.error("[ERROR FATAL] La variable GOOGLE_API_KEY no se encontró.");
            return res.status(500).json({ error: 'Error de configuración del servidor: API Key no encontrada.' });
        }
        console.log("--- [LOG 2] API Key encontrada. ---");

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const form = formidable();

        form.parse(req, async (err, fields, files) => {
            if (err || !files.document || !files.document[0]) {
                console.error("[ERROR EN FORM PARSE]", err);
                return res.status(500).json({ error: 'Error procesando el archivo subido.' });
            }
            console.log("--- [LOG 3] Archivo recibido correctamente. ---");

            const file = files.document[0];
            const userQuery = fields.query[0] || "";
            
            const dataBuffer = require('fs').readFileSync(file.filepath);
            const data = await pdf(dataBuffer);
            const text = data.text;
            console.log(`--- [LOG 4] PDF parseado. Longitud del texto: ${text.length}. ---`);
            
            if (!text.trim()) return res.status(400).json({ error: "Documento vacío." });
            
            const docType = detectDocumentType(text);
            let finalPrompt = LEGAL_ANALYSIS_PROMPT + (SPECIALIZED_PROMPTS[docType] || '');
            finalPrompt += `\n\n--- INICIO DEL DOCUMENTO ---\n${text}\n--- FIN DEL DOCUMENTO ---`;
            if (userQuery) {
                finalPrompt += `\n\n--- CONSULTA ADICIONAL DEL USUARIO ---\nResponde: "${userQuery}"`;
            }
            
            console.log("--- [LOG 5] Enviando prompt a Google AI... ---");
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const analysisText = response.text();
            console.log("--- [LOG 6] Respuesta recibida de Google AI. ---");
            
            const cleanedText = analysisText.replace(/```json/g, '').replace(/```/g, '').trim();
            const analysisJson = JSON.parse(cleanedText);
            
            console.log("--- [LOG 7] JSON parseado. Enviando respuesta al cliente. ---");
            res.status(200).json(analysisJson);
        });

    } catch (error) {
        console.error("--- [ERROR EN EL BLOQUE CATCH PRINCIPAL] ---", error);
        res.status(500).json({ error: "Error interno del servidor." });
    }
};