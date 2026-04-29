#!/bin/sh
set -e

echo "🚀 Starting CCTV Backend..."

# Wait for MySQL to be ready
echo "⏳ Waiting for MySQL to be ready..."
sleep 10
echo "✅ MySQL should be ready!"

# Verify database connection
echo "🔍 Verifying database connection..."
until mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "SELECT 1" > /dev/null 2>&1; do
    echo "⏳ Waiting for database connection..."
    sleep 2
done
echo "✅ Database connection verified!"

# Check if tables exist
echo "🔍 Checking database tables..."
TABLE_COUNT=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -sN -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '${DB_NAME}'")
echo "📊 Found ${TABLE_COUNT} tables in database"

if [ "$TABLE_COUNT" -eq "0" ]; then
    echo "⚠️  No tables found! Database initialization may have failed."
    echo "💡 Check if db_schema.sql was properly mounted and executed."
fi

# Verify default users exist
echo "👤 Verifying default users..."
USER_COUNT=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -sN -e "SELECT COUNT(*) FROM users" 2>/dev/null || echo "0")
echo "👥 Found ${USER_COUNT} users in database"

if [ "$USER_COUNT" -eq "0" ]; then
    echo "⚠️  No users found! Default users may not have been created."
fi

# Verify default scripts exist
echo "📜 Verifying default scripts..."
SCRIPT_COUNT=$(mysql -h"${DB_HOST}" -u"${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" -sN -e "SELECT COUNT(*) FROM scripts" 2>/dev/null || echo "0")
echo "📋 Found ${SCRIPT_COUNT} scripts in database"

if [ "$SCRIPT_COUNT" -eq "0" ]; then
    echo "⚠️  No scripts found! Default scripts may not have been created."
fi

echo "✅ Backend initialization complete!"
echo "🌐 Starting server on port ${PORT:-3000}..."

# Execute the main command
exec "$@"
