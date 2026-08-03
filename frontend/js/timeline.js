/**
 * Hardware-Accelerated Interactive Timeline Track Engine (Zero Playback Lag)
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
    return (sec * zoomScale) / 10;
}

function pixelsToSeconds(px) {
    return (px * 10) / zoomScale;
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
    const stepSec = zoomScale > 300 ? 1 : (zoomScale > 150 ? 2 : 5);
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
        const widthPx = Math.max(16, secondsToPixels(item.end - item.start));

        clip.style.left = `${leftPx}px`;
        clip.style.width = `${widthPx}px`;

        clip.innerHTML = `
            <div class="trim-handle left-handle" data-id="${item.id}" data-edge="left"></div>
            <div class="clip-text">${item.text}</div>
            <div class="trim-handle right-handle" data-id="${item.id}" data-edge="right"></div>
        `;

        clip.addEventListener('mousedown', (e) => {
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

        track.appendChild(clip);
    });

    updatePlayheadPosition();
}

function updatePlayheadPosition() {
    const { playhead, timecode, video } = getPlayheadNodes();
    if (!video || !playhead) return;

    const currTime = video.currentTime || 0;
    const leftPx = secondsToPixels(currTime);

    // GPU compositor accelerated positioning (0% reflow lag)
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
    const { video } = getPlayheadNodes();

    if (zoomInput) {
        zoomInput.addEventListener('input', (e) => {
            zoomScale = parseInt(e.target.value);
            if (zoomVal) zoomVal.textContent = `${zoomScale}%`;
            renderTimelineTrack();
        });
    }

    if (ruler) {
        ruler.addEventListener('click', (e) => {
            const rect = ruler.getBoundingClientRect();
            const clickPx = e.clientX - rect.left + ruler.scrollLeft;
            const targetSec = pixelsToSeconds(clickPx);
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
            renderTimelineTrack();
            renderCaptionsList();
        } else if (isTrimmingClip) {
            if (currentTrimEdge === 'left') {
                capItem.start = Math.min(capItem.end - 0.2, Math.max(0, parseFloat((dragOriginalStart + deltaSec).toFixed(2))));
            } else if (currentTrimEdge === 'right') {
                capItem.end = Math.max(capItem.start + 0.2, parseFloat((dragOriginalEnd + deltaSec).toFixed(2)));
            }
            renderTimelineTrack();
            renderCaptionsList();
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
