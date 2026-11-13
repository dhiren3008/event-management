import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEventById, getBookingsByEvent, getBookingsByUser, createBooking } from '../core/api.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';
import { formatCurrency, isEventCancelled, isBookingCancelled, summariseBookings, isValidMobile } from '../core/utils.js';
import { showToast } from '../core/dom.js';

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
        quantity = 1;
        multiplier = 1;
    }

    const subtotal = Math.round(basePrice * multiplier);
    const total = subtotal;
    return { quantity, subtotal, total };
}

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

async function checkExistingBooking(userId, eventId) {
    try {
        const bookings = await getBookingsByUser(userId);
        return bookings.find((b) => Number(b.eventId) === Number(eventId) && !isBookingCancelled(b));
    } catch {
        return null;
    }
}

function populateReviewData(draft, user) {
    const firstName = draft.firstName || (user.name || '').trim().split(/\s+/)[0] || '';
    const lastName = draft.lastName || (user.name || '').trim().split(/\s+/).slice(1).join(' ') || '';
    const fullAddress = draft.address || [user.address1, user.address2, user.city, user.state].filter(Boolean).join(', ') || user.location || '';
    const phone = draft.phone || user.mobile || '';
    const email = draft.email || user.email || '';
    const ticketType = draft.ticketType || 'Single';
    const spouseName = draft.spouseName || user.spouse || '';
    const spouseMeal = draft.spouseMeal || 'Non-Veg';
    const userMeal = draft.userMeal || user.mealPreference || 'Non-Veg';

    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '-';
    };

    setText('review-first-name', firstName);
    setText('review-last-name', lastName);
    setText('review-address', fullAddress);
    setText('review-phone', phone);
    setText('review-email', email);
    setText('review-ticket-type', ticketType);
    setText('review-user-meal', userMeal);

    const spouseNameItem = document.getElementById('review-spouse-name-item');
    const spouseMealItem = document.getElementById('review-spouse-meal-item');

    if (ticketType === 'Double') {
        if (spouseNameItem) spouseNameItem.style.display = '';
        if (spouseMealItem) spouseMealItem.style.display = '';
        setText('review-spouse-name', spouseName || 'NA');
        setText('review-spouse-meal', spouseMeal);
    } else {
        if (spouseNameItem) spouseNameItem.style.display = 'none';
        if (spouseMealItem) spouseMealItem.style.display = 'none';
    }

    return {
        firstName,
        lastName,
        address: fullAddress,
        phone,
        email,
        ticketType,
        spouseName: ticketType === 'Double' ? spouseName : '',
        spouseMeal: ticketType === 'Double' ? spouseMeal : '',
        userMeal,
    };
}

function openSummaryModal(modal, event, user, formData, pricing) {
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

        populatePoster(event);

        // Retrieve draft if saved from ticket-details.html
        let draft = {};
        const savedDraft = sessionStorage.getItem(`checkout_draft_${event.id}`);
        if (savedDraft) {
            try {
                draft = JSON.parse(savedDraft);
            } catch (e) {
                console.warn('Failed to parse draft from sessionStorage:', e);
            }
        }

        const formData = populateReviewData(draft, user);
        const basePrice = Number(event.price || 0);
        const pricing = calculatePricing(basePrice, formData.ticketType);

        // Configure "Make Edits" button
        const makeEditsBtn = document.getElementById('btn-make-edits');
        if (makeEditsBtn) {
            makeEditsBtn.href = `/pages/member/ticket-details.html?id=${event.id}`;
        }

        const proceedBtn = document.getElementById('btn-open-payment');
        const modal = document.getElementById('check-details-modal');
        setupModalEvents(modal);

        const eligibility = checkEventEligibility(event);
        if (!eligibility.ok) {
            showToast(eligibility.message, 'error');
            if (proceedBtn) {
                proceedBtn.disabled = true;
                proceedBtn.textContent = eligibility.message;
                proceedBtn.style.opacity = '0.6';
            }
        } else if (existingBooking) {
            showToast('You have already booked tickets for this event.', 'error');
            if (proceedBtn) {
                proceedBtn.textContent = 'View My Ticket';
                proceedBtn.onclick = (e) => {
                    e.preventDefault();
                    window.location.href = '/pages/member/tickets.html';
                };
            }
        } else {
            // Open payment modal
            if (proceedBtn) {
                proceedBtn.addEventListener('click', (e) => {
                    e.preventDefault();

                    if (!formData.firstName || !formData.lastName || !formData.address || !formData.phone || !formData.email) {
                        showToast('Please complete all required details first.', 'error');
                        setTimeout(() => {
                            window.location.href = `/pages/member/ticket-details.html?id=${event.id}`;
                        }, 1200);
                        return;
                    }

                    if (!isValidMobile(formData.phone)) {
                        showToast('Phone must be between 10 and 12 digits.', 'error');
                        setTimeout(() => {
                            window.location.href = `/pages/member/ticket-details.html?id=${event.id}`;
                        }, 1200);
                        return;
                    }

                    if (formData.ticketType === 'Double' && !formData.spouseName) {
                        showToast('Spouse name is required for Double ticket.', 'error');
                        setTimeout(() => {
                            window.location.href = `/pages/member/ticket-details.html?id=${event.id}`;
                        }, 1200);
                        return;
                    }

                    openSummaryModal(modal, event, user, formData, pricing);
                });
            }
        }

        // Handle Pay Now in modal
        const payNowBtn = document.getElementById('btn-pay-now');
        if (payNowBtn) {
            payNowBtn.addEventListener('click', async () => {
                if (payNowBtn.disabled) return;
                payNowBtn.disabled = true;

                const headEl = document.getElementById('modal-head');
                const summaryView = document.getElementById('modal-summary-view');
                const loaderView = document.getElementById('modal-loader-view');
                const successView = document.getElementById('modal-success-view');

                try {
                    const recheck = checkEventEligibility(event);
                    if (!recheck.ok) {
                        showToast(recheck.message, 'error');
                        modal.classList.add('is-hidden');
                        return;
                    }

                    // Anti-overselling capacity check
                    const freshBookings = await getBookingsByEvent(event.id);
                    const currentSold = summariseBookings(freshBookings).tickets;
                    const seatsLeft = Math.max(0, Number(event.capacity || 0) - currentSold);

                    if (seatsLeft < pricing.quantity) {
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
                        quantity: pricing.quantity,
                        amount: pricing.total,
                        ticketType: formData.ticketType,
                        userMeal: formData.userMeal,
                        spouseName: formData.ticketType === 'Double' ? formData.spouseName : '',
                        spouseMeal: formData.ticketType === 'Double' ? formData.spouseMeal : '',
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
                        console.warn('Failed to clear draft from sessionStorage:', e);
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
        console.error('Failed to load check details page:', err);
        showToast('Error loading details. Please try again.', 'error');
    }
}

init();
