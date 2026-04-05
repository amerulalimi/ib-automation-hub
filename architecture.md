# Architecture Overview - IB Automation Hub

## 1) Ringkasan Sistem

`IB Automation Hub` ialah aplikasi full-stack untuk automasi operasi Telegram + MT5, dengan fungsi utama:

- terima signal (daripada MT5 EA / webhook) dan broadcast ke channel Telegram;
- urus channel Telegram (aktif/non-aktif, test send, update token);
- forward signal daripada source channel Telegram (Telethon) ke destination channel mengikut rule;
- jadualkan kandungan (content calendar) dan hantar automatik melalui Celery worker;
- jana kandungan AI (OpenAI), terjemahan, dan RAG (retrieval) berasaskan data channel;
- jana laporan gaya MT5 (frontend parser atau backend report generator/export).

Teknologi teras:

- Frontend: Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui.
- Backend: FastAPI, SQLAlchemy, PostgreSQL, Redis, Celery, Telethon, OpenAI, MetaTrader5.

---

## 2) Struktur Direktori Utama

```txt
E:/ib-automation-hub
├─ frontend/                     # Next.js dashboard
│  ├─ app/                       # App Router pages + local components + lib
│  └─ components/ui/             # reusable UI primitives (button/input/card/etc)
├─ backend/                      # FastAPI API + services + DB + worker
│  ├─ routes/                    # API domain routers
│  ├─ services/                  # integration/business services
│  └─ *.py                       # app bootstrap, auth, db, celery tasks
├─ generate_mt5_statement.py     # script util berkaitan report
└─ README.md
```

---

## 3) Frontend Architecture

### 3.1 Routing & Halaman

Lokasi: `frontend/app`

- `layout.tsx` - root layout app.
- `page.tsx` - landing/home.
- `login/page.tsx` - login form.
- `dashboard/layout.tsx` - shell dashboard + auth guard behavior.
- `dashboard/page.tsx` - overview dashboard.
- `dashboard/signals/page.tsx` - listing signal + log status.
- `dashboard/channels/page.tsx` - channel management (CRUD, toggle, test).
- `dashboard/content-calendar/page.tsx` - scheduler UI untuk post berjadual.
- `dashboard/generatereport/page.tsx` - report generation view (HTML/statistik).
- `dashboard/generatebyai/page.tsx` - AI content generation + RAG actions.
- `dashboard/mt5-tick-history/page.tsx` - MT5 metadata/export workflow.

### 3.2 Komponen Aplikasi (feature components)

Lokasi: `frontend/app/components`

- `FileUploader.tsx` - upload + parse fail statement/report.
- `DataPreview.tsx` - table preview + summary visual.
- `StepIndicator.tsx` - step progress UI.
- `BalanceChart.tsx` - chart prestasi/balance-equity.
- `CaptureChart.tsx` - chart export/capture use case.
- `AccountInfoForm.tsx` - form metadata akaun untuk report.

### 3.3 Reusable UI Kit

Lokasi: `frontend/components/ui`

- `button.tsx`, `input.tsx`, `label.tsx`, `card.tsx`, `badge.tsx`,
  `tabs.tsx`, `separator.tsx`, `progress.tsx`.

### 3.4 Frontend Utility Layer

Lokasi: `frontend/app/lib`

- `types.ts` - type definitions report/domain.
- `parseExcel.ts` - parsing fail Excel/CSV.
- `calculations.ts` - kiraan statistik trading/report.
- `chartData.ts` - transform data untuk visualisasi.
- `generateHTML.ts` - pembinaan HTML report di client side.

### 3.5 Corak State Management (Frontend)

- Dominan `useState`, `useEffect`, `useCallback` per-page.
- Tiada global state store khusus (Redux/Zustand) dikesan.
- Komunikasi backend melalui `fetch` dengan `credentials: include` untuk auth cookie.

---

## 4) Backend Architecture

### 4.1 App Bootstrap

Fail: `backend/main.py`

- Inisialisasi FastAPI + CORS.
- Register semua router domain.
- Jalankan lifecycle integration (termasuk start/stop Telethon listener).

### 4.2 Konfigurasi & Keselamatan

- `backend/config.py` - pemusatan env var (`load_dotenv`), constants.
- `backend/auth.py` - JWT auth helper + enkripsi AES-GCM untuk simpan token sensitif.

### 4.3 Data Layer (SQLAlchemy)

Fail: `backend/database.py`

Model utama:

- `DashboardUser` (`dashboard_users`)
- `Channel` (`channels`)
- `Signal` (`signals`)
- `SignalLog` (`signal_logs`)
- `TelethonAccount` (`telethon_accounts`)
- `SourceChannel` (`source_channels`)
- `ForwardRule` (`forward_rules`)
- `ScheduledContent` (`scheduled_contents`)
- `AIPersona` (`ai_personas`) - Tetapan persona AI untuk auto-reply.
- `UsageLog` (`usage_logs`) - Log aktiviti SaaS (seperti penggunaan AI bot).
- `TelegramClientSession` (`telegram_client_sessions`)

Fungsi tambahan:

- init schema / startup DB prep;
- integrasi pgvector table (`knowledge_chunks`) untuk RAG embeddings.

### 4.4 API Routes

Lokasi: `backend/routes`

#### A) Signal Bridge & Auth - `signal_bridge.py`

- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /signal`
- `GET /signals`
- `GET /channels`
- `POST /channels`
- `PATCH /channels/{channel_id}`
- `DELETE /channels/{channel_id}`
- `POST /channels/{channel_id}/test`

#### B) Signal Forwarder (Telethon Admin) - `signal_forwarder.py`

- `GET /telethon-accounts`
- `POST /telethon-accounts`
- `PATCH /telethon-accounts/{account_id}`
- `DELETE /telethon-accounts/{account_id}`
- `GET /source-channels`
- `POST /source-channels`
- `PATCH /source-channels/{channel_id}`
- `DELETE /source-channels/{channel_id}`
- `GET /forward-rules`
- `POST /forward-rules`
- `DELETE /forward-rules/{rule_id}`
- `POST /forwarder/start`
- `POST /forwarder/stop`
- `GET /forwarder/status`

#### C) Scheduler - `scheduler.py`

- `GET /scheduled-contents`
- `POST /scheduled-contents`
- `POST /scheduled-contents/bulk` (AI Bulk Content Generation)
- `PATCH /scheduled-contents/{content_id}`
- `DELETE /scheduled-contents/{content_id}`

#### D) AI, RAG & Signal Parser

- `POST /ai/generate-content`
- `POST /ai/rag/ingest`
- `POST /ai/rag/query`
- `GET /ai/deep-link-info`
- `POST /api/signal-parser/parse` (Uji parse signal mentah menggunakan AI GPT-4o-mini + hybrid mapping)

#### E) Report & MT5

- `report.py`
  - `GET /`
  - `GET /health`
  - `POST /generate-report`
- `mt5_export.py`
  - `POST /metadata`
  - `POST /export`
- `testmt5connection.py`
  - `POST /testmt5connection`

### 4.5 Service Layer

Lokasi: `backend/services`

- `telethon_client.py` - listener Telegram source channel (Telethon).
- `signal_parser.py` - parser mesej signal ke format berstruktur. Menerapkan automasi berasaskan GPT-4o-mini dengan hybrid mapping (untuk parsing Gold & instrumen kritikal secara tepat).
- `forwarder.py` - apply rule forward ke destination channel.
- `translation.py` - translation pipeline untuk forwarding/content.
- `ai_content.py` - text/content generation. Mengurus penjanaan secara pukal (umpamanya 30 post serentak) format Markdown yang unik/profesional via OpenAI.
- `rag.py` - ingest/query embeddings + context answer.
- `ai_reply.py` - enjin AI Auto-Reply. Menjawab pertanyaan pengguna secara automatik di Telegram berpandukan setting AIPersona (RAG, tone, knowledge base). Menggunakan GPT-4o-mini dengan output ala-manusia.
- `redis_client.py` - Redis helper (stream/infra ops).

Service sokongan tambahan:

- `telegram_notify.py` - penghantaran mesej Telegram Bot API.
- `report_builder.py` - binaan HTML report.
- `dummy_trades.py` - dummy trade data (testing/demo report).

---

## 5) Aliran Data Utama (End-to-End)

### 5.1 Signal Ingestion -> Telegram Broadcast

1. EA/producer hantar payload ke `POST /signal` (dengan key).
2. Backend validate key + simpan ke `signals`.
3. Sistem ambil channel aktif dan hantar mesej Telegram.
4. Result penghantaran direkod dalam `signal_logs`.

### 5.2 Telethon Source -> Forward Rules -> Dest Channels

1. Telethon listener monitor source channel aktif.
2. Mesej diparse (`signal_parser`) dan ditolak ke Redis stream.
3. Worker/proses trigger `forwarder` ikut `forward_rules`.
4. Optional translation/AI transform diterapkan.
5. Mesej dihantar ke channel destination.

### 5.3 Content Calendar (AI Bulk Scheduler) -> Celery Worker

1. User initiate bulk AI content create atau reka satu post di UI. Modul `ai_content.py` memanggil OpenAI untuk membentuk post-post berharga & profesional dan disimpan sebagai item pending (`scheduled_contents`).
2. Celery beat scan item pending pada sela masa yang secocok.
3. Task `send_scheduled_post` menolak mesej ke channel Telegram berkenaan.
4. Status item ditukar ke `sent` / `failed` (beserta log error).

### 5.4 Report Generation

**Client-side path**
- Upload Excel/CSV -> parse (`parseExcel`) -> kira stats (`calculations`) ->
  render chart/data -> generate HTML (`generateHTML`) -> export/download.

**Backend path**
- Request ke `POST /generate-report` / endpoint MT5 export ->
  backend ambil data (dummy atau MT5) -> build report -> pulangkan output.

### 5.5 AI Auto-Reply Engine (Persona-Based RAG)

1. Channel disetkan dengan maklumat `AIPersona` (tone bahasa + input knowledge base).
2. Jika ada interaksi / mesej dalam Telegram (atau melalui auto-reply hook), request dihala ke `ai_reply.py`.
3. Ia menggabungkan konteks RAG dan memanggil GPT-4o-mini.
4. AI merangka dan memberi balasan natural / layaknya pro tanpa berbunyi robotik.
5. Log dihantar dan direkodkan sebagai metric dalam `usage_logs`.

---

## 6) Integrasi Luaran

- Telegram Bot API (`https://api.telegram.org/...`) untuk send message.
- Telethon untuk listener akaun Telegram user-session.
- OpenAI API untuk generation, embeddings, translation/RAG support.
- MetaTrader5 Python package untuk metadata/history/export.
- Redis untuk stream signaling + Celery broker/backend.
- PostgreSQL untuk persistence utama (termasuk vector storage).

---

## 7) Runtime & Konfigurasi

### 7.1 Env vars penting

Backend (rujukan `README.md`, `backend/config.py`):

- `OPENAI_API_KEY`
- `DATABASE_URL`
- `JWT_SECRET` atau `NEXTAUTH_SECRET`
- `MASTER_ENCRYPTION_KEY`
- `DASHBOARD_EMAIL`
- `DASHBOARD_PASSWORD`
- `SECRET_SIGNAL_KEY`
- `REDIS_URL`

Frontend:

- `NEXT_PUBLIC_BACKEND_URL`

### 7.2 CORS

- Backend CORS dikonfigurasi untuk asal frontend lokal (localhost dev).

---

## 8) Build, Run, dan Operasi

### 8.1 Frontend (`frontend/package.json`)

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

### 8.2 Backend

- `pip install -r backend/requirements.txt`
- `uvicorn main:app --reload --port 8000` (dev)
- `uvicorn main:app --workers 4 --port 8000` (production basic run)

### 8.3 Worker/Scheduler

- Celery app: `backend/celery_app.py`
- Task runner: `backend/celery_tasks.py`
- Beat schedule utama:
  - scan pending scheduled posts (interval berkala),
  - process Telethon signal stream (interval berkala).

---

## 9) Keselamatan Semasa (Current Security Posture)

Mekanisme tersedia:

- JWT cookie auth (dashboard access).
- Secret key validation untuk endpoint signal ingestion.
- Enkripsi token sensitif (AES-GCM) sebelum simpan.
- `.env` di-ignore oleh git.

Perkara yang perlu perhatian:

- Terdapat seed/default admin credentials dalam kod DB bootstrap.
- Tetapan cookie `secure` untuk production perlu dipastikan aktif.
- Logging token sensitif perlu dielakkan/redact.
- Tiada test automation menyeluruh dikesan (risk regression lebih tinggi).

---

## 10) Jurang / Cadangan Penambahbaikan

- Tambah test suite backend (unit + integration) dan frontend critical flows.
- Tambah migration tool formal (contoh Alembic) untuk schema evolution.
- Perkukuh observability (structured logging + error tracing).
- Kunci deployment hardening:
  - cookie secure/httponly/samesite ikut environment,
  - token redaction dalam logs,
  - rotate key policy.
- Dokumentasi operasi Celery worker/beat lebih eksplisit (service command).

---

## 11) Ringkasan

Aplikasi ini mempunyai seni bina modular yang jelas: Next.js dashboard di frontend, FastAPI domain routers + service layer di backend, serta worker automation berasaskan Celery/Redis. Domain utama ialah signal automation Telegram, scheduling content, dan report generation/MT5 integration, dengan sokongan AI/RAG untuk workflow kandungan.
