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
    const friendsActivityList = document.getElementById('friendsActivityList');

    logoutButton?.addEventListener('click', () => {
        localStorage.removeItem('jwtToken');
        window.location.href = '/';
    });

    let debounceTimer = null;

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

    function formatActivityRow(a) {
        const who = escapeHtml(a.actorLabel || a.actorEmail || 'Friend');
        const title = escapeHtml(a.title || 'Unknown title');
        const when = new Date(a.occurredAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });

        let line = '';

        if (a.kind === 'rating') {
            const typeLabel = a.mediaType === 'show' ? 'show' : 'movie';
            const n = Math.min(5, Math.max(1, Number(a.rating) || 0));
            const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
            line = `<strong>${who}</strong> rated <em>${title}</em> (${typeLabel}) ${stars}`;
        } else if (a.kind === 'reaction') {
            line = `<strong>${who}</strong> reacted ${escapeHtml(a.emoji || '👍')} to <em>${title}</em>`;
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

        return `
            <div class="friends-activity-item">
                <p class="friends-activity-line">${line}</p>
                <span class="friends-activity-time">${escapeHtml(when)}</span>
            </div>
        `;
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

    function privateProfileHTML() {
        return `
            <div class="private-profile-notice">
                <span class="lock-icon">🔒</span>
                <p>This profile is private. Only approved friends can view this content.</p>
            </div>
        `;
    }

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
                        <strong>${escapeHtml(displayName)}</strong>
                        <span class="meta">${escapeHtml(username)}</span>
                    </div>
                    ${alreadyFriend
                        ? `<button class="already-friend-btn" disabled>Already Friends</button>`
                        : `<button class="add-friend-btn" data-email="${escapeHtml(user.email)}">Add Friend</button>`
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

    friendSearch?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') runSearch();
    });

    searchBtn?.addEventListener('click', runSearch);

    async function sendFriendRequest(receiverEmail) {
        try {
            const res = await fetch('/api/friends/request', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
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
                        <strong>${escapeHtml(displayName)}</strong>
                        <span class="meta">${escapeHtml(username)}</span>
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
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
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

            await loadFriends();
            await loadPublicUsers();
            await loadFriendActivity();
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

    async function postReaction(ratingId, emoji) {
        const id = Number(ratingId);
        const res = await fetch('/api/reactions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ratingId: id, emoji })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            // Show the real error from server (includes debug info)
            const msg = data?.debug?.sqlMessage || data?.message || 'Failed to save reaction.';
            throw new Error(msg);
        }
        return data;
    }

    async function deleteReaction(ratingId) {
        const id = Number(ratingId);
        const res = await fetch(`/api/reactions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Failed to remove reaction.');
        return data;
    }

    // FIX: renderRatingsHTML now takes real DB ratings only (no inflated IDs from watch history)
    // The data-rating-id attribute now always uses the real integer DB id
    function renderRatingsHTML(ratings) {
        return ratings.map((r) => {
            // Ensure we always use the real numeric DB id
            const realId = Number(r.id);
            const date = new Date(r.rated_at).toLocaleDateString();
            const counts = r.reactions?.counts || {};
            const myReaction = r.reactions?.myReaction || null;
            const emojis = ['👍', '😂', '🔥', '😮'];

            const reactionButtons = emojis.map((emoji) => {
                const count = counts[emoji] || 0;
                const activeClass = myReaction === emoji ? 'active-reaction' : '';

                return `
                    <button
                        type="button"
                        class="reaction-btn ${activeClass}"
                        data-rating-id="${realId}"
                        data-emoji="${emoji}"
                    >
                        ${emoji}${count > 0 ? ` ${count}` : ''}
                    </button>
                `;
            }).join('');

            return `
                <div class="friend-rating-item">
                    <strong>${escapeHtml(r.title)}</strong>
                    <span class="type-badge">${r.type === 'show' ? 'TV Show' : 'Movie'}</span>
                    <span class="rating-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                    <span class="meta">· ${date}</span>
                    ${r.review ? `<p class="review-text">${escapeHtml(r.review)}</p>` : ''}

                    <div class="reaction-bar">
                        ${reactionButtons}
                        ${myReaction ? `
                            <button
                                type="button"
                                class="remove-reaction-btn"
                                data-rating-id="${realId}"
                            >
                                ✖
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function attachReactionHandlers(contentEl, rerenderRatings) {
        contentEl.querySelectorAll('.reaction-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                // FIX: parse to Number before passing to postReaction
                const ratingId = Number(btn.dataset.ratingId);
                const emoji = btn.dataset.emoji;
                btn.disabled = true;
                try {
                    await postReaction(ratingId, emoji);
                    await rerenderRatings();
                    await loadFriendActivity();
                } catch (err) {
                    alert(err.message || 'Error saving reaction.');
                } finally {
                    btn.disabled = false;
                }
            });
        });

        contentEl.querySelectorAll('.remove-reaction-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                // FIX: parse to Number before passing to deleteReaction
                const ratingId = Number(btn.dataset.ratingId);

                btn.disabled = true;
                try {
                    await deleteReaction(ratingId);
                    await rerenderRatings();
                    await loadFriendActivity();
                } catch (err) {
                    alert(err.message || 'Error removing reaction.');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }

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

        const sharedListsTab = isFriend
            ? `<button type="button" class="tab-inline-btn shared-lists-btn">Shared Lists<span class="shared-lists-invite-badge" aria-label="Pending list invitations"></span></button>`
            : '';

        const isPrivateNonFriend = !isFriend && !isPublic;
        const contentTabs = isPrivateNonFriend
            ? `<span class="private-badge">🔒 Private</span>`
            : `<button class="tab-inline-btn ratings-btn">Ratings</button>
               <button class="tab-inline-btn watchlists-btn">Watchlists</button>
               ${sharedListsTab}
               ${messageTab}`;

        div.innerHTML = `
            <div class="friend-card-header">
                ${pic}
                <div class="friend-info">
                    <strong>${escapeHtml(displayName)}</strong>
                    <span class="meta">${escapeHtml(username)}</span>
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
        const sharedListsBtn = div.querySelector('.shared-lists-btn');

        function setActiveBtn(btn) {
            [ratingsBtn, watchlistsBtn, messagesBtn, sharedListsBtn].forEach((b) => b && b.classList.remove('active'));
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

                const renderRatingsTab = async () => {
                    // FIX: always use the correct endpoint that returns real DB ids
                    // /api/friends/:email/ratings for friends, /api/users/:email/ratings for public users
                    const endpoint = isFriend
                        ? `/api/friends/${encodeURIComponent(user.email)}/ratings`
                        : `/api/users/${encodeURIComponent(user.email)}/ratings`;

                    const res = await fetch(endpoint, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (res.status === 403) {
                        contentEl.innerHTML = privateProfileHTML();
                        return;
                    }

                    const data = await res.json();
                    // FIX: use only data.ratings — never mix with watch history data
                    const ratings = data.ratings || [];

                    if (ratings.length === 0) {
                        contentEl.innerHTML = '<p class="empty-message">No ratings yet.</p>';
                        return;
                    }

                    contentEl.innerHTML = renderRatingsHTML(ratings);
                    attachReactionHandlers(contentEl, renderRatingsTab);
                };

                try {
                    await renderRatingsTab();
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

                    const res = await fetch(endpoint, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (res.status === 403) {
                        contentEl.innerHTML = privateProfileHTML();
                        return;
                    }

                    const data = await res.json();
                    const lists = data.lists || [];

                    if (lists.length === 0) {
                        contentEl.innerHTML = '<p class="empty-message">No lists yet.</p>';
                        return;
                    }

                    contentEl.innerHTML = lists.map((list) => {
                        const items = list.items || [];
                        const itemsHtml = items.length > 0
                            ? items.map((i) => `<span class="list-item-tag">${escapeHtml(i.title)}</span>`).join('')
                            : '<span style="font-size:12px;opacity:0.6;">Empty list</span>';

                        return `
                            <div class="friend-list-card">
                                <h4 class="friend-list-name">${escapeHtml(list.name)}</h4>
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

        if (sharedListsBtn) {
            sharedListsBtn.addEventListener('click', async () => {
                if (activeTab === 'sharedlists') {
                    contentEl.innerHTML = '';
                    activeTab = null;
                    setActiveBtn(null);
                    return;
                }

                activeTab = 'sharedlists';
                setActiveBtn(sharedListsBtn);
                await renderSharedListsTab(user.email, contentEl);
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

    async function loadFriends() {
        try {
            const [friendsRes, summaryRes, inviteRes] = await Promise.all([
                fetch('/api/friends', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/friends/messages/unread/summary', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/invitations/pending', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const data = await friendsRes.json();
            const summaryData = await summaryRes.json().catch(() => ({ threads: [] }));
            const inviteData = inviteRes.ok
                ? await inviteRes.json().catch(() => ({ invitations: [] }))
                : { invitations: [] };

            updateMessageBadgeSchemaHint(summaryData);

            const friends = data.friends || [];
            const unreadByEmail = new Map();

            for (const row of summaryData.threads || []) {
                const em = String(row.senderEmail || '').trim().toLowerCase();
                if (em) unreadByEmail.set(em, threadRowCount(row));
            }

            setMessageNavBadge([...unreadByEmail.values()].reduce((a, b) => a + b, 0));

            const invitesByFriend = new Map();
            for (const inv of inviteData.invitations || []) {
                const em = String(inv.invited_by_email || '').trim().toLowerCase();
                invitesByFriend.set(em, (invitesByFriend.get(em) || 0) + 1);
            }

            friendsList.innerHTML = '';

            if (friends.length === 0) {
                friendsList.innerHTML = '<p class="empty-message">No friends yet. Search or browse users below to add some.</p>';
                return;
            }

            friends.forEach((friend) => {
                const card = buildUserCard(friend, {
                    isFriend: true,
                    isPublic: true,
                    pendingEmails: new Set()
                });

                const messagesBtn = card.querySelector('.messages-btn');
                if (messagesBtn) {
                    setInlineMessagesBadge(
                        messagesBtn,
                        unreadByEmail.get(String(friend.email).trim().toLowerCase()) || 0
                    );
                }

                const sharedListsBadge = card.querySelector('.shared-lists-invite-badge');
                if (sharedListsBadge) {
                    const count = invitesByFriend.get(String(friend.email).trim().toLowerCase()) || 0;
                    if (count > 0) {
                        sharedListsBadge.textContent = String(count);
                        sharedListsBadge.classList.add('has-count');
                    }
                }

                friendsList.appendChild(card);
            });
        } catch (err) {
            console.error(err);
        }
    }

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
            const friendEmails = new Set((friendsData.friends || []).map((f) => f.email));
            const pendingEmails = new Set((pendingData.requests || []).map((r) => r.receiver_email));

            publicUsersList.innerHTML = '';

            const myEmail = getMyEmailFromToken();
            const nonFriendUsers = allUsers.filter((u) => u.email !== myEmail && !friendEmails.has(u.email));

            if (nonFriendUsers.length === 0) {
                publicUsersList.innerHTML = '<p class="empty-message">No other users found.</p>';
                return;
            }

            nonFriendUsers.forEach((user) => {
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
                .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('');
            const payload = JSON.parse(decodeURIComponent(jsonStr));
            return payload?.email || null;
        } catch (e) {
            return null;
        }
    }

    function buildFriendsInlineSearch(mountEl, placeholder, onSelect) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-message-input';
        input.placeholder = placeholder || 'Search...';
        input.style.flex = '1';

        const typeSelect = document.createElement('select');
        typeSelect.style.cssText = 'padding:6px 8px;border-radius:8px;border:none;background:#1a3a6b;color:#F2F4F7;';
        typeSelect.innerHTML = '<option value="both">All</option><option value="movie">Movie</option><option value="show">TV Show</option>';

        row.appendChild(input);
        row.appendChild(typeSelect);

        const grid = document.createElement('div');
        grid.className = 'friends-inline-search-grid';

        mountEl.appendChild(row);
        mountEl.appendChild(grid);

        let localDebounceTimer = null;

        const doSearch = async () => {
            const query = input.value.trim();
            const type = typeSelect.value;

            grid.innerHTML = '';
            if (!query) return;

            grid.innerHTML = '<p class="empty-message" style="font-size:12px;">Searching…</p>';

            try {
                let results = [];

                if (type === 'both') {
                    const [mRes, sRes] = await Promise.all([
                        fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=movie`, {
                            headers: { Authorization: `Bearer ${token}` }
                        }),
                        fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=tv`, {
                            headers: { Authorization: `Bearer ${token}` }
                        })
                    ]);

                    const mData = await mRes.json();
                    const sData = await sRes.json();

                    results = [
                        ...(mData.results || []).map((r) => ({ ...r, _type: 'movie', _title: r.title })),
                        ...(sData.results || []).map((r) => ({ ...r, _type: 'show', _title: r.name }))
                    ];
                } else {
                    const tmdbType = type === 'show' ? 'tv' : 'movie';
                    const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}&type=${tmdbType}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    const data = await res.json();
                    results = (data.results || []).map((r) => ({
                        ...r,
                        _type: type,
                        _title: type === 'show' ? r.name : r.title
                    }));
                }

                grid.innerHTML = '';

                if (results.length === 0) {
                    grid.innerHTML = '<p class="empty-message" style="font-size:12px;">No results.</p>';
                    return;
                }

                results.slice(0, 10).forEach((item) => {
                    const card = document.createElement('div');
                    card.className = 'friends-search-result-card';

                    const posterEl = item.poster_path
                        ? Object.assign(document.createElement('img'), {
                              src: `https://image.tmdb.org/t/p/w92${item.poster_path}`,
                              alt: item._title || ''
                          })
                        : Object.assign(document.createElement('div'), {
                              className: 'friends-search-result-card-ph'
                          });

                    const titleP = document.createElement('p');
                    titleP.className = 'friends-search-result-title';
                    titleP.textContent = item._title || 'Untitled';

                    card.appendChild(posterEl);
                    card.appendChild(titleP);

                    card.addEventListener('click', async () => {
                        card.style.opacity = '0.5';
                        await onSelect({ title: item._title, type: item._type });
                        card.style.opacity = '1';
                        grid.innerHTML = '';
                        input.value = '';
                    });

                    grid.appendChild(card);
                });
            } catch (e) {
                grid.innerHTML = '<p class="empty-message" style="font-size:12px;">Search failed.</p>';
            }
        };

        input.addEventListener('input', () => {
            clearTimeout(localDebounceTimer);
            localDebounceTimer = setTimeout(doSearch, 350);
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(localDebounceTimer);
                doSearch();
            }
        });

        typeSelect.addEventListener('change', () => {
            if (input.value.trim()) doSearch();
        });
    }

    async function renderSharedListsTab(friendEmail, contentEl) {
        contentEl.innerHTML = '<p class="empty-message">Loading...</p>';

        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(friendEmail)}/shared-lists`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                contentEl.innerHTML = '<p class="empty-message">Failed to load.</p>';
                return;
            }

            const data = await res.json();
            const lists = data.lists || [];

            contentEl.innerHTML = '';

            const createRow = document.createElement('div');
            createRow.style.cssText = 'display:flex;gap:8px;margin-bottom:14px;';
            createRow.innerHTML = `
                <input type="text" class="new-shared-list-input inline-message-input" placeholder="New shared list name...">
                <button type="button" class="primary-btn create-shared-list-btn" style="padding:6px 14px;">Create</button>
            `;
            contentEl.appendChild(createRow);

            const createInput = createRow.querySelector('.new-shared-list-input');
            const createBtn = createRow.querySelector('.create-shared-list-btn');

            const doCreate = async () => {
                const name = createInput.value.trim();
                if (!name) return;

                createBtn.disabled = true;

                const r = await fetch(`/api/friends/${encodeURIComponent(friendEmail)}/shared-lists`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name })
                });

                createBtn.disabled = false;

                if (r.ok) {
                    createInput.value = '';
                    createBtn.textContent = 'Sent!';
                    setTimeout(() => {
                        createBtn.textContent = 'Create';
                    }, 2000);
                    await renderSharedListsTab(friendEmail, contentEl);
                } else {
                    const d = await r.json().catch(() => ({}));
                    alert(d.message || 'Could not create list.');
                }
            };

            createBtn.addEventListener('click', doCreate);
            createInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') doCreate();
            });

            const myEmail = getMyEmailFromToken();
            const invitations = data.invitations || [];

            const myPendingInvites = invitations.filter((inv) => inv.invited_email === myEmail);
            if (myPendingInvites.length > 0) {
                const invSection = document.createElement('div');
                invSection.className = 'shared-list-invitations-section';
                invSection.innerHTML = '<p style="font-size:12px;font-weight:600;opacity:0.7;margin-bottom:6px;">Pending Invitations</p>';

                myPendingInvites.forEach((inv) => {
                    const invCard = document.createElement('div');
                    invCard.className = 'shared-list-invitation-card';
                    invCard.innerHTML = `
                        <span><strong>${escapeHtml(inv.listName)}</strong> — invited by ${escapeHtml(inv.inviterFirstName)} ${escapeHtml(inv.inviterLastName)}</span>
                        <div style="display:flex;gap:6px;">
                            <button class="accept-btn inv-accept-btn" style="padding:4px 10px;font-size:12px;">Accept</button>
                            <button class="decline-btn inv-decline-btn" style="padding:4px 10px;font-size:12px;">Decline</button>
                        </div>
                    `;

                    invCard.querySelector('.inv-accept-btn').addEventListener('click', async () => {
                        const r = await fetch(`/api/invitations/${inv.id}/accept`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (r.ok) await renderSharedListsTab(friendEmail, contentEl);
                        else {
                            const d = await r.json().catch(() => ({}));
                            alert(d.message || 'Could not accept.');
                        }
                    });

                    invCard.querySelector('.inv-decline-btn').addEventListener('click', async () => {
                        const r = await fetch(`/api/invitations/${inv.id}/decline`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (r.ok) await renderSharedListsTab(friendEmail, contentEl);
                        else {
                            const d = await r.json().catch(() => ({}));
                            alert(d.message || 'Could not decline.');
                        }
                    });

                    invSection.appendChild(invCard);
                });

                contentEl.appendChild(invSection);
            }

            const theirPendingInvites = invitations.filter((inv) => inv.invited_email !== myEmail);
            if (theirPendingInvites.length > 0) {
                theirPendingInvites.forEach((inv) => {
                    const pendingNote = document.createElement('div');
                    pendingNote.className = 'shared-list-pending-note';
                    pendingNote.innerHTML = `<span>⏳ <strong>${escapeHtml(inv.listName)}</strong> — waiting for friend to accept</span>`;
                    contentEl.appendChild(pendingNote);
                });
            }

            if (lists.length === 0 && myPendingInvites.length === 0 && theirPendingInvites.length === 0) {
                const msg = document.createElement('p');
                msg.className = 'empty-message';
                msg.textContent = 'No shared lists yet. Create one above!';
                contentEl.appendChild(msg);
                return;
            }

            if (lists.length === 0) return;

            const allItems = lists.flatMap((l) => (l.items || []).map((i) => ({ title: i.title, type: 'movie' })));
            let sharedPosters = {};

            if (allItems.length > 0) {
                try {
                    sharedPosters = await DataModel.getPostersForItems(allItems);
                } catch (_) {}
            }

            lists.forEach((list) => {
                const isOwner = list.ownerEmail === myEmail;
                const ownerLabel = isOwner
                    ? 'you'
                    : (list.ownerFirstName ? `${list.ownerFirstName} ${list.ownerLastName}` : list.ownerEmail);

                const items = list.items || [];
                const listDiv = document.createElement('div');
                listDiv.className = 'friend-list-card';

                listDiv.innerHTML = `
                    <div class="friend-list-card-header">
                        <h4 class="friend-list-name" style="margin:0;">${escapeHtml(list.name)}
                            <span class="meta" style="font-weight:normal;font-size:12px;"> · by ${escapeHtml(ownerLabel)}</span>
                        </h4>
                        <div class="friend-list-card-btns">
                            <button type="button" class="add-movies-toggle tab-inline-btn" style="font-size:12px;">+ Add movies</button>
                            <button type="button" class="leave-shared-list-btn" style="padding:4px 10px;border-radius:6px;border:none;background:rgba(220,53,69,0.15);color:#e87070;cursor:pointer;font-size:12px;">Leave list</button>
                        </div>
                    </div>
                    <div class="shared-list-search-mount" style="display:none;margin-bottom:10px;"></div>
                    <div class="shared-list-poster-row"></div>
                `;

                const addMoviesToggle = listDiv.querySelector('.add-movies-toggle');
                const searchMount = listDiv.querySelector('.shared-list-search-mount');

                addMoviesToggle.addEventListener('click', () => {
                    const isOpen = searchMount.style.display !== 'none';

                    if (isOpen) {
                        searchMount.style.display = 'none';
                        addMoviesToggle.textContent = '+ Add movies';
                        addMoviesToggle.classList.remove('active');
                    } else {
                        searchMount.style.display = '';
                        addMoviesToggle.textContent = '− Add movies';
                        addMoviesToggle.classList.add('active');

                        if (!searchMount._built) {
                            searchMount._built = true;
                            buildFriendsInlineSearch(searchMount, 'Search movies or shows to add...', async (tmdbItem) => {
                                const r = await fetch(`/api/dashboard/lists/${list.id}/items`, {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ title: tmdbItem.title, type: tmdbItem.type })
                                });

                                if (r.ok) {
                                    await renderSharedListsTab(friendEmail, contentEl);
                                } else {
                                    const d = await r.json().catch(() => ({}));
                                    alert(d.message || 'Could not add item.');
                                }
                            });
                        }
                    }
                });

                const itemsEl = listDiv.querySelector('.shared-list-poster-row');

                if (items.length > 0) {
                    items.forEach((i) => {
                        const posterPath = sharedPosters[`${i.title}|movie`];
                        const addedByLabel = i.addedByFirstName
                            ? `<span class="shared-item-added-by">by ${escapeHtml(i.addedByFirstName)}</span>`
                            : '';

                        const card = document.createElement('div');
                        card.className = 'shared-list-item-card';

                        const posterHtml = posterPath
                            ? `<img src="https://image.tmdb.org/t/p/w92${posterPath}" alt="${escapeHtml(i.title)}">`
                            : `<div class="shared-list-item-card-ph"></div>`;

                        card.innerHTML = `${posterHtml}
                            <span>${escapeHtml(i.title)}</span>
                            ${addedByLabel}
                            <div class="shared-item-remove-overlay" style="display:none;">
                                <button class="shared-item-remove-btn">Remove</button>
                            </div>`;

                        const overlay = card.querySelector('.shared-item-remove-overlay');

                        card.addEventListener('click', (e) => {
                            if (e.target.classList.contains('shared-item-remove-btn')) return;
                            const isOpen = overlay.style.display === 'flex';
                            itemsEl.querySelectorAll('.shared-item-remove-overlay').forEach((o) => {
                                o.style.display = 'none';
                            });
                            overlay.style.display = isOpen ? 'none' : 'flex';
                        });

                        card.querySelector('.shared-item-remove-btn').addEventListener('click', async (e) => {
                            e.stopPropagation();

                            const r = await fetch(`/api/dashboard/lists/${list.id}/items`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ title: i.title })
                            });

                            if (r.ok) await renderSharedListsTab(friendEmail, contentEl);
                            else {
                                const d = await r.json().catch(() => ({}));
                                alert(d.message || 'Could not remove.');
                            }
                        });

                        itemsEl.appendChild(card);
                    });
                } else {
                    itemsEl.innerHTML = '<span style="font-size:12px;opacity:0.6;">Empty list</span>';
                }

                const leaveBtn = listDiv.querySelector('.leave-shared-list-btn');
                if (leaveBtn) {
                    leaveBtn.addEventListener('click', async () => {
                        if (!confirm(`Leave "${list.name}"?`)) return;

                        const r = await fetch(`/api/dashboard/lists/${list.id}/leave`, {
                            method: 'DELETE',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        if (r.ok) await renderSharedListsTab(friendEmail, contentEl);
                        else {
                            const d = await r.json().catch(() => ({}));
                            alert(d.message || 'Could not leave list.');
                        }
                    });
                }

                contentEl.appendChild(listDiv);
            });
        } catch (err) {
            contentEl.innerHTML = '<p class="empty-message">Failed to load shared lists.</p>';
        }
    }

    async function renderInlineMessages(email, contentEl, messagesBtn) {
        contentEl.innerHTML = '<p class="empty-message">Loading...</p>';

        try {
            const [msgRes, recRes] = await Promise.all([
                fetch(`/api/friends/${encodeURIComponent(email)}/messages`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`/api/recommendations/between/${encodeURIComponent(email)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            if (!msgRes.ok) {
                contentEl.innerHTML = '<p class="empty-message">Failed to load messages.</p>';
                return;
            }

            const msgData = await msgRes.json();
            const recData = recRes.ok ? await recRes.json() : { recommendations: [] };
            const messages = msgData.messages || [];
            const recs = recData.recommendations || [];
            const myLower = (getMyEmailFromToken() || '').trim().toLowerCase();

            let recPosters = {};
            if (recs.length > 0) {
                const posterItems = recs.map((r) => ({ title: r.title, type: r.type || 'movie' }));
                try {
                    recPosters = await DataModel.getPostersForItems(posterItems);
                } catch (_) {}
            }

            const timeline = [
                ...messages.map((m) => ({ ...m, _kind: 'message', _time: new Date(m.sent_at) })),
                ...recs.map((r) => ({ ...r, _kind: 'rec', _time: new Date(r.sent_at) }))
            ].sort((a, b) => a._time - b._time);

            const timelineHtml = timeline.length === 0
                ? '<p class="empty-message">No messages yet. Say something!</p>'
                : timeline.map((item) => {
                      const isMine = myLower && String(item.sender_email || '').trim().toLowerCase() === myLower;

                      if (item._kind === 'message') {
                          return `
                              <div class="message-bubble ${isMine ? 'mine' : 'theirs'}">
                                  <p>${escapeHtml(item.content)}</p>
                                  <span class="message-time">${item._time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                          `;
                      }

                      const typeLabel = item.type === 'show' ? 'TV Show' : 'Movie';
                      const posterPath = recPosters[`${item.title}|${item.type || 'movie'}`];
                      const posterHtml = posterPath
                          ? `<img src="https://image.tmdb.org/t/p/w92${posterPath}" alt="${escapeHtml(item.title)}" class="rec-msg-poster">`
                          : `<div class="rec-msg-poster rec-msg-poster-ph"></div>`;

                      return `
                          <div class="rec-message-card ${isMine ? 'mine' : 'theirs'}">
                              <div class="rec-message-label">🎬 ${isMine ? 'You recommended' : 'Recommended to you'}</div>
                              <div class="rec-message-body">
                                  ${posterHtml}
                                  <div class="rec-message-info">
                                      <strong>${escapeHtml(item.title)}</strong>
                                      <span class="type-badge">${typeLabel}</span>
                                      ${item.note ? `<p class="rec-note">"${escapeHtml(item.note)}"</p>` : ''}
                                  </div>
                              </div>
                              <span class="message-time">${item._time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                      `;
                  }).join('');

            contentEl.innerHTML = `
                <div class="messages-list">${timelineHtml}</div>
                <div class="message-input-row" style="margin-top:8px;">
                    <input type="text" class="inline-message-input" placeholder="Send a message...">
                    <button type="button" class="primary-btn inline-send-btn">Send</button>
                    <button type="button" class="inline-rec-toggle-btn" title="Recommend a movie or show">🎬</button>
                </div>
                <div class="inline-rec-form" style="display:none;margin-top:8px;padding:10px;background:rgba(0,0,0,0.2);border-radius:10px;flex-direction:column;gap:8px;">
                    <strong style="font-size:13px;">Recommend a title</strong>
                    <div class="inline-rec-search-wrap"></div>
                    <input type="text" class="inline-rec-note inline-message-input" placeholder="Add a note (optional)...">
                </div>
            `;

            const msgList = contentEl.querySelector('.messages-list');
            if (msgList) msgList.scrollTop = msgList.scrollHeight;

            const input = contentEl.querySelector('.inline-message-input');
            const sendBtn = contentEl.querySelector('.inline-send-btn');
            const recToggleBtn = contentEl.querySelector('.inline-rec-toggle-btn');
            const recForm = contentEl.querySelector('.inline-rec-form');
            const recNote = contentEl.querySelector('.inline-rec-note');
            const recSearchWrap = contentEl.querySelector('.inline-rec-search-wrap');

            recToggleBtn.addEventListener('click', () => {
                const open = recForm.style.display === 'flex';
                recForm.style.display = open ? 'none' : 'flex';
            });

            buildFriendsInlineSearch(recSearchWrap, 'Search a movie or show to recommend...', async ({ title, type }) => {
                const note = recNote.value.trim();
                const result = await DataModel.sendRecommendation(email, title, type, note);

                if (result.ok) {
                    recNote.value = '';
                    recForm.style.display = 'none';
                    await renderInlineMessages(email, contentEl, messagesBtn);
                } else {
                    alert(result?.data?.message || 'Could not send recommendation.');
                }
            });

            const sendMessage = async () => {
                const content = input?.value?.trim();
                if (!content) return;

                try {
                    const res = await fetch('/api/friends/message', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
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
            input?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage();
            });

            try {
                await fetch(`/api/friends/${encodeURIComponent(email)}/messages/read`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (_) {}

            for (const rec of recs) {
                if (!rec.read_at && String(rec.receiver_email || '').trim().toLowerCase() === myLower) {
                    DataModel.markRecommendationRead(rec.id).catch(() => {});
                }
            }

            setInlineMessagesBadge(messagesBtn, 0);
            await syncMessageBadgesFromSummary();
        } catch (err) {
            contentEl.innerHTML = '<p class="empty-message">Failed to load messages.</p>';
        }
    }

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
        } catch (err) {}
    }

    setInterval(tickFriendNotifications, 5000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') tickFriendNotifications();
    });

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