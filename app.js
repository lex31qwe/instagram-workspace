const cfg = window.INSTA_CONFIG || {};
const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('YOUR_') && !cfg.SUPABASE_ANON_KEY.includes('YOUR_'));
const supabase = configured && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const state = { user: null, demo: !configured, media: [], links: [], queue: [], accounts: [], history: [], selectedQueueId: null, route: 'dashboard', autoRefresh: true, theme: localStorage.getItem('ig-theme') || 'dark' };
const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = (value) => value ? new Intl.DateTimeFormat('tr-TR', {dateStyle:'short', timeStyle:'short'}).format(new Date(value)) : '—';
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function toast(message, type = 'info') {
  const el = document.createElement('div'); el.className = `toast ${type === 'error' ? 'error' : ''}`; el.textContent = message; $('toast-region').append(el); setTimeout(() => el.remove(), 4200);
}
function log(message, level = 'info') { console[level === 'error' ? 'error' : 'log'](message); }
function setVisible(authenticated) { $('auth-view').classList.toggle('hidden', authenticated); $('app-view').classList.toggle('hidden', !authenticated); }
function routeTitle(route) { return ({dashboard:'Kontrol Paneli', media:'Medya & Linkler', queue:'Yayın Kuyruğu', accounts:'Instagram Hesapları', history:'Geçmiş & Loglar', settings:'Ayarlar'})[route] || 'Kontrol Paneli'; }
function navigate(route) {
  state.route = route; history.replaceState({}, '', `#${route}`); document.querySelectorAll('.view').forEach(v => v.classList.toggle('active-view', v.id === `view-${route}`));
  document.querySelectorAll('[data-route]').forEach(btn => btn.classList.toggle('active', btn.dataset.route === route)); $('page-title').textContent = routeTitle(route);
  if (route === 'dashboard') updateDashboard(); if (route === 'queue') renderQueue(); if (route === 'history') renderHistory();
}
function applyTheme() { document.documentElement.dataset.theme = state.theme; document.documentElement.style.colorScheme = state.theme; $('dark-mode-toggle').checked = state.theme === 'dark'; localStorage.setItem('ig-theme', state.theme); }
function demoData() {
  state.accounts = [{key:'demo', label:'Demo Instagram', instagram_user_id:'—'}];
  state.media = [{id:'demo-media', file_name:'ornek-reel.mp4', source_url:'', public_url:'', status:'ready', size_bytes:0, created_at:new Date().toISOString()}];
  state.history = [{id:'demo-log', level:'info', message:'Demo modunda çalışıyor. Supabase config.js eklenince gerçek veriler yüklenir.', created_at:new Date().toISOString(), status:'info'}];
}
async function boot() {
  applyTheme();
  if (!configured) { demoData(); setVisible(true); $('connection-label').textContent = 'Demo mod · config.js bekleniyor'; toast('Demo görünümü açık. README adımlarından config.js oluşturun.'); refreshAll(); return; }
  supabase.auth.onAuthStateChange((_event, session) => { state.user = session?.user || null; setVisible(Boolean(state.user)); if (state.user) refreshAll(); });
  const {data:{session}} = await supabase.auth.getSession(); state.user = session?.user || null; setVisible(Boolean(state.user)); if (state.user) refreshAll();
}
async function signIn(event) { event.preventDefault(); if (!supabase) { toast('Supabase bağlantısı kurulmamış; config.js dosyasını oluşturun.', 'error'); return; } const email = $('auth-email').value.trim(), password = $('auth-password').value; const {error} = await supabase.auth.signInWithPassword({email,password}); if (error) toast(error.message, 'error'); }
async function signOut() { if (supabase) await supabase.auth.signOut(); state.user = null; setVisible(false); }
async function refreshAll() {
  await Promise.all([loadMedia(), loadQueue(), loadAccounts(), loadHistory()]);
  if (supabase) {
    const pendingUrls = state.media.filter(item => item.status === 'queued' && item.source_url).map(item => item.source_url);
    if (pendingUrls.length) await supabase.from('link_queue').update({status:'queued', error_message:null}).in('url', pendingUrls).eq('status','failed').ilike('error_message','%Bekleyen medya kaydı%');
  }
  await loadLinks(); updateDashboard(); fillAccounts();
}
async function selectRows(table, order = 'created_at') { if (!supabase) return []; const {data,error} = await supabase.from(table).select('*').order(order, {ascending:false}); if (error) { log(error.message, 'error'); toast(`${table} yüklenemedi: ${error.message}`, 'error'); return []; } return data || []; }
async function loadMedia() { if (state.demo) return; state.media = await selectRows('media_assets'); renderMedia(); }
async function loadLinks() { if (state.demo) return; state.links = await selectRows('link_queue'); }
async function loadQueue() { if (state.demo) return; state.queue = await selectRows('publish_queue'); renderQueue(); }
async function loadAccounts() {
  if (state.demo) { renderAccounts(); return; }
  const {data,error} = await supabase.functions.invoke(cfg.EDGE_FUNCTION_NAME || 'instagram', {body:{action:'accounts'}});
  if (error) { toast(`Hesaplar alınamadı: ${error.message}`, 'error'); return; }
  state.accounts = data?.accounts || []; renderAccounts(); fillAccounts();
}
async function loadHistory() { if (state.demo) { renderHistory(); return; } state.history = await selectRows('publish_logs'); renderHistory(); }
function updateDashboard() {
  const queued = state.queue.filter(x => ['queued','bekliyor'].includes(x.status)).length;
  const processing = state.queue.filter(x => ['processing','publishing','uploaded'].includes(x.status)).length;
  const published = state.queue.filter(x => ['published','tamamlandı'].includes(x.status)).length;
  const failed = state.queue.filter(x => ['failed','hata'].includes(x.status)).length;
  $('stat-queued').textContent = queued; $('stat-processing').textContent = processing; $('stat-published').textContent = published; $('stat-failed').textContent = failed;
  const activity = state.history.slice(0,5); $('dashboard-activity').innerHTML = activity.length ? activity.map(item => `<div class="activity"><span class="activity-icon">${item.level === 'error' ? '!' : '✓'}</span><div><b>${esc(item.message || item.status || 'İşlem')}</b><small>${fmtDate(item.created_at)}</small></div></div>`).join('') : '<div class="empty-state">Henüz yayın hareketi yok.</div>';
}
function mediaUrl(item) {
  if (!item) return '';
  if (String(item.public_url || '').startsWith('pending://')) return '';
  return item.public_url || (String(item.source_url || '').startsWith('https://res.cloudinary.com/') ? item.source_url : '');
}
function renderMedia() {
  const query = ($('media-search')?.value || '').toLowerCase(); const filter = $('media-filter')?.value || 'all';
  const items = state.media.filter(item => (!query || item.file_name.toLowerCase().includes(query)) && (filter === 'all' || (filter === 'uploaded' && item.status === 'ready') || item.status === filter));
  $('media-grid').innerHTML = items.length ? items.map(item => { const url = mediaUrl(item); return `<article class="media-card" data-media-id="${esc(item.id)}"><input class="media-check" type="checkbox" data-media-check="${esc(item.id)}"><div class="media-thumb">${url ? `<video src="${esc(url)}" muted preload="metadata"></video>` : '<span class="play">▶</span>'}</div><div class="media-info"><b title="${esc(item.file_name)}">${esc(item.file_name)}</b><small>${item.size_bytes ? `${(item.size_bytes/1024/1024).toFixed(1)} MB` : 'Demo medya'} · ${esc(item.status || 'hazır')}</small><button class="text-button add-to-queue" data-media-id="${esc(item.id)}">Kuyruğa al →</button></div></article>`; }).join('') : '<div class="empty-state">Filtreye uygun medya yok.</div>';
  document.querySelectorAll('.add-to-queue').forEach(btn => btn.addEventListener('click', () => addToQueue(btn.dataset.mediaId)));
}
async function addToQueue(mediaId) {
  const media = state.media.find(x => x.id === mediaId); if (!media) return;
  if (state.queue.some(x => x.media_id === mediaId && !['published','failed'].includes(x.status))) { toast('Bu medya zaten kuyrukta.'); navigate('queue'); return; }
  const item = {id:uid(), media_id:mediaId, file_name:media.file_name, caption:'', account_key:'', status:'queued', created_at:new Date().toISOString()};
  if (supabase) { const {data,error} = await supabase.from('publish_queue').insert({media_id:mediaId,caption:'',status:'queued'}).select().single(); if (error) { toast(error.message, 'error'); return; } Object.assign(item,data); }
  state.queue.unshift(item); state.selectedQueueId = item.id; renderQueue(); updateDashboard(); navigate('queue'); toast('Medya yayın kuyruğuna alındı.');
}
function renderQueue() {
  const items = state.queue; $('queue-list').innerHTML = items.length ? items.map(item => { const media = state.media.find(m => m.id === item.media_id); const displayStatus = media && !mediaUrl(media) ? 'İndirme bekleniyor' : (item.status || 'queued'); return `<article class="queue-item ${state.selectedQueueId === item.id ? 'selected' : ''}"><div class="queue-thumb">${media && mediaUrl(media) ? `<video src="${esc(mediaUrl(media))}" muted preload="metadata"></video>` : '▶'}</div><div><b>${esc(item.file_name || media?.file_name || 'Video')}</b><small>${esc(displayStatus)} · ${fmtDate(item.created_at)}</small></div><button class="${state.selectedQueueId === item.id ? 'primary' : 'ghost'} small select-queue" data-queue-id="${esc(item.id)}">${state.selectedQueueId === item.id ? 'Seçildi' : 'Seç'}</button><button class="danger small delete-queue" data-queue-id="${esc(item.id)}">Sil</button></article>`; }).join('') : '<div class="empty-state">Kuyruk boş. Medya merkezinden video ekleyin.</div>';
  document.querySelectorAll('.select-queue').forEach(btn => btn.addEventListener('click', () => { state.selectedQueueId = btn.dataset.queueId; const item = state.queue.find(x => x.id === state.selectedQueueId); $('caption-input').value = item?.caption || ''; updateCaptionCounter(); renderQueue(); }));
  document.querySelectorAll('.delete-queue').forEach(btn => btn.addEventListener('click', () => deleteQueueItem(btn.dataset.queueId)));
  const selected = state.queue.find(x => x.id === state.selectedQueueId); $('caption-input').value = selected?.caption || $('caption-input').value || ''; updateCaptionCounter();
}
async function deleteQueueItem(queueId) {
  const item = state.queue.find(x => x.id === queueId); if (!item) return;
  const media = state.media.find(x => x.id === item.media_id);
  if (!window.confirm('Bu video yayın kuyruğundan silinsin mi? Bu işlem geri alınamaz.')) return;
  if (supabase && media?.cloudinary_public_id) {
    const {data, error} = await supabase.functions.invoke(cfg.EDGE_FUNCTION_NAME || 'instagram', {body:{action:'delete_media',cloudinary_public_id:media.cloudinary_public_id}});
    if (error || data?.error) return toast(data?.error || error?.message || 'Cloudinary videosu silinemedi.', 'error');
  }
  if (supabase) {
    const {error} = await supabase.from('publish_queue').delete().eq('id', queueId);
    if (error) return toast(`Kuyruk kaydı silinemedi: ${error.message}`, 'error');
    if (media && state.queue.filter(x => x.media_id === media.id).length === 1) {
      await supabase.from('media_assets').delete().eq('id', media.id);
      if (media.source_url) await supabase.from('link_queue').delete().eq('url', media.source_url);
    }
  }
  state.queue = state.queue.filter(x => x.id !== queueId); state.media = state.media.filter(x => !media || x.id !== media.id); if (state.selectedQueueId === queueId) state.selectedQueueId = null;
  renderQueue(); renderMedia(); updateDashboard(); toast('Video yayın kuyruğundan silindi.');
}
function fillAccounts() { $('target-account').innerHTML = '<option value="">Hesap seçin</option>' + state.accounts.map(a => `<option value="${esc(a.key || a.label)}">${esc(a.label)}</option>`).join(''); }
function renderAccounts() { $('accounts-list').innerHTML = state.accounts.length ? state.accounts.map(a => `<article class="account-card"><span class="account-avatar">◎</span><div><b>${esc(a.label)}</b><small>Business ID: ${esc(a.instagram_user_id || 'gizli')}</small><small><span class="status-dot ok"></span> Edge Function bağlı</small></div></article>`).join('') : '<div class="empty-state">Henüz hesap bilgisi bağlanmadı.</div>'; }
function renderHistory() { const filter = $('history-filter')?.value || 'all'; const items = state.history.filter(x => filter === 'all' || x.status === filter || x.level === filter); $('history-list').innerHTML = items.length ? items.map(item => `<article class="history-item"><span class="status-dot ${item.level === 'error' || item.status === 'failed' ? 'error' : 'ok'}"></span><div><b>${esc(item.message || item.error_message || item.status || 'İşlem')}</b><small>${fmtDate(item.created_at)} ${item.account_key ? `· ${esc(item.account_key)}` : ''}</small></div><small>${esc(item.status || item.level || '')}</small></article>`).join('') : '<div class="empty-state">Bu filtrede kayıt yok.</div>'; }
function updateCaptionCounter() { $('caption-counter').textContent = `${$('caption-input').value.length} / 2200`; }
async function addLinks() {
  const urls = $('link-input').value.split(/\n+/).map(x => x.trim()).filter(Boolean); if (!urls.length) return toast('En az bir link girin.', 'error');
  const valid = [...new Set(urls.filter(url => /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\//i.test(url)))]; if (!valid.length) return toast('Instagram reel, post veya video linki bulunamadı.', 'error');
  if (supabase) {
    // Schema uses UNIQUE(owner_id, url); owner_id is filled by auth.uid().
    const {error} = await supabase.from('link_queue').upsert(valid.map(url => ({url,status:'queued',error_message:null})), {onConflict:'owner_id,url'});
    if (error) return toast(error.message, 'error');
    await loadLinks();
    // Create an immediate placeholder in the publish queue. The worker later
    // replaces the pending URL with the Cloudinary HTTPS video URL.
    for (const url of valid) {
      const {data: existing} = await supabase.from('media_assets').select('id').eq('source_url', url).maybeSingle();
      if (existing?.id) continue;
      const {data: media, error: mediaError} = await supabase.from('media_assets').insert({
        file_name: `Instagram linki · ${(() => { try { return new URL(url).pathname.split('/').filter(Boolean).pop() || 'video'; } catch { return 'video'; } })()}`,
        public_url: `pending://${encodeURIComponent(url)}`,
        source_url: url,
        mime_type: 'video/mp4',
        status: 'queued'
      }).select().single();
      if (mediaError) return toast(`Link yayın kuyruğuna alınamadı: ${mediaError.message}`, 'error');
      const {data: queued, error: queueError} = await supabase.from('publish_queue').insert({media_id: media.id, caption:'', status:'queued'}).select().single();
      if (queueError) return toast(`Yayın kuyruğu kaydı oluşturulamadı: ${queueError.message}`, 'error');
      state.media.unshift(media); state.queue.unshift({...queued, file_name: media.file_name});
    }
    renderMedia(); renderQueue(); updateDashboard();
  } else state.links.unshift(...valid.map(url => ({id:uid(),url,status:'queued',created_at:new Date().toISOString()})));
  $('link-input').value = ''; toast(`${valid.length} link yayın kuyruğuna alındı. Worker başlatılınca Cloudinary’ye indirilecek.`); updateDashboard(); navigate('queue');
}
function handleFile(file) { if (!file) return; if (!file.type.startsWith('video/')) return toast('Lütfen video dosyası seçin.', 'error'); uploadVideo(file); }
function uploadVideo(file) {
  if (!cfg.CLOUDINARY_CLOUD_NAME || cfg.CLOUDINARY_CLOUD_NAME.includes('YOUR_')) return toast('Cloudinary ayarları config.js içinde tamamlanmamış.', 'error');
  $('upload-progress').classList.remove('hidden'); $('upload-name').textContent = file.name; $('upload-percent').textContent = '0%'; $('upload-bar').style.width = '0%';
  const xhr = new XMLHttpRequest(); xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.CLOUDINARY_CLOUD_NAME)}/video/upload`); xhr.upload.onprogress = e => { if (e.lengthComputable) { const pct = Math.round(e.loaded/e.total*100); $('upload-percent').textContent = `${pct}%`; $('upload-bar').style.width = `${pct}%`; } }; xhr.onload = async () => { try { const body = JSON.parse(xhr.responseText); if (xhr.status >= 400 || !body.secure_url) throw new Error(body.error?.message || 'Cloudinary yüklemesi başarısız.'); const item = {file_name:file.name,public_url:body.secure_url,source_url:body.secure_url,cloudinary_public_id:body.public_id,mime_type:file.type,size_bytes:file.size,status:'ready'}; if (supabase) { const {data,error} = await supabase.from('media_assets').insert(item).select().single(); if (error) throw error; Object.assign(item,data); } else { item.id=uid(); item.created_at=new Date().toISOString(); } state.media.unshift(item); renderMedia(); updateDashboard(); $('upload-progress').classList.add('hidden'); toast('Video Cloudinary’ye yüklendi.'); } catch (e) { $('upload-progress').classList.add('hidden'); toast(e.message, 'error'); } }; xhr.onerror = () => { $('upload-progress').classList.add('hidden'); toast('Ağ hatası: video yüklenemedi.', 'error'); }; const form = new FormData(); form.append('file', file); form.append('upload_preset', cfg.CLOUDINARY_UPLOAD_PRESET); xhr.send(form);
}
async function publishSelected() {
  const item = state.queue.find(x => x.id === state.selectedQueueId), account = $('target-account').value, caption = $('caption-input').value.trim();
  if (!item) return toast('Önce kuyruktan bir medya seçin.', 'error'); if (!account) return toast('Hedef Instagram hesabını seçin.', 'error'); const media = state.media.find(x => x.id === item.media_id); if (!media || !mediaUrl(media)) return toast('Video henüz Cloudinary’ye yüklenmedi. Cloud worker yaklaşık 5 dakikada bir çalışır; biraz sonra Yenile yapın.', 'error');
  item.caption=caption; item.account_key=account; item.status='processing'; renderQueue(); updateDashboard(); $('queue-status-title').textContent='Instagram işliyor'; $('queue-status-detail').textContent='Container oluşturuluyor ve işlenmesi bekleniyor.';
  if (supabase) await supabase.from('publish_queue').update({caption,account_key:account,status:'processing'}).eq('id',item.id);
  if (state.demo) { setTimeout(() => { item.status='published'; state.history.unshift({id:uid(),message:'Demo yayın başarılı',status:'published',created_at:new Date().toISOString()}); renderQueue(); renderHistory(); updateDashboard(); $('queue-status-title').textContent='Demo yayın başarılı'; toast('Demo modunda yayın simüle edildi.'); }, 1000); return; }
  const {data,error} = await supabase.functions.invoke(cfg.EDGE_FUNCTION_NAME || 'instagram', {body:{action:'publish',account_key:account,media_url:mediaUrl(media),caption,queue_id:item.id,cloudinary_public_id:media.cloudinary_public_id || null}});
  if (error || data?.error) {
    item.status='failed'; let msg=data?.error || '';
    if (!msg && error?.context?.json) { try { const body=await error.context.json(); msg=body?.error || body?.message || ''; } catch (_) {} }
    msg=msg || error?.message || 'Yayın başarısız.';
    $('queue-status-title').textContent='Yayın başarısız'; $('queue-status-detail').textContent=msg; toast(msg,'error'); await writeLog(msg,'error',item.id);
  } else { item.status='published'; $('queue-status-title').textContent='Yayın başarılı'; $('queue-status-detail').textContent=`Instagram medya ID: ${data.instagram_media_id || 'hazır'}`; toast('Instagram yayını başarılı.'); await writeLog('Instagram yayını başarılı.','info',item.id); }
  await loadQueue(); await loadHistory(); updateDashboard();
}
async function writeLog(message, level='info', queueId=null) { if (supabase) await supabase.from('publish_logs').insert({message,level,queue_id:queueId,status:level === 'error' ? 'failed' : 'info'}); else state.history.unshift({id:uid(),message,level,created_at:new Date().toISOString(),status:level}); renderHistory(); }
async function retryFailed() { const failed = state.queue.filter(x => x.status === 'failed'); if (!failed.length) return toast('Yeniden denenecek hatalı yayın yok.'); if (supabase) await supabase.from('publish_queue').update({status:'queued',error_message:null}).eq('status','failed'); state.queue.forEach(x => {if(x.status==='failed')x.status='queued'}); renderQueue(); updateDashboard(); toast(`${failed.length} kayıt yeniden kuyruğa alındı.`); }
function saveTemplate() { localStorage.setItem('ig-caption-template',$('caption-input').value); toast('Açıklama şablonu kaydedildi.'); }
function loadTemplate() { $('caption-input').value=localStorage.getItem('ig-caption-template') || ''; updateCaptionCounter(); }
function setup() {
  document.querySelectorAll('[data-route]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.route)));
  $('auth-form').addEventListener('submit', signIn); $('logout-btn').addEventListener('click', signOut); $('logout-btn-settings').addEventListener('click', signOut); $('theme-toggle').addEventListener('click', () => {state.theme=state.theme==='dark'?'light':'dark';applyTheme();}); $('dark-mode-toggle').addEventListener('change', e => {state.theme=e.target.checked?'dark':'light';applyTheme();});
  $('video-input').addEventListener('change', e => handleFile(e.target.files[0])); $('video-input-secondary').addEventListener('change', e => handleFile(e.target.files[0])); $('add-links-btn').addEventListener('click', addLinks); $('clear-links-btn').addEventListener('click', () => $('link-input').value=''); $('media-search').addEventListener('input',renderMedia); $('media-filter').addEventListener('change',renderMedia); $('publish-selected-btn').addEventListener('click', publishSelected); $('caption-input').addEventListener('input', updateCaptionCounter); $('target-account').addEventListener('change', () => { const item=state.queue.find(x=>x.id===state.selectedQueueId); if(item)item.account_key=$('target-account').value; }); $('refresh-accounts-btn').addEventListener('click',loadAccounts); $('test-accounts-btn').addEventListener('click', async()=>{await loadAccounts();toast('Hesap bağlantısı yenilendi.');}); $('history-filter').addEventListener('change',renderHistory); $('retry-failed-btn').addEventListener('click',retryFailed); $('save-template-btn').addEventListener('click',saveTemplate); $('load-template-btn').addEventListener('click',loadTemplate); $('auto-refresh-toggle').addEventListener('change', e => {state.autoRefresh=e.target.checked;});
  const params = location.hash.slice(1); if (params) state.route=params; navigate(state.route); if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}); let deferred; window.addEventListener('beforeinstallprompt', e => {e.preventDefault();deferred=e;$('install-btn').classList.remove('hidden');}); $('install-btn').addEventListener('click', async()=>{if(deferred){deferred.prompt();deferred=null;}}); setInterval(() => {if(state.autoRefresh && state.user) refreshAll();}, 30000);
}
function refreshAllDemo() { renderMedia(); renderQueue(); renderAccounts(); renderHistory(); fillAccounts(); updateDashboard(); }
const originalRefreshAll = refreshAll;
refreshAll = async () => { if (state.demo) { refreshAllDemo(); return; } await originalRefreshAll(); };
setup(); boot();
