// ===== REPAIRFLOW - FULL + FIREBASE + PETA SUDAH DI index.html =====
const STORAGE_KEY = "repairflow_public_reports_v1";
const USERS_KEY = "repairflow_users_v2";
const SESSION_KEY = "repairflow_session_v2";
const STAFF_SALT = "repairflow-medan::v2";
const STAFF_ITER = 150000;
const STAFF_HASH = "ea0e0ef38d4a6fb6ed452c2ae476b6fe95f2ce8dd514c59c0c77cce70231f67e";
const ST = {SENT:"Dikirim", ACC:"Diterima", WAIT:"Menunggu Prioritas", FIX:"Diperbaiki", REJ:"Ditolak"};
const ST_ALL = [ST.SENT, ST.ACC, ST.WAIT, ST.FIX, ST.REJ];
const SIM_DATA = [
  {code:"A1", facilityName:"Jalan Berlubang", facilityType:"Jalan", description:"Jalan berlubang", streetAddress:"Jl. Sei Deli No.12, Medan", lat:3.5952, lng:98.6722, status:"Dikirim", createdAt:"2026-01-10", urgency:4, cost:5000000, photo:""},
  {code:"A2", facilityName:"Lampu Jalan Mati", facilityType:"Lampu jalan", description:"Lampu padam", streetAddress:"Jl. Setia Budi No.45, Medan", lat:3.6001, lng:98.6788, status:"Diterima", createdAt:"2026-01-11", urgency:3, cost:2000000, photo:""},
  {code:"A3", facilityName:"Drainase Tersumbat", facilityType:"Drainase", description:"Drainase mampet", streetAddress:"Jl. Gatot Subroto No.88, Medan", lat:3.58, lng:98.66, status:"Menunggu Prioritas", createdAt:"2026-01-12", urgency:5, cost:8000000, photo:""},
  {code:"A4", facilityName:"Jalan Berlubang", facilityType:"Jalan", description:"Lubang besar", streetAddress:"Jl. Sisingamangaraja No.5, Medan", lat:3.57, lng:98.68, status:"Diperbaiki", createdAt:"2026-01-13", urgency:4, cost:6000000, photo:""},
  {code:"A5", facilityName:"Trotoar Rusak", facilityType:"Jalan", description:"Trotoar pecah", streetAddress:"Jl. Brigjen Katamso No.20, Medan", lat:3.59, lng:98.69, status:"Ditolak", createdAt:"2026-01-14", urgency:2, cost:3000000, photo:""},
];
function loadReports(){ try{ const r=localStorage.getItem(STORAGE_KEY); if(r){ const p=JSON.parse(r); if(Array.isArray(p)&&p.length) return p; } }catch(e){} return [...SIM_DATA]; }
function saveReports(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(reports)); }catch(e){} }
let reports = loadReports();
let currentUser=null; try{ currentUser=JSON.parse(localStorage.getItem(SESSION_KEY)||"null"); }catch(e){}
function showPage(name, sub){
  document.querySelectorAll(".page").forEach(p=>p.hidden=true);
  const m={report:"page-report",auth:"page-auth",track:"page-track",admin:"page-admin"};
  const el=document.getElementById(m[name]||"page-report"); if(el) el.hidden=false;
  document.querySelectorAll(".nav-link").forEach(b=>b.classList.remove("active"));
  if(name==="report") document.getElementById("navReport")?.classList.add("active");
  if(name==="track") document.getElementById("navTrack")?.classList.add("active");
  if(name==="auth"){ const isLogin=sub!=="register"; document.getElementById("tabLogin")?.classList.toggle("active",isLogin); document.getElementById("tabRegister")?.classList.toggle("active",!isLogin); if(document.getElementById("userLoginForm")) document.getElementById("userLoginForm").hidden=!isLogin; if(document.getElementById("userRegisterForm")) document.getElementById("userRegisterForm").hidden=isLogin; }
  updateGate(); renderAll(); window.scrollTo(0,0);
}
function goToForm(){ showPage("report"); setTimeout(()=>document.getElementById("formBand")?.scrollIntoView({behavior:"smooth"}),100); }
function scrollToSec(id){ document.getElementById(id)?.scrollIntoView({behavior:"smooth"}); }
function urgencyGuideTable(){ return `<table><tr><th>Skala</th><th>Arti</th></tr><tr><td>1</td><td>Tidak mendesak</td></tr><tr><td>2</td><td>Kurang mendesak</td></tr><tr><td>3</td><td>Cukup mendesak</td></tr><tr><td>4</td><td>Mendesak</td></tr><tr><td>5</td><td>Sangat mendesak</td></tr></table>`; }

// ===== INI YANG NGIRIM KE FIREBASE - JANGAN DIHAPUS =====
async function kirimKeFirebase(laporan){
  console.log("Mencoba kirim ke Firebase...", laporan.code);
  for(let i=0;i<30;i++){ if(window.db && window.fb) break; await new Promise(r=>setTimeout(r,200)); }
  if(!window.db || !window.fb){ console.log("GAGAL: window.db belum ada!"); alert("Firebase belum siap, coba refresh!"); return; }
  try{
    const docRef = await window.fb.addDoc(window.fb.collection(window.db, "orders"), {
      code: laporan.code, facilityName: laporan.facilityName, facilityType: laporan.facilityType,
      description: laporan.description, streetAddress: laporan.streetAddress,
      lat: laporan.lat, lng: laporan.lng, status: laporan.status,
      urgency: laporan.urgency||3, cost: laporan.cost||0,
      createdAt: laporan.createdAt, userEmail: currentUser?.email||"anonim"
    });
    console.log("BERHASIL MASUK FIREBASE! ID:", docRef.id);
    alert("Masuk Firebase! ID: "+docRef.id);
  }catch(e){ console.log("GAGAL FIREBASE:", e); alert("Gagal Firebase: "+e.message+" - Cek Rules kamu!"); }
}
async function ambilDariFirebase(){
  if(!window.db || !window.fb) return;
  try{
    const snap = await window.fb.getDocs(window.fb.collection(window.db, "orders"));
    snap.forEach(doc=>{ const d=doc.data(); if(!reports.some(r=>r.code===d.code)) reports.unshift({...d,_fbId:doc.id}); });
    saveReports(); renderAll();
  }catch(e){ console.log("Gagal ambil:", e); }
}
function updateGate(){
  const gate=document.getElementById("reportGate"), form=document.getElementById("reportForm"); if(!gate||!form) return;
  if(currentUser){ gate.hidden=true; form.hidden=false; } else { gate.hidden=false; form.hidden=true; }
  const wb=document.getElementById("welcomeBar"); if(wb&&currentUser) wb.textContent="Halo, "+currentUser.name;
  const authArea=document.getElementById("authArea"); if(authArea) authArea.innerHTML=currentUser?`<span>${currentUser.name}</span> <button class="btn btn-outline small-btn" onclick="logoutUser()">Keluar</button>`:`<button class="btn btn-outline small-btn" onclick="showPage('auth','login')">Masuk</button>`;
  const myBox=document.getElementById("myReportsBox"); if(myBox) myBox.hidden=!currentUser;
}
function renderAll(){
  const total=reports.length; const c={}; ST_ALL.forEach(s=>c[s]=reports.filter(r=>r.status===s).length);
  document.querySelectorAll("#pubStats [data-k]").forEach(el=>{ const k=el.dataset.k; if(k==="total") el.textContent=total; if(k==="sent") el.textContent=c[ST.SENT]||0; if(k==="acc") el.textContent=c[ST.ACC]||0; if(k==="wait") el.textContent=c[ST.WAIT]||0; if(k==="done") el.textContent=c[ST.FIX]||0; if(k==="rej") el.textContent=c[ST.REJ]||0; });
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
  set("statTotal",total); set("statSent",c[ST.SENT]||0); set("statAccepted",c[ST.ACC]||0); set("statWait",c[ST.WAIT]||0); set("statFixed",c[ST.FIX]||0); set("statRejected",c[ST.REJ]||0);
  const adminBox=document.getElementById("adminReports");
  if(adminBox){ const f=document.getElementById("reportFilter")?.value||"all"; const list=f==="all"?reports:reports.filter(r=>r.status===f); adminBox.innerHTML=list.length?list.map(r=>`<div class="report-item"><b>${r.code} - ${r.facilityName}</b><br><small>${r.streetAddress} | ${r.status}</small><br><p>${r.description}</p><button class="btn btn-outline small-btn" onclick="openReview('${r.code}')">Periksa</button></div>`).join(""):`<p class="empty-state">Belum ada laporan.</p>`; }
  const myBox=document.getElementById("myReports"); if(myBox&&currentUser){ const mine=reports.filter(r=>r.userEmail===currentUser.email); myBox.innerHTML=mine.length?mine.map(r=>`<div><b>${r.code}</b> - ${r.facilityName} (${r.status})</div>`).join(""):`<p>Belum ada laporan.</p>`; }
}
function openReview(code){ const r=reports.find(x=>x.code===code); if(!r) return; const m=document.getElementById("reviewModal"); if(m) m.hidden=false; const cont=document.getElementById("reviewContent"); if(cont) cont.innerHTML=`<b>${r.facilityName}</b><p>${r.description}</p><p>${r.streetAddress}</p><p>Status: ${r.status}</p><p>Urgensi: <input id="revUrgency" type="number" min="1" max="5" value="${r.urgency||3}"> Biaya: <input id="revCost" type="number" value="${r.cost||0}"></p>`; const act=document.getElementById("reviewActions"); if(act) act.innerHTML=`<button class="btn btn-primary" onclick="ubahStatus('${r.code}','Diterima')">Terima</button><button class="btn btn-outline" onclick="ubahStatus('${r.code}','Ditolak')">Tolak</button><button class="btn btn-outline" onclick="simpanReview('${r.code}')">Simpan</button>`; }
function simpanReview(code){ const r=reports.find(x=>x.code===code); if(!r) return; r.urgency=parseInt(document.getElementById("revUrgency")?.value||3); r.cost=parseInt(document.getElementById("revCost")?.value||0); saveReports(); renderAll(); alert("Tersimpan!"); }
function ubahStatus(code,status){ const r=reports.find(x=>x.code===code); if(!r) return; r.status=status; saveReports(); renderAll(); document.getElementById("reviewModal").hidden=true; }
function logoutUser(){ localStorage.removeItem(SESSION_KEY); currentUser=null; updateGate(); showPage("report"); }
async function pbkdf2(str,salt,iter){ const enc=new TextEncoder(); const key=await crypto.subtle.importKey("raw",enc.encode(str),"PBKDF2",false,["deriveBits"]); const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:iter,hash:"SHA-256"},key,256); return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
document.addEventListener("DOMContentLoaded", ()=>{
  updateGate(); renderAll(); setTimeout(ambilDariFirebase,1500);
  document.getElementById("closeReview")?.addEventListener("click",()=>document.getElementById("reviewModal").hidden=true);
  document.getElementById("tabLogin")?.addEventListener("click",()=>showPage("auth","login"));
  document.getElementById("tabRegister")?.addEventListener("click",()=>showPage("auth","register"));
  document.getElementById("reportFilter")?.addEventListener("change",renderAll);
  document.getElementById("seedBtn")?.addEventListener("click",()=>{ reports=[...SIM_DATA]; saveReports(); renderAll(); });
  document.getElementById("unseedBtn")?.addEventListener("click",()=>{ reports=reports.filter(r=>!SIM_DATA.some(s=>s.code===r.code)); saveReports(); renderAll(); });
  document.getElementById("trackBtn")?.addEventListener("click",()=>{ const code=document.getElementById("trackingCode")?.value.trim(); const r=reports.find(x=>x.code===code); document.getElementById("trackingResult").innerHTML=r?`<div class="panel"><b>${r.code}</b> - ${r.facilityName}<br>Status: ${r.status}<br>${r.streetAddress}</div>`:`<p>Tidak ditemukan.</p>`; });
  document.getElementById("logoutBtn")?.addEventListener("click",()=>{ document.getElementById("adminDashboard").hidden=true; document.getElementById("adminLogin").hidden=false; showPage("report"); });
  document.getElementById("photo")?.addEventListener("change",(e)=>{ const f=e.target.files[0]; if(!f) return; const url=URL.createObjectURL(f); const w=document.getElementById("photoPreviewWrap"); const img=document.getElementById("photoPreview"); if(w) w.hidden=false; if(img) img.src=url; });
  document.getElementById("userRegisterForm")?.addEventListener("submit",(e)=>{ e.preventDefault(); const name=document.getElementById("regName").value, email=document.getElementById("regEmail").value, pass=document.getElementById("regPass").value; let users=[]; try{ users=JSON.parse(localStorage.getItem(USERS_KEY)||"[]"); }catch(err){} users.push({name,email,pass}); localStorage.setItem(USERS_KEY,JSON.stringify(users)); currentUser={name,email}; localStorage.setItem(SESSION_KEY,JSON.stringify(currentUser)); updateGate(); showPage("report"); alert("Akun dibuat!"); });
  document.getElementById("userLoginForm")?.addEventListener("submit",(e)=>{ e.preventDefault(); const email=document.getElementById("loginEmail").value, pass=document.getElementById("loginPass").value; let users=[]; try{ users=JSON.parse(localStorage.getItem(USERS_KEY)||"[]"); }catch(err){} const u=users.find(x=>x.email===email&&x.pass===pass); if(!u){ document.getElementById("userLoginMsg").textContent="Email / kata sandi salah"; return; } currentUser={name:u.name,email:u.email}; localStorage.setItem(SESSION_KEY,JSON.stringify(currentUser)); updateGate(); showPage("report"); });
  document.getElementById("loginForm")?.addEventListener("submit",async(e)=>{ e.preventDefault(); const user=document.getElementById("adminUser").value, pass=document.getElementById("adminPass").value; const h=await pbkdf2(user+"\0"+pass,STAFF_SALT,STAFF_ITER); if(h===STAFF_HASH){ document.getElementById("adminLogin").hidden=true; document.getElementById("adminDashboard").hidden=false; renderAll(); } else document.getElementById("loginMessage").textContent="Pengenal / kata sandi salah"; });
  document.getElementById("calculateBtn")?.addEventListener("click",()=>{ const budget=parseInt(document.getElementById("budgetInput")?.value||0); const list=reports.filter(r=>r.status===ST.ACC).map(r=>{ const u=r.urgency||3,c=r.cost||1; return {...r,saw:(0.6*(u/5)+0.4*Math.max(0,1-(c/10000000)))}; }).sort((a,b)=>b.saw-a.saw); let sisa=budget,html=""; list.forEach(r=>{ const ambil=r.cost<=sisa; if(ambil) sisa-=r.cost; html+=`<div>${r.code} - ${r.facilityName} | SAW: ${r.saw.toFixed(3)} | Rp ${r.cost} | ${ambil?"DIPILIH":"TIDAK MUAT"}</div>`; }); document.getElementById("sawResults").innerHTML=html||"<p>Belum ada laporan Diterima.</p>"; });
  const form=document.getElementById("reportForm");
  if(form){ form.addEventListener("submit", async(e)=>{ e.preventDefault(); const code="RF-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+Math.floor(100000+Math.random()*900000); const baru={ code, facilityName:document.getElementById("facilityName").value, facilityType:document.getElementById("facilityType").value, description:document.getElementById("description").value, streetAddress:document.getElementById("streetAddress").value||"Medan", lat:parseFloat(document.getElementById("latitude").value)||3.5952, lng:parseFloat(document.getElementById("longitude").value)||98.6722, status:ST.SENT, urgency:3, cost:0, photo:"", createdAt:new Date().toISOString(), userEmail:currentUser?.email||"anonim" }; reports.unshift(baru); saveReports(); renderAll(); await kirimKeFirebase(baru); document.getElementById("submitMessage").textContent="Berhasil! Nomor: "+code; form.reset(); alert("Berhasil! Nomor: "+code); }); }
  document.querySelector(".footer-staff a")?.addEventListener("click",(e)=>{ e.preventDefault(); showPage("admin"); });
});
