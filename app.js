const STORAGE_KEY = "repairflow_public_reports_v1";
const USERS_KEY = "repairflow_users_v2";
const SESSION_KEY = "repairflow_session_v2";
const STAFF_KEY = "rf_staff_until";
const LOCK_KEY = "rf_lock_v1";
// Kredensial petugas TIDAK disimpan sebagai teks. Yang ada hanya hash PBKDF2 dari "pengenal + kata sandi".
// Cara mengganti: buka console browser, jalankan  await pbkdf2("pengenalBaru\u0000sandiBaru", STAFF_SALT, STAFF_ITER)
// lalu tempel hasilnya ke STAFF_HASH di bawah.
const STAFF_SALT = "repairflow-medan::v2";
const STAFF_ITER = 150000;
const STAFF_HASH = "ea0e0ef38d4a6fb6ed452c2ae476b6fe95f2ce8dd514c59c0c77cce70231f67e";
// ===== Istilah status: HARUS sama persis dengan flowchart jurnal =====
// Dikirim -> Diterima -> Menunggu Prioritas / Diperbaiki / Ditolak
// Jika istilah di flowchart Anda berbeda, ubah nilai di sini saja (satu tempat).
const ST = {SENT:"Dikirim", ACC:"Diterima", WAIT:"Menunggu Prioritas", FIX:"Diperbaiki", REJ:"Ditolak"};
const ST_ALL = [ST.SENT, ST.ACC, ST.WAIT, ST.FIX, ST.REJ];
const ST_OLD = {"Menunggu":ST.SENT, "Ditunda":ST.WAIT};   // migrasi data lama di browser
const ST_CLASS = {[ST.SENT]:"", [ST.ACC]:"accept", [ST.WAIT]:"wait", [ST.FIX]:"done", [ST.REJ]:"reject"};
function statusClass(s){return ST_CLASS[s]||""}
// Skala urgensi 1-5 (dipakai pada dropdown, panduan, dan tabel SAW)
const URGENCY = [
  {v:1, label:"Sangat rendah", desc:"Kerusakan ringan/estetika, tidak mengganggu fungsi maupun keselamatan."},
  {v:2, label:"Rendah", desc:"Fungsi sedikit terganggu, tidak ada risiko keselamatan."},
  {v:3, label:"Sedang", desc:"Mengganggu kenyamanan atau fungsi, risiko keselamatan kecil."},
  {v:4, label:"Tinggi", desc:"Berisiko menimbulkan kecelakaan atau mengganggu lalu lintas/aktivitas warga."},
  {v:5, label:"Sangat tinggi", desc:"Membahayakan keselamatan langsung atau fasilitas tidak dapat digunakan sama sekali."}
];
function urgencyText(v){const u=URGENCY.find(x=>x.v===Number(v));return u?`${u.v} - ${u.label}`:"-"}
let reports = loadReports();
let userMap, adminMap, userMarker, adminMarkers = [], selectedReviewId = null;
let pendingPhoto = "";

async function pbkdf2(text,salt,iter){
  if(!window.crypto||!crypto.subtle)throw new Error("nocrypto");
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(text),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:iter},key,256);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function safeEqual(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
function randomHex(n=16){return [...crypto.getRandomValues(new Uint8Array(n))].map(b=>b.toString(16).padStart(2,"0")).join("")}
function lockState(scope){try{return (JSON.parse(localStorage.getItem(LOCK_KEY))||{})[scope]||{n:0,until:0}}catch(e){return {n:0,until:0}}}
function setLock(scope,v){let all={};try{all=JSON.parse(localStorage.getItem(LOCK_KEY))||{}}catch(e){}all[scope]=v;localStorage.setItem(LOCK_KEY,JSON.stringify(all))}
function lockedFor(scope){const l=lockState(scope);return l.until>Date.now()?Math.ceil((l.until-Date.now())/1000):0}
function failAttempt(scope){const l=lockState(scope);const n=(l.n||0)+1;setLock(scope,n>=5?{n:0,until:Date.now()+60000}:{n,until:0})}
function clearAttempts(scope){setLock(scope,{n:0,until:0})}
function loadUsers(){try{return JSON.parse(localStorage.getItem(USERS_KEY)||"[]")}catch(e){return []}}
function saveUsers(u){localStorage.setItem(USERS_KEY,JSON.stringify(u))}
function currentUser(){const id=localStorage.getItem(SESSION_KEY);return id?loadUsers().find(u=>u.id===id)||null:null}
function loadReports(){
  try{
    const list=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
    list.forEach(r=>{if(ST_OLD[r.status])r.status=ST_OLD[r.status];if(r.decision==="DIPERBAIKI")r.decision=ST.FIX;if(r.decision==="DITUNDA")r.decision=ST.WAIT});
    // Pembersihan permanen: 2 laporan uji dihapus dari browser (admin + pengguna memakai satu sumber data yang sama)
    const PURGE=["RF-20261122-270532","RF-20261117-818762"];
    const kept=list.filter(r=>!PURGE.includes(String(r.id)));
    if(kept.length!==list.length)localStorage.setItem(STORAGE_KEY,JSON.stringify(kept));
    return kept;
  }catch(e){return []}
}
function saveReports(){localStorage.setItem(STORAGE_KEY,JSON.stringify(reports));updatePublicStats()}
function escapeHTML(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function rupiah(value){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value)||0)}
function showPage(page,arg){
  document.querySelectorAll(".page").forEach(el=>el.hidden=true);
  document.getElementById("page-"+page).hidden=false;
  document.querySelectorAll(".nav-link").forEach(el=>el.classList.remove("active"));
  const nav={report:"navReport",track:"navTrack"}[page];
  if(nav)document.getElementById(nav).classList.add("active");
  if(page!=="admin"&&location.hash==="#petugas")history.replaceState(null,"",location.pathname+location.search);
  if(page==="auth")switchAuthTab(arg||"login");
  if(page==="report"){updateGate();updatePublicStats();setTimeout(()=>{initUserMap();if(userMap)userMap.invalidateSize()},120)}
  if(page==="track")renderMyReports();
  if(page==="admin")refreshAdmin();
  window.scrollTo({top:0});
}
function scrollToSec(id){
  const go=()=>{const el=document.getElementById(id);if(el){const y=el.getBoundingClientRect().top+window.scrollY-110;window.scrollTo({top:y,behavior:"smooth"})}};
  if(document.getElementById("page-report").hidden){showPage("report");setTimeout(go,150)}else go();
}
function publicCounts(){
  const c=st=>reports.filter(r=>r.status===st).length;
  return {total:reports.length,sent:c(ST.SENT),acc:c(ST.ACC),wait:c(ST.WAIT),done:c(ST.FIX),rej:c(ST.REJ)};
}
let shownStats={};
function updatePublicStats(){
  const box=document.getElementById("pubStats");if(!box)return;
  const now=publicCounts();
  box.querySelectorAll("strong[data-k]").forEach(el=>{
    const k=el.dataset.k,from=shownStats[k]||0,to=now[k],t0=performance.now(),dur=700;
    if(from===to){el.textContent=to;return}
    const tick=t=>{const p=Math.min(1,(t-t0)/dur);el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(tick)};
    requestAnimationFrame(tick);
  });
  shownStats=now;
}
function goToForm(){scrollToSec("formAnchor")}
function updateGate(){
  const u=currentUser();
  document.getElementById("reportGate").hidden=!!u;
  document.getElementById("reportForm").hidden=!u;
  if(u)document.getElementById("welcomeBar").textContent="Masuk sebagai "+u.name+". Laporan akan tercatat atas nama akunmu.";
}
function renderAuthArea(){
  const u=currentUser(),box=document.getElementById("authArea");
  if(u){
    box.innerHTML=`<div class="user-chip"><span class="avatar">${escapeHTML(u.name.trim()[0].toUpperCase())}</span><span class="nm">${escapeHTML(u.name)}</span></div><button class="btn btn-outline" id="userLogoutBtn">Keluar</button>`;
    document.getElementById("userLogoutBtn").addEventListener("click",()=>{localStorage.removeItem(SESSION_KEY);renderAuthArea();showPage("report")});
  }else{
    box.innerHTML=`<button class="btn-login" onclick="showPage('auth','login')"><svg viewBox="0 0 24 24"><path d="M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm7 5v3H8v2h3v3h2v-3h3v-2h-3V8z"/></svg>Login</button>`;
  }
}
function switchAuthTab(tab){
  const login=tab!=="register";
  document.getElementById("tabLogin").classList.toggle("active",login);
  document.getElementById("tabRegister").classList.toggle("active",!login);
  document.getElementById("userLoginForm").hidden=!login;
  document.getElementById("userRegisterForm").hidden=login;
  document.getElementById("userLoginMsg").textContent="";document.getElementById("userRegisterMsg").textContent="";
}
document.getElementById("tabLogin").addEventListener("click",()=>switchAuthTab("login"));
document.getElementById("tabRegister").addEventListener("click",()=>switchAuthTab("register"));
document.getElementById("userRegisterForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=document.getElementById("userRegisterMsg");msg.className="message";
  const name=document.getElementById("regName").value.trim().replace(/\s+/g," "),email=document.getElementById("regEmail").value.trim().toLowerCase();
  const p1=document.getElementById("regPass").value,p2=document.getElementById("regPass2").value;
  if(name.length<3){msg.textContent="Nama minimal 3 karakter.";return}
  if(p1.length<8){msg.textContent="Kata sandi minimal 8 karakter.";return}
  if(p1!==p2){msg.textContent="Kata sandi dan pengulangannya tidak sama.";return}
  const users=loadUsers();
  if(users.some(u=>u.email===email)){msg.textContent="Email ini sudah terdaftar. Silakan masuk.";return}
  try{
    const salt=randomHex(16),hash=await pbkdf2(p1,salt,120000);
    const user={id:"U"+randomHex(6),name,email,salt,hash,createdAt:new Date().toISOString()};
    users.push(user);saveUsers(users);localStorage.setItem(SESSION_KEY,user.id);
    e.target.reset();renderAuthArea();showPage("report");
  }catch(err){msg.textContent="Browser tidak mendukung enkripsi. Buka lewat localhost atau HTTPS."}
});
document.getElementById("userLoginForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=document.getElementById("userLoginMsg");msg.className="message";
  const wait=lockedFor("user");if(wait){msg.textContent=`Terlalu banyak percobaan. Coba lagi dalam ${wait} detik.`;return}
  const email=document.getElementById("loginEmail").value.trim().toLowerCase(),pass=document.getElementById("loginPass").value;
  const user=loadUsers().find(u=>u.email===email);
  try{
    const hash=await pbkdf2(pass,user?user.salt:"x",120000);
    if(user&&safeEqual(hash,user.hash)){clearAttempts("user");localStorage.setItem(SESSION_KEY,user.id);e.target.reset();renderAuthArea();showPage("report")}
    else{failAttempt("user");msg.textContent="Email atau kata sandi salah."}
  }catch(err){msg.textContent="Browser tidak mendukung enkripsi. Buka lewat localhost atau HTTPS."}
});
function renderMyReports(){
  const u=currentUser(),box=document.getElementById("myReportsBox"),list=document.getElementById("myReports");
  if(!u){box.hidden=true;return}
  box.hidden=false;
  const mine=reports.filter(r=>r.ownerId===u.id);
  if(!mine.length){list.innerHTML='<div class="empty-state">Kamu belum mengirim laporan.</div>';return}
  list.innerHTML=mine.map(r=>{const c=statusClass(r.status);
    return `<article class="report-card"><img class="report-thumb" src="${r.photo}" alt="Foto kerusakan"><div><h3>${escapeHTML(r.name)} <span class="status ${c}">${escapeHTML(r.status)}</span></h3><p>${escapeHTML(r.type)} · ${escapeHTML(r.address)}</p><p>${new Date(r.createdAt).toLocaleString("id-ID")} · ${escapeHTML(r.id)}</p></div><div class="report-actions"><button class="btn btn-outline small-btn" onclick="lookupCode('${r.id}')">Lihat status</button></div></article>`}).join("");
}
function lookupCode(code){document.getElementById("trackingCode").value=code;document.getElementById("trackBtn").click();window.scrollTo({top:0,behavior:"smooth"})}
function initUserMap(){
  if(!window.L || userMap)return;
  userMap=L.map("userMap").setView([-3.5952,98.6722],12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; OpenStreetMap'}).addTo(userMap);
  userMap.on("click",e=>setLocation(e.latlng.lat,e.latlng.lng));
}
function setLocation(lat,lng){
  document.getElementById("latitude").value=Number(lat).toFixed(6);
  document.getElementById("longitude").value=Number(lng).toFixed(6);
  if(userMap){if(userMarker)userMarker.setLatLng([lat,lng]);else userMarker=L.marker([lat,lng]).addTo(userMap);userMap.setView([lat,lng],16)}
  document.getElementById("locationMessage").textContent="Titik lokasi berhasil dipilih. Mencari nama jalan...";
  reverseGeocode(lat,lng);
}
async function reverseGeocode(lat,lng){
  const address=document.getElementById("streetAddress");
  try{
    const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`);
    if(!response.ok)throw new Error("Geocoding gagal");
    const data=await response.json();
    address.value=data.display_name||"";
    if(!address.value)throw new Error("Alamat tidak ditemukan");
    document.getElementById("locationMessage").textContent="Nama jalan/alamat berhasil ditemukan. Periksa kembali sebelum mengirim.";
  }catch(e){document.getElementById("locationMessage").textContent="Nama jalan tidak ditemukan otomatis. Silakan isi alamat secara manual.";address.focus()}
}
document.getElementById("locateBtn").addEventListener("click",()=>{
  if(!navigator.geolocation){alert("Browser tidak mendukung GPS.");return}
  document.getElementById("locationMessage").textContent="Mengambil lokasi GPS...";
  navigator.geolocation.getCurrentPosition(pos=>setLocation(pos.coords.latitude,pos.coords.longitude),err=>{
    document.getElementById("locationMessage").textContent="Lokasi tidak dapat diakses. Izinkan GPS atau klik titik pada peta.";
    alert("Gagal mengambil lokasi. Pastikan izin lokasi aktif dan website dibuka melalui localhost atau HTTPS.");
  },{enableHighAccuracy:true,timeout:15000});
});
document.getElementById("photo").addEventListener("change",e=>{
  const file=e.target.files[0];if(!file)return;
  if(!file.type.startsWith("image/")){alert("File harus berupa gambar.");e.target.value="";return}
  if(file.size>3*1024*1024){alert("Ukuran foto maksimal 3 MB agar dapat disimpan di browser.");e.target.value="";return}
  const reader=new FileReader();reader.onload=()=>{pendingPhoto=reader.result;document.getElementById("photoPreview").src=pendingPhoto;document.getElementById("photoPreviewWrap").hidden=false};reader.readAsDataURL(file);
});
document.getElementById("reportForm").addEventListener("submit",e=>{
  e.preventDefault();
  const owner=currentUser();
  if(!owner){showPage("auth","login");return}
  const lat=Number(document.getElementById("latitude").value),lng=Number(document.getElementById("longitude").value);
  if(!pendingPhoto){alert("Silakan unggah foto kerusakan.");return}
  if(!lat||!lng){alert("Tentukan lokasi kerusakan melalui GPS atau klik peta.");return}
  const now=new Date();
  const code="RF-"+now.getFullYear()+String(now.getMonth()+1).padStart(2,"0")+String(now.getDate()).padStart(2,"0")+"-"+Math.floor(100000+Math.random()*900000);
  const report={id:code,name:document.getElementById("facilityName").value.trim(),type:document.getElementById("facilityType").value,description:document.getElementById("description").value.trim(),photo:pendingPhoto,address:document.getElementById("streetAddress").value.trim(),lat,lng,createdAt:now.toISOString(),ownerId:owner.id,ownerName:owner.name,status:ST.SENT,urgency:null,cost:null,adminNote:"",score:null,rank:null,decision:null};
  reports.unshift(report);
  try{saveReports()}catch(err){reports.shift();alert("Penyimpanan browser penuh. Coba gunakan foto yang lebih kecil.");return}
  document.getElementById("submitMessage").className="message success";
  document.getElementById("submitMessage").innerHTML=`Laporan berhasil dikirim. Nomor laporan kamu: <b>${code}</b>. Simpan nomor ini untuk mengecek status.`;
  e.target.reset();pendingPhoto="";document.getElementById("photoPreviewWrap").hidden=true;document.getElementById("latitude").value="";document.getElementById("longitude").value="";document.getElementById("streetAddress").value="";
  if(userMarker){userMap.removeLayer(userMarker);userMarker=null}
  document.getElementById("locationMessage").textContent="Laporan terkirim. Terima kasih.";
});
document.getElementById("trackBtn").addEventListener("click",()=>{
  const code=document.getElementById("trackingCode").value.trim().toUpperCase();
  const r=reports.find(x=>x.id.toUpperCase()===code),out=document.getElementById("trackingResult");
  if(!r){out.innerHTML='<div class="panel track-result">Nomor laporan tidak ditemukan. Periksa kembali nomor laporan.</div>';return}
  const sc=statusClass(r.status);
  out.innerHTML=`<div class="panel track-result"><div class="panel-head"><div><h2>${escapeHTML(r.name)}</h2><p>${escapeHTML(r.id)}</p></div><span class="status ${sc}">${escapeHTML(r.status)}</span></div><p><b>Waktu:</b> ${new Date(r.createdAt).toLocaleString("id-ID")}</p><p><b>Lokasi:</b> ${escapeHTML(r.address)}</p><p><b>Catatan admin:</b> ${escapeHTML(r.adminNote||"Belum ada catatan.")}</p>${r.decision?`<p><b>Hasil prioritas:</b> ${escapeHTML(r.decision)}</p>`:""}</div>`;
});
document.getElementById("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const msg=document.getElementById("loginMessage");
  const wait=lockedFor("staff");if(wait){msg.textContent=`Akses dikunci sementara. Coba lagi dalam ${wait} detik.`;return}
  const u=document.getElementById("adminUser").value.trim(),p=document.getElementById("adminPass").value;
  try{
    const h=await pbkdf2(u+"\u0000"+p,STAFF_SALT,STAFF_ITER);
    if(safeEqual(h,STAFF_HASH)){
      clearAttempts("staff");sessionStorage.setItem(STAFF_KEY,String(Date.now()+2*60*60*1000));
      msg.textContent="";e.target.reset();refreshAdmin();
    }else{failAttempt("staff");msg.textContent="Pengenal atau kata sandi tidak cocok."}
  }catch(err){msg.textContent="Browser tidak mendukung enkripsi. Buka lewat localhost atau HTTPS."}
});
document.getElementById("logoutBtn").addEventListener("click",()=>{sessionStorage.removeItem(STAFF_KEY);showPage("report")});
function staffLogged(){return Number(sessionStorage.getItem(STAFF_KEY)||0)>Date.now()}
function refreshAdmin(){
  const logged=staffLogged();
  document.getElementById("adminLogin").hidden=logged;document.getElementById("adminDashboard").hidden=!logged;
  if(!logged)return;
  renderAdminStats();
  renderAdminReports();renderAdminMap();renderSaw();
}
document.getElementById("reportFilter").addEventListener("change",renderAdminReports);
function renderAdminReports(){
  const filter=document.getElementById("reportFilter").value;
  const list=reports.filter(r=>filter==="all"||r.status===filter),box=document.getElementById("adminReports");
  if(!list.length){box.innerHTML='<div class="empty-state">Belum ada laporan pada kategori ini.</div>';return}
  box.innerHTML=list.map(r=>`<article class="report-card"><img class="report-thumb" src="${r.photo}" alt="Foto kerusakan"><div><h3>${escapeHTML(r.name)} <span class="status ${statusClass(r.status)}">${escapeHTML(r.status)}</span></h3><p>${escapeHTML(r.type)} · ${escapeHTML(r.address)}</p><p>${new Date(r.createdAt).toLocaleString("id-ID")} · ${escapeHTML(r.id)}</p></div><div class="report-actions"><button class="btn btn-outline small-btn" onclick="openReview('${r.id}')">Periksa detail</button></div></article>`).join("");
}
function openReview(id){
  const r=reports.find(x=>x.id===id);if(!r)return;selectedReviewId=id;
  document.getElementById("reviewContent").innerHTML=`<img class="review-photo" src="${r.photo}" alt="Foto kerusakan"><h3>${escapeHTML(r.name)}</h3><p>${escapeHTML(r.description)}</p><div class="review-grid"><div><small>Jenis fasilitas</small><b>${escapeHTML(r.type)}</b></div><div><small>Waktu laporan</small><b>${new Date(r.createdAt).toLocaleString("id-ID")}</b></div><div><small>Alamat / nama jalan</small><b>${escapeHTML(r.address)}</b></div><div><small>Koordinat</small><b>${r.lat}, ${r.lng}</b></div></div><a class="review-map-link" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}">Buka titik lokasi di peta ↗</a>`;
  let actions="";
  const editable=[ST.SENT,ST.ACC,ST.WAIT].includes(r.status);
  if(editable){
    const opts=URGENCY.slice().reverse().map(u=>`<option value="${u.v}"${Number(r.urgency)===u.v?" selected":""}>${u.v} - ${u.label}</option>`).join("");
    actions=`<label>Tingkat urgensi (skala 1-5)<select id="reviewUrgency" onchange="showUrgencyHint()"><option value="">-- Pilih tingkat urgensi --</option>${opts}</select></label><label>Estimasi biaya perbaikan (Rp)<input id="reviewCost" type="number" min="1" placeholder="Contoh: 2500000" value="${r.cost||""}"></label><div class="urgency-hint wide" id="urgencyHint">Pilih tingkat urgensi untuk melihat keterangannya. <b>5 = paling mendesak</b>, 1 = paling tidak mendesak.</div><details class="wide scale-guide"><summary>Lihat panduan skala urgensi</summary>${urgencyGuideTable()}</details><label class="wide">Catatan admin<textarea id="reviewNote" rows="2" placeholder="Catatan pemeriksaan...">${escapeHTML(r.adminNote||"")}</textarea></label><button class="btn btn-primary" onclick="acceptReport()">Terima &amp; simpan kriteria</button><button class="btn btn-outline" onclick="rejectReport()">Tolak laporan</button>`;
  }else actions=`<p class="hint wide">Status saat ini: <b>${escapeHTML(r.status)}</b>${r.urgency?` · Urgensi ${escapeHTML(urgencyText(r.urgency))} · Biaya ${rupiah(r.cost)}`:""}.</p><button class="btn btn-outline" onclick="closeReview()">Tutup</button>`;
  document.getElementById("reviewActions").innerHTML=actions;
  if(editable)showUrgencyHint();
  document.getElementById("reviewModal").hidden=false;
}
function urgencyGuideTable(){
  return `<table class="data-table scale-table"><thead><tr><th>Skala</th><th>Kategori</th><th>Keterangan</th></tr></thead><tbody>${URGENCY.slice().reverse().map(u=>`<tr><td><b>${u.v}</b></td><td>${u.label}</td><td>${u.desc}</td></tr>`).join("")}</tbody></table>`;
}
function showUrgencyHint(){
  const v=Number(document.getElementById("reviewUrgency").value),box=document.getElementById("urgencyHint"),u=URGENCY.find(x=>x.v===v);
  box.innerHTML=u?`<b>${u.v} - ${u.label}:</b> ${u.desc}`:'Pilih tingkat urgensi untuk melihat keterangannya. <b>5 = paling mendesak</b>, 1 = paling tidak mendesak.';
}
function closeReview(){document.getElementById("reviewModal").hidden=true;selectedReviewId=null}
document.getElementById("closeReview").addEventListener("click",closeReview);
document.getElementById("reviewModal").addEventListener("click",e=>{if(e.target.id==="reviewModal")closeReview()});
function acceptReport(){
  const r=reports.find(x=>x.id===selectedReviewId),urgency=Number(document.getElementById("reviewUrgency").value),cost=Number(document.getElementById("reviewCost").value);
  if(!urgency||urgency<1||urgency>5){alert("Pilih tingkat urgensi pada skala 1-5.");return}
  if(!(cost>0)){alert("Isi estimasi biaya perbaikan yang valid (lebih dari 0).");return}
  r.status=ST.ACC;r.urgency=urgency;r.cost=cost;r.adminNote=document.getElementById("reviewNote").value.trim();r.score=null;r.rank=null;r.decision=null;saveReports();closeReview();refreshAdmin();
}
function rejectReport(){
  const r=reports.find(x=>x.id===selectedReviewId);if(!r)return;
  const note=prompt("Masukkan alasan penolakan laporan:");if(note===null)return;
  r.status=ST.REJ;r.adminNote=note;r.score=null;r.rank=null;r.decision=null;saveReports();closeReview();refreshAdmin();
}
function renderAdminMap(){
  if(!window.L)return;
  if(!adminMap){adminMap=L.map("adminMap").setView([-3.5952,98.6722],12);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; OpenStreetMap'}).addTo(adminMap)}
  adminMarkers.forEach(m=>adminMap.removeLayer(m));adminMarkers=[];
  reports.filter(r=>r.lat&&r.lng).forEach(r=>{const marker=L.marker([r.lat,r.lng]).addTo(adminMap).bindPopup(`<b>${escapeHTML(r.name)}</b><br>${escapeHTML(r.address)}<br>Status: ${escapeHTML(r.status)}`);adminMarkers.push(marker)});
  setTimeout(()=>adminMap.invalidateSize(),100);
}
const W_URGENCY=0.6, W_COST=0.4;
function runSaw(){
  const budget=Number(document.getElementById("budgetInput").value);
  if(!Number.isFinite(budget)||budget<0){alert("Masukkan anggaran yang valid.");return false}
  const eligible=reports.filter(r=>[ST.ACC,ST.WAIT,ST.FIX].includes(r.status)&&r.urgency>0&&r.cost>0);
  if(!eligible.length){alert("Belum ada laporan berstatus Diterima yang memiliki urgensi dan biaya.");return false}
  eligible.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  eligible.forEach((r,i)=>{r.alt="A"+(i+1)});
  const maxUrgency=Math.max(...eligible.map(r=>r.urgency)),minCost=Math.min(...eligible.map(r=>r.cost));
  eligible.forEach(r=>{r.normUrgency=r.urgency/maxUrgency;r.normCost=minCost/r.cost;r.score=W_URGENCY*r.normUrgency+W_COST*r.normCost});
  const ranked=eligible.slice().sort((a,b)=>b.score-a.score);
  let used=0,blocked=false;
  ranked.forEach((r,i)=>{
    r.rank=i+1;
    if(!blocked&&used+r.cost<=budget){r.decision=ST.FIX;r.status=ST.FIX;used+=r.cost}
    else{blocked=true;r.decision=ST.WAIT;r.status=ST.WAIT}
  });
  saveReports();renderSaw();refreshAdminStatsOnly();
  return true;
}
document.getElementById("calculateBtn").addEventListener("click",runSaw);
function renderAdminStats(){
  const c=s=>reports.filter(r=>r.status===s).length;
  document.getElementById("statTotal").textContent=reports.length;
  document.getElementById("statSent").textContent=c(ST.SENT);
  document.getElementById("statAccepted").textContent=c(ST.ACC);
  document.getElementById("statWait").textContent=c(ST.WAIT);
  document.getElementById("statFixed").textContent=c(ST.FIX);
  document.getElementById("statRejected").textContent=c(ST.REJ);
}
function refreshAdminStatsOnly(){renderAdminStats();renderAdminReports();renderAdminMap()}
function fmt4(n){return Number(n).toFixed(4).replace(".",",")}
function renderSaw(){
  const box=document.getElementById("sawResults");
  const calc=reports.filter(r=>r.rank&&r.alt);
  if(!calc.length){box.innerHTML='<p class="empty-state">Belum ada hasil perhitungan. Terima laporan, isi urgensi serta biaya, lalu klik "Hitung Prioritas SAW".</p>';return}
  const byAlt=calc.slice().sort((a,b)=>Number(a.alt.slice(1))-Number(b.alt.slice(1)));
  const byRank=calc.slice().sort((a,b)=>a.rank-b.rank);
  const maxU=Math.max(...byAlt.map(r=>r.urgency)),minC=Math.min(...byAlt.map(r=>r.cost));
  const budget=Number(document.getElementById("budgetInput").value);
  const total=byRank.filter(r=>r.decision===ST.FIX).reduce((s,r)=>s+r.cost,0);
  const tableX=`<h3 class="saw-title">1. Matriks Keputusan Awal (X)</h3><p class="hint">Nilai asli tiap alternatif. C1 = Urgensi (benefit, bobot ${W_URGENCY.toString().replace(".",",")}); C2 = Estimasi biaya (cost, bobot ${W_COST.toString().replace(".",",")}).</p><div class="table-wrap"><table class="data-table saw-table"><thead><tr><th>Alt.</th><th>Fasilitas</th><th>C1 Urgensi (1-5)</th><th>C2 Biaya (Rp)</th></tr></thead><tbody>${byAlt.map(r=>`<tr><td><b>${r.alt}</b></td><td>${escapeHTML(r.name)}</td><td>${r.urgency}</td><td>${rupiah(r.cost)}</td></tr>`).join("")}<tr class="saw-ref"><td colspan="2">Nilai acuan</td><td>max C1 = ${maxU}</td><td>min C2 = ${rupiah(minC)}</td></tr></tbody></table></div>`;
  const tableR=`<h3 class="saw-title">2. Matriks Ternormalisasi (R)</h3><p class="hint">Benefit: r = x / max(x). Cost: r = min(x) / x.</p><div class="table-wrap"><table class="data-table saw-table"><thead><tr><th>Alt.</th><th>Fasilitas</th><th>r1 = C1 / ${maxU}</th><th>r2 = ${rupiah(minC)} / C2</th></tr></thead><tbody>${byAlt.map(r=>`<tr><td><b>${r.alt}</b></td><td>${escapeHTML(r.name)}</td><td>${fmt4(r.normUrgency)}</td><td>${fmt4(r.normCost)}</td></tr>`).join("")}</tbody></table></div>`;
  const tableV=`<h3 class="saw-title">3. Hasil Peringkat Akhir (V<sub>i</sub>)</h3><p class="hint">V<sub>i</sub> = (${W_URGENCY.toString().replace(".",",")} x r1) + (${W_COST.toString().replace(".",",")} x r2). Total anggaran terpakai: <b>${rupiah(total)}</b> dari ${rupiah(budget)}.</p><div class="table-wrap"><table class="data-table saw-table"><thead><tr><th>Rank</th><th>Alt.</th><th>Fasilitas</th><th>Urgensi</th><th>Biaya</th><th>Perhitungan V<sub>i</sub></th><th>Nilai V<sub>i</sub></th><th>Status</th></tr></thead><tbody>${byRank.map(r=>`<tr><td><b>${r.rank}</b></td><td>${r.alt}</td><td><b>${escapeHTML(r.name)}</b><br><span class="hint">${escapeHTML(r.address)}</span></td><td>${r.urgency}</td><td>${rupiah(r.cost)}</td><td class="calc-cell">${W_URGENCY.toString().replace(".",",")}x${fmt4(r.normUrgency)} + ${W_COST.toString().replace(".",",")}x${fmt4(r.normCost)}</td><td><b>${fmt4(r.score)}</b></td><td><span class="status ${statusClass(r.decision)}">${escapeHTML(r.decision)}</span></td></tr>`).join("")}</tbody></table></div>`;
  box.innerHTML=tableX+tableR+tableV;
}

// ===== Data simulasi (koordinat nyata di Kota Medan) =====
function sampleSvg(label,c1,c2,icon){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><rect y="300" width="640" height="120" fill="#2b2f2e"/><path d="M0 360h640" stroke="#ffc933" stroke-width="6" stroke-dasharray="40 30"/><text x="320" y="190" font-size="110" text-anchor="middle">${icon}</text><text x="320" y="262" font-size="30" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#ffffff">${label}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
}
const SIM_DATA=[
  // Data ilustrasi ini SAMA dengan Tabel 3 jurnal (A1-A5). Urutan daysAgo menentukan kode alternatif (A1 = laporan paling lama).
  {id:"RF-SIM-001",name:"Lubang di jalan utama",type:"Jalan",description:"Lubang berdiameter sekitar 1 meter di badan jalan utama, berbahaya bagi pengendara sepeda motor terutama pada malam hari.",address:"Jl. Sisingamangaraja, dekat Simpang Limun, Medan",lat:3.570650,lng:98.680700,icon:"🕳️",c:["#9db4c0","#5d7a8a"],daysAgo:9,status:ST.ACC,urgency:5,cost:15000000,note:"Lokasi padat kendaraan, lubang membahayakan pengendara."},
  {id:"RF-SIM-002",name:"Lampu jalan mati",type:"Lampu jalan",description:"Satu tiang lampu penerangan jalan mati sehingga ruas jalan menjadi gelap pada malam hari.",address:"Jl. Gatot Subroto, Medan Petisah",lat:3.591700,lng:98.656000,icon:"💡",c:["#1c2b4a","#3b4f7d"],daysAgo:8,status:ST.ACC,urgency:3,cost:4000000,note:"Perlu penggantian lampu dan kabel."},
  {id:"RF-SIM-003",name:"Saluran drainase tersumbat",type:"Drainase",description:"Parit tertutup sampah dan sedimen, air meluap ke badan jalan saat hujan deras.",address:"Jl. Setia Budi, Tanjung Sari, Medan Selayang",lat:3.549600,lng:98.646900,icon:"🌧️",c:["#a8c3a0","#5f8a63"],daysAgo:7,status:ST.ACC,urgency:4,cost:12000000,note:"Genangan sering terjadi saat hujan."},
  {id:"RF-SIM-004",name:"Permukaan jalan retak",type:"Jalan",description:"Permukaan aspal retak memanjang dan mulai mengelupas; belum membahayakan tetapi mengurangi kenyamanan berkendara.",address:"Jl. Putri Hijau, Medan Barat",lat:3.587100,lng:98.679200,icon:"🛣️",c:["#c9b79c","#8c7355"],daysAgo:6,status:ST.ACC,urgency:2,cost:20000000,note:"Kerusakan masih ringan; dapat dijadwalkan setelah perbaikan yang lebih mendesak."},
  {id:"RF-SIM-005",name:"Beberapa lampu jalan padam",type:"Lampu jalan",description:"Beberapa tiang lampu berturut-turut padam sehingga ruas jalan gelap dan rawan kecelakaan.",address:"Jl. S. Parman, Medan Petisah",lat:3.585500,lng:98.657900,icon:"🔦",c:["#1f3a3d","#3f6f73"],daysAgo:5,status:ST.ACC,urgency:4,cost:6000000,note:"Perlu penggantian beberapa lampu dan kabel."}
];
function loadSimulation(){
  const existing=reports.filter(r=>String(r.id).startsWith("RF-SIM-")).length;
  if(existing&&!confirm("Data simulasi sudah ada. Muat ulang (data simulasi lama diganti)?"))return;
  reports=reports.filter(r=>!String(r.id).startsWith("RF-SIM-"));
  const now=Date.now();
  const sim=SIM_DATA.map(d=>({id:d.id,name:d.name,type:d.type,description:d.description,photo:sampleSvg(d.name,d.c[0],d.c[1],d.icon),address:d.address,lat:d.lat,lng:d.lng,createdAt:new Date(now-d.daysAgo*86400000).toISOString(),ownerId:"USEED",ownerName:"Warga Simulasi",status:d.status===ST.REJ?ST.REJ:d.status,urgency:d.urgency||null,cost:d.cost||null,adminNote:d.note||"",score:null,rank:null,decision:null}));
  reports=sim.concat(reports);
  saveReports();
  document.getElementById("budgetInput").value=50000000;
  runSaw();
  refreshAdmin();
}
function clearSimulation(){
  if(!confirm("Hapus semua data simulasi (RF-SIM-...)? Laporan asli tidak ikut terhapus."))return;
  reports=reports.filter(r=>!String(r.id).startsWith("RF-SIM-"));
  saveReports();refreshAdmin();
}
document.getElementById("seedBtn").addEventListener("click",loadSimulation);
document.getElementById("unseedBtn").addEventListener("click",clearSimulation);
// Pintu masuk pengelola tidak ada di menu: lewat alamat #petugas, atau klik simbol © di footer 3x.
let copyClicks=0,copyTimer;
document.getElementById("copyMark").addEventListener("click",()=>{
  copyClicks++;clearTimeout(copyTimer);copyTimer=setTimeout(()=>copyClicks=0,1500);
  if(copyClicks>=3){copyClicks=0;location.hash="petugas"}
});
window.addEventListener("hashchange",()=>{if(location.hash==="#petugas")showPage("admin")});
document.addEventListener("DOMContentLoaded",()=>{
  renderAuthArea();updatePublicStats();
  if(location.hash==="#petugas")showPage("admin");else showPage("report");
});
