async function loadQuestions() {
  const paths = {
    easy: '../assets/questions/easy.json',
    medium: '../assets/questions/medium.json',
    hard: '../assets/questions/hard.json'
  };

  const results = await Promise.allSettled(
    Object.entries(paths).map(([key, path]) =>
      fetch(path)
        .then(res => {
          if (!res.ok) throw new Error(`Falha no fetch de ${key}: ${res.status}`);
          return res.json();
        })
        .then(data => ({ key, data }))
    )
  );

  results.forEach(result => {
    if (result.status === 'fulfilled') {
      if (result.value.key === 'easy') easyQuestions = result.value.data;
      if (result.value.key === 'medium') mediumQuestions = result.value.data;
      if (result.value.key === 'hard') hardQuestions = result.value.data;
      console.log(`${result.value.key}.json carregado com sucesso!`);
    } else {
      console.error(result.reason.message);
    }
  });

  startGameBtn.disabled = false;
}

loadQuestions();

// === Config ===
const STAGES = ['easy','medium','hard'];
const STAGE_LABEL = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
const STAGE_DURATION = 3; // segundos
const INTERVAL_DURATION = 2; // segundos
const BASE_POINTS = { easy:100, medium:250, hard:500 };

// === Estado ===
let stageIndex = null, stage = null, stageStartTs = null, timerInterval = null, intermissionInterval = null;
let answers = { easy: [], medium: [], hard: [] };
let totalPoints = 0;
let currentQuestionIndex = 0;

// === DOM ===
const tabLobby = document.getElementById('tabLobby');
const tabQuestions = document.getElementById('tabQuestions');
const tabResults = document.getElementById('tabResults');
const panelLobby = document.getElementById('panelLobby');
const panelQuestions = document.getElementById('panelQuestions');
const panelResults = document.getElementById('panelResults');
const startGameBtn = document.getElementById('startGameBtn');
const resetBtn = document.getElementById('resetBtn');
const totalPointsEl = document.getElementById('totalPoints');
const questionsContainer = document.getElementById('questionsContainer');
const stageTitle = document.getElementById('stageTitle');
const stageSubtitle = document.getElementById('stageSubtitle');
const timerDisplay = document.getElementById('timerDisplay');
const intermissionBanner = document.getElementById('intermissionBanner');
const intermissionTimerEl = document.getElementById('intermissionTimer');
const resultJsonEl = document.getElementById('resultJson');
const copyJsonBtn = document.getElementById('copyJsonBtn');
const downloadJsonBtn = document.getElementById('downloadJsonBtn');

// === Eventos de UI ===
tabLobby.addEventListener('click',()=>showTab('lobby'));
tabQuestions.addEventListener('click',()=>showTab('questions'));
tabResults.addEventListener('click',()=>showTab('results'));
startGameBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', resetGame);

// Robust clipboard handler: try navigator.clipboard, then execCommand, then select for manual copy
copyJsonBtn.addEventListener('click', async ()=>{
  const text = resultJsonEl.value || '';
  // Try modern API
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      alert('JSON copiado para a área de transferência (Clipboard API).');
      return;
    }
  } catch(err){
    console.warn('navigator.clipboard failed:', err);
    // continue to fallback
  }

  // Fallback: execCommand copy
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // keep off-screen
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if(ok){
      alert('JSON copiado para a área de transferência (execCommand fallback).');
      return;
    }
  } catch(err){
    console.warn('execCommand fallback failed:', err);
  }

  // Last resort: select the textarea so the user can press Ctrl/Cmd+C
  try {
    resultJsonEl.focus();
    resultJsonEl.select();
  } catch(e){}
  alert('Não foi possível copiar automaticamente. O JSON foi selecionado — pressione Ctrl/Cmd+C para copiar manualmente.');
});

// download JSON (sempre funciona sem permissões especiais)
downloadJsonBtn.addEventListener('click', ()=>{
  const blob = new Blob([resultJsonEl.value || ''], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'quiz_results.json'; a.click(); URL.revokeObjectURL(url);
});

// === Navegação de abas ===
function showTab(tab) {
  panelLobby.classList.add('hidden');
  panelQuestions.classList.add('hidden');
  panelResults.classList.add('hidden');

  tabLobby.classList.remove('active');
  tabQuestions.classList.remove('active');
  tabResults.classList.remove('active');

  if(tab==='lobby') { panelLobby.classList.remove('hidden'); tabLobby.classList.add('active'); }
  if(tab==='questions') { panelQuestions.classList.remove('hidden'); tabQuestions.classList.add('active'); }
  if(tab==='results') { panelResults.classList.remove('hidden'); tabResults.classList.add('active'); }
}

// === Fluxo do jogo ===
function startGame(){
  resetInternalState();
  stageIndex = 0; currentQuestionIndex = 0;
  startStageByIndex(stageIndex);
  showTab('questions');
  document.getElementById('lobbyStatus').textContent = 'Jogo iniciado';
}

function startStageByIndex(idx){
  if(idx < 0 || idx >= STAGES.length) return;
  stageIndex = idx; stage = STAGES[idx]; stageStartTs = Date.now(); currentQuestionIndex = 0;
  answers[stage] = [];
  renderStageHeader(); renderNextQuestion(); startStageTimer();
}

function renderStageHeader(){
  stageTitle.textContent = stage ? `Estágio: ${STAGE_LABEL[stage]}` : 'Nenhum estágio ativo';
  stageSubtitle.textContent = stage ? `Valor por resposta: ${BASE_POINTS[stage]} pts — duração: 5:00` : '';
  intermissionBanner.classList.add('hidden');
}

function renderNextQuestion(){
  const arr = getQuestionsArray(stage) || [];
  if(currentQuestionIndex >= arr.length){
    questionsContainer.innerHTML = '<div style="color:#98a0b3">Todas perguntas respondidas ou tempo esgotado.</div>';
    return;
  }
  const q = arr[currentQuestionIndex];
  questionsContainer.innerHTML = '';
  const qDiv = document.createElement('div'); qDiv.className = 'question';
  const prompt = document.createElement('div'); prompt.className = 'prompt'; prompt.textContent = q.prompt || ''; qDiv.appendChild(prompt);
  const choices = document.createElement('div'); choices.className = 'choices';
  ['a','b','c','d'].forEach(letter => {
    const btn = document.createElement('button'); btn.className = 'btn ghost';
    btn.textContent = `${letter.toUpperCase()}: ${ (q.choices && q.choices[letter]) ? q.choices[letter] : '' }`;
    btn.addEventListener('click', () => onAnswerSelected(q, letter));
    choices.appendChild(btn);
  });
  qDiv.appendChild(choices); questionsContainer.appendChild(qDiv);
}

function onAnswerSelected(q, letter){
  const now = Date.now();
  const timeTaken = (now - stageStartTs) / 1000;
  let awarded = null;
  if(q && q.correct){
    const isCorrect = (letter === q.correct);
    if(isCorrect){
      const ratio = Math.max(0, Math.min(1, timeTaken / STAGE_DURATION));
      const bonusFactor = 0.5 * (1 - ratio);
      awarded = Math.round(BASE_POINTS[stage] * (1 + bonusFactor));
    } else { awarded = 0; }
  }
  answers[stage][currentQuestionIndex] = { chosen: letter, time: timeTaken, points: awarded, correct: (q && q.correct) ? q.correct : null };
  recalcTotal();
  currentQuestionIndex++; renderNextQuestion();
}

function startStageTimer(){
  clearInterval(timerInterval);
  const start = stageStartTs;
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const remaining = Math.max(0, STAGE_DURATION - elapsed);
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    timerDisplay.textContent = `${mm}:${ss}`;
    if(remaining <= 0){ clearInterval(timerInterval); endStageAndProceed(); }
  }, 250);
}

function endStageAndProceed(){
  if(stageIndex < STAGES.length - 1){ startIntermission(); } else { finishGame(); }
}

function startIntermission(){
  intermissionBanner.classList.remove('hidden');
  let remaining = INTERVAL_DURATION; intermissionTimerEl.textContent = remaining;
  intermissionInterval = setInterval(() => {
    remaining--; intermissionTimerEl.textContent = remaining;
    if(remaining <= 0){ clearInterval(intermissionInterval); intermissionBanner.classList.add('hidden'); startStageByIndex(stageIndex + 1); }
  }, 1000);
}

function finishGame(){
  stage = null;
  stageIndex = null;
  stageStartTs = null;
  
  renderStageHeader();
  
  resultJsonEl.value = JSON.stringify(buildResultsJson(), null, 2);
  
  const results = buildResultsJson(); resultJsonEl.value = JSON.stringify(results, null, 2);
  showTab('results');
}

function buildResultsJson(){
  const out = { totalPoints: totalPoints, stages: [] };
  STAGES.forEach(s => {
    const arr = getQuestionsArray(s) || [];
    const stageObj = { stage: s, label: STAGE_LABEL[s], questions: [] };
    arr.forEach((q, idx) => {
      const a = answers[s] && answers[s][idx] ? answers[s][idx] : { chosen: null, time: null, points: null, correct: (q && q.correct) ? q.correct : null };
      stageObj.questions.push({ index: idx, prompt: q ? q.prompt : null, chosen: a.chosen, correct: a.correct, time: a.time, points: a.points });
    });
    out.stages.push(stageObj);
  });
  return out;
}

function recalcTotal(){
  let sum = 0; STAGES.forEach(s => { (answers[s] || []).forEach(a => { if(a && typeof a.points === 'number') sum += a.points; }); });
  totalPoints = sum; totalPointsEl.textContent = totalPoints;
}

function getQuestionsArray(s){ return s === 'easy' ? easyQuestions : s === 'medium' ? mediumQuestions : s === 'hard' ? hardQuestions : []; }

function resetInternalState(){
  if(timerInterval) clearInterval(timerInterval);
  if(intermissionInterval) clearInterval(intermissionInterval);
  stageIndex = null; stage = null; stageStartTs = null; currentQuestionIndex = 0;
  answers = { easy: [], medium: [], hard: [] }; totalPoints = 0; totalPointsEl.textContent = 0;
  questionsContainer.innerHTML = ''; timerDisplay.textContent = '00:00'; intermissionBanner.classList.add('hidden');
}

function resetGame(){ if(confirm('Resetar o jogo e apagar resultados?')){ resetInternalState(); resultJsonEl.value = ''; showTab('lobby'); document.getElementById('lobbyStatus').textContent = 'Pronto'; } }

// init
resetInternalState(); showTab('lobby');