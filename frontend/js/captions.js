/**
 * Captions Data State Manager, Undo/Redo Engine, Split/Cut Tools & Exporters (v8.1.0)
 */

let captionsData = [
    { id: "cap_1", start: 0.5, end: 3.5, text: "Welcome to Premiere Properties Subtitle Studio." },
    { id: "cap_2", start: 3.8, end: 7.0, text: "Automate your video subtitles with Essential Graphics." }
];

let activeCaptionId = null;
let searchQuery = "";

// UNDO / REDO HISTORY STACKS
const undoStack = [];
const redoStack = [];
const MAX_HISTORY_LIMIT = 50;

function pushHistoryState() {
    if (undoStack.length >= MAX_HISTORY_LIMIT) {
        undoStack.shift();
    }
    undoStack.push(JSON.stringify({
        captions: captionsData,
        activeId: activeCaptionId
    }));
    redoStack.length = 0; // Clear redo stack on new user edit action
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length === 0) {
        logExec("Nothing to undo.", "warn");
        return;
    }

    redoStack.push(JSON.stringify({
        captions: captionsData,
        activeId: activeCaptionId
    }));

    const prevState = JSON.parse(undoStack.pop());
    captionsData = prevState.captions;
    activeCaptionId = prevState.activeId;

    renderCaptionsList();
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    if (typeof applyStyling === 'function') applyStyling();
    updateUndoRedoButtons();
    logExec("Undid last action (Ctrl+Z)", "info");
}

function redo() {
    if (redoStack.length === 0) {
        logExec("Nothing to redo.", "warn");
        return;
    }

    undoStack.push(JSON.stringify({
        captions: captionsData,
        activeId: activeCaptionId
    }));

    const nextState = JSON.parse(redoStack.pop());
    captionsData = nextState.captions;
    activeCaptionId = nextState.activeId;

    renderCaptionsList();
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    if (typeof applyStyling === 'function') applyStyling();
    updateUndoRedoButtons();
    logExec("Redid last action (Ctrl+Y)", "info");
}

function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btnUndo');
    const btnRedo = document.getElementById('btnRedo');
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

function parseSRTTime(timeStr) {
    if (!timeStr) return 0;
    const clean = timeStr.trim().replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
        const hrs = parseFloat(parts[0]) || 0;
        const mins = parseFloat(parts[1]) || 0;
        const secs = parseFloat(parts[2]) || 0;
        return (hrs * 3600) + (mins * 60) + secs;
    } else if (parts.length === 2) {
        const mins = parseFloat(parts[0]) || 0;
        const secs = parseFloat(parts[1]) || 0;
        return (mins * 60) + secs;
    } else {
        return parseFloat(clean) || 0;
    }
}

function formatSRTTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function formatVTTTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseSRT(srtText) {
    pushHistoryState();
    const blocks = srtText.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
    const parsed = [];
    
    blocks.forEach((block, idx) => {
        const lines = block.split('\n');
        if (lines.length >= 2) {
            const timeLineIdx = lines[0].includes('-->') ? 0 : 1;
            if (lines[timeLineIdx] && lines[timeLineIdx].includes('-->')) {
                const [startStr, endStr] = lines[timeLineIdx].split('-->');
                const text = lines.slice(timeLineIdx + 1).join('\n').trim();
                const randSuffix = Math.random().toString(36).substring(2, 7);
                parsed.push({
                    id: `cap_${Date.now()}_${idx}_${randSuffix}`,
                    start: parseSRTTime(startStr),
                    end: parseSRTTime(endStr),
                    text: text
                });
            }
        }
    });
    return parsed;
}

function downloadCaptionsFile(format = 'srt') {
    if (!captionsData || captionsData.length === 0) {
        logExec("No captions available to export!", "warn");
        return;
    }

    let content = "";
    let mime = "text/plain";
    let filename = `subtitles.${format}`;

    if (format === 'srt') {
        mime = "application/x-subrip";
        content = captionsData.map((c, i) => `${i + 1}\n${formatSRTTime(c.start)} --> ${formatSRTTime(c.end)}\n${c.text}\n`).join('\n');
    } else if (format === 'vtt') {
        mime = "text/vtt";
        content = "WEBVTT\n\n" + captionsData.map((c, i) => `${i + 1}\n${formatVTTTime(c.start)} --> ${formatVTTTime(c.end)}\n${c.text}\n`).join('\n');
    } else if (format === 'txt') {
        mime = "text/plain";
        content = captionsData.map(c => c.text).join('\n');
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    logExec(`Exported ${captionsData.length} lines to ${filename}`, "success");
}

async function autoGenerateAiCaptions() {
    pushHistoryState();
    logExec("Triggering AI Auto-Transcribe for video audio...", "info");
    try {
        const res = await fetch('/api/generate_ai_captions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_path: currentLoadedVideoPath || "" })
        });
        const data = await res.json();
        if (res.ok && data.captions) {
            captionsData = data.captions;
            renderCaptionsList();
            if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            logExec(`AI Auto-Transcribed ${data.captions.length} timed subtitle lines successfully!`, "success");
        } else {
            logExec("AI transcription failed.", "error");
        }
    } catch (err) {
        logExec(`AI transcription error: ${err}`, "error");
    }
}

function shiftAllTimestamps(offsetSeconds) {
    pushHistoryState();
    captionsData.forEach(c => {
        c.start = Math.max(0, parseFloat((c.start + offsetSeconds).toFixed(2)));
        c.end = Math.max(c.start + 0.1, parseFloat((c.end + offsetSeconds).toFixed(2)));
    });
    renderCaptionsList();
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    logExec(`Shifted all caption timestamps by ${offsetSeconds > 0 ? '+' : ''}${offsetSeconds}s`, "info");
}

function setSearchQuery(q) {
    searchQuery = q.toLowerCase().trim();
    renderCaptionsList();
}

/** CUT & SPLIT CAPTION LINE TOOL **/
function splitCaptionLine(id) {
    pushHistoryState();
    const idx = captionsData.findIndex(c => c.id === id);
    if (idx === -1) return;

    const cap = captionsData[idx];
    const midTime = parseFloat(((cap.start + cap.end) / 2.0).toFixed(2));
    const words = cap.text.split(' ');
    const halfIndex = Math.ceil(words.length / 2);
    const text1 = words.slice(0, halfIndex).join(' ') || cap.text;
    const text2 = words.slice(halfIndex).join(' ') || "...";

    cap.end = midTime;
    cap.text = text1;

    const newCap = {
        id: `cap_${Date.now()}`,
        start: midTime,
        end: cap.end + 2.0,
        text: text2
    };

    captionsData.splice(idx + 1, 0, newCap);

    renderCaptionsList();
    setActiveCaption(newCap.id);
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    logExec(`Split caption line #${idx + 1} into two clips.`, "info");
}

function splitCaptionAtPlayhead() {
    const video = document.getElementById('mainVideoPlayer');
    if (!video) return;

    const currTime = video.currentTime;
    const activeCap = getActiveCaptionForTime(currTime);
    if (!activeCap) {
        logExec("No active caption found at current playhead time to split.", "warn");
        return;
    }

    pushHistoryState();
    const idx = captionsData.findIndex(c => c.id === activeCap.id);
    const origEnd = activeCap.end;
    const splitTime = parseFloat(currTime.toFixed(2));

    if (splitTime <= activeCap.start + 0.2 || splitTime >= origEnd - 0.2) {
        logExec("Playhead too close to clip edge to split.", "warn");
        return;
    }

    const words = activeCap.text.split(' ');
    const halfIndex = Math.ceil(words.length / 2);
    const text1 = words.slice(0, halfIndex).join(' ') || activeCap.text;
    const text2 = words.slice(halfIndex).join(' ') || "...";

    activeCap.end = splitTime;
    activeCap.text = text1;

    const newCap = {
        id: `cap_${Date.now()}`,
        start: splitTime,
        end: origEnd,
        text: text2
    };

    captionsData.splice(idx + 1, 0, newCap);

    renderCaptionsList();
    setActiveCaption(newCap.id);
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    logExec(`Cut subtitle clip at playhead time ${splitTime}s.`, "success");
}

function renderCaptionsList() {
    const container = document.getElementById('captionsList');
    if (!container) return;

    container.innerHTML = '';

    const visibleItems = captionsData.filter(item => {
        if (!searchQuery) return true;
        return item.text.toLowerCase().includes(searchQuery);
    });

    if (captionsData.length === 0) {
        container.innerHTML = `
            <div class="captions-empty-state">
                <div class="empty-icon">📝</div>
                <div class="empty-title">No Subtitles Yet</div>
                <div class="empty-desc">Auto-transcribe speech with AI, import an .SRT file, or create custom captions.</div>
                <div class="empty-actions">
                    <button onclick="document.getElementById('btnAiCaptions').click()" class="btn-sm btn-glow-purple">⚡ AI Transcribe</button>
                    <button onclick="document.getElementById('btnImportSrt').click()" class="btn-sm">📂 Import .SRT</button>
                    <button onclick="addNewCaptionLine()" class="btn-sm btn-accent">+ Add Caption</button>
                </div>
            </div>
        `;
        return;
    }

    if (visibleItems.length === 0) {
        container.innerHTML = '<div class="console-line warn" style="padding:16px;text-align:center;">🔍 No captions match your search.</div>';
        return;
    }

    visibleItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = `caption-card ${item.id === activeCaptionId ? 'active' : ''}`;
        card.dataset.id = item.id;
        card.id = `caption-card-${item.id}`;

        card.innerHTML = `
            <div class="card-header-row">
                <span>#${index + 1}</span>
                <div class="timestamp-inputs">
                    <input type="text" class="time-input start-time" value="${item.start.toFixed(2)}" data-id="${item.id}">
                    <span>➔</span>
                    <input type="text" class="time-input end-time" value="${item.end.toFixed(2)}" data-id="${item.id}">
                </div>
                <div class="card-actions-right">
                    <button class="card-split-btn" data-id="${item.id}" title="Split / Cut Line">✂️</button>
                    <button class="card-delete-btn" data-id="${item.id}" title="Delete Line">✖</button>
                </div>
            </div>
            <textarea class="caption-text-area" data-id="${item.id}">${item.text}</textarea>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
                setActiveCaption(item.id);
                const video = document.getElementById('mainVideoPlayer');
                if (video) video.currentTime = item.start;
            }
        });

        const startInput = card.querySelector('.start-time');
        const endInput = card.querySelector('.end-time');
        const textArea = card.querySelector('.caption-text-area');
        const splitBtn = card.querySelector('.card-split-btn');
        const delBtn = card.querySelector('.card-delete-btn');

        startInput.addEventListener('change', (e) => {
            pushHistoryState();
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
                item.start = Math.max(0, val);
                if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            }
        });

        endInput.addEventListener('change', (e) => {
            pushHistoryState();
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
                item.end = Math.max(item.start + 0.1, val);
                if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            }
        });

        textArea.addEventListener('input', (e) => {
            item.text = e.target.value;
            if (typeof updateLiveSubtitleOverlay === 'function') updateLiveSubtitleOverlay();
            if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
        });

        splitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            splitCaptionLine(item.id);
        });

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCaptionLine(item.id);
        });

        container.appendChild(card);
    });
}

function setActiveCaption(id) {
    if (activeCaptionId === id) return;

    if (activeCaptionId) {
        const oldCard = document.getElementById(`caption-card-${activeCaptionId}`);
        if (oldCard) oldCard.classList.remove('active');
        const oldClip = document.querySelector(`.timeline-clip[data-id="${activeCaptionId}"]`);
        if (oldClip) oldClip.classList.remove('active');
    }

    activeCaptionId = id;

    if (activeCaptionId) {
        const newCard = document.getElementById(`caption-card-${activeCaptionId}`);
        if (newCard) {
            newCard.classList.add('active');
            newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const newClip = document.querySelector(`.timeline-clip[data-id="${activeCaptionId}"]`);
        if (newClip) newClip.classList.add('active');
    }
}

function deleteCaptionLine(id) {
    pushHistoryState();
    captionsData = captionsData.filter(c => c.id !== id);
    if (activeCaptionId === id) activeCaptionId = null;
    renderCaptionsList();
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    logExec(`Deleted caption line.`, 'warn');
}

function addCaptionLine() {
    pushHistoryState();
    const video = document.getElementById('mainVideoPlayer');
    const currTime = video ? video.currentTime : 0;
    const newCap = {
        id: `cap_${Date.now()}`,
        start: parseFloat(currTime.toFixed(2)),
        end: parseFloat((currTime + 3.0).toFixed(2)),
        text: "New subtitle text line"
    };
    captionsData.push(newCap);
    renderCaptionsList();
    setActiveCaption(newCap.id);
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    logExec(`Added new caption line at ${currTime.toFixed(2)}s.`, 'info');
}

function getActiveCaptionForTime(currentTime) {
    return captionsData.find(c => currentTime >= c.start && currentTime <= c.end);
}
