/**
 * Diagnostic Console Logger Utility
 */

function getTimestampString() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    return `[${hrs}:${mins}:${secs}]`;
}

function logExec(message, type = 'info') {
    const consoleBox = document.getElementById('execConsoleBox');
    if (!consoleBox) return;

    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `${getTimestampString()} ${message}`;

    consoleBox.appendChild(line);
    consoleBox.scrollTop = consoleBox.scrollHeight;
}

function clearExecConsole() {
    const consoleBox = document.getElementById('execConsoleBox');
    if (consoleBox) {
        consoleBox.innerHTML = '';
        logExec('Console cleared.', 'info');
    }
}

function copyExecConsole() {
    const consoleBox = document.getElementById('execConsoleBox');
    if (!consoleBox) return;

    const text = consoleBox.innerText;
    navigator.clipboard.writeText(text).then(() => {
        logExec('Console logs copied to clipboard!', 'success');
    }).catch(err => {
        logExec(`Failed to copy console: ${err}`, 'error');
    });
}

// Event Listeners initialization
document.addEventListener('DOMContentLoaded', () => {
    const btnClear = document.getElementById('btnClearConsole');
    const btnCopy = document.getElementById('btnCopyConsole');

    if (btnClear) btnClear.addEventListener('click', clearExecConsole);
    if (btnCopy) btnCopy.addEventListener('click', copyExecConsole);
});
