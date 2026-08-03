/**
 * Captions Data State Manager, SRT Parser & Zero-Lag DOM Card Renderer
 */

let captionsData = [
    { id: "cap_1", start: 0.5, end: 3.5, text: "Welcome to Premiere Properties Subtitle Studio." },
    { id: "cap_2", start: 3.8, end: 7.0, text: "Automate your video subtitles with Essential Graphics." }
];

let activeCaptionId = null;

function parseSRTTime(timeStr) {
    const parts = timeStr.trim().replace(',', '.').split(':');
    if (parts.length < 3) return 0;
    const hrs = parseFloat(parts[0]);
    const mins = parseFloat(parts[1]);
    const secs = parseFloat(parts[2]);
    return (hrs * 3600) + (mins * 60) + secs;
}

function formatSRTTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function parseSRT(srtText) {
    const blocks = srtText.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
    const parsed = [];
    
    blocks.forEach((block, idx) => {
        const lines = block.split('\n');
        if (lines.length >= 2) {
            const timeLineIdx = lines[0].includes('-->') ? 0 : 1;
            if (lines[timeLineIdx] && lines[timeLineIdx].includes('-->')) {
                const [startStr, endStr] = lines[timeLineIdx].split('-->');
                const text = lines.slice(timeLineIdx + 1).join('\n').trim();
                parsed.push({
                    id: `cap_${Date.now()}_${idx}`,
                    start: parseSRTTime(startStr),
                    end: parseSRTTime(endStr),
                    text: text
                });
            }
        }
    });
    return parsed;
}

function renderCaptionsList() {
    const container = document.getElementById('captionsList');
    if (!container) return;

    container.innerHTML = '';

    captionsData.forEach((item, index) => {
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
                <button class="card-delete-btn" data-id="${item.id}" title="Delete Line">✖</button>
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
        const delBtn = card.querySelector('.card-delete-btn');

        startInput.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val)) {
                item.start = Math.max(0, val);
                if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            }
        });

        endInput.addEventListener('change', (e) => {
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
    captionsData = captionsData.filter(c => c.id !== id);
    if (activeCaptionId === id) activeCaptionId = null;
    renderCaptionsList();
    if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
    logExec(`Deleted caption line.`, 'warn');
}

function addCaptionLine() {
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
