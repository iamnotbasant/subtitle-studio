/**
 * Main Application Orchestrator & API Integration Engine
 */

let currentLoadedVideoPath = "";
let renderPollInterval = null;

function updateLiveSubtitleOverlay() {
    const video = document.getElementById('mainVideoPlayer');
    const overlay = document.getElementById('subtitleOverlay');
    const textBox = document.getElementById('subtitleTextBox');
    if (!video || !textBox) return;

    const currTime = video.currentTime || 0;
    const activeCap = getActiveCaptionForTime(currTime);

    if (activeCap) {
        textBox.innerText = activeCap.text;
        overlay.style.display = 'flex';
        setActiveCaption(activeCap.id);
    } else {
        overlay.style.display = 'none';
    }
}

async function loadColabStream(videoPath) {
    if (!videoPath) {
        logExec("Please enter a valid video file path or URL.", "warn");
        return;
    }

    logExec(`Inspecting video path: ${videoPath}...`, "info");
    try {
        const checkRes = await fetch('/api/check_video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: videoPath })
        });

        const data = await checkRes.json();
        if (!data.valid) {
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
        
        player.onloadedmetadata = () => {
            if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
        };

    } catch (err) {
        logExec(`Failed to connect to backend API: ${err}`, "error");
    }
}

async function triggerGoogleDriveDownload() {
    const urlOrId = prompt("Enter Google Drive File Link or File ID:");
    if (!urlOrId) return;

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
            logExec(`Drive download error: ${data.detail || 'Download failed'}`, "error");
        }
    } catch (err) {
        logExec(`Drive download error: ${err}`, "error");
    }
}

async function triggerExport() {
    if (!currentLoadedVideoPath) {
        logExec("No video loaded! Please load a video before exporting.", "warn");
        alert("Please load a video file first!");
        return;
    }

    if (captionsData.length === 0) {
        logExec("No captions available to render!", "warn");
        return;
    }

    const payload = {
        video_path: currentLoadedVideoPath,
        captions: captionsData,
        style: styleState
    };

    logExec("Initiating ASS Render & Premiere XML export pipeline...", "info");
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
                logExec("Export Completed Successfully! MP4, SRT, and Premiere XML created in exports directory.", "success");
                setTimeout(() => showRenderModal(false), 1500);
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
            activeCap.text = textBox.innerText;
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
    const btnImportSrt = document.getElementById('btnImportSrt');
    const srtFileInput = document.getElementById('srtFileInput');
    const btnAddCaption = document.getElementById('btnAddCaption');
    const btnUploadFont = document.getElementById('btnUploadFont');
    const fontFileInput = document.getElementById('fontFileInput');
    const video = document.getElementById('mainVideoPlayer');
    const btnPlayPause = document.getElementById('btnPlayPause');
    const btnStepBack = document.getElementById('btnStepBack');
    const btnStepForward = document.getElementById('btnStepForward');
    const volumeSlider = document.getElementById('volumeSlider');

    // Video Loading
    if (btnLoadVideo && videoInput) {
        btnLoadVideo.addEventListener('click', () => loadColabStream(videoInput.value));
    }

    if (btnDriveDownload) {
        btnDriveDownload.addEventListener('click', triggerGoogleDriveDownload);
    }

    if (btnExportRender) {
        btnExportRender.addEventListener('click', triggerExport);
    }

    // SRT File Import
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

    // Font File Upload
    if (btnUploadFont && fontFileInput) {
        btnUploadFont.addEventListener('click', () => fontFileInput.click());
        fontFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const res = await fetch('/api/upload_font', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (res.ok) {
                        logExec(`Uploaded custom font: ${file.name}`, "success");
                        const fontSelect = document.getElementById('fontFamilySelect');
                        if (fontSelect && data.font_metadata) {
                            const opt = document.createElement('option');
                            opt.value = data.font_metadata.family;
                            opt.textContent = data.font_metadata.family;
                            fontSelect.appendChild(opt);
                            fontSelect.value = data.font_metadata.family;
                            styleState.fontFamily = data.font_metadata.family;
                            applyStyling();
                        }
                    }
                } catch (err) {
                    logExec(`Font upload failed: ${err}`, "error");
                }
            }
        });
    }

    // Video Player Events
    if (video) {
        video.addEventListener('timeupdate', () => {
            updateLiveSubtitleOverlay();
            if (typeof updatePlayheadPosition === 'function') updatePlayheadPosition();
        });

        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', () => {
                if (video.paused) {
                    video.play();
                    btnPlayPause.textContent = '⏸';
                } else {
                    video.pause();
                    btnPlayPause.textContent = '▶';
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
}

document.addEventListener('DOMContentLoaded', () => {
    initAppListeners();
});
