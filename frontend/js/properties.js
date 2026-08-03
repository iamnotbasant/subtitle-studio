/**
 * Pixel-Perfect Premiere Pro 2024 Essential Graphics & Presets State Manager
 */

const styleState = {
    fontFamily: 'Century Gothic',
    fontStyle: 'Bold',
    fontSize: 48,
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
    posX: -3,
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
            container: document.getElementById('videoContainer')
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
        styleState.fontSize = 54;
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
        styleState.fontSize = 48;
        styleState.primaryColor = '#FFFFFF';
        styleState.strokeEnabled = true;
        styleState.strokeColor = '#000000';
        styleState.strokeWidth = 3.0;
        styleState.bgEnabled = false;
        styleState.shadowEnabled = false;
    } else if (presetKey === 'neon_pink') {
        styleState.fontFamily = 'Poppins';
        styleState.fontStyle = 'Bold';
        styleState.fontSize = 52;
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
        styleState.fontSize = 44;
        styleState.primaryColor = '#FFFFFF';
        styleState.strokeEnabled = false;
        styleState.bgEnabled = true;
        styleState.bgColor = '#000000';
        styleState.bgOpacity = 0.65;
        styleState.bgPadding = 12;
        styleState.shadowEnabled = false;
    }

    syncUiControlsWithState();
    requestApplyStyling();
    logExec(`Applied preset style: ${presetKey}`, "info");
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

function applyStyling() {
    const { overlay, textBox, container } = getDomCache();
    if (!overlay || !textBox || !container) return;

    const containerHeight = container.clientHeight || 720;
    const scaleFactor = Math.max(0.3, containerHeight / 1080.0);

    if (styleState.posX !== null && styleState.posY !== null && !isNaN(styleState.posX) && !isNaN(styleState.posY)) {
        overlay.style.alignItems = 'flex-start';
        overlay.style.justifyContent = 'flex-start';
        textBox.style.position = 'absolute';
        textBox.style.left = `${styleState.posX * scaleFactor}px`;
        textBox.style.top = `${styleState.posY * scaleFactor}px`;
    } else {
        textBox.style.position = 'relative';
        textBox.style.left = 'auto';
        textBox.style.top = 'auto';
        
        switch (styleState.alignment) {
            case 'top-left':
                overlay.style.alignItems = 'flex-start';
                overlay.style.justifyContent = 'flex-start';
                break;
            case 'top-center':
                overlay.style.alignItems = 'flex-start';
                overlay.style.justifyContent = 'center';
                break;
            case 'top-right':
                overlay.style.alignItems = 'flex-start';
                overlay.style.justifyContent = 'flex-end';
                break;
            case 'middle-left':
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'flex-start';
                break;
            case 'center':
            case 'middle-center':
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                break;
            case 'middle-right':
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'flex-end';
                break;
            case 'bottom-left':
                overlay.style.alignItems = 'flex-end';
                overlay.style.justifyContent = 'flex-start';
                break;
            case 'bottom-right':
                overlay.style.alignItems = 'flex-end';
                overlay.style.justifyContent = 'flex-end';
                break;
            case 'bottom-center':
            default:
                overlay.style.alignItems = 'flex-end';
                overlay.style.justifyContent = 'center';
                break;
        }
    }

    // Typography
    textBox.style.fontFamily = `"${styleState.fontFamily}", "Montserrat", sans-serif`;
    const scaledFontSize = Math.round(styleState.fontSize * scaleFactor);
    textBox.style.fontSize = `${Math.max(12, scaledFontSize)}px`;
    textBox.style.letterSpacing = `${styleState.tracking * scaleFactor}px`;
    textBox.style.lineHeight = `${styleState.leading}`;
    textBox.style.textAlign = styleState.textAlign;

    // Fill Color
    if (styleState.fillEnabled) {
        textBox.style.color = hexToRgba(styleState.primaryColor, styleState.primaryOpacity);
    } else {
        textBox.style.color = 'transparent';
    }

    // Faux Formatting & Font Styles
    const fontStyleLower = styleState.fontStyle.toLowerCase();
    const isBoldStyle = styleState.bold || fontStyleLower === 'bold' || fontStyleLower === 'black';
    const isItalicStyle = styleState.italic || fontStyleLower === 'italic';

    textBox.style.fontWeight = isBoldStyle ? (fontStyleLower === 'black' ? '900' : '700') : '400';
    textBox.style.fontStyle = isItalicStyle ? 'italic' : 'normal';
    textBox.style.textTransform = styleState.allCaps ? 'uppercase' : (styleState.smallCaps ? 'capitalize' : 'none');

    let textDecoration = [];
    if (styleState.underline) textDecoration.push('underline');
    if (styleState.strikethrough) textDecoration.push('line-through');
    textBox.style.textDecoration = textDecoration.length > 0 ? textDecoration.join(' ') : 'none';

    // Stroke / Webkit Text Stroke (Outer Stroke order)
    if (styleState.strokeEnabled && styleState.strokeWidth > 0) {
        const scaledStroke = Math.max(1, Math.round(styleState.strokeWidth * scaleFactor));
        textBox.style.paintOrder = 'stroke fill';
        textBox.style.webkitTextStroke = `${scaledStroke}px ${styleState.strokeColor}`;
    } else {
        textBox.style.webkitTextStroke = '0px transparent';
    }

    // Background Box
    if (styleState.bgEnabled && styleState.bgOpacity > 0) {
        textBox.style.backgroundColor = hexToRgba(styleState.bgColor, styleState.bgOpacity);
        const scaledPadding = Math.round(styleState.bgPadding * scaleFactor);
        textBox.style.padding = `${scaledPadding}px`;
        textBox.style.borderRadius = '4px';
    } else {
        textBox.style.backgroundColor = 'transparent';
        textBox.style.padding = '0px';
    }

    // Drop Shadow
    if (styleState.shadowEnabled) {
        const shadowDist = styleState.shadowDistance * scaleFactor;
        const shadowBlur = styleState.shadowBlur * scaleFactor;
        const shadowRgba = hexToRgba(styleState.shadowColor, 0.7);
        textBox.style.textShadow = `${shadowDist}px ${shadowDist}px ${shadowBlur}px ${shadowRgba}`;
    } else {
        textBox.style.textShadow = `0px ${2 * scaleFactor}px ${4 * scaleFactor}px rgba(0,0,0,0.8)`;
    }
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

    if (posXInput) {
        posXInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            styleState.posX = val === "" ? null : parseInt(val);
            requestApplyStyling();
        });
    }

    if (posYInput) {
        posYInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            styleState.posY = val === "" ? null : parseInt(val);
            requestApplyStyling();
        });
    }

    const paraBtns = document.querySelectorAll('.btn-para-align');
    paraBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            paraBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            styleState.textAlign = btn.dataset.align;
            requestApplyStyling();
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

    const alignBtns = document.querySelectorAll('.btn-align');
    alignBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            alignBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            styleState.alignment = btn.dataset.align;
            styleState.posX = null;
            styleState.posY = null;
            if (posXInput) posXInput.value = "";
            if (posYInput) posYInput.value = "";
            requestApplyStyling();
        });
    });

    window.addEventListener('resize', requestApplyStyling);

    applyStyling();
}

document.addEventListener('DOMContentLoaded', initPropertiesListeners);
