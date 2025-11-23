// static/js/auth.js

// Toggle genre chip active state
function setupGenreChips() {
    const chips = document.querySelectorAll('.genre-chips .genre-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
        });
    });
}

// Get selected genres from a container
function getSelectedGenres(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.genre-chip.active'))
        .map(btn => btn.dataset.genre);
}

// Handle Register
async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const favoriteGenres = getSelectedGenres('register-genres');

    if (!username || !email || !password) {
        alert('Please fill all fields.');
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username,
                email,
                password,
                favorite_genres: favoriteGenres
            })
        });

        const data = await res.json();
        alert(data.message || 'Registration completed.');

        if (data.status === 'success') {
            // After sign-up, go to login
            window.location.href = '/login';
        }
    } catch (err) {
        console.error('Register error:', err);
        alert('Error registering. Please try again.');
    }
}

// Handle Login
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const favoriteGenres = getSelectedGenres('login-genres'); // may be empty

    if (!email || !password) {
        alert('Please enter email and password.');
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                email,
                password,
                favorite_genres: favoriteGenres
            })
        });

        const data = await res.json();
        alert(data.message || 'Login result.');

        if (data.status === 'success') {
            // Go to main CineFlix home
            window.location.href = '/';
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Error logging in. Please try again.');
    }
}

// Init on each auth page
document.addEventListener('DOMContentLoaded', () => {
    setupGenreChips();
});