import sqlite3

conn = sqlite3.connect('user_data.db')
c = conn.cursor()
c.execute("DELETE FROM users")
conn.commit()
conn.close()
print("Users table cleared! Now you can register fresh.")
