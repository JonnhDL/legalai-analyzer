document.addEventListener('DOMContentLoaded', () => {
    // ... (El código de la parte superior hasta la función analyzeBtn.addEventListener se mantiene igual que en la V3)
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const uploadContainer = document.getElementById('uploadContainer');
    const uploadArea = document.getElementById('uploadArea');
    const fileListContainer = document.getElementById('fileListContainer');
    const userQueryInput = document.getElementById('userQuery');
    const loading = document.getElementById('loading');
    const loadingStatus = document.getElementById('loadingStatus');
    const results = document.getElementById('results');

    let selectedFiles = [];

    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));
    uploadArea.addEventListener('dragover', (e) => e.preventDefault());
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        handleFileSelect(e.dataTransfer.files);
    });

    function handleFileSelect(files) {
        const newFiles = Array.from(files);
        selectedFiles.push(...newFiles);
        renderFileList();
    }

    function renderFileList() {
        fileListContainer.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `<span>📄 ${file.name}</span><button data-index="${index}">×</button>`;
            fileListContainer.appendChild(fileItem);
        });
        analyzeBtn.style.display = selectedFiles.length > 0 ? 'block' : 'none';
    }

    fileListContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const index = e.target.dataset.index;
            selectedFiles.splice(index, 1);
            renderFileList();
        }
    });

    analyzeBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
            alert("Por favor, selecciona al menos un archivo.");
            return;
        }

        uploadContainer.style.display = 'none';
        loading.style.display = 'block';
        results.style.display = 'block';
        results.innerHTML = '';
        
        const totalFiles = selectedFiles.length;

        for (let i = 0; i < totalFiles; i++) {
            const file = selectedFiles[i];
            loadingStatus.textContent = `Analizando archivo ${i + 1} de ${totalFiles}: ${file.name}`;
            
            const formData = new FormData();
            formData.append('document', file);
            formData.append('query', userQueryInput.value);

            try {
                const response = await fetch('http://localhost:3000/analyze-single', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Error en el archivo ${file.name}`);
                }

                const analysis = await response.json();
                displaySingleResult(file.name, analysis);

            } catch (error) {
                displayError(file.name, error.message);
            }
        }
        
        loading.style.display = 'none';
        const reloadButton = document.createElement('button');
        reloadButton.className = 'reload-btn';
        reloadButton.textContent = 'Analizar otros documentos';
        reloadButton.onclick = () => window.location.reload();
        results.appendChild(reloadButton);
    });
    // FIN DEL CÓDIGO QUE SE MANTIENE IGUAL


    // ===== INICIO DE LA SECCIÓN ACTUALIZADA =====
    function displaySingleResult(fileName, data) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'individual-result';

        // Función para formatear listas de objetos
        const formatObjectList = (items, keyTitle, keyDesc, keyExtra = '') => {
            if (!items || items.length === 0) return '<li>Ninguno identificado.</li>';
            return items.map(item => `<li><strong>${item[keyTitle] || ''}:</strong> ${item[keyDesc] || ''} <em>${item[keyExtra] || ''}</em></li>`).join('');
        };
        
        const consultaHtml = (data.respuestaConsulta && data.respuestaConsulta !== "N/A")
            ? `<div><h4>❓ Respuesta a tu Consulta</h4><p>${data.respuestaConsulta}</p></div>`
            : '';

        resultDiv.innerHTML = `
            <h4>${fileName}</h4>
            <div class="result-content">
                <div><h4>📋 Resumen Ejecutivo</h4><p>${data.resumenEjecutivo || 'No disponible.'}</p></div>
                ${consultaHtml}
                <div><h4>🔴 Riesgos Críticos</h4><ul>${formatObjectList(data.riesgosCriticos, 'titulo', 'descripcion', 'ubicacion')}</ul></div>
                <div><h4>🟡 Riesgos Medios</h4><ul>${formatObjectList(data.riesgosMedios, 'titulo', 'descripcion')}</ul></div>
                <div><h4>✅ Aspectos Positivos</h4><ul>${formatObjectList(data.aspectosPositivos, 'fortaleza', 'porque')}</ul></div>
                <div><h4>🎯 Recomendaciones</h4><ol>${formatObjectList(data.recomendacionesEspecificas, 'accion', 'explicacion')}</ol></div>
                <div><h4>📍 Próximos Pasos</h4><ol>${formatList(data.proximosPasos)}</ol></div>
            </div>
        `;
        results.appendChild(resultDiv);
    }
    
    function displayError(fileName, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'individual-result';
        errorDiv.style.borderLeftColor = '#e74c3c';
        errorDiv.innerHTML = `<h4>Error en ${fileName}</h4><p>${message}</p>`;
        results.appendChild(errorDiv);
    }

    // Función para formatear listas de strings simples (usada para Próximos Pasos)
    function formatList(items) {
        if (!items || items.length === 0) return '<li>No disponible.</li>';
        return items.map(item => `<li>${item}</li>`).join('');
    }
    // ===== FIN DE LA SECCIÓN ACTUALIZADA =====
});