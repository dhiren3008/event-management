// Page-to-page navigation that carries a record id.

export function getIdParam(name = 'id') {
    const value = new URLSearchParams(window.location.search).get(name);
    return value === null ? null : value.trim();
}

export function hasIdParam(name = 'id') {
    return getIdParam(name) !== null;
}

export function goToPage(path, id) {
    const query = id === undefined || id === null || id === ''
        ? ''
        : `?id=${encodeURIComponent(id)}`;
    window.location.href = `${path}${query}`;
}

export function buildPageUrl(path, id) {
    const query = id === undefined || id === null || id === ''
        ? ''
        : `?id=${encodeURIComponent(id)}`;
    return `${path}${query}`;
}
