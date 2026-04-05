# Product Requirements Document (PRD) - Frontend
# IB Automation Hub (Next.js, TypeScript, Tailwind)

**Versi:** 1.0  
**Tarikh:** April 2026  
**Disediakan oleh:** AI Architecture Review

---

## 1. Ringkasan Eksekutif

Dokumen ini merangkumi keperluan fungsian dan standard reka bentuk untuk folder `frontend`. Ia dibina dengan kerangka **Next.js (App Router)** dan mengutamakan susun atur responsif dan profesional menggunakan **Tailwind CSS** serta **shadcn/ui**. Papan pemuka (*dashboard*) adalah pusat operasi pentadbir menjadualkan *posting*, menetapkan automasi signal Telegram, mengawasi personaliti AI Bot (*RAG/Persona*), dan menyemak laporan perdagangan klien MT5.

PRD ini bertindak balas sebagai panduan teras bagi *Frontend Engineers* untuk melengkapi bahagian interaktif aplikasi memandangkan ada fungsi-fungsi yang masih terdedah dari sudut pengalaman pengguna (*UX*) dan sokongan fasa pengeluaran.

---

## 2. Fungsi Semasa Aplikasi (Core Workflows)

### 2.1 Pengurusan Bot & Telegram Channel
Laluan: `/dashboard/channels` & `/dashboard/signals`
- Pentadbir mampu menetapkan token bot Telegram, menyimpan nama saluran (channel), dan mennguji keupayaan bot menghantar isyarat (Test Bot). Log penghantaran juga terpapar dalam senarai khusus.

### 2.2 Content Calendar & AI Content Generator
Laluan: `/dashboard/content-calendar` & `/dashboard/generatebyai`
- Membolehkan *mark-eters* dan pentadbir memuat naik, mereka jadual (tarikh & masa), dan melepaskan pos promosi dengan keupayaan mencetak secara pukal berbantu AI OpenAI. Pembangun UI telah menggunakan borang bersistematik untuk menjalan arahan ini.

### 2.3 Pelaporan MT5 Interaktif (Report Generation)
Laluan: `/dashboard/generatereport` & `/dashboard/mt5-tick-history`
- Menelaah sejarah (history CSV / xlsx fail) ke dalam paparan analitikal berbentuk carta untung dan jadual yang rapi dan memvisualisasikan prestasi perdagangan secara visual klien (*frontend client-parsing*).

### 2.4 Aliran Halaman & Mekanisme Authentication (Page Flow)

**Sistem Log Masuk & Keluar (Auth Flow):**
- **Log Masuk (`/login`):** Skrin utama sekiranya pengguna tiada sesi sah (unauthorized). Klien perlu memasukkan `email` dan `password` dan menekan serah (*submit*). Sistem memanggil API `POST /auth/login`. Jika berjaya, backend mengembalikan token JWT yang disimpan dengan selamat di dalam *cookie* (`HttpOnly`). Klien secara automatik dialihkan (redirect) memasukki laman `/dashboard`.
- **Log Keluar (`Logout`):** Pengguna menekan butang mematikan sesi di panel sisi (*sidebar*). Klien memanggil `POST /auth/logout` bagi memusnahkan cookie sesi JWT dari sistem komputer pengguna. Pengguna dialihkan semula ke tetingkap paparan `/login`.

**Panduan Tujuan Setiap Halaman secara Ringkas:**
- **`/dashboard`**: Halaman pengenalan ringkas (overview) yang memuatkan ringkasan analitik secara sepintas lalu dan petunjuk metrik keseluruhan projek.
- **`/dashboard/channels`**: Panel pengurusan di mana token bot Telegram dipautkan. Konfigurasi CRUD (Create, Read, Update, Delete) entiti saluran dan butang ujian (*Test Bot*) diletakkan di sini.
- **`/dashboard/signals`**: Memaparkan pangkalan isyarat perdagangan yang telah diterima dari sumber asalan. Terdapat juga jadual log bersatus *success* atau *failed* penghantaran isyarat ke laluan Telegram.
- **`/dashboard/mt5-tick-history`** & **`/dashboard/generatereport`**: Tempat pentadbir memuat naik laporan asal MetaTrader5. Sistem mengitar data fail luaran menjadi jadual rumusan interaktif berserta carta (Graph UI) kemajuan modal yang bersih dan kukuh untuk dimuat turun (Export).
- **`/dashboard/generatebyai`**: Ruangan kanvas bagi pentadbir menjana teks gaya pemasaran via OpenAI. Pentadbir turut dapat menyalurkan pangkalan ilmu pengetahuan (Knowledge Base RAG) untuk modul memprogram *AIPersona* secara langsung dari skrin ini.
- **`/dashboard/content-calendar`**: Ruang kalendar penjadual. Menampilkan kad-kad pos Telegram secara berperingkat sama ada ianya *sent* (berlaku) atau bertaraf *pending* (menunggu isyarat Celery Beat). Modul ini boleh didorong secara individu atau penjanaan AI pukal berturut (*Bulk Gen*).

---

## 3. Garis Panduan & Keperluan Penambahbaikan (Feature Gaps)

Cabaran utama yang perlu diberesi oleh Pembangun Frontend:

### 3.1 Pustaka Keadaan Global (Global State Management)
- Penggunaan `useState` dan *prop drilling* kini semakin renyah bila papan pemuka semakin sarat dengan ciri (seperti pengiraan *AI tokens constraint* atau identiti *Admin Role* semasa).
- **Requirement**: Serapkan pustaka pengurusan global seperti **Zustand** untuk menyimpan *Authentication Session*, maklumat bot terpilih, dan *Theme Mode*.

### 3.2 Real-time Updates (Pemberitahuan Segera)
- Pentadbir kini perlu *refresh* skrin untuk memastikan jika AI Reply telah menjawab pelanggan dan jika MT5 isyarat telah tiba.
- **Requirement**: Frontend memerlukan tetingkap amaran (Toast Notifications) berpandukan integrasi **WebSocket** / **SSE (Server-Sent Events)** sejajar dengan pelayan asinkron FastAPI.

### 3.3 Antaramuka Persona AI (UX bagi RAG Auto-reply)
- Backend kini menyokong AI-reply dengan teknologi *hybrid mapping*.
- **Requirement**: Bina antaramuka interaktif untuk modul *AIPersona*. Meliputi butang muat naik dokumen (*Knowledge Base Upload*), dan penetapan profil *Tone* perbualan AI. Turut perlu wujud kotak simulasi (Chat Preview) membolehkan *Admin* berbalas mesej simulasi untuk menentu-ukur kemantapan jawapan AI sebelum melepaskannya hidup ke Telegram awam.

### 3.4 Responsif Pelbagai Peranti & Mobile-first Matrix
- Senarai jadual (log siaran MT5 / Celery scheduler) kadangkala melimpah (overflow) pada grid telefon pintar (width 375px - 414px).
- **Requirement**: Audensi susun atur grid Tailwind, guna kelas tersembunyi `hidden md:table-cell` untuk mengurangkan kekusutan lajur melimpah dalam paparan mudah alih.

### 3.5 Pengujian Intergrasi UI (Cypress / Playwright)
- Pada masa ini, frontend tiada skema pengujian logik secara automasi.
- **Requirement**: Sediakan *e2e test* minimum untuk prosedur masuk (*Log In*), penyisipan saluran baharu, *wizard upload CSV*, dan amaran borang dijawab AI menggunakan *Playwright* atau *Cypress*.

---

## 4. Senarai Semak Penerimaan (Definition of Done)
1. Ralat rangkaian / *Fetch CORS error* dihadam baik menggunakan *React Error Boundaries* dengan memaparkan notifikasi UI kepada pentadbir.
2. Skrin mudah-alih bebas rintangan (Boleh skrol dan isian form terbaca jelas).
3. Penyeragaman templat (warna ruji SaaS, saiz teks, butang standar berpandukan pustaka antaramuka UI `shadcn/ui`).
4. Tiada `console.log()` bersifat informasi tersembunyi sewaktu mod *Production* dalam pelayar pelanggan.
