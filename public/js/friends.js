document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('jwtToken');
    if (!token) {
        window.location.href = '/';
        return;
    }
    DataModel.setToken(token);

    const logoutButton = document.getElementById('logoutButton');
    const friendSearch = document.getElementById('friendSearch');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    const friendsList = document.getElementById('friendsList');
    const pendingList = document.getElementById('pendingList');
    const pendingCount = document.getElementById('pendingCount');
    const publicUsersList = document.getElementById('publicUsersList');

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let debounceTimer = null;

    // =========================
    // MESSAGE NOTIFICATIONS
    // =========================
    function setMessageNavBadge(count) {
        const el = document.getElementById('friendMessageBadge');
        if (!el) return;
        const n = Number(count) || 0;
        el.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
        el.classList.toggle('has-count', n > 0);
    }

    function setInlineMessagesBadge(btn, n) {
        if (!btn) return;
        const badge = btn.querySelector('.messages-unread-badge');
        if (!badge) return;
        const v = Number(n) || 0;
        if (v > 0) {
            badge.textContent = v > 99 ? '99+' : String(v);
            badge.classList.add('has-count');
        } else {
            badge.textContent = '';
            badge.classList.remove('has-count');
        }
    }

    function updateMessageBadgeSchemaHint(data) {
        const el = document.getElementById('messageBadgeSchemaHint');
        if (!el) return;
        if (data && data.migrated === false && !sessionStorage.getItem('hideMessageBadgeSchemaHint')) {
            el.style.display = 'flex';
        } else {
            el.style.display = 'none';
        }
    }

    function threadRowCount(row) {
        const v = row.count ?? row.cnt;
        if (v == null || v === '') return 0;
        if (typeof v === 'bigint') return Number(v);
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    async function syncMessageBadgesFromSummary() {
        try {
            const res = await fetch('/api/friends/messages/unread/summary', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) { setMessageNavBadge(0); return; }
            const data = await res.json().catch(() => ({ threads: [] }));
            updateMessageBadgeSchemaHint(data);
            const threads = data.threads || [];
            let total = 0;
            const map = new Map();
            for (const row of threads) {
                const em = String(row.senderEmail || '').trim().toLowerCase();
                if (!em) continue;
                const c = threadRowCount(row);
                total += c;
                map.set(em, c);
            }
            setMessageNavBadge(total);
            document.querySelectorAll('.friend-card[data-friend-email]').forEach((card) => {
                const email = String(card.getAttribute('data-friend-email') || '').trim().toLowerCase();
                const btn = card.querySelector('.messages-btn');
                if (email && btn) setInlineMessagesBadge(btn, map.get(email) || 0);
            });
        } catch (err) {
            setMessageNavBadge(0);
        }
    }

    function escapeHtml(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    const friendsActivityList = document.getElementById('friendsActivityList');

    function formatActivityRow(a) {
        const who = escapeHtml(a.actorLabel || a.actorEmail || 'Friend');
        const title = escapeHtml(a.title || 'Unknown title');
        const when = new Date(a.occurredAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        let line = '';
        if (a.kind === 'rating') {
            const typeLabel = a.mediaType === 'show' ? 'show' : 'movie';
            const n = Math.min(5, Math.max(1, Number(a.rating) || 0));
            const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
            line = `<strong>${who}</strong> rated <em>${title}</em> (${typeLabel}) ${stars}`;
        } else if (a.kind === 'list_add') {
            line = `<strong>${who}</strong> added <em>${title}</em> to "${escapeHtml(a.listName || 'a list')}"`;
        } else if (a.kind === 'status') {
            const verb =
                a.status === 'watching'
                    ? 'is watching'
                    : a.status === 'completed'
                      ? 'marked completed'
                      : a.status === 'want_to_watch'
                        ? 'wants to watch'
                        : `updated status (${escapeHtml(String(a.status || ''))})`;
            const typeLabel = a.mediaType === 'show' ? 'show' : 'movie';
            line = `<strong>${who}</strong> ${verb} <em>${title}</em> (${typeLabel})`;
        } else {
            line = `<strong>${who}</strong> did something on the app`;
        }
        return `<div class="friends-activity-item"><p class="friends-activity-line">${line}</p><span class="friends-activity-time">${escapeHtml(when)}</span></div>`;
    }

    async function loadFriendActivity() {
        if (!friendsActivityList) return;
        friendsActivityList.innerHTML = '<p class="friends-activity-loading empty-message">Loading…</p>';
        try {
            const res = await fetch('/api/friends/activity?limit=40', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('bad');
            const data = await res.json();
            const items = data.activities || [];
            if (items.length === 0) {
                friendsActivityList.innerHTML =
                    '<p class="friends-activity-empty empty-message">No recent activity from friends yet.</p>';
                return;
            }
            friendsActivityList.innerHTML = items.map(formatActivityRow).join('');
        } catch (err) {
            friendsActivityList.innerHTML = '<p class="empty-message">Could not load activity.</p>';
        }
    }

    function tickFriendNotifications() {
        if (document.visibilityState === 'hidden') return;
        pollPendingRequestCount();
        syncMessageBadgesFromSummary();
    }

    // =========================
    // PRIVATE PROFILE NOTICE
    // =========================
    function privateProfileHTML() {
        return `
            <div class="private-profile-notice">
                <span class="lock-icon">🔒</span>
                <p>This profile is private. Only approved friends can view this content.</p>
            </div>
        `;
    }

    // =========================
    // SEARCH
    // =========================
    async function runSearch() {
        const query = friendSearch?.value?.trim() || '';
        searchResults.innerHTML = '';
        if (query.length < 1) return;

        try {
            const [searchRes, friendsRes] = await Promise.all([
                fetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/friends', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            const searchData = await searchRes.json();
            const friendsData = await friendsRes.json();
            const users = searchData.users || [];
            const friendEmails = new Set((friendsData.friends || []).map(f => f.email));

            if (users.length === 0) {
                searchResults.innerHTML = '<p class="empty-message">No users found.</p>';
                return;
            }

            users.forEach(user => {
                const div = document.createElement('div');
                div.classList.add('search-result-item');
                const pic = user.profilePicture
                    ? `<img src="${user.profilePicture}" class="friend-avatar">`
                    : `<div class="friend-avatar-placeholder"></div>`;
                const displayName = user.firstName ? `${user.firstName} ${user.lastName}` : user.email;
                const username = user.username ? `@${user.username}` : '';
                const alreadyFriend = friendEmails.has(user.email);
                div.innerHTML = `
                    ${pic}
                    <div class="friend-info">
                        <strong>${displayName}</strong>
                        <span class="meta">${username}</span>
                    </div>
                    ${alreadyFriend
                        ? `<button class="already-friend-btn" disabled>Already Friends</button>`
                        : `<button class="add-friend-btn" data-email="${user.email}">Add Friend</button>`
                    }
                `;
                if (!alreadyFriend) {
                    div.querySelector('.add-friend-btn').addEventListener('click', async () => {
                        const result = await sendFriendRequest(user.email);
                        if (result.ok) {
                            div.querySelector('.add-friend-btn').textContent = 'Requested';
                            div.querySelector('.add-friend-btn').disabled = true;
                        } else {
                            alert(result.message || 'Failed to send request.');
                        }
                    });
                }
                searchResults.appendChild(div);
            });
        } catch (err) {
            console.error(err);
            searchResults.innerHTML = '<p class="empty-message">Search failed.</p>';
        }
    }

    friendSearch?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearch, 400);
    });
    friendSearch?.addEventListener('keypress', (e) => { if (e.key === 'Enter') runSearch(); });
    searchBtn?.addEventListener('click', runSearch);

    // =========================
    // FRIEND REQUESTS
    // =========================
    async function sendFriendRequest(receiverEmail) {
        try {
            const res = await fetch('/api/friends/request', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverEmail })
            });
            const data = await res.json();
            return { ok: res.ok, message: data.message };
        } catch (err) {
            return { ok: false, message: 'Something went wrong.' };
        }
    }

    async function loadPendingRequests() {
        try {
            const res = await fetch('/api/friends/requests', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const requests = data.requests || [];
            pendingCount.textContent = requests.length > 0 ? requests.length : '';
            const navBadge = document.getElementById('friendRequestBadge');
            if (navBadge) {
                navBadge.textContent = requests.length > 0 ? (requests.length > 99 ? '99+' : requests.length) : '';
                navBadge.classList.toggle('has-count', requests.length > 0);
            }
            pendingList.innerHTML = '';

            if (requests.length === 0) {
                pendingList.innerHTML = '<p class="empty-message">No pending requests.</p>';
                syncMessageBadgesFromSummary();
                return;
            }

            requests.forEach(req => {
                const div = document.createElement('div');
                div.classList.add('friend-item');
                const pic = req.profilePicture
                    ? `<img src="${req.profilePicture}" class="friend-avatar">`
                    : `<div class="friend-avatar-placeholder"></div>`;
                const displayName = req.firstName ? `${req.firstName} ${req.lastName}` : req.sender_email;
                const username = req.username ? `@${req.username}` : '';
                div.innerHTML = `
                    ${pic}
                    <div class="friend-info">
                        <strong>${displayName}</strong>
                        <span class="meta">${username}</span>
                    </div>
                    <div class="request-actions">
                        <button class="accept-btn" data-id="${req.id}">Accept</button>
                        <button class="decline-btn" data-id="${req.id}">Decline</button>
                    </div>
                `;
                div.querySelector('.accept-btn').addEventListener('click', async (e) => {
                    const acceptBtn = e.currentTarget;
                    const declineBtn = div.querySelector('.decline-btn');
                    acceptBtn.disabled = true;
                    if (declineBtn) declineBtn.disabled = true;
                    acceptBtn.textContent = 'Accepting...';
                    const result = await respondToRequest(req.id, 'accepted');
                    if (!result.ok) {
                        alert(result.message || 'Failed to accept request.');
                        acceptBtn.disabled = false;
                        if (declineBtn) declineBtn.disabled = false;
                        acceptBtn.textContent = 'Accept';
                        return;
                    }
                    await loadPendingRequests();
                    await loadFriends();
                    await loadPublicUsers();
                });
                div.querySelector('.decline-btn').addEventListener('click', async (e) => {
                    const declineBtn = e.currentTarget;
                    const acceptBtn = div.querySelector('.accept-btn');
                    declineBtn.disabled = true;
                    if (acceptBtn) acceptBtn.disabled = true;
                    declineBtn.textContent = 'Declining...';
                    const result = await respondToRequest(req.id, 'declined');
                    if (!result.ok) {
                        alert(result.message || 'Failed to decline request.');
                        declineBtn.disabled = false;
                        if (acceptBtn) acceptBtn.disabled = false;
                        declineBtn.textContent = 'Decline';
                        return;
                    }
                    await loadPendingRequests();
                });
                pendingList.appendChild(div);
            });
            syncMessageBadgesFromSummary();
        } catch (err) {
            console.error(err);
        }
    }

    async function respondToRequest(id, status) {
        try {
            const res = await fetch(`/api/friends/request/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, message: data.message || 'Request failed.' };
            return { ok: true, message: data.message };
        } catch (err) {
            return { ok: false, message: 'Network error.' };
        }
    }

    async function removeFriend(friendEmail, buttonEl) {
        if (!confirm('Remove this friend?')) return;
        const originalText = buttonEl?.textContent;
        if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = 'Removing...'; }
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(friendEmail)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { alert(data.message || 'Failed to remove friend.'); return; }
            await loadFriends();
            await loadPublicUsers();
            await loadFriendActivity();
        } catch (err) {
            console.error(err);
            alert('Failed to remove friend.');
        } finally {
            if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = originalText; }
        }
    }

    // =========================
    // BUILD EXPANDABLE CARD
    // =========================
    function buildUserCard(user, { isFriend, isPublic, pendingEmails }) {
        const div = document.createElement('div');
        div.classList.add('friend-card');
        div.setAttribute('data-friend-email', user.email);

        const pic = user.profilePicture
            ? `<img src="${user.profilePicture}" class="friend-avatar">`
            : `<div class="friend-avatar-placeholder"></div>`;
        const displayName = user.firstName ? `${user.firstName} ${user.lastName}` : user.email;
        const username = user.username ? `@${user.username}` : '';

        let actionBtn = '';
        if (isFriend) {
            actionBtn = `<button class="remove-friend-btn">Remove</button>`;
        } else if (pendingEmails && pendingEmails.has(user.email)) {
            actionBtn = `<button class="already-friend-btn" disabled>Requested</button>`;
        } else {
            actionBtn = `<button class="add-friend-btn">Add Friend</button>`;
        }

        const messageTab = isFriend
            ? `<button type="button" class="tab-inline-btn messages-btn">Messages<span class="messages-unread-badge" aria-label="Unread messages"></span></button>`
            : '';

        // Private non-friends: show lock, no content tabs
        // Public users or friends: show ratings + watchlists tabs
        const isPrivateNonFriend = !isFriend && !isPublic;
        const contentTabs = isPrivateNonFriend
            ? `<span class="private-badge">🔒 Private</span>`
            : `<button class="tab-inline-btn ratings-btn">Ratings</button>
               <button class="tab-inline-btn watchlists-btn">Watchlists</button>
               ${messageTab}`;

        div.innerHTML = `
            <div class="friend-card-header">
                ${pic}
                <div class="friend-info">
                    <strong>${displayName}</strong>
                    <span class="meta">${username}</span>
                </div>
                <div class="friend-actions">
                    ${contentTabs}
                    ${actionBtn}
                </div>
            </div>
            <div class="friend-inline-content"></div>
        `;

        const contentEl = div.querySelector('.friend-inline-content');
        let activeTab = null;

        const ratingsBtn = div.querySelector('.ratings-btn');
        const watchlistsBtn = div.querySelector('.watchlists-btn');
        const messagesBtn = div.querySelector('.messages-btn');

        function setActiveBtn(btn) {
            [ratingsBtn, watchlistsBtn, messagesBtn].forEach(b => b && b.classList.remove('active'));
            if (btn) btn.classList.add('active');
        }

        if (ratingsBtn) {
            ratingsBtn.addEventListener('click', async () => {
                if (activeTab === 'ratings') {
                    contentEl.innerHTML = '';
                    activeTab = null;
                    setActiveBtn(null);
                    return;
                }
                activeTab = 'ratings';
                setActiveBtn(ratingsBtn);
                contentEl.innerHTML = '<p class="empty-message">Loading...</p>';
                try {
                    const endpoint = isFriend
                        ? `/api/friends/${encodeURIComponent(user.email)}/ratings`
                        : `/api/users/${encodeURIComponent(user.email)}/ratings`;
                    const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (res.status === 403) { contentEl.innerHTML = privateProfileHTML(); return; }
                    const data = await res.json();
                    const ratings = data.ratings || [];
                    if (ratings.length === 0) {
                        contentEl.innerHTML = '<p class="empty-message">No ratings yet.</p>';
                        return;
                    }
                    contentEl.innerHTML = ratings.map(r => {
                        const date = new Date(r.rated_at).toLocaleDateString();
                        return `
                            <div class="friend-rating-item">
                                <strong>${r.title}</strong>
                                <span class="type-badge">${r.type === 'show' ? 'TV Show' : 'Movie'}</span>
                                <span class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                                <span class="meta">· ${date}</span>
                                ${r.review ? `<p class="review-text">${r.review}</p>` : ''}
                            </div>
                        `;
                    }).join('');
                } catch (err) {
                    contentEl.innerHTML = '<p class="empty-message">Failed to load ratings.</p>';
                }
            });
        }

        if (watchlistsBtn) {
            watchlistsBtn.addEventListener('click', async () => {
                if (activeTab === 'watchlists') {
                    contentEl.innerHTML = '';
                    activeTab = null;
                    setActiveBtn(null);
                    return;
                }
                activeTab = 'watchlists';
                setActiveBtn(watchlistsBtn);
                contentEl.innerHTML = '<p class="empty-message">Loading...</p>';
                try {
                    const endpoint = isFriend
                        ? `/api/friends/${encodeURIComponent(user.email)}/lists`
                        : `/api/users/${encodeURIComponent(user.email)}/lists`;
                    const res = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
                    if (res.status === 403) { contentEl.innerHTML = privateProfileHTML(); return; }
                    const data = await res.json();
                    const lists = data.lists || [];
                    if (lists.length === 0) {
                        contentEl.innerHTML = '<p class="empty-message">No lists yet.</p>';
                        return;
                    }
                    contentEl.innerHTML = lists.map(list => {
                        const items = list.items || [];
                        const itemsHtml = items.length > 0
                            ? items.map(i => `<span class="list-item-tag">${i.title}</span>`).join('')
                            : '<span style="font-size:12px;opacity:0.6;">Empty list</span>';
                        return `
                            <div class="friend-list-card">
                                <h4 class="friend-list-name">${list.name}</h4>
                                <div class="friend-list-items">${itemsHtml}</div>
                            </div>
                        `;
                    }).join('');
                } catch (err) {
                    contentEl.innerHTML = '<p class="empty-message">Failed to load lists.</p>';
                }
            });
        }

        if (messagesBtn) {
            messagesBtn.addEventListener('click', async () => {
                if (activeTab === 'messages') {
                    contentEl.innerHTML = '';
                    activeTab = null;
                    setActiveBtn(null);
                    return;
                }
                activeTab = 'messages';
                setActiveBtn(messagesBtn);
                await renderInlineMessages(user.email, contentEl, messagesBtn);
            });
        }

        const addBtn = div.querySelector('.add-friend-btn');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                const result = await sendFriendRequest(user.email);
                if (result.ok) {
                    addBtn.textContent = 'Requested';
                    addBtn.disabled = true;
                } else {
                    alert(result.message || 'Failed to send request.');
                }
            });
        }

        const removeBtn = div.querySelector('.remove-friend-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => removeFriend(user.email, e.currentTarget));
        }

        return div;
    }

    // =========================
    // FRIENDS LIST
    // =========================
    async function loadFriends() {
        try {
            const [friendsRes, summaryRes] = await Promise.all([
                fetch('/api/friends', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/friends/messages/unread/summary', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            const data = await friendsRes.json();
            const summaryData = await summaryRes.json().catch(() => ({ threads: [] }));
            updateMessageBadgeSchemaHint(summaryData);
            const friends = data.friends || [];
            const unreadByEmail = new Map();
            for (const row of summaryData.threads || []) {
                const em = String(row.senderEmail || '').trim().toLowerCase();
                if (em) unreadByEmail.set(em, threadRowCount(row));
            }
            setMessageNavBadge([...unreadByEmail.values()].reduce((a, b) => a + b, 0));
            friendsList.innerHTML = '';

            if (friends.length === 0) {
                friendsList.innerHTML = '<p class="empty-message">No friends yet. Search or browse users below to add some.</p>';
                return;
            }

            friends.forEach(friend => {
                const card = buildUserCard(friend, { isFriend: true, isPublic: true, pendingEmails: new Set() });
                const messagesBtn = card.querySelector('.messages-btn');
                if (messagesBtn) setInlineMessagesBadge(messagesBtn, unreadByEmail.get(String(friend.email).trim().toLowerCase()) || 0);
                friendsList.appendChild(card);
            });
        } catch (err) {
            console.error(err);
        }
    }

    // =========================
    // DISCOVER USERS LIST
    // =========================
    async function loadPublicUsers() {
        try {
            const [publicRes, friendsRes, pendingRes] = await Promise.all([
                fetch('/api/users/public', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/friends', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/friends/requests/sent', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const publicData = await publicRes.json();
            const friendsData = await friendsRes.json();
            const pendingData = await pendingRes.json();

            const allUsers = publicData.users || [];
            const friendEmails = new Set((friendsData.friends || []).map(f => f.email));
            const pendingEmails = new Set((pendingData.requests || []).map(r => r.receiver_email));

            publicUsersList.innerHTML = '';

            const myEmail = getMyEmailFromToken();
            const nonFriendUsers = allUsers.filter(u => u.email !== myEmail && !friendEmails.has(u.email));

            if (nonFriendUsers.length === 0) {
                publicUsersList.innerHTML = '<p class="empty-message">No other users found.</p>';
                return;
            }

            nonFriendUsers.forEach(user => {
                const card = buildUserCard(user, {
                    isFriend: false,
                    isPublic: !user.isPrivate,
                    pendingEmails
                });
                publicUsersList.appendChild(card);
            });
        } catch (err) {
            console.error(err);
            publicUsersList.innerHTML = '<p class="empty-message">Failed to load users.</p>';
        }
    }

    // =========================
    // INLINE MESSAGES
    // =========================
    function getMyEmailFromToken() {
        try {
            const parts = token?.split?.('.') || [];
            if (parts.length < 2) return null;
            const base64Url = parts[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
            const decoded = atob(padded);
            const jsonStr = decoded.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
            const payload = JSON.parse(decodeURIComponent(jsonStr));
            return payload?.email || null;
        } catch (e) {
            return null;
        }
    }

    async function renderInlineMessages(email, contentEl, messagesBtn) {
        contentEl.innerHTML = '<p class="empty-message">Loading...</p>';
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(email)}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) { contentEl.innerHTML = '<p class="empty-message">Failed to load messages.</p>'; return; }
            const data = await res.json();
            const messages = data.messages || [];
            const myLower = (getMyEmailFromToken() || '').trim().toLowerCase();

            const messagesHtml = messages.length === 0
                ? '<p class="empty-message">No messages yet. Say something!</p>'
                : messages.map(m => {
                    const isMine = myLower && String(m.sender_email || '').trim().toLowerCase() === myLower;
                    return `
                        <div class="message-bubble ${isMine ? 'mine' : 'theirs'}">
                            <p>${escapeHtml(m.content)}</p>
                            <span class="message-time">${new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    `;
                }).join('');

            contentEl.innerHTML = `
                <div class="messages-list">${messagesHtml}</div>
                <div class="message-input-row" style="margin-top:8px;">
                    <input type="text" class="inline-message-input" placeholder="Send a message...">
                    <button type="button" class="primary-btn inline-send-btn">Send</button>
                </div>
            `;

            const msgList = contentEl.querySelector('.messages-list');
            if (msgList) msgList.scrollTop = msgList.scrollHeight;

            const input = contentEl.querySelector('.inline-message-input');
            const sendBtn = contentEl.querySelector('.inline-send-btn');

            const sendMessage = async () => {
                const content = input?.value?.trim();
                if (!content) return;
                try {
                    const res = await fetch('/api/friends/message', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ receiverEmail: email, content })
                    });
                    if (res.ok) {
                        input.value = '';
                        await renderInlineMessages(email, contentEl, messagesBtn);
                    } else {
                        const errData = await res.json().catch(() => ({}));
                        alert(errData.message || 'Could not send message.');
                    }
                } catch (err) {
                    alert('Could not send message.');
                }
            };

            sendBtn?.addEventListener('click', sendMessage);
            input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

            try {
                await fetch(`/api/friends/${encodeURIComponent(email)}/messages/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (_) {}

            setInlineMessagesBadge(messagesBtn, 0);
            await syncMessageBadgesFromSummary();
        } catch (err) {
            contentEl.innerHTML = '<p class="empty-message">Failed to load messages.</p>';
        }
    }

    // =========================
    // POLLING
    // =========================
    let lastPendingCount = null;
    async function pollPendingRequestCount() {
        try {
            const res = await fetch('/api/friends/requests/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const count = data.count ?? 0;
            if (lastPendingCount === null) { lastPendingCount = count; return; }
            if (count !== lastPendingCount) {
                lastPendingCount = count;
                await loadPendingRequests();
            }
        } catch (err) { /* ignore */ }
    }

    setInterval(tickFriendNotifications, 5000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tickFriendNotifications();
    });

    // =========================
    // INIT
    // =========================
    document.getElementById('messageBadgeSchemaHintDismiss')?.addEventListener('click', () => {
        sessionStorage.setItem('hideMessageBadgeSchemaHint', '1');
        const el = document.getElementById('messageBadgeSchemaHint');
        if (el) el.style.display = 'none';
    });

    loadPendingRequests();
    loadFriends();
    loadPublicUsers();
    loadFriendActivity();
});