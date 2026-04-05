# Product Requirements Document (PRD) - Backend
# IB Automation Hub (FastAPI, Postgres, Redis, Celery)

**Versi:** 1.0  
**Tarikh:** April 2026  
**Disediakan oleh:** AI Architecture Review

---

## 1. Ringkasan Eksekutif

Dokumen ini memfokuskan kepada spesifikasi, fungsi semasa, dan keperluan teknikal bagi folder `backend` IB Automation Hub. Backend dibina menggunakan **FastAPI** dengan seni bina asinkronus. Aplikasi memproses input isyarat perdagangan (daripada webhook atau MetaTrader 5), memajukannya melalui Telegram (dengan API Bot & Telethon), serta menawarkan kandungan dan jadual automasi AI menerusi integrasi **OpenAI**. 

Objektif PRD ini ialah sebagai rujukan para pembangun (developer) *backend* untuk mengetahui tugasan-tugasan mendatang (Gaps) dalam memastikan status gred pengeluaran (Production-ready).

---

## 2. Model Sistem Utama (Core Domains)

### 2.1 Signal Bridge & Forwarder (Telethon & Bot API)
- **Fungsi**: Menerima request dari EA MetaTrader ke `/signal`, menyemak kesahihan rahsia (secret token) dan menolak isyarat ke Telegram Channel klien secara automatik. Modul *Forwarder* mengesan aktiviti dari Channel sumber dan meniru (copy) hantarannya memakai Telethon session.
- **Teknologi**: FastAPI Router (`signal_bridge.py`, `signal_forwarder.py`), Telethon.

### 2.2 Content Scheduling & Celery
- **Fungsi**: Menerima input dari dashboard dalam format tunggal atau pukal (bulk), menyimpannya ke pangkalan data, dan dijadualkan. Pekerja Celery (*beat* dan *worker*) menangkap tugas-tugas *pending* tersebut secara berjadual untuk diposkan ke Telegram.
- **Teknologi**: Celery, Redis stream / broker.

### 2.3 AI Pipeline (Signal Parsing, Auto-Reply & Custom RAG)
- **Fungsi**: 
  - AI Signal Parser menggunakan GPT-4o-mini untuk membaca teks bebas dari *source channel*. Dilengkapi dengan *hybrid mapping* untuk memastikan ketepatan terjemahan instrumen (seperti XAUUSD / Gold).
  - Enjin AI Auto-Reply (berasaskan personaliti & pengetahuan *RAG* berstruktur menerusi `pgvector`). Berfungsi menjawab interaksi Telegram pelanggan supaya interaksi nampak meyakinkan seakan manusia sebenar.
- **Teknologi**: OpenAI GPT-4o-mini, PostgreSQL `pgvector`, LangChain/RAG.

### 2.4 MT5 Integration & Reporting
- **Fungsi**: Integrasi API MetaTrader5 untuk menghasilkan laporan interaktif yang komprehensif, berdasarkan prestasi perdagangan pengguna (segi untung, junam / drawdown, log perdagangan terawal sehingga lewat waktu).
- **Teknologi**: Python `MetaTrader5` package.

---

## 2.5 Senarai Kawalan Keselamatan & Bukti Kelayakan (Credentials)
- **Hashing Kata Laluan:** Pendaftaran pengguna & log masuk akan membandingkan hash `bcrypt` di pangkalan data (`dashboard_users`). Kata laluan pentadbir utama ditanam melalui `seed` sekiranya pangkalan data baru sahaja dibentuk.
- **Autentikasi API (JWT):** Route dalaman dilindungi dengan kebergantungan (dependency injection) Fastapi `Require JWT`. Token yang sah dihantar melalui struktur cookie bersekuriti `HttpOnly`. Maklumat yang lebih berisiko (Token API Bot/Sesi Telethon) diselit dengan penyulitan (*encryption*) AES-GCM ketika simpanan di dalam pangkalan data.
- **Webhooks & External Auth:** Kemasukan dari pihak ketiga seperti skrip EA MetaTrader ke tetingkap `/signal` tidak memakai cookie sesi. Automasi ini bergantung rapat kepada pengecaman kekunci awam `Secret-Signal-Key` (dibaca dari *Header* atau *payload body/URL param*) untuk mengesahkan punca. Ini penting untuk kelangsungan Automasi luar papan pemuka.

## 2.6 Spesifikasi Titik Akhir API (API Endpoints)

Berikut adalah senarai ringkas spesifikasi API, format permintaan (Request/Panggilan) dan Pulangan (Return/Respons):

#### A. Automasi Sesi Log Masuk (Auth Flows)
- **`POST /auth/login`**
  - **Panggilan:** Menerima `email` dan `password` di dalam bentuk JSON.
  - **Pulangan:** Mengembalikan status `200` berserta pesanan `{"message": "Login successful"}`. Tindakan ini juga secara senyap akan menetapkan `access_token` ke dalam pautan *HttpOnly Cookie* peramban klien.
- **`GET /auth/me`**
  - **Panggilan:** Hanya Cookie JWT yang sah terlekatkan dalam *Headers*.
  - **Pulangan:** Mendapatkan butiran asas rekod Admin log masuk kini (ID entiti & Emel).
- **`POST /auth/logout`**
  - **Panggilan:** Tiada badan beban, asalkan cookie wujud.
  - **Pulangan:** Membersihkan tetapan (Clear Cookies) dari penyemak imbas dan meruntuhkan sesi rasmi.

#### B. Operasi Isyarat EA Terus (Signal Flow)
- **`POST /signal`**
  - **Panggilan:** JSON payload (contohnya *Action, TP, SL*) hasil siaran skrip EA MT5. Disokong dengan parameter `Secret-Signal-Key`.
  - **Pulangan:** Merekodkan parameter dan mengeluarkan nilai `{"message": "Signal processed"}`. Rantai aliran akan menolak skema ini terus ke Telegram awam sekiranya ada talian aktif.
- **`GET /signals`**
  - **Panggilan:** Cookie JWT semata.
  - **Pulangan:** Menghidangkan *List Array* bagi semua isyarat pangkalan data bersejarah (*history*).

#### C. Titik Telethon & Saluran Telegram
- **`GET/POST/PATCH/DELETE /channels`**
  - **Panggilan:** Form parameter JSON untuk urusan entiti rasmi (Nama Kumpulan/Saluran & Token Telegram Bot API).
  - **Pulangan:** Data rujukan Saluran Baharu / Kemaskini / mesej dihapuskan.
- **`POST /channels/{channel_id}/test`**
  - **Panggilan:** Membaca ID dari susur galur laluan URL.
  - **Pulangan:** `{"status": "success"}` dan serentak menghantar isyarat `Test Message` secara ringkas ke aplikasi klien Telegram (pusingan semak validasi Bot).
- **Kumpulan Semakan Telethon (`/telethon-accounts`, `/source-channels`, `/forward-rules`)**
  - **Panggilan:** Tetapan khas log masuk interaktif `api_id` dan `api_hash` untuk pautan *Session* pendua manusia di MT5.
  - **Pulangan:** Status perangkaan aturan *copytrade* (Dari A ke Tujuan B).

#### D. Penjadual Pengisian AI (AI Scheduler)
- **`POST /scheduled-contents/bulk`**
  - **Panggilan:** Metadata JSON mengandungi limit bilangan `count`, sasaran pasaran (contohnya promosi Gold) & masa.
  - **Pulangan:** Notifikasi pengerjaan kelompok keupayaan OpenAI, dengan senarai id kandungan terlampir di Celery queue.

#### E. Modul Sokongan AI / RAG Terjaring
- **`POST /api/signal-parser/parse`**
  - **Panggilan:** Teks Telegram isyarat longgar (contohnya `BUY GOLD NOW 2715`).
  - **Pulangan:** Ceraian map JSON kemas seperti `{"symbol": "Gold", "action": "BUY", "entry": 2715}` olahan GPT-4o-mini (*Hybrid Map*).
- **`POST /ai/rag/ingest` & `POST /ai/rag/query`**
  - **Panggilan:** Pecahan dokumen atau teks perual untuk disuapkan, atau sebatas ayat soalan penguna.
  - **Pulangan:** `Ingest` merangka *pgvector embedding*, manakala `Query` pula meluahkan kepintaran berdialog persona *AIPersona* sesuai nada laras RAG.

#### F. Titik Akhir Metadata / Repot MT5
- **`POST /generate-report`** (Atau `/testmt5connection`)
  - **Panggilan:** Menyemak integrasi *Python MT5*.
  - **Pulangan:** Butiran URL fail akhir atau pecahan data meta sejarah akaun klien yang akan dihurai frontend.

---

## 3. Keperluan Pembangunan & Polisi Reka Bentuk (Feature Gaps)

Berikut adalah senarai keperluan khusus yang perlu dititikberatkan oleh pembangun backend:

### 3.1 Pengurusan Pangkalan Data (Alembic Migrations)
Pangkalan data (PostgreSQL) kini menggunakan `Base.metadata.create_all()` pada masa-larian.  
- **Requirement**: Pasang dan tetapkan **Alembic**. Setiap kemaskini skema selepas ini MESTI menggunakan *Alembic migration script*. Extension `vector` juga perlu disertakan dalam inisialisasi Alembic.

### 3.2 Umpan Keselamatan (Security Hardening)
- **Rate-Limiting**: Laksanakan *rate-limit* (contohnya `slowapi`) di `/signal` dan `/auth/login` bagi mengelak ancaman *Brute-force* atau serangan *DDoS*.
- **Log Redaction**: Kata laluan, token Telegram, parameter *broker info*, dan kunci API OpenAI tidak boleh dicetak secara *plaintext* di dalam log pelayan terutamanya di platform awan awam.
- **RBAC**: Permodelan multi-tenancy. Akses kepada akaun pengguna, channel, isyarat perdagangan tidak direhatkan di skop entiti "SuperAdmin" sahaja. Pelbagai *Role-Based Access Guard* perlu dibina di pintu masuk FastAPI.

### 3.3 Penyesuaian Pengujian (Testing - PyTest)
- Tiada *testing framework* yang menguji `ai_reply.py`, `signal_parser.py`, mahupun penghantar Telegram.
- **Requirement**: Sediakan persekitaran menggunakan **pytest**. Bina fail *mock* bagi Telethon, MT5 dan OpenAI API untuk elak pelayan membuat panggilan eksternal sewaktu fasa ujian (CI/CD pipeline test). Minimum code coverage: 70%.

### 3.4 Worker Celery & Operasi Masa-Larian (OpS)
- Gagal menghantar siaran *schedule* sewajarnya diulang uji cuba (*retry mechanism*). Celery task `send_scheduled_post` patut ada `max_retries=3` dan tempoh *backoff exponential*.

### 3.5 Real-time API & Kestabilan MT5
- Sedang menggunakan perulangan REST atau Polling. Di masa hadapan, API masa-nyata WebSocket/SSE diperlukan dari backend ke frontend bagi menayangkan status bot pengawalan Telegram (aktif / terputus sambungan).
- Pengurusan sambungan MT5 perlu mempunyai *error trapping* dan *fallback timeout* kerana MetaTrader Server acap kali terpecah sambungan.

---

## 4. Senarai Semak Penerimaan (Definition of Done)
1. Perkara bersabit rahsia dan env dilindungi penuh dari commit history (Git).
2. Tiada ralat migrasi pangkalan data.
3. FastAPI endpoint dihentikan dengan log *exception handler* tersusun sekiranya terdapat ralat (*Sentry integration* dinasihatkan).
4. `uvicorn main:app --workers 4` dijalankan dengan stabil tanpa kebocoran ingatan.
