/**
 * Premiere Properties Subtitle Studio - Core Application Logic (v8.1.0)
 * Minimalist Dark Studio, Modern Scrubber Player, Sound Effects & Hardware Accelerated Sync
 */

let currentLoadedVideoPath = null;
let renderPollInterval = null;
let isLoopingEnabled = false;
let isSubtitlesVisible = true;
let playbackSpeeds = [1, 1.25, 1.5, 2, 0.75];
let currentSpeedIndex = 0;
let previousVolume = 1.0;

// ==========================================
// 🔊 SOUND EFFECTS ENGINE (Web Audio API Synthesizer)
// ==========================================
const soundEngine = {
    ctx: null,
    enabled: true,
    init() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx && !this.ctx) {
                this.ctx = new AudioCtx();
            }
        } catch (e) {}
    },
    click(freq = 1100, dur = 0.02, type = 'sine') {
        if (!this.enabled) return;
        try {
            if (!this.ctx) this.init();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            if (!this.ctx) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.35, this.ctx.currentTime + dur);
            gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + dur);
        } catch (e) {}
    },
    cut() {
        this.click(1700, 0.035, 'triangle');
    },
    pop() {
        this.click(800, 0.025, 'sine');
    },
    success() {
        if (!this.enabled) return;
        try {
            if (!this.ctx) this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + (i * 0.05));
                gain.gain.setValueAtTime(0.04, now + (i * 0.05));
                gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.05) + 0.1);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + (i * 0.05));
                osc.stop(now + (i * 0.05) + 0.1);
            });
        } catch (e) {}
    }
};

// Global click audio listener
document.addEventListener('click', (e) => {
    if (e.target.closest('button, .btn, .btn-sm, .btn-xs, .btn-ctrl, .btn-preset, .btn-align, .btn-para-align, .btn-faux, .pp-accordion-header, .pp-tab, .card-split-btn, .card-delete-btn')) {
        soundEngine.click();
    }
});

// ==========================================
// 🕒 TIME FORMATTING UTILITIES
// ==========================================
function formatPlayerTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ==========================================
// 📹 VIDEO STREAM & PROXY MANAGER
// ==========================================
let currentPreviewQuality = '480p';

function changePreviewQuality(newQuality) {
    currentPreviewQuality = newQuality;
    const video = document.getElementById('mainVideoPlayer');
    const select = document.getElementById('previewQualitySelect');
    if (select && select.value !== newQuality) select.value = newQuality;

    if (!video || !currentLoadedVideoPath) return;

    const curTime = video.currentTime || 0;
    const wasPlaying = !video.paused;

    logExec(`Switching preview playback proxy quality to: ${newQuality.toUpperCase()}...`, "info");
    const streamUrl = `/api/stream?video_path=${encodeURIComponent(currentLoadedVideoPath)}&quality=${newQuality}`;
    video.src = streamUrl;
    video.load();

    video.onloadedmetadata = () => {
        video.currentTime = curTime;
        if (wasPlaying) video.play().catch(() => {});
        logExec(`Preview quality switched to ${newQuality.toUpperCase()} successfully.`, "success");
    };
}

async function loadColabStream(videoPath) {
    if (!videoPath || !videoPath.trim()) {
        logExec("Please specify a valid video file path or Google Drive link.", "warn");
        return;
    }

    const cleanPath = videoPath.trim();
    const video = document.getElementById('mainVideoPlayer');
    const spinner = document.getElementById('videoLoadingSpinner');
    const pathInput = document.getElementById('videoPathInput');

    if (pathInput) pathInput.value = cleanPath;
    if (spinner) spinner.style.display = 'flex';
    logExec(`Validating source video path: ${cleanPath}...`, "info");

    try {
        const res = await fetch('/api/check_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: cleanPath })
        });

        const data = await res.json();
        if (!data.valid) {
            if (spinner) spinner.style.display = 'none';
            logExec(`Video check failed: ${data.error}`, "error");
            if (data.available_files && data.available_files.length > 0) {
                logExec(`Found ${data.available_files.length} available videos in directory: ${data.available_files.join(', ')}`, "info");
            }
            alert(`Video file not found: ${cleanPath}\nPlease verify path.`);
            return;
        }

        currentLoadedVideoPath = cleanPath;
        logExec(`Source video validated! Resolution: ${data.width}x${data.height}, FPS: ${data.fps}, Duration: ${data.duration}s (${data.size_mb} MB)`, "success");

        const streamUrl = `/api/stream?video_path=${encodeURIComponent(cleanPath)}&quality=${currentPreviewQuality}`;
        video.src = streamUrl;
        video.load();

        video.onloadedmetadata = () => {
            if (spinner) spinner.style.display = 'none';
            logExec("Video stream loaded into studio player successfully!", "success");
            soundEngine.success();
            updateTimeReadouts();
            if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            if (typeof updatePlayheadPosition === 'function') updatePlayheadPosition();
            if (typeof requestUpdateLiveSubtitleOverlay === 'function') requestUpdateLiveSubtitleOverlay();
            populateFolderVideosDropdown(cleanPath);
        };

        video.onerror = () => {
            if (spinner) spinner.style.display = 'none';
            logExec("Error loading video proxy stream.", "error");
        };

    } catch (err) {
        if (spinner) spinner.style.display = 'none';
        logExec(`Video load request error: ${err}`, "error");
    }
}

function updateViewportAspectRatio(ratio) {
    const container = document.getElementById('videoContainer');
    if (!container) return;

    container.classList.remove('aspect-9-16', 'aspect-16-9', 'aspect-1-1');

    if (ratio === '9:16') {
        container.classList.add('aspect-9-16');
    } else if (ratio === '16:9') {
        container.classList.add('aspect-16-9');
    } else if (ratio === '1:1') {
        container.classList.add('aspect-1-1');
    }
    logExec(`Switched viewport aspect ratio to: ${ratio}`, "info");
    if (typeof requestUpdateLiveSubtitleOverlay === 'function') requestUpdateLiveSubtitleOverlay();
}

async function triggerGoogleDriveDownload() {
    const input = document.getElementById('videoPathInput');
    const urlOrId = input ? input.value.trim() : "";
    if (!urlOrId) {
        const driveUrl = prompt("Enter Google Drive Shared Video Link / File ID:");
        if (driveUrl) {
            if (input) input.value = driveUrl.trim();
            executeDriveDownload(driveUrl.trim());
        }
        return;
    }
    executeDriveDownload(urlOrId);
}

async function executeDriveDownload(urlOrId) {
    const spinner = document.getElementById('videoLoadingSpinner');
    if (spinner) {
        spinner.style.display = 'flex';
        const txt = spinner.querySelector('.spinner-text');
        if (txt) txt.textContent = "Downloading video from Google Drive via gdown...";
    }
    logExec("Downloading Google Drive video...", "info");

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

// ==========================================
// 🚀 EXPORT & RENDER MANAGER
// ==========================================
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
    if (renderPollInterval) {
        clearInterval(renderPollInterval);
        renderPollInterval = null;
    }

    let isHandledCompletion = false;

    renderPollInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/render_progress');
            if (!res.ok) return;
            const data = await res.json();

            const fill = document.getElementById('renderProgressFill');
            const percentText = document.getElementById('renderProgressPercent');
            const statusText = document.getElementById('renderStatusText');
            const stageBadge = document.getElementById('renderStageBadge');
            const speedText = document.getElementById('renderSpeedText');
            const etaText = document.getElementById('renderEtaText');
            const framesText = document.getElementById('renderFramesText');
            const stageText = document.getElementById('renderStageText');
            const errorBox = document.getElementById('renderErrorBox');
            const errorMsg = document.getElementById('renderErrorMsg');

            const stepSubtitles = document.getElementById('stepSubtitles');
            const stepEncode = document.getElementById('stepEncode');
            const stepFinalize = document.getElementById('stepFinalize');

            const pctVal = Math.min(100, Math.max(0, parseFloat(data.percent || 0)));

            if (fill) fill.style.width = `${pctVal}%`;
            if (percentText) {
                percentText.textContent = pctVal >= 100 ? "100%" : (pctVal > 0 ? `${pctVal.toFixed(1)}%` : "0%");
            }
            if (statusText && data.status) statusText.textContent = data.status;
            if (stageBadge && data.stage) stageBadge.textContent = data.stage.toUpperCase();
            if (stageText && data.stage) stageText.textContent = data.stage;
            if (speedText && data.speed) speedText.textContent = data.speed;
            if (etaText && data.eta) etaText.textContent = data.eta;
            if (framesText) {
                if (data.total_frames && data.total_frames > 0) {
                    framesText.textContent = `${data.current_frame || 0} / ${data.total_frames}`;
                } else if (data.current_frame) {
                    framesText.textContent = `${data.current_frame}`;
                } else {
                    framesText.textContent = "--";
                }
            }

            // Stepper progression
            if (stepSubtitles && stepEncode && stepFinalize) {
                if (pctVal < 20 || (data.stage && data.stage.includes('Subtitle'))) {
                    stepSubtitles.className = 'pipeline-step active';
                    stepEncode.className = 'pipeline-step';
                    stepFinalize.className = 'pipeline-step';
                } else if (pctVal < 95) {
                    stepSubtitles.className = 'pipeline-step done';
                    stepEncode.className = 'pipeline-step active';
                    stepFinalize.className = 'pipeline-step';
                } else {
                    stepSubtitles.className = 'pipeline-step done';
                    stepEncode.className = 'pipeline-step done';
                    stepFinalize.className = 'pipeline-step active';
                }
            }

            if (data.percent >= 100 && (data.stage === 'Done' || data.stage === 'Export' || data.status.includes('completed'))) {
                if (isHandledCompletion) return;
                isHandledCompletion = true;

                if (renderPollInterval) {
                    clearInterval(renderPollInterval);
                    renderPollInterval = null;
                }

                if (stepSubtitles) stepSubtitles.className = 'pipeline-step done';
                if (stepEncode) stepEncode.className = 'pipeline-step done';
                if (stepFinalize) stepFinalize.className = 'pipeline-step done';
                if (statusText) statusText.textContent = "Render & export completed successfully!";
                if (percentText) percentText.textContent = "100%";
                if (fill) fill.style.width = "100%";

                logExec("Video rendering & subtitle burn completed successfully!", "success");
                soundEngine.success();
                setTimeout(() => {
                    showRenderModal(false);
                    openExportsGalleryModal();
                }, 800);
            } else if (data.stage === 'Failed') {
                if (renderPollInterval) {
                    clearInterval(renderPollInterval);
                    renderPollInterval = null;
                }
                if (errorBox) errorBox.style.display = 'flex';
                if (errorMsg) errorMsg.textContent = data.error || data.status || "Rendering failed";
                if (statusText) statusText.textContent = "Render encountered an error.";
                logExec(`Render failed: ${data.error || data.status}`, "error");
            }
        } catch (err) {
            console.error("Progress polling error:", err);
        }
    }, 250);
}

function showRenderModal(show) {
    const modal = document.getElementById('renderModal');
    if (!modal) return;

    if (show) {
        // Reset elements to pristine initial state
        const fill = document.getElementById('renderProgressFill');
        const percentText = document.getElementById('renderProgressPercent');
        const statusText = document.getElementById('renderStatusText');
        const stageBadge = document.getElementById('renderStageBadge');
        const stageText = document.getElementById('renderStageText');
        const speedText = document.getElementById('renderSpeedText');
        const etaText = document.getElementById('renderEtaText');
        const framesText = document.getElementById('renderFramesText');
        const errorBox = document.getElementById('renderErrorBox');

        const stepSubtitles = document.getElementById('stepSubtitles');
        const stepEncode = document.getElementById('stepEncode');
        const stepFinalize = document.getElementById('stepFinalize');

        if (fill) fill.style.width = '0%';
        if (percentText) percentText.textContent = '0%';
        if (statusText) statusText.textContent = 'Preparing render pipeline...';
        if (stageBadge) stageBadge.textContent = 'INITIALIZING';
        if (stageText) stageText.textContent = 'Stage 1/4';
        if (speedText) speedText.textContent = '0.0x';
        if (etaText) etaText.textContent = '--';
        if (framesText) framesText.textContent = '0 / 0';
        if (errorBox) errorBox.style.display = 'none';

        if (stepSubtitles) stepSubtitles.className = 'pipeline-step active';
        if (stepEncode) stepEncode.className = 'pipeline-step';
        if (stepFinalize) stepFinalize.className = 'pipeline-step';

        const btnDismiss = document.getElementById('btnDismissRenderError');
        if (btnDismiss) {
            btnDismiss.onclick = () => showRenderModal(false);
        }

        modal.style.display = 'flex';
    } else {
        modal.style.display = 'none';
        if (renderPollInterval) {
            clearInterval(renderPollInterval);
            renderPollInterval = null;
        }
    }
}

// ==========================================
// 📂 SIBLING FOLDER VIDEOS & DIRECTORY BROWSER
// ==========================================
async function populateFolderVideosDropdown(videoOrFolderPath) {
    const box = document.getElementById('folderVideosBox');
    const select = document.getElementById('folderVideosSelect');
    if (!box || !select) return;

    try {
        let folderPath = videoOrFolderPath;
        if (folderPath.includes('/') || folderPath.includes('\\')) {
            const sep = folderPath.includes('/') ? '/' : '\\';
            const lastIdx = folderPath.lastIndexOf(sep);
            if (lastIdx !== -1 && (folderPath.endsWith('.mp4') || folderPath.endsWith('.mov') || folderPath.endsWith('.mkv') || folderPath.endsWith('.webm'))) {
                folderPath = folderPath.substring(0, lastIdx);
            }
        }

        const res = await fetch(`/api/browse_files?folder_path=${encodeURIComponent(folderPath)}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.videos && data.videos.length > 0) {
            select.innerHTML = '<option value="" disabled>Select from folder...</option>';
            data.videos.forEach(vid => {
                const opt = document.createElement('option');
                opt.value = vid.path;
                opt.textContent = `${vid.name} (${vid.size_mb} MB)`;
                if (vid.path === currentLoadedVideoPath || vid.name === currentLoadedVideoPath) {
                    opt.selected = true;
                }
                select.appendChild(opt);
            });
            box.style.display = 'flex';
        } else {
            box.style.display = 'none';
        }
    } catch (err) {
        console.error("Folder videos dropdown population error:", err);
    }
}

function openFolderBrowserModal(initialPath = '') {
    const modal = document.getElementById('folderBrowserModal');
    if (modal) {
        modal.style.display = 'flex';
        loadFolderBrowserContent(initialPath || currentLoadedVideoPath || '');
    }
}

function closeFolderBrowserModal() {
    const modal = document.getElementById('folderBrowserModal');
    if (modal) modal.style.display = 'none';
}

async function loadFolderBrowserContent(targetPath = '') {
    const subdirsContainer = document.getElementById('browserSubdirsList');
    const filesContainer = document.getElementById('browserFilesList');
    const pathInput = document.getElementById('browserCurrentPathInput');
    const btnUp = document.getElementById('btnBrowserGoUp');

    if (subdirsContainer) subdirsContainer.innerHTML = '<div class="console-line info" style="grid-column: 1/-1;">Loading folder...</div>';
    if (filesContainer) filesContainer.innerHTML = '';

    try {
        const res = await fetch(`/api/browse_files?folder_path=${encodeURIComponent(targetPath)}`);
        const data = await res.json();

        if (!res.ok) {
            if (subdirsContainer) subdirsContainer.innerHTML = `<div class="console-line error" style="grid-column: 1/-1;">Error: ${data.error || 'Failed to browse folder'}</div>`;
            return;
        }

        if (pathInput) pathInput.value = data.current_dir || targetPath;

        if (btnUp) {
            btnUp.onclick = () => {
                if (data.parent_dir) {
                    loadFolderBrowserContent(data.parent_dir);
                }
            };
            btnUp.disabled = !data.parent_dir || data.parent_dir === data.current_dir;
        }

        // 1. Render Subdirectories
        if (subdirsContainer) {
            subdirsContainer.innerHTML = '';
            if (data.subdirs && data.subdirs.length > 0) {
                data.subdirs.forEach(sub => {
                    const item = document.createElement('div');
                    item.className = 'browser-folder-item';
                    item.title = `Open ${sub.name}`;
                    item.innerHTML = `
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        <span>${sub.name}</span>
                    `;
                    item.addEventListener('click', () => {
                        loadFolderBrowserContent(sub.path);
                    });
                    subdirsContainer.appendChild(item);
                });
            } else {
                subdirsContainer.innerHTML = '<div style="font-size:10px;color:var(--text-muted);grid-column:1/-1;">(No subdirectories)</div>';
            }
        }

        // 2. Render Video Files
        if (filesContainer) {
            filesContainer.innerHTML = '';
            if (data.videos && data.videos.length > 0) {
                data.videos.forEach(vid => {
                    const row = document.createElement('div');
                    row.className = 'browser-video-row';
                    row.innerHTML = `
                        <div class="browser-video-name" title="${vid.path}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            <span>${vid.name}</span>
                            <span class="browser-video-meta">(${vid.size_mb} MB)</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <button class="btn-xs copy-path-btn" title="Copy file path">Copy Path</button>
                            <button class="btn-xs btn-white select-video-btn" title="Load this video into editor">Load Video</button>
                        </div>
                    `;

                    row.querySelector('.copy-path-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(vid.path);
                        logExec(`Copied path to clipboard: ${vid.path}`, "success");
                    });

                    row.querySelector('.select-video-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        closeFolderBrowserModal();
                        loadColabStream(vid.path);
                    });

                    row.addEventListener('click', () => {
                        closeFolderBrowserModal();
                        loadColabStream(vid.path);
                    });

                    filesContainer.appendChild(row);
                });
            } else {
                filesContainer.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px 0;">No video files (.mp4, .mov, .mkv, .webm) in this folder.</div>';
            }
        }

    } catch (err) {
        if (subdirsContainer) subdirsContainer.innerHTML = `<div class="console-line error" style="grid-column:1/-1;">Network error browsing folder: ${err}</div>`;
    }
}

// ==========================================
// 🎬 RENDERED VIDEOS GALLERY MANAGER
// ==========================================
let currentGalleryActiveFilename = null;

function openExportsGalleryModal(targetFilename = null) {
    const modal = document.getElementById('exportsGalleryModal');
    if (modal) {
        modal.style.display = 'flex';
        loadExportsGallery(targetFilename);
    }
}

function closeExportsGalleryModal() {
    const modal = document.getElementById('exportsGalleryModal');
    const player = document.getElementById('galleryVideoPlayer');
    if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
    }
    currentGalleryActiveFilename = null;
    if (modal) modal.style.display = 'none';
}

function setGalleryPreviewVideo(item, shouldPlay = false) {
    const player = document.getElementById('galleryVideoPlayer');
    const placeholder = document.getElementById('galleryPlayerPlaceholder');
    if (!player || !item) return;

    currentGalleryActiveFilename = item.filename;

    // Update active highlight across gallery cards
    const cards = document.querySelectorAll('.gallery-card');
    cards.forEach(c => {
        if (c.dataset.filename === item.filename) {
            c.classList.add('active-preview');
        } else {
            c.classList.remove('active-preview');
        }
    });

    if (placeholder) placeholder.style.display = 'none';
    player.style.display = 'block';

    const qualSelect = document.getElementById('galleryQualitySelect');
    const quality = qualSelect ? qualSelect.value : '480p';

    // Strict No-Autoplay: Stop playback, set source with cache-busting, preload metadata
    player.autoplay = false;
    player.pause();
    const cleanUrl = `/api/exports/${encodeURIComponent(item.filename)}?quality=${quality}&t=${item.created_at || Date.now()}`;
    
    if (player.src !== cleanUrl && !player.src.endsWith(encodeURIComponent(item.filename))) {
        player.src = cleanUrl;
        player.currentTime = 0;
        player.load();
    }

    if (shouldPlay) {
        player.play().catch(err => {
            logExec(`Gallery playback notification: ${err.message}`, "info");
        });
    }

    logExec(`Loaded exported video into preview (${quality.toUpperCase()}): ${item.filename}`, "info");
}

async function loadExportsGallery(targetFilename = null) {
    const galleryList = document.getElementById('galleryList');
    const countBadge = document.getElementById('galleryCountBadge');
    const player = document.getElementById('galleryVideoPlayer');
    const placeholder = document.getElementById('galleryPlayerPlaceholder');
    if (!galleryList) return;

    galleryList.innerHTML = '<div class="console-line info">Loading rendered exports...</div>';
    try {
        const res = await fetch('/api/list_exports');
        const data = await res.json();

        if (countBadge) {
            countBadge.textContent = data.exports ? data.exports.length : 0;
        }

        if (!data.exports || data.exports.length === 0) {
            galleryList.innerHTML = '<div class="console-line warn">No rendered video exports found yet.</div>';
            if (placeholder) placeholder.style.display = 'flex';
            if (player) {
                player.pause();
                player.removeAttribute('src');
                player.load();
            }
            return;
        }

        galleryList.innerHTML = '';

        // Auto-select latest export (first item) or specific target
        const activeItem = (targetFilename ? data.exports.find(e => e.filename === targetFilename) : null) || data.exports[0];

        data.exports.forEach(item => {
            const card = document.createElement('div');
            card.className = `gallery-card ${item.filename === activeItem.filename ? 'active-preview' : ''}`;
            card.dataset.filename = item.filename;

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
                    <button class="btn-xs play-gallery-btn" data-filename="${item.filename}" title="Load video into preview player">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Preview
                    </button>
                    <a href="/api/exports/${encodeURIComponent(item.filename)}" download class="btn-xs" title="Download MP4">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                        Download
                    </a>
                    <button class="btn-xs copy-path-btn" data-path="${item.path}" title="Copy absolute file path">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        Copy
                    </button>
                </div>
            `;

            const playBtn = card.querySelector('.play-gallery-btn');
            const copyBtn = card.querySelector('.copy-path-btn');

            card.addEventListener('click', (e) => {
                if (e.target.closest('.copy-path-btn') || e.target.closest('a[download]')) return;
                setGalleryPreviewVideo(item, false);
            });

            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                setGalleryPreviewVideo(item, false);
            });

            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(item.path);
                logExec(`Copied file path to clipboard: ${item.path}`, "success");
            });

            galleryList.appendChild(card);
        });

        // Automatically load latest video into player paused at frame 0 (no autoplay)
        if (activeItem) {
            setGalleryPreviewVideo(activeItem, false);
        }

    } catch (err) {
        galleryList.innerHTML = `<div class="console-line error">Failed to load exports: ${err}</div>`;
    }
}

// ==========================================
// ⌨️ GLOBAL KEYBOARD SHORTCUTS & TYPING ISOLATION
// ==========================================
function initHotkeys() {
    window.addEventListener('keydown', (e) => {
        // Strict typing check: NEVER intercept Spacebar or keys when typing in any input/textarea
        const activeEl = document.activeElement;
        const isEditing = activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.isContentEditable ||
            activeEl.getAttribute('contenteditable') === 'true' ||
            activeEl.closest('input, textarea, select, [contenteditable="true"], .caption-text-area, #activeSubTextInput, #subtitleTextBox')
        );

        const targetIsEditing = e.target && (
            e.target.tagName === 'INPUT' ||
            e.target.tagName === 'TEXTAREA' ||
            e.target.tagName === 'SELECT' ||
            e.target.isContentEditable ||
            e.target.getAttribute('contenteditable') === 'true' ||
            e.target.closest('input, textarea, select, [contenteditable="true"], .caption-text-area')
        );

        if (isEditing || targetIsEditing) {
            return; // Allow native typing & spaces without interruption
        }

        const video = document.getElementById('mainVideoPlayer');

        // Ctrl + Z: Undo
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (typeof undo === 'function') undo();
            return;
        }

        // Ctrl + Y or Ctrl + Shift + Z: Redo
        if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
            e.preventDefault();
            if (typeof redo === 'function') redo();
            return;
        }

        // S: Toggle Magnetic Snapping
        if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            if (typeof toggleMagneticSnap === 'function') toggleMagneticSnap();
            return;
        }

        // Alt + Left / Alt + Right: Frame Nudge Active Caption
        if (e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
            e.preventDefault();
            const step = e.shiftKey ? 5 : 1;
            const dir = e.code === 'ArrowLeft' ? -step : step;
            if (typeof nudgeActiveClip === 'function') nudgeActiveClip(dir);
            return;
        }

        // ? or Shift + /: Toggle Shortcuts Modal
        if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
            e.preventDefault();
            toggleShortcutsModal();
            return;
        }

        // Delete: Delete Active Caption Line
        if (e.code === 'Delete' && typeof activeCaptionId !== 'undefined' && activeCaptionId) {
            e.preventDefault();
            if (typeof deleteCaptionLine === 'function') {
                deleteCaptionLine(activeCaptionId);
            }
            return;
        }

        // K or C: Cut / Split Caption at Playhead
        if (e.code === 'KeyK' || e.code === 'KeyC') {
            e.preventDefault();
            soundEngine.cut();
            if (typeof splitCaptionAtPlayhead === 'function') splitCaptionAtPlayhead();
            return;
        }

        // F: Fullscreen
        if (e.code === 'KeyF') {
            e.preventDefault();
            toggleFullscreen();
            return;
        }

        if (!video) return;

        // Space: Play / Pause
        if (e.code === 'Space') {
            e.preventDefault();
            togglePlayPause();
        } else if (e.code === 'ArrowLeft') {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
            updatePlayerScrubber();
            updateTimeReadouts();
        } else if (e.code === 'ArrowRight') {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
            updatePlayerScrubber();
            updateTimeReadouts();
        }
    });
}

function openShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'flex';
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'none';
}

function toggleShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) {
        modal.style.display = modal.style.display === 'none' || !modal.style.display ? 'flex' : 'none';
    }
}

function initDragAndDrop() {
    const wrapper = document.getElementById('viewportWrapper');
    const overlay = document.getElementById('dragDropOverlay');
    if (!wrapper || !overlay) return;

    ['dragenter', 'dragover'].forEach(eventName => {
        wrapper.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.style.display = 'flex';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        wrapper.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            overlay.style.display = 'none';
        }, false);
    });

    wrapper.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const ext = file.name.split('.').pop().toLowerCase();

        if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) {
            const blobUrl = URL.createObjectURL(file);
            const video = document.getElementById('mainVideoPlayer');
            const videoInput = document.getElementById('videoPathInput');
            if (videoInput) videoInput.value = file.name;
            currentLoadedVideoPath = file.name;
            if (video) {
                video.src = blobUrl;
                video.load();
                video.onloadedmetadata = () => {
                    logExec(`Loaded dropped video directly: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`, "success");
                    soundEngine.success();
                    updateTimeReadouts();
                    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
                    if (typeof updatePlayheadPosition === 'function') updatePlayheadPosition();
                    if (typeof requestUpdateLiveSubtitleOverlay === 'function') requestUpdateLiveSubtitleOverlay();
                };
            }
        } else if (ext === 'srt') {
            const reader = new FileReader();
            reader.onload = (evt) => {
                captionsData = parseSRT(evt.target.result);
                renderCaptionsList();
                if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
                logExec(`Imported ${captionsData.length} subtitle lines from dropped file ${file.name}`, "success");
                soundEngine.success();
            };
            reader.readAsText(file);
        } else {
            logExec(`Unsupported dropped file format: .${ext}. Please drop video or .srt files.`, "warn");
        }
    });
}

function togglePlayPause() {
    const video = document.getElementById('mainVideoPlayer');
    const btn = document.getElementById('btnPlayPause');
    if (!video) return;

    soundEngine.click(900, 0.02);

    if (video.paused) {
        video.play();
        if (btn) {
            btn.innerHTML = '<svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect width="4" height="16" x="6" y="4"/><rect width="4" height="16" x="14" y="4"/></svg>';
        }
    } else {
        video.pause();
        if (btn) {
            btn.innerHTML = '<svg class="play-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
        }
    }
}

function updateTimeReadouts() {
    const video = document.getElementById('mainVideoPlayer');
    const readout = document.getElementById('playerTimeReadout');
    if (!video || !readout) return;

    const curr = formatPlayerTime(video.currentTime || 0);
    const dur = formatPlayerTime(video.duration || 0);
    readout.textContent = `${curr} / ${dur}`;
}

function updatePlayerScrubber() {
    const video = document.getElementById('mainVideoPlayer');
    const fill = document.getElementById('playerScrubberFill');
    const thumb = document.getElementById('playerScrubberThumb');
    if (!video || !fill || !thumb) return;

    const dur = video.duration || 0;
    if (dur <= 0) {
        fill.style.width = '0%';
        thumb.style.left = '0%';
        return;
    }

    const pct = Math.min(100, Math.max(0, ((video.currentTime || 0) / dur) * 100));
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
}

function toggleFullscreen() {
    const elem = document.getElementById('viewportWrapper') || document.getElementById('videoContainer');
    if (!elem) return;
    if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => console.log(err));
    } else {
        document.exitFullscreen().catch(err => console.log(err));
    }
}

function requestUpdateLiveSubtitleOverlay() {
    const video = document.getElementById('mainVideoPlayer');
    const textBox = document.getElementById('subtitleTextBox');
    const activeSubInput = document.getElementById('activeSubTextInput');
    const overlay = document.getElementById('subtitleOverlay');
    if (!video || !textBox || !overlay) return;

    if (!isSubtitlesVisible) {
        textBox.style.display = 'none';
        const extraBoxes = overlay.querySelectorAll('.multi-subtitle-item');
        extraBoxes.forEach(b => b.remove());
        return;
    }

    const currTime = video.currentTime || 0;
    const activeCaps = (typeof getActiveCaptionsForTime === 'function') 
        ? getActiveCaptionsForTime(currTime) 
        : ((typeof getActiveCaptionForTime === 'function') ? [getActiveCaptionForTime(currTime)].filter(Boolean) : []);

    if (activeCaps.length > 0) {
        const primaryCap = activeCaps[0];

        if (textBox.contentEditable !== "true") {
            if (textBox.innerText !== primaryCap.text) {
                textBox.innerText = primaryCap.text;
            }
            textBox.style.display = 'block';
            textBox.dataset.id = primaryCap.id;
        }

        if (activeSubInput && document.activeElement !== activeSubInput && activeSubInput.value !== primaryCap.text) {
            activeSubInput.value = primaryCap.text;
        }

        if (typeof setActiveCaption === 'function' && (!activeCaptionId || !activeCaps.some(c => c.id === activeCaptionId))) {
            setActiveCaption(primaryCap.id);
        }

        // Render additional overlapping captions in vertical offset tiers
        const existingExtras = overlay.querySelectorAll('.multi-subtitle-item');
        const neededCount = activeCaps.length - 1;

        // Clean up excess items
        for (let i = neededCount; i < existingExtras.length; i++) {
            existingExtras[i].remove();
        }

        for (let i = 1; i < activeCaps.length; i++) {
            const cap = activeCaps[i];
            let itemEl = overlay.querySelector(`.multi-subtitle-item[data-slot="${i}"]`);
            if (!itemEl) {
                itemEl = document.createElement('div');
                itemEl.className = 'subtitle-text-box multi-subtitle-item';
                itemEl.dataset.slot = i;
                overlay.appendChild(itemEl);
            }
            if (itemEl.innerText !== cap.text) {
                itemEl.innerText = cap.text;
            }
            itemEl.dataset.id = cap.id;
            itemEl.style.display = 'block';
            if (typeof applyElementStyle === 'function') {
                applyElementStyle(itemEl, i);
            }
        }

        if (typeof applyStyling === 'function') {
            applyStyling();
        }
    } else {
        if (textBox.contentEditable !== "true") {
            textBox.innerText = '';
            textBox.style.display = 'none';
        }
        const extraBoxes = overlay.querySelectorAll('.multi-subtitle-item');
        extraBoxes.forEach(b => b.remove());
    }
}

// ==========================================
// 🖱️ DRAGGABLE & EDITABLE ON-SCREEN SUBTITLE
// ==========================================
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

// ==========================================
// 🎛️ APP EVENT LISTENERS
// ==========================================
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
    const btnMuteToggle = document.getElementById('btnMuteToggle');
    const btnSubToggle = document.getElementById('btnSubToggle');
    const btnPlaybackSpeed = document.getElementById('btnPlaybackSpeed');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const scrubberRow = document.getElementById('playerScrubberRow');
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

    const previewQualSelect = document.getElementById('previewQualitySelect');
    if (previewQualSelect) {
        previewQualSelect.addEventListener('change', (e) => {
            changePreviewQuality(e.target.value);
        });
    }

    const folderVideosSelect = document.getElementById('folderVideosSelect');
    if (folderVideosSelect) {
        folderVideosSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                loadColabStream(e.target.value);
            }
        });
    }

    const btnBrowseFolder = document.getElementById('btnBrowseFolder');
    const btnCloseFolderBrowser = document.getElementById('btnCloseFolderBrowser');
    const btnBrowserRefresh = document.getElementById('btnBrowserRefresh');
    const browserPathInput = document.getElementById('browserCurrentPathInput');

    if (btnBrowseFolder) {
        btnBrowseFolder.addEventListener('click', () => openFolderBrowserModal());
    }
    if (btnCloseFolderBrowser) {
        btnCloseFolderBrowser.addEventListener('click', closeFolderBrowserModal);
    }
    if (btnBrowserRefresh) {
        btnBrowserRefresh.addEventListener('click', () => {
            const cur = browserPathInput ? browserPathInput.value : '';
            loadFolderBrowserContent(cur);
        });
    }
    if (browserPathInput) {
        browserPathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                loadFolderBrowserContent(e.target.value.trim());
            }
        });
    }

    const galleryQualitySelect = document.getElementById('galleryQualitySelect');
    if (galleryQualitySelect) {
        galleryQualitySelect.addEventListener('change', () => {
            if (currentGalleryActiveFilename) {
                const player = document.getElementById('galleryVideoPlayer');
                if (player) {
                    const qual = galleryQualitySelect.value;
                    const curTime = player.currentTime || 0;
                    const wasPlaying = !player.paused;
                    player.src = `/api/exports/${encodeURIComponent(currentGalleryActiveFilename)}?quality=${qual}&t=${Date.now()}`;
                    player.load();
                    player.onloadedmetadata = () => {
                        player.currentTime = curTime;
                        if (wasPlaying) player.play().catch(() => {});
                    };
                }
            }
        });
    }

    if (btnLoadVideo && videoInput) {
        btnLoadVideo.addEventListener('click', () => loadColabStream(videoInput.value));
        videoInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') loadColabStream(videoInput.value);
        });
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
                                opt.textContent = `${family} (Custom)`;
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

    // Modern Image 3 Player Controls Listeners
    if (video) {
        video.addEventListener('timeupdate', () => {
            requestUpdateLiveSubtitleOverlay();
            updatePlayerScrubber();
            updateTimeReadouts();
            if (typeof updatePlayheadPosition === 'function') updatePlayheadPosition();
        });

        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', togglePlayPause);
        }

        if (btnStepBack) {
            btnStepBack.addEventListener('click', () => {
                video.currentTime = Math.max(0, video.currentTime - 10);
                updatePlayerScrubber();
                updateTimeReadouts();
            });
        }

        if (btnStepForward) {
            btnStepForward.addEventListener('click', () => {
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                updatePlayerScrubber();
                updateTimeReadouts();
            });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                video.volume = parseFloat(e.target.value);
                if (video.volume === 0) {
                    video.muted = true;
                } else {
                    video.muted = false;
                }
            });
        }

        if (btnMuteToggle) {
            btnMuteToggle.addEventListener('click', () => {
                if (video.muted || video.volume === 0) {
                    video.muted = false;
                    video.volume = previousVolume || 1.0;
                    if (volumeSlider) volumeSlider.value = video.volume;
                } else {
                    previousVolume = video.volume;
                    video.muted = true;
                    video.volume = 0;
                    if (volumeSlider) volumeSlider.value = 0;
                }
            });
        }

        if (btnSubToggle) {
            btnSubToggle.addEventListener('click', () => {
                isSubtitlesVisible = !isSubtitlesVisible;
                btnSubToggle.classList.toggle('active', isSubtitlesVisible);
                const overlay = document.getElementById('subtitleOverlay');
                if (overlay) overlay.style.display = isSubtitlesVisible ? 'flex' : 'none';
                logExec(`Subtitle Preview: ${isSubtitlesVisible ? 'ON' : 'OFF'}`, "info");
            });
        }

        if (btnPlaybackSpeed) {
            btnPlaybackSpeed.addEventListener('click', () => {
                currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
                const spd = playbackSpeeds[currentSpeedIndex];
                video.playbackRate = spd;
                btnPlaybackSpeed.textContent = `${spd}x`;
                logExec(`Playback Speed set to ${spd}x`, "info");
            });
        }

        if (btnFullscreen) {
            btnFullscreen.addEventListener('click', toggleFullscreen);
        }

        // Scrubber seek listener
        if (scrubberRow) {
            scrubberRow.addEventListener('click', (e) => {
                const rect = scrubberRow.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, clickX / rect.width));
                if (video && video.duration) {
                    video.currentTime = pct * video.duration;
                    updatePlayerScrubber();
                    updateTimeReadouts();
                }
            });
        }
    }

    const btnShortcuts = document.getElementById('btnShortcutsModal');
    const btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
    if (btnShortcuts) btnShortcuts.addEventListener('click', openShortcutsModal);
    if (btnCloseShortcuts) btnCloseShortcuts.addEventListener('click', closeShortcutsModal);

    renderCaptionsList();
    initOnScreenEditing();
    initHotkeys();
    initDragAndDrop();
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
                opt.textContent = `${family} (Custom)`;
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
