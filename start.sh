#!/bin/sh

# Wait for external PostgreSQL to be ready
echo "Waiting for database to be ready..."
sleep 10
echo "Database should be ready!"

# Start all services with supervisor
echo "Starting all services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf 