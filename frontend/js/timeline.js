/**
 * Hardware-Accelerated Interactive Timeline Engine v8.2.0
 * Multi-Lane Overlap Layout, Anchored Smooth Zooming, Sub-Frame Trimming & Scrubbing
 */

let zoomScale = 100;
let isDraggingClip = false;
let isTrimmingClip = false;
let isScrubbingTimeline = false;
let currentDraggedClipId = null;
let currentTrimEdge = null;
let dragStartX = 0;
let dragOriginalStart = 0;
let dragOriginalEnd = 0;

let cachedPlayheadNode = null;
let cachedTimecodeNode = null;
let cachedVideoNode = null;

function secondsToPixels(sec) {
    // 100% zoom = 45px per second
    const pps = (zoomScale / 100.0) * 45.0;
    return sec * pps;
}

function pixelsToSeconds(px) {
    const pps = (zoomScale / 100.0) * 45.0;
    return pps > 0 ? px / pps : 0;
}

function getPlayheadNodes() {
    if (!cachedPlayheadNode) cachedPlayheadNode = document.getElementById('timelinePlayhead');
    if (!cachedTimecodeNode) cachedTimecodeNode = document.getElementById('timecodeDisplay');
    if (!cachedVideoNode) cachedVideoNode = document.getElementById('mainVideoPlayer');
    return { playhead: cachedPlayheadNode, timecode: cachedTimecodeNode, video: cachedVideoNode };
}

function formatRulerTime(sec) {
    if (sec >= 60) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        const ms = Math.round((sec - Math.floor(sec)) * 10);
        return ms > 0 ? `${m}:${String(s).padStart(2, '0')}.${ms}` : `${m}:${String(s).padStart(2, '0')}`;
    }
    const dec = Number.isInteger(sec) ? `${sec}s` : `${sec.toFixed(1)}s`;
    return dec;
}

function renderTimelineTrack() {
    const track = document.getElementById('subtitleTrack');
    const ruler = document.getElementById('timeRuler');
    const { video } = getPlayheadNodes();
    if (!track || !ruler) return;

    const totalDuration = (video && video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 60;
    const totalWidthPx = Math.max(secondsToPixels(totalDuration) + 200, 800);

    track.style.width = `${totalWidthPx}px`;
    ruler.style.width = `${totalWidthPx}px`;

    // 1. Adaptive Ruler Rendering
    ruler.innerHTML = '';
    let majorStep = 10;
    let minorStep = 2;
    if (zoomScale >= 600) {
        majorStep = 0.5;
        minorStep = 0.1;
    } else if (zoomScale >= 300) {
        majorStep = 1.0;
        minorStep = 0.25;
    } else if (zoomScale >= 160) {
        majorStep = 2.0;
        minorStep = 0.5;
    } else if (zoomScale >= 80) {
        majorStep = 5.0;
        minorStep = 1.0;
    } else if (zoomScale >= 45) {
        majorStep = 10.0;
        minorStep = 2.0;
    } else {
        majorStep = 30.0;
        minorStep = 5.0;
    }

    const fragmentRuler = document.createDocumentFragment();
    for (let sec = 0; sec <= totalDuration + majorStep; sec = parseFloat((sec + minorStep).toFixed(3))) {
        const isMajor = Math.abs(sec % majorStep) < 0.001 || Math.abs((sec % majorStep) - majorStep) < 0.001;
        const leftPx = secondsToPixels(sec);

        const tick = document.createElement('div');
        tick.className = `ruler-tick ${isMajor ? 'major' : 'minor'}`;
        tick.style.left = `${leftPx}px`;
        fragmentRuler.appendChild(tick);

        if (isMajor) {
            const label = document.createElement('div');
            label.className = 'ruler-tick-label';
            label.style.left = `${leftPx}px`;
            label.textContent = formatRulerTime(sec);
            fragmentRuler.appendChild(label);
        }
    }
    ruler.appendChild(fragmentRuler);

    // 2. Multi-Lane Overlap Layout Calculation
    const sortedCaps = [...captionsData].sort((a, b) => a.start - b.start);
    const laneEnds = [];
    const clipLanes = new Map();

    sortedCaps.forEach(cap => {
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] > cap.start + 0.02) {
            lane++;
        }
        laneEnds[lane] = cap.end;
        clipLanes.set(cap.id, lane);
    });

    const maxLanes = Math.max(1, laneEnds.length);
    const laneHeight = 36;
    track.style.height = `${Math.max(48, maxLanes * laneHeight + 10)}px`;

    // 3. Render Clips across sub-lanes
    track.innerHTML = '';
    const fragmentClips = document.createDocumentFragment();

    captionsData.forEach((item, index) => {
        const laneIndex = clipLanes.get(item.id) || 0;
        const clip = document.createElement('div');
        clip.className = `timeline-clip ${item.id === activeCaptionId ? 'active' : ''} ${laneIndex > 0 ? 'lane-offset' : ''}`;
        clip.dataset.id = item.id;

        const leftPx = secondsToPixels(item.start);
        const widthPx = Math.max(22, secondsToPixels(item.end - item.start));
        const topPx = 4 + (laneIndex * laneHeight);

        clip.style.left = `${leftPx}px`;
        clip.style.width = `${widthPx}px`;
        clip.style.top = `${topPx}px`;
        clip.style.height = `${laneHeight - 4}px`;

        if (laneIndex > 0) {
            clip.classList.add('overlap-lane-clip');
        }

        clip.innerHTML = `
            <div class="trim-handle left-handle" data-id="${item.id}" data-edge="left" title="Drag to trim start time"></div>
            <div class="clip-content">
                <span class="clip-idx-tag">#${index + 1}</span>
                <span class="clip-text">${item.text || "(empty)"}</span>
            </div>
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
            const action = prompt(`Subtitle #${index + 1} Options:\n1: Split / Cut Line\n2: Delete Line\n3: Insert Line After`, "1");
            if (action === "1") {
                splitCaptionLine(item.id);
            } else if (action === "2") {
                deleteCaptionLine(item.id);
            } else if (action === "3") {
                addCaptionLine(item.id);
            }
        });

        fragmentClips.appendChild(clip);
    });

    track.appendChild(fragmentClips);
    updatePlayheadPosition();
}

let lastUserTimelineInteractionTime = 0;

function updatePlayheadPosition() {
    const { playhead, timecode, video } = getPlayheadNodes();
    if (!video || !playhead) return;

    const currTime = video.currentTime || 0;
    const leftPx = secondsToPixels(currTime);

    playhead.style.transform = `translate3d(${leftPx}px, 0, 0)`;

    // Auto-scroll timeline track horizontally to follow the playhead ONLY when video is actively playing
    // and user has not recently interacted with the scrollbar or timeline track (< 1500ms)
    const trackArea = document.getElementById('timelineTrackArea');
    const now = Date.now();
    const isUserActive = isScrubbingTimeline || isDraggingClip || isTrimmingClip || (now - lastUserTimelineInteractionTime < 1500);

    if (trackArea && video && !video.paused && !isUserActive) {
        const scrollLeft = trackArea.scrollLeft;
        const viewWidth = trackArea.clientWidth;
        if (leftPx > scrollLeft + viewWidth - 60 || leftPx < scrollLeft) {
            trackArea.scrollLeft = Math.max(0, leftPx - (viewWidth / 3));
        }
    }

    if (timecode) {
        const hrs = String(Math.floor(currTime / 3600)).padStart(2, '0');
        const mins = String(Math.floor((currTime % 3600) / 60)).padStart(2, '0');
        const secs = String(Math.floor(currTime % 60)).padStart(2, '0');
        const frames = String(Math.floor((currTime % 1) * 30)).padStart(2, '0');
        timecode.textContent = `${hrs}:${mins}:${secs}:${frames}`;
    }
}

function seekTimelineFromMouseEvent(e) {
    const trackArea = document.getElementById('timelineTrackArea');
    const { video } = getPlayheadNodes();
    if (!trackArea || !video) return;

    const rect = trackArea.getBoundingClientRect();
    const clickX = e.clientX - rect.left + trackArea.scrollLeft;
    const targetSec = Math.max(0, Math.min(video.duration || 60, pixelsToSeconds(clickX)));

    video.currentTime = targetSec;
    updatePlayheadPosition();

    if (typeof updatePlayerScrubber === 'function') updatePlayerScrubber();
    if (typeof updateTimeReadouts === 'function') updateTimeReadouts();
    if (typeof requestUpdateLiveSubtitleOverlay === 'function') requestUpdateLiveSubtitleOverlay();
}

function setZoomScaleWithAnchor(newScale, anchorTime = null) {
    const trackArea = document.getElementById('timelineTrackArea');
    const { video } = getPlayheadNodes();
    const zoomInput = document.getElementById('timelineZoom');
    const zoomVal = document.getElementById('zoomVal');

    const targetTime = (anchorTime !== null) ? anchorTime : (video ? (video.currentTime || 0) : 0);
    const viewWidth = trackArea ? trackArea.clientWidth : 800;

    zoomScale = Math.max(30, Math.min(1000, newScale));
    if (zoomInput) zoomInput.value = zoomScale;
    if (zoomVal) zoomVal.textContent = `${zoomScale}%`;

    renderTimelineTrack();

    if (trackArea) {
        const targetPx = secondsToPixels(targetTime);
        trackArea.scrollLeft = Math.max(0, targetPx - (viewWidth / 2));
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
            const targetVal = parseInt(e.target.value);
            const { video: vid } = getPlayheadNodes();
            setZoomScaleWithAnchor(targetVal, vid ? vid.currentTime : 0);
        });
    }

    if (trackArea) {
        // Track user scrolling to prevent glitching / fighting with auto-scroll
        trackArea.addEventListener('scroll', () => {
            lastUserTimelineInteractionTime = Date.now();
        }, { passive: true });

        // Wheel event: Ctrl/Cmd = Anchor-centered Smooth Zoom, Normal Wheel = Smooth Horizontal Scroll
        trackArea.addEventListener('wheel', (e) => {
            lastUserTimelineInteractionTime = Date.now();
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const rect = trackArea.getBoundingClientRect();
                const mouseOffsetPx = e.clientX - rect.left;
                const timeUnderCursor = pixelsToSeconds(trackArea.scrollLeft + mouseOffsetPx);

                const delta = e.deltaY > 0 ? -18 : 18;
                zoomScale = Math.max(30, Math.min(1000, zoomScale + delta));
                if (zoomInput) zoomInput.value = zoomScale;
                if (zoomVal) zoomVal.textContent = `${zoomScale}%`;

                renderTimelineTrack();

                const newScrollLeft = secondsToPixels(timeUnderCursor) - mouseOffsetPx;
                trackArea.scrollLeft = Math.max(0, newScrollLeft);
            } else {
                // Smooth horizontal scrolling on mouse wheel
                e.preventDefault();
                const scrollDelta = (Math.abs(e.deltaX) > Math.abs(e.deltaY)) ? e.deltaX : e.deltaY * 1.2;
                trackArea.scrollLeft += scrollDelta;
            }
        }, { passive: false });

        // Direct Click & Drag to Move Playhead anywhere on the timeline track background
        trackArea.addEventListener('mousedown', (e) => {
            if (e.target.closest('.timeline-clip') || e.target.closest('.trim-handle')) {
                return; // Clip dragging handles itself
            }
            // Check if clicking in the bottom scrollbar area (bottom 16px)
            const rect = trackArea.getBoundingClientRect();
            if (e.clientY > rect.bottom - 16) {
                lastUserTimelineInteractionTime = Date.now();
                return; // User is interacting with scrollbar
            }
            isScrubbingTimeline = true;
            lastUserTimelineInteractionTime = Date.now();
            seekTimelineFromMouseEvent(e);
        });
    }

    if (ruler) {
        ruler.addEventListener('mousedown', (e) => {
            isScrubbingTimeline = true;
            lastUserTimelineInteractionTime = Date.now();
            seekTimelineFromMouseEvent(e);
        });
    }

    let timelineMoveRaf = false;

    window.addEventListener('mousemove', (e) => {
        // 1. Scrubbing Playhead
        if (isScrubbingTimeline) {
            seekTimelineFromMouseEvent(e);
            return;
        }

        // 2. Dragging or Trimming Subtitle Clip
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
                if (typeof requestUpdateLiveSubtitleOverlay === 'function') requestUpdateLiveSubtitleOverlay();
                timelineMoveRaf = false;
            });
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingClip || isTrimmingClip) {
            if (typeof sortCaptionsChronologically === 'function') sortCaptionsChronologically();
            renderCaptionsList();
        }
        isScrubbingTimeline = false;
        isDraggingClip = false;
        isTrimmingClip = false;
        currentDraggedClipId = null;
        currentTrimEdge = null;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTimelineEvents();
});
