#!/bin/sh

# Initialize PostgreSQL data directory
if [ ! -d "/var/lib/postgresql/data/base" ]; then
    echo "Initializing PostgreSQL database..."
    su postgres -c "initdb -D /var/lib/postgresql/data"
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
su postgres -c "pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql/postgresql.log start"

# Wait for PostgreSQL to be ready
sleep 5

# Initialize database if it doesn't exist
if ! su postgres -c "psql -lqt | cut -d \| -f 1 | grep -qw cms_db"; then
    echo "Creating CMS database..."
    su postgres -c "psql -f /tmp/init-db.sql"
fi

# Start all services with supervisor
echo "Starting all services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 