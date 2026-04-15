(function (global) {
    function closeModal() {
        document.getElementById('titleDetailModalRoot')?.remove();
    }

    function createProviderChip(text) {
        const chip = document.createElement('span');
        chip.className = 'watch-provider-chip';

        const icon = document.createElement('span');
        icon.className = 'watch-provider-icon';
        icon.textContent = '▶';

        const label = document.createElement('span');
        label.textContent = text;

        chip.appendChild(icon);
        chip.appendChild(label);

        return chip;
    }

    function renderWhereToWatch(container, providersData) {
        container.innerHTML = '';

        const heading = document.createElement('p');
        heading.className = 'where-to-watch-label';
        heading.textContent = 'Where to Watch';

        if (
            !providersData ||
            !providersData.available ||
            !Array.isArray(providersData.providers) ||
            providersData.providers.length === 0
        ) {
            const empty = document.createElement('p');
            empty.className = 'where-to-watch-empty';
            empty.textContent = 'Not available right now.';
            container.appendChild(heading);
            container.appendChild(empty);
            return;
        }

        const content = document.createElement('div');
        content.className = 'where-to-watch-content';

        providersData.providers.forEach((provider) => {
            content.appendChild(createProviderChip(provider));
        });

        container.appendChild(heading);
        container.appendChild(content);
    }

    async function loadProviders(id, pageType) {
        const token = localStorage.getItem('jwtToken');
        if (!token || !id) return null;

        const res = await fetch(
            `/api/title/providers?id=${encodeURIComponent(id)}&type=${encodeURIComponent(pageType)}`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        );

        if (!res.ok) {
            throw new Error('Failed to load providers');
        }

        return await res.json();
    }

    function openTitleDetailModal(item, mediaType) {
        if (!item) return;
        closeModal();

        const isTv = mediaType === 'tv';
        const pageType = isTv ? 'show' : 'movie';
        const title = isTv ? item.name || 'Untitled' : item.title || 'Untitled';

        const overlay = document.createElement('div');
        overlay.id = 'titleDetailModalRoot';
        overlay.className = 'title-detail-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', title);

        const panel = document.createElement('div');
        panel.className = 'title-detail-panel';
        panel.addEventListener('click', (e) => e.stopPropagation());

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'title-detail-close';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', closeModal);

        const body = document.createElement('div');
        body.className = 'title-detail-body';

        const posterWrap = document.createElement('div');
        posterWrap.className = 'title-detail-poster-wrap';

        if (item.poster_path) {
            const img = document.createElement('img');
            img.className = 'title-detail-poster';
            img.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
            img.alt = title;
            posterWrap.appendChild(img);
        } else {
            const ph = document.createElement('div');
            ph.className = 'title-detail-poster-placeholder';
            ph.textContent = 'No poster';
            posterWrap.appendChild(ph);
        }

        const textCol = document.createElement('div');
        textCol.className = 'title-detail-text';

        const kind = document.createElement('p');
        kind.className = 'title-detail-kind';
        kind.textContent = isTv ? 'TV series' : 'Movie';

        const h = document.createElement('h2');
        h.className = 'title-detail-title';
        h.textContent = title;

        const providersWrap = document.createElement('div');
        providersWrap.className = 'where-to-watch-block';
        providersWrap.innerHTML = '<p class="where-to-watch-empty">Loading where to watch...</p>';

        const buttonRow = document.createElement('div');
        buttonRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;';

        const openPageBtn = document.createElement('button');
        openPageBtn.type = 'button';
        openPageBtn.className = 'title-detail-open-page-btn';
        openPageBtn.textContent = 'View connected titles';
        openPageBtn.addEventListener('click', () => {
            window.location.href = `/title-details?id=${encodeURIComponent(item.id)}&type=${encodeURIComponent(pageType)}`;
        });

        const recommendBtn = document.createElement('button');
        recommendBtn.type = 'button';
        recommendBtn.className = 'title-detail-open-page-btn';
        recommendBtn.textContent = 'Recommend to a Friend';

        const recommendForm = document.createElement('div');
        recommendForm.style.cssText = 'display:none;margin-top:10px;flex-direction:column;gap:8px;';

        const friendSelect = document.createElement('select');
        friendSelect.style.cssText =
            'padding:6px;border-radius:6px;border:none;background:#1a3a6b;color:#F2F4F7;';
        friendSelect.innerHTML = '<option value="">Select a friend...</option>';

        const noteInput = document.createElement('textarea');
        noteInput.placeholder = 'Add a note (optional)...';
        noteInput.rows = 2;
        noteInput.style.cssText =
            'padding:6px;border-radius:6px;border:none;background:#1a3a6b;color:#F2F4F7;resize:vertical;';

        const sendRow = document.createElement('div');
        sendRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.textContent = 'Send';
        sendBtn.style.cssText =
            'padding:6px 14px;border-radius:6px;border:none;background:#3A6EA5;color:#fff;cursor:pointer;';

        const feedback = document.createElement('span');
        feedback.style.cssText = 'font-size:13px;color:#9bc;';

        sendRow.appendChild(sendBtn);
        sendRow.appendChild(feedback);
        recommendForm.appendChild(friendSelect);
        recommendForm.appendChild(noteInput);
        recommendForm.appendChild(sendRow);

        let friendsLoaded = false;

        recommendBtn.addEventListener('click', async () => {
            const open = recommendForm.style.display === 'flex';
            recommendForm.style.display = open ? 'none' : 'flex';

            if (!friendsLoaded) {
                friendSelect.innerHTML = '<option value="">Loading friends...</option>';
                const token = localStorage.getItem('jwtToken');

                if (token && typeof DataModel !== 'undefined' && DataModel.getFriends) {
                    const friends = await DataModel.getFriends();
                    friendsLoaded = true;

                    if (!Array.isArray(friends) || friends.length === 0) {
                        friendSelect.innerHTML = '<option value="">No friends yet</option>';
                    } else {
                        friendSelect.innerHTML =
                            '<option value="">Select a friend...</option>' +
                            friends
                                .map((f) => {
                                    const name =
                                        f.firstName || f.lastName
                                            ? `${f.firstName || ''} ${f.lastName || ''}`.trim()
                                            : f.email;
                                    return `<option value="${f.email}">${name}</option>`;
                                })
                                .join('');
                    }
                }
            }
        });

        sendBtn.addEventListener('click', async () => {
            const receiverEmail = friendSelect.value;
            if (!receiverEmail) {
                feedback.textContent = 'Pick a friend first.';
                return;
            }

            sendBtn.disabled = true;
            feedback.textContent = 'Sending...';

            const result = await DataModel.sendRecommendation(
                receiverEmail,
                title,
                pageType,
                noteInput.value.trim()
            );

            sendBtn.disabled = false;

            if (result.ok) {
                feedback.textContent = 'Sent!';
                noteInput.value = '';
                friendSelect.value = '';
                setTimeout(() => {
                    recommendForm.style.display = 'none';
                    feedback.textContent = '';
                }, 2000);
            } else {
                feedback.textContent = result?.data?.message || 'Could not send.';
            }
        });

        buttonRow.appendChild(openPageBtn);
        buttonRow.appendChild(recommendBtn);

        textCol.appendChild(kind);
        textCol.appendChild(h);
        textCol.appendChild(providersWrap);
        textCol.appendChild(buttonRow);
        textCol.appendChild(recommendForm);

        body.appendChild(posterWrap);
        body.appendChild(textCol);

        panel.appendChild(closeBtn);
        panel.appendChild(body);
        overlay.appendChild(panel);
        overlay.addEventListener('click', closeModal);

        document.body.appendChild(overlay);

        loadProviders(item.id, pageType)
            .then((providersData) => {
                renderWhereToWatch(providersWrap, providersData);
            })
            .catch((error) => {
                console.error(error);
                providersWrap.innerHTML = '';

                const heading = document.createElement('p');
                heading.className = 'where-to-watch-label';
                heading.textContent = 'Where to Watch';

                const empty = document.createElement('p');
                empty.className = 'where-to-watch-empty';
                empty.textContent = 'Could not load provider info.';

                providersWrap.appendChild(heading);
                providersWrap.appendChild(empty);
            });
    }

    global.openTitleDetailModal = openTitleDetailModal;
    global.closeTitleDetailModal = closeModal;
})(typeof window !== 'undefined' ? window : globalThis);