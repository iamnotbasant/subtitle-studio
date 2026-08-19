/**
 * Hardware-Accelerated Interactive Timeline Engine (Smooth Zoom, Draggable Handles & Cut Tools) v8.1.0
 */

let zoomScale = 100;
let isDraggingClip = false;
let isTrimmingClip = false;
let currentDraggedClipId = null;
let currentTrimEdge = null;
let dragStartX = 0;
let dragOriginalStart = 0;
let dragOriginalEnd = 0;

let cachedPlayheadNode = null;
let cachedTimecodeNode = null;
let cachedVideoNode = null;

function secondsToPixels(sec) {
    // Smooth linear mapping: 100% zoom = 40px per second
    const pps = (zoomScale / 100.0) * 40.0;
    return sec * pps;
}

function pixelsToSeconds(px) {
    const pps = (zoomScale / 100.0) * 40.0;
    return pps > 0 ? px / pps : 0;
}

function getPlayheadNodes() {
    if (!cachedPlayheadNode) cachedPlayheadNode = document.getElementById('timelinePlayhead');
    if (!cachedTimecodeNode) cachedTimecodeNode = document.getElementById('timecodeDisplay');
    if (!cachedVideoNode) cachedVideoNode = document.getElementById('mainVideoPlayer');
    return { playhead: cachedPlayheadNode, timecode: cachedTimecodeNode, video: cachedVideoNode };
}

function renderTimelineTrack() {
    const track = document.getElementById('subtitleTrack');
    const ruler = document.getElementById('timeRuler');
    const { video } = getPlayheadNodes();
    if (!track || !ruler) return;

    const totalDuration = (video && video.duration && !isNaN(video.duration)) ? video.duration : 60;
    const totalWidthPx = secondsToPixels(totalDuration);

    track.style.width = `${Math.max(totalWidthPx, 800)}px`;
    ruler.style.width = `${Math.max(totalWidthPx, 800)}px`;

    ruler.innerHTML = '';
    const stepSec = zoomScale > 300 ? 1 : (zoomScale > 150 ? 2 : (zoomScale > 80 ? 5 : 10));
    for (let sec = 0; sec <= totalDuration; sec += stepSec) {
        const leftPx = secondsToPixels(sec);
        const tick = document.createElement('div');
        tick.className = 'ruler-tick major';
        tick.style.left = `${leftPx}px`;

        const label = document.createElement('div');
        label.className = 'ruler-tick-label';
        label.style.left = `${leftPx}px`;
        label.textContent = `${sec}s`;

        ruler.appendChild(tick);
        ruler.appendChild(label);
    }

    track.innerHTML = '';
    captionsData.forEach((item) => {
        const clip = document.createElement('div');
        clip.className = `timeline-clip ${item.id === activeCaptionId ? 'active' : ''}`;
        clip.dataset.id = item.id;

        const leftPx = secondsToPixels(item.start);
        const widthPx = Math.max(20, secondsToPixels(item.end - item.start));

        clip.style.left = `${leftPx}px`;
        clip.style.width = `${widthPx}px`;

        clip.innerHTML = `
            <div class="trim-handle left-handle" data-id="${item.id}" data-edge="left" title="Drag to trim start time"></div>
            <div class="clip-text">${item.text}</div>
            <div class="trim-handle right-handle" data-id="${item.id}" data-edge="right" title="Drag to trim end time"></div>
        `;

        clip.addEventListener('mousedown', (e) => {
            if (typeof pushHistoryState === 'function') pushHistoryState();
            if (e.target.classList.contains('trim-handle')) {
                isTrimmingClip = true;
                currentTrimEdge = e.target.dataset.edge;
            } else {
                isDraggingClip = true;
            }
            currentDraggedClipId = item.id;
            dragStartX = e.clientX;
            dragOriginalStart = item.start;
            dragOriginalEnd = item.end;
            setActiveCaption(item.id);
            e.stopPropagation();
        });

        // Context Menu for Cut / Delete
        clip.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const action = prompt(`Clip Action for "${item.text}":\n1: Split / Cut Line\n2: Delete Clip\n(Type 1 or 2):`, "1");
            if (action === "1") {
                splitCaptionLine(item.id);
            } else if (action === "2") {
                deleteCaptionLine(item.id);
            }
        });

        track.appendChild(clip);
    });

    updatePlayheadPosition();
}

function updatePlayheadPosition() {
    const { playhead, timecode, video } = getPlayheadNodes();
    if (!video || !playhead) return;

    const currTime = video.currentTime || 0;
    const leftPx = secondsToPixels(currTime);

    playhead.style.transform = `translate3d(${leftPx}px, 0, 0)`;

    if (timecode) {
        const hrs = String(Math.floor(currTime / 3600)).padStart(2, '0');
        const mins = String(Math.floor((currTime % 3600) / 60)).padStart(2, '0');
        const secs = String(Math.floor(currTime % 60)).padStart(2, '0');
        const frames = String(Math.floor((currTime % 1) * 30)).padStart(2, '0');
        timecode.textContent = `${hrs}:${mins}:${secs}:${frames}`;
    }
}

function initTimelineEvents() {
    const zoomInput = document.getElementById('timelineZoom');
    const zoomVal = document.getElementById('zoomVal');
    const ruler = document.getElementById('timeRuler');
    const trackArea = document.getElementById('timelineTrackArea');
    const { video } = getPlayheadNodes();

    if (zoomInput) {
        zoomInput.addEventListener('input', (e) => {
            zoomScale = parseInt(e.target.value);
            if (zoomVal) zoomVal.textContent = `${zoomScale}%`;
            renderTimelineTrack();
        });
    }

    // Ctrl + Mouse Wheel Smooth Zoom Listener
    if (trackArea) {
        trackArea.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -15 : 15;
                zoomScale = Math.max(50, Math.min(1000, zoomScale + delta));
                if (zoomInput) zoomInput.value = zoomScale;
                if (zoomVal) zoomVal.textContent = `${zoomScale}%`;
                renderTimelineTrack();
            }
        }, { passive: false });
    }

    let timelineMoveRaf = false;

    if (ruler) {
        ruler.addEventListener('click', (e) => {
            const rect = ruler.getBoundingClientRect();
            const scrollOffset = trackArea ? trackArea.scrollLeft : 0;
            const clickPx = e.clientX - rect.left + scrollOffset;
            const targetSec = Math.max(0, pixelsToSeconds(clickPx));
            if (video) video.currentTime = targetSec;
            updatePlayheadPosition();
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (!currentDraggedClipId) return;

        const deltaPx = e.clientX - dragStartX;
        const deltaSec = pixelsToSeconds(deltaPx);

        const capItem = captionsData.find(c => c.id === currentDraggedClipId);
        if (!capItem) return;

        if (isDraggingClip) {
            const dur = dragOriginalEnd - dragOriginalStart;
            capItem.start = Math.max(0, parseFloat((dragOriginalStart + deltaSec).toFixed(2)));
            capItem.end = parseFloat((capItem.start + dur).toFixed(2));
        } else if (isTrimmingClip) {
            if (currentTrimEdge === 'left') {
                capItem.start = Math.min(capItem.end - 0.2, Math.max(0, parseFloat((dragOriginalStart + deltaSec).toFixed(2))));
            } else if (currentTrimEdge === 'right') {
                capItem.end = Math.max(capItem.start + 0.2, parseFloat((dragOriginalEnd + deltaSec).toFixed(2)));
            }
        }

        if (!timelineMoveRaf) {
            timelineMoveRaf = true;
            requestAnimationFrame(() => {
                renderTimelineTrack();
                renderCaptionsList();
                timelineMoveRaf = false;
            });
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingClip || isTrimmingClip) {
            isDraggingClip = false;
            isTrimmingClip = false;
            currentDraggedClipId = null;
            currentTrimEdge = null;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTimelineEvents();
});
