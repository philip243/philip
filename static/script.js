document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const loadingState = document.getElementById('loading-state');
    const resultArea = document.getElementById('result-area');
    const errorMessage = document.getElementById('error-message');
    const resetBtn = document.getElementById('reset-btn');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const processingCount = document.getElementById('processing-count');
    const totalSavedDisplay = document.getElementById('total-saved');
    const processedTotalDisplay = document.getElementById('processed-total');
    const fileList = document.getElementById('file-list');

    // Quality slider update
    qualitySlider.addEventListener('input', (e) => {
        qualityValue.textContent = e.target.value;
    });

    // Drag and Drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        dropZone.classList.remove('dragover');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            processBatch(Array.from(files));
        }
    }

    async function processBatch(files) {
        // Reset UI
        errorMessage.style.display = 'none';
        dropZone.style.display = 'none';
        document.querySelector('.controls-area').style.display = 'none';
        loadingState.style.display = 'block';
        resultArea.style.display = 'none';
        fileList.innerHTML = '';
        document.getElementById('zip-download-container').style.display = 'none';

        let processedCount = 0;
        let totalSavedKB = 0;
        const totalFiles = files.length;
        const quality = qualitySlider.value;
        const batchId = crypto.randomUUID(); // Generate unique batch ID

        processingCount.textContent = `0/${totalFiles}`;

        // Get selected format
        const selectedFormat = document.querySelector('input[name="format"]:checked').value;

        for (const file of files) {
            try {
                const data = await uploadFile(file, quality, batchId, selectedFormat);
                processedCount++;
                processingCount.textContent = `${processedCount}/${totalFiles}`;

                // Calculate savings
                const original = parseFloat(data.original_size); // Assuming backend returns float now, wait, backend returns float but in JSON it was just number? Let's check app.py
                // app.py returns float directly now: 'original_size': original_size (float)
                const compressed = parseFloat(data.compressed_size);
                totalSavedKB += (original - compressed);

                addResultItem(data, file.name);
            } catch (error) {
                console.error("Error processing file:", file.name, error);
                // Optionally show error for specific file
            }
        }

        // Show results
        loadingState.style.display = 'none';
        resultArea.style.display = 'block';

        const savedMB = (totalSavedKB / 1024).toFixed(2);
        totalSavedDisplay.textContent = `${savedMB} MB`;
        processedTotalDisplay.textContent = `${processedCount}/${totalFiles}`;

        // Setup ZIP download
        const zipBtn = document.getElementById('zip-download-btn');
        zipBtn.href = `/download-zip/${batchId}`;
        document.getElementById('zip-download-container').style.display = 'block';
    }

    function uploadFile(file, quality, batchId, format) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('quality', quality);
            formData.append('batch_id', batchId);
            formData.append('format', format);

            fetch('/upload', {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    if (!response.ok) throw new Error('Upload failed');
                    return response.json();
                })
                .then(data => resolve(data))
                .catch(error => reject(error));
        });
    }

    function addResultItem(data, originalName) {
        const item = document.createElement('div');
        item.className = 'file-item';

        const originalSize = data.original_size.toFixed(2);
        const compressedSize = data.compressed_size.toFixed(2);
        const savings = ((1 - (data.compressed_size / data.original_size)) * 100).toFixed(0);

        item.innerHTML = `
            <div class="file-info">
                <div class="file-name" title="${originalName}">${originalName}</div>
                <div class="file-meta">${originalSize} KB → ${compressedSize} KB (-${savings}%)</div>
            </div>
            <a href="${data.download_url}" class="item-download-btn" download>Download</a>
        `;

        fileList.appendChild(item);
    }

    resetBtn.addEventListener('click', () => {
        resultArea.style.display = 'none';
        dropZone.style.display = 'block';
        document.querySelector('.controls-area').style.display = 'block';
        fileInput.value = '';
        errorMessage.style.display = 'none';
    });
});
