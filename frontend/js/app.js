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
async function loadColabStream(videoPath) {
    if (!videoPath || !videoPath.trim()) {
        logExec("Please specify a valid video file path or Google Drive link.", "warn");
        return;
    }

    const cleanPath = videoPath.trim();
    const video = document.getElementById('mainVideoPlayer');
    const spinner = document.getElementById('videoLoadingSpinner');

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

        const streamUrl = `/api/stream?video_path=${encodeURIComponent(cleanPath)}`;
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
            if (speedText) speedText.textContent = data.speed;

            if (data.percent >= 100 && data.stage === 'Done') {
                clearInterval(renderPollInterval);
                logExec("Video rendering & subtitle burn completed successfully!", "success");
                soundEngine.success();
                setTimeout(() => {
                    showRenderModal(false);
                    openExportsGalleryModal();
                }, 1000);
            } else if (data.stage === 'Failed') {
                clearInterval(renderPollInterval);
                logExec(`Render failed: ${data.error}`, "error");
            }
        } catch (err) {
            console.error("Progress polling error:", err);
        }
    }, 600);
}

function showRenderModal(show) {
    const modal = document.getElementById('renderModal');
    if (modal) modal.style.display = show ? 'flex' : 'none';
}

// ==========================================
// 🎬 RENDERED VIDEOS GALLERY MANAGER
// ==========================================
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
