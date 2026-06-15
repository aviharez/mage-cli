/**
 * skill-howto.ts — Teks "Cara Kerja" per skill bawaan Mage.
 *
 * File ini dikelola secara manual. Untuk menambah atau mengubah penjelasan
 * sebuah skill, edit entri yang sesuai di sini.
 * JANGAN ubah teks ini melalui generator (gen-skills.ts) — generator hanya
 * menghasilkan data teknis (name, description, author, license).
 *
 * Format: satu string per skill, multi-paragraf dipisah dengan "\n\n".
 * HubDetail.tsx akan memecah string ini menjadi elemen <p> terpisah.
 */

export const SKILL_HOWTO: Record<string, string> = {

  "angular-developer":
    "Ketik /angular-developer di prompt, lalu deskripsikan tugas Angular yang ingin diselesaikan. " +
    "Mage akan memandu setiap keputusan arsitektural secara otomatis.\n\n" +
    "Skill ini aktif secara otomatis ketika Anda membuat, memperbarui, atau memodernisasi proyek Angular — " +
    "termasuk migrasi ng update, upgrade versi (misalnya v18 → v20), migrasi ke komponen standalone, " +
    "penerapan sintaks control flow (@if/@for/@switch), sinyal reaktivitas, serta konfigurasi " +
    "routing, SSR, form, dependency injection, aksesibilitas (ARIA), animasi, styling, dan CLI tooling.",

  "angular-new-app":
    "Ketik /angular-new-app di prompt, lalu sebutkan nama aplikasi dan preferensi awal Anda. " +
    "Mage akan menjalankan Angular CLI dengan konfigurasi yang direkomendasikan untuk aplikasi modern.\n\n" +
    "Skill ini digunakan setiap kali Anda ingin membuat aplikasi Angular baru dari awal. " +
    "Skill ini memastikan struktur folder, konfigurasi build, dan pilihan tooling mengikuti " +
    "praktik terbaik Angular terkini — bukan template default yang sudah usang.",

  "api-and-interface-design":
    "Ketik /api-and-interface-design di prompt, lalu jelaskan API atau boundary yang ingin Anda rancang. " +
    "Mage akan memandu desain yang stabil dan backward-compatible.\n\n" +
    "Skill ini relevan ketika Anda merancang endpoint REST atau GraphQL, mendefinisikan kontrak tipe " +
    "antar modul, atau menetapkan batas tanggung jawab antara frontend dan backend. " +
    "Ideal digunakan di awal sebelum implementasi dimulai agar perubahan di kemudian hari tidak merusak kontrak yang sudah ada.",

  "browser-testing-with-devtools":
    "Ketik /browser-testing-with-devtools di prompt untuk memulai sesi pengujian browser berbasis agent. " +
    "Pastikan MCP server chrome-devtools sudah dikonfigurasi terlebih dahulu.\n\n" +
    "Skill ini otomatis terlibat ketika Anda membangun atau men-debug fitur yang berjalan di browser — " +
    "mulai dari inspeksi DOM, menangkap console error, menganalisis network request, " +
    "profiling performa, hingga memverifikasi output visual secara langsung di runtime nyata.",

  "ci-cd-and-automation":
    "Ketik /ci-cd-and-automation di prompt, lalu jelaskan pipeline yang ingin Anda buat atau ubah. " +
    "Mage akan membantu merancang langkah build, test, dan deployment yang sesuai.\n\n" +
    "Skill ini berguna ketika Anda menyiapkan atau memodifikasi pipeline CI/CD — mengotomasi quality gate, " +
    "mengonfigurasi test runner di lingkungan CI, menerapkan strategi deployment bertahap, " +
    "atau mengintegrasikan cek keamanan dan coverage ke dalam alur kerja tim.",

  "code-review-and-quality":
    "Ketik /code-review-and-quality di prompt, lalu tunjukkan kode atau diff yang ingin ditinjau. " +
    "Mage akan melakukan review multi-dimensi secara sistematis.\n\n" +
    "Gunakan skill ini sebelum merge pull request — baik kode yang Anda tulis sendiri, " +
    "hasil output agent lain, maupun kode dari anggota tim. Skill ini menilai correctness, " +
    "maintainability, keamanan, performa, dan kesesuaian dengan konvensi yang sudah ada di codebase.",

  "code-simplification":
    "Ketik /code-simplification di prompt, lalu arahkan ke file atau fungsi yang ingin disederhanakan. " +
    "Mage akan menyederhanakan kode tanpa mengubah perilakunya.\n\n" +
    "Skill ini paling efektif ketika kode sudah berjalan dengan benar tetapi sulit dibaca, " +
    "dipelihara, atau diperluas — misalnya fungsi yang terlalu panjang, nested condition yang dalam, " +
    "atau abstraksi yang tidak perlu. Skill ini tidak mengubah behavior; hanya memoles keterbacaan.",

  "context-engineering":
    "Ketik /context-engineering di prompt untuk mengoptimalkan konteks sesi Mage Anda saat ini. " +
    "Mage akan membantu menyusun rules file, instruksi proyek, dan konteks yang relevan.\n\n" +
    "Gunakan skill ini di awal sesi baru, ketika kualitas output agent mulai menurun, " +
    "saat berpindah antar task yang sangat berbeda, atau ketika Anda ingin mengonfigurasi " +
    "AGENTS.md / CLAUDE.md agar agent bekerja lebih akurat untuk proyek spesifik.",

  "debugging-and-error-recovery":
    "Ketik /debugging-and-error-recovery di prompt, lalu tempelkan pesan error atau deskripsikan perilaku yang tidak diharapkan. " +
    "Mage akan memandu investigasi root cause secara sistematis.\n\n" +
    "Skill ini aktif ketika test gagal, build rusak, output tidak sesuai ekspektasi, " +
    "atau Anda menemui error yang tidak jelas asalnya. Alih-alih menebak-nebak, " +
    "skill ini mendorong hipotesis terarah, isolasi variabel, dan verifikasi perbaikan sebelum dianggap selesai.",

  "deprecation-and-migration":
    "Ketik /deprecation-and-migration di prompt, lalu jelaskan sistem lama yang ingin Anda hapus atau ganti. " +
    "Mage akan merancang strategi migrasi yang aman dan bertahap.\n\n" +
    "Skill ini tepat digunakan ketika menghapus API lama, memindahkan pengguna dari satu implementasi ke implementasi baru, " +
    "atau memutuskan apakah suatu kode sebaiknya dipertahankan atau dihentikan. " +
    "Skill ini mencakup strategi versioning, komunikasi perubahan breaking, dan jalan mundur bila diperlukan.",

  "documentation-and-adrs":
    "Ketik /documentation-and-adrs di prompt, lalu jelaskan keputusan atau perubahan yang ingin didokumentasikan. " +
    "Mage akan menghasilkan ADR atau dokumentasi teknis yang terstruktur.\n\n" +
    "Gunakan skill ini ketika membuat keputusan arsitektural penting, mengubah API publik, " +
    "merilis fitur baru, atau kapan pun Anda ingin merekam konteks yang akan dibutuhkan " +
    "oleh engineer atau agent di masa mendatang untuk memahami mengapa suatu keputusan dibuat.",

  "doubt-driven-development":
    "Ketik /doubt-driven-development di prompt sebelum mengeksekusi keputusan teknis yang berisiko. " +
    "Mage akan menjalankan review adversarial dari konteks segar untuk menantang asumsi Anda.\n\n" +
    "Skill ini paling bernilai ketika correctness lebih penting dari kecepatan, ketika Anda bekerja " +
    "di kode yang asing, atau ketika taruhan tinggi — logika kritis produksi, keamanan, atau operasi " +
    "yang tidak dapat dibatalkan. Sebuah verifikasi sekarang jauh lebih murah daripada debugging nanti.",

  "frontend-ui-engineering":
    "Ketik /frontend-ui-engineering di prompt, lalu deskripsikan komponen atau halaman yang ingin dibangun. " +
    "Mage akan menghasilkan UI yang terasa diproduksi, bukan sekadar prototipe.\n\n" +
    "Skill ini aktif ketika Anda membangun atau memodifikasi antarmuka pengguna — " +
    "membuat komponen, mengimplementasikan layout, mengelola state, atau ketika hasil akhir " +
    "harus terasa polished dan production-quality, bukan seperti kode yang dihasilkan AI secara asal.",

  "functional-flow":
    "Ketik /functional-flow di prompt, atau minta Mage untuk 'buat FFL', 'generate functional flow', " +
    "atau 'buat peta endpoint'. Mage akan memindai codebase dan menghasilkan dokumen FFL.md lengkap.\n\n" +
    "Skill ini berjalan secara otomatis ketika Anda meminta functional flow document, flow diagram arsitektur, " +
    "peta endpoint API, atau dokumentasi alur fitur untuk proyek Angular, Spring Boot, atau stack lainnya. " +
    "Output mencakup diagram Mermaid sequence dan flowchart, serta daftar semua endpoint yang ditemukan.",

  "git-workflow-and-versioning":
    "Ketik /git-workflow-and-versioning di prompt untuk mendapatkan panduan alur kerja git yang terstruktur. " +
    "Mage akan membantu menentukan strategi commit, branching, dan conflict resolution yang tepat.\n\n" +
    "Skill ini terlibat setiap kali Anda membuat perubahan kode — saat commit, branching, " +
    "menyelesaikan konflik, atau ketika Anda perlu mengorganisasi pekerjaan paralel " +
    "di beberapa stream secara bersamaan tanpa saling mengganggu.",

  "idea-refine":
    "Ketik /idea-refine, atau gunakan kata 'ideate', 'refine this idea', atau 'stress-test my plan' " +
    "di prompt untuk memulai sesi pemurnian ide.\n\n" +
    "Skill ini paling efektif ketika ide Anda masih samar dan belum berbentuk rencana konkret, " +
    "ketika Anda ingin menguji asumsi sebelum berkomitmen pada satu pendekatan, " +
    "atau ketika Anda perlu memperluas ruang opsi sebelum menyempitkannya ke satu pilihan terbaik.",

  "incremental-implementation":
    "Ketik /incremental-implementation di prompt sebelum memulai implementasi fitur besar. " +
    "Mage akan memecah pekerjaan menjadi langkah-langkah kecil yang bisa di-land satu per satu.\n\n" +
    "Skill ini aktif ketika implementasi menyentuh lebih dari satu file, ketika Anda akan menulis " +
    "banyak kode sekaligus, atau ketika sebuah task terasa terlalu besar untuk diselesaikan dalam satu langkah. " +
    "Setiap incremental change dapat di-review, di-test, dan di-revert secara mandiri.",

  "interview-me":
    "Ketik /interview-me di prompt, atau gunakan frasa 'interview me', 'grill me', 'are we sure?', " +
    "atau 'stress-test my thinking' untuk memulai sesi klarifikasi satu pertanyaan per giliran.\n\n" +
    "Skill ini digunakan ketika permintaan Anda masih underspecified — misalnya 'buat fitur X' " +
    "tanpa konteks 'untuk siapa' atau 'mengapa sekarang'. Skill ini menggali intent sebenarnya " +
    "hingga ~95% yakin sebelum mulai merencanakan atau menulis kode apa pun.",

  "mbb-lib":
    "Ketik /mbb-lib di prompt, atau Mage akan mengaktifkan skill ini secara otomatis sebelum " +
    "membuat, scaffolding, atau mengedit komponen Angular di proyek yang bergantung pada " +
    "@mybcabisnis-web/lib atau @mybcabisnis/lib.\n\n" +
    "Skill ini memastikan komponen library myBCA Bisnis yang sudah tersedia dipakai kembali " +
    "alih-alih dibangun ulang dari nol. Sangat penting untuk proyek myBCA Bisnis agar " +
    "tampilan, perilaku, dan aksesibilitas tetap konsisten dengan desain sistem internal myBCA Bisnis.",

  "performance-optimization":
    "Ketik /performance-optimization di prompt, lalu jelaskan area yang ingin dioptimalkan " +
    "atau tempelkan hasil profiling. Mage akan memandu identifikasi dan perbaikan bottleneck.\n\n" +
    "Skill ini relevan ketika ada syarat performa yang belum terpenuhi, ketika Anda mencurigai " +
    "regresi performa setelah perubahan kode, atau ketika Core Web Vitals atau waktu muat " +
    "perlu ditingkatkan. Gunakan bersama profiling tool agar perbaikan berbasis data, bukan dugaan.",

  "planning-and-task-breakdown":
    "Ketik /planning-and-task-breakdown di prompt, lalu berikan spesifikasi atau deskripsi fitur yang ingin diimplementasikan. " +
    "Mage akan menghasilkan daftar task terurut yang siap dikerjakan.\n\n" +
    "Skill ini paling berguna ketika Anda sudah memiliki spec dan perlu memecahnya menjadi task yang bisa diimplementasikan, " +
    "ketika sebuah task terasa terlalu besar untuk langsung dimulai, atau ketika pekerjaan bisa dilakukan " +
    "secara paralel dan urutan pengerjaannya perlu direncanakan.",

  "readme":
    "Ketik /readme di prompt untuk membuat atau memperbarui README proyek saat ini. " +
    "Mage akan mendeteksi README boilerplate dan menggantinya dengan dokumentasi yang nyata.\n\n" +
    "Skill ini otomatis mendeteksi README default dari Angular CLI, create-next-app, Vite, Vue, " +
    "NestJS, atau Spring Boot — dan menggantinya. Skill ini juga menemukan dan menautkan " +
    "dokumentasi yang sudah ada (FFL.md, CHANGELOG, docs/, ADR). " +
    "README yang sudah dikustomisasi tidak akan ditimpa; hanya link dokumen yang ditambahkan.",

  "security-and-hardening":
    "Ketik /security-and-hardening di prompt, lalu tunjukkan kode atau fitur yang ingin diamankan. " +
    "Mage akan menganalisis vektor serangan dan merekomendasikan perbaikan.\n\n" +
    "Skill ini aktif ketika Anda menangani input pengguna, autentikasi, penyimpanan data sensitif, " +
    "atau integrasi dengan layanan eksternal. Gunakan setiap kali membangun fitur yang menerima " +
    "data tidak terpercaya, mengelola sesi pengguna, atau berinteraksi dengan third-party service.",

  "shipping-and-launch":
    "Ketik /shipping-and-launch di prompt ketika Anda siap deploy ke produksi. " +
    "Mage akan menghasilkan pre-launch checklist dan rencana rollout yang sesuai.\n\n" +
    "Skill ini mencakup persiapan monitoring, strategi rollout bertahap, rencana rollback, " +
    "dan verifikasi akhir sebelum traffic dialihkan. Ideal digunakan setelah feature freeze " +
    "ketika semua test sudah hijau dan Anda perlu memastikan tidak ada yang terlewat.",

  "source-driven-development":
    "Ketik /source-driven-development di prompt, lalu sebutkan library atau framework yang ingin digunakan. " +
    "Mage akan mengambil dokumentasi resmi sebelum menulis kode apa pun.\n\n" +
    "Skill ini paling berharga ketika correctness sangat penting — membangun dengan framework yang " +
    "sering berubah API-nya, mengimplementasikan pola keamanan, atau mengintegrasikan SDK eksternal. " +
    "Setiap keputusan implementasi dikaitkan dengan sumber resmi, bukan asumsi dari training data.",

  "spec-driven-development":
    "Ketik /spec-driven-development di prompt sebelum memulai fitur atau perubahan signifikan. " +
    "Mage akan membuat spec terlebih dahulu sebelum satu baris kode pun ditulis.\n\n" +
    "Skill ini digunakan ketika memulai proyek baru, fitur baru, atau perubahan besar " +
    "yang belum memiliki spesifikasi. Sangat efektif ketika persyaratan masih samar atau ambigu — " +
    "spec yang baik mencegah perombakan besar di tengah implementasi.",

  "test-driven-development":
    "Ketik /test-driven-development di prompt sebelum mengimplementasikan logika baru. " +
    "Mage akan menulis test terlebih dahulu, lalu memandu implementasi hingga test tersebut lulus.\n\n" +
    "Skill ini aktif ketika mengimplementasikan logika apa pun, memperbaiki bug, " +
    "atau mengubah perilaku yang sudah ada. Jika laporan bug masuk, skill ini memulai " +
    "dengan test yang mereproduksi bug sebelum menulis perbaikan — sehingga bug yang sama tidak muncul lagi.",

  "using-agent-skills":
    "Ketik /using-agent-skills di prompt untuk menemukan skill mana yang paling tepat untuk task saat ini. " +
    "Mage akan memandu Anda memilih dan menginvoke skill yang sesuai.\n\n" +
    "Ini adalah meta-skill yang mengatur cara semua skill lain ditemukan dan diaktifkan. " +
    "Gunakan di awal sesi baru atau ketika Anda tidak yakin skill mana yang harus dipanggil. " +
    "Skill ini juga menjelaskan cara kerja mekanisme invokasi skill secara keseluruhan.",

  "verify":
    "Ketik /verify di prompt, lalu sebutkan perubahan atau fitur yang ingin diverifikasi. " +
    "Mage akan menjalankan aplikasi dan mengamati perilaku secara langsung — bukan sekadar membaca kode.\n\n" +
    "Skill ini aktif ketika Anda diminta memverifikasi PR, mengonfirmasi bahwa perbaikan berhasil, " +
    "menguji perubahan secara manual, atau memvalidasi bahwa fitur berfungsi end-to-end sebelum push. " +
    "Skill ini menguji golden path dan edge case, serta memantau regresi pada fungsionalitas sekitar.",
}
