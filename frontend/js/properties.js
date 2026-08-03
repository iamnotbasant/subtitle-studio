/**
 * Pixel-Perfect Premiere Pro Essential Graphics State Manager, Segmented Tabs & 60fps Overlay Scaling Engine
 */

const styleState = {
    fontFamily: 'Montserrat',
    fontStyle: 'Bold',
    fontSize: 48,
    tracking: 0,
    leading: 1.2,
    bold: false,
    italic: false,
    allCaps: false,
    smallCaps: false,
    underline: false,
    strikethrough: false,
    superscript: false,
    subscript: false,
    alignment: 'bottom-center',
    textAlign: 'center',
    posX: null,
    posY: null,
    fillEnabled: true,
    primaryColor: '#FFFFFF',
    primaryOpacity: 1.0,
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 2,
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

    // 3x3 Canvas Zone Alignment Placement
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
    textBox.style.fontFamily = `"${styleState.fontFamily}", sans-serif`;
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

    textBox.style.fontWeight = isBoldStyle ? (fontStyleLower === 'black' ? '900' : '800') : '400';
    textBox.style.fontStyle = isItalicStyle ? 'italic' : 'normal';
    textBox.style.textTransform = styleState.allCaps ? 'uppercase' : (styleState.smallCaps ? 'capitalize' : 'none');

    let textDecoration = [];
    if (styleState.underline) textDecoration.push('underline');
    if (styleState.strikethrough) textDecoration.push('line-through');
    textBox.style.textDecoration = textDecoration.length > 0 ? textDecoration.join(' ') : 'none';

    // Stroke / Webkit Text Stroke
    if (styleState.strokeEnabled && styleState.strokeWidth > 0) {
        const scaledStroke = Math.max(1, Math.round(styleState.strokeWidth * scaleFactor));
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
        textBox.style.textShadow = 'none';
    }
}

function initSegmentedTabs() {
    const tabBtns = document.querySelectorAll('.segmented-tabs .tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.dataset.tab;
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

function initPropertiesListeners() {
    initSegmentedTabs();

    const sizeSlider = document.getElementById('fontSizeSlider');
    const sizeInput = document.getElementById('fontSizeInput');
    if (sizeSlider && sizeInput) {
        sizeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            sizeInput.value = val;
            styleState.fontSize = val;
            requestApplyStyling();
        });

        sizeInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value) || 12;
            sizeSlider.value = val;
            styleState.fontSize = val;
            requestApplyStyling();
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
        { id: 'strokeWidthInput', prop: 'strokeWidth', isNum: true },
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
