# Deploy Web Manager ke Vercel

Panduan lengkap untuk deploy KawePluginsStandalone Web Manager ke Vercel.

## ⚠️ Troubleshooting 404 Error

Jika Anda mendapatkan error 404 setelah deploy:

### 1. Pastikan Framework Preset di Vercel
- Buka **Project Settings** → **General**
- Pastikan **"Framework Preset"** adalah **"Other"** atau **"Node.js"**
- **JANGAN** pilih Next.js, React, atau framework lain

### 2. Pastikan Build & Development Settings
- **Build Command:** (kosongkan atau biarkan default)
- **Output Directory:** (kosongkan)
- **Install Command:** `npm install`
- **Development Command:** `npm run dev`

### 3. Pastikan Root Directory
- Jika project ada di subfolder, set **Root Directory** ke `web-manager`
- Jika project di root, biarkan kosong

### 4. Redeploy setelah perubahan
- Setelah mengubah settings, klik **"Redeploy"** di dashboard Vercel
- **PENTING:** Uncheck **"Use existing Build Cache"** saat redeploy

### 5. Cek Logs
- Buka **Deployments** → Pilih deployment terbaru → **"View Function Logs"**
- Pastikan tidak ada error saat startup

## Setup Environment Variables di Vercel

**PENTING:** Environment variables HARUS di-set di Vercel sebelum deploy, atau aplikasi akan menggunakan default values.

### Format Environment Variables

Di Vercel Dashboard → Settings → Environment Variables, tambahkan variables berikut:

| Key | Value | Environment |
|-----|-------|-------------|
| `DB_HOST` | `your_db_host` | ✅ Production (wajib) |
| `DB_PORT` | `3306` | ✅ Production (wajib) |
| `DB_USER` | `your_db_user` | ✅ Production (wajib) |
| `DB_PASSWORD` | `your_db_password` | ✅ Production (wajib) |
| `DB_NAME` | `your_database_name` | ✅ Production (wajib) |
| `TABLE_PREFIX` | `kawe_` | ✅ Production (opsional, default: kawe_) |

**⚠️ PENTING:** Jangan set `PORT` di Vercel! Vercel akan otomatis set PORT untuk serverless functions.

### Langkah-langkah Input di Vercel:

1. **Buka Vercel Dashboard**
   - Login ke https://vercel.com
   - Pilih project **web-manager** (atau buat project baru)

2. **Pergi ke Settings → Environment Variables**
   - Klik tab "Environment Variables" di sidebar kiri

3. **Tambahkan setiap variable:**
   
   Klik **"Add New"** dan isi:
   
   - **Key:** `DB_HOST`
   - **Value:** `your_database_host`
   - **Environment:** ✅ Production (wajib), ✅ Preview (opsional), ✅ Development (opsional)
   - Klik **"Save"**
   
   Ulangi untuk:
   - `DB_PORT` = `3306` (atau port database Anda)
   - `DB_USER` = `your_database_user`
   - `DB_PASSWORD` = `your_database_password`
   - `DB_NAME` = `your_database_name`
   - `TABLE_PREFIX` = `kawe_` (opsional)

4. **Redeploy setelah menambahkan semua variables:**
   - Klik tab **"Deployments"**
   - Klik **"..."** pada deployment terbaru
   - Pilih **"Redeploy"**
   - **PENTING:** Uncheck "Use existing Build Cache"
   - Klik **"Redeploy"**

## Verifikasi Environment Variables

Setelah redeploy, cek logs di Vercel:
1. Buka deployment → "Logs"
2. Cari log yang dimulai dengan database connection
3. Pastikan tidak ada error koneksi database

**Contoh log yang benar:**
```
🚀 KawePluginsStandalone Web Manager running on http://localhost:3000
📊 Dashboard: http://localhost:3000
```

**Jika masih muncul error:**
- Environment variables belum di-set dengan benar
- Belum redeploy setelah menambahkan variables
- Cek apakah variable name sudah benar (case-sensitive)
- Pastikan database host accessible dari internet (bukan localhost)

## Troubleshooting

### Masalah: Masih connect ke localhost

**Solusi:**
1. ✅ Pastikan environment variables sudah di-set di Vercel Dashboard
2. ✅ Pastikan sudah **Redeploy** setelah menambahkan variables
3. ✅ Cek logs untuk melihat apakah variables terdeteksi
4. ✅ Pastikan variable names benar (DB_HOST, DB_USER, DB_NAME - semua uppercase)

### Masalah: "config.js not found"

**Ini NORMAL di Vercel!** File `config.js` tidak di-commit ke git (ada di .gitignore).
Aplikasi akan menggunakan environment variables jika `config.js` tidak ada.

### Masalah: Database connection failed

**Kemungkinan penyebab:**
1. Database host tidak accessible dari internet
2. Firewall memblokir koneksi dari Vercel IP
3. Database credentials salah
4. Database server down

**Solusi:**
- Pastikan database host accessible dari internet (bukan localhost)
- Whitelist Vercel IP ranges di firewall database
- Verifikasi credentials di environment variables
- Cek apakah database server sedang online

### Masalah: API routes tidak bekerja

**Solusi:**
1. ✅ Pastikan `vercel.json` sudah ada di root folder
2. ✅ Pastikan routes di `vercel.json` sudah benar
3. ✅ Cek logs untuk melihat apakah routes terdeteksi

## Catatan Penting

- ❌ **JANGAN commit file `config.js`** ke git (sudah ada di .gitignore)
- ✅ Environment variables akan **override** config.js jika ada
- ✅ Di production (Vercel), aplikasi akan **prioritas menggunakan environment variables**
- ✅ Pastikan database host **accessible dari internet** (bukan localhost)
- ✅ **Redeploy wajib** setelah menambahkan/mengubah environment variables
- ✅ Vercel menggunakan serverless functions, jadi `PORT` akan di-set otomatis

## Testing

Setelah deploy, cek:
1. Health check: `https://your-app.vercel.app/api/health`
2. Dashboard: `https://your-app.vercel.app/`
3. Cek logs di Vercel untuk melihat database config yang digunakan

## Fitur yang Tersedia

Web Manager ini mendukung:
- 📊 **Dashboard** - Overview server statistics
- 👥 **Factions** - View dan manage factions
- 📜 **Quests** - Create, edit, dan manage quests
- 🎮 **Players** - View player statistics
- 🛒 **Shop** - Manage shop items
- 🔐 **Player Login** - Login dengan auth code dari `/scode` command
- 📋 **My Quests** - Player dapat melihat dan manage quest mereka sendiri
- 📖 **Commands** - Daftar semua commands yang tersedia

## Admin Mode

Untuk mengakses fitur admin (create/edit quests, shop items), tambahkan `?adm=kawe` di URL:
```
https://your-app.vercel.app/?adm=kawe
```

## Player Login

Player dapat login menggunakan auth code yang didapat dari command `/scode` di game.

