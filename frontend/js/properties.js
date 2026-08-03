/**
 * Essential Graphics Property Controls & Subtitle CSS Overlay Applier
 */

const styleState = {
    fontFamily: 'Montserrat',
    fontSize: 48,
    tracking: 0,
    leading: 1.2,
    bold: false,
    italic: false,
    allCaps: false,
    smallCaps: false,
    underline: false,
    strikethrough: false,
    subscript: false,
    alignment: 'bottom-center',
    primaryColor: '#FFFFFF',
    primaryOpacity: 1.0,
    strokeWidth: 2,
    strokeColor: '#000000',
    bgPadding: 10,
    bgColor: '#000000',
    bgOpacity: 0.0,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOffsetX: 2,
    shadowOffsetY: 2
};

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

function applyStyling() {
    const overlay = document.getElementById('subtitleOverlay');
    const textBox = document.getElementById('subtitleTextBox');
    if (!overlay || !textBox) return;

    // Alignment Matrix Flex Placement
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
            overlay.style.justifyContent = 'flex-content';
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

    // Text Properties
    textBox.style.fontFamily = `"${styleState.fontFamily}", sans-serif`;
    textBox.style.fontSize = `${styleState.fontSize}px`;
    textBox.style.letterSpacing = `${styleState.tracking}px`;
    textBox.style.lineHeight = `${styleState.leading}`;
    textBox.style.color = hexToRgba(styleState.primaryColor, styleState.primaryOpacity);

    // Faux Formatting
    textBox.style.fontWeight = styleState.bold ? '800' : '400';
    textBox.style.fontStyle = styleState.italic ? 'italic' : 'normal';
    textBox.style.textTransform = styleState.allCaps ? 'uppercase' : (styleState.smallCaps ? 'capitalize' : 'none');

    let textDecoration = [];
    if (styleState.underline) textDecoration.push('underline');
    if (styleState.strikethrough) textDecoration.push('line-through');
    textBox.style.textDecoration = textDecoration.length > 0 ? textDecoration.join(' ') : 'none';

    // Stroke / Webkit Text Stroke
    if (styleState.strokeWidth > 0) {
        textBox.style.webkitTextStroke = `${styleState.strokeWidth}px ${styleState.strokeColor}`;
    } else {
        textBox.style.webkitTextStroke = '0px transparent';
    }

    // Background Box
    if (styleState.bgOpacity > 0) {
        textBox.style.backgroundColor = hexToRgba(styleState.bgColor, styleState.bgOpacity);
        textBox.style.padding = `${styleState.bgPadding}px`;
    } else {
        textBox.style.backgroundColor = 'transparent';
        textBox.style.padding = '0px';
    }

    // Drop Shadow
    if (styleState.shadowOffsetX !== 0 || styleState.shadowOffsetY !== 0 || styleState.shadowBlur > 0) {
        const shadowRgba = hexToRgba(styleState.shadowColor, 0.7);
        textBox.style.textShadow = `${styleState.shadowOffsetX}px ${styleState.shadowOffsetY}px ${styleState.shadowBlur}px ${shadowRgba}`;
    } else {
        textBox.style.textShadow = 'none';
    }
}

function initPropertiesListeners() {
    // Inputs mapping
    const bindings = [
        { id: 'fontFamilySelect', prop: 'fontFamily' },
        { id: 'fontSizeInput', prop: 'fontSize', isNum: true },
        { id: 'trackingInput', prop: 'tracking', isNum: true },
        { id: 'leadingInput', prop: 'leading', isFloat: true },
        { id: 'primaryColorInput', prop: 'primaryColor' },
        { id: 'primaryOpacityInput', prop: 'primaryOpacity', isFloat: true },
        { id: 'strokeWidthInput', prop: 'strokeWidth', isNum: true },
        { id: 'strokeColorInput', prop: 'strokeColor' },
        { id: 'bgPaddingInput', prop: 'bgPadding', isNum: true },
        { id: 'bgColorInput', prop: 'bgColor' },
        { id: 'bgOpacityInput', prop: 'bgOpacity', isFloat: true },
        { id: 'shadowColorInput', prop: 'shadowColor' },
        { id: 'shadowBlurInput', prop: 'shadowBlur', isNum: true },
        { id: 'shadowOffsetXInput', prop: 'shadowOffsetX', isNum: true },
        { id: 'shadowOffsetYInput', prop: 'shadowOffsetY', isNum: true }
    ];

    bindings.forEach(b => {
        const elem = document.getElementById(b.id);
        if (elem) {
            const evtType = (elem.type === 'range' || elem.type === 'color' || elem.tagName === 'TEXTAREA') ? 'input' : 'change';
            elem.addEventListener(evtType, (e) => {
                let val = e.target.value;
                if (b.isNum) val = parseInt(val) || 0;
                if (b.isFloat) val = parseFloat(val) || 0.0;
                styleState[b.prop] = val;
                applyStyling();
            });
        }
    });

    // 7 Faux Toggle Buttons
    const fauxMap = [
        { id: 'btnFauxBold', prop: 'bold' },
        { id: 'btnFauxItalic', prop: 'italic' },
        { id: 'btnFauxAllCaps', prop: 'allCaps' },
        { id: 'btnFauxSmallCaps', prop: 'smallCaps' },
        { id: 'btnFauxUnderline', prop: 'underline' },
        { id: 'btnFauxStrikethrough', prop: 'strikethrough' },
        { id: 'btnFauxSubscript', prop: 'subscript' }
    ];

    fauxMap.forEach(f => {
        const btn = document.getElementById(f.id);
        if (btn) {
            btn.addEventListener('click', () => {
                styleState[f.prop] = !styleState[f.prop];
                btn.classList.toggle('active', styleState[f.prop]);
                applyStyling();
            });
        }
    });

    // 3x3 Alignment Buttons Grid
    const alignBtns = document.querySelectorAll('.btn-align');
    alignBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            alignBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            styleState.alignment = btn.dataset.align;
            applyStyling();
        });
    });

    applyStyling();
}

document.addEventListener('DOMContentLoaded', initPropertiesListeners);
