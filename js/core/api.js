import { API_BASE } from "./config.js";

// Shared helper: fetch a path, return the parsed json.
// `options` is passed straight to fetch (method/headers/body for writes).

async function request(path, options) {
    const response = await fetch(`${API_BASE}${path}`, options);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error('Invalid JSON response');
    }
}

function post(path, body) {
    return request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function patch(path, body) {
    return request(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function del(path) {
    return request(path, { method: 'DELETE' });
}

// Login / account lookups.

// Login check. Distinguishes "wrong password" from "account disabled" so the
// page can say which one it is — the status switch in User Management used to
// be cosmetic, because nothing here looked at `status`.

export async function authenticateUser(email, password) {
    const users = await request(`/users?email=${encodeURIComponent(email)}`);
    const user = users[0];

    if (!user || user.password !== password) {
        return { ok: false, reason: 'invalid' };
    }
    if (user.status === false) {
        return { ok: false, reason: 'disabled' };
    }
    return { ok: true, user };
}

export async function findUserByEmail(email) {
    const users = await request(`/users?email=${encodeURIComponent(email)}`);
    return users[0] || null;
}

// Mobile tab: returns the user with this mobile number, otherwise null.

export async function findUserByMobile(mobile) {
    const users = await request(`/users?mobile=${encodeURIComponent(mobile)}`);
    return users[0] || null;
}

// Lists: return every record of a collection.

export function getEvents() {
    return request('/events');
}

export function getBookings() {
    return request('/bookings');
}

export function getUsers() {
    return request('/users');
}

export function getBookingsByUser(userId) {
    return request(`/bookings?userId=${encodeURIComponent(userId)}`);
}

export function getBookingsByEvent(eventId) {
    return request(`/bookings?eventId=${encodeURIComponent(eventId)}`);
}

// Single records: json-server answers 404 for a missing id and request()
// throws on any non-OK status, which would force every page into a
// try/catch just to say "not found". Filtering returns [] instead, so these
// resolve to null — one ordinary value a page can branch on.

export async function getUserById(id) {
    const users = await request(`/users?id=${encodeURIComponent(id)}`);
    return users[0] || null;
}

export async function getEventById(id) {
    const events = await request(`/events?id=${encodeURIComponent(id)}`);
    return events[0] || null;
}

// Writes.

export function createBooking(booking) {
    return post('/bookings', booking);
}

export function updateBooking(id, changes) {
    return patch(`/bookings/${encodeURIComponent(id)}`, changes);
}

export function deleteBooking(id) {
    return del(`/bookings/${encodeURIComponent(id)}`);
}

// User writes (creation, profile edits, password reset, removal).

export function createUser(user) {
    return post('/users', user);
}

export function updateUser(id, changes) {
    return patch(`/users/${encodeURIComponent(id)}`, changes);
}

export function deleteUser(id) {
    return del(`/users/${encodeURIComponent(id)}`);
}

// Event writes.

export function createEvent(event) {
    return post('/events', event);
}

export function updateEvent(id, changes) {
    return patch(`/events/${encodeURIComponent(id)}`, changes);
}

export function deleteEvent(id) {
    return del(`/events/${encodeURIComponent(id)}`);
}

// Event Management: which members are assigned as ticket verifiers.

export function getAssignments() {
    return request('/assignments');
}

export function createAssignment(assignment) {
    return post('/assignments', assignment);
}

export function updateAssignment(id, changes) {
    return patch(`/assignments/${encodeURIComponent(id)}`, changes);
}

export function deleteAssignment(id) {
    return del(`/assignments/${encodeURIComponent(id)}`);
}
