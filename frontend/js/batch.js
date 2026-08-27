/**
 * Premiere Properties Subtitle Studio - Bulk / Batch Captioning Engine (v8.2.0)
 * Multi-Video & SRT Pairing Matrix, Auto-Matching, Individual Fine-Tuning & Sequential Batch Render Engine
 */

const batchState = {
    items: [], // Array of batch video objects
    availableSrts: [], // Array of loaded SRT file descriptors { name, content, path }
    activeEditingItemId: null,
    isRendering: false,
    currentRenderIndex: 0,
    renderQueue: [],
    customOutputDir: "",
    exportMp4: true,
    exportSrt: true,
    exportXml: true
};

// ==========================================
// 🚀 INITIALIZATION & EVENT BINDINGS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initBatchStudioEvents();
});

function initBatchStudioEvents() {
    // Mode Switcher Buttons
    const btnModeSingle = document.getElementById('btnModeSingle');
    const btnModeBulk = document.getElementById('btnModeBulk');

    if (btnModeSingle) {
        btnModeSingle.addEventListener('click', () => switchStudioMode('single'));
    }
    if (btnModeBulk) {
        btnModeBulk.addEventListener('click', () => switchStudioMode('bulk'));
    }

    // Batch Action Bar Buttons
    const btnBatchAddVideos = document.getElementById('btnBatchAddVideos');
    const batchVideoFileInput = document.getElementById('batchVideoFileInput');
    const btnBatchAddSrts = document.getElementById('btnBatchAddSrts');
    const batchSrtFileInput = document.getElementById('batchSrtFileInput');
    const btnBatchScanFolder = document.getElementById('btnBatchScanFolder');
    const btnBatchAutoMatch = document.getElementById('btnBatchAutoMatch');
    const btnBatchClear = document.getElementById('btnBatchClear');
    const btnBatchStartRender = document.getElementById('btnBatchStartRender');

    if (btnBatchAddVideos && batchVideoFileInput) {
        btnBatchAddVideos.addEventListener('click', () => batchVideoFileInput.click());
        batchVideoFileInput.addEventListener('change', handleBatchVideoFilesSelect);
    }

    if (btnBatchAddSrts && batchSrtFileInput) {
        btnBatchAddSrts.addEventListener('click', () => batchSrtFileInput.click());
        batchSrtFileInput.addEventListener('change', handleBatchSrtFilesSelect);
    }

    if (btnBatchScanFolder) {
        btnBatchScanFolder.addEventListener('click', openBatchFolderScanner);
    }

    if (btnBatchAutoMatch) {
        btnBatchAutoMatch.addEventListener('click', autoMatchAllBatchItems);
    }

    if (btnBatchClear) {
        btnBatchClear.addEventListener('click', clearBatchQueue);
    }

    if (btnBatchStartRender) {
        btnBatchStartRender.addEventListener('click', promptAndStartBatchRender);
    }

    // Quick Path Input Add
    const btnBatchAddPath = document.getElementById('btnBatchAddPath');
    const batchPathInput = document.getElementById('batchPathInput');
    if (btnBatchAddPath && batchPathInput) {
        btnBatchAddPath.addEventListener('click', () => {
            const val = batchPathInput.value.trim();
            if (val) {
                handleBatchPathAdd(val);
                batchPathInput.value = '';
            }
        });
        batchPathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = batchPathInput.value.trim();
                if (val) {
                    handleBatchPathAdd(val);
                    batchPathInput.value = '';
                }
            }
        });
    }

    // Return from Individual Edit Banner Buttons
    const btnSaveReturnBatch = document.getElementById('btnSaveReturnBatch');
    const btnDiscardReturnBatch = document.getElementById('btnDiscardReturnBatch');

    if (btnSaveReturnBatch) {
        btnSaveReturnBatch.addEventListener('click', saveAndReturnToBatch);
    }
    if (btnDiscardReturnBatch) {
        btnDiscardReturnBatch.addEventListener('click', discardAndReturnToBatch);
    }

    // Batch Drag and Drop Zone
    setupBatchDragAndDrop();
}

// ==========================================
// 🔄 STUDIO MODE SWITCHER (SINGLE <-> BULK)
// ==========================================
function switchStudioMode(mode) {
    const btnSingle = document.getElementById('btnModeSingle');
    const btnBulk = document.getElementById('btnModeBulk');
    const singleCaptions = document.getElementById('singleCaptionsPanel');
    const singlePreview = document.getElementById('singlePreviewPanel');
    const bulkPanel = document.getElementById('bulkStudioPanel');
    const mainWorkspace = document.getElementById('mainWorkspace');
    const bulkGlobalNotice = document.getElementById('bulkGlobalNotice');

    if (mode === 'bulk') {
        if (btnSingle) btnSingle.classList.remove('active');
        if (btnBulk) btnBulk.classList.add('active');

        if (singleCaptions) singleCaptions.style.display = 'none';
        if (singlePreview) singlePreview.style.display = 'none';
        if (bulkPanel) bulkPanel.style.display = 'flex';

        if (mainWorkspace) {
            mainWorkspace.classList.remove('single-mode-active');
            mainWorkspace.classList.add('bulk-mode-active');
        }

        if (bulkGlobalNotice) bulkGlobalNotice.style.display = 'flex';
        renderBatchTable();
        logExec("Switched to ⚡ Bulk / Batch Subtitle Studio Mode", "info");
    } else {
        if (btnSingle) btnSingle.classList.add('active');
        if (btnBulk) btnBulk.classList.remove('active');

        if (singleCaptions) singleCaptions.style.display = 'flex';
        if (singlePreview) singlePreview.style.display = 'flex';
        if (bulkPanel) bulkPanel.style.display = 'none';

        if (mainWorkspace) {
            mainWorkspace.classList.remove('bulk-mode-active');
            mainWorkspace.classList.add('single-mode-active');
        }

        if (bulkGlobalNotice) bulkGlobalNotice.style.display = 'none';
        logExec("Switched to 🎬 Single Video Subtitle Editor", "info");
    }
}

// ==========================================
// 📂 BATCH VIDEO & SRT INGESTION
// ==========================================
async function handleBatchPathAdd(inputPath) {
    logExec(`Inspecting path for batch addition: ${inputPath}...`, "info");
    // Check if path is a directory or a file
    try {
        const scanRes = await fetch('/api/batch_scan_pairs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: inputPath })
        });

        if (scanRes.ok) {
            const data = await scanRes.json();
            if (data.pairs && data.pairs.length > 0) {
                importScannedPairs(data);
                return;
            }
        }
    } catch (e) {}

    // Fallback: Check as single video file
    try {
        const res = await fetch('/api/check_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: inputPath })
        });
        const data = await res.json();
        if (data.valid) {
            addSingleVideoToBatch({
                videoPath: data.path,
                videoName: data.filename,
                sizeMb: data.size_mb,
                duration: data.duration,
                width: data.width,
                height: data.height,
                fps: data.fps
            });
            logExec(`Added video to batch: ${data.filename}`, "success");
            renderBatchTable();
            return;
        }
    } catch (e) {}

    // Fallback: Check as SRT file
    if (inputPath.toLowerCase().endsWith('.srt') || inputPath.toLowerCase().endsWith('.vtt')) {
        try {
            const res = await fetch('/api/parse_srt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ srt_path: inputPath })
            });
            const data = await res.json();
            if (data.captions && data.captions.length > 0) {
                const srtName = inputPath.split(/[/\\]/).pop();
                registerAvailableSrt(srtName, null, inputPath, data.captions);
                logExec(`Added SRT file: ${srtName} (${data.count} lines)`, "success");
                autoMatchAllBatchItems();
                return;
            }
        } catch (e) {}
    }

    logExec(`Could not resolve path as video or SRT: ${inputPath}`, "error");
}

async function handleBatchVideoFilesSelect(e) {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    for (let file of files) {
        const sizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(2));
        const item = {
            videoPath: file.name,
            videoName: file.name,
            fileObject: file,
            sizeMb: sizeMb,
            duration: 0,
            width: 1080,
            height: 1920,
            fps: 30
        };
        addSingleVideoToBatch(item);

        // Upload in background to sync server path
        const formData = new FormData();
        formData.append('file', file);
        fetch('/api/upload_media', { method: 'POST', body: formData })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const batchItem = batchState.items.find(i => i.videoName === file.name);
                    if (batchItem) batchItem.videoPath = data.saved_path;
                }
            }).catch(() => {});
    }

    logExec(`Added ${files.length} video files to batch queue.`, "success");
    e.target.value = '';
    renderBatchTable();
    autoMatchAllBatchItems();
}

function handleBatchSrtFilesSelect(e) {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    let loadedCount = 0;
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            const captions = parseClientSrtString(content);
            registerAvailableSrt(file.name, content, null, captions);
            loadedCount++;
            if (loadedCount === files.length) {
                logExec(`Loaded ${files.length} .SRT files. Auto-matching with batch videos...`, "success");
                autoMatchAllBatchItems();
            }
        };
        reader.readAsText(file);
    });

    e.target.value = '';
}

function registerAvailableSrt(name, content, path, captions) {
    // Check if already in availableSrts
    const existing = batchState.availableSrts.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
        existing.content = content || existing.content;
        existing.path = path || existing.path;
        existing.captions = captions || existing.captions;
    } else {
        batchState.availableSrts.push({
            name,
            content,
            path,
            captions: captions || []
        });
    }
}

function addSingleVideoToBatch(videoData) {
    const existing = batchState.items.find(i => i.videoName.toLowerCase() === videoData.videoName.toLowerCase());
    if (existing) return;

    const newItem = {
        id: `batch_item_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        videoPath: videoData.videoPath,
        videoName: videoData.videoName,
        fileObject: videoData.fileObject || null,
        sizeMb: videoData.sizeMb || 0,
        duration: videoData.duration || 0,
        width: videoData.width || 1080,
        height: videoData.height || 1920,
        fps: videoData.fps || 30,
        srtName: null,
        srtPath: null,
        srtContent: null,
        captions: [],
        status: 'missing_srt',
        progress: 0,
        error: null,
        exportFilename: videoData.videoName // Preserve exact original video filename
    };

    batchState.items.push(newItem);
}

function importScannedPairs(data) {
    if (!data.pairs) return;

    let addedCount = 0;
    data.pairs.forEach(p => {
        let caps = [];
        let status = 'missing_srt';

        if (p.srt_path) {
            status = 'ready';
            registerAvailableSrt(p.srt_name, null, p.srt_path, []);
        }

        const item = {
            id: p.id || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            videoPath: p.video_path,
            videoName: p.video_name,
            sizeMb: p.size_mb,
            duration: p.duration,
            width: p.width,
            height: p.height,
            fps: p.fps,
            srtName: p.srt_name,
            srtPath: p.srt_path,
            srtContent: null,
            captions: caps,
            status: status,
            progress: 0,
            error: null,
            exportFilename: p.video_name
        };

        const existingIdx = batchState.items.findIndex(i => i.videoName.toLowerCase() === p.video_name.toLowerCase());
        if (existingIdx >= 0) {
            batchState.items[existingIdx] = item;
        } else {
            batchState.items.push(item);
            addedCount++;
        }
    });

    if (data.available_srts) {
        data.available_srts.forEach(s => {
            registerAvailableSrt(s.name, null, s.path, []);
        });
    }

    logExec(`Folder Scan: Imported ${data.total_videos} videos (${addedCount} new) and paired matching .SRTs.`, "success");
    renderBatchTable();
}

function openBatchFolderScanner() {
    if (typeof openFolderBrowserModal === 'function') {
        openFolderBrowserModal((selectedPath, isDirectory) => {
            if (selectedPath) {
                handleBatchPathAdd(selectedPath);
            }
        });
    } else {
        const path = prompt("Enter directory path containing videos and .srt files:", "/content");
        if (path) handleBatchPathAdd(path);
    }
}

// ==========================================
// 🔗 AUTO-MATCHING SRT ALGORITHM
// ==========================================
function getCleanStem(filename) {
    if (!filename) return "";
    return filename
        .replace(/\.[^/.]+$/, "") // Remove extension
        .replace(/[_\-.](srt|mp4|mov|mkv|avi|webm|en|hi|es|fr|audio|video|sub|subs|caption|captions)$/i, "")
        .replace(/[_\-\s]+/g, "")
        .toLowerCase();
}

function autoMatchAllBatchItems() {
    let matchedCount = 0;

    batchState.items.forEach(item => {
        if (item.status === 'ready' && item.srtName) return; // Already paired

        const vStem = getCleanStem(item.videoName);
        let bestMatchSrt = null;

        // Pass 1: Exact stem match
        for (const srt of batchState.availableSrts) {
            const sStem = getCleanStem(srt.name);
            if (vStem === sStem) {
                bestMatchSrt = srt;
                break;
            }
        }

        // Pass 2: Fuzzy prefix/contain match
        if (!bestMatchSrt) {
            for (const srt of batchState.availableSrts) {
                const sStem = getCleanStem(srt.name);
                if (vStem.includes(sStem) || sStem.includes(vStem)) {
                    bestMatchSrt = srt;
                    break;
                }
            }
        }

        if (bestMatchSrt) {
            pairItemWithSrt(item.id, bestMatchSrt);
            matchedCount++;
        }
    });

    logExec(`Auto-match complete: Paired ${matchedCount} videos with matching .SRT files.`, "success");
    renderBatchTable();
}

async function pairItemWithSrt(itemId, srtObj) {
    const item = batchState.items.find(i => i.id === itemId);
    if (!item) return;

    item.srtName = srtObj.name;
    item.srtPath = srtObj.path || null;
    item.srtContent = srtObj.content || null;

    if (srtObj.captions && srtObj.captions.length > 0) {
        item.captions = JSON.parse(JSON.stringify(srtObj.captions));
        item.status = 'ready';
    } else if (srtObj.content) {
        item.captions = parseClientSrtString(srtObj.content);
        item.status = 'ready';
    } else if (srtObj.path) {
        // Fetch parsed from backend
        try {
            const res = await fetch('/api/parse_srt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ srt_path: srtObj.path })
            });
            const data = await res.json();
            item.captions = data.captions || [];
            item.status = 'ready';
        } catch (e) {
            item.status = 'ready';
        }
    } else {
        item.status = 'ready';
    }

    renderBatchTable();
}

function unpairBatchItem(itemId) {
    const item = batchState.items.find(i => i.id === itemId);
    if (!item) return;

    item.srtName = null;
    item.srtPath = null;
    item.srtContent = null;
    item.captions = [];
    item.status = 'missing_srt';

    renderBatchTable();
    logExec(`Unpaired subtitles from: ${item.videoName}`, "info");
}

function removeBatchItem(itemId) {
    batchState.items = batchState.items.filter(i => i.id !== itemId);
    renderBatchTable();
    logExec("Removed item from batch queue.", "info");
}

function clearBatchQueue() {
    if (batchState.items.length === 0) return;
    if (confirm("Are you sure you want to clear all videos from the batch queue?")) {
        batchState.items = [];
        batchState.availableSrts = [];
        renderBatchTable();
        logExec("Cleared batch queue.", "info");
    }
}

// ==========================================
// 🎨 BATCH TABLE UI RENDERER
// ==========================================
function renderBatchTable() {
    const tbody = document.getElementById('batchTableBody');
    const emptyState = document.getElementById('batchEmptyState');
    const countBadge = document.getElementById('batchCountBadge');
    const statsSummary = document.getElementById('batchStatsSummary');
    const btnStart = document.getElementById('btnBatchStartRender');

    if (!tbody) return;

    if (countBadge) countBadge.textContent = batchState.items.length;

    if (batchState.items.length === 0) {
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'flex';
        if (statsSummary) statsSummary.textContent = '0 Videos in Batch Queue';
        if (btnStart) btnStart.disabled = true;
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    let readyCount = 0;
    let totalDurSecs = 0;

    let html = '';
    batchState.items.forEach((item, index) => {
        const isReady = item.status === 'ready' || (item.captions && item.captions.length > 0) || item.srtName;
        if (isReady && item.status !== 'failed') readyCount++;
        totalDurSecs += (item.duration || 0);

        const durStr = item.duration > 0 ? formatPlayerTime(item.duration) : '--:--';
        const sizeStr = item.sizeMb > 0 ? `${item.sizeMb} MB` : '--';

        // Status badge class and text
        let statusBadge = `<span class="batch-status-pill pill-missing">Missing SRT</span>`;
        if (item.status === 'rendering') {
            statusBadge = `<span class="batch-status-pill pill-rendering"><span class="pulse-dot-sm"></span> ${item.progress || 0}%</span>`;
        } else if (item.status === 'completed') {
            statusBadge = `<span class="batch-status-pill pill-completed"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Done</span>`;
        } else if (item.status === 'failed') {
            statusBadge = `<span class="batch-status-pill pill-failed" title="${escapeHtml(item.error || 'Render failed')}">Failed ✗</span>`;
        } else if (isReady) {
            statusBadge = `<span class="batch-status-pill pill-ready"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Ready</span>`;
        }

        // SRT Dropdown options
        let srtOptionsHtml = `<option value="" ${!item.srtName ? 'selected' : ''}>-- Select .SRT Subtitle --</option>`;
        batchState.availableSrts.forEach(s => {
            const isSel = item.srtName && item.srtName.toLowerCase() === s.name.toLowerCase();
            srtOptionsHtml += `<option value="${escapeHtml(s.name)}" ${isSel ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
        });

        // Subtitle text snippet
        let snippetText = '<span class="text-muted-xs">No subtitles attached</span>';
        if (item.captions && item.captions.length > 0) {
            const firstLine = item.captions[0].text || "";
            snippetText = `<span class="cap-snippet" title="${escapeHtml(firstLine)}"><span class="cap-count-badge">${item.captions.length} lines</span> "${escapeHtml(firstLine.substring(0, 32))}${firstLine.length > 32 ? '...' : ''}"</span>`;
        } else if (item.srtName) {
            snippetText = `<span class="cap-snippet"><span class="cap-count-badge">Attached</span> ${escapeHtml(item.srtName)}</span>`;
        }

        html += `
        <tr class="batch-row ${item.status === 'rendering' ? 'row-rendering' : ''} ${item.status === 'completed' ? 'row-done' : ''}" data-id="${item.id}">
            <td class="col-num">${index + 1}</td>
            <td class="col-video">
                <div class="video-meta-cell">
                    <div class="video-icon-box">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="15" x="2" y="4" rx="2"/><polyline points="10 9 15 12 10 15"/></svg>
                    </div>
                    <div class="video-details-info">
                        <span class="video-filename-main" title="${escapeHtml(item.videoName)}">${escapeHtml(item.videoName)}</span>
                        <div class="video-specs-line">
                            <span>${durStr}</span> • <span>${sizeStr}</span>
                            ${item.width ? `<span class="res-tag">${item.width}x${item.height}</span>` : ''}
                        </div>
                    </div>
                </div>
            </td>
            <td class="col-srt">
                <div class="srt-select-cell">
                    <select class="batch-srt-select pp-input-sm" onchange="handleSrtDropdownChange('${item.id}', this.value)">
                        ${srtOptionsHtml}
                    </select>
                    <label class="btn-xs btn-pick-srt" title="Upload or pick custom .SRT for this video">
                        <input type="file" accept=".srt,.vtt" style="display:none;" onchange="handleIndividualSrtUpload('${item.id}', event)">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                        Upload
                    </label>
                    ${item.srtName ? `<button class="btn-xs btn-unpair" onclick="unpairBatchItem('${item.id}')" title="Unpair SRT">✕</button>` : ''}
                </div>
            </td>
            <td class="col-preview">
                ${snippetText}
            </td>
            <td class="col-status">
                ${statusBadge}
            </td>
            <td class="col-actions">
                <div class="batch-row-actions">
                    <button class="btn-xs btn-edit-individual" onclick="editBatchItemInSingle('${item.id}')" title="Open and edit this video & subtitles individually in Single Studio">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        Edit
                    </button>
                    <button class="btn-xs btn-delete-row" onclick="removeBatchItem('${item.id}')" title="Remove from batch queue">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>
        `;
    });

    tbody.innerHTML = html;

    const totalDurFormatted = totalDurSecs > 0 ? formatPlayerTime(totalDurSecs) : '0:00';
    if (statsSummary) {
        statsSummary.innerHTML = `<strong>${readyCount} of ${batchState.items.length} Videos Ready</strong> • Total Est. Duration: ${totalDurFormatted} • Preserved Filenames`;
    }

    if (btnStart) {
        btnStart.disabled = readyCount === 0 || batchState.isRendering;
        btnStart.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Start Sequential Batch Render (${readyCount} Videos)
        `;
    }
}

function handleSrtDropdownChange(itemId, selectedSrtName) {
    if (!selectedSrtName) {
        unpairBatchItem(itemId);
        return;
    }
    const srt = batchState.availableSrts.find(s => s.name === selectedSrtName);
    if (srt) {
        pairItemWithSrt(itemId, srt);
    }
}

function handleIndividualSrtUpload(itemId, event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const captions = parseClientSrtString(content);
        const srtObj = {
            name: file.name,
            content: content,
            path: null,
            captions: captions
        };
        registerAvailableSrt(file.name, content, null, captions);
        pairItemWithSrt(itemId, srtObj);
        logExec(`Paired custom SRT: ${file.name} to video item.`, "success");
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ==========================================
// ✏️ INDIVIDUAL FINE-TUNING IN SINGLE STUDIO
// ==========================================
function editBatchItemInSingle(itemId) {
    const item = batchState.items.find(i => i.id === itemId);
    if (!item) return;

    batchState.activeEditingItemId = itemId;

    // Reset single studio video player spinner text to avoid misleading drive download banner
    const spinner = document.getElementById('videoLoadingSpinner');
    if (spinner) {
        const txt = spinner.querySelector('.spinner-text');
        if (txt) txt.textContent = "Optimizing video stream for playback...";
    }

    // Load video in Single Studio
    const video = document.getElementById('mainVideoPlayer');
    if (item.fileObject && video) {
        try {
            const blobUrl = URL.createObjectURL(item.fileObject);
            video.src = blobUrl;
            video.load();
            currentLoadedVideoPath = item.videoName;
            logExec(`Loaded uploaded video clip "${item.videoName}" into Single Studio.`, "success");
        } catch (e) {
            if (item.videoPath && typeof loadColabStream === 'function') {
                loadColabStream(item.videoPath);
            }
        }
    } else if (item.videoPath && typeof loadColabStream === 'function') {
        loadColabStream(item.videoPath);
    }

    // Load captions into global captionsData
    if (item.captions && item.captions.length > 0) {
        captionsData = JSON.parse(JSON.stringify(item.captions));
    } else {
        captionsData = [
            { id: "cap_1", start: 0.5, end: 3.5, text: "Sample subtitle line for this video." }
        ];
    }

    // Refresh Single Studio UI
    if (typeof renderCaptionsList === 'function') renderCaptionsList();
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    if (typeof applyStyling === 'function') applyStyling();

    // Show top floating banner
    const banner = document.getElementById('batchEditBanner');
    const bannerLabel = document.getElementById('batchEditBannerLabel');
    if (banner) banner.style.display = 'flex';
    if (bannerLabel) bannerLabel.textContent = `Fine-Tuning Video: "${item.videoName}"`;

    // Switch to Single Studio view
    switchStudioMode('single');
    logExec(`Opened "${item.videoName}" in Single Studio for individual fine-tuning.`, "info");
}

function saveAndReturnToBatch() {
    if (!batchState.activeEditingItemId) {
        switchStudioMode('bulk');
        return;
    }

    const item = batchState.items.find(i => i.id === batchState.activeEditingItemId);
    if (item) {
        item.captions = JSON.parse(JSON.stringify(captionsData));
        item.status = 'ready';
        if (!item.srtName) {
            item.srtName = `${item.videoName.replace(/\.[^/.]+$/, "")}.srt`;
        }
        logExec(`Saved adjusted subtitles for: ${item.videoName}`, "success");
    }

    const banner = document.getElementById('batchEditBanner');
    if (banner) banner.style.display = 'none';
    batchState.activeEditingItemId = null;

    switchStudioMode('bulk');
    renderBatchTable();
}

function discardAndReturnToBatch() {
    const banner = document.getElementById('batchEditBanner');
    if (banner) banner.style.display = 'none';
    batchState.activeEditingItemId = null;

    switchStudioMode('bulk');
    logExec("Returned to Bulk Studio without saving single adjustments.", "info");
}

// ==========================================
// 🚀 SEQUENTIAL 1-BY-1 BATCH RENDERING ENGINE
// ==========================================
async function promptAndStartBatchRender() {
    const readyItems = batchState.items.filter(i => (i.status === 'ready' || (i.captions && i.captions.length > 0) || i.srtName));
    if (readyItems.length === 0) {
        alert("Please pair at least one video with a .SRT subtitle file before starting batch export.");
        return;
    }

    // Get user target export folders (Local & Google Drive)
    const targetFolderInput = document.getElementById('batchCustomOutputDir');
    let targetFolder = targetFolderInput ? targetFolderInput.value.trim() : '';

    const driveFolderInput = document.getElementById('batchDriveExportDir');
    let driveFolder = driveFolderInput ? driveFolderInput.value.trim() : '';

    const exportMp4 = document.getElementById('batchExportMp4') ? document.getElementById('batchExportMp4').checked : true;
    const exportSrt = document.getElementById('batchExportSrt') ? document.getElementById('batchExportSrt').checked : true;
    const exportXml = document.getElementById('batchExportXml') ? document.getElementById('batchExportXml').checked : true;

    batchState.customOutputDir = targetFolder;
    batchState.googleDriveExportPath = driveFolder;
    batchState.exportMp4 = exportMp4;
    batchState.exportSrt = exportSrt;
    batchState.exportXml = exportXml;
    batchState.renderQueue = readyItems;
    batchState.currentRenderIndex = 0;
    batchState.isRendering = true;

    // Reset status for queued items
    batchState.renderQueue.forEach(item => {
        item.status = 'queued';
        item.progress = 0;
        item.error = null;
    });

    renderBatchTable();
    showBatchRenderModal(true);
    executeNextBatchRenderJob();
}

async function executeNextBatchRenderJob() {
    if (batchState.currentRenderIndex >= batchState.renderQueue.length) {
        // Complete!
        batchState.isRendering = false;
        renderBatchTable();
        handleBatchRenderCompleted();
        return;
    }

    const currentItem = batchState.renderQueue[batchState.currentRenderIndex];
    const itemIndex = batchState.currentRenderIndex + 1;
    const totalCount = batchState.renderQueue.length;

    currentItem.status = 'rendering';
    currentItem.progress = 0;
    renderBatchTable();

    updateBatchModalHero(itemIndex, totalCount, currentItem);

    // Prepare payload
    let itemCaps = currentItem.captions;
    if ((!itemCaps || itemCaps.length === 0) && currentItem.srtPath) {
        try {
            const res = await fetch('/api/parse_srt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ srt_path: currentItem.srtPath })
            });
            const data = await res.json();
            itemCaps = data.captions || [];
        } catch (e) {}
    }

    if (!itemCaps || itemCaps.length === 0) {
        itemCaps = [
            { id: "cap_1", start: 0.5, end: 3.5, text: "Automated Subtitle Sequence" }
        ];
    }

    // If item was added via local file dialog or drag/drop and hasn't finished uploading to server, upload now
    if (currentItem.fileObject && (!currentItem.videoPath.includes('/') && !currentItem.videoPath.includes('\\'))) {
        logExec(`[Batch ${itemIndex}/${totalCount}] Uploading "${currentItem.videoName}" to studio server before rendering...`, "info");
        const formData = new FormData();
        formData.append('file', currentItem.fileObject);
        try {
            const uRes = await fetch('/api/upload_media', { method: 'POST', body: formData });
            const uData = await uRes.json();
            if (uRes.ok && uData.success) {
                currentItem.videoPath = uData.saved_path;
            }
        } catch (upErr) {
            logExec(`Upload failed: ${upErr.message}`, "error");
        }
    }

    const payload = {
        video_path: currentItem.videoPath,
        captions: itemCaps,
        style: styleState, // Global Shared Premiere Properties Style!
        custom_output_dir: batchState.customOutputDir || null,
        google_drive_export_path: batchState.googleDriveExportPath || null,
        export_filename: currentItem.videoName, // Strictly preserve original video filename!
        export_mp4: batchState.exportMp4,
        export_srt: batchState.exportSrt,
        export_xml: batchState.exportXml
    };

    logExec(`[Batch ${itemIndex}/${totalCount}] Starting render for: ${currentItem.videoName}...`, "info");

    try {
        const res = await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        let renderRes = {};
        const text = await res.text();
        try {
            renderRes = JSON.parse(text);
        } catch (e) {
            renderRes = { detail: text || `HTTP ${res.status}: ${res.statusText}` };
        }

        if (!res.ok) {
            throw new Error(renderRes.detail || `Server error: ${res.status}`);
        }

        const jobId = renderRes.job_id;

        // Poll progress for this specific job ID
        pollBatchItemProgress(currentItem, itemIndex, totalCount, jobId);
    } catch (err) {
        logExec(`[Batch ${itemIndex}/${totalCount}] Failed: ${err.message}`, "error");
        currentItem.status = 'failed';
        currentItem.error = err.message;
        batchState.currentRenderIndex++;
        renderBatchTable();
        // Continue to next item in queue
        setTimeout(executeNextBatchRenderJob, 1000);
    }
}

function pollBatchItemProgress(currentItem, itemIndex, totalCount, jobId) {
    let pollCount = 0;
    const pollInterval = setInterval(async () => {
        pollCount++;
        try {
            const queryUrl = jobId ? `/api/render_progress?job_id=${encodeURIComponent(jobId)}` : '/api/render_progress';
            const res = await fetch(queryUrl);
            if (!res.ok) return;
            const data = await res.json();

            // Ignore progress reports from stale/other jobs
            if (jobId && data.job_id && data.job_id !== jobId) {
                return;
            }

            const pctVal = Math.min(100, Math.max(0, parseFloat(data.percent || 0)));
            currentItem.progress = Math.round(pctVal);

            // Update modal stats
            updateBatchModalStats(pctVal, data, itemIndex, totalCount, currentItem);

            // Update row progress in table
            const rowPill = document.querySelector(`tr[data-id="${currentItem.id}"] .batch-status-pill`);
            if (rowPill) {
                rowPill.className = 'batch-status-pill pill-rendering';
                rowPill.innerHTML = `<span class="pulse-dot-sm"></span> ${Math.round(pctVal)}%`;
            }

            if (pctVal >= 100 && (data.stage === 'Done' || data.stage === 'Export' || (data.status && data.status.includes('Completed')))) {
                clearInterval(pollInterval);
                currentItem.status = 'completed';
                currentItem.progress = 100;
                logExec(`[Batch ${itemIndex}/${totalCount}] Completed successfully: ${currentItem.videoName}`, "success");
                renderBatchTable();
                batchState.currentRenderIndex++;
                setTimeout(executeNextBatchRenderJob, 600);
            } else if (data.stage === 'Failed' || data.error) {
                clearInterval(pollInterval);
                currentItem.status = 'failed';
                currentItem.error = data.error || data.status;
                logExec(`[Batch ${itemIndex}/${totalCount}] Render error: ${currentItem.error}`, "error");
                renderBatchTable();
                batchState.currentRenderIndex++;
                setTimeout(executeNextBatchRenderJob, 1000);
            }
        } catch (e) {}
    }, 450);
}

function updateBatchModalHero(itemIndex, totalCount, currentItem) {
    const overallPct = Math.round(((itemIndex - 1) / totalCount) * 100);
    const overallFill = document.getElementById('batchOverallProgressFill');
    const overallText = document.getElementById('batchOverallProgressText');
    const currentVideoTitle = document.getElementById('batchCurrentVideoTitle');
    const queueBadge = document.getElementById('batchQueueBadge');
    const activeFileName = document.getElementById('batchActiveFileName');

    if (overallFill) overallFill.style.width = `${overallPct}%`;
    if (overallText) overallText.textContent = `${overallPct}% (Video ${itemIndex} of ${totalCount})`;
    if (currentVideoTitle) currentVideoTitle.textContent = currentItem.videoName;
    if (queueBadge) queueBadge.textContent = `PROCESSING ${itemIndex} OF ${totalCount}`;
    if (activeFileName) activeFileName.textContent = currentItem.videoName;

    // Reset stepper
    const step1 = document.getElementById('batchStepSubtitles');
    const step2 = document.getElementById('batchStepEncode');
    const step3 = document.getElementById('batchStepFinalize');
    if (step1) { step1.className = 'pipeline-step active'; }
    if (step2) { step2.className = 'pipeline-step'; }
    if (step3) { step3.className = 'pipeline-step'; }
}

function updateBatchModalStats(pctVal, data, itemIndex, totalCount, currentItem) {
    const overallPct = Math.min(100, Math.round((((itemIndex - 1) + (pctVal / 100.0)) / totalCount) * 100));
    const overallFill = document.getElementById('batchOverallProgressFill');
    const overallText = document.getElementById('batchOverallProgressText');
    const itemFill = document.getElementById('batchItemProgressFill');
    const itemPct = document.getElementById('batchItemProgressPct');
    const statusText = document.getElementById('batchStatusText');
    const speedText = document.getElementById('batchSpeedText');
    const etaText = document.getElementById('batchEtaText');
    const framesText = document.getElementById('batchFramesText');
    const activeFileName = document.getElementById('batchActiveFileName');

    if (overallFill) overallFill.style.width = `${overallPct}%`;
    if (overallText) overallText.textContent = `${overallPct}% (Video ${itemIndex} of ${totalCount})`;
    if (itemFill) itemFill.style.width = `${pctVal}%`;
    if (itemPct) itemPct.textContent = `${pctVal.toFixed(1)}%`;
    if (statusText && data.status) statusText.textContent = data.status;
    if (speedText && data.speed) speedText.textContent = data.speed;
    if (etaText && data.eta) etaText.textContent = data.eta;
    if (activeFileName) activeFileName.textContent = currentItem.videoName;
    if (framesText) {
        if (data.total_frames && data.total_frames > 0) {
            framesText.textContent = `${data.current_frame || 0} / ${data.total_frames}`;
        } else {
            framesText.textContent = `${data.current_frame || 0}`;
        }
    }

    // Dynamic Multi-Stage Stepper Sync
    const step1 = document.getElementById('batchStepSubtitles');
    const step2 = document.getElementById('batchStepEncode');
    const step3 = document.getElementById('batchStepFinalize');

    if (data.stage === 'Subtitle Engine' || data.stage === 'SRT Export') {
        if (step1) step1.className = 'pipeline-step active';
        if (step2) step2.className = 'pipeline-step';
        if (step3) step3.className = 'pipeline-step';
    } else if (data.stage === 'Sequence XML' || data.stage === 'Video Encode' || data.stage === 'Hardware Accelerated' || data.stage === 'Render' || (pctVal > 15 && pctVal < 90)) {
        if (step1) step1.className = 'pipeline-step done';
        if (step2) step2.className = 'pipeline-step active';
        if (step3) step3.className = 'pipeline-step';
    } else if (data.stage === 'Drive Sync' || data.stage === 'Export' || data.stage === 'Done' || pctVal >= 90) {
        if (step1) step1.className = 'pipeline-step done';
        if (step2) step2.className = 'pipeline-step done';
        if (step3) step3.className = 'pipeline-step active';
    }
}

function handleBatchRenderCompleted() {
    soundEngine.success();
    logExec("🎉 ALL BATCH RENDERS COMPLETED SUCCESSFULLY!", "success");

    const statusText = document.getElementById('batchStatusText');
    const queueBadge = document.getElementById('batchQueueBadge');
    const overallFill = document.getElementById('batchOverallProgressFill');
    const itemFill = document.getElementById('batchItemProgressFill');
    const btnDone = document.getElementById('btnBatchDoneClose');

    const step1 = document.getElementById('batchStepSubtitles');
    const step2 = document.getElementById('batchStepEncode');
    const step3 = document.getElementById('batchStepFinalize');
    if (step1) step1.className = 'pipeline-step done';
    if (step2) step2.className = 'pipeline-step done';
    if (step3) step3.className = 'pipeline-step done';

    if (statusText) statusText.textContent = `All ${batchState.renderQueue.length} batch videos exported successfully!`;
    if (queueBadge) {
        queueBadge.textContent = "COMPLETED";
        queueBadge.className = "pro-stage-pill stage-done";
    }
    if (overallFill) overallFill.style.width = "100%";
    if (itemFill) itemFill.style.width = "100%";
    if (btnDone) btnDone.style.display = 'inline-flex';
}

function showBatchRenderModal(show) {
    const modal = document.getElementById('batchRenderModal');
    const btnDone = document.getElementById('btnBatchDoneClose');
    if (!modal) return;

    if (show) {
        modal.style.display = 'flex';
        if (btnDone) btnDone.style.display = 'none';
        const queueBadge = document.getElementById('batchQueueBadge');
        if (queueBadge) {
            queueBadge.textContent = "BATCH QUEUE ACTIVE";
            queueBadge.className = "pro-stage-pill";
        }
    } else {
        modal.style.display = 'none';
    }
}

// ==========================================
// 📥 DRAG & DROP SUPPORT FOR BATCH
// ==========================================
function setupBatchDragAndDrop() {
    const dropzone = document.getElementById('batchDropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    dropzone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        if (!files || files.length === 0) return;

        const videoExts = ['.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.m4v'];
        const srtExts = ['.srt', '.vtt'];

        const videoFiles = files.filter(f => videoExts.some(ext => f.name.toLowerCase().endsWith(ext)));
        const srtFiles = files.filter(f => srtExts.some(ext => f.name.toLowerCase().endsWith(ext)));

        videoFiles.forEach(file => {
            const sizeMb = parseFloat((file.size / (1024 * 1024)).toFixed(2));
            addSingleVideoToBatch({
                videoPath: file.name,
                videoName: file.name,
                fileObject: file,
                sizeMb: sizeMb,
                duration: 0,
                width: 1080,
                height: 1920,
                fps: 30
            });
        });

        srtFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                const captions = parseClientSrtString(content);
                registerAvailableSrt(file.name, content, null, captions);
                autoMatchAllBatchItems();
            };
            reader.readAsText(file);
        });

        logExec(`Batch Drop: Added ${videoFiles.length} videos and ${srtFiles.length} .SRT files.`, "success");
        renderBatchTable();
        autoMatchAllBatchItems();
    });
}

// ==========================================
// 🛠️ CLIENT-SIDE UTILITIES
// ==========================================
function parseClientSrtString(srtText) {
    if (!srtText) return [];
    function parseTime(tStr) {
        const clean = tStr.trim().replace(',', '.');
        const parts = clean.split(':');
        if (parts.length === 3) {
            return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
            return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        return parseFloat(parts[0]) || 0;
    }

    const blocks = srtText.trim().replace(/\r\n/g, '\n').split(/\n\s*\n/);
    const captions = [];
    let idx = 1;

    blocks.forEach(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) return;

        let timeIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('-->')) {
                timeIdx = i;
                break;
            }
        }
        if (timeIdx === -1) return;

        const timeParts = lines[timeIdx].split('-->');
        if (timeParts.length !== 2) return;

        try {
            const startSec = parseTime(timeParts[0]);
            const endSec = parseTime(timeParts[1]);
            const textLines = lines.slice(timeIdx + 1);
            const text = textLines.join(' ');
            if (text) {
                captions.push({
                    id: `cap_${idx}`,
                    start: parseFloat(startSec.toFixed(2)),
                    end: parseFloat(endSec.toFixed(2)),
                    text: text
                });
                idx++;
            }
        } catch (e) {}
    });

    return captions;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
