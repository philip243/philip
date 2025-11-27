document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');
    const totalSavedDisplay = document.getElementById('total-saved');
    const downloadAllBtn = document.getElementById('download-all-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const fileListHeader = document.getElementById('file-list-header');

    let currentBatchId = null;
    let totalFiles = 0;
    let processedFiles = 0;
    let totalSavedKB = 0;
    let fileData = []; // Store file data for tracking

    // Quality slider
    qualitySlider.addEventListener('input', (e) => {
        qualityValue.textContent = e.target.value;
    });

    qualitySlider.addEventListener('change', (e) => {
        const quality = e.target.value;
        const format = document.querySelector('input[name="format"]:checked').value;

        // Recompress all files
        const fileItems = document.querySelectorAll('.file-item');
        fileItems.forEach((item, index) => {
            const batchId = item.dataset.batchId;
            const originalName = item.dataset.originalName;

            if (batchId && originalName) {
                recompressFile(batchId, originalName, quality, format, index);
            }
        });
    });

    // Drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', function () {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;

        // Reset state
        currentBatchId = crypto.randomUUID();
        totalFiles = files.length;
        processedFiles = 0;
        totalSavedKB = 0;
        fileData = [];
        fileList.innerHTML = '';
        downloadAllBtn.style.display = 'none';
        fileListHeader.style.display = 'flex';

        updateProgress();

        // Get settings
        const quality = qualitySlider.value;
        const format = document.querySelector('input[name="format"]:checked').value;

        // Process each file
        Array.from(files).forEach((file, index) => {
            addFileToList(file, index);
            uploadFile(file, quality, format, currentBatchId, index);
        });
    }

    function addFileToList(file, index) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.id = `file-${index}`;
        fileItem.dataset.originalName = file.name; // Store original filename
        fileItem.dataset.batchId = currentBatchId; // Store batch ID

        fileItem.innerHTML = `
            <div class="file-icon">📄</div>
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size" id="size-${index}">
                    ${(file.size / 1024).toFixed(2)} KB
                </div>
            </div>
            <div class="file-status" id="status-${index}">
                <span class="processing-badge">⏳ 처리 중...</span>
            </div>
        `;

        fileList.appendChild(fileItem);
    }

    async function recompressFile(batchId, filename, quality, format, index) {
        try {
            // Show processing state
            document.getElementById(`status-${index}`).innerHTML = `
                <span class="processing-badge">⏳ 계산 중...</span>
            `;

            const formData = new FormData();
            formData.append('batch_id', batchId);
            formData.append('filename', filename);
            formData.append('quality', quality);
            formData.append('format', format);

            const response = await fetch('/recompress', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Recompression failed');
            const data = await response.json();

            updateFileItem(data, index);

        } catch (error) {
            console.error('Recompression error:', error);
            document.getElementById(`status-${index}`).innerHTML = `
                <span style="color: #ef4444;">❌ 오류</span>
            `;
        }
    }

    function updateFileItem(data, index) {
        const originalSize = data.original_size;
        const compressedSize = data.compressed_size;
        const reduction = ((1 - (compressedSize / originalSize)) * 100).toFixed(0);
        const savedKB = originalSize - compressedSize;

        // Update stored data
        const fileDataIndex = fileData.findIndex(f => f.index === index);
        if (fileDataIndex !== -1) {
            // Subtract old saved amount
            totalSavedKB -= fileData[fileDataIndex].savedKB;
            // Update with new saved amount
            fileData[fileDataIndex].savedKB = savedKB;
            totalSavedKB += savedKB;
        } else {
            // Should not happen for recompress, but safe fallback
            fileData.push({ index, savedKB });
            totalSavedKB += savedKB;
        }

        document.getElementById(`size-${index}`).innerHTML = `
            ${originalSize.toFixed(2)} KB <span class="arrow">→</span> ${compressedSize.toFixed(2)} KB
        `;

        // Get original filename from the file item element
        const fileItem = document.getElementById(`file-${index}`);
        const originalName = fileItem.dataset.originalName;

        // Get file extension from the compressed file
        const compressedExt = data.filename.split('.').pop();
        const originalBasename = originalName.substring(0, originalName.lastIndexOf('.'));
        const downloadFilename = originalBasename + '.' + compressedExt;

        document.getElementById(`status-${index}`).innerHTML = `
            <span class="reduction-badge">-${reduction}%</span>
            <a href="${data.download_url}" class="file-download-btn" download="${downloadFilename}">다운로드</a>
            <button class="file-delete-btn" onclick="deleteFile(${index}, ${savedKB})">🗑️</button>
        `;

        updateProgress();
    }

    async function uploadFile(file, quality, format, batchId, index) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('quality', quality);
            formData.append('format', format);
            formData.append('batch_id', batchId);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');
            const data = await response.json();

            // Initial add to fileData
            const originalSize = data.original_size;
            const compressedSize = data.compressed_size;
            const savedKB = originalSize - compressedSize;

            fileData.push({
                index: index,
                savedKB: savedKB
            });
            totalSavedKB += savedKB;

            updateFileItem(data, index);

            processedFiles++;
            updateProgress();

            // Show download all button when all files are processed
            if (processedFiles === totalFiles) {
                downloadAllBtn.style.display = 'block';
                downloadAllBtn.onclick = () => {
                    window.location.href = `/download-zip/${batchId}`;
                };
            }

        } catch (error) {
            console.error('Upload error:', error);
            document.getElementById(`status-${index}`).innerHTML = `
                <span style="color: #ef4444;">❌ 오류</span>
            `;
            processedFiles++;
            updateProgress();
        }
    }

    function updateProgress() {
        progressText.textContent = `${processedFiles} / ${totalFiles}`;
        const percentage = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;
        progressFill.style.width = `${percentage}%`;

        const savedMB = (totalSavedKB / 1024).toFixed(2);
        totalSavedDisplay.textContent = `${savedMB} MB`;
    }

    // Delete individual file
    window.deleteFile = function (index, savedKB) {
        const fileItem = document.getElementById(`file-${index}`);
        if (fileItem) {
            fileItem.remove();

            // Update totals
            totalSavedKB -= savedKB;

            // Remove from fileData
            fileData = fileData.filter(f => f.index !== index);

            // Update display
            const savedMB = (totalSavedKB / 1024).toFixed(2);
            totalSavedDisplay.textContent = `${savedMB} MB`;

            // Hide header if no files left
            if (fileList.children.length === 0) {
                fileListHeader.style.display = 'none';
                downloadAllBtn.style.display = 'none';
                processedFiles = 0;
                totalFiles = 0;
                updateProgress();
            }
        }
    };

    // Clear all files
    clearAllBtn.addEventListener('click', () => {
        fileList.innerHTML = '';
        fileData = [];
        totalSavedKB = 0;
        processedFiles = 0;
        totalFiles = 0;
        fileListHeader.style.display = 'none';
        downloadAllBtn.style.display = 'none';
        updateProgress();
        totalSavedDisplay.textContent = '0 MB';
    });
});
