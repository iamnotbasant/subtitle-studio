/**
 * Main Application Orchestrator, Hotkeys, Dynamic @font-face Injector & History Manager (v8.1.0)
 */

let currentLoadedVideoPath = "";
let renderPollInterval = null;
let isLoopingEnabled = false;

let cachedActiveCaptionText = null;
let liveOverlayRafPending = false;

function updateLiveSubtitleOverlay() {
    const video = document.getElementById('mainVideoPlayer');
    const overlay = document.getElementById('subtitleOverlay');
    const textBox = document.getElementById('subtitleTextBox');
    const activeSubInput = document.getElementById('activeSubTextInput');
    if (!video || !textBox || !overlay) return;

    const currTime = video.currentTime || 0;
    const activeCap = getActiveCaptionForTime(currTime);

    if (activeCap) {
        if (cachedActiveCaptionText !== activeCap.text) {
            textBox.innerText = activeCap.text;
            if (activeSubInput) activeSubInput.value = activeCap.text;
            cachedActiveCaptionText = activeCap.text;
        }
        if (overlay.style.display !== 'flex') {
            overlay.style.display = 'flex';
        }
        if (typeof setActiveCaption === 'function') {
            setActiveCaption(activeCap.id);
        }
    } else {
        if (overlay.style.display !== 'none') {
            overlay.style.display = 'none';
        }
        cachedActiveCaptionText = null;
        if (typeof setActiveCaption === 'function') {
            setActiveCaption(null);
        }
    }
}

function requestUpdateLiveSubtitleOverlay() {
    if (!liveOverlayRafPending) {
        liveOverlayRafPending = true;
        requestAnimationFrame(() => {
            updateLiveSubtitleOverlay();
            liveOverlayRafPending = false;
        });
    }
}

function updateViewportAspectRatio(mode) {
    const container = document.getElementById('videoContainer');
    const video = document.getElementById('mainVideoPlayer');
    if (!container) return;

    container.classList.remove('aspect-9-16', 'aspect-16-9', 'aspect-1-1');

    if (mode === '9:16') {
        container.classList.add('aspect-9-16');
    } else if (mode === '16:9') {
        container.classList.add('aspect-16-9');
    } else if (mode === '1:1') {
        container.classList.add('aspect-1-1');
    } else if (mode === 'auto') {
        if (video && video.videoWidth && video.videoHeight) {
            if (video.videoHeight > video.videoWidth) {
                container.classList.add('aspect-9-16');
            } else if (video.videoWidth > video.videoHeight) {
                container.classList.add('aspect-16-9');
            } else {
                container.classList.add('aspect-1-1');
            }
        }
    }

    if (typeof applyStyling === 'function') {
        setTimeout(applyStyling, 50);
    }
}

async function loadColabStream(videoPath) {
    if (!videoPath) {
        logExec("Please enter a valid video file path or URL.", "warn");
        return;
    }

    const spinner = document.getElementById('videoLoadingSpinner');
    if (spinner) spinner.style.display = 'flex';

    logExec(`Inspecting video path: ${videoPath}...`, "info");
    try {
        const checkRes = await fetch('/api/check_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: videoPath })
        });

        const data = await checkRes.json();
        if (!data.valid) {
            if (spinner) spinner.style.display = 'none';
            logExec(`Video check failed: ${data.error}`, "error");
            if (data.available_files && data.available_files.length > 0) {
                logExec(`Available files in dir: ${data.available_files.join(', ')}`, "info");
            }
            return;
        }

        currentLoadedVideoPath = data.path;
        logExec(`Loaded video: ${data.filename} (${data.size_mb} MB, ${data.duration}s, ${data.width}x${data.height} @ ${data.fps}fps)`, "success");

        const player = document.getElementById('mainVideoPlayer');
        player.src = `/api/stream?video_path=${encodeURIComponent(data.path)}`;
        player.load();
        
        player.oncanplay = () => {
            if (spinner) spinner.style.display = 'none';
        };

        player.onloadedmetadata = () => {
            const aspectSelect = document.getElementById('aspectRatioSelect');
            const mode = aspectSelect ? aspectSelect.value : 'auto';
            updateViewportAspectRatio(mode);

            if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
        };

    } catch (err) {
        if (spinner) spinner.style.display = 'none';
        logExec(`Failed to connect to backend API: ${err}`, "error");
    }
}

async function triggerGoogleDriveDownload() {
    const urlOrId = prompt("Enter Google Drive File Link or File ID:");
    if (!urlOrId) return;

    const spinner = document.getElementById('videoLoadingSpinner');
    if (spinner) spinner.style.display = 'flex';

    logExec(`Downloading video from Google Drive: ${urlOrId}...`, "info");
    try {
        const res = await fetch('/api/download_drive_link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url_or_id: urlOrId })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            logExec(`Downloaded Drive video successfully: ${data.filename}`, "success");
            const videoInput = document.getElementById('videoPathInput');
            if (videoInput) videoInput.value = data.saved_path;
            loadColabStream(data.saved_path);
        } else {
            if (spinner) spinner.style.display = 'none';
            logExec(`Drive download error: ${data.detail || 'Download failed'}`, "error");
        }
    } catch (err) {
        if (spinner) spinner.style.display = 'none';
        logExec(`Drive download error: ${err}`, "error");
    }
}

function openExportOptionsModal() {
    if (!currentLoadedVideoPath) {
        logExec("No video loaded! Please load a video before exporting.", "warn");
        alert("Please load a video file first!");
        return;
    }
    const modal = document.getElementById('exportOptionsModal');
    if (modal) modal.style.display = 'flex';
}

function closeExportOptionsModal() {
    const modal = document.getElementById('exportOptionsModal');
    if (modal) modal.style.display = 'none';
}

async function triggerExport() {
    closeExportOptionsModal();

    const customOutputDir = document.getElementById('customOutputDirInput')?.value.trim() || null;
    const driveExportPath = document.getElementById('driveExportPathInput')?.value.trim() || null;
    const exportMp4 = document.getElementById('exportMp4Check')?.checked ?? true;
    const exportSrt = document.getElementById('exportSrtCheck')?.checked ?? true;
    const exportXml = document.getElementById('exportXmlCheck')?.checked ?? true;

    if (!exportMp4 && !exportSrt && !exportXml) {
        alert("Please select at least one artifact to export!");
        return;
    }

    const payload = {
        video_path: currentLoadedVideoPath,
        captions: captionsData,
        style: styleState,
        custom_output_dir: customOutputDir,
        google_drive_export_path: driveExportPath,
        export_mp4: exportMp4,
        export_srt: exportSrt,
        export_xml: exportXml
    };

    logExec("Initiating Render export task...", "info");
    if (driveExportPath) logExec(`Target Google Drive Path: ${driveExportPath}`, "info");
    if (customOutputDir) logExec(`Target Output Dir: ${customOutputDir}`, "info");

    showRenderModal(true);

    try {
        const res = await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok) {
            logExec("Render job queued. Monitoring progress...", "success");
            startProgressPolling();
        } else {
            showRenderModal(false);
            logExec(`Render request rejected: ${data.detail}`, "error");
        }
    } catch (err) {
        showRenderModal(false);
        logExec(`Render request error: ${err}`, "error");
    }
}

function startProgressPolling() {
    if (renderPollInterval) clearInterval(renderPollInterval);

    renderPollInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/render_progress');
            const data = await res.json();

            const fill = document.getElementById('renderProgressFill');
            const statusText = document.getElementById('renderStatusText');
            const stageText = document.getElementById('renderStageText');
            const speedText = document.getElementById('renderSpeedText');

            if (fill) fill.style.width = `${data.percent}%`;
            if (statusText) statusText.textContent = data.status;
            if (stageText) stageText.textContent = data.stage;
            if (speedText) speedText.textContent = `Speed: ${data.speed}`;

            if (data.percent >= 100 || data.stage === 'Done') {
                clearInterval(renderPollInterval);
                logExec("Export Completed Successfully!", "success");
                setTimeout(() => {
                    showRenderModal(false);
                    openExportsGalleryModal();
                }, 1500);
            } else if (data.stage === 'Failed') {
                clearInterval(renderPollInterval);
                logExec(`Render Export Failed: ${data.error || data.status}`, "error");
                setTimeout(() => showRenderModal(false), 2000);
            }
        } catch (err) {
            console.error("Progress polling error:", err);
        }
    }, 800);
}

function showRenderModal(show) {
    const modal = document.getElementById('renderModal');
    if (modal) modal.style.display = show ? 'flex' : 'none';
}

/* RENDERED VIDEOS GALLERY MANAGER */
function openExportsGalleryModal() {
    const modal = document.getElementById('exportsGalleryModal');
    if (modal) {
        modal.style.display = 'flex';
        loadExportsGallery();
    }
}

function closeExportsGalleryModal() {
    const modal = document.getElementById('exportsGalleryModal');
    const player = document.getElementById('galleryVideoPlayer');
    if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
        player.oncanplay = null;
        player.onerror = null;
    }
    if (modal) modal.style.display = 'none';
}

async function loadExportsGallery() {
    const galleryList = document.getElementById('galleryList');
    if (!galleryList) return;

    galleryList.innerHTML = '<div class="console-line info">Loading rendered exports...</div>';
    try {
        const res = await fetch('/api/list_exports');
        const data = await res.json();

        if (!data.exports || data.exports.length === 0) {
            galleryList.innerHTML = '<div class="console-line warn">No rendered video exports found yet.</div>';
            return;
        }

        galleryList.innerHTML = '';
        data.exports.forEach(item => {
            const card = document.createElement('div');
            card.className = 'gallery-card';

            const artifactsText = [
                'MP4',
                item.srt_exists ? 'SRT' : null,
                item.xml_exists ? 'XML' : null
            ].filter(Boolean).join(' | ');

            card.innerHTML = `
                <div class="gallery-card-info">
                    <div class="gallery-card-title">${item.filename}</div>
                    <div class="gallery-card-sub">${item.size_mb} MB • ${item.duration}s • [${artifactsText}]</div>
                </div>
                <div class="gallery-card-actions">
                    <button class="btn-xs play-gallery-btn" data-filename="${item.filename}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Play in Dashboard
                    </button>
                    <a href="/api/exports/${encodeURIComponent(item.filename)}" download class="btn-xs">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        Download
                    </a>
                    <button class="btn-xs copy-path-btn" data-path="${item.path}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        Copy Path
                    </button>
                </div>
            `;

            const playBtn = card.querySelector('.play-gallery-btn');
            const copyBtn = card.querySelector('.copy-path-btn');

            playBtn.addEventListener('click', () => {
                const player = document.getElementById('galleryVideoPlayer');
                if (player) {
                    player.src = `/api/exports/${encodeURIComponent(item.filename)}`;
                    player.load();
                    player.oncanplay = () => {
                        player.play().catch(err => {
                            logExec(`Gallery playback error: ${err.message}`, "warn");
                        });
                    };
                    player.onerror = () => {
                        logExec(`Failed to load exported video: ${item.filename}`, "error");
                    };
                    logExec(`Loading rendered video in gallery player: ${item.filename}`, "info");
                }
            });

            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(item.path);
                logExec(`Copied file path to clipboard: ${item.path}`, "success");
            });

            galleryList.appendChild(card);
        });

    } catch (err) {
        galleryList.innerHTML = `<div class="console-line error">Failed to load exports: ${err}</div>`;
    }
}

function initHotkeys() {
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        const video = document.getElementById('mainVideoPlayer');

        // Ctrl + Z = Undo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (typeof undo === 'function') undo();
            return;
        }

        // Ctrl + Y or Ctrl + Shift + Z = Redo
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (typeof redo === 'function') redo();
            return;
        }

        // K or C = Cut / Split clip at playhead
        if (e.code === 'KeyK' || e.code === 'KeyC') {
            e.preventDefault();
            if (typeof splitCaptionAtPlayhead === 'function') splitCaptionAtPlayhead();
            return;
        }

        if (!video) return;

        if (e.code === 'Space') {
            e.preventDefault();
            if (video.paused) video.play(); else video.pause();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 1);
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 1);
        }
    });
}

function initOnScreenEditing() {
    const textBox = document.getElementById('subtitleTextBox');
    if (!textBox) return;

    textBox.addEventListener('dblclick', () => {
        textBox.contentEditable = "true";
        textBox.focus();
        logExec("On-screen subtitle text editing active.", "info");
    });

    textBox.addEventListener('blur', () => {
        textBox.contentEditable = "false";
        const video = document.getElementById('mainVideoPlayer');
        const activeCap = getActiveCaptionForTime(video ? video.currentTime : 0);
        if (activeCap) {
            if (typeof pushHistoryState === 'function') pushHistoryState();
            activeCap.text = textBox.innerText;
            const activeSubInput = document.getElementById('activeSubTextInput');
            if (activeSubInput) activeSubInput.value = textBox.innerText;
            renderCaptionsList();
            if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            logExec("Updated subtitle text via double-click live canvas.", "success");
        }
    });
}

function initAppListeners() {
    const btnLoadVideo = document.getElementById('btnLoadVideo');
    const videoInput = document.getElementById('videoPathInput');
    const btnDriveDownload = document.getElementById('btnDriveDownload');
    const btnExportRender = document.getElementById('btnExportRender');
    const btnCloseExportOptions = document.getElementById('btnCloseExportOptions');
    const btnConfirmExport = document.getElementById('btnConfirmExport');
    const btnOpenGallery = document.getElementById('btnOpenGallery');
    const btnCloseGallery = document.getElementById('btnCloseGallery');
    const btnImportSrt = document.getElementById('btnImportSrt');
    const srtFileInput = document.getElementById('srtFileInput');
    const btnAddCaption = document.getElementById('btnAddCaption');
    const btnAiCaptions = document.getElementById('btnAiCaptions');
    const btnDownloadSrt = document.getElementById('btnDownloadSrt');
    const btnDownloadVtt = document.getElementById('btnDownloadVtt');
    const btnDownloadTxt = document.getElementById('btnDownloadTxt');
    const searchInput = document.getElementById('captionSearchInput');
    const btnShiftMinus = document.getElementById('btnShiftMinus');
    const btnShiftPlus = document.getElementById('btnShiftPlus');
    const btnLoopToggle = document.getElementById('btnLoopToggle');
    const btnUploadFont = document.getElementById('btnUploadFont');
    const fontFileInput = document.getElementById('fontFileInput');
    const aspectSelect = document.getElementById('aspectRatioSelect');
    const video = document.getElementById('mainVideoPlayer');
    const btnPlayPause = document.getElementById('btnPlayPause');
    const btnStepBack = document.getElementById('btnStepBack');
    const btnStepForward = document.getElementById('btnStepForward');
    const volumeSlider = document.getElementById('volumeSlider');
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    const btnSplitPlayhead = document.getElementById('btnSplitPlayhead');

    if (btnUndo) btnUndo.addEventListener('click', undo);
    if (btnRedo) btnRedo.addEventListener('click', redo);
    if (btnSplitPlayhead) btnSplitPlayhead.addEventListener('click', splitCaptionAtPlayhead);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => setSearchQuery(e.target.value));
    }
    if (btnShiftMinus) {
        btnShiftMinus.addEventListener('click', () => shiftAllTimestamps(-0.5));
    }
    if (btnShiftPlus) {
        btnShiftPlus.addEventListener('click', () => shiftAllTimestamps(0.5));
    }

    if (btnLoopToggle && video) {
        btnLoopToggle.addEventListener('click', () => {
            isLoopingEnabled = !isLoopingEnabled;
            video.loop = isLoopingEnabled;
            btnLoopToggle.classList.toggle('active', isLoopingEnabled);
            logExec(`Loop playback: ${isLoopingEnabled ? 'ON' : 'OFF'}`, "info");
        });
    }

    if (btnAiCaptions) {
        btnAiCaptions.addEventListener('click', autoGenerateAiCaptions);
    }

    if (btnDownloadSrt) {
        btnDownloadSrt.addEventListener('click', () => downloadCaptionsFile('srt'));
    }
    if (btnDownloadVtt) {
        btnDownloadVtt.addEventListener('click', () => downloadCaptionsFile('vtt'));
    }
    if (btnDownloadTxt) {
        btnDownloadTxt.addEventListener('click', () => downloadCaptionsFile('txt'));
    }

    if (aspectSelect) {
        aspectSelect.addEventListener('change', (e) => {
            updateViewportAspectRatio(e.target.value);
        });
    }

    if (btnLoadVideo && videoInput) {
        btnLoadVideo.addEventListener('click', () => loadColabStream(videoInput.value));
    }

    if (btnDriveDownload) {
        btnDriveDownload.addEventListener('click', triggerGoogleDriveDownload);
    }

    if (btnExportRender) {
        btnExportRender.addEventListener('click', openExportOptionsModal);
    }

    if (btnCloseExportOptions) {
        btnCloseExportOptions.addEventListener('click', closeExportOptionsModal);
    }

    if (btnConfirmExport) {
        btnConfirmExport.addEventListener('click', triggerExport);
    }

    if (btnOpenGallery) {
        btnOpenGallery.addEventListener('click', openExportsGalleryModal);
    }

    if (btnCloseGallery) {
        btnCloseGallery.addEventListener('click', closeExportsGalleryModal);
    }

    if (btnImportSrt && srtFileInput) {
        btnImportSrt.addEventListener('click', () => srtFileInput.click());
        srtFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    captionsData = parseSRT(evt.target.result);
                    renderCaptionsList();
                    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
                    logExec(`Imported ${captionsData.length} subtitle lines from ${file.name}`, "success");
                };
                reader.readAsText(file);
            }
        });
    }

    if (btnAddCaption) {
        btnAddCaption.addEventListener('click', addCaptionLine);
    }

    if (btnUploadFont && fontFileInput) {
        btnUploadFont.addEventListener('click', () => fontFileInput.click());
        fontFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('file', file);
                try {
                    logExec(`Uploading custom font file: ${file.name}...`, "info");
                    const res = await fetch('/api/upload_font', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (res.ok && data.font_metadata) {
                        const family = data.font_metadata.family;
                        const fileName = data.font_metadata.file_name;
                        logExec(`Custom font '${family}' registered & parsed successfully!`, "success");

                        // Dynamically inject @font-face rule into document head so browser canvas loads custom font
                        const dynamicStyleTag = document.getElementById('dynamicCustomFontsStyle') || document.head.appendChild(document.createElement('style'));
                        dynamicStyleTag.id = 'dynamicCustomFontsStyle';
                        dynamicStyleTag.textContent += `
                            @font-face {
                                font-family: '${family}';
                                src: url('/api/custom_fonts/${encodeURIComponent(fileName)}');
                                font-display: swap;
                            }
                        `;

                        const fontSelect = document.getElementById('fontFamilySelect');
                        const customOptGroup = document.getElementById('customFontsOptGroup');
                        if (fontSelect) {
                            let existingOpt = Array.from(fontSelect.options).find(o => o.value.toLowerCase() === family.toLowerCase());
                            if (!existingOpt) {
                                const opt = document.createElement('option');
                                opt.value = family;
                                opt.textContent = `⭐ ${family} (Custom)`;
                                if (customOptGroup) {
                                    customOptGroup.style.display = 'block';
                                    customOptGroup.appendChild(opt);
                                } else {
                                    fontSelect.appendChild(opt);
                                }
                            }
                            fontSelect.value = family;
                        }

                        styleState.fontFamily = family;
                        if (typeof applyStyling === 'function') applyStyling();
                        logExec(`Applied custom font '${family}' across all subtitles!`, "success");
                    } else {
                        logExec(`Font upload error: ${data.detail || 'Failed to register font'}`, "error");
                    }
                } catch (err) {
                    logExec(`Font upload failed: ${err}`, "error");
                }
            }
        });
    }

    if (video) {
        video.addEventListener('timeupdate', () => {
            requestUpdateLiveSubtitleOverlay();
            if (typeof updatePlayheadPosition === 'function') updatePlayheadPosition();
        });

        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', () => {
                if (video.paused) {
                    video.play();
                    btnPlayPause.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>';
                } else {
                    video.pause();
                    btnPlayPause.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
                }
            });
        }

        if (btnStepBack) {
            btnStepBack.addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 5); });
        }

        if (btnStepForward) {
            btnStepForward.addEventListener('click', () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 5); });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => { video.volume = parseFloat(e.target.value); });
        }
    }

    renderCaptionsList();
    initOnScreenEditing();
    initHotkeys();
    loadAvailableFonts();
}

async function loadAvailableFonts() {
    try {
        const res = await fetch('/api/list_fonts');
        const data = await res.json();
        if (!res.ok || !data.fonts) return;

        let dynamicStyleTag = document.getElementById('dynamicCustomFontsStyle');
        if (!dynamicStyleTag) {
            dynamicStyleTag = document.createElement('style');
            dynamicStyleTag.id = 'dynamicCustomFontsStyle';
            document.head.appendChild(dynamicStyleTag);
        }

        const customOptGroup = document.getElementById('customFontsOptGroup');
        const fontSelect = document.getElementById('fontFamilySelect');

        let cssRules = [];
        const existingValues = new Set();
        if (fontSelect) {
            Array.from(fontSelect.options).forEach(opt => existingValues.add(opt.value.toLowerCase()));
        }

        data.fonts.forEach(f => {
            const family = f.family;
            const fileName = f.file_name;
            const isCustom = f.is_custom;

            if (fileName) {
                cssRules.push(`
                    @font-face {
                        font-family: '${family}';
                        src: url('/api/custom_fonts/${encodeURIComponent(fileName)}');
                        font-display: swap;
                    }
                `);
            }

            if (isCustom && customOptGroup && !existingValues.has(family.toLowerCase())) {
                const opt = document.createElement('option');
                opt.value = family;
                opt.textContent = `⭐ ${family} (Custom)`;
                customOptGroup.appendChild(opt);
                existingValues.add(family.toLowerCase());
            }
        });

        dynamicStyleTag.textContent = cssRules.join('\n');

        if (customOptGroup) {
            customOptGroup.style.display = customOptGroup.children.length > 0 ? 'block' : 'none';
        }

        if (fontSelect && styleState.fontFamily) {
            fontSelect.value = styleState.fontFamily;
        }

        logExec(`Loaded ${data.fonts.length} fonts from Subtitle Studio font database.`, "info");
    } catch (err) {
        console.error("Font loading error:", err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAppListeners();
});
