(() => {
  'use strict';

  /* ---------------- CONFIG ---------------- */
  const SUPABASE_URL = "https://towutdmdlxyzbecfpunk.supabase.co";
  // ATENÇÃO: service_role no frontend é INSEGURA para produção.
  const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvd3V0ZG1kbHh5emJlY2ZwdW5rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjY1NzUyMSwiZXhwIjoyMDcyMjMzNTIxfQ.n_yZc7G-UW5sA35Y04ZQG-X_PYqdAJ8psH5UICGAjEg";

  const BUCKET = 'data';
  const FOLDER = 'grupos';

  /* ---------------- DOM ---------------- */
  const totalPointsEl = document.getElementById('totalPoints');
  const groupNameEl = document.getElementById('groupName');
  const groupNameSmallEl = document.getElementById('groupNameSmall');
  const stagesContainer = document.getElementById('stagesContainer');
  const sentStatusEl = document.getElementById('sentStatus');
  const statusToast = document.getElementById('statusToast');
  const resendBtn = document.getElementById('resendBtn');
  const editGroupEl = document.getElementById('editGroup');
  const groupInput = document.getElementById('groupInput');
  const saveGroupBtn = document.getElementById('saveGroupBtn');

  function showToast(msg, ms = 2000){
    if(!statusToast) return;
    statusToast.textContent = msg;
    statusToast.style.display = 'block';
    setTimeout(()=> { statusToast.style.display = 'none'; }, ms);
  }

  /* ---------------- Supabase init (seguro) ---------------- */
  // Tenta inicializar imediatamente; se lib ainda não carregou, faz polling curto.
  function createSupabaseClientFromGlobal(){
    if (globalThis.supabase && typeof globalThis.supabase.createClient === 'function') {
      try {
        return globalThis.supabase.createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      } catch(e) {
        console.error('Erro criando supabase client:', e);
        return null;
      }
    }
    return null;
  }

  // Promise que resolve com client ou null após timeout
  function waitForSupabaseClient(timeoutMs = 2000, intervalMs = 50){
    return new Promise(resolve => {
      const immediate = createSupabaseClientFromGlobal();
      if(immediate) return resolve(immediate);
      const start = Date.now();
      const timer = setInterval(() => {
        const client = createSupabaseClientFromGlobal();
        if(client) {
          clearInterval(timer);
          return resolve(client);
        }
        if(Date.now() - start > timeoutMs){
          clearInterval(timer);
          return resolve(null);
        }
      }, intervalMs);
    });
  }

  /* ---------------- Helpers ---------------- */
  function detectGroupName(){
  // pegar direto do localStorage do login
  const group = localStorage.getItem('playerGroup');
  if(group) return group;

  // fallback antigo, se quiser
  const s = sessionStorage.getItem('grupo') || sessionStorage.getItem('group');
  if(s) return s;

  const l = localStorage.getItem('grupo') || localStorage.getItem('group') || localStorage.getItem('team') || localStorage.getItem('quiz_group');
  if(l) return l;

  return null;
}

  function normalizeId(name){
    return encodeURIComponent((name || '').trim().toLowerCase().replace(/\s+/g,'_') || ('grupo_' + Date.now()));
  }

  function parseQueryParams(){
    const params = new URLSearchParams(window.location.search);
    return {
      group: params.get('group') || null,
      points: (() => {
        const raw = params.get('points');
        if(!raw) return null;
        const n = parseInt(raw, 10);
        return Number.isNaN(n) ? null : n;
      })()
    };
  }

  function renderUI(parsed){
    // parsed = object que pode ter totalPoints/Pontos/pontos e stages
    const total = parsed && (typeof parsed.totalPoints === 'number' ? parsed.totalPoints : (typeof parsed.Pontos === 'number' ? parsed.Pontos : (typeof parsed.pontos === 'number' ? parsed.pontos : 0)));
    totalPointsEl.textContent = String(total);

    const gp = detectGroupName() || (parsed && (parsed.grupo || parsed.group || parsed.grupo_nome || parsed.groupName)) || null;
    if(gp){
      groupNameEl.textContent = gp;
      groupNameSmallEl.textContent = `Grupo: ${gp}`;
      editGroupEl.style.display = 'none';
    } else {
      groupNameEl.textContent = '—';
      groupNameSmallEl.textContent = '';
      editGroupEl.style.display = 'flex';
    }

    // stages
    stagesContainer.innerHTML = '';
    const stages = (parsed && Array.isArray(parsed.stages)) ? parsed.stages : [];
    if(stages.length === 0){
      stagesContainer.innerHTML = '<div class="muted">Nenhum detalhe disponível.</div>';
      return;
    }
    stages.forEach(s => {
      const sc = document.createElement('div'); sc.className = 'stage-card';
      const header = document.createElement('div'); header.className = 'stage-header';
      header.innerHTML = `<div style="font-weight:800">${s.label || s.stage || 'Etapa'}</div><div style="color:#7dd3fc;font-weight:800">${s.points||0} pts</div>`;
      sc.appendChild(header);

      (s.questions||[]).forEach(q => {
        const ql = document.createElement('div'); ql.className='qline';
        const prompt = document.createElement('div'); prompt.className='q-prompt'; prompt.textContent = q.prompt || '(sem prompt)';
        const meta = document.createElement('div'); meta.className='q-meta';
        const chosen = (q.chosen === null || q.chosen === undefined) ? '—' : String(q.chosen).toUpperCase();
        const correct = q.correct ? String(q.correct).toUpperCase() : '—';
        const time = (q.time===null||q.time===undefined) ? '—' : (typeof q.time==='number' ? q.time.toFixed(1)+'s' : q.time);
        const pts = (typeof q.points === 'number') ? q.points : 0;
        const ok = (q.chosen !== null && q.chosen === q.correct);
        meta.innerHTML = `<div class="${ok?'ok':'bad'}">${ok? 'ACERTOU':'ERROU'}</div><div class="muted" style="font-size:0.85rem">Escolhido: ${chosen} · Cor: ${correct} · ${time} · ${pts} pts</div>`;
        ql.appendChild(prompt); ql.appendChild(meta);
        sc.appendChild(ql);
      });

      stagesContainer.appendChild(sc);
    });
  }

  /* ---------------- Upload (async) ---------------- */
  async function uploadJsonToBucket(parsed, groupName){
    // espera cliente do supabase (curto polling)
    const supabaseClient = await waitForSupabaseClient(2000, 50);

    if(!supabaseClient){
      sentStatusEl.textContent = 'Supabase não inicializado';
      showToast('Erro: cliente Supabase indisponível');
      return { ok:false, reason:'no-client' };
    }

    if(!groupName) {
      sentStatusEl.textContent = 'Sem nome de grupo';
      showToast('Insira o nome do grupo para enviar');
      return { ok:false, reason:'no-group' };
    }

    if(!parsed) {
      sentStatusEl.textContent = 'Sem resultados';
      showToast('Não há resultados para enviar');
      return { ok:false, reason:'no-results' };
    }

    // INCIO DA PARTE QUE DEFINE O JSON!!! //
    const payload = {
      grupo: groupName,
      pontos: parsed && (typeof parsed.pontos === 'number' ? parsed.pontos : (typeof parsed.Pontos === 'number' ? parsed.Pontos : (typeof parsed.totalPoints === 'number' ? parsed.totalPoints : 0)))
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });

    const id = normalizeId(groupName);
    const path = `${FOLDER}/${id}.json`;
    // FIM DA PARTE QUE DEFINE O JSON!!! //

    sentStatusEl.textContent = 'Enviando...';

    try {
      const { data, error } = await supabaseClient.storage.from(BUCKET).upload(path, blob, { contentType: 'application/json', upsert: true });
      if(error){
        console.error('Upload error', error);
        sentStatusEl.textContent = 'Falha no upload';
        showToast('Falha ao enviar (veja console)');
        return { ok:false, error };
      }
      sentStatusEl.textContent = `Enviado: ${path}`;
      showToast('Enviado com sucesso ✅');
      return { ok:true, data };
    } catch(err){
      console.error('Upload exception', err);
      sentStatusEl.textContent = 'Erro de rede';
      showToast('Erro ao enviar (ver console)');
      return { ok:false, error: err };
    }
  }

  /* ---------------- Main flow ---------------- */
  (function main(){
    // tenta pegar dados completos do quiz se existir
    const raw = localStorage.getItem('quiz_results') || sessionStorage.getItem('quiz_results');
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch(e){ parsed = null; console.warn('parse quiz_results failed', e); }

    // se a página recebeu pontos / group via query string, prioriza
    const params = parseQueryParams();
    if(params.points !== null){
      // garantir que parsed reflita os pontos passados
      parsed = parsed || {};
      parsed.totalPoints = params.points;
    }
    // se houve group na query, salva temporariamente
    if(params.group){
      try { localStorage.setItem('grupo', params.group); } catch(e){}
      try { sessionStorage.setItem('grupo', params.group); } catch(e){}
    }

    renderUI(parsed);

    // detecta nome do grupo final (prioriza storage)
    let groupName = detectGroupName();

    async function maybeAutoSend(){
      groupName = detectGroupName();
      if(!groupName) return;
      resendBtn.disabled = true;
      await uploadJsonToBucket(parsed, groupName);
      resendBtn.disabled = false;
    }

    // auto-send curto após load para permitir renderizar UI antes
    setTimeout(maybeAutoSend, 300);

    // handlers
    resendBtn.addEventListener('click', async () => {
      resendBtn.disabled = true;
      await uploadJsonToBucket(parsed, detectGroupName());
      resendBtn.disabled = false;
    });

    // salvar nome do grupo se o usuário digitar
    if(saveGroupBtn){
      saveGroupBtn.addEventListener('click', () => {
        const val = (groupInput.value || '').trim();
        if(!val) return showToast('Digite um nome válido');
        try { localStorage.setItem('grupo', val); } catch(e){}
        try { sessionStorage.setItem('grupo', val); } catch(e){}
        groupName = val;
        renderUI(parsed);
        setTimeout(maybeAutoSend, 200);
      });
    }
  })();

})(); 