# Product Requirements Document (PRD)
# IB Automation Hub — Feature Gaps & Roadmap

**Versi:** 1.0  
**Tarikh:** April 2026  
**Disediakan oleh:** AI Architecture Review  
**Berdasarkan:** `architecture.md` (semakan semasa)

---

## 1. Ringkasan Eksekutif

Berdasarkan analisis `architecture.md`, IB Automation Hub mempunyai asas teknikal yang kukuh merangkumi signal automation, Telegram forwarding, content scheduling, AI/RAG, dan MT5 reporting. Namun terdapat beberapa domain kritikal yang masih **belum diliputi atau separuh siap** yang perlu diselesaikan untuk menjadikan aplikasi ini production-ready dan berskala SaaS.

---

## 2. Domain Feature Gaps

### 2.1 🔴 KRITIKAL — Testing & Quality Assurance

**Status semasa:** Tiada test automation dikesan dalam architecture.

**Keperluan:**

#### 2.1.1 Backend Unit Tests
- Test untuk setiap service: `signal_parser`, `forwarder`, `ai_content`, `rag`, `ai_reply`
- Test untuk semua API routes (FastAPI TestClient)
- Mock untuk dependency luaran: OpenAI, Telegram Bot API, Telethon, MT5
- Coverage minimum: 70% untuk service kritikal

#### 2.1.2 Backend Integration Tests
- End-to-end flow: Signal ingestion → log → Telegram broadcast
- Forward rule application flow
- Celery task execution (mock broker)
- DB migration rollback safety

#### 2.1.3 Frontend Critical Flow Tests
- Login / auth guard redirect
- Signal listing & filter
- Channel CRUD actions
- Content calendar scheduling UI
- Report generation upload flow

**Acceptance Criteria:**
- CI pipeline (GitHub Actions / GitLab CI) run test suite pada setiap PR
- Badge coverage ≥ 70%
- Zero regression pada core flows

---

### 2.2 🔴 KRITIKAL — Database Migration (Alembic)

**Status semasa:** Schema dibuat via SQLAlchemy bootstrap terus. Tiada migration tool formal.

**Keperluan:**

#### 2.2.1 Setup Alembic
- Init Alembic dengan `env.py` yang connect ke `DATABASE_URL` dari config
- Generate baseline migration dari model semasa
- Naming convention untuk migration files

#### 2.2.2 Migration Workflow
- `alembic upgrade head` dalam deployment script
- `alembic downgrade -1` untuk rollback
- Wajib ada migration file untuk setiap perubahan schema
- Automated migration dalam Docker entrypoint

#### 2.2.3 pgvector Migration
- Pastikan extension `vector` diaktifkan dalam migration awal
- Schema `knowledge_chunks` diuruskan via Alembic (bukan manual)

**Acceptance Criteria:**
- Boleh deploy fresh DB dari zero menggunakan migration sahaja
- Boleh rollback schema tanpa data loss pada staging

---

### 2.3 🔴 KRITIKAL — Security Hardening

**Status semasa:** Beberapa risiko dikenal pasti dalam architecture:
- Seed admin credentials dalam kod
- Cookie secure belum dipastikan untuk production
- Token sensitif mungkin terlog
- Tiada key rotation policy

**Keperluan:**

#### 2.3.1 Credential & Secrets Management
- Buang hardcoded seed credentials dari kod; gantikan dengan env var atau first-run setup wizard
- Implement `DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD` hashing (bcrypt) semasa bootstrap
- Rotate `MASTER_ENCRYPTION_KEY` dengan versioning (key ID dalam encrypted payload)

#### 2.3.2 Cookie Security
- Set `Secure=True`, `HttpOnly=True`, `SameSite=Lax/Strict` untuk JWT cookie dalam production
- Feature flag atau env detection: `ENVIRONMENT=production` → enforce secure cookie

#### 2.3.3 Log Redaction
- Middleware / log filter untuk redact: token, API key, password dalam semua log output
- Guna library seperti `python-json-logger` dengan custom filter

#### 2.3.4 Rate Limiting
- Rate limit pada `POST /signal` (signal ingestion endpoint)
- Rate limit pada `POST /auth/login` (brute force protection)
- Cadangan: `slowapi` (FastAPI) dengan Redis backend

#### 2.3.5 Input Validation
- Validate semua webhook payload di `/signal` — type check, size limit
- Sanitize Telegram message content sebelum forward

**Acceptance Criteria:**
- Penetration test checklist lulus (OWASP Top 10 basic)
- Zero plaintext credential dalam log
- Cookie audit tool confirm Secure/HttpOnly dalam production

---

### 2.4 🟡 PENTING — Observability & Monitoring

**Status semasa:** Tiada structured logging atau error tracing dikenal pasti.

**Keperluan:**

#### 2.4.1 Structured Logging
- Guna `structlog` atau `python-json-logger` untuk semua log backend
- Standard fields: `timestamp`, `level`, `service`, `trace_id`, `user_id`, `action`
- Log level configurable via env var

#### 2.4.2 Error Tracking
- Integrate Sentry (backend FastAPI + frontend Next.js)
- Capture unhandled exceptions dengan context (user, endpoint, payload sanitized)
- Alert untuk error rate spike

#### 2.4.3 Celery Task Monitoring
- Flower dashboard untuk monitor Celery tasks
- Alert jika task `send_scheduled_post` gagal berulang kali
- Dead letter queue untuk failed tasks

#### 2.4.4 Health Check Endpoints
- Extend `/health` untuk check: DB connection, Redis ping, Telethon status, Celery worker active
- Frontend status page yang consume health endpoint

#### 2.4.5 Usage Analytics (SaaS Metrics)
- `usage_logs` sudah ada — extend untuk aggregate:
  - AI token usage per user/channel
  - Signal volume per hari
  - Forward rule trigger count
- Admin dashboard page untuk SaaS metrics

**Acceptance Criteria:**
- Sentry capture ≥ 95% production exceptions
- Health endpoint return status semua dependency dalam < 500ms
- Celery task failure alert dalam < 5 minit

---

### 2.5 🟡 PENTING — Multi-Tenancy / SaaS User Management

**Status semasa:** Hanya ada `DashboardUser` tunggal (single admin). `UsageLog` dan `AIPersona` wujud tapi belum jelas multi-user support.

**Keperluan:**

#### 2.5.1 User Roles & Permissions
- Role: `SUPER_ADMIN`, `ADMIN`, `VIEWER`
- RBAC middleware untuk API routes
- Frontend route guard berdasarkan role

#### 2.5.2 Multi-User Onboarding
- Register endpoint (invite-based atau self-register dengan approval)
- User management page (list, deactivate, role assign)
- Password reset flow

#### 2.5.3 Per-User Resource Isolation
- Channel ownership (`owner_id` FK ke `DashboardUser`)
- Signal log filtered by user scope
- Telethon account isolated per user

#### 2.5.4 Subscription / Quota Management
- Quota fields: `max_channels`, `max_ai_tokens_per_month`, `max_scheduled_posts`
- Enforcement middleware yang check quota sebelum create resource
- UI untuk tunjuk usage vs limit

**Acceptance Criteria:**
- User A tidak boleh access channel User B
- Quota enforcement 100% pada API level
- Admin boleh manage semua users

---

### 2.6 🟡 PENTING — Celery Worker Operability

**Status semasa:** Architecture sebut Celery beat tapi dokumentasi command eksplisit tidak lengkap.

**Keperluan:**

#### 2.6.1 Systemd / Docker Service Definition
- `docker-compose.yml` dengan services: `api`, `worker`, `beat`, `flower`, `redis`, `postgres`
- Atau systemd unit files untuk bare metal deployment
- Restart policy: `unless-stopped`

#### 2.6.2 Task Retry & Dead Letter
- Retry logic dengan exponential backoff untuk `send_scheduled_post`
- Max retry = 3, kemudian mark sebagai `failed` dengan error message
- Alert admin via Telegram jika task failed permanently

#### 2.6.3 Beat Schedule Management
- Jadual beat boleh dikonfigurasi via env / admin UI (bukan hardcoded)
- Dynamic task scheduling untuk scheduled content (guna `celery-redbeat` atau `django-celery-beat` equivalent)

**Acceptance Criteria:**
- Worker restart automatik jika crash
- Failed task alert dalam < 5 minit
- Beat schedule boleh diubah tanpa restart app

---

### 2.7 🟡 PENTING — Telegram AI Auto-Reply (Production Readiness)

**Status semasa:** `ai_reply.py` wujud tapi flow production belum jelas dari architecture.

**Keperluan:**

#### 2.7.1 Auto-Reply Trigger Mechanism
- Clarify: adakah ini polling, webhook, atau Telethon event listener?
- Jika Telethon — pastikan session management robust (reconnect on disconnect)
- Rate limit auto-reply per channel (elak spam)

#### 2.7.2 Persona Management UI
- CRUD UI untuk `AIPersona` (tone, knowledge base, language)
- Preview / test auto-reply dari dashboard sebelum aktifkan
- Toggle aktif/nonaktif per channel

#### 2.7.3 Knowledge Base Management (RAG)
- UI untuk upload dokumen ke knowledge base
- Progress indicator semasa ingest
- Delete / update chunk capability
- Tunjuk berapa chunk aktif per channel

#### 2.7.4 Auto-Reply Log & Review
- Log semua auto-reply (input message → AI response)
- Admin boleh review dan flag response yang salah
- Feedback loop untuk improve persona

**Acceptance Criteria:**
- Auto-reply latency < 3 saat dari message received
- Knowledge base update visible dalam < 1 minit
- Admin boleh disable auto-reply untuk channel tertentu dalam real-time

---

### 2.8 🟢 ENHANCEMENT — MT5 Integration Improvements

**Status semasa:** MT5 export dan report ada, tapi ada `dummy_trades.py` yang indicate live data integration mungkin tidak stabil.

**Keperluan:**

#### 2.8.1 Live MT5 Connection Stability
- Connection pool / reconnect logic untuk MetaTrader5 package
- Fallback ke cached data jika MT5 offline
- Status indicator di dashboard (MT5 connected / disconnected)

#### 2.8.2 Report Template Customization
- UI untuk customize report template (logo, warna, nama syarikat)
- Multiple report format: HTML, PDF export
- Scheduled auto-send report ke Telegram channel

#### 2.8.3 MT5 Signal Verification
- Cross-check signal dari EA dengan actual MT5 trade history
- Alert jika signal received tapi no matching trade dalam MT5

**Acceptance Criteria:**
- MT5 connection status visible dalam dashboard
- Report PDF export dalam < 10 saat
- Signal verification log accessible dari UI

---

### 2.9 🟢 ENHANCEMENT — Frontend UX Improvements

**Status semasa:** Pages wujud tapi tiada global state management (Redux/Zustand).

**Keperluan:**

#### 2.9.1 Global State Management
- Implement Zustand untuk: auth state, notification state, real-time signal updates
- Elak prop drilling yang dalam

#### 2.9.2 Real-Time Updates
- WebSocket atau SSE untuk: signal status update, Celery task progress, Telethon forwarder status
- Toast notification untuk events kritikal

#### 2.9.3 Mobile Responsiveness
- Audit semua dashboard pages untuk mobile view
- Pastikan content calendar dan signal log usable di mobile

#### 2.9.4 Error Handling UI
- Global error boundary (React)
- User-friendly error messages (bukan raw API error)
- Retry button untuk failed operations

**Acceptance Criteria:**
- Core flows usable di mobile viewport (375px)
- Real-time signal update < 2 saat delay
- Zero unhandled JS error di production console

---

## 3. Prioritization Matrix

| Feature | Keutamaan | Effort | Impact | Sprint Target |
|---|---|---|---|---|
| Alembic Migration Setup | 🔴 Kritikal | S | Tinggi | Sprint 1 |
| Security: Cookie + Credential | 🔴 Kritikal | S | Tinggi | Sprint 1 |
| Log Redaction | 🔴 Kritikal | S | Tinggi | Sprint 1 |
| Backend Unit Tests (core services) | 🔴 Kritikal | L | Tinggi | Sprint 1-2 |
| Rate Limiting | 🔴 Kritikal | S | Tinggi | Sprint 1 |
| Structured Logging + Sentry | 🟡 Penting | M | Tinggi | Sprint 2 |
| Docker Compose Full Stack | 🟡 Penting | M | Tinggi | Sprint 2 |
| Celery Task Retry + Alert | 🟡 Penting | M | Tinggi | Sprint 2 |
| Health Check Extended | 🟡 Penting | S | Sederhana | Sprint 2 |
| Multi-User RBAC | 🟡 Penting | L | Tinggi | Sprint 3 |
| Quota Management | 🟡 Penting | L | Tinggi | Sprint 3 |
| Auto-Reply UI + Log | 🟡 Penting | M | Sederhana | Sprint 3 |
| RAG Knowledge Base UI | 🟡 Penting | M | Sederhana | Sprint 3 |
| Frontend Real-Time (WebSocket) | 🟢 Enhancement | M | Sederhana | Sprint 4 |
| MT5 Connection Stability | 🟢 Enhancement | M | Sederhana | Sprint 4 |
| Report PDF Export | 🟢 Enhancement | S | Sederhana | Sprint 4 |
| Mobile Responsiveness | 🟢 Enhancement | L | Sederhana | Sprint 5 |
| Frontend Integration Tests | 🟢 Enhancement | L | Sederhana | Sprint 5 |

*S = Small (1-3 hari), M = Medium (3-7 hari), L = Large (1-2 minggu)*

---

## 4. Cadangan Sprint Plan

### Sprint 1 — Security & Foundation (2 minggu)
- Setup Alembic, generate baseline migration
- Fix cookie security (Secure/HttpOnly/SameSite)
- Remove hardcoded credentials, implement env-based bootstrap
- Add log redaction middleware
- Add rate limiting pada /signal dan /auth/login
- Backend unit tests untuk `signal_parser` dan `forwarder`

### Sprint 2 — Observability & Operations (2 minggu)
- Integrate Sentry (backend + frontend)
- Structured logging dengan structlog
- Docker Compose full stack setup
- Celery task retry + Telegram alert on failure
- Extended /health endpoint
- Flower dashboard untuk Celery

### Sprint 3 — Multi-User & AI Features (2 minggu)
- User roles & RBAC implementation
- Per-user resource isolation
- Quota management system
- Auto-Reply persona management UI
- RAG knowledge base UI (upload, view chunks, delete)

### Sprint 4 — Real-Time & MT5 (2 minggu)
- WebSocket / SSE untuk real-time signal update
- MT5 connection status dashboard
- Report PDF export
- Dynamic Celery beat schedule

### Sprint 5 — Polish & Testing (2 minggu)
- Mobile responsiveness audit & fix
- Frontend integration tests (Cypress / Playwright)
- Performance audit
- Full E2E test suite

---

## 5. Definisi "Done" (DoD)

Setiap feature dianggap siap apabila:

1. **Code complete** — PR merged ke `main`
2. **Tests written** — unit test / integration test ada
3. **Documented** — `README.md` atau inline comment dikemaskini
4. **Security checked** — tiada credential terdedah, input validated
5. **Tested in staging** — deploy ke staging, manual QA pass
6. **Monitoring active** — Sentry capture exceptions, log structured

---

## 6. Risiko & Mitigasi

| Risiko | Kemungkinan | Impak | Mitigasi |
|---|---|---|---|
| Alembic migration corrupt existing data | Sederhana | Tinggi | Test migration di staging, backup before migrate |
| Telethon session expire / ban | Tinggi | Tinggi | Session refresh logic, multiple account fallback |
| OpenAI API cost runaway | Sederhana | Sederhana | Token quota per user, usage alert |
| MT5 package only works on Windows | Tinggi | Sederhana | Containerize MT5 service, atau API proxy |
| Celery worker memory leak | Sederhana | Sederhana | Worker auto-restart, memory limit per container |

---

## 7. Penutup

IB Automation Hub mempunyai domain logic yang baik dan modular. Gap utama adalah pada **lapisan operasi** (testing, migration, security, observability) yang perlu diselesaikan sebelum boleh dianggap production-grade dan selamat untuk SaaS. Dengan mengikut roadmap sprint di atas, aplikasi ini boleh mencapai kematangan teknikal dalam masa 10 minggu.

---

*Dokumen ini dijana berdasarkan analisis `architecture.md`. Kemas kini apabila terdapat perubahan architecture atau keperluan baru.*