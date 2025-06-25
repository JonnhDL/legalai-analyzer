require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const formidable = require('formidable');

// --- PROMPTS Y FUNCIONES (Sin cambios) ---
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
const SPECIALIZED_PROMPTS = { /* ... tu objeto SPECIALIZED_PROMPTS ... */ };
function detectDocumentType(content) { /* ... tu función detectDocumentType ... */ }

// --- FUNCIÓN SERVERLESS PRINCIPAL (REESCRITA) ---
module.exports = async (req, res) => {
    // Permitir CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Aumentar el tiempo de espera de la respuesta.
    // Esto es un truco para darle más tiempo a la función en Netlify.
    res.setTimeout(25000, () => {
        console.error('Timeout: La función ha tardado demasiado en responder.');
        if (!res.headersSent) {
            res.status(504).json({ error: 'El servidor ha tardado demasiado en responder. Inténtalo de nuevo con un documento más pequeño.' });
        }
    });

    try {
        if (!process.env.GOOGLE_API_KEY) {
            throw new Error('Configuración del servidor incompleta: API Key no encontrada.');
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const form = formidable();

        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ fields, files });
            });
        });

        if (!files.document || !files.document[0]) {
            throw new Error('No se ha subido ningún archivo con el nombre "document".');
        }

        const file = files.document[0];
        const userQuery = (fields.query && fields.query[0]) ? fields.query[0] : "";
        
        const dataBuffer = require('fs').readFileSync(file.filepath);
        const data = await pdf(dataBuffer);
        const text = data.text;
        
        if (!text.trim()) {
            throw new Error('El documento está vacío o no se ha podido leer el texto.');
        }
        
        const docType = detectDocumentType(text);
        let finalPrompt = LEGAL_ANALYSIS_PROMPT + (SPECIALIZED_PROMPTS[docType] || '');
        finalPrompt += `\n\n--- INICIO DEL DOCUMENTO ---\n${text}\n--- FIN DEL DOCUMENTO ---`;
        if (userQuery) {
            finalPrompt += `\n\n--- CONSULTA ADICIONAL DEL USUARIO ---\nResponde: "${userQuery}"`;
        }
        
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const analysisText = response.text();
        
        const cleanedText = analysisText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisJson = JSON.parse(cleanedText);
        
        if (!res.headersSent) {
            res.status(200).json(analysisJson);
        }

    } catch (error) {
        console.error("ERROR GLOBAL EN LA FUNCIÓN:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Ha ocurrido un error interno en el servidor.' });
        }
    }
};

// Pega aquí de nuevo el contenido de tus SPECIALIZED_PROMPTS y detectDocumentType
const SPECIALIZED_PROMPTS_CONTENT = {
    CONTRACT_SERVICES: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Contrato de Servicios. Presta especial atención a: Alcance del trabajo (SOW), entregables, SLAs, condiciones de pago, propiedad intelectual y responsabilidad.`,
    NDA: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Acuerdo de Confidencialidad (NDA). Enfócate en: la definición de "Información Confidencial", duración de la obligación, exclusiones y consecuencias por incumplimiento.`,
    EMPLOYMENT: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Contrato Laboral. Analiza con detalle: Salario y beneficios, jornada, periodo de prueba, cláusulas de no competencia post-contractual y exclusividad.`,
    LEASE: `\n\nCONTEXTO DE ESPECIALIZACIÓN: Esto parece un Contrato de Arrendamiento. Prioriza la revisión de: Duración del contrato y prórrogas, renta y su actualización (IPC), fianza, obras permitidas y responsabilidades de mantenimiento.`
};
Object.assign(SPECIALIZED_PROMPTS, SPECIALIZED_PROMPTS_CONTENT);

function detectDocumentType_CONTENT(content) {
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
Object.assign(detectDocumentType, detectDocumentType_CONTENT);