import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEventById, getBookingsByEvent, getBookingsByUser, createBooking } from '../core/api.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';
import { formatCurrency, isEventCancelled, isBookingCancelled, summariseBookings, isValidMobile } from '../core/utils.js';
import { showToast } from '../core/dom.js';

// Consistent image pool matching events.js and event-details.js
const IMAGE_POOL = [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
];

function getEventBanner(event) {
    if (event.image && event.image.trim()) {
        return event.image;
    }
    const index = (event.id || 0) % IMAGE_POOL.length;
    return IMAGE_POOL[index];
}

// 1. Setup modal close and keyboard handlers
function setupModalEvents(modal) {
    if (!modal) return;
    const closeBtn = modal.querySelector('#modal-close, .details-modal__close');

    const closeModal = () => modal.classList.add('is-hidden');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('is-hidden')) {
            closeModal();
        }
    });
}

// 2. Populate the Left Event Poster
function populatePoster(event) {
    const posterEl = document.getElementById('poster-card');
    const titleEl = document.getElementById('poster-title');
    const taglineEl = document.getElementById('poster-tagline');
    const venueEl = document.getElementById('poster-venue');
    const dateEl = document.getElementById('poster-date');
    const timeEl = document.getElementById('poster-time');

    if (posterEl) {
        const imgUrl = getEventBanner(event);
        posterEl.style.background = `linear-gradient(180deg, rgba(79, 35, 172, 0.85) 0%, rgba(20, 16, 32, 0.6) 100%), url('${imgUrl}') center/cover no-repeat`;
    }

    if (titleEl) titleEl.textContent = event.name;
    if (taglineEl) taglineEl.textContent = event.description || 'We are strong, because the journey demands it!';
    if (venueEl) venueEl.textContent = event.location || 'Trade Centre';
    if (dateEl) dateEl.textContent = formatDate(event.date);

    if (timeEl) {
        if (event.startTime && event.endTime) {
            timeEl.textContent = `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`;
        } else if (event.startTime) {
            timeEl.textContent = formatTime(event.startTime);
        } else {
            timeEl.textContent = '10:00 AM – 12:00 PM';
        }
    }
}

// 3. Pre-fill the form using the logged-in user's profile or restored draft
function populateMemberForm(user, eventId) {
    let draft = null;
    if (eventId) {
        try {
            const savedDraft = sessionStorage.getItem(`checkout_draft_${eventId}`);
            if (savedDraft) {
                draft = JSON.parse(savedDraft);
            }
        } catch (e) {
            console.warn('Failed to parse draft from sessionStorage:', e);
        }
    }

    const fullName = user.name || '';
    const nameParts = fullName.trim().split(/\s+/);
    const defaultFirstName = nameParts[0] || '';
    const defaultLastName = nameParts.slice(1).join(' ') || '';
    const defaultAddress = [user.address1, user.address2, user.city, user.state].filter(Boolean).join(', ') || user.location || '';
    const defaultPhone = user.mobile || '';
    const defaultEmail = user.email || '';
    const defaultSpouse = user.spouse || '';

    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');
    const addressInput = document.getElementById('address');
    const phoneInput = document.getElementById('phone');
    const emailInput = document.getElementById('email');
    const ticketTypeSelect = document.getElementById('ticketType');
    const spouseNameInput = document.getElementById('spouseName');
    const spouseMealSelect = document.getElementById('spouseMeal');
    const userMealSelect = document.getElementById('userMeal');

    if (firstNameInput) firstNameInput.value = draft?.firstName !== undefined ? draft.firstName : defaultFirstName;
    if (lastNameInput) lastNameInput.value = draft?.lastName !== undefined ? draft.lastName : defaultLastName;
    if (addressInput) addressInput.value = draft?.address !== undefined ? draft.address : defaultAddress;
    if (phoneInput) phoneInput.value = draft?.phone !== undefined ? draft.phone : defaultPhone;
    if (emailInput) emailInput.value = draft?.email !== undefined ? draft.email : defaultEmail;

    if (ticketTypeSelect && draft?.ticketType) {
        ticketTypeSelect.value = draft.ticketType;
    }

    if (spouseNameInput) spouseNameInput.value = draft?.spouseName !== undefined ? draft.spouseName : defaultSpouse;
    if (spouseMealSelect && draft?.spouseMeal) spouseMealSelect.value = draft.spouseMeal;
    if (userMealSelect && draft?.userMeal) userMealSelect.value = draft.userMeal;
}

// 4. Calculate prices based on ticket type
function calculatePricing(basePrice, ticketType) {
    let quantity = 1;
    let multiplier = 1;

    if (ticketType === 'Double') {
        quantity = 2;
        multiplier = 2;
    } else if (ticketType === 'VIP') {
        quantity = 1;
        multiplier = 1.5;
    } else {
        // Single
        quantity = 1;
        multiplier = 1;
    }

    const subtotal = Math.round(basePrice * multiplier);
    const total = subtotal;
    return { quantity, subtotal, total };
}

// 5. Update visibility of spouse fields based on ticket type & clear stale values
function updateSpouseFieldsVisibility(ticketType) {
    const isDouble = ticketType === 'Double';
    const spouseNameGroup = document.getElementById('field-spouse-name');
    const spouseMealGroup = document.getElementById('field-spouse-meal');
    const spouseNameInput = document.getElementById('spouseName');
    const spouseMealSelect = document.getElementById('spouseMeal');

    if (spouseNameGroup) spouseNameGroup.style.display = isDouble ? '' : 'none';
    if (spouseMealGroup) spouseMealGroup.style.display = isDouble ? '' : 'none';
    if (spouseNameInput) {
        spouseNameInput.required = isDouble;
        if (!isDouble) {
            spouseNameInput.value = '';
        }
    }
    if (spouseMealSelect && !isDouble) {
        spouseMealSelect.value = 'Non-Veg';
    }
}

// 6. Enforce booking window and event status
function checkEventEligibility(event) {
    const today = getTodayISO();

    if (isEventCancelled(event)) {
        return { ok: false, message: 'This event has been cancelled.' };
    }
    if (event.date && today > event.date) {
        return { ok: false, message: 'This event has already ended.' };
    }
    if (event.bookingStart && today < event.bookingStart) {
        return { ok: false, message: `Bookings open on ${formatDate(event.bookingStart)}.` };
    }
    if (event.bookingEnd && today > event.bookingEnd) {
        return { ok: false, message: 'Bookings for this event are closed.' };
    }
    return { ok: true };
}

// 7. Check if member already booked this event
async function checkExistingBooking(userId, eventId) {
    try {
        const bookings = await getBookingsByUser(userId);
        return bookings.find((b) => Number(b.eventId) === Number(eventId) && !isBookingCancelled(b));
    } catch {
        return null;
    }
}

// 8. Populate and open the breakdown modal
function openSummaryModal(modal, event, user, formData, pricing) {
    // Reset modal view states
    const headEl = document.getElementById('modal-head');
    const summaryView = document.getElementById('modal-summary-view');
    const loaderView = document.getElementById('modal-loader-view');
    const successView = document.getElementById('modal-success-view');

    if (headEl) headEl.style.display = '';
    if (summaryView) summaryView.classList.remove('is-hidden');
    if (loaderView) loaderView.classList.add('is-hidden');
    if (successView) successView.classList.add('is-hidden');

    const payNowBtn = document.getElementById('btn-pay-now');
    if (payNowBtn) {
        payNowBtn.disabled = false;
        payNowBtn.textContent = 'Pay Now';
    }

    document.getElementById('modal-date').textContent = `: ${formatDate(event.date)}`;
    document.getElementById('modal-time').textContent = `: ${event.startTime ? formatTime(event.startTime) : '10:00 AM'} Onwards`;
    document.getElementById('modal-venue').textContent = `: ${event.location || 'Trade Centre'}`;
    document.getElementById('modal-ticket-type').textContent = `: ${formData.ticketType}`;
    document.getElementById('modal-sponsor').textContent = `: ${user.systemIncharge || 'Test Sponsor'}`;
    document.getElementById('modal-tab-team').textContent = `: ${user.tabTeamName || 'NA'}`;
    document.getElementById('modal-system-incharge').textContent = `: ${user.systemIncharge || 'NA'}`;
    document.getElementById('modal-user-meal').textContent = `: ${formData.userMeal}`;

    const spouseRow = document.getElementById('modal-spouse-row');
    const spouseMealRow = document.getElementById('modal-spouse-meal-row');

    if (formData.ticketType === 'Double') {
        if (spouseRow) spouseRow.style.display = '';
        if (spouseMealRow) spouseMealRow.style.display = '';
        document.getElementById('modal-spouse-name').textContent = `: ${formData.spouseName || 'NA'}`;
        document.getElementById('modal-spouse-meal').textContent = `: ${formData.spouseMeal || 'Non-Veg'}`;
    } else {
        if (spouseRow) spouseRow.style.display = 'none';
        if (spouseMealRow) spouseMealRow.style.display = 'none';
    }

    document.getElementById('modal-user-id').textContent = `: ${formData.email || user.email}`;
    document.getElementById('modal-gst').textContent = `: ${user.gst || 'NA'}`;

    document.getElementById('modal-subtotal').textContent = `${pricing.subtotal}Rs.`;
    document.getElementById('modal-total').textContent = `${pricing.total}Rs.`;

    modal.classList.remove('is-hidden');
}

async function init() {
    const user = requireRole('member');
    if (!user) return;

    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');

    // Handle missing event ID gracefully
    if (!eventId) {
        showToast('No event specified.', 'error');
        setTimeout(() => window.location.replace('/pages/member/events.html'), 1500);
        return;
    }

    try {
        const [event, existingBooking] = await Promise.all([
            getEventById(eventId),
            checkExistingBooking(user.id, eventId),
        ]);

        if (!event) {
            showToast('Event not found.', 'error');
            setTimeout(() => window.location.replace('/pages/member/events.html'), 1500);
            return;
        }

        // 1. Enforce booking window & eligibility
        const eligibility = checkEventEligibility(event);
        if (!eligibility.ok) {
            showToast(eligibility.message, 'error');
            const proceedBtn = document.getElementById('btn-proceed');
            if (proceedBtn) {
                proceedBtn.disabled = true;
                proceedBtn.textContent = eligibility.message;
                proceedBtn.style.opacity = '0.6';
            }
        }

        // 2. Prevent duplicate booking
        if (existingBooking) {
            showToast('You have already booked tickets for this event.', 'error');
            const proceedBtn = document.getElementById('btn-proceed');
            if (proceedBtn) {
                proceedBtn.textContent = 'View My Ticket';
                proceedBtn.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = '/pages/member/tickets.html';
                };
            }
        }

        const basePrice = Number(event.price || 0);

        // Populate Left Poster & Preview Button
        populatePoster(event);
        const previewBtn = document.getElementById('btn-preview');
        if (previewBtn) {
            previewBtn.href = `/pages/member/check-details.html?id=${event.id}`;
            previewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const draft = {
                    firstName: document.getElementById('firstName')?.value.trim() || '',
                    lastName: document.getElementById('lastName')?.value.trim() || '',
                    address: document.getElementById('address')?.value.trim() || '',
                    phone: document.getElementById('phone')?.value.trim() || '',
                    email: document.getElementById('email')?.value.trim() || '',
                    ticketType: document.getElementById('ticketType')?.value || 'Single',
                    spouseName: document.getElementById('spouseName')?.value.trim() || '',
                    spouseMeal: document.getElementById('spouseMeal')?.value || 'Non-Veg',
                    userMeal: document.getElementById('userMeal')?.value || 'Non-Veg',
                };
                try {
                    sessionStorage.setItem(`checkout_draft_${event.id}`, JSON.stringify(draft));
                } catch (err) {
                    console.warn('Failed to save draft to sessionStorage:', err);
                }
                window.location.href = `/pages/member/check-details.html?id=${event.id}`;
            });
        }

        // Populate Attendee Form with user details (or restored draft)
        populateMemberForm(user, event.id);

        // Setup Ticket Type change handler
        const ticketTypeSelect = document.getElementById('ticketType');
        updateSpouseFieldsVisibility(ticketTypeSelect ? ticketTypeSelect.value : 'Single');

        if (ticketTypeSelect) {
            ticketTypeSelect.addEventListener('change', (e) => {
                updateSpouseFieldsVisibility(e.target.value);
            });
        }

        const modal = document.getElementById('check-details-modal');
        setupModalEvents(modal);

        const form = document.getElementById('attendee-form');
        const proceedBtn = document.getElementById('btn-proceed');
        const payNowBtn = document.getElementById('btn-pay-now');

        let currentPricing = calculatePricing(basePrice, ticketTypeSelect ? ticketTypeSelect.value : 'Single');
        let currentFormData = {};

        // When user clicks "Proceed to Pay"
        if (proceedBtn && !existingBooking && eligibility.ok) {
            proceedBtn.addEventListener('click', (e) => {
                e.preventDefault();

                if (!form.reportValidity()) {
                    return;
                }

                currentFormData = {
                    firstName: document.getElementById('firstName')?.value.trim() || '',
                    lastName: document.getElementById('lastName')?.value.trim() || '',
                    address: document.getElementById('address')?.value.trim() || '',
                    phone: document.getElementById('phone')?.value.trim() || '',
                    email: document.getElementById('email')?.value.trim() || '',
                    ticketType: document.getElementById('ticketType')?.value || 'Single',
                    spouseName: document.getElementById('spouseName')?.value.trim() || '',
                    spouseMeal: document.getElementById('spouseMeal')?.value || 'Non-Veg',
                    userMeal: document.getElementById('userMeal')?.value || 'Non-Veg',
                };

                if (!isValidMobile(currentFormData.phone)) {
                    showToast('Phone must be between 10 and 12 digits.', 'error');
                    document.getElementById('phone')?.focus();
                    return;
                }

                currentPricing = calculatePricing(basePrice, currentFormData.ticketType);
                openSummaryModal(modal, event, user, currentFormData, currentPricing);
            });
        }

        // When user clicks "Pay Now" inside the modal
        if (payNowBtn) {
            payNowBtn.addEventListener('click', async () => {
                const headEl = document.getElementById('modal-head');
                const summaryView = document.getElementById('modal-summary-view');
                const loaderView = document.getElementById('modal-loader-view');
                const successView = document.getElementById('modal-success-view');

                // Immediate double-click lockout
                if (payNowBtn.disabled) return;
                payNowBtn.disabled = true;

                try {
                    // Re-check booking window right before payment
                    const recheck = checkEventEligibility(event);
                    if (!recheck.ok) {
                        showToast(recheck.message, 'error');
                        modal.classList.add('is-hidden');
                        return;
                    }

                    // Prevent overselling: re-fetch fresh bookings immediately before creating
                    const freshBookings = await getBookingsByEvent(event.id);
                    const currentSold = summariseBookings(freshBookings).tickets;
                    const seatsLeft = Math.max(0, Number(event.capacity || 0) - currentSold);

                    if (seatsLeft < currentPricing.quantity) {
                        modal.classList.add('is-hidden');
                        showToast(
                            seatsLeft === 0
                                ? 'Sorry, this event is now sold out.'
                                : `Sorry, only ${seatsLeft} seat(s) remaining for this event.`,
                            'error'
                        );
                        return;
                    }

                    // Show loader view
                    if (headEl) headEl.style.display = 'none';
                    if (summaryView) summaryView.classList.add('is-hidden');
                    if (loaderView) loaderView.classList.remove('is-hidden');

                    const bookingPayload = {
                        eventId: Number(event.id),
                        userId: Number(user.id),
                        quantity: currentPricing.quantity,
                        amount: currentPricing.total,
                        ticketType: currentFormData.ticketType,
                        userMeal: currentFormData.userMeal,
                        spouseName: currentFormData.ticketType === 'Double' ? currentFormData.spouseName : '',
                        spouseMeal: currentFormData.ticketType === 'Double' ? currentFormData.spouseMeal : '',
                        status: 'confirmed',
                        bookedAt: getTodayISO(),
                    };

                    await Promise.all([
                        createBooking(bookingPayload),
                        new Promise((resolve) => setTimeout(resolve, 800)),
                    ]);

                    // Clear draft on successful payment
                    try {
                        sessionStorage.removeItem(`checkout_draft_${event.id}`);
                    } catch (e) {
                        console.warn('Failed to clear checkout draft:', e);
                    }

                    // Show confirmation
                    if (loaderView) loaderView.classList.add('is-hidden');
                    if (successView) successView.classList.remove('is-hidden');

                    setTimeout(() => {
                        window.location.replace('/pages/member/tickets.html');
                    }, 2000);

                } catch (saveErr) {
                    console.error('Failed to save booking:', saveErr);
                    showToast('There was an issue processing your booking. Please try again.', 'error');
                    if (headEl) headEl.style.display = '';
                    if (summaryView) summaryView.classList.remove('is-hidden');
                    if (loaderView) loaderView.classList.add('is-hidden');
                    payNowBtn.disabled = false;
                }
            });
        }

    } catch (err) {
        console.error('Failed to load event for booking:', err);
        showToast('Error loading event. Please try again.', 'error');
    }
}

init();
