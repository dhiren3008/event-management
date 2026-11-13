import { ROLE_MENU, LOGIN_PAGE, PROFILE_PAGE } from './config.js';
import { clearUser } from './auth.js';
import { ICONS } from './icons.js';

function getInitials(name) {
    const words = name.trim().split(/\s+/);
    const first = words[0] ? words[0][0] : '';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase();
}

function buildMenuItem(item, activeKey) {
    const isActive = item.key === activeKey;
    const activeClass = isActive ? ' is-active' : '';
    const icon = ICONS[item.icon] || '';
    const content = `${icon}<span class="sidebar__label">${item.label}</span>`;

    if (item.disabled) {
        return `<span class="sidebar__link is-disabled" aria-disabled="true" title="Coming soon">${content}</span>`;
    }

    if (item.action) {
        return `<button type="button" class="sidebar__link${activeClass}" data-action="${item.action}">${content}</button>`;
    }

    const current = isActive ? ' aria-current="page"' : '';
    return `<a class="sidebar__link${activeClass}" href="${item.href}"${current}>${content}</a>`;
}

function buildMenu(role, activeKey) {
    const items = ROLE_MENU[role] || [];
    return items.map((item) => buildMenuItem(item, activeKey)).join('');
}

function buildShell(role, activeKey) {
    return `
        <div class="layout">
            <div class="layout__overlay"></div>
            <aside class="sidebar">
                <img class="sidebar__logo" src="/assets/images/Logo.png" alt="Infinite Success Events">
                <p class="sidebar__heading">Menu</p>
                <nav class="sidebar__nav">${buildMenu(role, activeKey)}</nav>
            </aside>
            <div class="layout__main">
                <header class="topbar">
                    <button type="button" class="topbar__menu-button" aria-label="Open menu">${ICONS.menu}</button>
                    <div class="topbar__heading">
                        <h1 class="topbar__title"></h1>
                        <p class="topbar__subtitle"></p>
                    </div>
                    <div class="topbar__actions">
                        <label class="search">
                            ${ICONS.search}
                            <input class="search__input" type="search" placeholder="Search" aria-label="Search">
                        </label>
                        <button type="button" class="icon-button" aria-label="Messages">${ICONS.message}</button>
                        <button type="button" class="icon-button" aria-label="Notifications">${ICONS.bell}</button>
                        ${role === 'admin' || role === 'member' || role === 'verifier'
                            ? '<button type="button" class="avatar avatar--button" aria-label="Profile details" title="Profile details"></button>'
                            : '<div class="avatar"></div>'}
                    </div>
                </header>
                <main class="layout__content"></main>
            </div>
        </div>

        <div class="modal-overlay is-hidden" id="logout-overlay">
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="logout-title">
                <div class="modal__head">
                    <h2 class="modal__title" id="logout-title">Log out</h2>
                    <button type="button" class="modal__close" data-close="logout-overlay" aria-label="Close">&times;</button>
                </div>
                <div class="modal__body">
                    <p class="modal__text">Are you sure you want to log out?</p>
                    <div class="modal__actions">
                        <button type="button" class="btn btn--outline" data-close="logout-overlay">Cancel</button>
                        <button type="button" class="btn btn--primary" data-confirm-logout>Log out</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===== Logout confirmation dialog =====
// Delegated once at module load (same pattern as js/admin/user-form.js):
// "×", "Cancel", a backdrop click and Escape all just hide #logout-overlay.

document.addEventListener('click', (event) => {
    const overlay = event.target.closest('#logout-overlay');
    if (!overlay) {
        return;
    }
    if (event.target === overlay || event.target.closest('[data-close]')) {
        overlay.classList.add('is-hidden');
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        document.getElementById('logout-overlay')?.classList.add('is-hidden');
    }
});

function bindEvents(root, role) {
    const layout = root.querySelector('.layout');

    // Sidebar "Log out" opens the confirmation dialog instead of clearing
    // the session right away — this is the guard against accidental taps.
    root.querySelector('.sidebar__nav').addEventListener('click', (event) => {
        if (event.target.closest('[data-action="logout"]')) {
            document.getElementById('logout-overlay').classList.remove('is-hidden');
        }
    });

    root.querySelector('[data-confirm-logout]')?.addEventListener('click', () => {
        clearUser();
        window.location.replace(LOGIN_PAGE);
    });

    root.querySelector('.topbar__menu-button').addEventListener('click', () => {
        layout.classList.add('is-menu-open');
    });

    root.querySelector('.layout__overlay').addEventListener('click', () => {
        layout.classList.remove('is-menu-open');
    });

    // Topbar avatar opens the profile sheet (admin, member, or verifier).
    root.querySelector('.avatar--button')?.addEventListener('click', () => {
        if (role === 'member') {
            window.location.href = '/pages/member/profile.html';
        } else if (role === 'verifier') {
            window.location.href = '/pages/verifier/profile.html';
        } else {
            window.location.href = PROFILE_PAGE;
        }
    });
}

export function renderLayout({ user, activeKey, title, subtitle, titleAccent = '' }) {
    const root = document.getElementById('app');

    // Page files can ship their own static markup inside #app. Capture it
    // before the shell overwrites the element, then nest it into the shell's
    // content area. With an empty #app nothing is captured, so roles whose
    // pages stay script-rendered build exactly the same tree as before.
    const pageContent = [...root.children];

    root.innerHTML = buildShell(user.role, activeKey);

    const contentEl = root.querySelector('.layout__content');
    pageContent.forEach((el) => contentEl.append(el));

    const titleEl = root.querySelector('.topbar__title');
    const subtitleEl = root.querySelector('.topbar__subtitle');
    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;

    const avatarEl = root.querySelector('.avatar');
    const displayName = user.name || user.email || '';
    avatarEl.textContent = getInitials(displayName);
    if (avatarEl.tagName === 'BUTTON') {
        // Actionable avatar (admin & member): keep the label describing the click.
        avatarEl.setAttribute('aria-label', `Profile details — ${displayName}`);
        avatarEl.setAttribute('title', `Profile details — ${displayName}`);
    } else {
        avatarEl.setAttribute('aria-label', displayName);
        avatarEl.setAttribute('title', displayName);
    }

    bindEvents(root, user.role);

    if (titleAccent) {
        const accentEl = document.createElement('span');
        accentEl.className = 'topbar__accent';
        accentEl.textContent = titleAccent;
        titleEl.append(' ', accentEl);
    }

    return {
        contentEl,
        titleEl,
        subtitleEl,
    };
}

function isPhoneInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const type = (el.getAttribute('type') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    return type === 'tel' || id.includes('phone') || id.includes('mobile') || name.includes('phone') || name.includes('mobile');
}

document.addEventListener('keydown', (e) => {
    if (isPhoneInput(e.target)) {
        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/^\d$/.test(e.key)) {
            e.preventDefault();
        }
    }
});

document.addEventListener('input', (e) => {
    if (isPhoneInput(e.target)) {
        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 12);
        if (e.target.value !== cleaned) {
            e.target.value = cleaned;
        }
    }
});

document.addEventListener('focusin', (e) => {
    if (isPhoneInput(e.target)) {
        if (!e.target.hasAttribute('minlength')) e.target.setAttribute('minlength', '10');
        if (!e.target.hasAttribute('maxlength') || e.target.getAttribute('maxlength') === '10') {
            e.target.setAttribute('maxlength', '12');
        }
        if (!e.target.hasAttribute('pattern')) e.target.setAttribute('pattern', '[0-9]{10,12}');
        if (!e.target.hasAttribute('inputmode')) e.target.setAttribute('inputmode', 'numeric');
    }
});
