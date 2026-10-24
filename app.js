// ---------- Данные (в телефоне, localStorage) ----------
const $ = s => document.querySelector(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('Память переполнена'); } };
let role = localStorage.getItem('role') || '';           // 'seller' (киоск) или 'boss' (наблюдатель)
let products = load('products', [{id:1,name:'Самса',price:70,active:true},{id:2,name:'Чай',price:30,active:true},{id:3,name:'Кофе',price:80,active:true},{id:4,name:'Блин',price:50,active:true}]);
let sales = load('sales', []);   // {id,ts,items:[{id,name,price,qty}],total,pay:'cash'|'transfer'|'other'|'own',note,dirty,del}
let deliv = load('deliv', []);   // приход товара: {id,ts,day,name,qty,who,dirty,del}
let cloud = {sales: [], products: []};                   // данные из облака (только для шефа)
const save = () => { put('products', products); put('sales', sales); put('deliv', deliv); };
const D = () => role === 'boss' ? cloud : {sales, products};
// ---------- Помощники ----------
const pad = n => String(n).padStart(2, '0');
const dkey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dayOf = ts => dkey(new Date(ts));
const hm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const money = n => (n || 0).toLocaleString('ru-RU') + ' сом';
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const PAY = {cash:'💵 Наличка', transfer:'📲 Перевод', other:'✍️ Иное', own:'🍽 Свои'};
const TABS = {seller:[['sell','Продажа'],['hist','История'],['tot','Итоги'],['prod','Товары']], boss:[['tot','Итоги'],['hist','Продажи'],['prod','Настройки']]};
let tab = 'sell', cart = {}, pickedDay = null, locked = false, undoTimer = null;
const curDay = () => pickedDay || dkey(new Date());
function stats(day) {   // всё, что нужно для отчета за день
  const ss = D().sales.filter(s => !s.del && dayOf(s.ts) === day), dl = deliv.filter(x => !x.del && x.day === day);
  const m = {}, row = n => m[n] || (m[n] = {in:0, sold:0, own:0}), pay = {cash:0, transfer:0, other:0, own:0};
  ss.forEach(s => { pay[s.pay] += s.total; s.items.forEach(i => row(i.name)[s.pay === 'own' ? 'own' : 'sold'] += i.qty); });
  dl.forEach(x => row(x.name).in += x.qty);
  return {ss, dl, m, pay, rev: pay.cash + pay.transfer + pay.other, n: ss.length};
}
// ---------- Экраны ----------
function vSell() {
  const act = products.filter(p => p.active), lines = Object.keys(cart).map(id => products.find(p => p.id == id)).filter(Boolean);
  const total = lines.reduce((t, p) => t + p.price * cart[p.id], 0);
  return `<div class="grid">${act.map(p => `<button class="item" data-act="add" data-id="${p.id}">${esc(p.name)}<small>${p.price} сом</small>${cart[p.id] ? `<b class="q">${cart[p.id]}</b>` : ''}</button>`).join('')}</div>
  ${act.length ? '' : '<p class="muted">Нет товаров. Добавьте их на вкладке «Товары».</p>'}
  <div class="cart">${lines.length ? lines.map(p => `<div class="line"><span>${esc(p.name)} × ${cart[p.id]}</span><button data-act="dec" data-id="${p.id}">−</button><button data-act="add" data-id="${p.id}">+</button></div>`).join('') : '<p class="muted" style="margin:4px 0 8px">Нажмите на товар, чтобы добавить в чек</p>'}
  <div class="total"><span>Итого</span><span>${money(total)}</span></div>
  <div class="pay"><button class="cash" data-act="pay" data-p="cash">💵 Наличка</button><button class="tr" data-act="pay" data-p="transfer">📲 Перевод</button>
  <button class="oth" data-act="pay" data-p="other">✍️ Иное</button><button class="own" data-act="pay" data-p="own">🍽 Свои (съели)</button></div>
  ${lines.length ? '<button data-act="clear" style="width:100%;margin-top:10px;min-height:44px">Очистить чек</button>' : ''}</div>`;
}
const dateBox = () => `<input type="date" id="dpick" value="${curDay()}" max="${dkey(new Date())}" style="margin-bottom:12px">`;
function vHist() {
  const list = stats(curDay()).ss.slice().sort((a, b) => b.ts - a.ts), ed = role === 'seller';
  return `<h2>${ed ? 'История' : 'Продажи'}</h2>${dateBox()}` + (list.length ? list.map(s => `<div class="row ${s.pay === 'cash' ? 'cash-r' : s.pay === 'transfer' ? 'tr-r' : ''}"><div class="top"><span>${hm(s.ts)} · ${PAY[s.pay]}</span><span>${s.pay === 'own' ? '' : money(s.total)}</span></div>
    <div class="muted">${s.items.map(i => esc(i.name) + ' × ' + i.qty).join(', ')}${s.note ? ' — «' + esc(s.note) + '»' : ''}</div>
    ${ed ? `<div class="acts">${s.pay === 'cash' || s.pay === 'transfer' ? `<button data-act="swap" data-id="${s.id}">Сменить способ</button>` : ''}<button data-act="del" data-id="${s.id}" style="color:var(--bad);border-color:var(--bad)">Удалить</button></div>` : ''}</div>`).join('') : '<p class="muted">За этот день продаж нет.</p>');
}
function vTot() {
  const st = stats(curDay()), names = Object.keys(st.m), prods = D().products.filter(p => p.active).map(p => p.name);
  if (!prods.length) prods.push('Самса');
  return `<h2>Итоги дня</h2>${dateBox()}<div class="big"><div class="wide">Выручка<b>${money(st.rev)}</b></div>
    <div>💵 Наличка<b>${money(st.pay.cash)}</b></div><div>📲 Перевод<b>${money(st.pay.transfer)}</b></div>
    ${st.pay.other ? `<div class="wide">✍️ Иное<b>${money(st.pay.other)}</b></div>` : ''}<div class="wide">Продаж: <b style="display:inline">${st.n}</b></div></div>
  <h2>Товар за день</h2>${names.map(n => { const r = st.m[n]; return `<div class="row"><div class="top"><span>${esc(n)}</span><span>остаток ${r.in - r.sold - r.own}</span></div><div class="muted">принято ${r.in} · продано ${r.sold} · съели ${r.own}</div></div>`; }).join('') || '<p class="muted">Пока ничего.</p>'}
  <h2>Принять товар</h2><div class="prow" style="grid-template-columns:1fr 90px"><select id="dn">${prods.map(n => `<option>${esc(n)}</option>`).join('')}</select><input id="dq" type="number" inputmode="numeric" min="1" placeholder="Шт"></div>
  <button data-act="deliv" style="width:100%">Добавить приход</button>
  ${st.dl.map(x => `<div class="row" style="margin-top:8px"><div class="top"><span>${esc(x.name)} +${x.qty}</span><span class="muted">${x.who === 'boss' ? 'шеф' : 'киоск'}</span></div><div class="acts"><button data-act="deldel" data-id="${x.id}">Удалить</button></div></div>`).join('')}`;
}
const statusText = () => {
  const c = cfg(); if (!c.url || !c.key) return 'Облако не настроено';
  const n = [...sales, ...deliv].filter(s => s.dirty).length;
  return (syncErr ? '⚠️ ' + syncErr : n ? 'Ждут отправки: ' + n : '✅ Синхронизировано') + (updated ? ' · ' + updated : '');
};
const vCloud = () => { const c = cfg(); return `<h2 style="margin-top:20px">Облако (Google Таблица)</h2><div class="stack">
  <input data-c="url" placeholder="Ссылка облака" value="${esc(c.url || '')}"><input data-c="key" placeholder="${role === 'boss' ? 'Ключ шефа' : 'Ключ продавщицы'}" value="${esc(c.key || '')}">
  <p class="muted" id="cstat" style="margin:0">${statusText()}</p><button data-act="syncnow">Обновить сейчас</button><button data-act="role">Сменить роль</button></div>`; };
function vProd() {
  if (role === 'boss') return '<h2>Настройки</h2>' + vCloud();
  return `<h2>Товары</h2>${products.map(p => `<div class="prow"><input data-f="name" data-id="${p.id}" value="${esc(p.name)}" ${p.active ? '' : 'style="opacity:.5"'}><input data-f="price" data-id="${p.id}" type="number" inputmode="numeric" min="0" value="${p.price}"><button data-act="hide" data-id="${p.id}">${p.active ? '👁' : '🚫'}</button></div>`).join('')}
  <button data-act="newp" style="width:100%">+ Добавить товар</button><p class="muted">Изменение цены не меняет уже записанные продажи.</p>${vCloud()}
  <h2 style="margin-top:20px">Резервная копия</h2><div class="stack"><button data-act="export">Сохранить копию (файл)</button><button data-act="import">Загрузить копию из файла</button><button data-act="csv">Скачать продажи в CSV (Excel)</button></div><input type="file" id="file" accept="application/json" hidden>`;
}
function render() {
  const m = $('#main'), nav = $('#nav');
  if (!role) { nav.innerHTML = ''; m.innerHTML = '<h2>Кто вы?</h2><div class="stack"><button class="roleb" data-act="setrole" data-id="seller">🏪 Киоск (продавщица)</button><button class="roleb" data-act="setrole" data-id="boss">👁 Наблюдатель (шеф)</button></div>'; return; }
  const tabs = TABS[role]; if (!tabs.some(t => t[0] === tab)) tab = tabs[0][0];
  nav.innerHTML = tabs.map(t => `<button data-tab="${t[0]}" class="${t[0] === tab ? 'on' : ''}">${t[1]}</button>`).join('');
  const y = m.scrollTop; m.innerHTML = {sell:vSell, hist:vHist, tot:vTot, prod:vProd}[tab](); m.scrollTop = y;
}
// ---------- Действия ----------
function toast(text, undoId) {
  const t = $('#toast'); clearTimeout(undoTimer);
  t.innerHTML = `<span>${text}</span>${undoId ? '<button data-act="undo" data-id="' + undoId + '">Отменить</button>' : ''}`;
  t.hidden = false; undoTimer = setTimeout(() => t.hidden = true, 6000);
}
function finish(pay) {
  const items = Object.keys(cart).map(id => { const p = products.find(x => x.id == id); return {id:p.id, name:p.name, price:p.price, qty:cart[id]}; });
  if (!items.length || locked) return;
  let note = '';
  if (pay === 'other') { note = (prompt('Что за оплата? Коротко') || '').trim(); if (!note) return; }
  locked = true; setTimeout(() => locked = false, 700);   // защита от двойного нажатия
  const total = items.reduce((t, i) => t + i.price * i.qty, 0);
  const sale = {id: Date.now() + '' + Math.floor(Math.random() * 1000), ts: Date.now(), items, total, pay, note, dirty: true};
  sales.push(sale); save(); cart = {}; render();
  toast(pay === 'own' ? 'Записано: съели свои' : `Записано: ${money(total)}, ${PAY[pay].slice(3).toLowerCase()}`, sale.id);
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
const mark = (arr, id, f) => { const s = arr.find(x => x.id === id); if (s) { f(s); s.dirty = true; } save(); };
const actions = {
  add: id => { cart[id] = (cart[id] || 0) + 1; },
  dec: id => { if (--cart[id] <= 0) delete cart[id]; },
  clear: () => { cart = {}; },
  pay: (id, el) => finish(el.dataset.p),
  undo: id => { mark(sales, id, s => s.del = true); $('#toast').hidden = true; },
  swap: id => mark(sales, id, s => s.pay = s.pay === 'cash' ? 'transfer' : 'cash'),
  del: id => { if (confirm('Удалить эту продажу?')) mark(sales, id, s => s.del = true); },
  deldel: id => { if (confirm('Удалить этот приход?')) mark(deliv, id, s => s.del = true); },
  deliv: () => {
    const qty = parseInt($('#dq').value, 10); if (!(qty > 0)) { alert('Укажите количество'); return; }
    deliv.push({id: Date.now() + '' + Math.floor(Math.random() * 1000), ts: Date.now(), day: curDay(), name: $('#dn').value, qty, who: role, dirty: true});
    save(); toast('Приход записан');
  },
  hide: id => { const p = products.find(x => x.id == id); p.active = !p.active; if (!p.active) delete cart[id]; save(); },
  newp: () => { const name = prompt('Название товара'); if (!name) return; const price = parseInt(prompt('Цена, сом'), 10);
    products.push({id: Date.now(), name: name.trim(), price: price >= 0 ? price : 0, active: true}); save(); },
  setrole: id => { role = id; localStorage.setItem('role', id); tab = id === 'boss' ? 'tot' : 'sell'; pickedDay = null; syncErr = ''; updated = ''; },
  role: () => { if (confirm('Сменить роль?')) { role = ''; localStorage.removeItem('role'); } },
  syncnow: () => {},
  export: () => download('kiosk-backup-' + dkey(new Date()) + '.json', JSON.stringify({products, sales, deliv}), 'application/json'),
  import: () => $('#file').click(),
  csv: () => {
    const q = v => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [['Дата','Время','Товары','Сумма','Оплата','Заметка']].concat(sales.filter(s => !s.del).sort((a, b) => a.ts - b.ts).map(s =>
      [dayOf(s.ts).split('-').reverse().join('.'), hm(s.ts), s.items.map(i => i.name + ' x' + i.qty).join(', '), s.pay === 'own' ? 0 : s.total, PAY[s.pay].slice(3).toLowerCase(), s.note || '']));
    download('prodazhi.csv', '\uFEFF' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }
};
document.addEventListener('click', e => {
  const tb = e.target.closest('nav button');
  if (tb) { tab = tb.dataset.tab; pickedDay = null; render(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  actions[el.dataset.act](el.dataset.id, el); render(); sync();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dpick') { pickedDay = t.value || null; render(); }
  else if (t.id === 'file') {
    const f = t.files[0]; if (!f) return;
    f.text().then(txt => { try { const d = JSON.parse(txt); if (!Array.isArray(d.products) || !Array.isArray(d.sales)) throw 0;
      if (confirm('Заменить все текущие данные копией из файла?')) { products = d.products; sales = d.sales.map(s => ({...s, dirty: true})); deliv = (d.deliv || []).map(s => ({...s, dirty: true})); save(); render(); }
    } catch (err) { alert('Это не файл резервной копии'); } });
  } else if (t.dataset.c) {
    const c = cfg(); c[t.dataset.c] = t.value.trim(); put('cloud_' + role, c); syncErr = ''; sync();
  } else if (t.dataset.f) {
    const p = products.find(x => x.id == t.dataset.id);
    if (t.dataset.f === 'name') p.name = t.value.trim() || p.name; else p.price = Math.max(0, parseInt(t.value, 10) || 0);
    save();
  }
});
// ---------- Облако (Google Таблица) ----------
const cfg = () => load('cloud_' + role, {url: '', key: ''});
let syncing = false, syncErr = '', updated = '', lastP = '', tick = 0;
async function sync() {
  const c = cfg();
  if (!role || !c.url || !c.key || syncing || !navigator.onLine) { const el = $('#cstat'); if (el) el.textContent = statusText(); return; }
  syncing = true;
  try {
    const ps = role === 'seller' ? sales.filter(s => s.dirty) : [], pd = deliv.filter(x => x.dirty), pj = JSON.stringify(products);
    const snap = [...ps, ...pd].map(x => JSON.stringify(x));
    if (ps.length || pd.length || (role === 'seller' && pj !== lastP)) {
      const r = await fetch(c.url, {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify({key: c.key, sales: ps, deliv: pd, products: role === 'seller' ? products : undefined})});
      const j = await r.json(); if (!j.ok) throw new Error(j.error === 'key' ? 'Неверный ключ' : 'Ошибка облака');
      [...ps, ...pd].forEach((x, i) => { if (JSON.stringify(x) === snap[i]) delete x.dirty; });   // если запись успели изменить, отправим снова
      lastP = pj; save();
    }
    const r2 = await fetch(c.url + (c.url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(c.key)), j2 = await r2.json();
    if (!j2.ok) throw new Error(j2.error === 'key' ? 'Неверный ключ' : 'Ошибка облака');
    (j2.deliveries || []).forEach(x => { const l = deliv.find(y => y.id === x.id); if (!l) deliv.push(x); else if (!l.dirty) Object.assign(l, x); });
    if (role === 'boss') { cloud.sales = j2.sales || []; cloud.products = j2.products || []; }
    save(); syncErr = ''; updated = hm(Date.now());
  } catch (e) { syncErr = /ключ|облака/.test(e.message) ? e.message : 'Нет связи, отправим позже'; }
  syncing = false;
  const el = $('#cstat'); if (el) el.textContent = statusText();
  if (!/INPUT|SELECT/.test(document.activeElement.tagName)) render();
}
if (!localStorage.getItem('v2')) { sales.forEach(s => s.dirty = true); save(); localStorage.setItem('v2', '1'); }   // старые продажи тоже уйдут в облако
setInterval(() => { if (role === 'boss' || ++tick % 2 === 0) sync(); }, 30000); addEventListener('online', sync);
render(); sync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
