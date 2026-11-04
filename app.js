import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  initializeAuth, inMemoryPersistence, createUserWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc, onSnapshot, query, where, orderBy,
  serverTimestamp, deleteField, writeBatch, getDoc, getDocFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

/* ---------------- Yardımcılar ---------------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const round2 = (n) => Math.round(n * 100) / 100;
const tl = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + ' ₺';
const fmtNum = (n) => new Intl.NumberFormat('tr-TR').format(n || 0);
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '');
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const monthLabel = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const slug = (s) => String(s).toLowerCase()
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const DEFAULT_PRODUCTS = ['Boyoz', 'Simit', 'Poğaça', 'Kumru', 'Açma', 'Zeytinli Poğaça', 'Peynirli Poğaça', 'Domatesli Kaşarlı'];

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), isError ? 5000 : 2500);
}

/* ---------------- Firebase ---------------- */
if (!firebaseConfig || String(firebaseConfig.apiKey || '').startsWith('BURAYA')) {
  document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif;line-height:1.6"><h2>Kurulum tamamlanmamış</h2><p><b>firebase-config.js</b> dosyasına Firebase bilgilerinizi yapıştırın. Ayrıntılar KURULUM.md dosyasında.</p></div>';
  throw new Error('firebase-config.js doldurulmamış');
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
/* Yöneticinin oturumu kapanmadan çalışan hesabı açabilmek için ikinci, hafızada tutulan bir oturum */
let _secAuth;
const secAuth = () => (_secAuth ??= initializeAuth(initializeApp(firebaseConfig, 'ikincil'), { persistence: inMemoryPersistence }));

/* ---------------- Durum ---------------- */
const S = {
  tab: 'new',
  products: [], hotels: [], settings: {}, receipts: [],
  month: todayStr().slice(0, 7), hotelFilter: '',
  newHotel: '', newDate: todayStr(), newNo: '', qty: {}, editingId: null, editExtra: [],
  openHotel: null,
  unsub: [], recUnsub: null, meUnsub: null, usersUnsub: null,
  me: '', role: null, users: [],
  pending: {}
};
const isAdmin = () => S.role === 'admin';

function onErr(err) {
  console.error(err);
  if (err && err.code === 'permission-denied') {
    toast('Bu işlem için yetkiniz yok.', true);
  } else {
    toast('Hata: ' + (err?.message || err), true);
  }
}

/* Kullanıcı bir kutuya yazarken ekranı yeniden çizme (yazdığı kaybolmasın) */
function busy(sectionSel) {
  const a = document.activeElement;
  if (!a || a.classList.contains('f-month') || a.classList.contains('f-hotel')) return false;
  return (a.tagName === 'INPUT' || a.tagName === 'SELECT') && $(sectionSel)?.contains(a);
}
function later(key, fn) {
  S.pending[key] = fn;
}
/* Veritabanından gelen güncellemeler için: kısa bekle, kullanıcı bir kutudaysa çıkana kadar ertele */
const timers = {};
function schedule(key, fn) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => (busy(key) ? later(key, fn) : fn()), 250);
}
const scheduleAll = () => {
  schedule('#tab-new', renderNew);
  schedule('#tab-list', renderList);
  schedule('#tab-summary', renderSummary);
  schedule('#tab-settings', renderSettings);
};
document.addEventListener('focusout', () => {
  setTimeout(() => {
    for (const [key, fn] of Object.entries(S.pending)) {
      if (!busy(key)) { delete S.pending[key]; fn(); }
    }
  }, 0);
});

/* ---------------- Giriş ---------------- */
function authMsg(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email': return 'E-posta veya şifre hatalı.';
    case 'auth/too-many-requests': return 'Çok fazla deneme yapıldı. Biraz sonra tekrar deneyin.';
    case 'auth/network-request-failed': return 'İnternet bağlantısı yok.';
    default: return 'Giriş yapılamadı (' + code + ').';
  }
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-err').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('#l-email').value.trim(), $('#l-pass').value);
  } catch (err) {
    $('#login-err').textContent = authMsg(err.code);
  }
});

$('#forgot').addEventListener('click', async () => {
  const email = $('#l-email').value.trim();
  if (!email) { $('#login-err').textContent = 'Önce e-posta adresinizi yazın.'; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    toast('Şifre sıfırlama e-postası gönderildi.');
  } catch (err) {
    $('#login-err').textContent = authMsg(err.code);
  }
});

/* ---------------- Ekranlar ve roller ---------------- */
function screen(name, msg) {
  ['login', 'loading', 'noaccess', 'app'].forEach((id) => $('#' + id).classList.toggle('hidden', id !== name));
  if (name === 'noaccess') $('#noaccess-msg').textContent = msg || '';
}

onAuthStateChanged(auth, (user) => {
  stopAll();
  S.role = null;
  if (user) beginSession(user);
  else screen('login');
});

async function beginSession(user) {
  screen('loading');
  S.me = String(user.email || '').toLowerCase();
  const ref = doc(db, 'users', S.me);
  let snap = null;
  try { snap = await getDocFromServer(ref); } catch (err) {
    if (err.code === 'permission-denied') return screen('noaccess', 'Bu hesabın uygulamaya erişim yetkisi yok. Yöneticinizle görüşün.');
    try { snap = await getDoc(ref); } catch { snap = null; }
  }
  if (auth.currentUser?.uid !== user.uid) return; // bu arada çıkış yapıldı
  if (!snap || !snap.exists()) {
    if (!navigator.onLine) return screen('noaccess', 'İlk giriş için internet bağlantısı gerekiyor.');
    // Ana yönetici ilk kez giriyorsa kendi kaydını oluşturur (kurallar sadece ana yöneticilere izin verir)
    try {
      await setDoc(ref, { email: S.me, role: 'admin', active: true, createdAt: serverTimestamp() });
    } catch (err) {
      return screen('noaccess', 'Bu hesabın uygulamaya erişim yetkisi yok. Yöneticinizden sizi eklemesini isteyin.');
    }
  }
  S.meUnsub = onSnapshot(ref, (d) => applyRole(d.exists() ? d.data() : null), (err) => {
    console.error(err);
    stopData();
    screen('noaccess', 'Bu hesabın uygulamaya erişim yetkisi yok.');
  });
}

function applyRole(data) {
  if (!data || data.active === false) {
    stopData();
    S.role = null;
    return screen('noaccess', 'Hesabınız devre dışı bırakılmış. Yöneticinizle görüşün.');
  }
  const role = data.role === 'admin' ? 'admin' : 'staff';
  const changed = role !== S.role;
  S.role = role;
  document.body.classList.toggle('staff', role === 'staff');
  $('#logout-top').classList.toggle('hidden', role === 'admin');
  if (role === 'admin' && !S.usersUnsub) {
    S.usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
      S.users = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
      schedule('#tab-settings', renderSettings);
    }, onErr);
  } else if (role !== 'admin' && S.usersUnsub) {
    S.usersUnsub(); S.usersUnsub = null; S.users = [];
  }
  screen('app');
  if (!S.unsub.length) start();
  else if (changed) {
    if (role === 'admin') subscribeReceipts();
    else { if (S.recUnsub) { S.recUnsub(); S.recUnsub = null; } S.receipts = []; S.editingId = null; S.editExtra = []; }
    showTab(S.tab);
    renderNew(); renderList(); renderSummary(); renderSettings();
  }
}

function stopData() {
  stop();
  if (S.usersUnsub) { S.usersUnsub(); S.usersUnsub = null; }
}
function stopAll() {
  stopData();
  if (S.meUnsub) { S.meUnsub(); S.meUnsub = null; }
}

$('#noaccess-logout').addEventListener('click', () => signOut(auth));
$('#logout-top').addEventListener('click', () => { if (confirm('Çıkış yapılsın mı?')) signOut(auth); });

/* ---------------- Veri dinleme ---------------- */
function start() {
  stop();
  S.unsub.push(onSnapshot(query(collection(db, 'products'), orderBy('order')), (snap) => {
    S.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    scheduleAll();
  }, onErr));
  S.unsub.push(onSnapshot(query(collection(db, 'hotels'), orderBy('name')), (snap) => {
    S.hotels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    scheduleAll();
  }, onErr));
  S.unsub.push(onSnapshot(doc(db, 'settings', 'general'), (d) => {
    S.settings = d.data() || {};
    schedule('#tab-settings', renderSettings);
  }, onErr));
  if (isAdmin()) subscribeReceipts(); // çalışanlar fişleri okuyamaz, sadece ekler
  showTab(S.tab);
}

function stop() {
  S.unsub.forEach((u) => u());
  S.unsub = [];
  if (S.recUnsub) { S.recUnsub(); S.recUnsub = null; }
}

function subscribeReceipts() {
  if (S.recUnsub) S.recUnsub();
  S.recUnsub = null;
  if (!isAdmin()) return;
  const q = query(
    collection(db, 'receipts'),
    where('date', '>=', S.month + '-01'),
    where('date', '<=', S.month + '-31'),
    orderBy('date', 'desc')
  );
  S.recUnsub = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    S.receipts = snap.docs.map((d) => ({ id: d.id, ...d.data(), _pending: d.metadata.hasPendingWrites }));
    schedule('#tab-list', renderList);
    schedule('#tab-summary', renderSummary);
  }, onErr);
}

/* ---------------- Sekmeler ---------------- */
const TITLES = { new: 'Yeni fiş', list: 'Fişler', summary: 'Aylık özet', settings: 'Ayarlar' };
function showTab(name) {
  if (!isAdmin()) name = 'new'; // çalışanlar sadece Yeni fiş ekranını görür
  S.tab = name;
  $$('.tab').forEach((s) => s.classList.toggle('hidden', s.id !== 'tab-' + name));
  $$('.bottom button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#title').textContent = name === 'new' && S.editingId ? 'Fişi düzenle' : TITLES[name];
  window.scrollTo(0, 0);
}
$$('.bottom button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function updateNet() { $('#net').classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);
updateNet();

/* ---------------- Ortak ---------------- */
const productName = (id, fallback) => S.products.find((p) => p.id === id)?.name || fallback || '?';
const hotelName = (r) => S.hotels.find((h) => h.id === r.hotelId)?.name || r.hotelName || '?';
const filtered = () => S.receipts.filter((r) => !S.hotelFilter || r.hotelId === S.hotelFilter);

function filtersHtml() {
  return `<div class="filters">
    <label>Ay<input type="month" class="f-month" value="${S.month}"></label>
    <label>Otel<select class="f-hotel">
      <option value="">Tüm oteller</option>
      ${S.hotels.map((h) => `<option value="${h.id}" ${h.id === S.hotelFilter ? 'selected' : ''}>${esc(h.name)}${h.active === false ? ' (pasif)' : ''}</option>`).join('')}
    </select></label>
  </div>`;
}
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('f-month') && e.target.value) {
    S.month = e.target.value;
    subscribeReceipts();
  } else if (e.target.classList.contains('f-hotel')) {
    S.hotelFilter = e.target.value;
    renderList();
    renderSummary();
  }
});

/* ---------------- YENİ FİŞ ---------------- */
const totalQty = () => Object.values(S.qty).reduce((s, v) => s + (v || 0), 0);

function renderNew() {
  if (busy('#tab-new')) return later('#tab-new', renderNew);
  const sec = $('#tab-new');
  const hotels = S.hotels.filter((h) => h.active !== false || h.id === S.newHotel);
  const prods = S.products.filter((p) => p.active !== false || (S.qty[p.id] || 0) > 0);
  if (!hotels.find((h) => h.id === S.newHotel)) S.newHotel = hotels.find((h) => h.active !== false)?.id || '';

  if (!hotels.length || !prods.length) {
    sec.innerHTML = isAdmin() ? `<div class="empty">
      <p>Fiş girebilmek için önce <b>Ayarlar</b> sekmesinden en az bir <b>otel</b> ve <b>ürün</b> ekleyin.</p>
      ${!S.products.length ? '<button data-act="seed">Varsayılan 8 ürünü ekle</button>' : ''}
      <button data-act="go-settings">Ayarlara git</button>
    </div>` : `<div class="empty">
      <p>Henüz otel veya ürün tanımlanmamış. Yöneticinizden <b>Ayarlar</b> bölümünden eklemesini isteyin.</p>
    </div>`;
    return;
  }

  sec.innerHTML = `
    ${S.editingId ? `<div class="banner">Fiş düzenleniyor<button class="small" data-act="cancel-edit">Vazgeç</button></div>` : ''}
    <div class="card">
      <label>Otel<select id="n-hotel">
        ${hotels.map((h) => `<option value="${h.id}" ${h.id === S.newHotel ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
      </select></label>
      <div class="row2">
        <label>Tarih<input type="date" id="n-date" value="${S.newDate}"></label>
        <label>Fiş no<input type="text" id="n-no" inputmode="numeric" value="${esc(S.newNo)}" placeholder="0857"></label>
      </div>
    </div>
    <div class="card items">
      ${prods.map((p) => `
        <div class="item ${(S.qty[p.id] || 0) > 0 ? 'has' : ''}" data-row="${p.id}">
          <span class="name">${esc(p.name)}</span>
          <div class="stepper">
            <button type="button" data-act="dec" data-id="${p.id}" aria-label="${esc(p.name)} azalt">−</button>
            <input type="number" inputmode="numeric" min="0" step="1" data-qty="${p.id}" value="${S.qty[p.id] || ''}" placeholder="0" aria-label="${esc(p.name)} adet">
            <button type="button" data-act="inc" data-id="${p.id}" aria-label="${esc(p.name)} artır">+</button>
          </div>
        </div>`).join('')}
      ${S.editExtra.length ? `<p class="note">Silinmiş ürünler (fişte aynen korunur): ${S.editExtra.map((i) => `${esc(i.name)} ${i.qty}`).join(', ')}</p>` : ''}
    </div>
    <div class="total-line">Toplam adet: <b id="n-total">${totalQty()}</b></div>
    <button class="primary" data-act="save">${S.editingId ? 'Değişiklikleri kaydet' : 'Kaydet'}</button>
  `;
}

function setQty(id, v) {
  v = Math.max(0, Math.floor(num(v)));
  if (v) S.qty[id] = v; else delete S.qty[id];
  const inp = document.querySelector(`[data-qty="${id}"]`);
  if (inp && document.activeElement !== inp) inp.value = v || '';
  document.querySelector(`[data-row="${id}"]`)?.classList.toggle('has', v > 0);
  const t = $('#n-total'); if (t) t.textContent = totalQty();
}

$('#tab-new').addEventListener('input', (e) => {
  if (e.target.dataset.qty) setQty(e.target.dataset.qty, e.target.value);
  else if (e.target.id === 'n-no') S.newNo = e.target.value;
});
$('#tab-new').addEventListener('change', (e) => {
  if (e.target.id === 'n-hotel') S.newHotel = e.target.value;
  else if (e.target.id === 'n-date') S.newDate = e.target.value;
});
$('#tab-new').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'inc') setQty(id, (S.qty[id] || 0) + 1);
  else if (act === 'dec') setQty(id, (S.qty[id] || 0) - 1);
  else if (act === 'save') saveReceipt();
  else if (act === 'cancel-edit') { resetForm(); showTab('list'); }
  else if (act === 'seed') seedProducts();
  else if (act === 'go-settings') showTab('settings');
});

function resetForm() {
  S.qty = {}; S.editingId = null; S.editExtra = []; S.newNo = '';
  renderNew();
}

function saveReceipt() {
  if (!S.newHotel) return toast('Otel seçin.', true);
  if (!S.newDate) return toast('Tarih seçin.', true);
  const items = S.products
    .filter((p) => (S.qty[p.id] || 0) > 0)
    .map((p) => ({ productId: p.id, name: p.name, qty: S.qty[p.id] }));
  items.push(...S.editExtra);
  if (!items.length) return toast('En az bir ürün için adet girin.', true);

  const no = S.newNo.trim();
  const hotel = S.hotels.find((h) => h.id === S.newHotel);
  const data = {
    hotelId: S.newHotel, hotelName: hotel?.name || '', date: S.newDate, no, items,
    updatedAt: serverTimestamp(), by: auth.currentUser?.email || ''
  };

  if (no) {
    const dup = S.receipts.find((r) => r.id !== S.editingId && r.hotelId === data.hotelId && r.no === no);
    if (dup && !confirm(`${no} numaralı fiş bu otel için zaten kayıtlı (${fmtDate(dup.date)}). Yine de kaydedilsin mi?`)) return;
  }

  const wasEdit = !!S.editingId;
  const p = wasEdit
    ? updateDoc(doc(db, 'receipts', S.editingId), data)
    : addDoc(collection(db, 'receipts'), { ...data, createdAt: serverTimestamp() });
  p.catch(onErr); // çevrimdışıyken beklemeden devam et; internet gelince gönderilir

  toast(navigator.onLine ? 'Fiş kaydedildi' : 'Fiş kaydedildi, internet gelince gönderilecek');
  const n = parseInt(no, 10);
  S.qty = {}; S.editingId = null; S.editExtra = [];
  S.newNo = !wasEdit && /^\d+$/.test(no) ? String(n + 1).padStart(no.length, '0') : '';
  renderNew();
  if (wasEdit) showTab('list'); else showTab('new');
}

function editReceipt(id) {
  if (!isAdmin()) return;
  const r = S.receipts.find((x) => x.id === id); if (!r) return;
  S.editingId = id; S.newHotel = r.hotelId; S.newDate = r.date; S.newNo = r.no || '';
  S.qty = {}; S.editExtra = [];
  for (const it of r.items || []) {
    if (S.products.find((p) => p.id === it.productId)) S.qty[it.productId] = num(it.qty);
    else S.editExtra.push(it);
  }
  renderNew();
  showTab('new');
}

/* ---------------- FİŞ LİSTESİ ---------------- */
function renderList() {
  if (!isAdmin()) { $('#tab-list').innerHTML = ''; return; }
  if (busy('#tab-list')) return later('#tab-list', renderList);
  const rs = filtered();
  $('#tab-list').innerHTML = `
    ${filtersHtml()}
    <p class="muted" style="margin:0 4px 10px">${monthLabel(S.month)} · ${rs.length} fiş</p>
    ${rs.length ? rs.map((r) => `
      <div class="rec">
        <div class="rec-head">
          <span>${fmtDate(r.date)} · No ${esc(r.no || '—')}</span>
          ${r._pending ? '<span class="pending">gönderilmedi</span>' : ''}
        </div>
        ${!S.hotelFilter ? `<div class="rec-hotel">${esc(hotelName(r))}</div>` : ''}
        <div class="rec-items">${(r.items || []).map((i) => `${esc(productName(i.productId, i.name))} <b>${i.qty}</b>`).join(' · ')}</div>
        <div class="rec-actions">
          <button class="small" data-act="edit" data-id="${r.id}">Düzenle</button>
          ${isAdmin() ? `<button class="small danger" data-act="del" data-id="${r.id}">Sil</button>` : ''}
        </div>
      </div>`).join('') : '<div class="empty">Bu ay için fiş yok.</div>'}
  `;
}
$('#tab-list').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'edit') editReceipt(b.dataset.id);
  else if (b.dataset.act === 'del') {
    const r = S.receipts.find((x) => x.id === b.dataset.id);
    if (r && confirm(`${fmtDate(r.date)} tarihli ${r.no ? r.no + ' numaralı ' : ''}fiş silinsin mi?`)) {
      deleteDoc(doc(db, 'receipts', r.id)).catch(onErr);
      toast('Fiş silindi');
    }
  }
});

/* ---------------- ÖZET ---------------- */
function priceFor(hotelId, productId) {
  const h = S.hotels.find((x) => x.id === hotelId);
  const hp = h?.prices?.[productId];
  if (hp !== undefined && hp !== null && hp !== '') return num(hp);
  return num(S.products.find((x) => x.id === productId)?.price);
}

function computeSummary() {
  const rs = filtered();
  const map = new Map();
  for (const r of rs) {
    for (const it of r.items || []) {
      const q = num(it.qty), pr = priceFor(r.hotelId, it.productId);
      const e = map.get(it.productId) || { productId: it.productId, name: productName(it.productId, it.name), qty: 0, amount: 0, prices: new Set() };
      e.qty += q; e.amount += q * pr; e.prices.add(pr);
      map.set(it.productId, e);
    }
  }
  const idx = (id) => { const i = S.products.findIndex((p) => p.id === id); return i < 0 ? 999 : i; };
  const rows = [...map.values()].sort((a, b) => idx(a.productId) - idx(b.productId));
  rows.forEach((r) => (r.unit = r.prices.size === 1 ? [...r.prices][0] : null));
  return {
    receipts: rs,
    rows,
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
    total: round2(rows.reduce((s, r) => s + r.amount, 0))
  };
}

function renderSummary() {
  if (!isAdmin()) { $('#tab-summary').innerHTML = ''; return; }
  if (busy('#tab-summary')) return later('#tab-summary', renderSummary);
  const { receipts, rows, totalQty: tq, total } = computeSummary();
  const missingPrice = rows.some((r) => r.prices.has(0));
  $('#tab-summary').innerHTML = `
    ${filtersHtml()}
    <div class="metrics">
      <div class="metric"><div class="l">Fiş</div><div class="v">${receipts.length}</div></div>
      <div class="metric"><div class="l">Toplam adet</div><div class="v">${fmtNum(tq)}</div></div>
      <div class="metric"><div class="l">Tutar</div><div class="v">${tl(total)}</div></div>
    </div>
    <div class="card">
      ${rows.length ? `
      <table class="sum">
        <thead><tr><th>Ürün</th><th>Adet</th><th>Birim</th><th>Tutar</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.qty)}</td><td>${r.unit === null ? '<span class="muted">karışık</span>' : tl(r.unit)}</td><td>${tl(r.amount)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Toplam</td><td>${fmtNum(tq)}</td><td></td><td>${tl(total)}</td></tr></tfoot>
      </table>
      ${missingPrice ? '<p class="note">Fiyatı girilmemiş ürünler var, tutarları 0 görünüyor. Ayarlar\'dan fiyat ekleyin.</p>' : ''}
      ${!S.hotelFilter && rows.some((r) => r.unit === null) ? '<p class="note">"Karışık": oteller arasında fiyat farklı. Tutar her otelin kendi fiyatıyla hesaplandı.</p>' : ''}
      ` : '<div class="empty">Bu dönem için kayıt yok.</div>'}
    </div>
    ${rows.length ? `<div class="btns">
      <button data-act="pdf">PDF / Yazdır</button>
      <button data-act="xlsx">Excel indir</button>
    </div>
    <p class="note">PDF için açılan pencerede "PDF olarak kaydet" veya "Paylaş" seçin.</p>` : ''}
  `;
}
$('#tab-summary').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act === 'pdf') printSummary();
  else if (b.dataset.act === 'xlsx') exportExcel().catch((err) => toast(err.message, true));
});

function periodTitle() {
  const h = S.hotels.find((x) => x.id === S.hotelFilter);
  return { hotel: h ? h.name : 'Tüm oteller', period: monthLabel(S.month) };
}

function printSummary() {
  const { receipts, rows, totalQty: tq, total } = computeSummary();
  const { hotel, period } = periodTitle();
  const sorted = receipts.slice().sort((a, b) => (a.date + a.no).localeCompare(b.date + b.no));
  $('#print-area').innerHTML = `
    <h1>${esc(S.settings.businessName || 'Aylık Teslimat Özeti')}</h1>
    <p class="meta">Müşteri: <b>${esc(hotel)}</b> &nbsp;·&nbsp; Dönem: <b>${period}</b> &nbsp;·&nbsp; Fiş sayısı: <b>${receipts.length}</b></p>
    <table>
      <thead><tr><th>Ürün</th><th>Adet</th><th>Birim fiyat</th><th>Tutar</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${fmtNum(r.qty)}</td><td>${r.unit === null ? 'karışık' : tl(r.unit)}</td><td>${tl(r.amount)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>GENEL TOPLAM</td><td>${fmtNum(tq)}</td><td></td><td>${tl(total)}</td></tr></tfoot>
    </table>
    <h2>Fiş dökümü</h2>
    <table>
      <thead><tr><th>Tarih</th><th>Fiş no</th>${!S.hotelFilter ? '<th>Otel</th>' : ''}${rows.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map((rc) => `<tr><td>${fmtDate(rc.date)}</td><td>${esc(rc.no || '—')}</td>${!S.hotelFilter ? `<td>${esc(hotelName(rc))}</td>` : ''}${rows.map((r) => {
        const it = (rc.items || []).find((i) => i.productId === r.productId);
        return `<td>${it ? it.qty : ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table>
  `;
  const old = document.title;
  document.title = `${slug(hotel)}-${S.month}`;
  window.print();
  document.title = old;
}

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('Excel için internet bağlantısı gerekiyor.'));
    document.head.appendChild(s);
  });
}

async function exportExcel() {
  const XLSX = await loadXLSX();
  const { receipts, rows, totalQty: tq, total } = computeSummary();
  const { hotel, period } = periodTitle();
  const sumSheet = [
    [S.settings.businessName || 'Aylık Teslimat Özeti'],
    ['Müşteri', hotel], ['Dönem', period], ['Fiş sayısı', receipts.length], [],
    ['Ürün', 'Adet', 'Birim fiyat', 'Tutar'],
    ...rows.map((r) => [r.name, r.qty, r.unit === null ? 'karışık' : r.unit, round2(r.amount)]),
    [],
    ['GENEL TOPLAM', tq, '', total]
  ];
  const sorted = receipts.slice().sort((a, b) => (a.date + a.no).localeCompare(b.date + b.no));
  const detSheet = [
    ['Tarih', 'Fiş no', 'Otel', ...rows.map((r) => r.name)],
    ...sorted.map((rc) => [fmtDate(rc.date), rc.no || '', hotelName(rc), ...rows.map((r) => {
      const it = (rc.items || []).find((i) => i.productId === r.productId);
      return it ? num(it.qty) : '';
    })])
  ];
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(sumSheet);
  ws1['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Özet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detSheet), 'Fişler');
  XLSX.writeFile(wb, `adisyon-${slug(hotel)}-${S.month}.xlsx`);
}

/* ---------------- AYARLAR ---------------- */
function renderSettings() {
  if (!isAdmin()) { $('#tab-settings').innerHTML = ''; return; }
  if (busy('#tab-settings')) return later('#tab-settings', renderSettings);
  const priceVal = (v) => (v === undefined || v === null || v === '' ? '' : String(v).replace('.', ','));
  $('#tab-settings').innerHTML = `
    <div class="card">
      <h3>İşletme</h3>
      <label>İşletme adı (PDF ve Excel başlığında görünür)
        <input type="text" id="s-biz" value="${esc(S.settings.businessName || '')}" placeholder="Kahramanlar Unlu Mamüller">
      </label>
    </div>

    <div class="card">
      <h3>Ürünler</h3>
      <p class="note" style="margin-top:-6px">Satırdaki fiyat varsayılan fiyattır. Bir otele farklı fiyat vermek için Oteller bölümünde "Fiyatlar"a dokunun.</p>
      ${S.products.map((p, i) => `
        <div class="srow ${p.active === false ? 'inactive' : ''}" data-pid="${p.id}">
          <input type="text" class="p-name" value="${esc(p.name)}" aria-label="Ürün adı">
          <input type="text" class="p-price" inputmode="decimal" value="${p.price ? priceVal(p.price) : ''}" placeholder="Fiyat ₺" aria-label="Fiyat">
          <div class="acts">
            <label class="chk"><input type="checkbox" class="p-active" ${p.active !== false ? 'checked' : ''}>Aktif</label>
            <button class="small" data-act="p-up" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı">↑</button>
            <button class="small" data-act="p-down" ${i === S.products.length - 1 ? 'disabled' : ''} aria-label="Aşağı">↓</button>
            <button class="small danger" data-act="p-del">Sil</button>
          </div>
        </div>`).join('')}
      <div class="addrow">
        <input type="text" id="np-name" placeholder="Yeni ürün">
        <input type="text" id="np-price" inputmode="decimal" placeholder="Fiyat ₺">
        <button data-act="p-add">Ekle</button>
      </div>
      ${!S.products.length ? '<button class="link" data-act="seed">Varsayılan 8 ürünü ekle</button>' : ''}
    </div>

    <div class="card">
      <h3>Oteller</h3>
      ${S.hotels.map((h) => `
        <div class="srow ${h.active === false ? 'inactive' : ''}" data-hid="${h.id}" style="grid-template-columns:1fr">
          <input type="text" class="h-name" value="${esc(h.name)}" aria-label="Otel adı">
          <div class="acts">
            <label class="chk"><input type="checkbox" class="h-active" ${h.active !== false ? 'checked' : ''}>Aktif</label>
            <button class="small" data-act="h-prices">${S.openHotel === h.id ? 'Fiyatları kapat' : 'Fiyatlar'}</button>
            <button class="small danger" data-act="h-del">Sil</button>
          </div>
          ${S.openHotel === h.id ? `<div class="hprices">
            <p class="note" style="margin:0 0 8px">Boş bırakılan ürünlerde varsayılan fiyat kullanılır.</p>
            ${S.products.map((p) => `
              <div class="hprice"><span>${esc(p.name)}</span>
                <input type="text" class="h-price" data-pid="${p.id}" inputmode="decimal" value="${priceVal(h.prices?.[p.id])}" placeholder="${p.price ? priceVal(p.price) : 'Fiyat ₺'}">
              </div>`).join('')}
          </div>` : ''}
        </div>`).join('')}
      <div class="addrow" style="grid-template-columns:1fr auto">
        <input type="text" id="nh-name" placeholder="Yeni otel adı">
        <button data-act="h-add">Ekle</button>
      </div>
    </div>

    <div class="card">
      <h3>Kullanıcılar</h3>
      <p class="note" style="margin-top:-6px"><b>Yönetici</b>: Ayarlar'a girer, fiş siler, kullanıcı ekler. <b>Çalışan</b>: sadece yeni fiş ekler, başka ekran görmez.</p>
      ${S.users.map((u) => {
        const self = u.id === S.me;
        return `<div class="urow ${u.active === false ? 'inactive' : ''}" data-uid="${esc(u.id)}">
          <div class="uemail">${esc(u.id)}${self ? ' <span class="pending">siz</span>' : ''}</div>
          <div class="acts">
            <select class="u-role small-sel" ${self ? 'disabled' : ''} aria-label="Rol">
              <option value="staff" ${u.role !== 'admin' ? 'selected' : ''}>Çalışan</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Yönetici</option>
            </select>
            <label class="chk"><input type="checkbox" class="u-active" ${u.active !== false ? 'checked' : ''} ${self ? 'disabled' : ''}>Aktif</label>
            <button class="small" data-act="u-reset">Şifre sıfırla</button>
            ${self ? '' : '<button class="small danger" data-act="u-del">Kaldır</button>'}
          </div>
        </div>`;
      }).join('')}
      <div class="uadd">
        <p class="note" style="margin:0 0 8px"><b>Yeni kullanıcı</b></p>
        <input type="email" id="nu-email" placeholder="calisan@gmail.com" autocomplete="off" autocapitalize="off">
        <input type="text" id="nu-pass" placeholder="Şifre (en az 6 karakter)" autocomplete="off" autocapitalize="off" spellcheck="false">
        <div class="uadd-row">
          <select id="nu-role" aria-label="Rol">
            <option value="staff">Çalışan</option>
            <option value="admin">Yönetici</option>
          </select>
          <button data-act="u-add">Ekle</button>
        </div>
        <p class="err" id="nu-err"></p>
      </div>
    </div>

    <div class="card">
      <p class="muted" style="margin:0 0 10px">Giriş yapan: ${esc(auth.currentUser?.email || '')}</p>
      <button data-act="logout">Çıkış yap</button>
    </div>
  `;
}

$('#tab-settings').addEventListener('change', (e) => {
  const t = e.target;
  const pid = t.closest('[data-pid]')?.dataset.pid;
  const hid = t.closest('[data-hid]')?.dataset.hid;
  if (t.id === 's-biz') {
    setDoc(doc(db, 'settings', 'general'), { businessName: t.value.trim() }, { merge: true }).catch(onErr);
    toast('Kaydedildi');
  } else if (t.classList.contains('p-name')) {
    if (!t.value.trim()) return toast('Ürün adı boş olamaz.', true);
    updateDoc(doc(db, 'products', pid), { name: t.value.trim() }).catch(onErr);
  } else if (t.classList.contains('p-price')) {
    updateDoc(doc(db, 'products', pid), { price: round2(num(t.value)) }).catch(onErr);
    toast('Fiyat kaydedildi');
  } else if (t.classList.contains('p-active')) {
    updateDoc(doc(db, 'products', pid), { active: t.checked }).catch(onErr);
  } else if (t.classList.contains('h-name')) {
    if (!t.value.trim()) return toast('Otel adı boş olamaz.', true);
    updateDoc(doc(db, 'hotels', hid), { name: t.value.trim() }).catch(onErr);
  } else if (t.classList.contains('h-active')) {
    updateDoc(doc(db, 'hotels', hid), { active: t.checked }).catch(onErr);
  } else if (t.classList.contains('h-price')) {
    const key = `prices.${t.dataset.pid}`;
    const val = t.value.trim() === '' ? deleteField() : round2(num(t.value));
    updateDoc(doc(db, 'hotels', hid), { [key]: val }).catch(onErr);
    toast('Otel fiyatı kaydedildi');
  } else if (t.classList.contains('u-role') || t.classList.contains('u-active')) {
    const uid = t.closest('[data-uid]')?.dataset.uid;
    if (!uid || uid === S.me) return;
    const data = t.classList.contains('u-role') ? { role: t.value } : { active: t.checked };
    updateDoc(doc(db, 'users', uid), data).catch(onErr);
    toast(t.classList.contains('u-role') ? 'Rol güncellendi' : (t.checked ? 'Kullanıcı etkinleştirildi' : 'Kullanıcı devre dışı bırakıldı'));
  }
});

function createMsg(code) {
  switch (code) {
    case 'auth/invalid-email': return 'Geçersiz e-posta adresi.';
    case 'auth/weak-password': return 'Şifre en az 6 karakter olmalı.';
    case 'auth/network-request-failed': return 'İnternet bağlantısı yok.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Firebase\'de yeni hesap açma kapalı. Authentication → Settings → User actions → "Enable create (sign-up)" açık olmalı.';
    default: return 'Kullanıcı eklenemedi (' + code + ').';
  }
}

async function addUser(btn) {
  const err = $('#nu-err');
  err.textContent = '';
  const email = $('#nu-email').value.trim().toLowerCase();
  const pass = $('#nu-pass').value;
  const role = $('#nu-role').value === 'admin' ? 'admin' : 'staff';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Geçerli bir e-posta yazın.'; return; }
  if (S.users.some((u) => u.id === email)) { err.textContent = 'Bu kullanıcı zaten listede.'; return; }
  if (pass.length < 6) { err.textContent = 'Şifre en az 6 karakter olmalı.'; return; }

  btn.disabled = true; btn.textContent = 'Ekleniyor…';
  let existed = false;
  try {
    await createUserWithEmailAndPassword(secAuth(), email, pass);
    await signOut(secAuth());
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') existed = true;
    else { err.textContent = createMsg(e.code); btn.disabled = false; btn.textContent = 'Ekle'; return; }
  }
  try {
    await setDoc(doc(db, 'users', email), { email, role, active: true, createdAt: serverTimestamp(), by: S.me });
  } catch (e) {
    onErr(e); btn.disabled = false; btn.textContent = 'Ekle'; return;
  }
  btn.disabled = false; btn.textContent = 'Ekle';
  $('#nu-email').value = ''; $('#nu-pass').value = '';
  if (existed) {
    toast('Bu e-postanın hesabı zaten vardı, erişim verildi. Yazdığınız şifre geçerli değil; eski şifresini bilmiyorsa "Şifre sıfırla"ya basın.', true);
  } else {
    toast(`${email} eklendi. E-posta ve şifreyi kişiye iletin.`);
  }
}

$('#tab-settings').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act;
  const pid = b.closest('[data-pid]')?.dataset.pid;
  const hid = b.closest('[data-hid]')?.dataset.hid;

  if (act === 'p-add') {
    const name = $('#np-name').value.trim();
    if (!name) return toast('Ürün adı yazın.', true);
    const order = S.products.reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1;
    addDoc(collection(db, 'products'), { name, price: round2(num($('#np-price').value)), active: true, order }).catch(onErr);
    $('#np-name').value = ''; $('#np-price').value = '';
    toast('Ürün eklendi');
  } else if (act === 'p-up' || act === 'p-down') {
    const i = S.products.findIndex((p) => p.id === pid);
    const j = act === 'p-up' ? i - 1 : i + 1;
    if (j < 0 || j >= S.products.length) return;
    const batch = writeBatch(db);
    S.products.forEach((p, k) => {
      const want = k === i ? j : k === j ? i : k; // sırayı 0..n olarak yeniden yaz
      if (p.order !== want) batch.update(doc(db, 'products', p.id), { order: want });
    });
    batch.commit().catch(onErr);
  } else if (act === 'p-del') {
    const p = S.products.find((x) => x.id === pid);
    if (confirm(`"${p?.name}" silinsin mi?\n\nGeçmiş fişlerde adı korunur. Silmek yerine "Aktif" işaretini kaldırmanız önerilir.`)) {
      deleteDoc(doc(db, 'products', pid)).catch(onErr);
    }
  } else if (act === 'h-add') {
    const name = $('#nh-name').value.trim();
    if (!name) return toast('Otel adı yazın.', true);
    addDoc(collection(db, 'hotels'), { name, active: true, prices: {} }).catch(onErr);
    $('#nh-name').value = '';
    toast('Otel eklendi');
  } else if (act === 'h-prices') {
    S.openHotel = S.openHotel === hid ? null : hid;
    renderSettings();
  } else if (act === 'h-del') {
    const h = S.hotels.find((x) => x.id === hid);
    if (confirm(`"${h?.name}" silinsin mi?\n\nGeçmiş fişler silinmez. Silmek yerine "Aktif" işaretini kaldırmanız önerilir.`)) {
      deleteDoc(doc(db, 'hotels', hid)).catch(onErr);
    }
  } else if (act === 'seed') {
    seedProducts();
  } else if (act === 'u-add') {
    addUser(b);
  } else if (act === 'u-reset') {
    const uid = b.closest('[data-uid]')?.dataset.uid;
    if (uid && confirm(`${uid} adresine şifre sıfırlama e-postası gönderilsin mi?`)) {
      sendPasswordResetEmail(auth, uid)
        .then(() => toast('Şifre sıfırlama e-postası gönderildi'))
        .catch((e) => toast(createMsg(e.code), true));
    }
  } else if (act === 'u-del') {
    const uid = b.closest('[data-uid]')?.dataset.uid;
    if (uid && uid !== S.me && confirm(`${uid} kaldırılsın mı?\n\nBu kişi artık uygulamaya giremez. Girdiği fişler silinmez.`)) {
      deleteDoc(doc(db, 'users', uid)).catch(onErr);
      toast('Kullanıcı kaldırıldı');
    }
  } else if (act === 'logout') {
    if (confirm('Çıkış yapılsın mı?')) signOut(auth);
  }
});

function seedProducts() {
  const batch = writeBatch(db);
  DEFAULT_PRODUCTS.forEach((name, i) => {
    batch.set(doc(collection(db, 'products')), { name, price: 0, active: true, order: i });
  });
  batch.commit().catch(onErr);
  toast('Ürünler eklendi. Fiyatları Ayarlar\'dan girin.');
}

/* ---------------- Çevrimdışı çalışma ---------------- */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // Telefonda uygulama arka plandan açıldığında da yeni sürüm var mı diye bak
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((err) => console.warn('SW kaydı başarısız', err));

  // Yeni sürüm devreye girince sayfayı yenile (yarım kalmış fiş varsa bozma, sadece haber ver)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    const typing = Object.keys(S.qty).length > 0 || S.editingId
      || ['INPUT', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing) {
      toast('Uygulamanın yeni sürümü hazır. İşiniz bitince sayfayı yenileyin.');
    } else {
      reloading = true;
      location.reload();
    }
  });
}
