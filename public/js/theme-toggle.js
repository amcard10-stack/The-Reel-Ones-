(function () {
    const STORAGE_KEY = 'rollTheTapesTheme';

    function getTheme() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function setTheme(mode) {
        if (mode === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch (_) {}
        syncMeta();
        updateToggleButton();
    }

    function syncMeta() {
        var m = document.querySelector('meta[name="theme-color"]');
        if (!m) return;
        m.content = getTheme() === 'light' ? '#f2ece3' : '#0a1a2f';
    }

    function updateToggleButton() {
        var btn = document.getElementById('theme-toggle');
        if (!btn) return;
        var light = getTheme() === 'light';
        btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
        btn.innerHTML = light ? '\u263E' : '\u2600';
        btn.title = light ? 'Dark mode' : 'Light mode';
    }

    function toggle() {
        setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    }

    function mount() {
        if (document.getElementById('theme-toggle')) {
            updateToggleButton();
            return;
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'theme-toggle';
        btn.className = 'theme-toggle-btn';
        document.body.appendChild(btn);
        btn.addEventListener('click', toggle);
        updateToggleButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }

    syncMeta();
})();
