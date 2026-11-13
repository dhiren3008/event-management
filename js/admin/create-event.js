import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { createEvent, updateEvent, getEventById, getBookingsByEvent } from '../core/api.js';
import { getTodayISO } from '../core/date.js';
import { getIdParam, goToPage } from '../core/nav.js';
import { isEmpty, summariseBookings } from '../core/utils.js';
import { showFormMessage, clearFormMessage } from '../core/dom.js';

// Create Event — and Edit Event when the page is opened as ?id=N.
// Pattern used across the admin section: read fields -> validate -> API
// call -> message -> redirect. The markup lives in pages/admin/create-event.html.

const EVENTS_PAGE = '/pages/admin/events.html';
const DETAILS_PAGE = '/pages/admin/event-details.html';

// Present only in edit mode.
const editingId = getIdParam();

// Set to true when the event could not be loaded; Cancel must skip event-details.
let formLocked = false;

// Inputs that can show an inline error, in DOM order — the first entry of
// `errors` in this order is the field that gets focused after a bad submit.
const ERROR_FIELDS = [
    'event-name',
    'event-start-date',
    'event-end-date',
    'booking-start-date',
    'booking-end-date',
    'event-start-time',
    'event-end-time',
    'event-price',
    'event-capacity',
    'event-location',
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Edits must not wipe a stored file name when no new file is chosen (the
// browser will not let script prefill a file input).
let existingImage = '';

// ===== Reading + validation =====

function fieldValue(id) {
    return document.getElementById(id).value.trim();
}

function readForm() {
    const files = document.getElementById('event-files').files;
    return {
        name: fieldValue('event-name'),
        description: fieldValue('event-description'),
        date: fieldValue('event-start-date'),
        endDate: fieldValue('event-end-date'),
        bookingStart: fieldValue('booking-start-date'),
        bookingEnd: fieldValue('booking-end-date'),
        startTime: fieldValue('event-start-time'),
        endTime: fieldValue('event-end-time'),
        price: fieldValue('event-price'),
        capacity: fieldValue('event-capacity'),
        location: fieldValue('event-location'),
        // json-server cannot store uploads, so only the first file's name is kept.
        image: files.length > 0 ? files[0].name : existingImage,
    };
}

export function validateEventForm(values, minCapacity = 1, isEditing = false) {
    const errors = {};
    const isDate = (value) => ISO_DATE_PATTERN.test(value);
    const today = getTodayISO();

    if (isEmpty(values.name)) {
        errors['event-name'] = 'Event name is required.';
    }

    if (isEmpty(values.date)) {
        errors['event-start-date'] = 'Start date is required.';
    } else if (!isDate(values.date)) {
        errors['event-start-date'] = 'Pick a valid date.';
    } else if (!isEditing && values.date < today) {
        errors['event-start-date'] = 'Event start date cannot be in the past.';
    }

    if (isEmpty(values.endDate)) {
        errors['event-end-date'] = 'End date is required.';
    } else if (!isDate(values.endDate)) {
        errors['event-end-date'] = 'Pick a valid date.';
    } else if (isDate(values.date) && values.endDate < values.date) {
        errors['event-end-date'] = 'End date can\u2019t be before the start date.';
    }

    if (isEmpty(values.bookingStart)) {
        errors['booking-start-date'] = 'Booking start date is required.';
    } else if (!isDate(values.bookingStart)) {
        errors['booking-start-date'] = 'Pick a valid date.';
    }

    if (isEmpty(values.bookingEnd)) {
        errors['booking-end-date'] = 'Booking end date is required.';
    } else if (!isDate(values.bookingEnd)) {
        errors['booking-end-date'] = 'Pick a valid date.';
    } else if (isDate(values.bookingStart) && values.bookingEnd < values.bookingStart) {
        errors['booking-end-date'] = 'Booking can\u2019t close before it opens.';
    } else if (isDate(values.date) && values.bookingEnd > values.date) {
        errors['booking-end-date'] = 'Booking must close on or before the event starts.';
    } else if (!isEditing && values.bookingEnd < today) {
        errors['booking-end-date'] = 'Booking close date cannot be in the past.';
    }

    if (isEmpty(values.startTime)) {
        errors['event-start-time'] = 'Start time is required.';
    }

    if (isEmpty(values.endTime)) {
        errors['event-end-time'] = 'End time is required.';
    } else if (
        !isEmpty(values.startTime) &&
        values.date &&
        values.endDate &&
        values.date === values.endDate &&
        values.endTime <= values.startTime
    ) {
        errors['event-end-time'] = 'End time must be after start time on the same day.';
    }

    const price = Number(values.price);
    if (isEmpty(values.price)) {
        errors['event-price'] = 'Price is required.';
    } else if (!Number.isInteger(price) || price <= 0) {
        errors['event-price'] = 'Price must be a whole number greater than 0.';
    }

    const capacity = Number(values.capacity);
    if (isEmpty(values.capacity)) {
        errors['event-capacity'] = 'Capacity is required.';
    } else if (!Number.isInteger(capacity) || capacity <= 0) {
        errors['event-capacity'] = 'Capacity must be a whole number of 1 or more.';
    } else if (minCapacity > 0 && capacity < minCapacity) {
        errors['event-capacity'] = `Capacity cannot be lower than ${minCapacity} seats already booked.`;
    }

    if (isEmpty(values.location)) {
        errors['event-location'] = 'Location is required.';
    }

    return errors;
}

// An empty object clears every inline error.
function showErrors(errors) {
    ERROR_FIELDS.forEach((id) => {
        const message = errors[id] || '';
        const input = document.getElementById(id);
        const span = document.getElementById(`error-${id}`);
        input.classList.toggle('input--error', Boolean(message));
        span.textContent = message;
        span.classList.toggle('is-hidden', !message);
    });

    const first = ERROR_FIELDS.find((id) => errors[id]);
    if (first) {
        document.getElementById(first).focus();
    }
}

function buildPayload(values) {
    return {
        name: values.name,
        description: values.description,
        date: values.date,
        endDate: values.endDate,
        bookingStart: values.bookingStart,
        bookingEnd: values.bookingEnd,
        startTime: values.startTime,
        endTime: values.endTime,
        price: Number(values.price),
        capacity: Number(values.capacity),
        location: values.location,
        image: values.image,
    };
}

// ===== Submit =====

async function submitForm() {
    const button = document.getElementById('submit-create');
    if (button.disabled) {
        return;
    }

    clearFormMessage('create-message');
    showErrors({});

    const values = readForm();

    let minCapacity = 1;
    if (editingId) {
        try {
            const bookings = await getBookingsByEvent(editingId);
            const { tickets } = summariseBookings(bookings);
            minCapacity = tickets;
        } catch (error) {
            console.error('Failed to fetch bookings for capacity validation:', error);
        }
    }

    const errors = validateEventForm(values, minCapacity, Boolean(editingId));
    if (Object.keys(errors).length > 0) {
        showErrors(errors);
        showFormMessage('create-message', 'Please fix the highlighted fields.', 'error');
        return;
    }

    const idleLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving\u2026';

    try {
        if (editingId) {
            await updateEvent(editingId, buildPayload(values));
        } else {
            await createEvent({
                ...buildPayload(values),
                createdAt: getTodayISO(),
                status: 'active',
                cancelledAt: null,
            });
        }
        // The list page picks the ?notice up and shows the confirmation.
        window.location.href = `${EVENTS_PAGE}?notice=${editingId ? 'updated' : 'created'}`;
    } catch (error) {
        console.error(error);
        showFormMessage('create-message', 'Could not save the event. Please try again.', 'error');
        button.disabled = false;
        button.textContent = idleLabel;
    }
}

// ===== Edit mode: prefill + swap the page chrome =====

function prefill(event) {
    const setValue = (id, value) => {
        document.getElementById(id).value = value === undefined || value === null ? '' : value;
    };

    setValue('event-name', event.name);
    setValue('event-description', event.description);
    setValue('event-start-date', event.date);
    setValue('event-end-date', event.endDate);
    setValue('booking-start-date', event.bookingStart);
    setValue('booking-end-date', event.bookingEnd);
    setValue('event-start-time', event.startTime);
    setValue('event-end-time', event.endTime);
    setValue('event-price', event.price);
    setValue('event-capacity', event.capacity);
    setValue('event-location', event.location);

    existingImage = event.image || '';
    if (existingImage) {
        const text = document.getElementById('file-text');
        text.textContent = existingImage;
        text.classList.remove('create-event__file-text');
    }

    document.getElementById('create-heading').textContent = 'Edit Event';
    document.getElementById('submit-create').textContent = 'Save Changes';
    document.title = 'Edit Event | Infinite Success Events';
}

function lockForm(message) {
    formLocked = true;
    showFormMessage('create-message', message, 'error');
    document.getElementById('submit-create').disabled = true;
}

// ===== Buttons =====

document.getElementById('submit-create').addEventListener('click', submitForm);

document.getElementById('cancel-create').addEventListener('click', () => {
    // If the form is locked (event load failed) always go back to the list —
    // navigating to event-details.html with an unknown id shows another error page.
    if (editingId && !formLocked) {
        goToPage(DETAILS_PAGE, editingId);
    } else {
        window.location.href = EVENTS_PAGE;
    }
});

// Enter inside a text field must submit the form using the same function as the button.
document.getElementById('create-event-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitForm();
});

// Fixing a field clears its own inline error while typing.
ERROR_FIELDS.forEach((id) => {
    document.getElementById(id).addEventListener('input', () => {
        const input = document.getElementById(id);
        if (!input.classList.contains('input--error')) {
            return;
        }
        input.classList.remove('input--error');
        const span = document.getElementById(`error-${id}`);
        span.textContent = '';
        span.classList.add('is-hidden');
    });
});

// ===== Upload field (file name preview only — no file leaves the browser) =====

document.getElementById('event-files').addEventListener('change', (event) => {
    const files = event.target.files;
    const text = document.getElementById('file-text');

    if (files.length === 0) {
        text.textContent = existingImage || 'Add Files';
        if (!existingImage) {
            text.classList.add('create-event__file-text');
        }
    } else if (files.length === 1) {
        text.textContent = files[0].name;
        text.classList.remove('create-event__file-text');
    } else {
        text.textContent = `${files.length} files selected`;
        text.classList.remove('create-event__file-text');
    }
});

// ===== Entry point =====

async function init() {
    const user = requireRole('admin');
    if (!user) {
        return;
    }

    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    if (!editingId) {
        return;
    }

    try {
        const event = await getEventById(editingId);
        if (!event) {
            lockForm('That event could not be found.');
            return;
        }
        prefill(event);
    } catch (error) {
        console.error(error);
        lockForm('Could not load that event. Please try again.');
    }
}

init();
