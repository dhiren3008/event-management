import { ICONS } from './icons.js';

// Small DOM helpers shared by the admin page scripts, so each page doesn't
// re-declare them. Pure builders — nothing here touches layout or state.

export function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
        el.className = className;
    }
    if (text !== undefined) {
        el.textContent = text;
    }
    return el;
}

export function createIcon(className, key) {
    const el = createEl('span', className);
    el.innerHTML = ICONS[key] || '';
    return el;
}

export function createIconText(tag, className, iconClass, iconKey, text) {
    const el = createEl(tag, className);
    el.append(createIcon(iconClass, iconKey), createEl('span', '', text));
    return el;
}

// A plain button. Kept tiny because every page builds them the same way.
export function createButton(className, text) {
    const btn = createEl('button', className, text);
    btn.type = 'button';
    return btn;
}

// ===== Dialog plumbing =====
// Every popup is a wrapper div (`.modal-overlay`, or `.event-popup-overlay`
// on the create-event / event-details previews) hidden with `.is-hidden`.
// These replace the four copies that used to live in events.js,
// event-details.js, create-event.js and user-form.js.

// Accepts an element or an element id — pages keep whichever they had.
function resolveEl(target) {
    return typeof target === 'string' ? document.getElementById(target) : target;
}

export function openOverlay(target) {
    const el = resolveEl(target);
    if (el) {
        el.classList.remove('is-hidden');
    }
}

export function closeOverlay(target) {
    const el = resolveEl(target);
    if (el) {
        el.classList.add('is-hidden');
    }
}

// `backdrop` is the overlay's own class: 'modal-overlay' everywhere, the
// 'event-popup-overlay' popups on the two event screens, and a
// comma-separated list on pages that show both. Bare names work as-is (a
// leading dot is added when building a selector), and so do real selectors.
function backdropParts(backdrop) {
    return backdrop.split(',').map((part) => {
        const trimmed = part.trim();
        return /^[.#[:]/.test(trimmed) ? trimmed : `.${trimmed}`;
    });
}

export function closeAllOverlays(backdrop = 'modal-overlay') {
    const selector = backdropParts(backdrop)
        .map((part) => `${part}:not(.is-hidden)`)
        .join(', ');

    document
        .querySelectorAll(selector)
        .forEach((el) => el.classList.add('is-hidden'));
}

// "×", "Cancel" ([data-close]), a click on the dimmed backdrop and the Escape
// key all just hide the overlay. Bind once per page, at module load.
export function bindOverlayClose(backdrop = 'modal-overlay') {
    const parts = backdropParts(backdrop);

    document.addEventListener('click', (event) => {
        const closer = event.target.closest('[data-close]');
        if (closer) {
            closeOverlay(closer.dataset.close);
        }
    });

    document.addEventListener('click', (event) => {
        if (parts.some((part) => event.target.matches(part))) {
            event.target.classList.add('is-hidden');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAllOverlays(backdrop);
        }
    });
}

// ===== Inline form messages (.form-message) =====
// One element (or id), one of the two modifier classes, visible.

export function showFormMessage(target, text, type = 'error') {
    const el = resolveEl(target);
    if (!el) {
        return;
    }
    el.textContent = text;
    el.classList.toggle('form-message--error', type === 'error');
    el.classList.toggle('form-message--success', type === 'success');
    el.classList.remove('is-hidden');
}

export function clearFormMessage(target) {
    const el = resolveEl(target);
    if (!el) {
        return;
    }
    el.textContent = '';
    el.classList.remove('form-message--error', 'form-message--success');
    el.classList.add('is-hidden');
}

// ===== Toast notifications =====
export function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = createEl('div', 'toast-container');
        container.id = 'toast-container';
        document.body.append(container);
    }

    const toast = createEl('div', `toast toast--${type}`);
    const icon = type === 'success' 
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    
    toast.innerHTML = `<span class="toast__icon">${icon}</span><span class="toast__msg">${message}</span>`;
    container.append(toast);

    setTimeout(() => {
        toast.classList.add('is-visible');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

