/* =========================================================
   Triagem Rápida — Sistemas Distribuídos
   Jogo de arcada: classifica cada conceito na categoria certa
   antes do tempo acabar. Baseado nos materiais do módulo.
   ========================================================= */

const BEST_KEY='sdp_jogo_triagem_best';

// Cada item: prompt (p), opções (opts), resposta correta (a) e dica (feedback).
const ITENS=[
  // — Modelos de falha de nó —
  {p:'Falha e deixa de executar para sempre', opts:['Crash-stop','Crash-recovery','Bizantino'], a:'Crash-stop', dica:'Crash-stop (fail-stop): depois de falhar, o nó para definitivamente.'},
  {p:'Perde a memória mas pode recuperar; o que está em disco sobrevive', opts:['Crash-stop','Crash-recovery','Bizantino'], a:'Crash-recovery', dica:'Crash-recovery: recupera após reiniciar, com o disco a sobreviver ao crash.'},
  {p:'Desvia-se do algoritmo e pode mentir de propósito', opts:['Crash-stop','Crash-recovery','Bizantino'], a:'Bizantino', dica:'Bizantino (fail-arbitrary): pode fazer qualquer coisa, incluindo agir de forma maliciosa.'},
  {p:'Reinicia e relê o estado persistente do disco', opts:['Crash-stop','Crash-recovery','Bizantino'], a:'Crash-recovery', dica:'O disco sobrevive ao crash — é o modelo crash-recovery.'},
  {p:'Envia valores diferentes a nós diferentes para os confundir', opts:['Crash-stop','Crash-recovery','Bizantino'], a:'Bizantino', dica:'Comportamento arbitrário/malicioso = nó bizantino.'},

  // — Modelo de rede —
  {p:'Recebida se e só se enviada; pode reordenar, nunca perde', opts:['Reliable','Fair-loss','Arbitrary','Partição'], a:'Reliable', dica:'Reliable (perfect) links: nunca perde, só pode reordenar.'},
  {p:'Pode perder ou duplicar, mas retransmitindo acaba por chegar', opts:['Reliable','Fair-loss','Arbitrary','Partição'], a:'Fair-loss', dica:'Fair-loss: com retransmissão contínua converte-se em fiável.'},
  {p:'Adversário ativo espia, modifica, falsifica e repete mensagens', opts:['Reliable','Fair-loss','Arbitrary','Partição'], a:'Arbitrary', dica:'Arbitrary: adversário ativo no canal.'},
  {p:'Descarta/atrasa todas as mensagens durante muito tempo', opts:['Reliable','Fair-loss','Arbitrary','Partição'], a:'Partição', dica:'Partição de rede: ligações cortadas por um período prolongado.'},

  // — Paradigma de comunicação —
  {p:'Sockets entre processos', opts:['IPC','Invocação remota','Indireta'], a:'IPC', dica:'Sockets/message passing/multicast = IPC (baixo nível).'},
  {p:'RPC e RMI', opts:['IPC','Invocação remota','Indireta'], a:'Invocação remota', dica:'RPC/RMI/request-reply = invocação remota.'},
  {p:'Request-reply', opts:['IPC','Invocação remota','Indireta'], a:'Invocação remota', dica:'Padrão pedido-resposta = invocação remota.'},
  {p:'Publish-subscribe', opts:['IPC','Invocação remota','Indireta'], a:'Indireta', dica:'Há um intermediário e desacoplamento → comunicação indireta.'},
  {p:'Message queues (filas)', opts:['IPC','Invocação remota','Indireta'], a:'Indireta', dica:'A fila é a indireção entre produtor e consumidor.'},
  {p:'Tuple spaces (write/read/take)', opts:['IPC','Invocação remota','Indireta'], a:'Indireta', dica:'Espaço partilhado de tuplos = comunicação indireta.'},
  {p:'DSM — memória partilhada distribuída', opts:['IPC','Invocação remota','Indireta'], a:'Indireta', dica:'DSM esconde a distribuição por trás de memória partilhada — indireta.'},
  {p:'Comunicação em grupo (multicast)', opts:['IPC','Invocação remota','Indireta'], a:'Indireta', dica:'Um para muitos através de um intermediário = indireta.'},

  // — Web services: SOAP vs REST —
  {p:'Envelope XML com Header e Body', opts:['SOAP','REST'], a:'SOAP', dica:'SOAP usa Envelope XML (Header opcional + Body, com possível Fault).'},
  {p:'Recursos identificados por URL, com GET/PUT/POST/DELETE', opts:['SOAP','REST'], a:'REST', dica:'REST manipula recursos por URL com verbos HTTP.'},
  {p:'Interface descrita por WSDL e registada em UDDI', opts:['SOAP','REST'], a:'SOAP', dica:'WSDL descreve e UDDI regista os serviços SOAP.'},
  {p:'Cada novo recurso ganha um novo URL', opts:['SOAP','REST'], a:'REST', dica:'Recurso novo → novo URL: estilo REST.'},

  // — P2P: DHT vs DOLR —
  {p:'put(GUID,value) / get(GUID) / remove(GUID)', opts:['DHT','DOLR'], a:'DHT', dica:'API da DHT: put/get/remove.'},
  {p:'publish / unpublish / sendToObj', opts:['DHT','DOLR'], a:'DOLR', dica:'API do DOLR: publish/unpublish/sendToObj.'},
  {p:'A camada decide onde guardar o valor', opts:['DHT','DOLR'], a:'DHT', dica:'Na DHT a camada escolhe a localização e replica.'},
  {p:'Objetos em qualquer lado, com mapa GUID→objeto', opts:['DHT','DOLR'], a:'DOLR', dica:'DOLR é mais flexível: objetos em qualquer nó.'},

  // — Disponibilidade e termos —
  {p:'Objetivo mensurável: 99,9% dos pedidos em 200 ms', opts:['SLO','SLA','SPOF'], a:'SLO', dica:'SLO = Service-Level Objective (objetivo).'},
  {p:'Contrato com penalidades por violação', opts:['SLO','SLA','SPOF'], a:'SLA', dica:'SLA = contrato com SLO(s) + penalidades.'},
  {p:'Nó ou ligação cuja falha derruba o sistema todo', opts:['SLO','SLA','SPOF'], a:'SPOF', dica:'SPOF = Single Point of Failure.'},

  // — Os dois problemas clássicos —
  {p:'Modela a REDE: as mensagens podem perder-se', opts:['Dois Generais','Generais Bizantinos'], a:'Dois Generais', dica:'Dois Generais modela a incerteza da rede.'},
  {p:'Modela os NÓS: alguns podem ser traidores', opts:['Dois Generais','Generais Bizantinos'], a:'Generais Bizantinos', dica:'Generais Bizantinos modela nós maliciosos.'},
  {p:'Sem conhecimento comum → sem certeza com nº finito de mensagens', opts:['Dois Generais','Generais Bizantinos'], a:'Dois Generais', dica:'A grande lição dos Dois Generais.'},
  {p:'Precisa de 3n+1 generais para tolerar n maliciosos', opts:['Dois Generais','Generais Bizantinos'], a:'Generais Bizantinos', dica:'Teorema 3n+1 do problema bizantino.'},

  // — Transparência —
  {p:'Operações idênticas para recursos locais e remotos', opts:['Acesso','Localização','Falha','Replicação'], a:'Acesso', dica:'Transparência de acesso.'},
  {p:'Aceder sem saber a localização física/na rede', opts:['Acesso','Localização','Falha','Replicação'], a:'Localização', dica:'Transparência de localização.'},
  {p:'Concluir a tarefa apesar de falhas', opts:['Acesso','Localização','Falha','Replicação'], a:'Falha', dica:'Transparência de falha.'},
  {p:'Usar várias réplicas sem o utilizador saber', opts:['Acesso','Localização','Falha','Replicação'], a:'Replicação', dica:'Transparência de replicação.'},
];

const TEMPO_BASE=8000; // ms por conceito
const jogo={ running:false, score:0, best:0, lives:3, combo:1, ordem:[], pos:0, bloqueado:false, timer:null, fim:0 };

function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function bestScore(){return parseInt(localStorage.getItem(BEST_KEY)||'0',10);}

function mount(){ jogo.best=bestScore(); document.getElementById('game').innerHTML=startHTML(); }

function startHTML(){
  return `<div class="game-card">
    <span class="eyebrow">Jogo · Sistemas Distribuídos</span>
    <h2>🎯 Triagem Rápida</h2>
    <p class="muted">Aparece um conceito; toca na categoria certa antes de o tempo acabar.
    Acertos seguidos aumentam o multiplicador. Tens <b>3 vidas</b>. Erro ou tempo esgotado custa uma vida.</p>
    <ul class="muted game-rules">
      <li>⏱️ Cada conceito tem um tempo-limite (vai encurtando conforme a pontuação sobe).</li>
      <li>🔥 Combo: pontos = 10 × multiplicador; o multiplicador cresce a cada acerto seguido.</li>
      <li>❤️ 3 vidas. Sem vidas, fim de jogo — mas o teu recorde fica guardado.</li>
    </ul>
    <div class="row">
      <button class="primary" onclick="iniciar()">▶️ Começar a jogar</button>
      <span class="pill">🏆 Recorde: ${jogo.best}</span>
      <span class="pill">📚 ${ITENS.length} conceitos</span>
    </div>
    <p class="muted" style="margin-top:12px">Temas no baralho: falhas de nó · modelos de rede · paradigmas de comunicação · SOAP/REST · DHT/DOLR · SLO/SLA/SPOF · Dois Generais/Bizantinos · transparência.</p>
  </div>`;
}

function iniciar(){
  jogo.running=true; jogo.score=0; jogo.lives=3; jogo.combo=1;
  jogo.ordem=shuffle(ITENS.map((_,i)=>i)); jogo.pos=0; jogo.bloqueado=false;
  proximo();
}

function proximo(){
  if(jogo.lives<=0){ fimDeJogo(); return; }
  if(jogo.pos>=jogo.ordem.length){ jogo.ordem=shuffle(ITENS.map((_,i)=>i)); jogo.pos=0; }
  jogo.bloqueado=false;
  render();
  iniciarTimer();
}

function tempoAtual(){ return Math.max(3500, TEMPO_BASE - Math.floor(jogo.score/100)*500); }

function iniciarTimer(){
  pararTimer();
  const total=tempoAtual();
  jogo.fim=Date.now()+total;
  const barra=document.getElementById('timer-fill');
  jogo.timer=setInterval(()=>{
    const restante=jogo.fim-Date.now();
    const pct=Math.max(0, restante/total*100);
    if(barra) barra.style.width=pct+'%';
    if(restante<=0){ pararTimer(); responder(null); }
  }, 50);
}
function pararTimer(){ if(jogo.timer){ clearInterval(jogo.timer); jogo.timer=null; } }

function render(){
  const it=ITENS[jogo.ordem[jogo.pos]];
  const coracoes='❤️'.repeat(jogo.lives)+'🖤'.repeat(3-jogo.lives);
  document.getElementById('game').innerHTML=`
  <div class="game-card">
    <div class="hud">
      <span class="pill">⭐ ${jogo.score}</span>
      <span class="pill">🔥 x${jogo.combo}</span>
      <span class="pill">🏆 ${jogo.best}</span>
      <span class="hud-lives" title="Vidas">${coracoes}</span>
    </div>
    <div class="progress timer"><div id="timer-fill" class="fill" style="width:100%"></div></div>
    <p class="muted prompt-label">Em que categoria encaixa?</p>
    <div class="prompt">${escapeHTML(it.p)}</div>
    <div class="opt-grid">
      ${it.opts.map(o=>`<button class="opt-btn" data-o="${escapeHTML(o)}" onclick="responder('${escapeHTML(o).replace(/'/g,"\\'")}')">${escapeHTML(o)}</button>`).join('')}
    </div>
    <div id="game-feedback" class="game-feedback"></div>
  </div>`;
}

function responder(escolha){
  if(jogo.bloqueado) return;
  jogo.bloqueado=true;
  pararTimer();
  const it=ITENS[jogo.ordem[jogo.pos]];
  const acertou = escolha===it.a;
  const grid=document.querySelectorAll('.opt-btn');
  grid.forEach(b=>{
    b.disabled=true;
    const val=b.getAttribute('data-o');
    if(val===it.a) b.classList.add('ok');
    if(escolha!==null && val===escolha && !acertou) b.classList.add('mau');
  });

  const fb=document.getElementById('game-feedback');
  if(acertou){
    const ganho=10*jogo.combo;
    jogo.score+=ganho; jogo.combo++;
    fb.innerHTML=`<div class="fb ok">✅ Certo! +${ganho} pontos <span class="muted">(${escapeHTML(it.dica)})</span></div>`;
  } else {
    jogo.lives--; jogo.combo=1;
    const motivo = escolha===null ? '⏱️ Tempo esgotado!' : '❌ Não é essa.';
    fb.innerHTML=`<div class="fb mau">${motivo} A resposta certa é <b>${escapeHTML(it.a)}</b>. <span class="muted">${escapeHTML(it.dica)}</span></div>`;
  }
  jogo.pos++;
  const espera = acertou?700:1500;
  setTimeout(()=>{ if(jogo.lives<=0) fimDeJogo(); else proximo(); }, espera);
}

function fimDeJogo(){
  jogo.running=false;
  pararTimer();
  let novoRecorde=false;
  if(jogo.score>jogo.best){ jogo.best=jogo.score; localStorage.setItem(BEST_KEY, String(jogo.best)); novoRecorde=true; }
  document.getElementById('game').innerHTML=`
  <div class="game-card game-over">
    <h2>${novoRecorde?'🏆 Novo recorde!':'🎮 Fim de jogo'}</h2>
    <p class="big">Pontuação: <b>${jogo.score}</b></p>
    <div class="row">
      <span class="pill">🏆 Melhor: ${jogo.best}</span>
    </div>
    <p class="muted" style="margin-top:12px">Dica de estudo: as categorias que te tramaram são exatamente as que vale a pena rever no Modo Aprender de Sistemas Distribuídos.</p>
    <div class="row">
      <button class="primary" onclick="iniciar()">🔁 Jogar outra vez</button>
      <a class="btn" href="sistemas-distribuidos.html">📚 Rever a matéria</a>
    </div>
  </div>`;
}

document.addEventListener('DOMContentLoaded', mount);
