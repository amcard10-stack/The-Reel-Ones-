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

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let debounceTimer = null;

    // =========================
    // MESSAGE NOTIFICATIONS (nav + per-friend Messages button)
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

    /** Parse count from API row (count vs cnt, string, BigInt-safe). */
    function threadRowCount(row) {
        const v = row.count ?? row.cnt;
        if (v == null || v === '') return 0;
        if (typeof v === 'bigint') return Number(v);
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    /**
     * One request: nav teal badge = sum(thread counts), each Messages button = that thread.
     * Avoids mismatch from calling /count and /summary at different times.
     */
    async function syncMessageBadgesFromSummary() {
        try {
            const res = await fetch('/api/friends/messages/unread/summary', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                setMessageNavBadge(0);
                return;
            }
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

    function tickFriendNotifications() {
        if (document.visibilityState === 'hidden') return;
        pollPendingRequestCount();
        syncMessageBadgesFromSummary();
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
                const displayName = user.firstName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email;
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
                    const originalAcceptText = acceptBtn.textContent;
                    const originalDeclineText = declineBtn?.textContent;
                    acceptBtn.disabled = true;
                    if (declineBtn) declineBtn.disabled = true;
                    acceptBtn.textContent = 'Accepting...';
                    if (declineBtn) declineBtn.textContent = 'Working...';

                    const result = await respondToRequest(req.id, 'accepted');
                    if (!result.ok) {
                        alert(result.message || 'Failed to accept request.');
                        acceptBtn.disabled = false;
                        if (declineBtn) declineBtn.disabled = false;
                        acceptBtn.textContent = originalAcceptText;
                        if (declineBtn) declineBtn.textContent = originalDeclineText;
                        return;
                    }
                    await loadPendingRequests();
                    await loadFriends();
                });
                div.querySelector('.decline-btn').addEventListener('click', async (e) => {
                    const declineBtn = e.currentTarget;
                    const acceptBtn = div.querySelector('.accept-btn');
                    const originalDeclineText = declineBtn.textContent;
                    const originalAcceptText = acceptBtn?.textContent;
                    declineBtn.disabled = true;
                    if (acceptBtn) acceptBtn.disabled = true;
                    declineBtn.textContent = 'Declining...';
                    if (acceptBtn) acceptBtn.textContent = 'Working...';

                    const result = await respondToRequest(req.id, 'declined');
                    if (!result.ok) {
                        alert(result.message || 'Failed to decline request.');
                        declineBtn.disabled = false;
                        if (acceptBtn) acceptBtn.disabled = false;
                        declineBtn.textContent = originalDeclineText;
                        if (acceptBtn) acceptBtn.textContent = originalAcceptText;
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
            console.error(err);
            return { ok: false, message: 'Network error.' };
        }
    }

    async function removeFriend(friendEmail, buttonEl) {
        if (!confirm('Remove this friend?')) return;
        const originalText = buttonEl?.textContent;
        if (buttonEl) {
            buttonEl.disabled = true;
            buttonEl.textContent = 'Removing...';
        }
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(friendEmail)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(data.message || 'Failed to remove friend.');
                return;
            }
            loadFriends();
        } catch (err) {
            console.error(err);
            alert('Failed to remove friend.');
        } finally {
            if (buttonEl) {
                buttonEl.disabled = false;
                buttonEl.textContent = originalText;
            }
        }
    }

    // =========================
    // FRIENDS LIST (INLINE)
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
            const navTotalFromSummary = [...unreadByEmail.values()].reduce((a, b) => a + b, 0);
            setMessageNavBadge(navTotalFromSummary);
            friendsList.innerHTML = '';

            if (friends.length === 0) {
                friendsList.innerHTML = '<p class="empty-message">No friends yet. Search for users to add.</p>';
                return;
            }

            friends.forEach(friend => {
                const div = document.createElement('div');
                div.classList.add('friend-card');
                div.setAttribute('data-friend-email', friend.email);

                const pic = friend.profilePicture
                    ? `<img src="${friend.profilePicture}" class="friend-avatar">`
                    : `<div class="friend-avatar-placeholder"></div>`;
                const displayName = friend.firstName
                    ? `${friend.firstName} ${friend.lastName}`
                    : friend.email;
                const username = friend.username ? `@${friend.username}` : '';

                div.innerHTML = `
                    <div class="friend-card-header">
                        ${pic}
                        <div class="friend-info">
                            <strong>${displayName}</strong>
                            <span class="meta">${username}</span>
                        </div>
                        <div class="friend-actions">
                            <button class="tab-inline-btn ratings-btn">Ratings</button>
                            <button class="tab-inline-btn watchlists-btn">Watchlists</button>
                            <button type="button" class="tab-inline-btn messages-btn">Messages<span class="messages-unread-badge" aria-label="Unread messages"></span></button>
                            <button class="remove-friend-btn">Remove</button>
                        </div>
                    </div>
                    <div class="friend-inline-content"></div>
                `;

                const contentEl = div.querySelector('.friend-inline-content');
                let activeTab = null;

                const ratingsBtn = div.querySelector('.ratings-btn');
                const watchlistsBtn = div.querySelector('.watchlists-btn');
                const messagesBtn = div.querySelector('.messages-btn');
                setInlineMessagesBadge(messagesBtn, unreadByEmail.get(String(friend.email).trim().toLowerCase()) || 0);

                function setActiveBtn(btn) {
                    [ratingsBtn, watchlistsBtn, messagesBtn].forEach(b => b.classList.remove('active'));
                    if (btn) btn.classList.add('active');
                }

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
                        const res = await fetch(`/api/friends/${encodeURIComponent(friend.email)}/ratings`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
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
                        const res = await fetch(`/api/friends/${encodeURIComponent(friend.email)}/lists`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
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

                messagesBtn.addEventListener('click', async () => {
                    if (activeTab === 'messages') {
                        contentEl.innerHTML = '';
                        activeTab = null;
                        setActiveBtn(null);
                        return;
                    }
                    activeTab = 'messages';
                    setActiveBtn(messagesBtn);
                    await renderInlineMessages(friend.email, contentEl, messagesBtn);
                });

                div.querySelector('.remove-friend-btn').addEventListener('click', (e) => {
                    removeFriend(friend.email, e.currentTarget);
                });

                friendsList.appendChild(div);
            });
        } catch (err) {
            console.error(err);
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
            const jsonStr = decoded
                .split('')
                .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('');
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
            if (!res.ok) {
                contentEl.innerHTML = '<p class="empty-message">Failed to load messages.</p>';
                return;
            }
            const data = await res.json();
            const messages = data.messages || [];
            const myEmail = getMyEmailFromToken();
            const myLower = myEmail ? String(myEmail).trim().toLowerCase() : '';

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
                    console.error(err);
                    alert('Could not send message.');
                }
            };

            sendBtn?.addEventListener('click', sendMessage);
            input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

            try {
                const readRes = await fetch(`/api/friends/${encodeURIComponent(email)}/messages/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!readRes.ok) {
                    console.warn('Mark read failed', readRes.status);
                }
            } catch (readErr) {
                console.error(readErr);
            }
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
            if (lastPendingCount === null) {
                lastPendingCount = count;
                return;
            }
            if (count !== lastPendingCount) {
                lastPendingCount = count;
                await loadPendingRequests();
            }
        } catch (err) {
            // ignore
        }
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
});