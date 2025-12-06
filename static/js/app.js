// ========== GLOBAL STATE ==========
let allMovies = [];
let parallelUniverseMode = false;
let currentSelectedMovie = null;

let isLoggedIn = false;
window.currentUserName = null; // used also by chatbot.js

const FILTER_STORAGE_PREFIX = 'cineflix_filters_';

// Preference chips (profile)
let selectedGenres = new Set();

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();

    // Make sure nav reflects login state
    setupHeaderScrollEffect();
    setupEventListeners();
    setupPreferenceChips();

    // Restore last search/filters if any
    restoreFiltersAndSearch();
    // Load movie catalogue (uses prefs on backend)
    await loadMovies();
});

// ========== AUTH / NAV UI ==========
async function checkAuthStatus() {
    try {
        const res = await fetch('/api/auth-status');
        const data = await res.json();
        isLoggedIn = !!data.logged_in;
        window.currentUserName = data.username || null;
    } catch (err) {
        console.error('auth-status error:', err);
        isLoggedIn = false;
        window.currentUserName = null;
    }

    updateNavForAuth();
}

function updateNavForAuth() {
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const userMenu = document.getElementById('user-menu');
    const usernameSpan = document.getElementById('username-display');
    const avatarSpan = document.getElementById('user-avatar');

    if (!loginBtn || !signupBtn || !userMenu) return;

    if (isLoggedIn && window.currentUserName) {
        // Show user menu, hide auth buttons
        loginBtn.style.display = 'none';
        signupBtn.style.display = 'none';
        userMenu.style.display = 'inline-block';

        const name = window.currentUserName;
        const initial = name.charAt(0).toUpperCase();

        if (usernameSpan) usernameSpan.textContent = name;
        if (avatarSpan) avatarSpan.textContent = initial;
    } else {
        // Not logged in (we usually won't be here on index because of backend redirect)
        loginBtn.style.display = 'inline-block';
        signupBtn.style.display = 'inline-block';
        userMenu.style.display = 'none';
    }

    // Dropdown open/close
    const toggle = document.getElementById('user-menu-toggle');
    const dropdown = document.getElementById('user-dropdown');

    if (toggle && dropdown) {
        toggle.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        };

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!toggle.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });
    }
}

async function logoutUser() {
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
        console.error('logout error:', err);
    }

    isLoggedIn = false;
    window.currentUserName = null;
    localStorage.clear();
    window.location.href = '/login';
}

// ========== HEADER SCROLL EFFECT ==========
function setupHeaderScrollEffect() {
    const header = document.querySelector('.header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    });
}

// ========== GENERIC EVENT LISTENERS ==========
function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const songInput = document.getElementById('song-input');

    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchMovies();
        });
    }

    if (songInput) {
        songInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') analyzeSong();
        });
    }
}

// ========== FILTER PERSISTENCE ==========
function getFilterStorageKey() {
    const name = window.currentUserName || 'guest';
    return `${FILTER_STORAGE_PREFIX}${name}`;
}

function saveFiltersToStorage() {
    const q = document.getElementById('search-input')?.value || '';
    const genre = document.getElementById('genre-filter')?.value || '';
    const ott = document.getElementById('ott-filter')?.value || '';

    const payload = { search: q, genre, ott };
    try {
        localStorage.setItem(getFilterStorageKey(), JSON.stringify(payload));
    } catch (err) {
        console.warn('Could not save filters:', err);
    }
}

function restoreFiltersAndSearch() {
    let raw;
    try {
        raw = localStorage.getItem(getFilterStorageKey());
    } catch {
        raw = null;
    }
    if (!raw) return;

    try {
        const { search, genre, ott } = JSON.parse(raw);
        const s = document.getElementById('search-input');
        const g = document.getElementById('genre-filter');
        const o = document.getElementById('ott-filter');

        if (s && typeof search === 'string') s.value = search;
        if (g && typeof genre === 'string') g.value = genre;
        if (o && typeof ott === 'string') o.value = ott;

        searchMovies(); // run search with restored filters
    } catch (err) {
        console.error('Error restoring filters:', err);
    }
}

// ========== MOVIES API / DISPLAY ==========
async function loadMovies() {
    try {
        const response = await fetch('/api/movies');
        allMovies = await response.json();
        displayMovies(allMovies);
    } catch (error) {
        console.error('Error loading movies:', error);
    }
}

function displayMovies(movies) {
    const container = document.getElementById('movies-container');
    if (!container) return;

    if (!movies || movies.length === 0) {
        container.innerHTML =
            '<div style="text-align:center;color:var(--text-secondary);padding:50px;">No movies found. Try different filters.</div>';
        return;
    }

    container.innerHTML = movies.map(movie => `
        <div class="movie-card">
            <div class="movie-poster">
                ${
                    movie.poster_url
                        ? `<img src="${movie.poster_url}" alt="${movie.title}"
                                 style="width:100%;height:100%;object-fit:cover;"
                                 onerror="this.style.display='none';this.parentElement.innerHTML='🎬 ${movie.title}'">`
                        : `🎬 ${movie.title}`
                }
            </div>
            <div class="movie-info">
                <div class="movie-header">
                    <div>
                        <div class="movie-title">${movie.title}</div>
                        <div class="movie-genre">${movie.genre} • ${movie.year}</div>
                    </div>
                    <div class="movie-rating">⭐ ${movie.imdb_rating}</div>
                </div>
                <div class="movie-description">${movie.description}</div>
                <div class="movie-meta">
                    <div class="ott-badge">${movie.ott_platform}</div>
                </div>
                <div class="movie-actions">
                    <button class="action-btn watch-btn"
                        onclick="window.open('https://${getOTTPlatformURL(movie.ott_platform)}','_blank')">Watch Now</button>
                    <button class="action-btn recommend-btn"
                        onclick="getRecommendations('${movie.title.replace(/'/g, "\\'")}', '${movie.genre}')">Similar</button>
                    <button class="action-btn like-btn"
                        onclick="likeMovie('${movie.title.replace(/'/g, "\\'")}', '${movie.genre}')">❤️</button>
                </div>
            </div>
        </div>
    `).join('');
}

function getOTTPlatformURL(platform) {
    const urls = {
        'Netflix': 'www.netflix.com',
        'Prime Video': 'www.primevideo.com',
        'Disney+': 'www.disneyplus.com',
        'HBO Max': 'www.hbomax.com',
        'Hulu': 'www.hulu.com'
    };
    return urls[platform] || 'www.google.com/search?q=' + encodeURIComponent(platform);
}

// ========== SEARCH / FILTER ==========
async function searchMovies() {
    const searchQuery = document.getElementById('search-input')?.value || '';
    const genre = document.getElementById('genre-filter')?.value || '';
    const ott = document.getElementById('ott-filter')?.value || '';

    try {
        const params = new URLSearchParams();
        if (searchQuery) params.append('search', searchQuery);
        if (genre) params.append('genre', genre);
        if (ott) params.append('ott', ott);

        const response = await fetch(`/api/movies?${params.toString()}`);
        const movies = await response.json();
        displayMovies(movies);

        // Hide both rec sections when doing a normal search
        const recSection = document.getElementById('recommendations-section');
        if (recSection) recSection.style.display = 'none';
        const csSection = document.getElementById('cinesound-results');
        if (csSection) csSection.style.display = 'none';

        saveFiltersToStorage();
    } catch (error) {
        console.error('Error searching movies:', error);
    }
}

function filterMovies() {
    searchMovies();
}

// ========== RECOMMENDATIONS / INTERACTIONS ==========
async function getRecommendations(title, genre = '') {
    if (!requireLogin()) return;

    currentSelectedMovie = title;

    if (genre) {
        trackView(title, genre);
    }

    try {
        const endpoint = parallelUniverseMode ? '/api/parallel-universe' : '/api/recommend';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });

        const data = await response.json();

        if (data.recommendations && data.recommendations.length > 0) {
            displayRecommendations(data.recommendations, title);
        } else {
            alert('No recommendations found for this movie.');
        }
    } catch (error) {
        console.error('Error getting recommendations:', error);
        alert('Error getting recommendations. Please try again.');
    }
}

async function trackView(title, genre) {
    try {
        await fetch('/api/view', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, genre })
        });
    } catch (error) {
        console.error('Error tracking view:', error);
    }
}

function displayRecommendations(movies, forTitle) {
    const section = document.getElementById('recommendations-section');
    const titleElement = document.querySelector('.recommendations-title');
    const container = document.getElementById('recommendations-grid');

    if (!section || !titleElement || !container) return;

    const modeText = parallelUniverseMode
        ? '🌌 Parallel Universe Recommendations'
        : 'Recommended';

    titleElement.textContent = `${modeText} for "${forTitle}"`;

    container.innerHTML = movies.map(movie => `
        <div class="movie-card">
            <div class="movie-poster">
                ${
                    movie.poster_url
                        ? `<img src="${movie.poster_url}" alt="${movie.title}"
                                 style="width:100%;height:100%;object-fit:cover;"
                                 onerror="this.style.display='none';this.parentElement.innerHTML='🎬 ${movie.title}'">`
                        : `🎬 ${movie.title}`
                }
            </div>
            <div class="movie-info">
                <div class="movie-header">
                    <div>
                        <div class="movie-title">${movie.title}</div>
                        <div class="movie-genre">${movie.genre} • ${movie.year}</div>
                    </div>
                    <div class="movie-rating">⭐ ${movie.imdb_rating}</div>
                </div>
                <div class="movie-description">${movie.description}</div>
                <div class="movie-meta">
                    <div class="ott-badge">${movie.ott_platform}</div>
                </div>
                <div class="movie-actions">
                    <button class="action-btn watch-btn"
                        onclick="window.open('https://${getOTTPlatformURL(movie.ott_platform)}','_blank')">Watch Now</button>
                    <button class="action-btn recommend-btn"
                        onclick="getRecommendations('${movie.title.replace(/'/g, "\\'")}', '${movie.genre}')">Similar</button>
                    <button class="action-btn like-btn"
                        onclick="likeMovie('${movie.title.replace(/'/g, "\\'")}', '${movie.genre}')">❤️</button>
                </div>
            </div>
        </div>
    `).join('');

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Hide CineSound results when showing "Similar" recommendations
    const csSection = document.getElementById('cinesound-results');
    if (csSection) csSection.style.display = 'none';
}

// Parallel Universe toggle
function toggleParallelUniverse() {
    parallelUniverseMode = !parallelUniverseMode;

    const button = document.querySelector('.parallel-universe-toggle');
    const overlay = document.getElementById('glitch-overlay');
    const modeText = document.getElementById('universe-mode-text');

    if (!button || !overlay || !modeText) return;

    if (parallelUniverseMode) {
        button.classList.add('active');
        overlay.classList.add('active');
        modeText.textContent = '🌌 Parallel Universe ON';
    } else {
        button.classList.remove('active');
        overlay.classList.remove('active');
        modeText.textContent = '🌌 Parallel Universe OFF';
    }

    if (currentSelectedMovie) {
        getRecommendations(currentSelectedMovie);
    }
}

// ========== CINESOUND ==========
async function analyzeSong() {
    if (!requireLogin()) return;

    const songInput = document.getElementById('song-input');
    const songName = songInput.value.trim();

    if (!songName) {
        alert('Please enter a song name, lyrics, or description');
        return;
    }

    const moodDisplay = document.getElementById('mood-display');
    moodDisplay.textContent = '🎵 Analyzing song vibe...';

    try {
        const response = await fetch('/api/cinesound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ song: songName })
        });

        const data = await response.json();

        if (data.status !== 'success') {
            moodDisplay.textContent = '❌ Error analyzing song.';
            return;
        }

        const keywords = Array.isArray(data.keywords) ? data.keywords : [];
        const kwText = keywords.length
            ? ` | Keywords: ${keywords.join(', ')}`
            : '';

        moodDisplay.textContent =
            `🎵 Detected Mood: ${data.detected_mood.toUpperCase()} | Song: "${data.song}"${kwText}`;

        // render movies in dedicated CineSound section
        const section = document.getElementById('cinesound-results');
        const titleElement = document.getElementById('cinesound-title');
        const container = document.getElementById('cinesound-grid');

        if (!section || !titleElement || !container) return;

        titleElement.textContent = `🎧 Movies matching "${songName}"`;

        if (!data.recommendations || data.recommendations.length === 0) {
            container.innerHTML =
                '<div style="text-align:center;padding:30px;color:#aaa;">No movies found for this song.</div>';
        } else {
            container.innerHTML = data.recommendations.map(movie => `
                <div class="movie-card">
                    <div class="movie-poster">
                        ${
                            movie.poster_url
                                ? `<img src="${movie.poster_url}" alt="${movie.title}"
                                         style="width:100%;height:100%;object-fit:cover;"
                                         onerror="this.style.display='none';this.parentElement.innerHTML='🎬 ${movie.title}'">`
                                : `🎬 ${movie.title}`
                        }
                    </div>
                    <div class="movie-info">
                        <div class="movie-header">
                            <div>
                                <div class="movie-title">${movie.title}</div>
                                <div class="movie-genre">${movie.genre} • ${movie.year}</div>
                            </div>
                            <div class="movie-rating">⭐ ${movie.imdb_rating}</div>
                        </div>
                        <div class="movie-description">${movie.description}</div>
                        <div class="movie-meta">
                            <div class="ott-badge">${movie.ott_platform}</div>
                        </div>
                        <div class="movie-actions">
                            <button class="action-btn watch-btn"
                                onclick="window.open('https://${getOTTPlatformURL(movie.ott_platform)}','_blank')">Watch Now</button>
                            <button class="action-btn recommend-btn"
                                onclick="getRecommendations('${movie.title.replace(/'/g, "\\'")}', '${movie.genre}')">Similar</button>
                            <button class="action-btn like-btn"
                                onclick="likeMovie('${movie.title.replace(/'/g, "\\'")}', '${movie.genre}')">❤️</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // show CineSound section and hide normal recommendations
        section.style.display = 'block';
        const recSection = document.getElementById('recommendations-section');
        if (recSection) recSection.style.display = 'none';

        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        console.error('Error analyzing song:', error);
        moodDisplay.textContent = '❌ Error analyzing song. Please try again.';
    }
}

// ========== LIKE / PROFILE (CINEMATIC DNA) ==========
async function likeMovie(title, genre) {
    if (!requireLogin()) return;

    try {
        await fetch('/api/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, genre })
        });

        if (event && event.target) {
            event.target.textContent = '✓';
            setTimeout(() => {
                event.target.textContent = '❤️';
            }, 800);
        }
    } catch (error) {
        console.error('Error liking movie:', error);
    }
}

async function loadCinematicDNA() {
    if (!requireLogin()) return;

    const chart = document.getElementById('dna-chart');
    const description = document.getElementById('dna-description');
    const stats = document.getElementById('dna-stats');

    chart.innerHTML = '<div class="dna-loading">Loading your profile...</div>';

    try {
        const response = await fetch('/api/profile');
        const data = await response.json();

        const profile = data.profile;
        const categoryLabels = {
            'sci_fi_dreamer': 'Sci-Fi Dreamer',
            'romantic_idealist': 'Romantic Idealist',
            'action_enthusiast': 'Action Enthusiast',
            'comedy_lover': 'Comedy Lover',
            'drama_seeker': 'Drama Seeker'
        };

        const colors = {
            'sci_fi_dreamer': 'linear-gradient(90deg,#667eea,#764ba2)',
            'romantic_idealist': 'linear-gradient(90deg,#f093fb,#f5576c)',
            'action_enthusiast': 'linear-gradient(90deg,#fa709a,#fee140)',
            'comedy_lover': 'linear-gradient(90deg,#30cfd0,#330867)',
            'drama_seeker': 'linear-gradient(90deg,#a8edea,#fed6e3)'
        };

        chart.innerHTML = Object.entries(profile).map(([key, value]) => `
            <div class="dna-bar-container">
                <div class="dna-bar-label">
                    <span>${categoryLabels[key]}</span>
                    <span>${value}%</span>
                </div>
                <div class="dna-bar-bg">
                    <div class="dna-bar-fill" style="width:${value}%;background:${colors[key]}"></div>
                </div>
            </div>
        `).join('');

        description.textContent = data.description;
        stats.textContent = 'Based on your viewing patterns and interactions';
    } catch (error) {
        console.error('Error loading profile:', error);
        chart.innerHTML = '<div class="dna-loading">Error loading profile. Please try again.</div>';
    }
}

// ========== PROFILE SECTIONS / ROUTING ==========
function requireLogin() {
    if (!isLoggedIn) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    if (sectionName === 'home') {
        document.getElementById('home-section').classList.add('active');
    } else if (sectionName === 'profile') {
        document.getElementById('profile-section').classList.add('active');
        loadCinematicDNA();
        loadUserPreferences();   // load genre chips from backend
    }
}

// ========== USER PREFERENCES (PROFILE) ==========

// Setup chip click behaviour (UI only; data in selectedGenres)
function setupPreferenceChips() {
    const container = document.querySelector('.preference-chips');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const chip = e.target.closest('.preference-chip');
        if (!chip) return;
        const genre = chip.dataset.genre;
        if (!genre) return;

        if (selectedGenres.has(genre)) {
            selectedGenres.delete(genre);
        } else {
            selectedGenres.add(genre);
        }
        updatePreferenceChipsUI();
    });
}

function updatePreferenceChipsUI() {
    document.querySelectorAll('.preference-chip').forEach(chip => {
        const genre = chip.dataset.genre;
        chip.classList.toggle('active', selectedGenres.has(genre));
    });
}

// Load saved preferences from backend
async function loadUserPreferences() {
    const container = document.querySelector('.preference-chips');
    if (!container) return;

    try {
        const res = await fetch('/api/user/preferences');
        if (!res.ok) return;

        const data = await res.json();
        const genres = data.genres || data.favorite_genres || [];
        selectedGenres = new Set(genres);
        updatePreferenceChipsUI();
    } catch (err) {
        console.error('Error loading preferences:', err);
    }
}

// Save current chip selection to backend
async function savePreferences() {
    const genres = [...selectedGenres];
    const statusEl = document.getElementById('prefs-status');

    if (statusEl) statusEl.textContent = 'Saving preferences...';

    try {
        const res = await fetch('/api/user/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ genres })
        });

        const data = await res.json();

        if (res.ok && (data.status === 'success' || data.status === 'saved')) {
            if (statusEl) {
                statusEl.textContent = 'Preferences saved ✅';
                setTimeout(() => { statusEl.textContent = ''; }, 2000);
            }

            // Clear filters and reload movies to reflect new prefs
            const s = document.getElementById('search-input');
            const g = document.getElementById('genre-filter');
            const o = document.getElementById('ott-filter');
            if (s) s.value = '';
            if (g) g.value = '';
            if (o) o.value = '';

            await loadMovies();
        } else {
            if (statusEl) {
                statusEl.textContent = data.message || 'Error saving preferences';
            }
        }
    } catch (err) {
        console.error('Error saving preferences:', err);
        if (statusEl) statusEl.textContent = 'Error saving preferences';
    }
}