/* CSC Bal Vidyalaya - Staff Attendance (Firebase + GitHub Pages) */
(function(){
'use strict';
var CFG=window.CSC_CONFIG||{};
var STAFF_DOMAIN=CFG.staffDomain||'staff.cscbalvidyalaya.app';
var ADMIN_DOMAIN=CFG.adminDomain||'cscbalvidyalaya.app';
function $(s,e){return (e||document).querySelector(s)}
function $$(s,e){return Array.prototype.slice.call((e||document).querySelectorAll(s))}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pad(n){return String(n).padStart(2,'0')}
function dstr(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function pdate(s){var p=String(s||'').split('-').map(Number);return new Date(p[0],(p[1]||1)-1,p[2]||1)}
function mstr(d){return dstr(d).slice(0,7)}
function hm(iso){return iso?new Date(iso).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true}):'—'}
function fdate(s,o){return s?pdate(s).toLocaleDateString('en-IN',o||{day:'numeric',month:'short',year:'numeric'}):'—'}
function tmins(t){var p=String(t||'0:0').split(':').map(Number);return (p[0]||0)*60+(p[1]||0)}
function rndStr(n,alpha){var a=new Uint32Array(n);crypto.getRandomValues(a);var s='';for(var i=0;i<n;i++)s+=alpha[a[i]%alpha.length];return s}
var ALPHA='abcdefghjkmnpqrstuvwxyz23456789';
function rndPin(){return rndStr(6,'0123456789')}
var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var LEAVE_TYPES=['Casual leave','Sick leave','Earned leave','Maternity / paternity leave','Duty leave','Other'];
var DEF={startTime:'08:00',endTime:'14:00',graceMins:10,offDays:[0],hasQr:false};

var toastT=0;
function toast(msg,kind){var t=$('#toast');if(!t)return;t.textContent=msg;t.className='toast show '+(kind||'');clearTimeout(toastT);toastT=setTimeout(function(){t.className='toast'},3600)}
function block(title,text){if($('#loading'))$('#loading').hidden=true;if($('#login'))$('#login').hidden=true;if($('#blockTitle'))$('#blockTitle').textContent=title;if($('#blockText'))$('#blockText').textContent=text;if($('#block'))$('#block').hidden=false}

/* ---------- start-up checks ---------- */
if(typeof firebase==='undefined'){block('Could not load','The app could not load Firebase. Check the internet connection and reload this page.');return}
if(!CFG.firebase||!CFG.firebase.apiKey||/PASTE/.test(CFG.firebase.apiKey)){block('Setup is not finished','The Firebase details are missing in config.js. Follow the setup guide, then upload the files again.');return}
var app=firebase.apps.length?firebase.app():firebase.initializeApp(CFG.firebase);
var auth=app.auth(),fs=app.firestore();
var TS=firebase.firestore.FieldValue.serverTimestamp;
var secApp=null;
function secAuth(){
  if(!secApp){
    var existing=firebase.apps.find(function(x){return x.name==='secondary'});
    secApp=existing||firebase.initializeApp(CFG.firebase,'secondary');
  }
  return secApp.auth();
}

/* ---------- state ---------- */
var S={role:null,me:null,staff:null,settings:null,settingsLoaded:false,qrValue:null,qrLoaded:false,
  today:dstr(new Date()),attToday:[],attMine:[],attMonth:[],attMonthFor:'',leaves:[],
  tab:null,view:null,repMonth:mstr(new Date()),mMonth:mstr(new Date()),scan:null,busy:false,
  notes:{},lvFilter:'pending',expanded:{},confirmDel:null,fails:0,lockUntil:0,lmode:'staff',resolvedUid:null,keepMsg:null,seeding:false};

/* ---------- subscriptions ---------- */
var subs={};
function sub(key,q,fn){
  if(subs[key]){subs[key]();delete subs[key]}
  subs[key]=q.onSnapshot(fn,function(e){console.warn('firestore',key,e);toast('Could not load '+key+' data ('+((e&&e.code)||'error')+').','bad')});
}
function unsubAll(){Object.keys(subs).forEach(function(k){subs[k]();delete subs[k]})}
function iso(x){return x&&typeof x.toDate==='function'?x.toDate().toISOString():(x||null)}
function docs(snap){
  return snap.docs.map(function(d){
    var o=d.data({serverTimestamps:'estimate'});o.id=d.id;
    ['inAt','outAt'].forEach(function(k){if(k in o)o[k]=iso(o[k])});
    return o;
  });
}
var rq=0;
function refresh(){if(rq)return;rq=requestAnimationFrame(function(){rq=0;renderChrome();if(S.view&&S.view.update)S.view.update()})}

/* ---------- domain helpers ---------- */
function cfg(){
  var base=Object.assign({},DEF,S.settings||{});
  base.offDays=Array.isArray(base.offDays)?base.offDays.map(Number):DEF.offDays.slice();
  return base;
}
function isOff(date){return cfg().offDays.indexOf(pdate(date).getDay())>=0}
function activeStaff(){return (S.staff||[]).filter(function(s){return s.active!==false})}
function meRec(){return S.me}
function attMap(arr){var m=new Map();arr.forEach(function(a){m.set(a.staffId+'|'+a.date,a)});return m}
function leaveCovers(id,date){return S.leaves.find(function(l){return l.staffId===id&&l.status==='approved'&&l.from<=date&&date<=l.to})}
function dayStatus(id,date,map){
  var a=map.get(id+'|'+date);
  if(a&&a.inAt) return {k:a.late?'late':'present',a:a};
  if(leaveCovers(id,date)) return {k:'leave'};
  if(isOff(date)) return {k:'off'};
  if(date>S.today) return {k:'future'};
  if(date===S.today) return {k:'notin'};
  return {k:'absent'};
}
var CH={present:['good','Present'],late:['warn','Late'],leave:['info','On leave'],absent:['bad','Absent'],notin:['muted','Not in yet'],off:['muted','Weekly off'],future:['muted','—']};
function chip(k){var c=CH[k]||CH.future;return '<span class="chip '+c[0]+'">'+c[1]+'</span>'}
var LCH={pending:['warn','Pending'],approved:['good','Approved'],rejected:['bad','Rejected'],cancelled:['muted','Cancelled']};
function lchip(s){var c=LCH[s]||LCH.pending;return '<span class="chip '+c[0]+'">'+c[1]+'</span>'}
function countLeaveDays(from,to,half){
  if(!from||!to||to<from) return 0;
  if(half&&from===to) return 0.5;
  var n=0,d=pdate(from),end=pdate(to),off=cfg().offDays;
  while(d<=end){if(off.indexOf(d.getDay())<0)n++;d.setDate(d.getDate()+1)}
  return n;
}
function monthDays(ym){var p=ym.split('-').map(Number);var n=new Date(p[0],p[1],0).getDate();var a=[];for(var d=1;d<=n;d++)a.push(ym+'-'+pad(d));return a}
function monthLabel(ym){var p=ym.split('-').map(Number);return new Date(p[0],p[1]-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'})}
function shiftMonth(ym,k){var p=ym.split('-').map(Number);return mstr(new Date(p[0],p[1]-1+k,1))}
function greet(){var h=new Date().getHours();return h<12?'Good morning':h<17?'Good afternoon':'Good evening'}
function csvCell(v){v=String(v==null?'':v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function download(name,data,type){
  if(!data)return;
  var blob=data instanceof Blob?data:new Blob([data],{type:type||'text/plain'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);a.remove()},1500);
}

/* ---------- script loader (QR reading library) ---------- */
var libs={};
function loadScript(key,test,urls){
  if(libs[key]) return libs[key];
  libs[key]=new Promise(function(res){
    var i=0;
    function next(){
      if(test()) return res(true);
      if(i>=urls.length) return res(false);
      var s=document.createElement('script');s.src=urls[i++];
      s.onload=function(){test()?res(true):next()};s.onerror=next;document.head.appendChild(s);
    }
    next();
  }).then(function(ok){if(!ok)delete libs[key];return ok});
  return libs[key];
}
function loadJsQR(){return loadScript('jsqr',function(){return typeof window.jsQR==='function'},['https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js','https://unpkg.com/jsqr@1.4.0/dist/jsQR.js','https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'])}

/* ---------- reading a QR from a photo ---------- */
function fileToImage(file){
  return new Promise(function(res,rej){
    var fr=new FileReader();
    fr.onload=function(){var im=new Image();im.onload=function(){res(im)};im.onerror=rej;im.src=fr.result};
    fr.onerror=rej;fr.readAsDataURL(file);
  });
}
async function decodeQR(file){
  var src=null;
  try{src=await createImageBitmap(file)}catch(e){try{src=await fileToImage(file)}catch(e2){return null}}
  var w0=src.width||src.naturalWidth,h0=src.height||src.naturalHeight;
  if(!w0||!h0)return null;
  if('BarcodeDetector' in window){
    try{var det=new BarcodeDetector({formats:['qr_code']});var found=await det.detect(src);if(found&&found[0]&&found[0].rawValue)return String(found[0].rawValue)}catch(e){}
  }
  if(!(await loadJsQR()))throw new Error('jsqr-unavailable');
  var sizes=[1400,2000,900,600,1000];
  for(var i=0;i<sizes.length;i++){
    var sc=Math.min(1,sizes[i]/Math.max(w0,h0)),w=Math.max(1,Math.round(w0*sc)),h=Math.max(1,Math.round(h0*sc));
    var cv=document.createElement('canvas');cv.width=w;cv.height=h;
    var cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(src,0,0,w,h);
    var img=cx.getImageData(0,0,w,h),r=window.jsQR(img.data,w,h,{inversionAttempts:'attemptBoth'});
    if(r&&r.data)return r.data;
    var d=img.data,lo=255,hi=0,k,g;
    for(k=0;k<d.length;k+=4){g=(d[k]*299+d[k+1]*587+d[k+2]*114)/1000;if(g<lo)lo=g;if(g>hi)hi=g}
    if(hi-lo>20){
      for(k=0;k<d.length;k+=4){g=(d[k]*299+d[k+1]*587+d[k+2]*114)/1000;g=(g-lo)*255/(hi-lo);g=g<128?0:255;d[k]=d[k+1]=d[k+2]=g}
      r=window.jsQR(d,w,h,{inversionAttempts:'attemptBoth'});if(r&&r.data)return r.data;
    }
  }
  return null;
}

/* ---------- QR drawing ---------- */
function qrMatrix(text){
  var q=window.qrcode(0,'M');q.addData(text);q.make();
  var n=q.getModuleCount(),m=[];
  for(var r=0;r<n;r++){m.push([]);for(var c=0;c<n;c++)m[r].push(q.isDark(r,c))}
  return m;
}
function drawQR(ctx,m,x,y,size){
  var quiet=4,n=m.length,cell=size/(n+2*quiet);
  ctx.fillStyle='#ffffff';ctx.fillRect(x,y,size,size);
  ctx.fillStyle='#1d0c33';
  for(var r=0;r<n;r++)for(var c=0;c<n;c++)if(m[r][c])ctx.fillRect(x+(c+quiet)*cell,y+(r+quiet)*cell,Math.ceil(cell),Math.ceil(cell));
}
function rrect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
async function buildPoster(){
  var val=S.qrValue;if(!val)return null;
  if(typeof window.qrcode!=='function')return {error:'The QR drawing library could not load. Check the internet connection and reload this page.'};
  var m;try{m=qrMatrix(val)}catch(e){return {error:'This QR holds too much data to redraw as a poster. Use Create a new QR instead.'}}
  try{await document.fonts.load('700 64px Poppins');await document.fonts.load('600 38px Inter')}catch(e){}
  var W=1200,H=1750,cv=document.createElement('canvas');cv.width=W;cv.height=H;var c=cv.getContext('2d');
  c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.lineWidth=26;c.strokeStyle='#A223EA';rrect(c,26,26,W-52,H-52,70);c.stroke();
  c.lineWidth=8;c.strokeStyle='#F5A31C';rrect(c,70,70,W-140,H-140,44);c.stroke();
  var img=new Image();img.src='logo.jpg';try{await img.decode()}catch(e){}
  if(img.complete&&img.naturalWidth)c.drawImage(img,(W-330)/2,105,330,330);
  c.textAlign='center';
  c.fillStyle='#A223EA';c.font='700 80px Poppins, Arial, sans-serif';c.fillText('STAFF ATTENDANCE',W/2,545);
  c.fillStyle='#27143D';c.font='600 40px Inter, Arial, sans-serif';c.fillText('Scan this QR in the attendance app',W/2,610);
  var qs=740,qx=(W-qs)/2,qy=655;
  c.lineWidth=10;c.strokeStyle='#F5A31C';rrect(c,qx-22,qy-22,qs+44,qs+44,26);c.stroke();
  drawQR(c,m,qx,qy,qs);
  c.fillStyle='#27143D';c.font='500 36px Inter, Arial, sans-serif';
  c.fillText('Open the app, sign in and tap Scan QR',W/2,1482);
  c.fillText('to check in or check out.',W/2,1530);
  c.fillStyle='#A223EA';c.fillRect(130,1580,W-260,86);
  c.fillStyle='#fff';c.font='600 38px Poppins, Arial, sans-serif';c.fillText('A Journey of Learning and Growth',W/2,1637);
  return {canvas:c.canvas};
}
async function qrOnlyBlob(){
  var val=S.qrValue;if(!val||typeof window.qrcode!=='function')return null;
  var m;try{m=qrMatrix(val)}catch(e){return null}
  var cv=document.createElement('canvas');cv.width=cv.height=1000;
  drawQR(cv.getContext('2d'),m,0,0,1000);
  return new Promise(function(r){cv.toBlob(r,'image/png')});
}

/* ---------- live camera scanner ---------- */
var SC={stream:null,raf:0,det:null,busy:false,last:0,cv:null};
function stopScan(){
  cancelAnimationFrame(SC.raf);SC.raf=0;SC.busy=false;
  if(SC.stream){SC.stream.getTracks().forEach(function(t){t.stop()});SC.stream=null}
  var v=$('#scanVideo');if(v)v.srcObject=null;
  var p=$('#scanPanel');if(p)p.hidden=true;
  var b=$('#scanStart');if(b)b.hidden=false;
}
function camFail(msg){
  stopScan();
  var m=$('#scanMsg');if(m)m.textContent=msg;
  var f=$('#scanFallback');if(f)f.hidden=false;
}
async function scanFrame(v){
  if(SC.det){try{var r=await SC.det.detect(v);if(r&&r[0]&&r[0].rawValue)return String(r[0].rawValue)}catch(e){}}
  if(typeof window.jsQR!=='function')return null;
  if(!v.videoWidth||!v.videoHeight)return null;
  var w=Math.min(720,v.videoWidth),h=Math.max(1,Math.round(v.videoHeight*w/v.videoWidth));
  if(!SC.cv){SC.cv=document.createElement('canvas')}
  SC.cv.width=w;SC.cv.height=h;
  var cx=SC.cv.getContext('2d',{willReadFrequently:true});cx.drawImage(v,0,0,w,h);
  var img=cx.getImageData(0,0,w,h),q=window.jsQR(img.data,w,h,{inversionAttempts:'dontInvert'});
  return q&&q.data?q.data:null;
}
function onScanned(val){
  stopScan();
  S.scan={value:String(val).trim(),at:Date.now()};
  var m=$('#scanMsg');if(m)m.textContent='';
  toast('QR scanned.','good');
  if(S.view&&S.view.update)S.view.update();
}
async function startScan(){
  var msg=$('#scanMsg');if(msg)msg.textContent='';
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){camFail('This browser cannot open the camera. Take a photo of the QR instead.');return}
  loadJsQR();
  try{SC.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})}
  catch(e){camFail(e&&e.name==='NotAllowedError'?'Camera permission was denied. Allow the camera for this site in the browser settings, or take a photo of the QR instead.':'Could not open the camera. Take a photo of the QR instead.');return}
  var v=$('#scanVideo');if(!v)return;
  v.srcObject=SC.stream;
  try{await v.play()}catch(e){}
  var p=$('#scanPanel'),b=$('#scanStart');
  if(p)p.hidden=false;if(b)b.hidden=true;
  if(!SC.det&&'BarcodeDetector' in window){try{SC.det=new BarcodeDetector({formats:['qr_code']})}catch(e){SC.det=null}}
  function loop(ts){
    if(!SC.stream)return;
    SC.raf=requestAnimationFrame(loop);
    if(SC.busy||ts-SC.last<160)return;SC.last=ts;
    var vv=$('#scanVideo');if(!vv||vv.readyState<2||!vv.videoWidth)return;
    SC.busy=true;
    scanFrame(vv).then(function(val){SC.busy=false;if(val&&SC.stream)onScanned(val)},function(){SC.busy=false});
  }
  SC.raf=requestAnimationFrame(loop);
}
async function onPhotoFile(file){
  var msg=$('#scanMsg');if(!file||!msg)return;
  if(file.lastModified&&Date.now()-file.lastModified>3*60000){msg.textContent='That photo is not fresh. Take a new photo of the school QR with the camera.';return}
  msg.textContent='Reading the QR…';
  var v=null;
  try{v=await decodeQR(file)}catch(e){msg.textContent='The QR reader could not load. Check your internet connection and try again.';return}
  if(!v){msg.textContent='No QR code found. Keep the whole QR in the photo, close enough to fill most of the frame, and try again.';return}
  onScanned(v);
}
function scanOk(){return !!(S.scan&&Date.now()-S.scan.at<20*60000)}
function clearScan(){S.scan=null}
document.addEventListener('visibilitychange',function(){if(document.hidden)stopScan()});

/* ---------- attendance actions ---------- */
async function mark(kind){
  var me=meRec();if(!me||S.busy)return;
  if(!S.settings||!S.settings.hasQr){toast('Attendance is not set up yet. Please ask the school office.','bad');return}
  if(!scanOk()){toast('Scan the school QR first.','bad');return}
  S.busy=true;if(S.view&&S.view.update)S.view.update();
  try{
    var s=cfg(),now=new Date(),nm=now.getHours()*60+now.getMinutes(),date=dstr(now);
    var ref=fs.doc('attendance/'+me.id+'_'+date);
    var cur=S.attMine.find(function(a){return a.date===date});
    if(kind==='in'){
      if(cur&&cur.inAt){toast('You are already checked in.')}
      else{
        var late=nm>tmins(s.startTime)+Number(s.graceMins||0);
        await ref.set({staffId:me.id,date:date,month:date.slice(0,7),inAt:TS(),outAt:null,late:late,lateMins:late?Math.max(0,nm-tmins(s.startTime)):0,early:false,qr:S.scan.value});
        toast(late?'Checked in at '+hm(now.toISOString())+' (late).':'Checked in at '+hm(now.toISOString())+'.','good');
      }
    }else{
      if(!cur||!cur.inAt){toast('Check in first, then check out.','bad')}
      else{
        await ref.update({outAt:TS(),early:nm<tmins(s.endTime),qr:S.scan.value});
        toast('Checked out at '+hm(now.toISOString())+'.','good');
      }
    }
    clearScan();
  }catch(e){
    console.warn(e);
    if(e&&e.code==='permission-denied'){clearScan();toast('That QR is not the school attendance QR. Scan the QR at school.','bad')}
    else toast('Could not save attendance. Check the internet and try again.','bad');
  }
  S.busy=false;refresh();
}

/* ================= VIEWS ================= */
var V={};

/* ----- staff: today ----- */
V['staff:today']={
  mount:function(el){
    el.innerHTML='<div class="narrow stack">'+
    '<section class="card hello"><p class="eyebrow" id="sd"></p><h2 id="sn"></h2><p class="clock" id="sc"></p></section>'+
    '<section class="card stack" id="scanCard">'+
      '<div class="banner good" id="scanOk" hidden><b>School QR scanned.</b> You can mark your attendance now.</div>'+
      '<div class="stack" id="scanNeed" hidden>'+
        '<div class="banner info"><b>Scan the school QR first.</b> Tap the button and point the camera at the QR code at school.</div>'+
        '<div id="scanPanel" class="scanbox" hidden><video id="scanVideo" playsinline muted></video><div class="frame"></div><button class="btn small cancel" id="scanCancel" type="button">Cancel</button></div>'+
        '<div class="actions"><button class="btn big" id="scanStart" type="button">Scan QR with camera</button></div>'+
        '<div id="scanFallback" hidden><button class="btn ghost" id="photoBtn" type="button">Take a photo of the QR</button><input type="file" id="scanPhoto" accept="image/*" capture="environment" hidden></div>'+
        '<p class="hint" id="scanMsg" role="status"></p>'+
      '</div></section>'+
    '<section class="card stack">'+
      '<div class="times"><div><span class="lab">Check in</span><b id="tin">—</b></div><div><span class="lab">Check out</span><b id="tout">—</b></div><div id="tst"></div></div>'+
      '<div id="leaveNote"></div>'+
      '<div class="actions"><button class="btn big" id="bin" type="button">Check in</button><button class="btn big orange" id="bout" type="button">Check out</button></div>'+
      '<p class="hint" id="bhint"></p>'+
    '</section></div>';
    $('#bin').onclick=function(){mark('in')};
    $('#bout').onclick=function(){mark('out')};
    $('#scanStart').onclick=startScan;
    $('#scanCancel').onclick=stopScan;
    $('#photoBtn').onclick=function(){$('#scanPhoto').click()};
    $('#scanPhoto').onchange=function(){var f=this.files&&this.files[0];this.value='';onPhotoFile(f)};
  },
  update:function(){
    var me=meRec();if(!me||!$('#sd'))return;
    $('#sd').textContent=new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    $('#sn').textContent=greet()+', '+String(me.name||'Staff').split(' ')[0];
    $('#sc').textContent=new Date().toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true});
    var ok=scanOk();$('#scanOk').hidden=!ok;$('#scanNeed').hidden=ok;
    var a=S.attMine.find(function(x){return x.date===S.today});
    var inn=!!(a&&a.inAt);
    $('#tin').textContent=inn?hm(a.inAt):'—';
    $('#tout').textContent=a&&a.outAt?hm(a.outAt):'—';
    var map=attMap(S.attMine),st=dayStatus(me.id,S.today,map);
    $('#tst').innerHTML=st.k==='future'?'':chip(st.k);
    var lv=leaveCovers(me.id,S.today);
    $('#leaveNote').innerHTML=lv&&!inn?'<div class="banner info">You are on approved leave today ('+esc(lv.type)+').</div>':'';
    var setup=!!(S.settings&&S.settings.hasQr);
    $('#bin').disabled=!setup||!ok||inn||S.busy;
    $('#bout').disabled=!setup||!ok||!inn||S.busy;
    $('#scanStart').disabled=!setup;
    var hint;
    if(!setup)hint='Attendance is not set up yet. Please contact the school office.';
    else if(!ok)hint='Check in and check out unlock after you scan the school QR.';
    else if(!inn)hint='You are at school. Tap Check in.';
    else if(!a.outAt)hint='Checked in'+(a.late?' (late by '+a.lateMins+' min)':'')+'. When you leave, scan the QR again and tap Check out.';
    else hint='Check out recorded'+(a.early?' (before the school closing time)':'')+'. Scan again if you need to update it.';
    $('#bhint').textContent=hint;
  }
};

/* ----- staff: my attendance ----- */
V['staff:month']={
  mount:function(el){
    el.innerHTML='<div class="narrow stack"><div class="stepper"><button class="btn ghost small" id="mp" type="button" aria-label="Previous month">‹</button><b id="ml"></b><button class="btn ghost small" id="mn" type="button" aria-label="Next month">›</button></div>'+
    '<div class="stats" id="mstats"></div><section class="card"><div id="mlist"></div></section></div>';
    $('#mp').onclick=function(){S.mMonth=shiftMonth(S.mMonth,-1);if(S.view&&S.view.update)S.view.update()};
    $('#mn').onclick=function(){if(S.mMonth<mstr(new Date())){S.mMonth=shiftMonth(S.mMonth,1);if(S.view&&S.view.update)S.view.update()}};
  },
  update:function(){
    var me=meRec();if(!me||!$('#ml'))return;
    $('#ml').textContent=monthLabel(S.mMonth);
    $('#mn').disabled=S.mMonth>=mstr(new Date());
    var map=attMap(S.attMine),days=monthDays(S.mMonth).filter(function(d){return d<=S.today}).reverse();
    var c={present:0,late:0,leave:0,absent:0};
    var rows=days.map(function(d){
      var st=dayStatus(me.id,d,map);
      if(st.k==='present')c.present++;if(st.k==='late'){c.present++;c.late++}
      if(st.k==='leave')c.leave++;if(st.k==='absent')c.absent++;
      var a=st.a;
      return '<tr><td><b>'+esc(fdate(d,{day:'numeric',month:'short'}))+'</b> <span class="sub">'+DAYS[pdate(d).getDay()]+'</span></td>'+
        '<td>'+(a?hm(a.inAt)+' – '+(a.outAt?hm(a.outAt):'—'):'<span class="sub">—</span>')+'</td><td style="text-align:right">'+chip(st.k)+'</td></tr>';
    }).join('');
    $('#mstats').innerHTML=
      '<div class="stat"><b>'+c.present+'</b><span>Present</span></div><div class="stat"><b>'+c.late+'</b><span>Late</span></div>'+
      '<div class="stat"><b>'+c.leave+'</b><span>On leave</span></div><div class="stat"><b>'+c.absent+'</b><span>Absent</span></div>';
    $('#mlist').innerHTML=rows?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>In – Out</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">No days to show for this month yet.</p>';
  }
};

/* ----- staff: leave ----- */
V['staff:leave']={
  mount:function(el){
    var t=S.today;
    el.innerHTML='<div class="narrow stack"><section class="card stack"><h2>Apply for leave</h2>'+
    '<form id="lf" class="stack">'+
      '<div><label for="lvType">Type of leave</label><select id="lvType">'+LEAVE_TYPES.map(function(x){return '<option>'+esc(x)+'</option>'}).join('')+'</select></div>'+
      '<div class="grid2"><div><label for="lvFrom">From</label><input id="lvFrom" type="date" value="'+t+'" required></div><div><label for="lvTo">To</label><input id="lvTo" type="date" value="'+t+'" required></div></div>'+
      '<label class="check" for="lvHalf"><input id="lvHalf" type="checkbox"> Half day (single date only)</label>'+
      '<div><label for="lvReason">Reason</label><textarea id="lvReason" maxlength="400" placeholder="Short reason for the leave" required></textarea></div>'+
      '<p class="hint" id="lvDays"></p>'+
      '<button class="btn" type="submit" id="lvGo">Submit leave request</button><p class="err" id="lvErr" role="alert"></p>'+
    '</form></section>'+
    '<section class="card"><h2 style="margin-bottom:10px">My leave requests</h2><div id="myLeaves"></div></section></div>';
    function calc(){var f=$('#lvFrom').value,t2=$('#lvTo').value,h=$('#lvHalf').checked;var n=countLeaveDays(f,t2,h);$('#lvDays').textContent=t2<f?'The end date is before the start date.':n+' working day'+(n===1?'':'s')+' of leave (weekly off days are not counted).'}
    ['lvFrom','lvTo','lvHalf'].forEach(function(id){$('#'+id).addEventListener('input',calc)});calc();
    $('#lf').onsubmit=async function(e){
      e.preventDefault();var me=meRec();if(!me)return;
      var f=$('#lvFrom').value,t2=$('#lvTo').value,h=$('#lvHalf').checked&&f===t2,r=$('#lvReason').value.trim(),err=$('#lvErr');err.textContent='';
      if(!f||!t2||t2<f){err.textContent='Choose a valid date range.';return}
      if(!r){err.textContent='Please write a reason.';return}
      var n=countLeaveDays(f,t2,h);if(n===0){err.textContent='These dates are all weekly off days.';return}
      $('#lvGo').disabled=true;
      try{
        await fs.collection('leaves').add({staffId:me.id,type:$('#lvType').value,from:f,to:t2,half:h,days:n,reason:r,status:'pending',appliedAt:new Date().toISOString(),decidedAt:null,note:''});
        $('#lvReason').value='';toast('Leave request sent to the school admin.','good');
      }catch(x){console.warn(x);err.textContent='Could not send the request. Please try again.'}
      $('#lvGo').disabled=false;
    };
    $('#myLeaves').onclick=async function(e){
      var b=e.target.closest('[data-cancel]');if(!b)return;b.disabled=true;
      try{await fs.doc('leaves/'+b.dataset.cancel).update({status:'cancelled',decidedAt:new Date().toISOString()});toast('Request cancelled.')}catch(x){toast('Could not cancel.','bad');b.disabled=false}
    };
  },
  update:function(){
    var me=meRec();if(!me||!$('#myLeaves'))return;
    var mine=S.leaves.slice().sort(function(a,b){return String(b.appliedAt).localeCompare(String(a.appliedAt))});
    $('#myLeaves').innerHTML=mine.length?mine.map(function(l){
      return '<div class="leave"><div class="top"><b>'+esc(l.type)+'</b>'+lchip(l.status)+'</div>'+
      '<div class="sub">'+esc(fdate(l.from))+(l.to!==l.from?' – '+esc(fdate(l.to)):'')+' · '+l.days+' day'+(l.days===1?'':'s')+(l.half?' (half day)':'')+'</div>'+
      '<div class="reason">'+esc(l.reason)+'</div>'+
      (l.note?'<div class="sub">Admin note: '+esc(l.note)+'</div>':'')+
      (l.status==='pending'?'<div><button class="btn danger small" data-cancel="'+esc(l.id)+'" type="button">Cancel request</button></div>':'')+'</div>';
    }).join(''):'<p class="empty">You have not applied for any leave yet.</p>';
  }
};

/* ----- admin: overview ----- */
V['admin:overview']={
  mount:function(el){
    el.innerHTML='<div class="stack"><div id="ovHead"></div><div id="ovSetup"></div><div id="ovPending"></div><div class="stats" id="ovStats"></div>'+
    '<section class="card"><h2 style="margin-bottom:6px">Today’s attendance</h2><div id="ovTable"></div></section></div>';
    el.onclick=function(e){var g=e.target.closest('[data-go]');if(g)go(g.dataset.go)};
  },
  update:function(){
    if(!$('#ovStats'))return;
    var act=activeStaff(),map=attMap(S.attToday),c={inn:0,late:0,leave:0,notin:0};
    var off=isOff(S.today);
    $('#ovHead').innerHTML='<p class="eyebrow">'+esc(new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))+'</p>'+(off?'<div class="banner info" style="margin-top:8px">Today is a weekly off day.</div>':'');
    var rows=act.map(function(s){
      var st=dayStatus(s.id,S.today,map),a=st.a;
      if(a){c.inn++;if(a.late)c.late++}else if(st.k==='leave')c.leave++;else if(st.k==='notin')c.notin++;
      return '<tr><td class="person"><b>'+esc(s.name)+'</b><span>'+esc(s.id)+(s.designation?' · '+esc(s.designation):'')+'</span></td><td>'+(a?hm(a.inAt):'—')+'</td><td>'+(a&&a.outAt?hm(a.outAt)+(a.early?' <span class="sub">early</span>':''):'—')+'</td><td style="text-align:right">'+chip(st.k)+(a&&a.late?' <span class="sub">+'+a.lateMins+' min</span>':'')+'</td></tr>';
    }).join('');
    $('#ovStats').innerHTML='<div class="stat"><b>'+c.inn+'</b><span>Checked in</span></div><div class="stat"><b>'+c.late+'</b><span>Late</span></div><div class="stat"><b>'+c.leave+'</b><span>On leave</span></div><div class="stat'+(c.notin?' hl':'')+'"><b>'+c.notin+'</b><span>Not in yet</span></div>';
    $('#ovTable').innerHTML=act.length?'<div class="tablewrap"><table><thead><tr><th>Staff</th><th>In</th><th>Out</th><th style="text-align:right">Status</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">No staff added yet.</p>';
    var pend=S.leaves.filter(function(l){return l.status==='pending'}).length;
    $('#ovPending').innerHTML=pend?'<div class="banner warn row" style="justify-content:space-between"><span><b>'+pend+' leave request'+(pend===1?'':'s')+'</b> waiting for your decision.</span><button class="btn small orange" data-go="leaves" type="button">Review</button></div>':'';
    var steps=[
      [(S.staff||[]).length>0,'Add your staff and give each a Staff ID and PIN','staff'],
      [!!S.qrValue,'Upload a photo of your QR or create one, then download the poster','qr'],
      [false,'Print the poster and stick it at the school entrance. Share this website’s link with staff.','']];
    var need=S.staff&&S.qrLoaded&&!(steps[0][0]&&steps[1][0]);
    $('#ovSetup').innerHTML=need?'<section class="card stack"><h2>Get started</h2><ol class="steps">'+steps.map(function(x){return '<li>'+(x[0]?'<s>':'')+esc(x[1])+(x[0]?'</s> ✓':'')+(x[2]&&!x[0]?' <button class="btn small ghost" data-go="'+x[2]+'" type="button">Open</button>':'')+'</li>'}).join('')+'</ol></section>':'';
  }
};

/* ----- admin: staff ----- */
function nextStaffId(){
  var max=0;(S.staff||[]).forEach(function(s){var m=/^CSC(\d+)$/.exec(s.id);if(m)max=Math.max(max,Number(m[1]))});
  return 'CSC'+String(max+1).padStart(3,'0');
}
function staffEmail(id){return id.toLowerCase()+'.'+rndStr(6,ALPHA)+'@'+STAFF_DOMAIN}
async function createAuthUser(email,pin){
  var a=secAuth(),cred=await a.createUserWithEmailAndPassword(email,pin);
  var uid=cred.user.uid;await a.signOut();return uid;
}
function pinNote(name,id,pin,verb){
  var txt='CSC Bal Vidyalaya staff attendance. Staff ID: '+id+'  PIN: '+pin;
  $('#pinNote').innerHTML='<div class="banner good stack"><div><b>'+esc(verb)+' for '+esc(name)+'.</b> Share these login details with them. The PIN is not shown again.</div>'+
    '<div class="creds">Staff ID: '+esc(id)+' &nbsp;·&nbsp; PIN: '+esc(pin)+'</div>'+
    '<div class="row"><button class="btn small" type="button" id="pnCopy">Copy details</button><button class="btn small ghost" type="button" id="pnHide">Hide</button></div></div>';
  $('#pnCopy').onclick=function(){
    var done=function(){toast('Login details copied.','good')};
    try{navigator.clipboard.writeText(txt).then(done,function(){toast('Select the details above and copy them.')})}catch(e){toast('Select the details above and copy them.')}
  };
  $('#pnHide').onclick=function(){$('#pinNote').innerHTML=''};
}
V['admin:staff']={
  mount:function(el){
    el.innerHTML='<div class="stack"><section class="card stack"><h2>Add staff member</h2>'+
    '<form id="sf" class="grid2">'+
      '<div><label for="sfName">Full name</label><input id="sfName" required maxlength="60" autocomplete="off"></div>'+
      '<div><label for="sfDes">Designation</label><input id="sfDes" maxlength="40" placeholder="e.g. Primary Teacher" autocomplete="off"></div>'+
      '<div><label for="sfId">Staff ID</label><input id="sfId" required maxlength="16" autocapitalize="characters" autocomplete="off" spellcheck="false"></div>'+
      '<div><label for="sfPin">PIN (6 digits)</label><div class="row"><input id="sfPin" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required autocomplete="off"><button class="btn ghost" type="button" id="sfGen">New PIN</button></div></div>'+
      '<div class="span2 row"><button class="btn" type="submit" id="sfGo">Add staff member</button><span class="err" id="sfErr" role="alert"></span></div>'+
    '</form><div id="pinNote"></div></section>'+
    '<section class="card"><h2 style="margin-bottom:6px">Staff <span class="sub" id="scount"></span></h2><div id="slist"></div></section></div>';
    $('#sfId').value=nextStaffId();$('#sfPin').value=rndPin();
    $('#sfGen').onclick=function(){$('#sfPin').value=rndPin()};
    $('#sf').onsubmit=async function(e){
      e.preventDefault();var err=$('#sfErr');err.textContent='';
      var name=$('#sfName').value.trim(),id=$('#sfId').value.trim().toUpperCase(),pin=$('#sfPin').value.trim(),des=$('#sfDes').value.trim();
      if(!/^[A-Z0-9_-]{2,16}$/.test(id)){err.textContent='Staff ID can use letters, numbers, - and _ only.';return}
      if(!/^[0-9]{6}$/.test(pin)){err.textContent='PIN must be exactly 6 digits.';return}
      if((S.staff||[]).some(function(s){return s.id===id})){err.textContent='That Staff ID is already used.';return}
      $('#sfGo').disabled=true;
      try{
        var email=staffEmail(id),uid=await createAuthUser(email,pin);
        var b=fs.batch();
        b.set(fs.doc('staff/'+id),{name:name,designation:des,active:true,uid:uid,createdAt:new Date().toISOString()});
        b.set(fs.doc('uids/'+uid),{staffId:id});
        b.set(fs.doc('loginmap/'+id),{email:email});
        await b.commit();
        pinNote(name,id,pin,'Staff member added');
        $('#sfName').value='';$('#sfDes').value='';$('#sfId').value=nextStaffId();$('#sfPin').value=rndPin();
      }catch(x){
        console.warn(x);
        err.textContent=x&&x.code==='auth/operation-not-allowed'?'Email/Password sign-in is not enabled in Firebase.':
          x&&x.code==='permission-denied'?'Not allowed. Check the Firestore rules.':'Could not save. Check the internet and try again.';
      }
      $('#sfGo').disabled=false;
    };
    $('#slist').onclick=async function(e){
      var b=e.target.closest('[data-act]');if(!b)return;var id=b.dataset.id,act=b.dataset.act,st=(S.staff||[]).find(function(s){return s.id===id});if(!st)return;
      try{
        if(act==='reset'){
          b.disabled=true;
          var pin=rndPin(),email=staffEmail(id),uid=await createAuthUser(email,pin),batch=fs.batch();
          batch.set(fs.doc('uids/'+uid),{staffId:id});
          if(st.uid)batch.delete(fs.doc('uids/'+st.uid));
          batch.set(fs.doc('loginmap/'+id),{email:email});
          batch.update(fs.doc('staff/'+id),{uid:uid});
          await batch.commit();
          pinNote(st.name,id,pin,'PIN reset');window.scrollTo(0,0);
        }else if(act==='toggle'){await fs.doc('staff/'+id).update({active:st.active===false});toast(st.active===false?'Account switched on.':'Account switched off.')}
        else if(act==='del'){
          if(S.confirmDel!==id){S.confirmDel=id;if(S.view&&S.view.update)S.view.update();setTimeout(function(){if(S.confirmDel===id){S.confirmDel=null;if(S.view&&S.view.update)S.view.update()}},4000);return}
          S.confirmDel=null;
          var bd=fs.batch();bd.delete(fs.doc('staff/'+id));bd.delete(fs.doc('loginmap/'+id));if(st.uid)bd.delete(fs.doc('uids/'+st.uid));
          await bd.commit();toast('Staff member deleted. Past attendance records are kept.');
        }
      }catch(x){console.warn(x);toast('That did not work. Please try again.','bad');b.disabled=false}
    };
  },
  update:function(){
    if(!$('#slist'))return;
    var list=S.staff;
    $('#scount').textContent=list?'('+list.length+')':'';
    if(!list){$('#slist').innerHTML='<p class="empty">Loading staff…</p>';return}
    $('#slist').innerHTML=list.length?'<div class="tablewrap"><table><thead><tr><th>Staff</th><th>Status</th><th></th></tr></thead><tbody>'+list.map(function(s){
      var on=s.active!==false;
      return '<tr><td class="person"><b>'+esc(s.name)+'</b><span>'+esc(s.id)+(s.designation?' · '+esc(s.designation):'')+'</span></td><td>'+(on?'<span class="chip good">Active</span>':'<span class="chip muted">Switched off</span>')+'</td>'+
      '<td><div class="actions-cell"><button class="btn small ghost" data-act="reset" data-id="'+esc(s.id)+'" type="button">Reset PIN</button><button class="btn small ghost" data-act="toggle" data-id="'+esc(s.id)+'" type="button">'+(on?'Switch off':'Switch on')+'</button><button class="btn small danger" data-act="del" data-id="'+esc(s.id)+'" type="button">'+(S.confirmDel===s.id?'Tap again to delete':'Delete')+'</button></div></td></tr>';
    }).join('')+'</tbody></table></div>':'<p class="empty">No staff yet. Add the first staff member above.</p>';
  }
};

/* ----- admin: leave requests ----- */
V['admin:leaves']={
  mount:function(el){
    el.innerHTML='<div class="stack"><div class="seg" role="group" aria-label="Filter"><button type="button" data-f="pending">Pending</button><button type="button" data-f="all">All requests</button></div><section class="card"><div id="alist"></div></section></div>';
    el.onclick=async function(e){
      var f=e.target.closest('[data-f]');if(f){S.lvFilter=f.dataset.f;if(S.view&&S.view.update)S.view.update();return}
      var d=e.target.closest('[data-dec]');if(!d)return;var id=d.dataset.id;d.disabled=true;
      try{await fs.doc('leaves/'+id).update({status:d.dataset.dec,decidedAt:new Date().toISOString(),note:(S.notes[id]||'').trim()});delete S.notes[id];toast(d.dataset.dec==='approved'?'Leave approved.':'Leave rejected.','good')}
      catch(x){toast('Could not save the decision.','bad');d.disabled=false}
    };
    el.addEventListener('input',function(e){var n=e.target.closest('[data-note]');if(n)S.notes[n.dataset.note]=n.value});
  },
  update:function(){
    if(!$('#alist'))return;
    $$('[data-f]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.f===S.lvFilter))});
    var names={};(S.staff||[]).forEach(function(s){names[s.id]=s});
    var list=S.leaves.filter(function(l){return S.lvFilter==='all'||l.status==='pending'});
    $('#alist').innerHTML=list.length?list.map(function(l){
      var s=names[l.staffId];
      return '<div class="leave"><div class="top"><div class="person"><b>'+esc(s?s.name:l.staffId)+'</b><span>'+esc(l.staffId)+'</span></div>'+lchip(l.status)+'</div>'+
      '<div><b>'+esc(l.type)+'</b> <span class="sub">'+esc(fdate(l.from))+(l.to!==l.from?' – '+esc(fdate(l.to)):'')+' · '+l.days+' day'+(l.days===1?'':'s')+(l.half?' (half day)':'')+'</span></div>'+
      '<div class="reason">'+esc(l.reason)+'</div><div class="sub">Applied '+esc(fdate(String(l.appliedAt||'').slice(0,10)))+'</div>'+
      (l.status==='pending'?'<div class="row"><input data-note="'+esc(l.id)+'" placeholder="Note for the staff member (optional)" maxlength="200" value="'+esc(S.notes[l.id]||'')+'" aria-label="Note"><button class="btn small" data-dec="approved" data-id="'+esc(l.id)+'" type="button">Approve</button><button class="btn small danger" data-dec="rejected" data-id="'+esc(l.id)+'" type="button">Reject</button></div>':(l.note?'<div class="sub">Your note: '+esc(l.note)+'</div>':''))+'</div>';
    }).join(''):'<p class="empty">'+(S.lvFilter==='all'?'No leave requests yet.':'No pending leave requests.')+'</p>';
  }
};

/* ----- admin: reports ----- */
function subReport(){
  sub('attMonth',fs.collection('attendance').where('month','==',S.repMonth),function(snap){S.attMonth=docs(snap);S.attMonthFor=S.repMonth;refresh()});
}
function reportData(){
  var map=attMap(S.attMonth),days=monthDays(S.repMonth),withRecords={};
  S.attMonth.forEach(function(a){withRecords[a.staffId]=1});
  var people=(S.staff||[]).filter(function(s){return s.active!==false||withRecords[s.id]});
  return people.map(function(s){
    var r={s:s,present:0,late:0,leave:0,absent:0,work:0,days:[]};
    days.forEach(function(d){
      var st=dayStatus(s.id,d,map);r.days.push({d:d,st:st});
      if(d<=S.today&&st.k!=='off'&&st.k!=='future')r.work++;
      if(st.k==='present')r.present++;
      if(st.k==='late'){r.present++;r.late++}
      if(st.k==='leave')r.leave++;
      if(st.k==='absent')r.absent++;
    });
    return r;
  });
}
V['admin:reports']={
  mount:function(el){
    el.innerHTML='<div class="stack"><div class="row" style="justify-content:space-between"><div class="stepper"><button class="btn ghost small" id="rp" type="button" aria-label="Previous month">‹</button><b id="rl"></b><button class="btn ghost small" id="rn" type="button" aria-label="Next month">›</button></div>'+
    '<div class="row"><button class="btn small ghost" id="rcs" type="button">Download summary (CSV)</button><button class="btn small ghost" id="rcd" type="button">Download day-wise (CSV)</button></div></div>'+
    '<section class="card"><div id="rtable"></div></section></div>';
    function setMonth(k){S.repMonth=shiftMonth(S.repMonth,k);S.expanded={};subReport();if(S.view&&S.view.update)S.view.update()}
    $('#rp').onclick=function(){setMonth(-1)};
    $('#rn').onclick=function(){if(S.repMonth<mstr(new Date()))setMonth(1)};
    $('#rtable').onclick=function(e){var t=e.target.closest('[data-x]');if(!t)return;var k=t.dataset.x;S.expanded[k]=!S.expanded[k];if(S.view&&S.view.update)S.view.update()};
    $('#rcs').onclick=function(){
      var rows=[['Staff ID','Name','Designation','Present','Late','On leave','Absent','Working days up to today']];
      reportData().forEach(function(r){rows.push([r.s.id,r.s.name,r.s.designation||'',r.present,r.late,r.leave,r.absent,r.work])});
      download('attendance-summary-'+S.repMonth+'.csv','\ufeff'+rows.map(function(r){return r.map(csvCell).join(',')}).join('\n'),'text/csv;charset=utf-8');
    };
    $('#rcd').onclick=function(){
      var rows=[['Staff ID','Name','Date','Day','Status','Check in','Check out','Late by (min)']];
      reportData().forEach(function(r){r.days.forEach(function(x){
        if(x.st.k==='future')return;var a=x.st.a;
        rows.push([r.s.id,r.s.name,x.d,DAYS[pdate(x.d).getDay()],CH[x.st.k][1],a?hm(a.inAt):'',a&&a.outAt?hm(a.outAt):'',a&&a.late?a.lateMins:'']);
      })});
      download('attendance-daywise-'+S.repMonth+'.csv','\ufeff'+rows.map(function(r){return r.map(csvCell).join(',')}).join('\n'),'text/csv;charset=utf-8');
    };
    subReport();
  },
  update:function(){
    if(!$('#rtable'))return;
    $('#rl').textContent=monthLabel(S.repMonth);$('#rn').disabled=S.repMonth>=mstr(new Date());
    if(S.attMonthFor!==S.repMonth){$('#rtable').innerHTML='<p class="empty">Loading…</p>';return}
    var data=reportData();
    $('#rtable').innerHTML=data.length?'<div class="tablewrap"><table><thead><tr><th>Staff</th><th class="num">Present</th><th class="num">Late</th><th class="num">Leave</th><th class="num">Absent</th><th class="num">Working days</th></tr></thead><tbody>'+data.map(function(r){
      var open=S.expanded[r.s.id];
      var grid=open?'<tr><td colspan="6"><div class="daygrid">'+r.days.map(function(x){
        var k=x.st.k,cls=k==='present'?'good':k==='late'?'warn':k==='absent'?'bad':k==='leave'?'info':'';
        return '<div class="dc '+cls+'" title="'+esc(CH[k][1])+'"><b>'+Number(x.d.slice(8))+'</b>'+DAYS[pdate(x.d).getDay()]+'<br>'+(k==='present'?'P':k==='late'?'Late':k==='absent'?'A':k==='leave'?'L':k==='off'?'Off':'—')+'</div>';
      }).join('')+'</div></td></tr>':'';
      return '<tr><td class="person"><button class="btn ghost small" data-x="'+esc(r.s.id)+'" type="button" aria-expanded="'+(open?'true':'false')+'" style="margin-right:8px">'+(open?'−':'+')+'</button><span style="display:inline-block;vertical-align:middle"><b>'+esc(r.s.name)+'</b><span>'+esc(r.s.id)+'</span></span></td><td class="num">'+r.present+'</td><td class="num">'+r.late+'</td><td class="num">'+r.leave+'</td><td class="num">'+r.absent+'</td><td class="num">'+r.work+'</td></tr>'+grid;
    }).join('')+'</tbody></table></div><p class="hint" style="margin-top:10px">Present includes late arrivals. Weekly off days are not counted as working days. Tap + for the day-by-day view.</p>':'<p class="empty">No staff to report on yet.</p>';
  }
};

/* ----- admin: QR + settings ----- */
function saveSettings(patch){return fs.doc('settings/school').set(patch,{merge:true})}
V['admin:qr']={
  sig:null,filled:false,cv:null,
  mount:function(el){
    var self=V['admin:qr'];self.sig=null;self.filled=false;self.cv=null;
    el.innerHTML='<div class="stack"><div class="grid2" style="align-items:start">'+
    '<section class="card stack"><h2>School QR</h2>'+
      '<div class="banner info" id="noQr">No school QR yet. Upload a photo of your QR or let the app create one.</div>'+
      '<div id="posterBox" class="stack" hidden><img class="poster" id="posterImg" alt="QR poster preview">'+
      '<div class="row"><button class="btn" id="dlPoster" type="button">Download poster (PNG)</button><button class="btn ghost" id="dlQr" type="button">Download QR only</button></div></div>'+
      '<p class="err" id="posterErr" role="alert"></p>'+
      '<div class="stack" style="border-top:1px solid var(--line);padding-top:14px">'+
        '<div><label for="qrUp">Upload a photo of the QR</label><input id="qrUp" type="file" accept="image/*"></div>'+
        '<div><button class="btn ghost" id="qrMake" type="button">Create a new QR for me</button></div>'+
        '<div id="qrConfirm"></div><p class="hint" id="qrMsg" role="status"></p>'+
      '</div>'+
      '<p class="hint">Staff scan this QR with their phone camera inside this app. A new QR replaces the old one, so printed copies of the old QR stop working.</p>'+
    '</section>'+
    '<div class="stack"><section class="card stack"><h2>School timings</h2>'+
      '<form id="tf" class="stack"><div class="grid2"><div><label for="tStart">Opening time</label><input id="tStart" type="time" required></div><div><label for="tEnd">Closing time</label><input id="tEnd" type="time" required></div></div>'+
      '<div><label for="tGrace">Grace period (minutes) before arrival counts as late</label><input id="tGrace" type="number" min="0" max="120" required></div>'+
      '<fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:13px;margin-bottom:6px">Weekly off days</legend><div class="row" id="tOff">'+DAYS.map(function(d,i){return '<label class="check" style="margin:0"><input type="checkbox" data-off="'+i+'"> '+d+'</label>'}).join('')+'</div></fieldset>'+
      '<button class="btn" type="submit">Save timings</button></form></section>'+
    '<section class="card stack"><h2>Admin password</h2>'+
      '<form id="pwForm" class="stack"><div><label for="pwOld">Current password</label><input id="pwOld" type="password" autocomplete="current-password" required></div>'+
      '<div><label for="pwNew">New password (at least 6 characters)</label><input id="pwNew" type="password" minlength="6" autocomplete="new-password" required></div>'+
      '<button class="btn" type="submit">Change password</button><p class="err" id="pwErr" role="alert"></p></form></section>'+
    '</div></div></div>';

    function apply(v,text){
      var b=fs.batch();
      b.set(fs.doc('secret/qr'),{value:v,updatedAt:new Date().toISOString()});
      b.set(fs.doc('settings/school'),{hasQr:true},{merge:true});
      b.commit().then(function(){$('#qrConfirm').innerHTML='';$('#qrMsg').textContent=text;toast('School QR saved.','good')}).catch(function(x){console.warn(x);$('#qrMsg').textContent='Could not save the QR. Please try again.'});
    }
    function ask(v){
      $('#qrMsg').textContent='';
      $('#qrConfirm').innerHTML='<div class="banner warn stack"><div>Replace the current school QR? Printed copies of the old QR will stop working.</div><div class="row"><button class="btn small" id="qrYes" type="button">Use this QR</button><button class="btn small ghost" id="qrNo" type="button">Cancel</button></div></div>';
      $('#qrYes').onclick=function(){apply(v,'The school QR was replaced. Print the new poster.')};
      $('#qrNo').onclick=function(){$('#qrConfirm').innerHTML=''};
    }
    $('#qrUp').onchange=async function(){
      var f=this.files&&this.files[0];this.value='';if(!f)return;
      var msg=$('#qrMsg');msg.textContent='Reading the QR…';$('#qrConfirm').innerHTML='';
      var v=null;
      try{v=await decodeQR(f)}catch(e){msg.textContent='The QR reader could not load. Check the internet connection and try again.';return}
      if(!v){msg.textContent='No QR code found in that photo. Use a clear, straight photo with the whole QR visible.';return}
      v=v.trim();
      if(!v||v.length>1000){msg.textContent='That QR is empty or holds too much data.';return}
      if(S.qrValue===v){msg.textContent='This is already the school QR.';return}
      if(S.qrValue)ask(v);else apply(v,'QR photo read. This is now the school QR.');
    };
    $('#qrMake').onclick=function(){
      var v='CSCATT-'+rndStr(12,ALPHA);
      if(S.qrValue)ask(v);else apply(v,'A new school QR was created. Download the poster below.');
    };
    $('#tf').onsubmit=async function(e){
      e.preventDefault();
      var off=$$('[data-off]').filter(function(c){return c.checked}).map(function(c){return Number(c.dataset.off)});
      try{await saveSettings({startTime:$('#tStart').value,endTime:$('#tEnd').value,graceMins:Number($('#tGrace').value||0),offDays:off});toast('Timings saved.','good')}catch(x){toast('Could not save timings.','bad')}
    };
    $('#pwForm').onsubmit=async function(e){
      e.preventDefault();var err=$('#pwErr');err.textContent='';
      var u=auth.currentUser,old=$('#pwOld').value,nw=$('#pwNew').value;
      if(!u||!u.email){err.textContent='Not signed in.';return}
      if(nw.length<6){err.textContent='New password needs at least 6 characters.';return}
      try{
        await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,old));
        await u.updatePassword(nw);
        $('#pwOld').value='';$('#pwNew').value='';toast('Password changed.','good');
      }catch(x){err.textContent=(x&&(x.code==='auth/wrong-password'||x.code==='auth/invalid-credential'))?'The current password is not correct.':'Could not change the password. Please try again.'}
    };
    $('#dlPoster').onclick=function(){var cv=self.cv;if(!cv){toast('The poster is not ready yet.');return}cv.toBlob(function(b){download('CSC-attendance-QR-poster.png',b)},'image/png')};
    $('#dlQr').onclick=async function(){var b=await qrOnlyBlob();if(b)download('CSC-attendance-QR.png',b);else toast('The QR could not be made.','bad')};
  },
  update:async function(){
    var self=V['admin:qr'];if(!$('#posterBox'))return;
    if(S.settingsLoaded&&!self.filled){
      self.filled=true;var c=cfg();
      $('#tStart').value=c.startTime;$('#tEnd').value=c.endTime;$('#tGrace').value=c.graceMins;
      $$('[data-off]').forEach(function(x){x.checked=c.offDays.indexOf(Number(x.dataset.off))>=0});
    }
    var val=S.qrValue;
    $('#posterBox').hidden=!val;$('#noQr').hidden=!!val||!S.qrLoaded;
    if(!val){$('#posterErr').textContent='';self.sig='';return}
    if(self.sig===val)return;
    self.sig=val;
    var p=await buildPoster();
    if(self.sig!==val)return;
    if(!p||p.error){$('#posterErr').textContent=(p&&p.error)||'';self.cv=null;return}
    $('#posterErr').textContent='';self.cv=p.canvas;$('#posterImg').src=p.canvas.toDataURL('image/png');
  }
};

/* ================= shell, login, boot ================= */
var TABS={
  staff:[['today','Today'],['month','My attendance'],['leave','Leave']],
  admin:[['overview','Overview'],['staff','Staff'],['leaves','Leave requests'],['reports','Reports'],['qr','QR & settings']]
};
function buildTabs(){
  var pend=S.leaves.filter(function(l){return l.status==='pending'}).length;
  $('#tabs').innerHTML=TABS[S.role].map(function(t){
    return '<button type="button" class="tab" data-tab="'+t[0]+'"'+(S.tab===t[0]?' aria-current="page"':'')+'>'+esc(t[1])+(S.role==='admin'&&t[0]==='leaves'&&pend?'<span class="dot">'+pend+'</span>':'')+'</button>';
  }).join('');
}
function go(tab){
  stopScan();
  S.tab=tab;S.view=V[S.role+':'+tab];
  buildTabs();$('#view').innerHTML='';S.view.mount($('#view'));if(S.view.update)S.view.update();window.scrollTo(0,0);
}
function renderChrome(){
  if(!S.role)return;
  $('#whoName').textContent=S.role==='admin'?'School admin':(S.me?S.me.name:'');
  buildTabs();
}
function applyLoginMode(m){
  S.lmode=m;
  $$('[data-lt]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.lt===m))});
  $('#loginForm').hidden=m!=='staff';$('#adminForm').hidden=m!=='admin';
  $('#lLead').textContent=m==='admin'?'Sign in with the admin ID and password.':'Use the Staff ID and PIN given by the school office.';
}
function setLoginMode(m){
  S.keepMsg=null;applyLoginMode(m);
  $('#lerr').textContent='';$('#aerr').textContent='';
}
function showLogin(){
  $('#loading').hidden=true;$('#block').hidden=true;$('#shell').hidden=true;$('#who').hidden=true;$('#login').hidden=false;
}
function enter(role,me){
  S.role=role;S.me=me||null;S.tab=null;S.attMine=[];S.attToday=[];S.leaves=[];S.scan=null;
  $('#loading').hidden=true;$('#login').hidden=true;$('#shell').hidden=false;$('#who').hidden=false;
  subscribeData();renderChrome();go(TABS[role][0][0]);
}
function subscribeData(){
  sub('settings',fs.doc('settings/school'),function(snap){
    S.settingsLoaded=true;S.settings=snap.exists?snap.data():null;
    if(!snap.exists&&S.role==='admin'&&!S.seeding){S.seeding=true;fs.doc('settings/school').set(DEF).catch(function(){S.seeding=false})}
    refresh();
  });
  if(S.role==='staff'){
    var id=S.me.id;
    sub('attendance',fs.collection('attendance').where('staffId','==',id),function(s){S.attMine=docs(s);refresh()});
    sub('leaves',fs.collection('leaves').where('staffId','==',id),function(s){S.leaves=docs(s);refresh()});
  }else if(S.role==='admin'){
    sub('staff',fs.collection('staff'),function(snap){
      S.staff=snap.docs.map(function(d){var o=d.data();o.id=d.id;return o}).sort(function(a,b){return String(a.name).localeCompare(String(b.name))});
      refresh();
    });
    sub('qr',fs.doc('secret/qr'),function(snap){S.qrLoaded=true;S.qrValue=snap.exists?snap.data().value:null;refresh()});
    sub('attendance',fs.collection('attendance').where('date','==',S.today),function(s){S.attToday=docs(s);refresh()});
    sub('leaves',fs.collection('leaves').orderBy('appliedAt','desc').limit(500),function(s){S.leaves=docs(s);refresh()});
  }
}
function resetToLogin(msg){
  stopScan();unsubAll();
  S.role=null;S.me=null;S.view=null;S.staff=null;S.settings=null;S.settingsLoaded=false;S.qrValue=null;S.qrLoaded=false;
  S.leaves=[];S.attMine=[];S.attToday=[];S.attMonth=[];S.attMonthFor='';S.scan=null;S.resolvedUid=null;S.seeding=false;
  $('#view').innerHTML='';
  ['lid','lpin','aid','apw'].forEach(function(id){var el=$('#'+id);if(el)el.value=''});
  showLogin();applyLoginMode(S.lmode);
  $('#lerr').textContent='';$('#aerr').textContent='';
  msg=msg||S.keepMsg;
  if(msg)$(S.lmode==='admin'?'#aerr':'#lerr').textContent=msg;
}
async function rejectUser(msg){
  S.resolvedUid=null;S.keepMsg=msg;
  try{await auth.signOut()}catch(e){}
  resetToLogin(msg);
}
async function resolveRole(u){
  if(S.resolvedUid===u.uid)return;
  S.resolvedUid=u.uid;
  var email=(u.email||'').toLowerCase();
  try{
    if(email.slice(-('@'+ADMIN_DOMAIN).length)==='@'+ADMIN_DOMAIN){
      try{await fs.doc('secret/qr').get()}catch(e){
        if(e&&e.code==='permission-denied'){S.lmode='admin';return rejectUser('This account is not allowed to open the admin panel.')}
        throw e;
      }
      enter('admin');return;
    }
    var m=await fs.doc('uids/'+u.uid).get();
    if(!m.exists){S.lmode='staff';return rejectUser('This login is no longer active. Please contact the school office.')}
    var sid=m.data().staffId,st=await fs.doc('staff/'+sid).get();
    if(!st.exists){S.lmode='staff';return rejectUser('Your staff record was not found. Please contact the school office.')}
    var d=st.data();
    if(d.active===false){S.lmode='staff';return rejectUser('Your account is switched off. Please contact the school office.')}
    d.id=sid;enter('staff',d);
  }catch(e){
    console.warn(e);S.resolvedUid=null;
    $('#loading').hidden=true;
    toast('Could not load your account. Check the internet connection and reload.','bad');
    showLogin();applyLoginMode(S.lmode);
  }
}
function locked(el){
  if(Date.now()<S.lockUntil){el.textContent='Too many tries. Wait '+Math.ceil((S.lockUntil-Date.now())/1000)+' seconds.';return true}
  return false;
}
function failed(){S.fails++;if(S.fails>=5){S.lockUntil=Date.now()+30000;S.fails=0}}
function netErr(x){var c=x&&x.code||'';return c==='auth/network-request-failed'||c==='unavailable'||c==='auth/internal-error'}
async function doStaffLogin(e){
  e.preventDefault();var err=$('#lerr');err.textContent='';if(locked(err))return;
  var id=$('#lid').value.trim().toUpperCase(),pin=$('#lpin').value.trim();
  $('#lgo').disabled=true;
  try{
    var m=await fs.doc('loginmap/'+id).get();
    if(!m.exists)throw {code:'auth/user-not-found'};
    await auth.signInWithEmailAndPassword(m.data().email,pin);
    S.fails=0;$('#lpin').value='';
  }catch(x){
    if(netErr(x))err.textContent='No internet connection. Please try again.';
    else if(x&&x.code==='auth/too-many-requests')err.textContent='Too many tries. Wait a few minutes and try again.';
    else{failed();err.textContent='Staff ID or PIN is not correct.'}
  }
  $('#lgo').disabled=false;
}
async function doAdminLogin(e){
  e.preventDefault();var err=$('#aerr');err.textContent='';if(locked(err))return;
  var id=$('#aid').value.trim().toLowerCase(),pw=$('#apw').value;
  if(!/^[a-z0-9_.-]{2,32}$/.test(id)){err.textContent='Admin ID or password is not correct.';return}
  $('#ago').disabled=true;
  try{
    await auth.signInWithEmailAndPassword(id+'@'+ADMIN_DOMAIN,pw);
    S.fails=0;$('#apw').value='';
  }catch(x){
    if(netErr(x))err.textContent='No internet connection. Please try again.';
    else if(x&&x.code==='auth/too-many-requests')err.textContent='Too many tries. Wait a few minutes and try again.';
    else{failed();err.textContent='Admin ID or password is not correct.'}
  }
  $('#ago').disabled=false;
}
function tick(){
  var t=dstr(new Date());
  if(t!==S.today){S.today=t;if(S.role){if(S.role==='admin')sub('attendance',fs.collection('attendance').where('date','==',S.today),function(s){S.attToday=docs(s);refresh()})}}
  refresh();
}
function boot(){
  $('#loginForm').onsubmit=doStaffLogin;
  $('#adminForm').onsubmit=doAdminLogin;
  $$('[data-lt]').forEach(function(b){b.onclick=function(){setLoginMode(b.dataset.lt)}});
  $('#signOut').onclick=function(){auth.signOut()};
  $('#tabs').onclick=function(e){var b=e.target.closest('[data-tab]');if(b)go(b.dataset.tab)};
  setLoginMode('staff');
  auth.onAuthStateChanged(function(u){
    if(u)resolveRole(u);
    else{S.resolvedUid=null;resetToLogin()}
  });
  setInterval(tick,20000);
}
boot();
})();
