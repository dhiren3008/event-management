import fs from 'fs';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

console.log('--- 1. Testing getVerifierCandidates logic ---');
const sampleUsers = [
    { id: 1, name: 'Admin', role: 'admin', status: true },
    { id: 2, name: 'Member', role: 'member', status: true },
    { id: 3, name: 'Active Verifier', role: 'verifier', status: true, displayId: '#2003' },
    { id: 4, name: 'Deactivated Verifier', role: 'verifier', status: false, displayId: '#2004' },
    { id: 5, name: 'Implicit Active Verifier', role: 'verifier', displayId: '#2005' },
];

function getVerifierCandidates(users) {
    return users.filter((user) => user.role === 'verifier' && user.status !== false);
}

const candidates = getVerifierCandidates(sampleUsers);
assert(candidates.length === 2, `Expected 2 active verifier candidates, got ${candidates.length}`);
assert(candidates.some(u => u.id === 3), 'Includes Active Verifier (id 3)');
assert(candidates.some(u => u.id === 5), 'Includes Implicit Active Verifier (id 5)');
assert(!candidates.some(u => u.id === 4), 'Excludes Deactivated Verifier (id 4)');

console.log('\n--- 2. Testing Events Search Logic (Hash vs No Hash) ---');
const sampleEvents = [
    { id: 1, name: 'Startup Pitch Day', location: 'Pune Tech Hub', date: '2026-11-21' },
    { id: 12, name: 'Design Workshop', location: 'Mumbai Design Lab', date: '2026-12-05' },
];

function testEventSearch(searchQuery) {
    const cleanQuery = searchQuery.replace(/^#/, '').trim().toLowerCase();
    const q = searchQuery.trim().toLowerCase();
    return sampleEvents.filter(event => {
        const haystack = `#${event.id} ${event.id} ${event.name} ${event.location || ''} ${event.date}`.toLowerCase();
        return q === '' || haystack.includes(q) || (cleanQuery !== '' && haystack.includes(cleanQuery));
    });
}

assert(testEventSearch('#1').length === 1 && testEventSearch('#1')[0].id === 1, 'Search "#1" matches Event 1');
assert(testEventSearch('1').length === 2, 'Search "1" matches Event 1 and Event 12');
assert(testEventSearch('#12').length === 1 && testEventSearch('#12')[0].id === 12, 'Search "#12" matches Event 12');
assert(testEventSearch('Startup').length === 1, 'Search "Startup" matches Event 1');
assert(testEventSearch('#startup').length === 1, 'Search "#startup" matches Event 1');

console.log('\n--- 3. Testing Assign Modal Display ID & Search ---');
function testAssignSearch(rawQuery, verifiers) {
    const raw = rawQuery.trim().toLowerCase();
    const query = raw.replace(/^#/, '').trim();
    return verifiers.filter(user => {
        const displayId = user.displayId || `#${user.id}`;
        const haystack = `${displayId} ${user.id} ${user.name} ${user.location || ''} ${user.pinLevel || ''}`.toLowerCase();
        return query !== '' && (haystack.includes(query) || haystack.includes(raw));
    });
}

const verifierList = [
    { id: 3, name: 'K. Raman', displayId: '#2003', location: 'Pune', pinLevel: 'Manager' },
    { id: 8, name: 'Anita Roy', displayId: '#2008', location: 'Mumbai', pinLevel: 'Supervisor' },
];

assert(testAssignSearch('2003', verifierList).length === 1, 'Search "2003" finds verifier with displayId #2003');
assert(testAssignSearch('#2003', verifierList).length === 1, 'Search "#2003" finds verifier with displayId #2003');
assert(testAssignSearch('3', verifierList).length === 1, 'Search "3" finds verifier by database ID 3');
assert(testAssignSearch('Raman', verifierList).length === 1, 'Search "Raman" finds verifier by name');
assert(testAssignSearch('9999', verifierList).length === 0, 'Search "9999" returns 0 results');

console.log('\n--- 4. Testing add-member.html PIN Level Control ---');
const addMemberHtml = fs.readFileSync('pages/admin/add-member.html', 'utf-8');
assert(addMemberHtml.includes('<select class="input" id="pin-level">'), 'add-member.html contains <select id="pin-level">');
assert(addMemberHtml.includes('<option value="" selected disabled>Select PIN Level</option>'), 'add-member.html contains disabled placeholder option');
assert(!addMemberHtml.includes('<input class="input" id="pin-level"'), 'add-member.html no longer has <input id="pin-level">');

console.log('\n--- 5. Testing Dashboard Search String Coercion ---');
const dashboardEvents = [
    { id: 1, name: 'Location Event', location: 'Pune' },
    { id: 2, name: 'Online Event', location: undefined },
];

function testDashboardSearch(query, events) {
    const q = query.trim().toLowerCase();
    const cleanQuery = q.replace(/^#/, '').trim();
    return events.filter(ev => {
        const target = `#${ev.id || ''} ${ev.id || ''} ${ev.name || ''} ${ev.location || ''}`.toLowerCase();
        return q === '' || target.includes(q) || (cleanQuery !== '' && target.includes(cleanQuery));
    });
}

assert(testDashboardSearch('undefined', dashboardEvents).length === 0, 'Search "undefined" does not match event with undefined location');
assert(testDashboardSearch('#1', dashboardEvents).length === 1, 'Search "#1" matches Event 1');
assert(testDashboardSearch('Online', dashboardEvents).length === 1, 'Search "Online" matches Event 2');

console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`========================================`);

if (failed > 0) process.exit(1);
