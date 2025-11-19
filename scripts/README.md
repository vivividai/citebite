# CiteBite Scripts

This directory contains utility scripts for development, operations, testing, and debugging.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Development Scripts](#development-scripts-dev)
- [Operations Scripts](#operations-scripts-ops)
- [Test Scripts](#test-scripts-test)
- [Archived Scripts](#archived-scripts-archive)

---

## Quick Reference

### Common Tasks

```bash
# Start development environment
./scripts/dev/start-dev.sh

# Check service status
./scripts/dev/check-status.sh

# Start background workers
npm run workers

# Check queue status
npm run queues:check

# Clear all queues
npm run queues:clear

# List Gemini stores
npx tsx scripts/ops/list-gemini-stores.ts
```

---

## Development Scripts (`dev/`)

Scripts for managing the development environment.

### `start-dev.sh`

**Purpose**: Start all required services for development (Supabase, Redis, Next.js)

**Usage**:

```bash
./scripts/dev/start-dev.sh
```

**What it does**:

1. Verifies Docker is running
2. Starts Supabase (PostgreSQL, Auth, Storage)
3. Starts Redis container
4. Starts Next.js dev server

### `stop-dev.sh`

**Purpose**: Stop all development services

**Usage**:

```bash
./scripts/dev/stop-dev.sh
```

**What it does**:

1. Stops Supabase
2. Stops Redis container
3. (Next.js must be stopped manually with Ctrl+C)

### `check-status.sh`

**Purpose**: Check the status of all services

**Usage**:

```bash
./scripts/dev/check-status.sh
```

**What it shows**:

- Supabase status and URLs
- Redis container status
- Next.js server status

### `start-workers.ts`

**Purpose**: Start BullMQ background workers for processing jobs

**Usage**:

```bash
npm run workers
# or
npx tsx scripts/dev/start-workers.ts
```

**What it does**:

- Starts PDF download worker
- Starts PDF indexing worker
- Starts insight generation worker

**When to use**:

- Required for background processing (PDF downloads, indexing, insights)
- Run in a separate terminal during development
- Essential for production deployment

---

## Operations Scripts (`ops/`)

Scripts for monitoring and managing production/development operations.

### `check-queues.ts`

**Purpose**: Monitor BullMQ queue status and view pending/active jobs

**Usage**:

```bash
npm run queues:check
# or
npx tsx scripts/ops/check-queues.ts
```

**What it shows**:

- Queue statistics (waiting, active, completed, failed)
- Details of active jobs
- Details of waiting jobs
- Failed jobs with error messages

**When to use**:

- Debug background job issues
- Monitor processing status
- Check for stuck jobs

### `clear-queues.ts`

**Purpose**: Clear all jobs from BullMQ queues

**Usage**:

```bash
npm run queues:clear
# or
npx tsx scripts/ops/clear-queues.ts
```

**What it does**:

- Removes all waiting jobs
- Clears completed jobs
- Removes failed jobs
- Cleans up delayed jobs

**When to use**:

- Reset queue state during development
- Clear stuck jobs
- Clean up after testing

**Warning**: This removes ALL jobs. Use with caution.

### `list-gemini-stores.ts`

**Purpose**: List all Gemini File Search stores and their statistics

**Usage**:

```bash
npx tsx scripts/ops/list-gemini-stores.ts
```

**What it shows**:

- All Gemini File Search stores
- Linked collection information
- Document counts (active, pending, failed)
- Storage usage
- Orphaned stores (not linked to DB)

**When to use**:

- Audit Gemini resource usage
- Debug indexing issues
- Identify orphaned stores for cleanup
- Monitor storage quota

### `check-collections.ts`

**Purpose**: List all collections in the database with their store IDs

**Usage**:

```bash
npx tsx scripts/ops/check-collections.ts
```

**What it shows**:

- Collection ID, name, File Search store ID
- Collections without stores (potential issues)

**When to use**:

- Verify collection creation
- Debug collection issues
- Check store linkage

---

## Test Scripts (`test/`)

Scripts for testing service connections and configurations.

### `test-db-connection.ts`

**Purpose**: Test Supabase database connection and schema

**Usage**:

```bash
npx tsx scripts/test/test-db-connection.ts
```

**What it tests**:

- Database connection
- All required tables exist
- Basic query functionality

**When to use**:

- After initial Supabase setup
- After schema migrations
- Debug database connection issues

### `test-redis-connection.js`

**Purpose**: Test Redis connection

**Usage**:

```bash
node scripts/test/test-redis-connection.js
```

**What it tests**:

- Redis PING command
- SET/GET/DEL operations

**When to use**:

- After starting Redis
- Debug Redis connection issues
- Verify REDIS_URL configuration

---

## Archived Scripts (`archive/`)

Scripts that were used during development/debugging but are no longer actively needed. These are kept for reference and future debugging.

See [archive/README.md](./archive/README.md) for details on each archived script.

**Common archived scripts**:

- `demo-gemini-api.ts` - Gemini File Search API demonstration
- `test-gemini-*.ts` - Various Gemini integration tests
- `test-pdf-indexing.ts` - PDF indexing worker E2E test
- `generate-test-pdf.ts` - Test PDF generator
- `analyze-storage.ts` - Storage usage analysis

**When to use archived scripts**:

- Learning how Gemini File Search API works
- Debugging specific integration issues
- Reference for API usage patterns

---

## Environment Variables

All scripts require proper environment variables in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Gemini
GEMINI_API_KEY=

# Redis
REDIS_URL=redis://localhost:6379
```

---

## Troubleshooting

### "Docker is not running"

Start Docker Desktop before running `start-dev.sh`

### "Redis connection failed"

1. Check if Redis is running: `docker ps | grep redis`
2. Start Redis: `docker start citebite-redis`
3. Verify REDIS_URL in `.env.local`

### "Supabase failed to start"

1. Check Docker has enough resources
2. Try: `npx supabase stop` then `npx supabase start`

### "Workers not processing jobs"

1. Verify workers are running: `npm run workers`
2. Check Redis is running
3. Use `npm run queues:check` to inspect queue state

### "Queue status shows no jobs but UI shows pending"

1. Check if workers are running
2. Look for failed jobs: `npm run queues:check`
3. Check worker logs for errors

---

## Contributing

When adding new scripts:

1. Place them in the appropriate folder (`dev/`, `ops/`, `test/`, `archive/`)
2. Add usage documentation to this README
3. Update `package.json` if adding npm scripts
4. Include error handling and helpful error messages
5. Use environment variables from `.env.local`
