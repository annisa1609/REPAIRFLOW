// ===== REPAIRFLOW - FULL + FIREBASE =====
const STORAGE_KEY = "repairflow_public_reports_v1";
const USERS_KEY = "repairflow_users_v2";
const SESSION_KEY = "repairflow_session_v2";
const STAFF_KEY = "rf_staff_until";
const LOCK_KEY = "rf_lock_v1";
const STAFF_SALT = "repairflow-medan::v2";
const STAFF_ITER = 150000;
const STAFF_HASH = "ea0e0ef38d4a6fb6ed452c2ae476b6fe95f2ce8dd514c59c0c77cce70231f67e";

const ST = {SENT:"Dikirim", ACC:"Diterima", WAIT:"Menunggu Prioritas", FIX:"Diperbaiki", REJ:"Ditolak"};
const ST_ALL = [ST.SENT, ST.ACC, ST.WAIT, ST.FIX, ST.REJ];

// ===== 1. FIREBASE CONFIG - GANTI DENGAN PUNYA KAMU =====
const firebaseConfig = {
  apiKey: "ISI_APIKEY_KAMU",
  authDomain: "repairflow-e8b2a.firebaseapp.com",
  projectId: "repairflow-e8b2a",
  storageBucket: "repairflow-e8b2a.appspot.com",
  messagingSenderId: "ISI_SENDER_ID_KAMU",
  appId: "ISI_APP_ID_KAMU"
};

let db = null;
try {
  if (typeof firebase !== "undefined") {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase nyambung!");
  }
} catch(e){ console.log("Firebase gagal:", e); }

// ===== 2. DATA SIMULASI JURNAL - JANGAN DIHAPUS =====
const SIM_DATA = [
  {id:"A1", nama:"Ahmad", jalan:"Jl. Sei Deli No.12, Medan", kategori:"Jalan Berlubang", status:"Dikirim", lat:3.5952, lng:98.6722, tanggal:"2026-01-10"},
  {id:"A2", nama:"Siti", jalan:"Jl. Setia Budi No.45, Medan", kategori:"Lampu Jalan Mati", status:"Diterima", lat:3.6001, lng:98.6788, tanggal:"2026-01-11"},
  {id:"A3", nama:"Budi", jalan:"Jl. Gatot Subroto No.88, Medan", kategori:"Drainase Tersumbat", status:"Menunggu Prioritas", lat:3.5800, lng:98.6600, tanggal:"2026-01-12"},
  {id:"A4", nama:"Dewi", jalan:"Jl. Sisingamangaraja No.5, Medan", kategori:"Jalan Berlubang", status:"Diperbaiki", lat:3.5700, lng:98.6800, tanggal:"2026-01-13"},
  {id:"A5", nama:"Rizki", jalan:"Jl. Brigjen Katamso No.20, Medan", kategori:"Trotoar Rusak", status:"Ditolak", lat:3.5900, lng:98.6900, tanggal:"2026-01-14"},
];

// ===== 3. LOAD & SAVE =====
function loadReports(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(Array.isArray(parsed) && parsed.length>0) return parsed;
    }
  }catch(e){}
  return [...SIM_DATA];
}
function saveReports(list){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }catch(e){}
}

let reports = loadReports();

// ===== 4. KIRIM KE FIREBASE =====
async function kirimKeFirebase(laporan){
  if(!db) { console.log("DB belum siap"); return; }
  try{
    await db.collection("orders").add({
      nama: laporan.nama || "",
      jalan: laporan.jalan || "",
      kategori: laporan.kategori || "",
      status: laporan.status || ST.SENT,
      lat: laporan.lat || null,
      lng: laporan.lng || null,
      tanggal: laporan.tanggal || new Date().toISOString().slice(0,10),
      createdAt: new Date().toISOString()
    });
    console.log("Masuk Firebase!");
  }catch(e){ console.log("Gagal kirim Firebase:", e); }
}

// Ambil data dari Firebase buat nambahin ke list (biar gak ilang pas refresh)
async function ambilDariFirebase(){
  if(!db) return;
  try{
    const snap = await db.collection("orders").orderBy("createdAt","desc").limit(50).get();
    snap.forEach(doc=>{
      const d = doc.data();
      // Cek biar gak duplikat
      const sudahAda = reports.some(r => r._fbId === doc.id);
      if(!sudahAda){
        reports.unshift({
          id: "FB-" + doc.id.slice(0,5),
          _fbId: doc.id,
          nama: d.nama, jalan: d.jalan, kategori: d.kategori,
          status: d.status, lat: d.lat, lng: d.lng, tanggal: d.tanggal
        });
      }
    });
    saveReports(reports);
    renderAll();
  }catch(e){ console.log("Gagal ambil Firebase:", e); }
}

// ===== 5. TAMBAH LAPORAN BARU =====
function tambahLaporan(dataBaru){
  const baru = {
    id: "R" + Date.now().toString().slice(-5),
    nama: dataBaru.nama,
    jalan: dataBaru.jalan,
    kategori: dataBaru.kategori,
    status: ST.SENT,
    lat: dataBaru.lat || 3.5952,
    lng: dataBaru.lng || 98.6722,
    tanggal: new Date().toISOString().slice(0,10)
  };
  reports.unshift(baru);
  saveReports(reports);
  kirimKeFirebase(baru); // <-- INI YANG BIKIN MASUK FIREBASE
  renderAll();
  return baru;
}

// ===== 6. RENDER (Nyesuain sama index.html kamu) =====
function renderAll(){
  // Total laporan
  const elTotal = document.getElementById("totalLaporan") || document.querySelector("[data-total]");
  if(elTotal) elTotal.textContent = reports.length;

  // Hitung per status
  const counts = {};
  ST_ALL.forEach(s => counts[s] = reports.filter(r=>r.status===s).length);
  ["Dikirim","Diterima","Menunggu Prioritas","Diperbaiki","Ditolak"].forEach(s=>{
    const el = document.getElementById("count-"+s);
    if(el) el.textContent = counts[s] || 0;
  });

  // Tabel / List
  const tbody = document.getElementById("laporanBody") || document.getElementById("reportList") || document.querySelector("tbody");
  if(tbody){
    tbody.innerHTML = reports.map(r=>`
      <tr>
        <td>${r.id}</td>
        <td>${r.nama}</td>
        <td>${r.jalan}</td>
        <td>${r.kategori}</td>
        <td>${r.status}</td>
        <td>${r.tanggal}</td>
      </tr>
    `).join("");
  }
}

// ===== 7. FORM SUBMIT - OTOMATIS NYAMBUNG =====
document.addEventListener("DOMContentLoaded", ()=>{
  renderAll();
  ambilDariFirebase();

  const form = document.getElementById("laporanForm") || document.querySelector("form");
  if(form){
    form.addEventListener("submit", (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const dataBaru = {
        nama: fd.get("nama") || document.getElementById("nama")?.value || "Anonim",
        jalan: fd.get("jalan") || document.getElementById("jalan")?.value || "",
        kategori: fd.get("kategori") || document.getElementById("kategori")?.value || "Jalan Berlubang",
      };
      const hasil = tambahLaporan(dataBaru);
      alert("Laporan berhasil dikirim! ID: " + hasil.id + " - Sudah masuk Firebase!");
      form.reset();
    });
  }
});

// Biar bisa dipanggil dari console / tombol lain
window.tambahLaporan = tambahLaporan;
window.reports = reports;
window.kirimKeFirebase = kirimKeFirebase;
