/**
 * Adobe Premiere Pro 2024 Exact Mathematical Canvas Engine & Properties State Manager (v8.1.0)
 */

const styleState = {
    fontFamily: 'Century Gothic',
    fontStyle: 'Bold',
    fontSize: 75,
    tracking: 0,
    leading: 1.2,
    bold: true,
    italic: false,
    allCaps: false,
    smallCaps: false,
    underline: false,
    strikethrough: false,
    superscript: false,
    subscript: false,
    alignment: 'bottom-center',
    textAlign: 'center',
    posX: 0,
    posY: 444,
    fillEnabled: true,
    primaryColor: '#FFFFFF',
    primaryOpacity: 1.0,
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 3.0,
    strokeType: 'Outer',
    bgEnabled: false,
    bgColor: '#000000',
    bgOpacity: 0.0,
    bgPadding: 10,
    shadowEnabled: false,
    shadowColor: '#000000',
    shadowDistance: 4,
    shadowBlur: 4,
    shadowOffsetX: 2,
    shadowOffsetY: 2
};

let rafPending = false;
let domCache = null;

function getDomCache() {
    if (!domCache) {
        domCache = {
            overlay: document.getElementById('subtitleOverlay'),
            textBox: document.getElementById('subtitleTextBox'),
            container: document.getElementById('videoContainer'),
            video: document.getElementById('mainVideoPlayer')
        };
    }
    return domCache;
}

function hexToRgba(hex, opacity = 1.0) {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
        clean = clean.split('').map(c => c + c).join('');
    }
    const r = parseInt(clean.substring(0, 2), 16) || 255;
    const g = parseInt(clean.substring(2, 4), 16) || 255;
    const b = parseInt(clean.substring(4, 6), 16) || 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function applyPresetStyle(presetKey) {
    if (presetKey === 'pop_yellow') {
        styleState.fontFamily = 'Montserrat';
        styleState.fontStyle = 'Black';
        styleState.fontSize = 75;
        styleState.primaryColor = '#FFDE00';
        styleState.strokeEnabled = true;
        styleState.strokeColor = '#000000';
        styleState.strokeWidth = 4.0;
        styleState.bgEnabled = false;
        styleState.shadowEnabled = true;
        styleState.shadowColor = '#000000';
    } else if (presetKey === 'classic_white') {
        styleState.fontFamily = 'Century Gothic';
        styleState.fontStyle = 'Bold';
        styleState.fontSize = 75;
        styleState.primaryColor = '#FFFFFF';
        styleState.strokeEnabled = true;
        styleState.strokeColor = '#000000';
        styleState.strokeWidth = 3.0;
        styleState.bgEnabled = false;
        styleState.shadowEnabled = false;
    } else if (presetKey === 'neon_pink') {
        styleState.fontFamily = 'Poppins';
        styleState.fontStyle = 'Bold';
        styleState.fontSize = 75;
        styleState.primaryColor = '#FF007F';
        styleState.strokeEnabled = true;
        styleState.strokeColor = '#00F3FF';
        styleState.strokeWidth = 3.0;
        styleState.bgEnabled = false;
        styleState.shadowEnabled = true;
        styleState.shadowColor = '#00F3FF';
    } else if (presetKey === 'podcast_pill') {
        styleState.fontFamily = 'Inter';
        styleState.fontStyle = 'Regular';
        styleState.fontSize = 65;
        styleState.primaryColor = '#FFFFFF';
        styleState.strokeEnabled = false;
        styleState.bgEnabled = true;
        styleState.bgColor = '#000000';
        styleState.bgOpacity = 0.65;
        styleState.bgPadding = 12;
        styleState.shadowEnabled = false;
    } else if (presetKey === 'viral_green') {
        styleState.fontFamily = 'Poppins';
        styleState.fontStyle = 'Bold';
        styleState.fontSize = 75;
        styleState.primaryColor = '#22C55E';
        styleState.strokeEnabled = true;
        styleState.strokeColor = '#000000';
        styleState.strokeWidth = 3.5;
        styleState.bgEnabled = false;
        styleState.shadowEnabled = true;
        styleState.shadowColor = '#000000';
    } else if (presetKey === 'cinematic_gold') {
        styleState.fontFamily = 'Montserrat';
        styleState.fontStyle = 'Bold';
        styleState.fontSize = 72;
        styleState.primaryColor = '#FCD34D';
        styleState.strokeEnabled = true;
        styleState.strokeColor = '#000000';
        styleState.strokeWidth = 3.0;
        styleState.bgEnabled = false;
        styleState.shadowEnabled = true;
        styleState.shadowColor = '#000000';
    }

    syncUiControlsWithState();
    requestApplyStyling();
    logExec(`Applied preset style across all captions: ${presetKey}`, "info");
}

function resetPosition() {
    styleState.alignment = 'bottom-center';
    styleState.posX = 0;
    styleState.posY = 444;

    const posXInput = document.getElementById('posXInput');
    const posYInput = document.getElementById('posYInput');
    if (posXInput) posXInput.value = 0;
    if (posYInput) posYInput.value = 444;

    const alignBtns = document.querySelectorAll('.btn-align');
    alignBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === 'bottom-center');
    });

    requestApplyStyling();
    logExec("Reset subtitle position to default bottom-center (X: 0, Y: 444).", "info");
}

function syncUiControlsWithState() {
    const fontSelect = document.getElementById('fontFamilySelect');
    if (fontSelect) fontSelect.value = styleState.fontFamily;

    const fontStyleSelect = document.getElementById('fontStyleSelect');
    if (fontStyleSelect) fontStyleSelect.value = styleState.fontStyle;

    const sizeSlider = document.getElementById('fontSizeSlider');
    const sizeValText = document.getElementById('fontSizeVal');
    if (sizeSlider) sizeSlider.value = styleState.fontSize;
    if (sizeValText) sizeValText.textContent = `${styleState.fontSize}.0 px`;

    const primaryColor = document.getElementById('primaryColorInput');
    if (primaryColor) primaryColor.value = styleState.primaryColor;

    const strokeToggle = document.getElementById('strokeToggle');
    if (strokeToggle) strokeToggle.checked = styleState.strokeEnabled;

    const strokeColor = document.getElementById('strokeColorInput');
    if (strokeColor) strokeColor.value = styleState.strokeColor;

    const strokeWidth = document.getElementById('strokeWidthInput');
    if (strokeWidth) strokeWidth.value = styleState.strokeWidth;

    const bgToggle = document.getElementById('bgToggle');
    if (bgToggle) bgToggle.checked = styleState.bgEnabled;

    const bgColor = document.getElementById('bgColorInput');
    if (bgColor) bgColor.value = styleState.bgColor;

    const bgOpacity = document.getElementById('bgOpacityInput');
    if (bgOpacity) bgOpacity.value = styleState.bgOpacity;

    const shadowToggle = document.getElementById('shadowToggle');
    if (shadowToggle) shadowToggle.checked = styleState.shadowEnabled;
}

function requestApplyStyling() {
    if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
            applyStyling();
            rafPending = false;
        });
    }
}

function applyElementStyle(targetEl, slotIndex = 0) {
    const { container, video } = getDomCache();
    if (!targetEl || !container) return;

    // Detect Sequence Aspect Ratio (Default 1080x1920 for vertical video, 1920x1080 for horizontal)
    let refWidth = 1080.0;
    let refHeight = 1920.0;
    if (video && video.videoWidth && video.videoHeight) {
        if (video.videoWidth > video.videoHeight) {
            refWidth = 1920.0;
            refHeight = 1080.0;
        } else if (video.videoWidth === video.videoHeight) {
            refWidth = 1080.0;
            refHeight = 1080.0;
        }
    }

    const containerW = container.clientWidth || 360;
    const containerH = container.clientHeight || 640;

    // Font Size Scaling Math relative to Sequence Reference Height (1920px vertical / 1080px horizontal)
    const scaleFactorHeight = containerH / refHeight;
    const scaledFontSize = Math.round(styleState.fontSize * scaleFactorHeight);
    targetEl.style.fontSize = `${Math.max(12, scaledFontSize)}px`;

    // Ensure single horizontal line text display with proper whitespace handling
    const currentText = targetEl.innerText || "";
    if (currentText.includes('\n')) {
        targetEl.style.whiteSpace = 'pre-wrap';
    } else {
        targetEl.style.whiteSpace = 'nowrap';
    }

    // Exact Adobe Premiere Pro / Center Origin Transform Anchoring with Collision Slot Offsets
    const scaleX = containerW / refWidth;
    const scaleY = containerH / refHeight;
    const posXVal = (styleState.posX !== null && !isNaN(styleState.posX)) ? styleState.posX : 0;
    const posYVal = (styleState.posY !== null && !isNaN(styleState.posY)) ? styleState.posY : 444;

    const offsetX = Math.round(posXVal * scaleX);
    const offsetY = Math.round(posYVal * scaleY);

    const shiftDirection = posYVal >= 0 ? -1 : 1; // Shift upwards if in bottom half, downwards if in top
    const scaledStroke = (styleState.strokeEnabled && styleState.strokeWidth > 0) ? Math.max(1, Math.round(styleState.strokeWidth * (containerH / 1080.0))) : 0;
    const slotSpacing = Math.round(scaledFontSize * 1.35 + (scaledStroke * 2));
    const finalOffsetY = offsetY + (slotIndex * shiftDirection * slotSpacing);

    targetEl.style.position = 'absolute';
    targetEl.style.left = '50%';
    targetEl.style.top = '50%';
    targetEl.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${finalOffsetY}px))`;

    // Typography & Paragraph Alignment
    targetEl.style.fontFamily = `"${styleState.fontFamily}", "Century Gothic", "Poppins", sans-serif`;
    targetEl.style.letterSpacing = `${styleState.tracking * scaleFactorHeight}px`;
    targetEl.style.lineHeight = `${styleState.leading}`;
    targetEl.style.textAlign = styleState.textAlign || 'center';

    // Fill Color
    if (styleState.fillEnabled) {
        targetEl.style.color = hexToRgba(styleState.primaryColor, styleState.primaryOpacity);
    } else {
        targetEl.style.color = 'transparent';
    }

    // Faux Formatting & Font Styles
    const fontStyleLower = (styleState.fontStyle || "").toLowerCase();
    const isBoldStyle = styleState.bold || fontStyleLower === 'bold' || fontStyleLower === 'black';
    const isItalicStyle = styleState.italic || fontStyleLower === 'italic';

    targetEl.style.fontWeight = isBoldStyle ? (fontStyleLower === 'black' ? '900' : '700') : '400';
    targetEl.style.fontStyle = isItalicStyle ? 'italic' : 'normal';
    targetEl.style.textTransform = styleState.allCaps ? 'uppercase' : (styleState.smallCaps ? 'capitalize' : 'none');

    let textDecoration = [];
    if (styleState.underline) textDecoration.push('underline');
    if (styleState.strikethrough) textDecoration.push('line-through');
    targetEl.style.textDecoration = textDecoration.length > 0 ? textDecoration.join(' ') : 'none';

    // Stroke / Webkit Text Stroke (Outer Stroke order)
    if (styleState.strokeEnabled && styleState.strokeWidth > 0) {
        targetEl.style.paintOrder = 'stroke fill';
        targetEl.style.webkitTextStroke = `${scaledStroke}px ${styleState.strokeColor}`;
    } else {
        targetEl.style.webkitTextStroke = '0px transparent';
    }

    // Background Box
    if (styleState.bgEnabled && styleState.bgOpacity > 0) {
        targetEl.style.backgroundColor = hexToRgba(styleState.bgColor, styleState.bgOpacity);
        const scaledPadding = Math.round(styleState.bgPadding * scaleFactorHeight);
        targetEl.style.padding = `${scaledPadding}px`;
        targetEl.style.borderRadius = '4px';
    } else {
        targetEl.style.backgroundColor = 'transparent';
        targetEl.style.padding = '0px';
    }

    // Drop Shadow (Exact match to Premiere Pro shadow status)
    if (styleState.shadowEnabled) {
        const shadowDist = styleState.shadowDistance * scaleFactorHeight;
        const shadowBlur = styleState.shadowBlur * scaleFactorHeight;
        const shadowRgba = hexToRgba(styleState.shadowColor, 0.7);
        targetEl.style.textShadow = `${shadowDist}px ${shadowDist}px ${shadowBlur}px ${shadowRgba}`;
    } else {
        targetEl.style.textShadow = 'none';
    }
}

function applyStyling() {
    const { overlay, textBox } = getDomCache();
    if (!overlay || !textBox) return;

    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    
    // Apply style to base text box (Slot 0)
    applyElementStyle(textBox, 0);

    // Apply style to any multi-caption overlay elements
    const extraBoxes = overlay.querySelectorAll('.multi-subtitle-item');
    extraBoxes.forEach(box => {
        const slot = parseInt(box.dataset.slot || "0");
        applyElementStyle(box, slot);
    });
}

function initAccordions() {
    const headers = document.querySelectorAll('.pp-accordion-header');
    headers.forEach(hdr => {
        hdr.addEventListener('click', () => {
            const group = hdr.parentElement;
            if (group) group.classList.toggle('collapsed');
        });
    });
}

function initPropertiesListeners() {
    initAccordions();

    const btnResetPos = document.getElementById('btnResetPos');
    if (btnResetPos) {
        btnResetPos.addEventListener('click', resetPosition);
    }

    const presetBtns = document.querySelectorAll('.btn-preset');
    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyPresetStyle(btn.dataset.preset);
        });
    });

    const sizeSlider = document.getElementById('fontSizeSlider');
    const sizeInput = document.getElementById('fontSizeInput');
    const sizeValText = document.getElementById('fontSizeVal');
    if (sizeSlider) {
        sizeSlider.value = styleState.fontSize;
        if (sizeValText) sizeValText.textContent = `${styleState.fontSize}.0 px`;
        sizeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            if (sizeInput) sizeInput.value = val;
            if (sizeValText) sizeValText.textContent = `${val}.0 px`;
            styleState.fontSize = val;
            requestApplyStyling();
        });
    }

    const activeSubInput = document.getElementById('activeSubTextInput');
    if (activeSubInput) {
        activeSubInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });

        activeSubInput.addEventListener('input', (e) => {
            const val = e.target.value;
            const textBox = document.getElementById('subtitleTextBox');
            if (textBox) textBox.innerText = val;

            const video = document.getElementById('mainVideoPlayer');
            const activeCap = getActiveCaptionForTime(video ? video.currentTime : 0);
            if (activeCap) {
                activeCap.text = val;
                if (typeof renderCaptionsList === 'function') renderCaptionsList();
                if (typeof renderTimelineTrack === 'function') renderTimelineTrack();
            }
        });
    }

    const bindings = [
        { id: 'fontFamilySelect', prop: 'fontFamily' },
        { id: 'fontStyleSelect', prop: 'fontStyle' },
        { id: 'trackingInput', prop: 'tracking', isNum: true },
        { id: 'leadingInput', prop: 'leading', isFloat: true },
        { id: 'primaryColorInput', prop: 'primaryColor' },
        { id: 'primaryOpacityInput', prop: 'primaryOpacity', isFloat: true },
        { id: 'strokeColorInput', prop: 'strokeColor' },
        { id: 'strokeWidthInput', prop: 'strokeWidth', isFloat: true },
        { id: 'strokeTypeSelect', prop: 'strokeType' },
        { id: 'bgColorInput', prop: 'bgColor' },
        { id: 'bgOpacityInput', prop: 'bgOpacity', isFloat: true },
        { id: 'bgPaddingInput', prop: 'bgPadding', isNum: true },
        { id: 'shadowColorInput', prop: 'shadowColor' },
        { id: 'shadowDistanceInput', prop: 'shadowDistance', isNum: true },
        { id: 'shadowBlurInput', prop: 'shadowBlur', isNum: true }
    ];

    bindings.forEach(b => {
        const elem = document.getElementById(b.id);
        if (elem) {
            const evtType = (elem.type === 'range' || elem.type === 'color') ? 'input' : 'change';
            elem.addEventListener(evtType, (e) => {
                let val = e.target.value;
                if (b.isNum) val = parseInt(val) || 0;
                if (b.isFloat) val = parseFloat(val) || 0.0;
                styleState[b.prop] = val;
                requestApplyStyling();
            });
        }
    });

    const toggleBindings = [
        { id: 'fillToggle', prop: 'fillEnabled' },
        { id: 'strokeToggle', prop: 'strokeEnabled' },
        { id: 'bgToggle', prop: 'bgEnabled' },
        { id: 'shadowToggle', prop: 'shadowEnabled' }
    ];

    toggleBindings.forEach(t => {
        const chk = document.getElementById(t.id);
        if (chk) {
            chk.addEventListener('change', (e) => {
                styleState[t.prop] = e.target.checked;
                requestApplyStyling();
            });
        }
    });

    const posXInput = document.getElementById('posXInput');
    const posYInput = document.getElementById('posYInput');
    if (posXInput) posXInput.value = styleState.posX;
    if (posYInput) posYInput.value = styleState.posY;

    if (posXInput) {
        posXInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            styleState.posX = val === "" ? 0 : parseInt(val);
            requestApplyStyling();
        });
    }

    if (posYInput) {
        posYInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            styleState.posY = val === "" ? 0 : parseInt(val);
            requestApplyStyling();
        });
    }

    const paraBtns = document.querySelectorAll('.btn-para-align');
    paraBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            paraBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            styleState.textAlign = btn.dataset.align;

            // When Center paragraph alignment is selected, ensure horizontal center alignment (X = 0)
            if (btn.dataset.align === 'center') {
                styleState.posX = 0;
                if (posXInput) posXInput.value = 0;
            }

            requestApplyStyling();
            logExec(`Paragraph text alignment set to: ${styleState.textAlign} (Applied across all captions)`, "info");
        });
    });

    const fauxMap = [
        { id: 'btnFauxBold', prop: 'bold' },
        { id: 'btnFauxItalic', prop: 'italic' },
        { id: 'btnFauxAllCaps', prop: 'allCaps' },
        { id: 'btnFauxSmallCaps', prop: 'smallCaps' },
        { id: 'btnFauxUnderline', prop: 'underline' },
        { id: 'btnFauxStrikethrough', prop: 'strikethrough' },
        { id: 'btnFauxSuperscript', prop: 'superscript' },
        { id: 'btnFauxSubscript', prop: 'subscript' }
    ];

    fauxMap.forEach(f => {
        const btn = document.getElementById(f.id);
        if (btn) {
            btn.addEventListener('click', () => {
                styleState[f.prop] = !styleState[f.prop];
                btn.classList.toggle('active', styleState[f.prop]);
                requestApplyStyling();
            });
        }
    });

    const alignPositions = {
        'top-left': { posX: -350, posY: -440 },
        'top-center': { posX: 0, posY: -440 },
        'top-right': { posX: 350, posY: -440 },
        'middle-left': { posX: -350, posY: 0 },
        'center': { posX: 0, posY: 0 },
        'middle-right': { posX: 350, posY: 0 },
        'bottom-left': { posX: -350, posY: 444 },
        'bottom-center': { posX: 0, posY: 444 },
        'bottom-right': { posX: 350, posY: 444 }
    };

    const alignBtns = document.querySelectorAll('.btn-align');
    alignBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            alignBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const alignKey = btn.dataset.align;
            styleState.alignment = alignKey;

            const targetPos = alignPositions[alignKey] || { posX: 0, posY: 444 };
            styleState.posX = targetPos.posX;
            styleState.posY = targetPos.posY;

            if (posXInput) posXInput.value = styleState.posX;
            if (posYInput) posYInput.value = styleState.posY;

            requestApplyStyling();
            logExec(`Set subtitle alignment to ${alignKey} (X: ${styleState.posX}, Y: ${styleState.posY})`, "info");
        });
    });

    // Program Monitor Direct Interactive On-Screen Subtitle Dragging
    const textBox = document.getElementById('subtitleTextBox');
    const container = document.getElementById('videoContainer');
    if (textBox && container) {
        let isDraggingSub = false;
        let dragStartMouseX = 0;
        let dragStartMouseY = 0;
        let dragStartPosX = 0;
        let dragStartPosY = 0;

        textBox.addEventListener('mousedown', (e) => {
            if (textBox.contentEditable === "true") return;
            isDraggingSub = true;
            dragStartMouseX = e.clientX;
            dragStartMouseY = e.clientY;
            dragStartPosX = styleState.posX || 0;
            dragStartPosY = styleState.posY || 0;
            e.stopPropagation();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingSub) return;
            const refWidth = 1080.0;
            const refHeight = 1920.0;
            const containerW = container.clientWidth || 360;
            const containerH = container.clientHeight || 640;

            const scaleX = containerW / refWidth;
            const scaleY = containerH / refHeight;

            const deltaMouseX = e.clientX - dragStartMouseX;
            const deltaMouseY = e.clientY - dragStartMouseY;

            const newPosX = Math.round(dragStartPosX + (deltaMouseX / (scaleX || 1)));
            const newPosY = Math.round(dragStartPosY + (deltaMouseY / (scaleY || 1)));

            styleState.posX = newPosX;
            styleState.posY = newPosY;

            if (posXInput) posXInput.value = newPosX;
            if (posYInput) posYInput.value = newPosY;

            requestApplyStyling();
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingSub) {
                isDraggingSub = false;
                logExec(`Position updated: X=${styleState.posX}, Y=${styleState.posY}`, "info");
            }
        });
    }

    if (container && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
            requestApplyStyling();
        });
        ro.observe(container);
    }

    window.addEventListener('resize', requestApplyStyling);

    applyStyling();
}

document.addEventListener('DOMContentLoaded', initPropertiesListeners);
