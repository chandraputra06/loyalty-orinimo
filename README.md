# Orinimo Loyalty Club (React + Vite + Supabase)

Kartu stamp digital untuk Orinimo Prem Apps. Setiap Rp10.000 = 1 stamp, 10 stamp = voucher diskon (angka ini bisa diubah di halaman **Program**).

- **Pelanggan** membuka kartunya lewat link pribadi `/k/<token>` yang dikirim admin via WhatsApp.
- **Admin** login di `/admin/login`. Menu admin: Scanner, Dashboard, Pelanggan, Program, dan Desain kartu.
- Tanpa Supabase, aplikasi otomatis berjalan dalam **mode demo**: datanya disimpan di browser dan sudah berisi pelanggan contoh. Mode ini cocok untuk mencoba tampilan.

---

## 1. Coba di komputer sendiri (mode demo)

Butuh **Node.js 20 atau lebih baru** (https://nodejs.org).

```bash
npm install
npm run dev
```

Buka http://localhost:5173.

- Klik **Admin**, lalu **Masuk**. Di mode demo tidak perlu password. PIN untuk membuka kunci Scanner adalah `1234`.
- Untuk melihat stamp masuk secara realtime, buka kartu pelanggan di satu tab, lalu beri stamp dari Scanner di tab lain.

---

## 2. Siapkan Supabase (database, login admin, penyimpanan gambar)

1. Daftar di https://supabase.com, lalu klik **New project**.
   - Region: **Southeast Asia (Singapore)**.
   - Simpan password database di tempat aman.
2. Buka **SQL Editor** → **New query**. Tempel seluruh isi `supabase/schema.sql`, lalu klik **Run**.
   - File ini membuat semua tabel, aturan keamanan (RLS), fungsi transaksi, pricelist awal, dan bucket gambar `card-designs`.
   - File ini aman dijalankan ulang kalau nanti ada pembaruan.
3. Buat akun admin pertama (owner):
   - Buka **Authentication → Users → Add user → Create new user**.
   - Isi email dan password, lalu centang **Auto Confirm User**.
   - Kembali ke **SQL Editor** dan jalankan perintah berikut (ganti emailnya):
     ```sql
     insert into public.staff (user_id, role)
     select id, 'owner' from auth.users where email = 'owner@orinimo.com';
     ```
   - Untuk admin biasa, buat user dengan cara yang sama, lalu jalankan perintah di atas dengan `'admin'` sebagai pengganti `'owner'`.
     - Admin hanya bisa melakukan undo dalam 5 menit dan tidak bisa membatalkan transaksi redeem.
     - Owner bisa mengoreksi kapan saja.
4. Ambil kunci API di **Project Settings → API**:
   - **Project URL**, contoh `https://abcd1234.supabase.co`.
   - **anon public key** (aman dipakai di website karena dilindungi RLS).
   - Jangan pernah memakai **service_role key** di website.
5. Cek realtime di **Realtime → Settings**. Pastikan opsi akses publik untuk channel (*Allow public access*) **aktif**. Opsi ini membuat stamp langsung muncul di kartu pelanggan tanpa refresh.

Untuk mencoba versi Supabase di komputer sendiri, salin `.env.example` menjadi `.env`, isi nilainya, lalu jalankan `npm run dev` lagi.

```
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_ORINIMO_WA=6281234567890
```

`VITE_ORINIMO_WA` adalah nomor WhatsApp Orinimo yang menerima kode aktivasi. Tulis dalam format 62…, tanpa tanda + dan spasi.

---

## 3. Online-kan websitenya

### Pilihan A: Netlify (disarankan)

1. Upload folder project ini ke GitHub sebagai repo baru. File `.env` tidak ikut terupload (sudah diatur di `.gitignore`).
2. Di https://app.netlify.com pilih **Add new site → Import an existing project**, lalu pilih repo tadi.
3. Isi pengaturan build:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Buka **Site configuration → Environment variables** dan tambahkan `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `VITE_ORINIMO_WA`.
5. Klik **Deploy**. Setiap kali ada push ke GitHub, Netlify akan deploy ulang otomatis.

File `public/_redirects` sudah disertakan, jadi link `/k/...` dan `/admin/...` tidak akan 404 saat dibuka langsung.

> **Tanpa GitHub:** isi `.env` lalu jalankan `npm run build`. Setelah itu seret folder `dist` ke https://app.netlify.com/drop. Login dulu supaya situsnya tidak terhapus. Kalau `.env` berubah, ulangi build dan upload.

### Pilihan B: Vercel

1. Di https://vercel.com pilih **Add New → Project**, lalu import repo GitHub.
2. Framework akan terdeteksi otomatis sebagai Vite.
3. Tambahkan tiga environment variable yang sama seperti di Netlify, lalu klik **Deploy**.

File `vercel.json` sudah mengatur agar semua halaman diarahkan ke aplikasi.

### Setelah online

- **Domain sendiri** (misalnya `member.orinimo.com`): tambahkan lewat menu **Domains** di Netlify/Vercel.
- **Supabase**: buka **Authentication → URL Configuration** dan isi **Site URL** dengan alamat website kamu.
- **Link kartu** dibuat dari alamat website yang sedang dibuka admin. Jadi selalu buka Scanner dari domain utama saat mengirim link ke pelanggan.

---

## 4. Alur pemakaian sehari-hari

1. Pelanggan order lewat WhatsApp dan membayar dengan QRIS GoPay.
2. Admin membuka **Scanner**, lalu mencari pelanggan dengan salah satu cara berikut:
   - Ketik **4 angka terakhir** nomor WA.
   - Ketik nomor lengkap.
   - Scan QR di kartu pelanggan (mode Camera atau Photo).
3. Nomor yang belum terdaftar bisa langsung dibuatkan kartu. Setelah itu tekan **Kirim link kartu via WhatsApp**.
4. Isi total yang dibayar, atau pilih paket dari pricelist. Centang **Dana sudah masuk**, lalu tekan **Stamp**.
   - Ada pengaman untuk nominal besar.
   - Ada juga peringatan kalau transaksi mirip transaksi sebelumnya dalam 15 menit.
5. Kalau pelanggan punya voucher, tekan **Redeem**. Diskon, minimal belanja, dan batas potongan dihitung otomatis.
6. Kalau salah input, tekan **Undo stamp** dalam 5 menit.
7. Pelanggan yang daftar sendiri dari website mendapat kode `AKTIF-XXXX` untuk dikirim ke WhatsApp Orinimo. Ketik kode itu di Scanner, lalu tekan **Aktifkan kartu**.

---

## 5. Hal penting

- **Paket gratis Supabase**:
  - Project akan di-*pause* kalau tidak ada aktivitas selama 1 minggu. Buka dashboard Supabase untuk menyalakannya lagi.
  - Untuk bisnis yang berjalan terus, pertimbangkan paket Pro.
- **Backup**: kamu bisa mengekspor data kapan saja dari **Table Editor → Export to CSV**.
- **Pricelist** disimpan di tabel `products`. Ubah harga atau tambah produk lewat **Table Editor**.
  - Kolom `active = false` menyembunyikan produk.
  - Kolom `sort` mengatur urutan tampil.
- **Keamanan**:
  - Semua perhitungan stamp, voucher, dan undo dijalankan di database (fungsi `award_order`, `undo_op`, dan lainnya). Dengan begitu angka tidak bisa diakali dari browser.
  - Pelanggan hanya bisa melihat kartunya sendiri lewat token pribadinya.
  - **Terbitkan link baru** mematikan link lama tanpa menghapus saldo.

---

## 6. Struktur kode

```
supabase/schema.sql        Database lengkap: tabel, RLS, fungsi transaksi, storage
src/config.js              Membaca .env, menentukan mode demo/produksi
src/lib/api.js             Pintu tunggal ke data (pilih demoApi atau supabaseApi)
src/lib/supabaseApi.js     Implementasi produksi (Supabase)
src/lib/demoApi.js         Implementasi demo (localStorage)
src/lib/realtime.js        Notifikasi stamp realtime ke kartu pelanggan
src/lib/stage.js           Kartu 3D dan animasi cap stamp
src/lib/theme.js           Tema kartu, bentuk cap, jadwal tema musiman
src/components/            Layout, efek latar (popcorn, pita film, tirai), kartu
src/context/               Data program, login admin, toast & animasi pesta
src/pages/Home.jsx         Gabung & minta link ulang
src/pages/CardPage.jsx     Kartu member pelanggan
src/pages/admin/           Scanner, Dashboard, Pelanggan, Program, Desain kartu
public/assets/             Logo & maskot
```

Perintah lain:

- `npm run build` membuat versi produksi ke folder `dist`.
- `npm run preview` menjalankan hasil build untuk dicek.
