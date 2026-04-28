#!/bin/sh
set -e

echo "🚀 Starting CCTV Backend..."

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to be ready..."
until mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" > /dev/null 2>&1; do
  echo "MySQL is unavailable - sleeping"
  sleep 2
done

echo "✅ MySQL is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
if [ -f "src/migrations/run.js" ]; then
    node src/migrations/run.js || echo "⚠️  Migration script not found or failed"
fi

# Check if admin user exists, if not create one
echo "👤 Checking admin user..."
node -e "
const db = require('./src/config/database');
const bcrypt = require('bcryptjs');

(async () => {
    try {
        const [users] = await db.query('SELECT * FROM users WHERE role = ? LIMIT 1', ['admin']);
        if (users.length === 0) {
            console.log('Creating default admin user...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.query(
                'INSERT INTO users (username, email, password, role, is_verified) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'admin@cctv.com', hashedPassword, 'admin', 1]
            );
            console.log('✅ Admin user created: admin / admin123');
        } else {
            console.log('✅ Admin user already exists');
        }
    } catch (error) {
        console.error('❌ Error checking/creating admin:', error.message);
    }
    process.exit(0);
})();
" || echo "⚠️  Admin check failed"

echo "✅ Backend initialization complete!"
echo "🌐 Starting server on port ${PORT:-5000}..."

# Execute the main command
exec "$@"
