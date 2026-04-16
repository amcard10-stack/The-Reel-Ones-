(function (global) {
    let modalPillFetchGen = 0;

    function closeModal() {
        if (document.getElementById('titleDetailModalRoot')) {
            modalPillFetchGen += 1;
        }
        document.getElementById('titleDetailModalRoot')?.remove();
    }

    function formatRuntime(totalMins) {
        if (totalMins == null || totalMins <= 0 || Number.isNaN(totalMins)) return null;
        const m = Math.round(Number(totalMins));
        const h = Math.floor(m / 60);
        const min = m % 60;
        if (h === 0) return `${min}m`;
        if (min === 0) return `${h}h`;
        return `${h}h ${min}m`;
    }

    function yearFromDateStr(d) {
        if (!d || String(d).length < 4) return null;
        return String(d).slice(0, 4);
    }

    function addPill(row, text) {
        const span = document.createElement('span');
        span.className = 'title-detail-pill';
        span.textContent = text;
        row.appendChild(span);
    }

    function clearPills(row) {
        row.textContent = '';
        row.classList.remove('title-detail-pills--loading');
        row.setAttribute('aria-busy', 'false');
    }

    function ratingPillText(votes) {
        if (typeof votes !== 'number' || Number.isNaN(votes)) return null;
        return `★ ${votes.toFixed(1)}`;
    }

    function renderPillsFallback(row, item, yearFallback) {
        clearPills(row);

        if (yearFallback) addPill(row, yearFallback);

        const r = ratingPillText(item.vote_average);
        if (r) addPill(row, r);

        if (!row.children.length) addPill(row, '—');
    }

    function renderPillsFromDetail(row, d, item, isTv, yearFallback) {
        clearPills(row);

        const dateFromApi = isTv ? d.first_air_date || d.releaseDate : d.release_date || d.releaseDate;
        const yr = yearFromDateStr(dateFromApi) || yearFallback;
        if (yr) addPill(row, yr);

        const votes =
            typeof d.vote_average === 'number'
                ? d.vote_average
                : typeof d.voteAverage === 'number'
                ? d.voteAverage
                : item.vote_average;

        const rt = ratingPillText(votes);
        if (rt) addPill(row, rt);

        if (isTv) {
            const epMins = d.episode_runtime_minutes || d.runtime;
            if (epMins) {
                const fr = formatRuntime(epMins);
                if (fr) addPill(row, fr);
            }

            const ns = d.number_of_seasons || d.numberOfSeasons;
            if (typeof ns === 'number' && ns > 0) {
                addPill(row, ns === 1 ? '1 season' : `${ns} seasons`);
            }
        } else {
            const runtime = d.runtime;
            if (runtime) {
                const fr = formatRuntime(runtime);
                if (fr) addPill(row, fr);
            }
        }

        const genres =
            Array.isArray(d.genres)
                ? d.genres.map((g) => (typeof g === 'string' ? g : g?.name)).filter(Boolean).slice(0, 6)
                : [];

        genres.forEach((g) => addPill(row, g));

        if (!row.children.length) {
            renderPillsFallback(row, item, yearFallback);
        }
    }

    function friendsPillText(summary) {
        if (!summary || typeof summary.friends !== 'object') {
            return 'Friends: unavailable';
        }
        const f = summary.friends;
        if (f.count > 0) {
            const n = f.count;
            return `Friends ★ ${f.average} (${n} rating${n === 1 ? '' : 's'})`;
        }
        return 'No friend ratings yet';
    }

    async function populatePills(pillRow, item, isTv, yearFallback, displayTitle, pageType) {
        const id = item.id;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jwtToken') : null;
        const gen = ++modalPillFetchGen;

        const friendsPromise =
            token &&
            displayTitle &&
            displayTitle !== 'Untitled' &&
            typeof DataModel !== 'undefined' &&
            DataModel.getRatingSummary
                ? DataModel.getRatingSummary(displayTitle, pageType)
                : Promise.resolve({ friends: { average: null, count: 0 } });

        let d = null;
        if (id && token) {
            try {
                const res = await fetch(
                    `/api/title/details?id=${encodeURIComponent(id)}&type=${encodeURIComponent(pageType)}`,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );
                if (res.ok) {
                    d = await res.json();
                }
            } catch {
                d = null;
            }
        }

        let friendsSummary;
        try {
            friendsSummary = await friendsPromise;
        } catch {
            friendsSummary = null;
        }

        if (gen !== modalPillFetchGen) return;

        if (d) {
            renderPillsFromDetail(pillRow, d, item, isTv, yearFallback);
        } else {
            renderPillsFallback(pillRow, item, yearFallback);
        }

        addPill(pillRow, friendsPillText(friendsSummary));
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
            const chip = document.createElement('span');
            chip.className = 'watch-provider-chip';
            chip.textContent = provider;
            content.appendChild(chip);
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
        const dateStr = isTv ? item.first_air_date : item.release_date;
        const year = yearFromDateStr(dateStr);
        const overview =
            (item.overview && String(item.overview).trim()) ||
            'No synopsis is available for this title yet.';

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

        const pillRow = document.createElement('div');
        pillRow.className = 'title-detail-pills title-detail-pills--loading';
        pillRow.setAttribute('aria-busy', 'true');
        pillRow.textContent = 'Loading details…';

        const providersWrap = document.createElement('div');
        providersWrap.className = 'where-to-watch-block';
        providersWrap.innerHTML = '<p class="where-to-watch-empty">Loading where to watch...</p>';

        const aboutLabel = document.createElement('p');
        aboutLabel.className = 'title-detail-synopsis-label';
        aboutLabel.textContent = 'About';

        const syn = document.createElement('p');
        syn.className = 'title-detail-overview';
        syn.textContent = overview;

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
        textCol.appendChild(pillRow);
        textCol.appendChild(providersWrap);
        textCol.appendChild(aboutLabel);
        textCol.appendChild(syn);
        textCol.appendChild(buttonRow);
        textCol.appendChild(recommendForm);

        body.appendChild(posterWrap);
        body.appendChild(textCol);

        panel.appendChild(closeBtn);
        panel.appendChild(body);
        overlay.appendChild(panel);
        overlay.addEventListener('click', closeModal);

        document.body.appendChild(overlay);

        populatePills(pillRow, item, isTv, year, title, pageType);

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