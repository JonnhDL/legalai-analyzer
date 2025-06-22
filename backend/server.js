require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

if (!process.env.GOOGLE_API_KEY) {
    throw new Error("La variable GOOGLE_API_KEY no está definida en el archivo .env");
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// =================================================================================
// INICIO DE LA SECCIÓN DE PROMPTS AVANZADOS (CORREGIDO)
// =================================================================================

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
    const contentLower = content.toLowerCase().substring(0, 3000); // Analizar solo el inicio para eficiencia
    const keywords = {
        CONTRACT_SERVICES: ['servicios', 'prestación de servicios', 'desarrollo', 'consultoría', 'sla', 'alcance del trabajo'],
        NDA: ['confidencialidad', 'secreto comercial', 'información confidencial', 'no divulgación', 'nda'],
        EMPLOYMENT: ['trabajador', 'empleado', 'salario', 'jornada laboral', 'contrato de trabajo'],
        LEASE: ['arrendamiento', 'arrendador', 'arrendatario', 'alquiler', 'inmueble', 'local comercial']
    };
    for (const [type, keywordList] of Object.entries(keywords)) {
        for (const keyword of keywordList) {
            if (contentLower.includes(keyword)) {
                return type;
            }
        }
    }
    return 'GENERAL';
}

// =================================================================================
// FIN DE LA SECCIÓN DE PROMPTS
// =================================================================================

app.post('/analyze-single', upload.single('document'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No se subió archivo." });
    
    const userQuery = req.body.query || "";
    console.log(`Procesando: ${req.file.originalname}`);

    try {
        let text = '';
        if (req.file.mimetype === 'application/pdf') {
            text = (await pdf(req.file.buffer)).text;
        } else if (req.file.mimetype === 'text/plain') {
            text = req.file.buffer.toString('utf8');
        } else {
            return res.status(400).json({ error: "Formato de archivo no soportado." });
        }

        if (!text.trim()) return res.status(400).json({ error: "Documento vacío." });

        // 1. Detectar el tipo de documento
        const docType = detectDocumentType(text);
        console.log(`Tipo de documento detectado: ${docType}`);
        
        // 2. Construir el prompt final
        let finalPrompt = LEGAL_ANALYSIS_PROMPT;
        finalPrompt += SPECIALIZED_PROMPTS[docType] || ''; // Añadir contexto especializado si existe
        finalPrompt += "\n\n--- INICIO DEL DOCUMENTO ---\n" + text + "\n--- FIN DEL DOCUMENTO ---";
        if (userQuery) {
            finalPrompt += `\n\n--- CONSULTA ADICIONAL DEL USUARIO ---\nConsiderando el documento, responde a esta pregunta específica: "${userQuery}"`;
        }
        
        // 3. Enviar a la IA y obtener respuesta
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const analysisText = response.text();
        
        const cleanedText = analysisText.replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisJson = JSON.parse(cleanedText);
        res.json(analysisJson);

    } catch (error) {
        console.error(`Error procesando ${req.file.originalname}:`, error);
        res.status(500).json({ error: "Error al comunicarse con la IA o procesar el documento." });
    }
});

app.listen(port, () => {
    console.log(`✅ Servidor V4.1 (Experto Legal Corregido) funcionando en http://localhost:${port}`);
});