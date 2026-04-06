(function (global) {
    function closeModal() {
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

        const dateFromApi = isTv ? d.first_air_date : d.release_date;
        const yr = yearFromDateStr(dateFromApi) || yearFallback;
        if (yr) addPill(row, yr);

        const votes = typeof d.vote_average === 'number' ? d.vote_average : item.vote_average;
        const rt = ratingPillText(votes);
        if (rt) addPill(row, rt);

        if (isTv) {
            const epMins = d.episode_runtime_minutes;
            if (epMins) {
                const fr = formatRuntime(epMins);
                if (fr) addPill(row, `~${fr} / ep`);
            }

            const ns = d.number_of_seasons;
            if (typeof ns === 'number' && ns > 0) {
                addPill(row, ns === 1 ? '1 season' : `${ns} seasons`);
            }
        } else if (d.runtime) {
            const fr = formatRuntime(d.runtime);
            if (fr) addPill(row, fr);
        }

        const genres = Array.isArray(d.genres) ? d.genres.slice(0, 5) : [];
        genres.forEach((g) => addPill(row, g));

        if (!row.children.length) {
            renderPillsFallback(row, item, yearFallback);
        }
    }

    function setCommunityLoading(container) {
        container.innerHTML = '';
        container.className = 'title-detail-community title-detail-community--loading';
        container.setAttribute('aria-busy', 'true');
        const p = document.createElement('p');
        p.className = 'title-detail-community-loading-text';
        p.textContent = 'Loading community ratings…';
        container.appendChild(p);
    }

    function renderCommunityRatings(container, data, isError) {
        container.setAttribute('aria-busy', 'false');
        container.classList.remove('title-detail-community--loading');
        container.innerHTML = '';
        if (isError || !data || typeof data.global !== 'object' || typeof data.friends !== 'object') {
            container.classList.add('title-detail-community--error');
            const p = document.createElement('p');
            p.textContent = 'Rating data unavailable';
            container.appendChild(p);
            return;
        }
        container.classList.remove('title-detail-community--error');
        const g = data.global;
        const f = data.friends;
        const p1 = document.createElement('p');
        p1.className = 'title-detail-community-line';
        p1.textContent =
            g.count > 0
                ? `Community: ★ ${g.average} (${g.count} rating${g.count === 1 ? '' : 's'})`
                : 'Community: No ratings yet';
        const p2 = document.createElement('p');
        p2.className = 'title-detail-community-line';
        p2.textContent =
            f.count > 0
                ? `Friends: ★ ${f.average} (${f.count} rating${f.count === 1 ? '' : 's'})`
                : 'Friends: No friend ratings yet';
        container.appendChild(p1);
        container.appendChild(p2);
    }

    async function populateCommunityRatings(container, title, typeMovieOrShow) {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jwtToken') : null;
        if (!token || !title || title === 'Untitled') {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }
        container.style.display = '';
        setCommunityLoading(container);
        try {
            const data =
                typeof DataModel !== 'undefined' && DataModel.getRatingSummary
                    ? await DataModel.getRatingSummary(title, typeMovieOrShow)
                    : null;
            renderCommunityRatings(container, data, !data);
        } catch {
            renderCommunityRatings(container, null, true);
        }
    }

    async function populatePills(pillRow, item, isTv, yearFallback) {
        const id = item.id;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jwtToken') : null;

        if (!id || !token) {
            renderPillsFallback(pillRow, item, yearFallback);
            return;
        }

        try {
            const type = isTv ? 'tv' : 'movie';
            const res = await fetch(
                `/api/tmdb/details?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            if (!res.ok) throw new Error('details failed');

            const d = await res.json();
            renderPillsFromDetail(pillRow, d, item, isTv, yearFallback);
        } catch {
            renderPillsFallback(pillRow, item, yearFallback);
        }
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

        const communityRow = document.createElement('div');
        communityRow.className = 'title-detail-community';

        const synLabel = document.createElement('p');
        synLabel.className = 'title-detail-synopsis-label';
        synLabel.textContent = 'About';

        const syn = document.createElement('p');
        syn.className = 'title-detail-overview';
        syn.textContent = overview;

        const openPageBtn = document.createElement('button');
        openPageBtn.type = 'button';
        openPageBtn.className = 'title-detail-open-page-btn';
        openPageBtn.textContent = 'View connected titles';
        openPageBtn.addEventListener('click', () => {
            window.location.href = `/title-details?id=${encodeURIComponent(item.id)}&type=${encodeURIComponent(pageType)}`;
        });

        textCol.appendChild(kind);
        textCol.appendChild(h);
        textCol.appendChild(pillRow);
        textCol.appendChild(communityRow);
        textCol.appendChild(synLabel);
        textCol.appendChild(syn);
        textCol.appendChild(openPageBtn);

        body.appendChild(posterWrap);
        body.appendChild(textCol);

        panel.appendChild(closeBtn);
        panel.appendChild(body);
        overlay.appendChild(panel);
        overlay.addEventListener('click', closeModal);

        document.body.appendChild(overlay);
        void populatePills(pillRow, item, isTv, year);
        void populateCommunityRatings(communityRow, title, pageType);
    }

    global.openTitleDetailModal = openTitleDetailModal;
    global.closeTitleDetailModal = closeModal;
})(typeof window !== 'undefined' ? window : globalThis);