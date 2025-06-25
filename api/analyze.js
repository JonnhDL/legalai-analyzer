const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdf = require('pdf-parse');
const formidable = require('formidable');

// ... (Pega aquí el LEGAL_ANALYSIS_PROMPT y las otras 2 funciones, detectDocumentType y SPECIALIZED_PROMPTS)

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!process.env.GOOGLE_API_KEY) {
        return res.status(500).json({ error: 'API Key no configurada en el servidor.' });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const form = formidable();

    try {
        const { fields, files } = await new Promise((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) return reject(err);
                resolve({ fields, files });
            });
        });

        if (!files.document || !files.document[0]) {
            return res.status(400).json({ error: 'No se encontró ningún archivo en la petición.' });
        }

        const file = files.document[0];
        const userQuery = (fields.query && fields.query[0]) ? fields.query[0] : "";
        const dataBuffer = require('fs').readFileSync(file.filepath);
        const data = await pdf(dataBuffer);
        const text = data.text;

        if (!text.trim()) return res.status(400).json({ error: "El documento está vacío." });

        const docType = detectDocumentType(text);
        let finalPrompt = LEGAL_ANALYSIS_PROMPT + (SPECIALIZED_PROMPTS[docType] || '');
        finalPrompt += `\n\n--- INICIO DEL DOCUMENTO ---\n${text}\n--- FIN DEL DOCUMENTO ---`;
        if (userQuery) {
            finalPrompt += `\n\n--- CONSULTA ADICIONAL DEL USUARIO ---\nResponde: "${userQuery}"`;
        }
        
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const analysisText = response.text();
        const analysisJson = JSON.parse(analysisText.replace(/```json/g, '').replace(/```/g, '').trim());
        
        return res.status(200).json(analysisJson);

    } catch (error) {
        console.error("ERROR EN LA FUNCIÓN:", error);
        return res.status(500).json({ error: 'Error interno del servidor al procesar el documento.' });
    }
};

// Pega aquí de nuevo el contenido de tus SPECIALIZED_PROMPTS y detectDocumentType
const LEGAL_ANALYSIS_PROMPT = `...`; // Tu prompt largo
const SPECIALIZED_PROMPTS = {
    CONTRACT_SERVICES: `...`,
    NDA: `...`,
    EMPLOYMENT: `...`,
    LEASE: `...`
};
function detectDocumentType(content) {
    // ...
}