# 🏛️ CaesarAICareerOps — Local Stack

Unified Docker Compose local stack with PostgreSQL as the primary database provider and volume-backed persistence.

Patterned directly on `blustory-local-stack`.

---

## 🚀 Quick Start

From either the repository root or the `local-stack/` directory:

```bash
# Recommended: Run Postgres in Docker + Co-Pilot on Host (Native AGY with Google One AI plan)
./build_app.sh --local

# Or simply:
./build_app.sh

# Run full Docker stack (Postgres + App in containers)
./build_app.sh --docker

# Follow live container logs
./build_app.sh --logs

# Migrate data from SQLite to PostgreSQL
./build_app.sh --migrate

# Run interactive AGY OAuth terminal login
./build_app.sh --login

# Open interactive psql prompt in PostgreSQL container
./build_app.sh --db-shell

# Create an instant timestamped backup in data/backups/
./build_app.sh --db-backup

# Check container health and volumes
./build_app.sh --status

# Stop the stack
./build_app.sh --down
```

---

## 🐘 Database Configuration

PostgreSQL is configured as the **main provider**:

- **Container Name:** `caesar-postgres`
- **Internal Host:** `postgres:5432`
- **Host Port:** `5432`
- **Database:** `caesar_ops`
- **User:** `caesar`
- **Password:** `caesar_ops_password`
- **Connection URI (Host):** `postgresql://caesar:caesar_ops_password@localhost:5432/caesar_ops`
- **Connection URI (Docker):** `postgresql://caesar:caesar_ops_password@postgres:5432/caesar_ops`

### 💾 Volume Persistence

The database data is persisted using Docker named volume `caesar_postgres_data`. 
Even if containers are stopped or rebuilt, all applications, pipelines, reports, and evaluations remain safe and intact.

---

## 🌐 Endpoints

Once deployed:
- **Dashboard:** [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check:** [http://localhost:8000/api/health](http://localhost:8000/api/health)
