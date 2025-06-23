// Importamos las librerías necesarias
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const formidable = require('formidable');

// --- INICIO DE PROMPTS Y FUNCIONES (TODO INCLUIDO) ---

const LEGAL_ANALYSIS_PROMPT = `
Eres un abogado especialista en derecho contractual español con 15+ años de experiencia. Tu tarea es analizar el siguiente documento legal de forma exhaustiva pero comprensible para un directivo sin formación legal.
INSTRUCCIONES DE ANÁLISIS:
1.  **ESTRUCTURA DE RESPUESTA OBLIGATORIA:** Tu respuesta DEBE ser un único objeto JSON válido, sin texto adicional antes o después. El JSON debe contener las claves: "resumenEjecutivo", "riesgosCriticos", "riesgosMedios", "aspectosPositivos", "recomendacionesEspecificas", "proximosPasos", "respuestaConsulta".
2.  **CONTENIDO DE LAS CLAVES:**
    -   **resumenEjecutivo**: String. Un párrafo claro sobre las partes, objeto, duración y valor del documento.
    -   **riesgosCriticos**: Array de objetos. Cada objeto con la estructura \\{titulo: "string", descripcion: "string", ubicacion: "string"\\}. Identifica riesgos como responsabilidad ilimitada, penalizaciones abusivas (>10%), etc. Si no hay, devuelve [].
    -   **riesgosMedios**: Array de objetos. Cada objeto con la estructura \\{titulo: "string", descripcion: "string"\\}. Identifica riesgos como plazos ajustados, cláusulas ambiguas, etc. Si no hay, devuelve [].
    -   **aspectosPositivos**: Array de objetos. Cada objeto con la estructura \\{fortaleza: "string", porque: "string"\\}. Identifica cláusulas bien redactadas o ventajosas. Si no hay, devuelve [].
    -   **recomendacionesEspecificas**: Array de objetos. Cada objeto con la estructura \\{accion: "string", explicacion: "string"\\}. Deben ser consejos prácticos y accionables. Si no hay, devuelve [].
    -   **proximosPasos**: Array de strings. Lista de 2-3 acciones inmediatas o a medio plazo.
    -   **respuestaConsulta**: String. La respuesta a la pregunta específica del usuario sobre este documento. Si no hay pregunta, devuelve "N/A".
3.  **REGLAS IMPORTANTES:**
    -   Usa un lenguaje de negocio, no jerga legal.
    -   Sé conciso y directo.
    -   La ubicación del riesgo (Página X, Cláusula Y) es crucial.
DOCUMENTO A ANALIZAR:
`;

const SPECIALIZED_PROMPTS = {
    CONTRACT_SERVICES: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Contrato de Servicios. Presta especial atención a: Alcance del trabajo (SOW), entregables, SLAs, condiciones de pago, propiedad intelectual y responsabilidad.`,
    NDA: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Acuerdo de Confidencialidad (NDA). Enfócate en: la definición de "Información Confidencial", duración de la obligación, exclusiones y consecuencias por incumplimiento.`,
    EMPLOYMENT: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Contrato Laboral. Analiza con detalle: Salario y beneficios, jornada, periodo de prueba, cláusulas de no competencia post-contractual y exclusividad.`,
    LEASE: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Contrato de Arrendamiento. Prioriza la revisión de: Duración del contrato y prórrogas, renta y su actualización (IPC), fianza, obras permitidas y responsabilidades de mantenimiento.`
};

function detectDocumentType(content) {
    const contentLower = content.toLowerCase().substring(0, 3000);
    const keywords = {
        CONTRACT_SERVICES: ['servicios', 'prestación de servicios', 'desarrollo', 'consultoría', 'sla', 'alcance del trabajo'],
        NDA: ['confidencialidad', 'secreto comercial', 'información confidencial', 'no divulgación', 'nda'],
        EMPLOYMENT: ['trabajador', 'empleado', 'salario', 'jornada laboral', 'contrato de trabajo'],
        LEASE: ['arrendamiento', 'arrendador', 'arrendatario', 'alquiler', 'inmueble', 'local comercial']
    };
    for (const [type, keywordList] of Object.entries(keywords)) {
        for (const keyword of keywordList) {
            if (contentLower.includes(keyword)) return type;
        }
    }
    return 'GENERAL';
}
// --- FIN DE PROMPTS Y FUNCIONES ---


// Esta es la función principal que Vercel/Netlify ejecutará
module.exports = async (req, res) => {
    // Permitir CORS para que el frontend pueda llamar a esta API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log("--- [LOG 1] INICIO DE LA FUNCIÓN ---");

    try {
        if (!process.env.GOOGLE_API_KEY) {
            console.error("[ERROR FATAL] La variable de entorno GOOGLE_API_KEY no se encontró.");
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