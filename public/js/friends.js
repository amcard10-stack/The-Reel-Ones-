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

    // SEARCH
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

    // FRIEND REQUESTS
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

    // FRIENDS LIST
    async function loadFriends() {
        try {
            const res = await fetch('/api/friends', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const friends = data.friends || [];
            friendsList.innerHTML = '';

            if (friends.length === 0) {
                friendsList.innerHTML = '<p class="empty-message">No friends yet. Search for users to add.</p>';
                return;
            }

            friends.forEach(friend => {
                const div = document.createElement('div');
                div.classList.add('friend-card');

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
                            <button class="tab-inline-btn messages-btn">Messages</button>
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
                    await renderInlineMessages(friend.email, contentEl);
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

    async function renderInlineMessages(email, contentEl) {
        contentEl.innerHTML = '<p class="empty-message">Loading...</p>';
        try {
            const res = await fetch(`/api/friends/${encodeURIComponent(email)}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const messages = data.messages || [];
            const myEmail = getMyEmailFromToken();

            const messagesHtml = messages.length === 0
                ? '<p class="empty-message">No messages yet. Say something!</p>'
                : messages.map(m => {
                    const isMine = m.sender_email === myEmail;
                    return `
                        <div class="message-bubble ${isMine ? 'mine' : 'theirs'}">
                            <p>${m.content}</p>
                            <span class="message-time">${new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    `;
                }).join('');

            contentEl.innerHTML = `
                <div class="messages-list">${messagesHtml}</div>
                <div class="message-input-row" style="margin-top:8px;">
                    <input type="text" class="inline-message-input" placeholder="Send a message...">
                    <button class="primary-btn inline-send-btn">Send</button>
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
                        await renderInlineMessages(email, contentEl);
                    } else {
                        const data = await res.json().catch(() => ({}));
                        alert(data.message || 'Could not send message.');
                    }
                } catch (err) {
                    console.error(err);
                }
            };

            sendBtn?.addEventListener('click', sendMessage);
            input?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

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
        } catch (err) {
            // ignore
        }
    }

    setInterval(pollPendingRequestCount, 10000);

    loadPendingRequests();
    loadFriends();
});