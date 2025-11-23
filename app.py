from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import timedelta
import os
import sqlite3
import google.generativeai as genai
import json  # for storing preferences as JSON

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'your-secret-key-here')
CORS(app)

# Keep user logged in for 7 days
app.permanent_session_lifetime = timedelta(days=7)

# ========= GEMINI CONFIG =============
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
model = None
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-2.5-pro')
    except Exception as e:
        print(f"Warning: Failed to initialize Gemini API: {e}")
        model = None

# ========= MOVIE DATA =============
movies_df = pd.read_csv('movies.csv')

movies_df['combined_features'] = (
    movies_df['genre'].fillna('') + ' ' +
    movies_df['description'].fillna('') + ' ' +
    movies_df['director'].fillna('') + ' ' +
    movies_df['cast'].fillna('') + ' ' +
    movies_df['keywords'].fillna('')
)

tfidf = TfidfVectorizer(stop_words='english')
tfidf_matrix = tfidf.fit_transform(movies_df['combined_features'])
cosine_sim = cosine_similarity(tfidf_matrix, tfidf_matrix)


# ========= DATABASE =============
def init_db():
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()

    # Movie interactions
    c.execute('''CREATE TABLE IF NOT EXISTS user_interactions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  action TEXT,
                  movie_title TEXT,
                  genre TEXT,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')

    # Preferences table
    # We will store favorite_genres per user_id but column name is session_id in DB.
    c.execute('''CREATE TABLE IF NOT EXISTS user_preferences
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  session_id TEXT,
                  favorite_genres TEXT,
                  watch_history TEXT,
                  ratings TEXT,
                  chatbot_queries TEXT)''')

    # Users
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  email TEXT UNIQUE,
                  password TEXT,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')

    conn.commit()
    conn.close()


init_db()


# ========= HELPER FUNCTIONS =============
def get_recommendations(title, cosine_sim=cosine_sim):
    """Content-based recommendations."""
    try:
        idx = movies_df[movies_df['title'].str.lower() == title.lower()].index[0]
        sim_scores = list(enumerate(cosine_sim[idx]))
        sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)[1:11]
        movie_indices = [i[0] for i in sim_scores]
        return movies_df.iloc[movie_indices].to_dict('records')
    except Exception:
        return []


def get_parallel_universe_recommendations(title):
    """Opposite-genre recommendations."""
    try:
        idx = movies_df[movies_df['title'].str.lower() == title.lower()].index[0]
        original_genre = movies_df.iloc[idx]['genre']

        opposite_genres = {
            'Sci-Fi': ['Romance', 'Comedy'],
            'Action': ['Drama', 'Romance'],
            'Horror': ['Comedy', 'Family'],
            'Drama': ['Action', 'Comedy'],
            'Romance': ['Action', 'Horror'],
            'Comedy': ['Horror', 'Drama'],
            'Thriller': ['Family', 'Romance'],
            'Animation': ['Horror', 'Thriller'],
            'Fantasy': ['Historical', 'Biography']
        }

        main = str(original_genre).split()[0]
        target_genres = opposite_genres.get(main, ['Comedy', 'Drama'])

        opposite_movies = movies_df[movies_df['genre'].str.contains(
            '|'.join(target_genres), case=False, na=False
        )]
        opposite_movies = opposite_movies.sample(min(10, len(opposite_movies)))
        return opposite_movies.to_dict('records')
    except Exception:
        return []


def get_song_to_movie_recommendations(song_name, mood='uplifting'):
    mood_genre_mapping = {
        'uplifting': ['Drama', 'Romance', 'Family'],
        'melancholic': ['Drama', 'Romance'],
        'energetic': ['Action', 'Adventure'],
        'calm': ['Drama', 'Sci-Fi'],
        'dark': ['Horror', 'Thriller'],
        'happy': ['Comedy', 'Family', 'Animation'],
        'sad': ['Drama', 'Romance'],
        'intense': ['Thriller', 'Action']
    }

    target_genres = mood_genre_mapping.get(mood.lower(), ['Drama'])
    recommended_movies = movies_df[movies_df['genre'].str.contains(
        '|'.join(target_genres), case=False, na=False
    )]
    recommended_movies = recommended_movies.sample(min(10, len(recommended_movies)))
    return recommended_movies.to_dict('records')


def analyze_song_mood_with_ai(song_name):
    if not GEMINI_API_KEY or model is None:
        return 'uplifting'

    try:
        prompt = f"""Analyze the emotional mood of the song "{song_name}". 
Respond with ONLY ONE WORD from this list: uplifting, melancholic, energetic, calm, dark, happy, sad, intense.
Just the word, nothing else."""
        response = model.generate_content(prompt)

        if hasattr(response, 'text') and response.text:
            mood = response.text.strip().lower()
            valid_moods = [
                'uplifting', 'melancholic', 'energetic', 'calm',
                'dark', 'happy', 'sad', 'intense'
            ]
            return mood if mood in valid_moods else 'uplifting'
        return 'uplifting'
    except Exception as e:
        print(f"Gemini API error in song mood analysis: {e}")
        return 'uplifting'


def generate_cinematic_dna():
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute('SELECT genre FROM user_interactions WHERE action IN ("view", "like")')
    interactions = c.fetchall()
    conn.close()

    if not interactions:
        return {
            'sci_fi_dreamer': 30,
            'romantic_idealist': 25,
            'action_enthusiast': 20,
            'comedy_lover': 15,
            'drama_seeker': 10
        }

    genre_counts = {}
    for (genre,) in interactions:
        if genre:
            main = str(genre).split()[0]
            genre_counts[main] = genre_counts.get(main, 0) + 1

    dna_mapping = {
        'Sci-Fi': 'sci_fi_dreamer',
        'Romance': 'romantic_idealist',
        'Action': 'action_enthusiast',
        'Comedy': 'comedy_lover',
        'Drama': 'drama_seeker'
    }

    dna_profile = {
        'sci_fi_dreamer': 0,
        'romantic_idealist': 0,
        'action_enthusiast': 0,
        'comedy_lover': 0,
        'drama_seeker': 0
    }

    total = sum(genre_counts.values())
    for genre, count in genre_counts.items():
        category = dna_mapping.get(genre, 'drama_seeker')
        dna_profile[category] += int((count / total) * 100)

    total_percentage = sum(dna_profile.values())
    if total_percentage > 0:
        for key in dna_profile:
            dna_profile[key] = int((dna_profile[key] / total_percentage) * 100)

    return dna_profile


def log_interaction(action, movie_title, genre):
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute(
        'INSERT INTO user_interactions (action, movie_title, genre) VALUES (?, ?, ?)',
        (action, movie_title, genre)
    )
    conn.commit()
    conn.close()


# ✅ Preferences helpers (store list of genres per user_id in user_preferences table)
def get_user_preferences(user_id: int):
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute(
        'SELECT favorite_genres FROM user_preferences WHERE session_id = ?',
        (str(user_id),)
    )
    row = c.fetchone()
    conn.close()

    if row and row[0]:
        try:
            return json.loads(row[0])
        except Exception:
            return []
    return []


def save_user_preferences(user_id: int, genres_list):
    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    genres_json = json.dumps(genres_list)

    c.execute(
        'SELECT id FROM user_preferences WHERE session_id = ?',
        (str(user_id),)
    )
    row = c.fetchone()

    if row:
        c.execute(
            'UPDATE user_preferences SET favorite_genres = ? WHERE id = ?',
            (genres_json, row[0])
        )
    else:
        c.execute(
            '''INSERT INTO user_preferences 
               (session_id, favorite_genres, watch_history, ratings, chatbot_queries)
               VALUES (?, ?, "", "", "")''',
            (str(user_id), genres_json)
        )

    conn.commit()
    conn.close()


# ========= AUTH ROUTES (API) =============
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()

    if not username or not email or not password:
        return jsonify({'status': 'error',
                        'message': 'Username, email and password are required.'}), 400

    hashed_pw = generate_password_hash(password)

    try:
        conn = sqlite3.connect('user_data.db')
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            (username, email, hashed_pw)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({'status': 'error',
                        'message': 'Username or email already exists.'}), 400
    finally:
        conn.close()

    return jsonify({'status': 'success',
                    'message': 'Account created successfully!'})


@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json or {}

    # ✅ FIXED: use .strip(), NOT .trim(), and guard with (value or '')
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return jsonify({'status': 'error',
                        'message': 'Email and password are required.'}), 400

    conn = sqlite3.connect('user_data.db')
    c = conn.cursor()
    c.execute("SELECT id, username, password FROM users WHERE email = ?", (email,))
    row = c.fetchone()
    conn.close()

    if row and check_password_hash(row[2], password):
        session.permanent = True
        session['user_id'] = row[0]
        session['username'] = row[1]
        return jsonify({'status': 'success',
                        'message': 'Login successful!',
                        'username': row[1]})
    else:
        return jsonify({'status': 'error',
                        'message': 'Invalid email or password.'}), 401


@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'status': 'success', 'message': 'Logged out successfully.'})


@app.route('/api/auth-status')
def auth_status():
    if 'user_id' in session:
        return jsonify({'logged_in': True,
                        'username': session.get('username', '')})
    return jsonify({'logged_in': False})


# ✅ SINGLE, clean preferences API (GET + POST)
@app.route('/api/user/preferences', methods=['GET', 'POST'])
def user_preferences():
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Not logged in.'}), 401

    user_id = session['user_id']

    if request.method == 'GET':
        prefs = get_user_preferences(user_id)
        # JS supports both keys: genres / favorite_genres
        return jsonify({'status': 'success',
                        'genres': prefs,
                        'favorite_genres': prefs})

    # POST
    data = request.json or {}
    genres = data.get('genres')
    if genres is None:
        genres = data.get('favorite_genres', [])

    if not isinstance(genres, list):
        return jsonify({'status': 'error',
                        'message': 'genres must be a list.'}), 400

    save_user_preferences(user_id, genres)
    return jsonify({'status': 'success',
                    'genres': genres,
                    'favorite_genres': genres})


# ========= PAGE ROUTES (HTML) =============
@app.route('/')
def home():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return render_template('index.html')


@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('home'))
    return render_template('login.html')


@app.route('/register')
def register_page():
    if 'user_id' in session:
        return redirect(url_for('home'))
    return render_template('register.html')


# ========= MOVIE / FEATURE API =============
@app.route('/api/movies')
def get_movies():
    genre_filter = request.args.get('genre', '')
    ott_filter = request.args.get('ott', '')
    search_query = request.args.get('search', '')

    filtered_movies = movies_df.copy()

    # Use favorite genres when no filters/search are applied
    user_id = session.get('user_id')
    if user_id and not genre_filter and not ott_filter and not search_query:
        fav_genres = get_user_preferences(user_id)
        if fav_genres:
            pattern = '|'.join([g for g in fav_genres if g])
            if pattern:
                filtered_movies = filtered_movies[
                    filtered_movies['genre'].str.contains(pattern, case=False, na=False)
                ]

    if genre_filter:
        filtered_movies = filtered_movies[
            filtered_movies['genre'].str.contains(genre_filter, case=False, na=False)
        ]

    if ott_filter:
        filtered_movies = filtered_movies[
            filtered_movies['ott_platform'].str.contains(ott_filter, case=False, na=False)
        ]

    if search_query:
        filtered_movies = filtered_movies[
            filtered_movies['title'].str.contains(search_query, case=False, na=False)
            | filtered_movies['description'].str.contains(search_query, case=False, na=False)
            | filtered_movies['cast'].str.contains(search_query, case=False, na=False)
        ]

    return jsonify(filtered_movies.to_dict('records'))


@app.route('/api/recommend', methods=['POST'])
def recommend():
    data = request.json or {}
    movie_title = data.get('title', '')

    if movie_title:
        try:
            movie_data = movies_df[movies_df['title'].str.lower() ==
                                   movie_title.lower()].iloc[0]
            log_interaction('view', movie_title, movie_data['genre'])
        except Exception:
            pass

        recommendations = get_recommendations(movie_title)
        return jsonify({'recommendations': recommendations})

    return jsonify({'recommendations': []})


@app.route('/api/parallel-universe', methods=['POST'])
def parallel_universe():
    data = request.json or {}
    movie_title = data.get('title', '')

    if movie_title:
        recommendations = get_parallel_universe_recommendations(movie_title)
        return jsonify({'recommendations': recommendations})

    return jsonify({'recommendations': []})


@app.route('/api/cinesound', methods=['POST'])
def cinesound():
    data = request.json or {}
    song_name = data.get('song', '')

    if song_name:
        mood = analyze_song_mood_with_ai(song_name)
        recommendations = get_song_to_movie_recommendations(song_name, mood)

        return jsonify({
            'recommendations': recommendations,
            'detected_mood': mood,
            'song': song_name
        })

    return jsonify({'recommendations': []})


@app.route('/api/profile')
def get_profile():
    dna_profile = generate_cinematic_dna()

    top_category = max(dna_profile, key=dna_profile.get)
    category_descriptions = {
        'sci_fi_dreamer':
            'Sci-Fi Dreamer - You explore the boundaries of imagination and reality',
        'romantic_idealist':
            'Romantic Idealist - You believe in the power of love and connection',
        'action_enthusiast':
            'Action Enthusiast - You crave adrenaline and excitement',
        'comedy_lover':
            'Comedy Lover - You find joy in laughter and lighthearted moments',
        'drama_seeker':
            'Drama Seeker - You appreciate deep stories and emotional journeys'
    }

    return jsonify({
        'profile': dna_profile,
        'description': category_descriptions.get(top_category, 'Movie Enthusiast'),
        'total_interactions': sum(dna_profile.values())
    })


@app.route('/api/chatbot', methods=['POST'])
def chatbot():
    data = request.json or {}
    user_message = data.get('message', '')

    if 'session_id' not in session:
        session['session_id'] = os.urandom(16).hex()

    if not GEMINI_API_KEY or model is None:
        return jsonify({
            'response':
                'The AI chatbot requires a Gemini API key. '
                'You can still use search and filters to explore movies!'
        })

    try:
        available_movies = movies_df['title'].tolist()[:20]
        movie_context = ', '.join(available_movies)

        prompt = f"""You are a movie recommendation assistant. You have access to a database of movies including: {movie_context} and many more.
        
User: {user_message}

Provide a helpful, conversational response about movies. If asked for recommendations, suggest 2-3 specific movies from the database. 
If asked about trivia, provide interesting facts. Keep responses concise (2-3 sentences)."""

        response = model.generate_content(prompt)

        log_interaction('chatbot', user_message, 'N/A')

        if hasattr(response, 'text') and response.text:
            return jsonify({'response': response.text})
        else:
            return jsonify({'response': 'I could not generate a response. Please try again!'})
    except Exception as e:
        print(f"Chatbot error: {e}")
        return jsonify({
            'response':
                'I encountered an error. Please try again later or use search & filters to discover movies!'
        })


@app.route('/api/view', methods=['POST'])
def view_movie():
    data = request.json or {}
    movie_title = data.get('title', '')
    genre = data.get('genre', '')

    if 'session_id' not in session:
        session['session_id'] = os.urandom(16).hex()

    if movie_title:
        log_interaction('view', movie_title, genre)
        return jsonify({'status': 'success'})

    return jsonify({'status': 'error'})


@app.route('/api/like', methods=['POST'])
def like_movie():
    data = request.json or {}
    movie_title = data.get('title', '')
    genre = data.get('genre', '')

    if 'session_id' not in session:
        session['session_id'] = os.urandom(16).hex()

    if movie_title:
        log_interaction('like', movie_title, genre)
        return jsonify({'status': 'success'})

    return jsonify({'status': 'error'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)