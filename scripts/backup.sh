#!/bin/sh

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/megapot_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

echo "Starting backup at $(date)"

mkdir -p "$BACKUP_DIR"

pg_dump -h "$PGHOST" -U "${PGUSER:-megapot}" -d "$PGDATABASE" --no-owner --clean --if-exists | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_FILE"
    
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "Backup size: $SIZE"
    
    echo "Removing backups older than $RETENTION_DAYS days..."
    find "$BACKUP_DIR" -name "megapot_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
    
    echo "Current backups:"
    ls -lh "$BACKUP_DIR"/megapot_*.sql.gz 2>/dev/null || echo "No backups found"
else
    echo "Backup failed!"
    exit 1
fi

echo "Backup process completed at $(date)"