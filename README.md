# MT5 Report Generator — Full-Stack Project

Struktur projek ini mengandungi dua bahagian utama yang berjalan secara berasingan:

```
generate report/
├── frontend/      ← Next.js 15 (TypeScript + Tailwind CSS + App Router)
├── backend/       ← Python FastAPI + MetaTrader5
└── README.md
```

---

## Keperluan Sistem

| Perisian | Versi Minimum |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Python | 3.10+ |
| MetaTrader 5 | Perlu dipasang di Windows |

> **Nota:** Package `MetaTrader5` hanya berfungsi di **Windows** kerana bergantung pada MT5 terminal.

---

## Pemboleh Ubah Persekitaran (.env)

Sediakan fail `.env` di **backend** dan **frontend** (atau satu `.env` di root jika anda load dari situ).

### Backend (`backend/.env`)

| Pemboleh ubah | Wajib | Keterangan |
|---------------|-------|------------|
| `OPENAI_API_KEY` | Pilihan | API key OpenAI (untuk health check / AI content) |
| `DATABASE_URL` | Pilihan | Connection string DB (cth. `postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` atau `NEXTAUTH_SECRET` | Ya (untuk auth) | Rahsia untuk JWT / sesi |
| `MASTER_ENCRYPTION_KEY` | Ya (untuk auth) | Kunci penyulitan utama |
| `DASHBOARD_EMAIL` | Pilihan | Email admin awal (seed) |
| `DASHBOARD_PASSWORD` | Pilihan | Kata laluan admin awal (seed) |
| `SECRET_SIGNAL_KEY` | Pilihan | Kunci untuk Signal Bridge |
| `REDIS_URL` | Pilihan | URL Redis (default: `redis://localhost:6379/0`) |

**Contoh `backend/.env`:**
```env
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
JWT_SECRET=your-jwt-secret-min-32-chars
MASTER_ENCRYPTION_KEY=your-master-encryption-key
DASHBOARD_EMAIL=admin@example.com
DASHBOARD_PASSWORD=yourpassword
SECRET_SIGNAL_KEY=optional-signal-key
REDIS_URL=redis://localhost:6379/0
```

### Frontend (`frontend/.env.local`)

| Pemboleh ubah | Wajib | Keterangan |
|---------------|-------|------------|
| `NEXT_PUBLIC_BACKEND_URL` | Pilihan | URL backend API (default: `http://localhost:8000`) |

**Contoh `frontend/.env.local`:**
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

> **Penting:** Jangan commit fail `.env` atau `.env.local` ke repo — pastikan ia dalam `.gitignore`.

---

## 1. Setup Backend (FastAPI)

Buka **Terminal 1** dan jalankan arahan berikut:

```powershell
# Masuk ke folder backend
cd "generate report\backend"

# Buat virtual environment Python
python -m venv venv

# Aktifkan virtual environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Install semua dependencies
pip install -r requirements.txt

# Jalankan server FastAPI
uvicorn main:app --reload --port 8000
```

Backend akan berjalan di: **http://localhost:8000**

Dokumentasi API automatik tersedia di:
- Swagger UI: **http://localhost:8000/docs**
- ReDoc: **http://localhost:8000/redoc**

---

## 2. Setup Frontend (Next.js)

Buka **Terminal 2** (terminal baharu) dan jalankan:

```powershell
# Masuk ke folder frontend
cd "generate report\frontend"

# Install dependencies (sudah dilakukan semasa setup, ulang jika perlu)
npm install

# Jalankan server development
npm run dev
```

Frontend akan berjalan di: **http://localhost:3000**

---

## 3. Jalankan Kedua-dua Server Serentak

Cara paling mudah adalah buka **dua terminal berasingan** dan jalankan satu server di setiap terminal.

### Pilihan A — Dua Terminal Berasingan (Disyorkan)

**Terminal 1 (Backend):**
```powershell
cd "generate report\backend"
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

**Terminal 2 (Frontend):**
```powershell
cd "generate report\frontend"
npm run dev
```

### Pilihan B — Satu Skrip PowerShell

Simpan fail berikut sebagai `start-all.ps1` di root folder:

```powershell
# start-all.ps1
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd "backend"; .\venv\Scripts\Activate.ps1; uvicorn main:app --reload --port 8000'
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'cd "frontend"; npm run dev'
```

Kemudian jalankan:
```powershell
.\start-all.ps1
```

---

## 4. Endpoints API Yang Tersedia

| Method | URL | Keterangan |
|---|---|---|
| GET | `/` | Health check |
| GET | `/health` | Status server |
| POST | `/api/connect` | Log masuk ke akaun MT5 |
| GET | `/api/history` | Ambil sejarah dagangan |

---

## 5. Sambungan Frontend ke Backend

Dalam komponen Next.js, hubungi API backend seperti berikut:

```typescript
// Contoh: semak status backend
const res = await fetch("http://localhost:8000/health");
const data = await res.json();
console.log(data); // { status: "ok", message: "Server is healthy" }
```

CORS telah dikonfigurasi untuk membenarkan permintaan dari `http://localhost:3000`.

---

## Nota Pembangunan

- Untuk **build production** frontend: `npm run build` kemudian `npm start`
- Untuk **production** backend, gantikan `--reload` dengan workers: `uvicorn main:app --workers 4 --port 8000`
- Pastikan MetaTrader 5 terminal **dibuka dan log masuk** sebelum memanggil endpoint `/api/connect` atau `/api/history`
