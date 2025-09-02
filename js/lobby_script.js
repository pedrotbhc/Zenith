// lobby.js — comportamento do lobby (sem exibir pontos)
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startGameBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusEl = document.getElementById('lobbyStatus');

  // Iniciar jogo -> set autostart flag e redirecionar para questions.html
  startBtn.addEventListener('click', () => {
    try {
      // sinaliza autostart para questions.html
      localStorage.setItem('quiz_autostart', '1');
      // redireciona (questions.html deve estar no mesmo diretório 'game/')
      window.location.href = 'questions.html';
    } catch (e) {
      console.warn('Erro ao iniciar', e);
      statusEl.textContent = 'Erro ao tentar iniciar.';
    }
  });

  // Resetar: limpar chaves relacionadas e atualizar UI
  resetBtn.addEventListener('click', () => {
    if (!confirm('Resetar saves e voltar ao estado inicial?')) return;
    // remova apenas as chaves relacionadas ao quiz
    localStorage.removeItem('quiz_results');
    localStorage.removeItem('quiz_totalPoints');
    localStorage.removeItem('quiz_autostart');
    statusEl.textContent = 'Resetado';
    setTimeout(()=> statusEl.textContent = 'Pronto', 1200);
  });
});