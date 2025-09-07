(() => {
  'use strict';

  const PATHS = {
    easy: '../assets/questions/easy.json',
    medium: '../assets/questions/medium.json',
    hard: '../assets/questions/hard.json'
  };
  const STAGES = ['easy','medium','hard'];
  const STAGE_LABEL = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
  const STAGE_DURATION = 2; // segundos por estágio
  const INTERVAL_DURATION = 1; // segundos entre estágios
  const BASE_POINTS = { easy:100, medium:200, hard:300 };

  // state
  let questions = { easy:[], medium:[], hard:[] };
  let stageIndex = -1;
  let stage = null;
  let currentQuestionIndex = 0;
  let stageStartTs = null;
  let timerInterval = null;
  let intermissionInterval = null;
  let answers = { easy:[], medium:[], hard:[] };
  let playing = false;

  // DOM
  const timerDisplay = document.getElementById('timerDisplay');
  const stageTitleEl = document.getElementById('stageTitle');
  const stageSubtitleEl = document.getElementById('stageSubtitle');
  const stageProgressEl = document.getElementById('stageProgress');
  const intermissionBanner = document.getElementById('intermissionBanner');
  const intermissionTimerEl = document.getElementById('intermissionTimer');
  const questionsContainer = document.getElementById('questionsContainer');

  // load with Promise.allSettled, fallback minimal data
  async function loadQuestions(){
    try {
      const promises = Object.entries(PATHS).map(([k,p]) =>
        fetch(p)
          .then(r => {
            if(!r.ok) throw new Error(`fetch ${p} status ${r.status}`);
            return r.json();
          })
          .then(data => ({ k, data }))
      );
      const results = await Promise.allSettled(promises);
      results.forEach(r => {
        if(r.status === 'fulfilled' && r.value){
          const { k, data } = r.value;
          let qArray = [];
          // aceita vários formatos: array direto, { questions: [...] }, { data: [...] }
          if(Array.isArray(data)) qArray = data;
          else if(data && Array.isArray(data.questions)) qArray = data.questions;
          else if(data && Array.isArray(data.data)) qArray = data.data;
          else qArray = []; // vazio se nada conhecido
          questions[k] = qArray;
          console.log(`stage ${k} loaded — ${qArray.length} perguntas`);
        } else {
          console.warn('fetch failed for a stage', r && r.reason);
        }
      });
    } catch(e){
      console.warn('loadQuestions error', e);
    } finally {
      // fallback minimal dataset if any stage empty
      if(!Array.isArray(questions.easy) || questions.easy.length === 0){
        questions.easy = [
          { prompt: '2+2=?', choices:{a:'3',b:'4',c:'5',d:'6'}, correct: 'b' },
          { prompt: 'Cor do céu?', choices:{a:'Azul',b:'Verde',c:'Vermelho',d:'Amarelo'}, correct: 'a' }
        ];
      }
      if(!Array.isArray(questions.medium) || questions.medium.length === 0){
        questions.medium = [
          { prompt: 'Capital do Brasil?', choices:{a:'São Paulo',b:'Brasília',c:'Rio',d:'Salvador'}, correct: 'b' }
        ];
      }
      if(!Array.isArray(questions.hard) || questions.hard.length === 0){
        questions.hard = [
          { prompt: 'Qual a raiz quadrada de 144?', choices:{a:'10',b:'11',c:'12',d:'13'}, correct:'c' }
        ];
      }
    }
  }

  function updateStageHeader(){
    stageTitleEl.textContent = stage ? `Estágio: ${STAGE_LABEL[stage]}` : 'Nenhum estágio ativo';
    stageSubtitleEl.textContent = stage ? `Valor por resposta: ${BASE_POINTS[stage]} pts` : 'Carregando perguntas…';
    stageProgressEl.textContent = stage ? `Estágio ${stageIndex+1}/${STAGES.length}` : 'Estágio —';
  }

  function renderQuestion(){
    const arr = questions[stage] || [];
    if(currentQuestionIndex >= arr.length){
      // all questions answered for this stage
      questionsContainer.innerHTML = `<div class="question-card"><div class="prompt" style="color:#98a0b3">Todas perguntas respondidas — aguardando fim do estágio.</div></div>`;
      return;
    }
    const q = arr[currentQuestionIndex];
    questionsContainer.innerHTML = '';
    const card = document.createElement('div'); card.className = 'question-card';
    const prompt = document.createElement('div'); prompt.className = 'prompt'; prompt.textContent = q.prompt || '';
    const choices = document.createElement('div'); choices.className = 'choices';

    ['a','b','c','d'].forEach(letter => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.type = 'button';
      btn.setAttribute('data-letter', letter);
      btn.innerText = `${letter.toUpperCase()}: ${ (q.choices && q.choices[letter]) ? q.choices[letter] : '' }`;
      btn.addEventListener('click', () => {
        handleAnswer(btn, q, letter);
      });
      choices.appendChild(btn);
    });

    card.appendChild(prompt);
    card.appendChild(choices);
    questionsContainer.appendChild(card);
  }

  function handleAnswer(btn, q, letter){
    if(!playing) return;
    // prevent double-answer
    const siblingButtons = btn.parentElement.querySelectorAll('.choice-btn');
    siblingButtons.forEach(b => b.classList.add('answered'));

    const elapsed = stageStartTs ? (Date.now() - stageStartTs)/1000 : 0;
    const remaining = Math.max(0, STAGE_DURATION - elapsed);
    const points = (q.correct === letter) ? Math.round(BASE_POINTS[stage] * (remaining / STAGE_DURATION)) : 0;

    answers[stage] = answers[stage] || [];
    answers[stage][currentQuestionIndex] = { chosen: letter, points, correct: q.correct, time: elapsed };

    // visual feedback
    siblingButtons.forEach(b => {
      const l = b.getAttribute('data-letter');
      if(l === q.correct) b.classList.add('correct');
      if(l === letter && l !== q.correct) b.classList.add('wrong');
    });

    currentQuestionIndex++;
    // render next question only if still have question left (but do NOT end stage early)
    const arr = questions[stage] || [];
    if(currentQuestionIndex < arr.length){
      setTimeout(renderQuestion, 350);
    } else {
      // show message that all answered and wait for stage timer to finish
      setTimeout(() => { renderQuestion(); }, 350);
    }
  }

  function startStageTimer(){
    clearInterval(timerInterval);
    stageStartTs = Date.now();
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      updateTimerDisplay();
      const elapsed = (Date.now() - stageStartTs)/1000;
      const remaining = Math.max(0, STAGE_DURATION - elapsed);
      if(remaining <= 0){
        clearInterval(timerInterval);
        // ensure we mark unanswered questions then proceed to intermission
        markUnansweredInStage();
        startIntermission();
      }
    }, 200);
  }

  function updateTimerDisplay(){
    const elapsed = stageStartTs ? (Date.now() - stageStartTs)/1000 : 0;
    const remaining = Math.max(0, STAGE_DURATION - elapsed);
    const s = Math.max(0, Math.ceil(remaining));
    const mm = String(Math.floor(s/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    timerDisplay.textContent = `${mm}:${ss}`;
  }

  function markUnansweredInStage(){
    const arr = questions[stage] || [];
    answers[stage] = answers[stage] || [];
    for(let i=0;i<arr.length;i++){
      if(!answers[stage][i]){
        answers[stage][i] = { chosen: null, points: 0, correct: arr[i].correct || null, time: STAGE_DURATION };
      }
    }
  }

  function startIntermission(){
    intermissionBanner.style.display = 'block';
    let rem = INTERVAL_DURATION;
    intermissionTimerEl.textContent = rem;
    intermissionInterval && clearInterval(intermissionInterval);
    intermissionInterval = setInterval(() => {
      rem--;
      intermissionTimerEl.textContent = rem;
      if(rem <= 0){
        clearInterval(intermissionInterval);
        intermissionBanner.style.display = 'none';
        nextStage();
      }
    }, 1000);
  }

  function nextStage(){
    stageIndex++;
    if(stageIndex >= STAGES.length){
      // finished all stages
      finishGame();
      return;
    }
    stage = STAGES[stageIndex];
    currentQuestionIndex = 0;
    answers[stage] = answers[stage] || [];
    updateStageHeader();
    renderQuestion();
    playing = true;
    startStageTimer();
  }

  function buildResultsJson(){
    const out = { totalPoints: 0, stages: [] };
    for(const s of STAGES){
      const arr = questions[s] || [];
      const stageObj = { stage: s, label: STAGE_LABEL[s], questions: [], points: 0 };
      let sum = 0;
      for(let i=0;i<arr.length;i++){
        const q = arr[i];
        const a = (answers[s] && answers[s][i]) ? answers[s][i] : { chosen: null, points: 0, correct: q.correct || null, time: null };
        stageObj.questions.push({ index: i, prompt: q.prompt || null, chosen: a.chosen, correct: a.correct, time: a.time, points: a.points });
        sum += (typeof a.points === 'number') ? a.points : 0;
      }
      stageObj.points = sum;
      out.stages.push(stageObj);
      out.totalPoints += sum;
    }
    return out;
  }

  function finishGame(){
    // clear intervals
    clearInterval(timerInterval);
    clearInterval(intermissionInterval);
    playing = false;

    // calcula total de pontos
    let totalPoints = 0;
    for(const stageKey of STAGES){
      const stageAnswers = answers[stageKey] || [];
      stageAnswers.forEach(a => {
        if(a && typeof a.points === 'number') totalPoints += a.points;
      });
    }

    // cria JSON minimalista
    const result = {
      grupo: localStorage.getItem('quiz_group') || '—', // se tiver um nome de grupo salvo
      pontos: totalPoints
    };

    // salva no localStorage
    try { localStorage.setItem('quiz_results', JSON.stringify(result)); } 
    catch(e){ console.warn('save fail', e); }

    // redireciona para result_json.html
    window.location.href = 'result_json.html';
  }

  // Init
  (async function init(){
    await loadQuestions();
    // auto-start immediately
    stageIndex = -1;
    nextStage();
  })();

})();