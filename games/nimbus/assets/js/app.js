const COMPANY="NimbusShop";
const RANKS=["Estagiário de Dados","Analista Júnior","Analista de Dados","Analista Sênior","Cientista de Dados Chefe"];
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
/* céu por cargo: dia -> meio-dia -> dourado -> entardecer -> noite */
const SKIES=[["#7fb4d6","#cfe3ee"],["#5f9fd0","#bcd9ea"],["#e7a85a","#f3d29a"],["#5b4e86","#c87e8a"],["#10182e","#243a63"]];

/* ===================== CONTEÚDO ===================== */
/* who = quem do conselho faz a pergunta (sabor narrativo) */
const TOPICS=[
{ name:"Estatística Descritiva", cases:[
  { dept:"Operações", who:"Presidente do conselho", title:"O tempo típico de entrega",
    scenario:"Vamos anunciar um número para o tempo típico de entrega. O histograma tem cauda longa à direita: a maioria recebe em 2 a 3 dias, mas alguns chegam a 12. Média 4,8 dias, mediana 3,0 dias.",
    consequence:"Você anunciou 4,8 dias, inflado pela cauda. Metade dos clientes achou exagero e a outra metade viu a promessa falhar. A campanha foi cancelada.",
    chart:'<svg viewBox="0 0 320 150"><line x1="18" y1="132" x2="306" y2="132" stroke="#3a4d5a"/><rect x="26" y="84" width="38" height="48" fill="#46D2E0"/><rect x="68" y="34" width="38" height="98" fill="#46D2E0"/><rect x="110" y="56" width="38" height="76" fill="#46D2E0"/><rect x="152" y="88" width="38" height="44" fill="#46D2E0"/><rect x="194" y="110" width="38" height="22" fill="#46D2E0"/><rect x="236" y="121" width="38" height="11" fill="#46D2E0"/><text x="162" y="146" fill="#8C95A3" font-size="10" text-anchor="middle">tempo de entrega (dias)</text></svg>',
    steps:[{ q:"Qual medida resume melhor o tempo típico?",
      opts:["Mediana (3,0 dias)","Média (4,8 dias)","O valor máximo (12)","A amplitude"], a:0,
      why:"Distribuição assimétrica à direita: a média é puxada pelos extremos. A <b>mediana</b> descreve o cliente típico." }] },

  { dept:"Financeiro", who:"Diretora financeira", title:"O pedido fora da curva",
    scenario:"O boxplot dos valores de pedido dá Q1 = R$20 e Q3 = R$60 (IQR = R$40; limite superior R$120). Surge um pedido de R$150, bem acima.",
    consequence:"Você apagou o pedido de R$150 sem investigar. Era um cliente empresarial recorrente; a receita ficou subestimada e compramos estoque a menos.",
    chart:'<svg viewBox="0 0 320 110"><line x1="18" y1="92" x2="306" y2="92" stroke="#3a4d5a"/><line x1="55" y1="46" x2="198" y2="46" stroke="#46D2E0" stroke-width="2"/><line x1="55" y1="36" x2="55" y2="56" stroke="#46D2E0" stroke-width="2"/><line x1="198" y1="36" x2="198" y2="56" stroke="#46D2E0" stroke-width="2"/><rect x="92" y="30" width="66" height="32" fill="rgba(70,210,224,.18)" stroke="#46D2E0" stroke-width="2"/><line x1="126" y1="30" x2="126" y2="62" stroke="#C9A24B" stroke-width="3"/><circle cx="276" cy="46" r="6" fill="#FF5A6A"/><text x="162" y="106" fill="#8C95A3" font-size="10" text-anchor="middle">valor do pedido (R$)</text></svg>',
    steps:[{ q:"Como tratar o pedido de R$150?",
      opts:["É um outlier: assinalar e investigar antes de decidir","Apagar na hora, é certamente erro","Ignorar o boxplot","Trocar pela média"], a:0,
      why:"Acima de Q3 + 1,5 × IQR é, por definição, um <b>outlier</b>. Assinale e entenda a causa, nunca apague às cegas." }] },

  { dept:"Controladoria", who:"Controller", title:"O que varia mais",
    scenario:"Duas variáveis com unidades diferentes: o preço tem coeficiente de variação CV = 12% e o tempo de entrega, CV = 48%.",
    consequence:"Você apontou o preço como o mais instável e travou promoções. Era a entrega que variava; os atrasos seguiram e as reclamações dispararam.",
    steps:[{ q:"Qual variável é relativamente mais dispersa?",
      opts:["Tempo de entrega (CV = 48%)","Preço (CV = 12%)","Têm a mesma dispersão","Não dá para comparar"], a:0,
      why:"O <b>coeficiente de variação</b> mede a dispersão relativa à média e compara variáveis em unidades diferentes." }] },

  { dept:"Logística", who:"Diretor de operações", title:"Duas transportadoras",
    scenario:"A e B têm o mesmo tempo médio de 3 dias. O desvio padrão de A é 0,4 dia; o de B, 1,8 dia.",
    consequence:"Você escolheu a mais imprevisível achando que dava no mesmo. As entregas viraram loteria e a taxa de atraso explodiu.",
    steps:[{ q:"Qual transportadora é mais consistente?",
      opts:["A (menor desvio padrão)","B (maior desvio padrão)","São iguais","Não dá para saber"], a:0,
      why:"Com a mesma média, o <b>menor desvio padrão</b> indica menor variabilidade: entregas mais previsíveis." }] }
]},

{ name:"Inferência Paramétrica", cases:[
  { dept:"Marketing", who:"Diretora de marca", title:"A média que prometemos",
    scenario:"Divulgamos que a satisfação média é 8 em 10. Você coletou uma amostra grande (n = 200) para testar a afirmação.",
    consequence:"Você validou a média de 8 sem rejeitar H0 quando a realidade era 7,36. O órgão de defesa do consumidor multou a empresa por propaganda enganosa.",
    steps:[
      { q:"Qual teste aplicar?",
        opts:["Teste t para uma amostra","Teste para uma proporção","Qui-quadrado de aderência","Kruskal-Wallis"], a:0,
        why:"Comparar <b>uma média</b> com um valor de referência (8), com amostra grande, leva ao teste t para uma amostra." },
      { q:"Com α = 0,05, qual a decisão?",
        console:'> t.test(satisfacao, mu = 8)\n\nt = -3.95,  df = 199,  <span class="k">p-value = 0.0001</span>\nmean of x = 7.36',
        opts:["Rejeitar H0","Não rejeitar H0"], a:0,
        why:"p < 0,05: <b>rejeita-se H0</b>. A média real (7,36) difere de 8 de forma significativa." }] },

  { dept:"Administração", who:"Presidente do conselho", title:"A meta dos 70%",
    scenario:"A meta interna é 70% de clientes muito satisfeitos (nota ≥ 8). Numa amostra de 200, você observou 124.",
    consequence:"Você disse que a meta de 70% estava batida quando o real era 62%. Expandimos com base nisso, as vendas não acompanharam e seu setor foi cortado.",
    steps:[
      { q:"Qual teste aplicar?",
        opts:["Teste para uma proporção","Teste t para uma amostra","Qui-quadrado de independência","Regressão linear"], a:0,
        why:"A questão é sobre uma <b>proporção</b> comparada com um valor de referência (0,70)." },
      { q:"Com α = 0,05, qual a decisão?",
        console:'> prop.test(124, 200, p = 0.70)\n\nX-squared = 4.30,  df = 1,  <span class="k">p-value = 0.038</span>\nestimate p = 0.620',
        opts:["Rejeitar H0","Não rejeitar H0"], a:0,
        why:"p < 0,05: <b>rejeita-se H0</b>. A proporção real (62%) é significativamente menor que 70%." }] },

  { dept:"BI", who:"Cientista-chefe", title:"O que é o valor-p",
    scenario:"Num teste, você obteve valor-p = 0,03. O conselho quer saber o que esse número significa, em uma frase.",
    consequence:"Você disse que há 3% de chance de H0 ser verdadeira. O conselho passou a tratar valor-p como probabilidade da hipótese e errou várias decisões.",
    steps:[{ q:"Qual a interpretação correta?",
      opts:["Probabilidade de um resultado tão ou mais extremo que o observado, supondo H0 verdadeira","Probabilidade de H0 ser verdadeira","Probabilidade de H1 ser verdadeira","Probabilidade de errar na conclusão"], a:0,
      why:"O <b>valor-p</b> mede quão incomuns são os dados sob H0. Não é a probabilidade de H0 nem de H1." }] },

  { dept:"Riscos", who:"Diretor de riscos", title:"O peso do α = 0,05",
    scenario:"Adotamos α = 0,05 em todos os testes. Explique ao conselho que risco esse valor controla.",
    consequence:"Você confundiu α com chance de acertar e relaxou o critério em testes críticos. Alarmes falsos se multiplicaram e a operação parou sem motivo.",
    steps:[{ q:"O que representa α = 0,05?",
      opts:["A probabilidade de rejeitar H0 quando ela é verdadeira (erro tipo I)","A probabilidade de aceitar H0 quando ela é falsa","A probabilidade de o teste estar certo","A probabilidade de a amostra ser representativa"], a:0,
      why:"α é o risco de <b>erro tipo I</b>: rejeitar H0 sendo verdadeira. Fixá-lo em 0,05 limita esse risco a 5%." }] }
]},

{ name:"Inferência Não Paramétrica", cases:[
  { dept:"Qualidade", who:"Diretora de qualidade", title:"Canal e reclamações",
    scenario:"Suspeita-se que o método de compra (online, app, loja) influencie a chance de reclamar. Você cruzou as duas variáveis numa tabela de contingência.",
    consequence:"Você concluiu que o canal causava reclamações e refez o app; mas eram independentes. O problema real ficou sem solução e R$200 mil foram pro ralo.",
    steps:[
      { q:"Qual teste aplicar?",
        opts:["Qui-quadrado de independência","Qui-quadrado de aderência","Teste t para duas amostras","ANOVA"], a:0,
        why:"Duas variáveis <b>categóricas</b> cruzadas, buscando associação, levam ao qui-quadrado de independência." },
      { q:"Com α = 0,05, qual a decisão?",
        console:'> chisq.test(table(metodo, reclamou))\n\nX-squared = 0.954,  df = 2,  <span class="k">p-value = 0.62</span>',
        opts:["Rejeitar H0","Não rejeitar H0"], a:1,
        why:"p > 0,05: <b>não se rejeita H0</b>. Canal de compra e reclamações são independentes." }] },

  { dept:"Logística", who:"Diretor de operações", title:"Modelar a entrega",
    scenario:"Queremos simular a frota assumindo que o tempo de entrega segue uma Exponencial (λ ≈ 0,32). Você testou esse ajuste antes.",
    consequence:"Você assumiu a Exponencial mesmo com p < 0,05. A simulação ficou inválida, a frota foi mal dimensionada e os pedidos acumularam por semanas.",
    steps:[
      { q:"Qual teste de aderência usar para essa variável contínua?",
        opts:["Kolmogorov-Smirnov","Qui-quadrado de independência","Teste t para uma amostra","Mann-Whitney-Wilcoxon"], a:0,
        why:"Ajustar uma variável <b>contínua</b> a uma distribuição teórica especificada leva ao Kolmogorov-Smirnov." },
      { q:"Com α = 0,05, qual a decisão?",
        console:'> ks.test(tempo, "pexp", rate = 0.32)\n\nD = 0.348,  <span class="k">p-value < 2.2e-16</span>',
        opts:["Rejeitar H0","Não rejeitar H0"], a:0,
        why:"p < 0,05: <b>rejeita-se H0</b>. O tempo de entrega não segue uma Exponencial." }] },

  { dept:"Experiência", who:"Diretora de CX", title:"Satisfação em três canais",
    scenario:"Comparamos a satisfação entre três grupos (online, app, loja). Os testes de normalidade falharam nos três.",
    consequence:"Você usou ANOVA sem normalidade e a conclusão saiu inválida. Realocamos equipes com base nela e a satisfação caiu em todos os canais.",
    steps:[{ q:"Qual teste aplicar?",
      opts:["Kruskal-Wallis","ANOVA de um fator","Mann-Whitney-Wilcoxon","Teste t para duas amostras"], a:0,
      why:"Comparar <b>três grupos independentes</b> sem normalidade leva ao Kruskal-Wallis." }] },

  { dept:"BI", who:"Cientista-chefe", title:"Dois rankings",
    scenario:"Temos dois rankings ordinais dos produtos: um por qualidade percebida, outro por preço. Queremos medir a associação entre eles.",
    consequence:"Você usou Pearson em rankings ordinais e o número saiu enganoso. A política de preços foi atrelada a uma relação que não existia.",
    steps:[{ q:"Qual medida de associação usar?",
      opts:["Correlação de Spearman (postos)","Correlação de Pearson","Qui-quadrado de aderência","Teste t para duas amostras"], a:0,
      why:"Para <b>variáveis ordinais</b> ou relações monótonas, usa-se a correlação de postos de Spearman." }] }
]},

{ name:"Regressão Linear", cases:[
  { dept:"Estratégia", who:"Presidente do conselho", title:"Prever pela via do preço",
    scenario:"Queremos entender e prever a satisfação a partir do preço pago, com uma equação que dê previsões.",
    consequence:"Você escolheu um teste de comparação de grupos quando precisava de um modelo preditivo. Sem equação, o pricing errou todos os reajustes.",
    steps:[{ q:"Qual método aplicar?",
      opts:["Regressão linear simples","Teste t para duas amostras","Qui-quadrado de independência","Kruskal-Wallis"], a:0,
      why:"<b>Prever</b> uma quantitativa a partir de outra quantitativa e quantificar a relação leva à regressão linear simples." }] },

  { dept:"Estratégia", who:"Diretor de estratégia", title:"O coeficiente do preço",
    scenario:"Você ajustou satisfação ~ preço. O conselho quer a leitura do coeficiente do preço e a previsão para um pedido de R$50.",
    consequence:"Você confundiu a escala do coeficiente e prometeu que +R$1 elevaria a satisfação em 1,4 ponto. Subimos preços esperando clientes felizes e veio o oposto.",
    steps:[
      { q:"Como interpretar β1 = 0,014 (p = 0,0004)?",
        console:'> lm(satisfacao ~ preco)\n\n(Intercept)  4.810   <2e-16\npreco        0.014   <span class="k">0.0004</span>\nR-squared: 0.061',
        opts:["A cada R$1 a mais, a satisfação prevista sobe 0,014 ponto, e o efeito é significativo","A cada R$1 a mais, sobe 1,4 ponto","O preço não tem efeito, pois β1 é pequeno","β1 é a satisfação quando o preço é zero"], a:0,
        why:"β1 é o <b>declive</b>: variação esperada em Y por unidade de X. Com p < 0,05, o efeito é significativo." },
      { q:"Modelo: satisfação = 4,81 + 0,014 × preço. Para R$50, a previsão é:",
        opts:["≈ 5,51","≈ 4,82","≈ 11,8","≈ 0,70"], a:0,
        why:"4,81 + 0,014 × 50 = 4,81 + 0,70 = <b>5,51</b>." }] },

  { dept:"Direção de Dados", who:"Cientista-chefe", title:"O modelo múltiplo",
    scenario:"Acrescentamos o tempo de entrega: satisfação ~ preço + tempo. Leia o efeito da entrega no quadro.",
    consequence:"Você leu o sinal de β2 ao contrário e disse que entregas mais lentas deixavam clientes mais felizes. Afrouxamos prazos e despencamos nos rankings.",
    steps:[{ q:"Qual coeficiente mede o efeito do tempo de entrega e como se lê?",
      console:'> lm(satisfacao ~ preco + tempo)\n\n(Intercept)     5.200   <2e-16\npreco           0.012   0.003\ntempo          -0.350   <span class="k">1.2e-07</span>\nR-squared: 0.21',
      opts:["β2 = -0,35: cada dia a mais reduz a satisfação prevista em 0,35 ponto (significativo)","β2 = -0,35: cada dia a mais aumenta 0,35 ponto","β1 = 0,012 é o efeito do tempo","O tempo não é significativo"], a:0,
      why:"β2 é o coeficiente do tempo. Sinal <b>negativo</b> e p < 0,05: mais demora, menos satisfação, mantendo o preço fixo." }] },

  { dept:"Operações", who:"Diretor de operações", title:"A reta que desce",
    scenario:"O diagrama de dispersão mostra a satisfação contra o tempo de entrega, com a reta ajustada (em âmbar) descendente.",
    consequence:"Você tratou a queda como irrelevante e ignorou o efeito do atraso. Os prazos pioraram e a satisfação despencou junto.",
    chart:'<svg viewBox="0 0 320 150"><line x1="30" y1="16" x2="30" y2="124" stroke="#3a4d5a"/><line x1="30" y1="124" x2="305" y2="124" stroke="#3a4d5a"/><line x1="40" y1="36" x2="290" y2="116" stroke="#C9A24B" stroke-width="2"/><circle cx="52" cy="42" r="4" fill="#46D2E0"/><circle cx="78" cy="50" r="4" fill="#46D2E0"/><circle cx="98" cy="46" r="4" fill="#46D2E0"/><circle cx="120" cy="60" r="4" fill="#46D2E0"/><circle cx="140" cy="64" r="4" fill="#46D2E0"/><circle cx="160" cy="72" r="4" fill="#46D2E0"/><circle cx="182" cy="78" r="4" fill="#46D2E0"/><circle cx="204" cy="86" r="4" fill="#46D2E0"/><circle cx="228" cy="96" r="4" fill="#46D2E0"/><circle cx="252" cy="104" r="4" fill="#46D2E0"/><circle cx="276" cy="112" r="4" fill="#46D2E0"/><text x="34" y="13" fill="#8C95A3" font-size="9">satisfação</text><text x="302" y="138" fill="#8C95A3" font-size="9" text-anchor="end">tempo de entrega</text></svg>',
    steps:[{ q:"Como interpretar a inclinação da reta?",
      opts:["Coeficiente negativo: mais tempo, menor satisfação prevista","Coeficiente positivo: mais tempo, maior satisfação","Não há relação","A reta é só a média da satisfação"], a:0,
      why:"Reta <b>descendente</b>: coeficiente negativo. A satisfação prevista cai conforme o tempo de entrega aumenta." }] }
]}
];

/* ===================== ÁUDIO (sintetizado, sem arquivos) ===================== */
let muted=false, ac=null;
function audio(){ if(!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ ac=null; } } return ac; }
function tone(freq,dur,type,vol){ if(muted) return; const c=audio(); if(!c) return;
  const o=c.createOscillator(), g=c.createGain(); o.type=type||'sine'; o.frequency.value=freq;
  o.connect(g); g.connect(c.destination); const t=c.currentTime;
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol||.12,t+.02); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.start(t); o.stop(t+dur); }
const sndOk=()=>{ tone(660,.12,'sine',.1); setTimeout(()=>tone(880,.18,'sine',.1),90); };
const sndBad=()=>{ tone(150,.34,'sawtooth',.14); setTimeout(()=>tone(110,.4,'sawtooth',.12),120); };
const sndUp=()=>{ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.22,'triangle',.1),i*90)); };
const sndClick=()=>tone(420,.05,'square',.05);

/* ===================== ESTADO ===================== */
let ti=0,ci=0,si=0,score=0,best=0,lock=false;
const $=id=>document.getElementById(id);
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const topicSteps=t=>TOPICS[t].cases.reduce((a,c)=>a+c.steps.length,0);
const doneSteps=()=>{let n=si;for(let k=0;k<ci;k++)n+=TOPICS[ti].cases[k].steps.length;return n;};

/* humor do conselho */
function setMood(c){ $('scene').style.setProperty('--mood',c);
  document.querySelectorAll('.exec .body').forEach(b=>b.style.stroke=c); }
function applySky(idx){ const s=SKIES[Math.min(idx,SKIES.length-1)];
  document.documentElement.style.setProperty('--sky-1',s[0]);
  document.documentElement.style.setProperty('--sky-2',s[1]);
  $('stars').style.opacity = idx>=3 ? '1':'0'; }

/* desenha skyline + estrelas uma vez */
function drawScenery(){
  let b='', x=0; const seed=[60,90,40,110,75,50,95,70,120,55,85];
  let i=0; while(x<400){ const w=24+seed[i%seed.length]%20; const h=seed[i%seed.length];
    b+=`<rect x="${x}" y="${140-h}" width="${w}" height="${h}" fill="#0c1422" opacity="${.55+(i%3)*.12}"/>`;
    // janelinhas
    for(let wy=140-h+8; wy<134; wy+=12){ for(let wx=x+4; wx<x+w-4; wx+=10){
      if(Math.random()>.5) b+=`<rect x="${wx}" y="${wy}" width="4" height="6" fill="#f2c66a" opacity=".5"/>`; } }
    x+=w+6; i++; }
  $('skyline').innerHTML=b;
  let st=''; for(let k=0;k<40;k++){ st+=`<circle cx="${Math.random()*400}" cy="${Math.random()*90}" r="${Math.random()*1.1+.3}" fill="#dfe9ff" opacity="${Math.random()*.7+.2}"/>`; }
  $('stars').innerHTML=`<svg viewBox="0 0 400 140" preserveAspectRatio="none" style="width:100%;height:100%">${st}</svg>`;
}
function drawBoard(){
  const exec=`<svg viewBox="0 0 80 90"><path class="body" d="M40 6 a16 16 0 0 1 16 16 a16 16 0 0 1 -8 13 c14 4 24 14 24 30 v25 H8 v-25 c0 -16 10 -26 24 -30 a16 16 0 0 1 -8 -13 a16 16 0 0 1 16 -16 Z"/></svg>`;
  $('board').innerHTML = Array(5).fill(0).map(()=>`<div class="exec">${exec}</div>`).join('');
}

/* ===================== TELAS ===================== */
function showStage(on){ ['hud','scene','table'].forEach(id=>$(id).style.display = on?'':'none'); }

function startScreen(){
  showStage(false);
  $('curtain').innerHTML=`<div class="curtain">
    <span class="eyebrow">Conselho de Administração · ${COMPANY}</span>
    <h1>A Sala de Reunião</h1>
    <p>Você entra como <b style="color:var(--ink)">${RANKS[0]}</b>. Diante do conselho, a cada ponto da pauta você escolhe o método certo e lê os dados no telão. Ganhe o favor da mesa para ser promovido.</p>
    <div class="ladder">
      ${TOPICS.map((t,i)=>`<div><b>0${i+1}</b><span>${t.name} · favor do conselho leva a <b style="color:var(--brass)">${RANKS[i+1]}</b></span></div>`).join('')}
    </div>
    <p style="color:var(--bad)">Uma decisão errada e o conselho demite você na hora, com direito a tomate. A vaga reabre e você reapresenta o setor.</p>
    <button class="start" id="go">Entrar na sala</button>
  </div>`;
  $('go').onclick=()=>{ audio(); ti=0;ci=0;si=0;score=0;best=Math.max(best,0); enterRoom(); };
  $('go').focus();
}

function enterRoom(){
  $('curtain').innerHTML=''; showStage(true);
  drawScenery(); drawBoard(); applySky(ti); setMood('#5e6b82');
  render();
}

function hud(){
  $('h-rank').textContent=RANKS[ti];
  $('h-score').textContent='⭐ '+score;
  $('h-favor').style.width=(doneSteps()/topicSteps(ti)*100)+'%';
  $('nameplate').textContent=RANKS[ti].toUpperCase();
}

function render(){
  lock=false;
  const c=TOPICS[ti].cases[ci], step=c.steps[si];
  hud(); setMood('#5e6b82'); $('scene').classList.add('idle'); $('scene').classList.remove('nod','stand');
  // telão
  $('screen').classList.remove('glitch');
  $('screen').innerHTML=`
    <div class="scr-eyebrow">${TOPICS[ti].name} · ponto ${ci+1} de ${TOPICS[ti].cases.length}</div>
    ${ si===0 ? `<h2 class="scr-title">${c.title}</h2><div class="scr-body">${c.scenario}</div>` 
              : `<h2 class="scr-title">${c.title}</h2><div class="scr-body">Continuação do ponto, etapa ${si+1}.</div>` }
    ${ si===0 && c.chart ? `<div class="chart">${c.chart}</div>` : '' }
    ${ step.console ? `<div class="console">${step.console}</div>` : '' }`;
  // mesa
  const order=shuffle(step.opts.map((_,i)=>i));
  $('play').innerHTML=`
    <div class="ask"><span class="who">${c.who} pergunta</span>${step.q}</div>
    <div class="opts" id="opts">
      ${order.map((orig,pos)=>`<button class="opt" data-o="${orig}"><span class="ltr">${String.fromCharCode(65+pos)}</span>${step.opts[orig]}</button>`).join('')}
    </div>
    <div class="verdict" id="verdict"></div>
    <button class="act" id="act">Apresentar próximo ponto</button>`;
  document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>answer(parseInt(b.dataset.o),b));
}

function answer(orig,btn){
  if(lock) return; lock=true;
  const c=TOPICS[ti].cases[ci], step=c.steps[si];
  document.querySelectorAll('.opt').forEach(b=>{ b.disabled=true; if(parseInt(b.dataset.o)===step.a) b.classList.add('ok'); });
  if(orig===step.a){
    btn.classList.add('ok'); sndOk();
    score+=10; $('h-score').textContent='⭐ '+score;
    $('h-favor').style.width=((doneSteps()+1)/topicSteps(ti)*100)+'%';
    $('scene').classList.remove('idle'); setMood('#5BD6A6');
    $('scene').classList.add('nod'); setTimeout(()=>$('scene').classList.remove('nod'),500);
    const v=$('verdict'); v.className='verdict show'; v.innerHTML='✓ '+step.why;
    const a=$('act'); a.classList.add('show'); a.onclick=advance; a.focus();
  } else {
    btn.classList.add('no'); sndBad();
    $('scene').classList.remove('idle'); setMood('#FF5A6A');
    $('scene').classList.add('stand'); $('screen').classList.add('glitch');
    tomato(()=>firedScreen(c,step));
  }
}

function advance(){
  const c=TOPICS[ti].cases[ci]; si++;
  if(si<c.steps.length){ render(); return; }
  si=0; ci++;
  if(ci<TOPICS[ti].cases.length){ render(); return; }
  ci=0;
  if(ti<TOPICS.length-1) promotion(ti+1);
  else { saveBest(); winScreen(); }
}
function saveBest(){ if(score>best) best=score; }

/* ---------- efeitos ---------- */
function tomato(done){
  if(REDUCED){ done(); return; }
  const fx=$('fx');
  const t=document.createElement('div'); t.className='tomato';
  t.innerHTML='<svg viewBox="0 0 100 100"><ellipse cx="50" cy="58" rx="38" ry="36" fill="#E23B3B"/><ellipse cx="38" cy="46" rx="12" ry="8" fill="#ff7676" opacity=".55"/><path d="M50 22 l-9 -8 M50 22 l0 -13 M50 22 l9 -8" stroke="#3FAE5A" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="24" r="6" fill="#3FAE5A"/></svg>';
  fx.appendChild(t); requestAnimationFrame(()=>t.classList.add('fly'));
  t.addEventListener('animationend',()=>{
    t.remove();
    const s=document.createElement('div'); s.className='splat';
    s.innerHTML='<svg viewBox="0 0 200 200"><path d="M100 28 C132 32 138 60 152 70 C178 80 182 112 158 122 C172 148 138 162 118 150 C108 178 72 176 68 150 C42 160 22 134 40 114 C18 104 26 72 52 70 C56 42 80 28 100 28 Z" fill="#D32F2F"/><circle cx="34" cy="60" r="9" fill="#C62828"/><circle cx="170" cy="92" r="11" fill="#C62828"/></svg>';
    fx.appendChild(s); requestAnimationFrame(()=>s.classList.add('go'));
    $('app').classList.add('shake');
    setTimeout(()=>{ $('app').classList.remove('shake'); s.remove(); done(); },650);
  },{once:true});
}
function confetti(){
  if(REDUCED) return;
  const fx=$('fx'), cols=['#C9A24B','#46D2E0','#F2A65A','#5BD6A6','#ECE7DD'];
  for(let i=0;i<48;i++){ const p=document.createElement('div'); p.className='confetti';
    p.style.left=Math.random()*100+'vw'; p.style.background=cols[i%cols.length];
    p.style.animationDuration=(1.4+Math.random()*1.3)+'s'; p.style.animationDelay=(Math.random()*.4)+'s';
    fx.appendChild(p); requestAnimationFrame(()=>p.classList.add('go')); setTimeout(()=>p.remove(),3000); }
}

function promotion(idx){
  saveBest(); sndUp(); confetti();
  applySky(idx); setMood('#5BD6A6');
  $('nameplate').classList.add('shine'); setTimeout(()=>$('nameplate').classList.remove('shine'),1100);
  const b=document.createElement('div'); b.className='promo';
  b.innerHTML=`<div class="e">Promovido</div><h3>${RANKS[idx]}</h3>
    <p>O conselho aprovou seu trabalho em ${TOPICS[idx-1].name}. Próxima pauta: ${TOPICS[idx].name}.</p>
    <button class="start" id="pg">Assumir o cargo</button>`;
  document.body.appendChild(b); requestAnimationFrame(()=>b.classList.add('show'));
  $('pg').onclick=()=>{ b.remove(); ti=idx;ci=0;si=0; applySky(ti); render(); $('h-rank').textContent=RANKS[ti]; };
  $('pg').focus();
}

function firedScreen(c,step){
  saveBest();
  setTimeout(()=>{
    showStage(false);
    const right=step.opts[step.a];
    $('curtain').innerHTML=`<div class="curtain fired">
      <span class="eyebrow" style="color:var(--bad)">Reunião encerrada</span>
      <h1>🍅 Demitido</h1>
      <p>O conselho dispensou você como <b style="color:var(--ink)">${RANKS[ti]}</b>, na pauta de ${TOPICS[ti].name}.</p>
      <div class="consq"><span class="l">Consequência para o negócio</span>${c.consequence}</div>
      <div class="right">Resposta certa: <b>${right}</b>. ${step.why}</div>
      <p style="font-size:13px;color:var(--mut)">Pontos: ${score} · Melhor cargo: ${RANKS[ti]}</p>
      <button class="start" id="rt">Reapresentar a pauta de ${TOPICS[ti].name}</button>
    </div>`;
    $('rt').onclick=()=>{ ci=0;si=0; showStage(true); applySky(ti); render(); };
    $('rt').focus();
  }, 200);
}

function winScreen(){
  saveBest(); sndUp(); confetti(); setTimeout(confetti,500);
  showStage(false);
  $('curtain').innerHTML=`<div class="curtain">
    <div class="star">★</div>
    <h1>Cientista de Dados Chefe</h1>
    <p>Você atravessou todo o conselho da ${COMPANY}: descritiva, inferência paramétrica e não paramétrica, e regressão. A mesa é sua agora.</p>
    <p style="font-size:14px;color:var(--mut)">Pontuação final: <b style="color:var(--ink)">${score}</b></p>
    <button class="start" id="again">Jogar de novo</button>
  </div>`;
  $('again').onclick=()=>{ ti=0;ci=0;si=0;score=0; startScreen(); };
  $('again').focus();
}

/* mute */
$('h-mute').onclick=()=>{ muted=!muted; $('h-mute').textContent=muted?'🔇':'🔊'; if(!muted){ audio(); sndClick(); } };

startScreen();
