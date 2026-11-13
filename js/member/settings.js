import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';

export const MEMBER_PROFILE_PAGE = '/pages/member/profile.html';

export function setupSettingsNavigation() {
    const rows = document.querySelectorAll('.settings-row');
    rows.forEach((row, index) => {
        row.addEventListener('click', () => {
            rows.forEach((r) => r.classList.remove('is-active'));
            row.classList.add('is-active');

            if (index === 0 || row.id === 'btn-profile-row' || row.dataset.action === 'profile') {
                window.location.href = MEMBER_PROFILE_PAGE;
            }
        });
    });
}

function init() {
    const user = requireRole('member');
    if (!user) {
        return;
    }

    renderLayout({
        user,
        activeKey: 'settings',
        title: '',
        subtitle: '',
    });

    // The settings page does not have searchable content; hide the unconnected topbar search.
    const searchEl = document.querySelector('.search');
    if (searchEl) {
        searchEl.classList.add('is-hidden');
    }

    setupSettingsNavigation();
}

init();

