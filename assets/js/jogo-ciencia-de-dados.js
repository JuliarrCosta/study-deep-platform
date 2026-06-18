/* =========================================================
   NimbusShop — A Carreira do Analista (Ciência de Dados)
   Escolha do teste, leitura de output do R, interpretação de
   gráficos e regressão. Demissão (com tomate) reinicia o setor;
   cada bloco dominado é uma promoção.
   Integrado ao padrão da plataforma: monta em #game e usa as
   classes/variáveis do main.css. Exposto via window.mountCienciaDados.
   ========================================================= */
(function(){
"use strict";
const BEST_KEY='sdp_jogo_nimbus_best';
const COMPANY="NimbusShop";
const RANKS=["Estagiário de Dados","Analista Júnior","Analista de Dados","Analista Sênior","Cientista de Dados Chefe"];
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const TOPICS = [
{
 name:"Estatística Descritiva",
 cases:[
  { dept:"Operações", title:"O tempo típico de entrega",
    scenario:"A diretora quer divulgar um número para o tempo típico de entrega. O histograma tem cauda longa à direita: a maioria recebe em 2 a 3 dias, mas alguns pedidos chegam a 12. Resumo: média = 4,8 dias, mediana = 3,0 dias.",
    consequence:"Você divulgou 4,8 dias como tempo típico, inflado pela cauda. Metade dos clientes achou a promessa exagerada e a outra metade a viu falhar. A confiança caiu e a campanha foi cancelada.",
    steps:[{ prompt:"Qual medida resume melhor o tempo típico?",
      options:["Mediana (3,0 dias)","Média (4,8 dias)","Máximo (12 dias)","Amplitude total"], correct:0,
      explain:"Numa distribuição assimétrica à direita, a média é puxada pelos valores extremos. A <b>mediana</b> resiste a outliers e descreve o cliente típico." }] },

  { dept:"Financeiro", title:"O pedido fora da curva",
    scenario:"Você analisa os valores dos pedidos. O boxplot dá Q1 = R$20 e Q3 = R$60, logo IQR = R$40 e o limite superior Q3 + 1,5 × IQR = R$120. Aparece um pedido de R$150, bem acima desse limite.",
    consequence:"Você apagou o pedido de R$150 sem investigar. Era um cliente empresarial real e recorrente. A receita ficou subestimada e o financeiro comprou estoque a menos para o trimestre seguinte.",
    steps:[{ prompt:"Como tratar o valor de R$150?",
      options:["É um outlier: assinalar e investigar a causa antes de decidir","Apagar na hora, é certamente um erro","Ignorar o boxplot, R$150 é normal","Substituir automaticamente pela média"], correct:0,
      explain:"Acima de Q3 + 1,5 × IQR é, por definição, um <b>outlier</b>. Boa prática: assinalar e entender a origem, nunca apagar às cegas." }] },

  { dept:"Controladoria", title:"Qual variável varia mais",
    scenario:"Você compara a dispersão de duas variáveis com unidades diferentes. O preço tem coeficiente de variação CV = 12% e o tempo de entrega tem CV = 48%.",
    consequence:"Você concluiu que o preço era a variável mais instável e travou promoções. Na verdade era a entrega que variava demais; os atrasos seguiram sem controle e as reclamações dispararam.",
    steps:[{ prompt:"Qual variável é relativamente mais dispersa?",
      options:["Tempo de entrega (CV = 48%)","Preço (CV = 12%)","As duas têm a mesma dispersão","Não dá para comparar variáveis diferentes"], correct:0,
      explain:"O <b>coeficiente de variação</b> mede a dispersão relativa à média e permite comparar variáveis em unidades diferentes. Maior CV, maior variabilidade relativa." }] },

  { dept:"Marketing", title:"Visualizar o canal de compra",
    scenario:"Você precisa mostrar num gráfico a distribuição da variável método de compra, que assume os valores online, app e loja física.",
    consequence:"Você usou um histograma para uma variável categórica. O gráfico saiu sem sentido, a diretoria não entendeu nada e o relatório foi devolvido.",
    steps:[{ prompt:"Qual gráfico é o mais adequado?",
      options:["Gráfico de barras","Histograma","Diagrama de dispersão","Gráfico de linha temporal"], correct:0,
      explain:"Para uma variável <b>qualitativa</b> usa-se gráfico de barras ou de setores. O histograma é para variáveis quantitativas contínuas." }] },

  { dept:"Qualidade de Dados", title:"Classificar a variável",
    scenario:"Antes de escolher os métodos, você precisa classificar a variável método de compra (online, app, loja), que não tem ordem natural entre as categorias.",
    consequence:"Você tratou a variável como quantitativa e calculou uma média de método de compra. O resultado não fazia sentido e contaminou toda a análise seguinte.",
    steps:[{ prompt:"Como se classifica essa variável?",
      options:["Qualitativa nominal","Qualitativa ordinal","Quantitativa discreta","Quantitativa contínua"], correct:0,
      explain:"Categorias <b>sem ordem</b> são qualitativas nominais. Se houvesse ordem (baixo, médio, alto) seria ordinal; valores numéricos contáveis seriam quantitativos." }] },

  { dept:"Comercial", title:"A categoria mais comum",
    scenario:"A diretoria quer saber qual o canal de compra mais usado. A tabela de frequências mostra: app com 96 clientes, online com 64 e loja com 40.",
    consequence:"Você reportou a média dos códigos das categorias em vez da mais frequente. A diretoria investiu no canal errado e o canal mais usado ficou sem suporte.",
    steps:[{ prompt:"Qual medida responde 'o canal mais usado'?",
      options:["A moda (app)","A média","A mediana","O desvio padrão"], correct:0,
      explain:"Para variáveis categóricas, a medida de tendência central é a <b>moda</b>: a categoria mais frequente." }] },

  { dept:"Operações", title:"Lendo o boxplot",
    scenario:"Você apresenta um boxplot do tempo de entrega. Um colega pergunta o que representa a linha dentro da caixa.",
    consequence:"Você disse que a linha era a média. A equipe planejou as escalas com base num valor errado e os turnos ficaram mal dimensionados.",
    steps:[{ prompt:"O que representa a linha dentro da caixa do boxplot?",
      options:["A mediana","A média","O valor máximo","O desvio padrão"], correct:0,
      explain:"No boxplot, a linha central é a <b>mediana</b>; as bordas da caixa são o 1º e o 3º quartis (Q1 e Q3)." }] },

  { dept:"Estratégia", title:"Relação entre preço e satisfação",
    scenario:"Você quer visualizar, de forma exploratória, a relação entre duas variáveis quantitativas: o preço pago e a satisfação.",
    consequence:"Você escolheu um gráfico de pizza para duas variáveis quantitativas. Ninguém conseguiu ver a relação e a hipótese promissora foi descartada cedo demais.",
    steps:[{ prompt:"Qual gráfico mostra melhor essa relação?",
      options:["Diagrama de dispersão","Gráfico de setores (pizza)","Gráfico de barras empilhadas","Histograma do preço"], correct:0,
      explain:"Para a relação entre <b>duas variáveis quantitativas</b>, o diagrama de dispersão é o gráfico exploratório padrão." }] },

  { dept:"Operações", title:"O percentil 90",
    scenario:"Um pedido específico está no percentil 90 do tempo de entrega da NimbusShop.",
    consequence:"Você interpretou o percentil ao contrário e classificou uma entrega muito lenta como rápida. As metas de SLA foram calibradas erradas e os atrasos passaram batido.",
    steps:[{ prompt:"O que significa estar no percentil 90 do tempo de entrega?",
      options:["90% dos pedidos têm tempo menor ou igual a esse","90% dos pedidos demoram mais do que esse","É o pedido com menor tempo de todos","É exatamente a média dos tempos"], correct:0,
      explain:"O <b>percentil 90</b> é o valor abaixo do qual estão 90% das observações. Aqui, é uma entrega entre as 10% mais lentas." }] },

  { dept:"Logística", title:"Duas transportadoras",
    scenario:"Duas transportadoras têm o mesmo tempo médio de entrega de 3 dias. A transportadora A tem desvio padrão de 0,4 dia; a B, de 1,8 dia.",
    consequence:"Você escolheu a transportadora mais imprevisível achando que na média dava no mesmo. As entregas viraram uma loteria e a taxa de atraso explodiu.",
    steps:[{ prompt:"Qual transportadora é mais consistente?",
      options:["A (menor desvio padrão)","B (maior desvio padrão)","São igualmente consistentes","Não dá para saber pela média e desvio"], correct:0,
      explain:"Com a mesma média, o <b>menor desvio padrão</b> indica menor variabilidade, ou seja, entregas mais consistentes e previsíveis." }] },

  { dept:"BI", title:"Interpretando o histograma",
    scenario:"O gráfico abaixo é o histograma do tempo de entrega dos pedidos.",
    consequence:"Você leu o histograma como simétrico e resumiu tudo pela média. O número saiu inflado pela cauda e a promessa ao cliente furou feio.",
    steps:[{ svg:'<svg viewBox="0 0 320 170"><line x1="20" y1="150" x2="305" y2="150" stroke="#2A3B5E"/><rect x="28" y="95" width="38" height="55" fill="#34D1C4"/><rect x="70" y="40" width="38" height="110" fill="#34D1C4"/><rect x="112" y="65" width="38" height="85" fill="#34D1C4"/><rect x="154" y="100" width="38" height="50" fill="#34D1C4"/><rect x="196" y="122" width="38" height="28" fill="#34D1C4"/><rect x="238" y="136" width="38" height="14" fill="#34D1C4"/><text x="162" y="166" fill="#7E91B5" font-size="11" text-anchor="middle">tempo de entrega (dias)</text></svg>',
      prompt:"Que tipo de assimetria o histograma mostra?",
      options:["Assimétrica à direita (positiva)","Assimétrica à esquerda (negativa)","Simétrica","Não dá para dizer pelo gráfico"], correct:0,
      explain:"A cauda longa se estende para a <b>direita</b> (valores altos): assimetria positiva. Nesses casos, a média fica maior que a mediana." }] },

  { dept:"Financeiro", title:"O ponto solto no boxplot",
    scenario:"O boxplot abaixo resume os valores dos pedidos.",
    consequence:"Você confundiu o ponto isolado com a mediana e descreveu o pedido típico como gigante. O estoque foi planejado para uma demanda que não existia.",
    steps:[{ svg:'<svg viewBox="0 0 320 120"><line x1="20" y1="100" x2="305" y2="100" stroke="#2A3B5E"/><line x1="60" y1="50" x2="200" y2="50" stroke="#34D1C4" stroke-width="2"/><line x1="60" y1="40" x2="60" y2="60" stroke="#34D1C4" stroke-width="2"/><line x1="200" y1="40" x2="200" y2="60" stroke="#34D1C4" stroke-width="2"/><rect x="95" y="32" width="70" height="36" fill="rgba(52,209,196,0.18)" stroke="#34D1C4" stroke-width="2"/><line x1="130" y1="32" x2="130" y2="68" stroke="#F6C667" stroke-width="3"/><circle cx="275" cy="50" r="6" fill="#FF5C7A"/><text x="162" y="113" fill="#7E91B5" font-size="11" text-anchor="middle">valor do pedido (R$)</text></svg>',
      prompt:"O ponto isolado, longe da caixa e do bigode, representa o quê?",
      options:["Um outlier","A mediana","O terceiro quartil","A média"], correct:0,
      explain:"Valores além de Q3 + 1,5 × IQR aparecem soltos no boxplot: são <b>outliers</b>. A linha colorida dentro da caixa é a mediana." }] },

  { dept:"Comercial", title:"A barra mais alta",
    scenario:"O gráfico de barras mostra a quantidade de clientes por canal de compra.",
    consequence:"Você apontou o canal errado como o mais usado e o suporte foi dimensionado para o lugar errado. As filas explodiram no canal mais movimentado.",
    steps:[{ svg:'<svg viewBox="0 0 320 180"><line x1="25" y1="150" x2="300" y2="150" stroke="#2A3B5E"/><rect x="45" y="30" width="60" height="120" fill="#34D1C4"/><rect x="135" y="70" width="60" height="80" fill="#34D1C4"/><rect x="225" y="100" width="60" height="50" fill="#34D1C4"/><text x="75" y="167" fill="#7E91B5" font-size="12" text-anchor="middle">App</text><text x="165" y="167" fill="#7E91B5" font-size="12" text-anchor="middle">Online</text><text x="255" y="167" fill="#7E91B5" font-size="12" text-anchor="middle">Loja</text></svg>',
      prompt:"Qual canal é a moda (o mais frequente)?",
      options:["App","Online","Loja física","Não dá para ver no gráfico"], correct:0,
      explain:"A <b>moda</b> de uma variável categórica é a categoria com a maior barra. Aqui, o App." }] },

  { dept:"Logística", title:"Comparando dois boxplots",
    scenario:"Os boxplots A e B comparam o tempo de entrega de duas transportadoras com a mesma mediana.",
    consequence:"Você escolheu a transportadora mais dispersa achando que dava no mesmo. Os prazos viraram loteria e os atrasos dispararam.",
    steps:[{ svg:'<svg viewBox="0 0 320 150"><text x="16" y="46" fill="#7E91B5" font-size="13">A</text><line x1="120" y1="40" x2="200" y2="40" stroke="#34D1C4" stroke-width="2"/><line x1="120" y1="32" x2="120" y2="48" stroke="#34D1C4" stroke-width="2"/><line x1="200" y1="32" x2="200" y2="48" stroke="#34D1C4" stroke-width="2"/><rect x="140" y="28" width="45" height="24" fill="rgba(52,209,196,0.18)" stroke="#34D1C4" stroke-width="2"/><line x1="160" y1="28" x2="160" y2="52" stroke="#F6C667" stroke-width="3"/><text x="16" y="112" fill="#7E91B5" font-size="13">B</text><line x1="60" y1="105" x2="275" y2="105" stroke="#34D1C4" stroke-width="2"/><line x1="60" y1="95" x2="60" y2="115" stroke="#34D1C4" stroke-width="2"/><line x1="275" y1="95" x2="275" y2="115" stroke="#34D1C4" stroke-width="2"/><rect x="95" y="91" width="135" height="28" fill="rgba(52,209,196,0.18)" stroke="#34D1C4" stroke-width="2"/><line x1="160" y1="91" x2="160" y2="119" stroke="#F6C667" stroke-width="3"/></svg>',
      prompt:"Qual transportadora tem maior dispersão?",
      options:["B (caixa e bigodes mais largos)","A (caixa estreita)","As duas são iguais","Não dá para comparar"], correct:0,
      explain:"Com a mesma mediana, a transportadora com <b>caixa e bigodes mais largos</b> (B) tem maior variabilidade." }] }
 ]
},
{
 name:"Inferência Paramétrica",
 cases:[
  { dept:"Marketing", title:"A satisfação que a empresa promete",
    scenario:"A NimbusShop divulga que a satisfação média é 8 em 10. Você coleta uma amostra grande (n = 200) para testar a afirmação.",
    consequence:"Você não rejeitou H0 e validou a média de 8 publicamente quando a realidade era 7,36. O órgão de defesa do consumidor detectou o exagero e aplicou multa por propaganda enganosa.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Teste t para uma amostra","Teste para uma proporção","Qui-quadrado de aderência","Kruskal-Wallis"], correct:0,
       explain:"Comparar <b>uma média</b> com um valor de referência (8), com amostra grande, leva ao teste t para uma amostra." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> t.test(satisfacao, mu = 8)\n\n  One Sample t-test\n\nt = -3.95,  df = 199,  <span class="c-key">p-value = 0.0001</span>\nmean of x = 7.36',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, então <b>rejeita-se H0</b>. A média real (7,36) difere de 8 de forma significativa." }] },

  { dept:"Diretoria", title:"A meta dos 70%",
    scenario:"A meta interna é que 70% dos clientes estejam muito satisfeitos (satisfação maior ou igual a 8). Numa amostra de 200, você observa 124 nessas condições.",
    consequence:"Você concluiu que a meta de 70% estava batida quando o real era 62%. A diretoria expandiu confiando num cliente mais satisfeito do que o verdadeiro, as vendas não acompanharam e seu setor foi cortado.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Teste para uma proporção","Teste t para uma amostra","Qui-quadrado de independência","Regressão linear"], correct:0,
       explain:"A questão é sobre uma <b>proporção</b> comparada com um valor de referência (0,70)." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> prop.test(x = 124, n = 200, p = 0.70)\n\n  1-sample proportions test\n\nX-squared = 4.30,  df = 1,  <span class="c-key">p-value = 0.038</span>\nsample estimate p = 0.620',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: a proporção real (62%) é significativamente menor que 70%." }] },

  { dept:"Logística", title:"Tempo de entrega em duas regiões",
    scenario:"Você quer saber se o tempo médio de entrega difere entre a região Sul e a região Norte. As amostras são grandes e aproximadamente normais.",
    consequence:"Você ignorou a diferença real entre as regiões e padronizou o mesmo prazo para as duas. O Norte ficou cronicamente atrasado e perdeu participação de mercado.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Teste t para duas amostras independentes","Teste t para uma amostra","Qui-quadrado de aderência","Teste para uma proporção"], correct:0,
       explain:"Comparar <b>duas médias</b> de grupos independentes, com normalidade, leva ao teste t para duas amostras." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> t.test(tempo_entrega ~ regiao)\n\n  Welch Two Sample t-test\n\nt = 2.74,  df = 388,  <span class="c-key">p-value = 0.0064</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: há diferença significativa no tempo médio entre as regiões." }] },

  { dept:"Produto", title:"Antes e depois do novo site",
    scenario:"A NimbusShop reformou o site. Você mediu a satisfação dos MESMOS 80 clientes antes e depois da mudança e quer saber se houve melhora. Os dados são aproximadamente normais.",
    consequence:"Você tratou as duas medições como amostras independentes e perdeu o pareamento. O teste ficou sem potência, a melhora real passou despercebida e o projeto do novo site foi engavetado.",
    steps:[
     { prompt:"Qual teste é o mais adequado?",
       options:["Teste t para amostras emparelhadas","Teste t para duas amostras independentes","Teste para uma proporção","Qui-quadrado"], correct:0,
       explain:"Medições <b>antes e depois nos mesmos indivíduos</b> são pareadas; usa-se o teste t emparelhado." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> t.test(antes, depois, paired = TRUE)\n\n  Paired t-test\n\nt = -4.10,  df = 79,  <span class="c-key">p-value = 9.5e-05</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: a satisfação média mudou de forma significativa após a reforma." }] },

  { dept:"Qualidade", title:"Reclamações: online versus loja",
    scenario:"Você quer saber se a proporção de clientes que reclamam é diferente entre quem compra online e quem compra na loja física. As amostras são grandes.",
    consequence:"Você afirmou que os canais reclamavam igual sem testar. A loja, que reclamava muito mais, ficou sem ação corretiva e virou foco de processos.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Teste para a diferença entre duas proporções","Teste t para uma amostra","Kruskal-Wallis","Regressão linear simples"], correct:0,
       explain:"Comparar a <b>proporção de reclamações em dois grupos</b> leva ao teste para diferença de proporções." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> prop.test(c(58, 82), c(300, 300))\n\n  2-sample test for equality of proportions\n\nX-squared = 6.10,  df = 1,  <span class="c-key">p-value = 0.013</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: as proporções de reclamação diferem entre os canais." }] },

  { dept:"BI", title:"Lendo o intervalo de confiança",
    scenario:"Você calculou um intervalo de confiança de 95% para a satisfação média e obteve de 7,1 a 7,6.",
    consequence:"Você disse à diretoria que 95% dos clientes têm satisfação entre 7,1 e 7,6. A meta foi definida sobre essa leitura errada e ninguém entendeu por que tantos clientes ficavam fora da faixa.",
    steps:[{ prompt:"Qual a interpretação correta desse IC de 95%?",
      options:["É uma faixa de valores plausíveis para a média, com 95% de confiança no método","95% dos clientes têm satisfação nesse intervalo","Há 95% de chance de a média amostral cair aí","O intervalo contém 95% dos dados observados"], correct:0,
      explain:"O IC de 95% é uma estimativa por intervalo para o <b>parâmetro</b> (a média populacional); o nível de confiança refere-se ao procedimento, não aos clientes individuais." }] },

  { dept:"BI", title:"O que é o valor-p",
    scenario:"Num teste, você obteve valor-p = 0,03. Um colega pergunta o que esse número significa.",
    consequence:"Você disse que há 3% de chance de H0 ser verdadeira. A diretoria passou a tratar valor-p como probabilidade da hipótese e tomou várias decisões com base nessa confusão.",
    steps:[{ prompt:"Qual a interpretação correta do valor-p?",
      options:["É a probabilidade de um resultado tão ou mais extremo que o observado, supondo H0 verdadeira","É a probabilidade de H0 ser verdadeira","É a probabilidade de H1 ser verdadeira","É a probabilidade de errar na conclusão"], correct:0,
      explain:"O <b>valor-p</b> mede quão incomuns são os dados sob H0. Não é a probabilidade de H0 nem de H1." }] },

  { dept:"Riscos", title:"O significado do α = 0,05",
    scenario:"A equipe adota nível de significância α = 0,05 em todos os testes. Pedem para você explicar o risco que esse valor controla.",
    consequence:"Você confundiu α com a chance de acertar e relaxou o critério em testes críticos de segurança. Alarmes falsos se multiplicaram e a operação parou várias vezes sem motivo.",
    steps:[{ prompt:"O que representa α = 0,05?",
      options:["A probabilidade de rejeitar H0 quando ela é verdadeira (erro tipo I)","A probabilidade de aceitar H0 quando ela é falsa","A probabilidade de o teste estar correto","A probabilidade de a amostra ser representativa"], correct:0,
      explain:"α é a probabilidade de <b>erro tipo I</b>: rejeitar H0 sendo ela verdadeira. Fixá-lo em 0,05 limita esse risco a 5%." }] },

  { dept:"Marketing", title:"Provar que melhorou",
    scenario:"Após uma campanha, a empresa quer evidência de que a satisfação média ficou ACIMA de 7, não apenas diferente de 7. Você monta um teste unilateral.",
    consequence:"Você montou um teste bilateral e a evidência de melhora ficou diluída. A campanha eficaz foi julgada sem efeito e o orçamento de marketing foi cortado.",
    steps:[
     { prompt:"Como fica a hipótese alternativa (teste unilateral à direita)?",
       options:["H1: μ > 7","H1: μ ≠ 7","H1: μ < 7","H1: μ = 7"], correct:0,
       explain:"Querer provar que a média é <b>maior</b> que um valor define um teste unilateral à direita: H1: μ > 7." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> t.test(satisfacao, mu = 7, alternative = "greater")\n\nt = 2.51,  df = 199,  <span class="c-key">p-value = 0.0065</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: há evidência de que a satisfação média superou 7." }] },

  { dept:"Atendimento", title:"O tempo de atendimento",
    scenario:"A meta é um tempo médio de atendimento de 5 minutos. Você coleta uma amostra grande e testa se a média difere de 5.",
    consequence:"Você rejeitou H0 sem base e declarou que o atendimento estava fora da meta. A empresa contratou gente a mais por um problema que não existia e a folha estourou.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Teste t para uma amostra","Qui-quadrado de aderência","Mann-Whitney-Wilcoxon","Teste para uma proporção"], correct:0,
       explain:"Uma <b>média</b> comparada com um valor de referência (5) leva ao teste t para uma amostra." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> t.test(tempo_atend, mu = 5)\n\nt = 1.26,  df = 199,  <span class="c-key">p-value = 0.21</span>\nmean of x = 5.12',
       options:["Rejeitar H0","Não rejeitar H0"], correct:1,
       explain:"p > 0,05, <b>não se rejeita H0</b>: a média (5,12) é compatível com a meta de 5 minutos." }] }
 ]
},
{
 name:"Inferência Não Paramétrica",
 cases:[
  { dept:"Comercial", title:"Os canais são igualmente usados?",
    scenario:"Você quer verificar se a variável método de compra (online, app, loja) segue uma distribuição uniforme, ou seja, se cada canal é igualmente provável.",
    consequence:"Você concluiu, sem testar direito, que um canal dominava e concentrou todo o investimento nele. O equilíbrio real de uso foi quebrado e os outros canais murcharam.",
    steps:[
     { prompt:"Qual teste de aderência usar para essa variável categórica?",
       options:["Qui-quadrado de aderência","Kolmogorov-Smirnov","Teste t para uma amostra","Regressão linear"], correct:0,
       explain:"Comparar frequências de uma variável <b>categórica</b> com frequências teóricas iguais leva ao qui-quadrado de aderência. A K-S exige variável contínua." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> chisq.test(table(metodo_compra))\n\n  Chi-squared test for given probabilities\n\nX-squared = 1.24,  df = 2,  <span class="c-key">p-value = 0.538</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:1,
       explain:"p > 0,05, <b>não se rejeita H0</b>: os dados são compatíveis com a distribuição uniforme entre os canais." }] },

  { dept:"Qualidade", title:"Canal de compra e reclamações",
    scenario:"Suspeita-se que o método de compra (online, app, loja) influencie a chance de o cliente reclamar. Você cruza as duas variáveis numa tabela de contingência.",
    consequence:"Você concluiu que o canal causava reclamações e gastou o orçamento refazendo o app, mas as variáveis eram independentes. O problema real ficou sem solução e R$200 mil foram pro ralo.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Qui-quadrado de independência","Qui-quadrado de aderência","Teste t para duas amostras","ANOVA"], correct:0,
       explain:"Duas variáveis <b>categóricas</b> cruzadas, buscando associação, levam ao qui-quadrado de independência." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> chisq.test(table(metodo_compra, reclamou))\n\n  Pearson\'s Chi-squared test\n\nX-squared = 0.954,  df = 2,  <span class="c-key">p-value = 0.62</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:1,
       explain:"p > 0,05, <b>não se rejeita H0</b>: canal de compra e reclamações são independentes." }] },

  { dept:"Logística", title:"Modelar o tempo de entrega",
    scenario:"Você quer simular a frota assumindo que o tempo de entrega segue uma distribuição Exponencial (λ ≈ 0,32). Antes, testa esse ajuste.",
    consequence:"Você assumiu a Exponencial mesmo com p < 0,05. A simulação de capacidade ficou inválida, a frota foi mal dimensionada e os pedidos acumularam por semanas na alta temporada.",
    steps:[
     { prompt:"Qual teste de aderência usar para essa variável contínua?",
       options:["Kolmogorov-Smirnov","Qui-quadrado de independência","Teste t para uma amostra","Mann-Whitney-Wilcoxon"], correct:0,
       explain:"Ajustar uma variável <b>contínua</b> a uma distribuição teórica especificada leva ao Kolmogorov-Smirnov." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> ks.test(tempo_entrega, "pexp", rate = 0.32)\n\n  One-sample Kolmogorov-Smirnov test\n\nD = 0.348,  <span class="c-key">p-value < 2.2e-16</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: o tempo de entrega não segue uma Exponencial." }] },

  { dept:"Operações", title:"Entrega: Premium versus Econômico",
    scenario:"Você quer comparar o tempo de entrega entre dois produtos, Premium e Econômico. A distribuição é assimétrica e não há normalidade.",
    consequence:"Você aplicou um teste t sem normalidade e a conclusão saiu distorcida. A linha Premium prometeu prazos que não cumpria e os clientes de maior margem migraram para a concorrência.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Mann-Whitney-Wilcoxon","Teste t para duas amostras","Kruskal-Wallis","Kolmogorov-Smirnov de uma amostra"], correct:0,
       explain:"<b>Dois grupos independentes</b> sem normalidade levam ao Mann-Whitney-Wilcoxon, alternativa não paramétrica ao teste t." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> wilcox.test(tempo_entrega ~ tipo_produto)\n\n  Wilcoxon rank sum test\n\nW = 6021,  <span class="c-key">p-value = 0.071</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:1,
       explain:"p > 0,05, <b>não se rejeita H0</b>: não há evidência de que o tempo difira entre Premium e Econômico." }] },

  { dept:"Experiência do Cliente", title:"Satisfação em três canais",
    scenario:"Você compara a satisfação entre três grupos de clientes, online, app e loja física. Os testes de normalidade falharam nos três.",
    consequence:"Você usou ANOVA sem normalidade e tirou uma conclusão inválida. A diretoria realocou equipes com base nisso e a satisfação caiu em todos os canais.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Kruskal-Wallis","ANOVA de um fator","Mann-Whitney-Wilcoxon","Teste t para duas amostras"], correct:0,
       explain:"Comparar <b>três grupos independentes</b> sem normalidade leva ao Kruskal-Wallis." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> kruskal.test(satisfacao ~ canal)\n\n  Kruskal-Wallis rank sum test\n\nchi-squared = 9.41,  df = 2,  <span class="c-key">p-value = 0.009</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: há diferença significativa de satisfação entre pelo menos dois canais." }] },

  { dept:"Produto", title:"Antes e depois, sem normalidade",
    scenario:"Você mediu a satisfação dos mesmos clientes antes e depois de uma mudança no app. As diferenças não são normais.",
    consequence:"Você forçou um teste t pareado sobre dados nada normais e a conclusão ficou frágil. Uma melhora real foi rotulada como ruído e a mudança foi revertida.",
    steps:[{ prompt:"Qual teste não paramétrico é o adequado?",
      options:["Wilcoxon para amostras emparelhadas (postos sinalizados)","Mann-Whitney-Wilcoxon","Qui-quadrado de independência","Kruskal-Wallis"], correct:0,
      explain:"Medições <b>pareadas</b> sem normalidade levam ao Wilcoxon de postos sinalizados, equivalente não paramétrico do t pareado." }] },

  { dept:"BI", title:"Associação entre dois rankings",
    scenario:"Você tem dois rankings ordinais dos produtos: um por qualidade percebida e outro por preço. Quer medir a associação entre eles.",
    consequence:"Você calculou correlação de Pearson sobre rankings ordinais e o número saiu enganoso. A política de preços foi atrelada a uma relação que não existia daquele jeito.",
    steps:[{ prompt:"Qual medida de associação usar?",
      options:["Correlação de Spearman (postos)","Correlação de Pearson","Qui-quadrado de aderência","Teste t para duas amostras"], correct:0,
      explain:"Para <b>variáveis ordinais</b> ou relações monótonas não lineares, usa-se a correlação de postos de Spearman." }] },

  { dept:"Atendimento", title:"A mediana da nota de atendimento",
    scenario:"As notas de atendimento estão numa escala ordinal de 1 a 5. Você quer testar se a mediana da nota é diferente de 3, sem supor normalidade.",
    consequence:"Você aplicou um teste de média numa escala ordinal e a conclusão não se sustentou. A meta de atendimento foi definida sobre uma estatística inadequada e ninguém confiou no resultado.",
    steps:[{ prompt:"Qual teste é o mais apropriado?",
      options:["Teste do sinal","Teste t para uma amostra","Qui-quadrado de independência","Regressão linear"], correct:0,
      explain:"Para testar a <b>mediana</b> contra um valor de referência em escala ordinal, o teste do sinal é apropriado (Wilcoxon também, se houver simetria)." }] },

  { dept:"Estratégia", title:"Hábitos de compra por região",
    scenario:"Você quer saber se a distribuição dos métodos de compra é a mesma em várias regiões do país, ou se algumas regiões compram de forma diferente.",
    consequence:"Você assumiu que todas as regiões compravam igual e padronizou a operação. Regiões com perfil bem diferente ficaram mal atendidas e o faturamento despencou nelas.",
    steps:[
     { prompt:"Qual teste aplicar?",
       options:["Qui-quadrado de homogeneidade entre grupos","Teste t para duas amostras","Kolmogorov-Smirnov de uma amostra","Regressão linear"], correct:0,
       explain:"Comparar a <b>distribuição de uma variável categórica entre vários grupos</b> leva ao qui-quadrado de homogeneidade." },
     { prompt:"Com α = 0,05, qual a decisão?",
       console:'> chisq.test(table(regiao, metodo_compra))\n\n  Pearson\'s Chi-squared test\n\nX-squared = 21.4,  df = 6,  <span class="c-key">p-value = 0.0016</span>',
       options:["Rejeitar H0","Não rejeitar H0"], correct:0,
       explain:"p < 0,05, <b>rejeita-se H0</b>: os hábitos de compra diferem entre as regiões." }] },

  { dept:"Qualidade", title:"Os defeitos são aleatórios?",
    scenario:"Numa linha de embalagem, você registrou a sequência de itens com defeito e sem defeito ao longo do dia e quer saber se os defeitos ocorrem de forma aleatória ou em blocos.",
    consequence:"Você presumiu aleatoriedade sem testar. Os defeitos vinham em rajadas ligadas a um turno específico, a causa raiz passou batida e o lote inteiro foi recusado pelo cliente.",
    steps:[{ prompt:"Qual teste avalia a aleatoriedade da sequência?",
      options:["Teste das sequências (runs)","Qui-quadrado de aderência","Teste t para duas amostras","Correlação de Spearman"], correct:0,
      explain:"Para avaliar se uma <b>sequência</b> é aleatória, usa-se o teste das sequências (runs test)." }] },

  { dept:"Comercial", title:"Observado contra esperado",
    scenario:"O gráfico compara, para cada canal, a frequência observada (barra azul) com a frequência esperada sob a hipótese de distribuição uniforme (barra amarela).",
    consequence:"Você enxergou uma diferença gigante onde quase não havia e rejeitou a uniforme no olho, sem teste. A estratégia de canais foi redesenhada à toa e gerou retrabalho.",
    steps:[{ svg:'<svg viewBox="0 0 320 180"><rect x="40" y="8" width="12" height="10" fill="#34D1C4"/><text x="56" y="17" fill="#7E91B5" font-size="10">observado</text><rect x="150" y="8" width="12" height="10" fill="#F6C667"/><text x="166" y="17" fill="#7E91B5" font-size="10">esperado</text><line x1="25" y1="150" x2="300" y2="150" stroke="#2A3B5E"/><rect x="45" y="35" width="25" height="115" fill="#34D1C4"/><rect x="72" y="30" width="25" height="120" fill="#F6C667"/><rect x="135" y="73" width="25" height="77" fill="#34D1C4"/><rect x="162" y="70" width="25" height="80" fill="#F6C667"/><rect x="225" y="102" width="25" height="48" fill="#34D1C4"/><rect x="252" y="110" width="25" height="40" fill="#F6C667"/><text x="71" y="165" fill="#7E91B5" font-size="11" text-anchor="middle">App</text><text x="161" y="165" fill="#7E91B5" font-size="11" text-anchor="middle">Online</text><text x="251" y="165" fill="#7E91B5" font-size="11" text-anchor="middle">Loja</text></svg>',
      prompt:"O que o gráfico sugere, antes do teste formal?",
      options:["Observado e esperado estão próximos, sugerindo compatibilidade com a uniforme","Um canal domina e esmaga totalmente os demais","As frequências observadas são todas iguais a zero","O gráfico mostra correlação entre os canais"], correct:0,
      explain:"Barras observadas próximas das esperadas indicam <b>pouca discrepância</b>, coerente com não rejeitar a uniforme. O qui-quadrado confirma isso formalmente." }] }
 ]
},
{
 name:"Regressão Linear",
 cases:[
  { dept:"Estratégia", title:"Prever satisfação pelo preço",
    scenario:"Você quer entender e prever a satisfação a partir do preço pago. Decide ajustar um modelo.",
    consequence:"Você escolheu um teste de comparação de grupos quando precisava de um modelo preditivo. Sem equação para prever, a área de pricing ficou no escuro e errou todos os reajustes.",
    steps:[{ prompt:"Qual método aplicar?",
      options:["Regressão linear simples","Teste t para duas amostras","Qui-quadrado de independência","Kruskal-Wallis"], correct:0,
      explain:"<b>Prever</b> uma variável quantitativa (satisfação) a partir de outra quantitativa (preço) e quantificar a relação leva à regressão linear simples." }] },

  { dept:"Estratégia", title:"O que diz o coeficiente do preço",
    scenario:"Você ajustou satisfação ~ preço e o R mostrou o coeficiente do preço (β1) e seu valor-p.",
    consequence:"Você confundiu a escala do coeficiente e disse que cada R$1 a mais elevava a satisfação em 1,4 ponto. A empresa subiu preços esperando clientes mais felizes e colheu o oposto.",
    steps:[{ prompt:"Como interpretar β1 = 0,014 (p = 0,0004)?",
      console:'> summary(lm(satisfacao ~ preco))\n\nCoefficients:\n             Estimate   <span class="c-key">Pr(>|t|)</span>\n(Intercept)  4.810      <2e-16\npreco        0.014      <span class="c-key">0.0004</span>\nMultiple R-squared: 0.061',
      options:["A cada R$1 a mais no preço, a satisfação prevista sobe 0,014 ponto, e o efeito é significativo","A cada R$1 a mais, a satisfação sobe 1,4 ponto","O preço não tem efeito, pois β1 é muito pequeno","β1 é a satisfação prevista quando o preço é zero"], correct:0,
      explain:"β1 é o <b>coeficiente angular</b>: a variação esperada em Y por unidade de X. Com p < 0,05, o efeito é significativo." }] },

  { dept:"Pricing", title:"Prevendo um pedido de R$50",
    scenario:"Com o modelo ajustado satisfação = 4,81 + 0,014 × preço, você precisa prever a satisfação de um pedido de R$50.",
    consequence:"Você errou a conta de previsão e prometeu um nível de satisfação irreal para a faixa de preço. As metas de NPS foram calibradas erradas e não foram batidas.",
    steps:[{ prompt:"Qual a satisfação prevista para preço = R$50?",
      options:["≈ 5,51","≈ 4,82","≈ 11,8","≈ 0,70"], correct:0,
      explain:"Substituindo na equação: 4,81 + 0,014 × 50 = 4,81 + 0,70 = <b>5,51</b>." }] },

  { dept:"Análise", title:"O intercepto",
    scenario:"No modelo satisfação = 4,81 + 0,014 × preço, um colega pergunta o que significa o valor 4,81 (β0).",
    consequence:"Você descreveu o intercepto como o efeito do preço e embaralhou a leitura do modelo inteiro. O relatório saiu com conclusões trocadas e foi desautorizado pela coordenação.",
    steps:[{ prompt:"O que representa β0 = 4,81?",
      options:["A satisfação prevista quando o preço é zero","O aumento da satisfação por real gasto","A satisfação média de todos os clientes","A inclinação da reta"], correct:0,
      explain:"β0 é o <b>intercepto</b>: o valor previsto de Y quando X = 0. A inclinação é dada por β1." }] },

  { dept:"Análise", title:"O coeficiente é significativo?",
    scenario:"Você quer decidir se o preço tem efeito estatisticamente relevante sobre a satisfação. O valor-p do coeficiente do preço é 0,0004 e α = 0,05.",
    consequence:"Você ignorou um coeficiente claramente significativo achando que era irrelevante. Uma alavanca real de satisfação foi descartada e a concorrência a explorou primeiro.",
    steps:[{ prompt:"Qual a conclusão sobre o coeficiente do preço?",
      options:["É significativo: rejeita-se H0 de que β1 = 0","Não é significativo: β1 é igual a zero","O valor-p mede o tamanho do efeito","Só o R² decide a significância"], correct:0,
      explain:"Com p < 0,05, <b>rejeita-se H0: β1 = 0</b>; o preço tem efeito significativo. O tamanho do efeito vem da estimativa, não do valor-p." }] },

  { dept:"BI", title:"Lendo o R²",
    scenario:"O modelo satisfação ~ preço tem R² = 0,06. A diretoria pergunta o que esse número diz sobre o modelo.",
    consequence:"Você vendeu o modelo como quase perfeito ignorando o R² baixo. Decisões importantes foram apoiadas num modelo que explicava quase nada e falharam na prática.",
    steps:[{ prompt:"O que significa R² = 0,06?",
      options:["O modelo explica cerca de 6% da variabilidade da satisfação","O modelo acerta 6% das previsões","Há 6% de chance de o modelo estar errado","O preço causa 6% das reclamações"], correct:0,
      explain:"O <b>R²</b> é a proporção da variabilidade de Y explicada pelo modelo. 0,06 significa que 94% ficam por explicar: efeito real, porém fraco." }] },

  { dept:"Direção de Dados", title:"O modelo múltiplo",
    scenario:"Você acrescenta o tempo de entrega ao modelo: satisfação ~ preço + tempo de entrega. Precisa ler o efeito da entrega.",
    consequence:"Você leu o sinal de β2 ao contrário e afirmou que entregas mais lentas deixavam os clientes mais felizes. A operação afrouxou os prazos e a NimbusShop despencou nos rankings de satisfação.",
    steps:[{ prompt:"Qual coeficiente mede o efeito do tempo de entrega e como se lê?",
      console:'> summary(lm(satisfacao ~ preco + tempo_entrega))\n\nCoefficients:\n               Estimate   <span class="c-key">Pr(>|t|)</span>\n(Intercept)     5.200     <2e-16\npreco           0.012     0.003\ntempo_entrega  -0.350     <span class="c-key">1.2e-07</span>\nMultiple R-squared: 0.21',
      options:["β2 = -0,35: cada dia a mais de entrega reduz a satisfação prevista em 0,35 ponto (significativo)","β2 = -0,35: cada dia a mais aumenta a satisfação em 0,35 ponto","β1 = 0,012 é o efeito do tempo de entrega","O tempo de entrega não é significativo"], correct:0,
      explain:"β2 é o coeficiente do tempo de entrega. Sinal <b>negativo</b> e p < 0,05: mais demora, menos satisfação, mantendo o preço constante." }] },

  { dept:"Pricing", title:"Prevendo com duas variáveis",
    scenario:"Com o modelo satisfação = 5,20 + 0,012 × preço − 0,35 × tempo, você precisa prever para um pedido de R$40 entregue em 3 dias.",
    consequence:"Você errou a previsão do modelo múltiplo e passou um número irreal para a meta de satisfação. A operação foi cobrada por um alvo impossível e a equipe se desmotivou.",
    steps:[{ prompt:"Qual a satisfação prevista (preço = 40, tempo = 3)?",
      options:["≈ 4,63","≈ 5,68","≈ 6,73","≈ 4,28"], correct:0,
      explain:"5,20 + 0,012 × 40 − 0,35 × 3 = 5,20 + 0,48 − 1,05 = <b>4,63</b>." }] },

  { dept:"Direção de Dados", title:"R² e multicolinearidade",
    scenario:"O R² subiu de 0,06 (modelo simples) para 0,21 (modelo múltiplo) e o VIF entre preço e tempo é 1,3.",
    consequence:"Você descartou o modelo múltiplo gritando multicolinearidade sem olhar o VIF. A empresa ficou com um modelo mais fraco e previu pior por meses.",
    steps:[{ prompt:"Qual a conclusão correta?",
      options:["O modelo múltiplo explica mais e não há multicolinearidade preocupante (VIF < 5)","Há multicolinearidade grave só por existirem duas variáveis","O modelo simples era melhor por ter menos variáveis","R² = 0,21 significa modelo perfeito"], correct:0,
      explain:"R² maior indica mais variância explicada; <b>VIF < 5</b> indica que preço e tempo não estão excessivamente correlacionados. Ainda assim, 0,21 deixa muito por explicar." }] },

  { dept:"BI", title:"Comparando modelos",
    scenario:"Você acrescentou uma variável quase inútil ao modelo. O R² subiu de leve, mas o R² ajustado caiu.",
    consequence:"Você escolheu o modelo pelo R² puro e encheu a equação de variáveis inúteis. O modelo virou um monstro instável que previa lindamente o passado e péssimo o futuro.",
    steps:[{ prompt:"Qual métrica usar para comparar modelos com números diferentes de variáveis?",
      options:["R² ajustado","R² simples","O valor de β0","O número de observações"], correct:0,
      explain:"O <b>R² ajustado</b> penaliza variáveis que não agregam, por isso é o indicado para comparar modelos com quantidades diferentes de preditores. O R² puro só cresce ao adicionar variáveis." }] },

  { dept:"Estratégia", title:"A reta no diagrama de dispersão",
    scenario:"O diagrama de dispersão mostra a satisfação em função do preço, com a reta de regressão ajustada (em amarelo).",
    consequence:"Você leu a inclinação ao contrário e disse que preços maiores derrubavam a satisfação. A política de preços foi invertida e a receita caiu.",
    steps:[{ svg:'<svg viewBox="0 0 320 180"><line x1="35" y1="20" x2="35" y2="150" stroke="#2A3B5E"/><line x1="35" y1="150" x2="300" y2="150" stroke="#2A3B5E"/><line x1="45" y1="132" x2="288" y2="42" stroke="#F6C667" stroke-width="2"/><circle cx="55" cy="128" r="4" fill="#34D1C4"/><circle cx="80" cy="120" r="4" fill="#34D1C4"/><circle cx="95" cy="108" r="4" fill="#34D1C4"/><circle cx="115" cy="112" r="4" fill="#34D1C4"/><circle cx="135" cy="95" r="4" fill="#34D1C4"/><circle cx="155" cy="88" r="4" fill="#34D1C4"/><circle cx="170" cy="92" r="4" fill="#34D1C4"/><circle cx="190" cy="72" r="4" fill="#34D1C4"/><circle cx="210" cy="65" r="4" fill="#34D1C4"/><circle cx="232" cy="58" r="4" fill="#34D1C4"/><circle cx="255" cy="48" r="4" fill="#34D1C4"/><circle cx="275" cy="42" r="4" fill="#34D1C4"/><text x="40" y="16" fill="#7E91B5" font-size="10">satisfação</text><text x="298" y="166" fill="#7E91B5" font-size="10" text-anchor="end">preço</text></svg>',
      prompt:"O que a reta indica sobre o coeficiente β1?",
      options:["β1 é positivo: a satisfação tende a crescer com o preço","β1 é negativo: a satisfação cai com o preço","β1 é exatamente zero","O gráfico não permite ver o sinal de β1"], correct:0,
      explain:"Uma reta de regressão <b>ascendente</b> indica coeficiente angular (β1) positivo: Y cresce quando X cresce." }] },

  { dept:"Operações", title:"A reta que desce",
    scenario:"O diagrama de dispersão mostra a satisfação em função do tempo de entrega, com a reta ajustada (em amarelo) descendente.",
    consequence:"Você tratou a queda como irrelevante e ignorou o efeito do atraso. Os prazos pioraram e a satisfação despencou junto.",
    steps:[{ svg:'<svg viewBox="0 0 320 180"><line x1="35" y1="20" x2="35" y2="150" stroke="#2A3B5E"/><line x1="35" y1="150" x2="300" y2="150" stroke="#2A3B5E"/><line x1="45" y1="44" x2="288" y2="132" stroke="#F6C667" stroke-width="2"/><circle cx="55" cy="48" r="4" fill="#34D1C4"/><circle cx="80" cy="56" r="4" fill="#34D1C4"/><circle cx="98" cy="52" r="4" fill="#34D1C4"/><circle cx="118" cy="68" r="4" fill="#34D1C4"/><circle cx="138" cy="72" r="4" fill="#34D1C4"/><circle cx="155" cy="80" r="4" fill="#34D1C4"/><circle cx="172" cy="85" r="4" fill="#34D1C4"/><circle cx="192" cy="95" r="4" fill="#34D1C4"/><circle cx="212" cy="100" r="4" fill="#34D1C4"/><circle cx="235" cy="112" r="4" fill="#34D1C4"/><circle cx="258" cy="120" r="4" fill="#34D1C4"/><circle cx="275" cy="128" r="4" fill="#34D1C4"/><text x="40" y="16" fill="#7E91B5" font-size="10">satisfação</text><text x="298" y="166" fill="#7E91B5" font-size="10" text-anchor="end">tempo de entrega</text></svg>',
      prompt:"Como interpretar a inclinação da reta?",
      options:["Coeficiente negativo: mais tempo de entrega, menor satisfação prevista","Coeficiente positivo: mais tempo, maior satisfação","Não há relação entre as variáveis","A reta representa apenas a média da satisfação"], correct:0,
      explain:"Reta <b>descendente</b> significa coeficiente negativo: a satisfação prevista diminui à medida que o tempo de entrega aumenta." }] }
 ]
}
];

/* ---------- estado ---------- */
let ti=0,ci=0,si=0,score=0,best=0,bestRank=0,lock=false;
const byId=id=>document.getElementById(id);
const gameEl=()=>byId('game');
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function bestScore(){return parseInt(localStorage.getItem(BEST_KEY)||'0',10);}
function saveBest(){ bestRank=Math.max(bestRank,ti); if(score>best){ best=score; localStorage.setItem(BEST_KEY,String(best)); } }
const topicSteps=t=>TOPICS[t].cases.reduce((a,c)=>a+c.steps.length,0);
const doneSteps=()=>{let n=si;for(let k=0;k<ci;k++)n+=TOPICS[ti].cases[k].steps.length;return n;};
const totalTickets=()=>TOPICS.reduce((a,t)=>a+t.cases.length,0);

/* ---------- camada de efeitos (tomate / confetti / promoção) ---------- */
function fxLayer(){ let l=byId('cd-fx'); if(!l){ l=document.createElement('div'); l.id='cd-fx'; l.className='cd-fx'; document.body.appendChild(l);} return l; }

function tomato(done){
  if(REDUCED){ done(); return; }
  const l=fxLayer();
  const t=document.createElement('div'); t.className='cd-tomato';
  t.innerHTML='<svg viewBox="0 0 100 100"><ellipse cx="50" cy="58" rx="38" ry="36" fill="#E23B3B"/><ellipse cx="38" cy="46" rx="12" ry="8" fill="#ff7676" opacity=".55"/><path d="M50 22 l-9 -8 M50 22 l0 -13 M50 22 l9 -8" stroke="#3FAE5A" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="24" r="6" fill="#3FAE5A"/></svg>';
  l.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('fly'));
  t.addEventListener('animationend',()=>{
    t.remove();
    const s=document.createElement('div'); s.className='cd-splat';
    s.innerHTML='<svg viewBox="0 0 200 200"><path d="M100 28 C132 32 138 60 152 70 C178 80 182 112 158 122 C172 148 138 162 118 150 C108 178 72 176 68 150 C42 160 22 134 40 114 C18 104 26 72 52 70 C56 42 80 28 100 28 Z" fill="#D32F2F"/><circle cx="34" cy="60" r="9" fill="#D32F2F"/><circle cx="170" cy="92" r="11" fill="#C62828"/><circle cx="60" cy="170" r="8" fill="#C62828"/></svg>';
    l.appendChild(s); requestAnimationFrame(()=>s.classList.add('go'));
    const card=gameEl().querySelector('.game-card'); if(card) card.classList.add('cd-shake');
    setTimeout(()=>{ s.remove(); done(); },650);
  },{once:true});
}

function confetti(){
  if(REDUCED) return;
  const l=fxLayer(), cols=['#06b6d4','#f59e0b','#ef4444','#8b5cf6','#10b981'];
  for(let i=0;i<46;i++){
    const p=document.createElement('div'); p.className='cd-confetti';
    p.style.left=Math.random()*100+'vw'; p.style.background=cols[i%cols.length];
    p.style.animationDuration=(1.4+Math.random()*1.3)+'s'; p.style.animationDelay=(Math.random()*.4)+'s';
    l.appendChild(p); requestAnimationFrame(()=>p.classList.add('go'));
    setTimeout(()=>p.remove(),3000);
  }
}

/* ---------- ponto de entrada ---------- */
window.mountCienciaDados=function(){ best=bestScore(); ti=0;ci=0;si=0;score=0;bestRank=0;lock=false; renderStart(); gameEl().scrollIntoView({behavior:'smooth',block:'start'}); };

function renderStart(){
  const rows=TOPICS.map((t,i)=>`<li><b>${i+1}.</b> ${esc(t.name)} (${t.cases.length} tickets) → promoção a <b>${esc(RANKS[i+1])}</b></li>`).join('');
  gameEl().innerHTML=`<div class="game-card">
    <span class="eyebrow">Jogo · Ciência de Dados</span>
    <h2>🛒 NimbusShop · A Carreira do Analista</h2>
    <p class="muted">Você entra como <b>${esc(RANKS[0])}</b> numa empresa de e-commerce. Em cada ticket: escolha o teste ou método certo e, lendo o output do R ou o gráfico, decida com α = 0,05. Cada bloco de matéria dominado é uma promoção.</p>
    <ul class="muted game-rules">${rows}</ul>
    <p class="muted">⚠️ Uma decisão errada e você é <b>demitido</b>, com tomate e tudo. A vaga reabre e você recomeça o setor atual.</p>
    <div class="row">
      <button class="primary" id="cd-go">▶️ Começar como estagiário</button>
      <span class="pill">🏆 Recorde: ${best}</span>
      <span class="pill">📚 ${totalTickets()} tickets</span>
    </div>
  </div>`;
  byId('cd-go').onclick=()=>{ ti=0;ci=0;si=0;score=0;lock=false; render(); };
}

function render(){
  lock=false;
  const c=TOPICS[ti].cases[ci], step=c.steps[si];
  const order=shuffle(step.options.map((_,i)=>i));
  const opts=order.map((orig,pos)=>`<button class="option cd-option" data-orig="${orig}"><b>${String.fromCharCode(65+pos)}.</b> ${esc(step.options[orig])}</button>`).join('');
  gameEl().innerHTML=`<div class="game-card">
    <div class="hud">
      <span class="pill">🏷️ ${esc(RANKS[ti])}</span>
      <span class="pill">⭐ <b id="cd-score">${score}</b></span>
      <span class="pill">🏆 ${best}</span>
    </div>
    <div class="progress" style="margin-bottom:14px"><div class="fill" id="cd-xp" style="width:${doneSteps()/topicSteps(ti)*100}%"></div></div>
    <p class="muted prompt-label">${esc(TOPICS[ti].name)} · ticket ${ci+1}/${TOPICS[ti].cases.length} · ${esc(c.dept)}</p>
    <h3 style="margin:2px 0 10px">${esc(c.title)}</h3>
    ${ si===0 ? `<p class="muted" style="line-height:1.6;margin:0 0 14px">${c.scenario}</p>` : `<p class="muted" style="margin:0 0 12px">continuação do caso · passo ${si+1} de ${c.steps.length}</p>` }
    ${ step.svg ? `<div class="cd-chart">${step.svg}</div>` : '' }
    ${ step.console ? `<div class="cd-console">${step.console}</div>` : '' }
    <div class="prompt">${esc(step.prompt)}</div>
    <div id="cd-opts">${opts}</div>
    <div id="cd-fb"></div>
    <button class="primary" id="cd-next" style="display:none;margin-top:14px;width:100%">Continuar →</button>
  </div>`;
  document.querySelectorAll('.cd-option').forEach(b=>b.onclick=()=>answer(parseInt(b.dataset.orig),b));
}

function answer(orig,btn){
  if(lock) return; lock=true;
  const c=TOPICS[ti].cases[ci], step=c.steps[si];
  document.querySelectorAll('.cd-option').forEach(b=>{ b.disabled=true; if(parseInt(b.dataset.orig)===step.correct) b.classList.add('correct'); });
  if(orig===step.correct){
    btn.classList.add('correct');
    score+=10; const sc=byId('cd-score'); if(sc) sc.textContent=score;
    byId('cd-xp').style.width=((doneSteps()+1)/topicSteps(ti)*100)+'%';
    byId('cd-fb').innerHTML=`<div class="feedback" style="margin-top:14px">✅ ${step.explain}</div>`;
    const nx=byId('cd-next'); nx.style.display='block'; nx.onclick=advance; nx.focus();
  } else {
    btn.classList.add('wrong');
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

function promotion(idx){
  saveBest(); bestRank=Math.max(bestRank,idx); if(score>best){best=score;localStorage.setItem(BEST_KEY,String(best));}
  confetti();
  const l=fxLayer();
  const b=document.createElement('div'); b.className='cd-promo';
  b.innerHTML=`<div class="muted" style="letter-spacing:.16em;font-size:12px;text-transform:uppercase">Promoção</div>
    <h3 style="color:var(--warn);margin:6px 0 4px">${esc(RANKS[idx])}</h3>
    <p class="muted" style="margin:0 0 14px">Você dominou ${esc(TOPICS[idx-1].name)}. Próximo bloco: ${esc(TOPICS[idx].name)}.</p>
    <button class="primary" id="cd-promo-go">Assumir o novo cargo</button>`;
  l.appendChild(b); requestAnimationFrame(()=>b.classList.add('show'));
  byId('cd-promo-go').onclick=()=>{ b.remove(); ti=idx;ci=0;si=0; render(); };
  byId('cd-promo-go').focus();
}

function firedScreen(c,step){
  saveBest();
  const right=step.options[step.correct];
  gameEl().innerHTML=`<div class="game-card game-over">
    <h2>🍅 Você foi demitido!</h2>
    <p class="muted">A ${COMPANY} dispensou você como <b>${esc(RANKS[ti])}</b>, no setor de ${esc(TOPICS[ti].name)}.</p>
    <div class="feedback" style="border-left-color:var(--bad);background:#27151a"><b>Consequência para o negócio:</b> ${esc(c.consequence)}</div>
    <p class="muted" style="margin-top:12px">Resposta certa: <b>${esc(right)}</b>. ${step.explain}</p>
    <div class="row" style="margin-top:6px">
      <span class="pill">🏷️ Melhor cargo: ${esc(RANKS[bestRank])}</span>
      <span class="pill">⭐ Pontos: ${score}</span>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="cd-retry">🔁 Recomeçar o setor de ${esc(TOPICS[ti].name)}</button>
      <a class="btn" href="ciencia-de-dados.html">📚 Rever a matéria</a>
    </div>
  </div>`;
  byId('cd-retry').onclick=()=>{ ci=0;si=0; render(); };
  byId('cd-retry').focus();
}

function winScreen(){
  bestRank=TOPICS.length-1; if(score>best){best=score;localStorage.setItem(BEST_KEY,String(best));}
  confetti(); setTimeout(confetti,500);
  gameEl().innerHTML=`<div class="game-card game-over">
    <h2>🏆 Cientista de Dados Chefe</h2>
    <p class="big">Você percorreu toda a carreira na ${COMPANY}: descritiva, inferência paramétrica e não paramétrica, e regressão (β1, β2, R² e previsão).</p>
    <p class="muted">Pontuação final: <b>${score}</b> · Recorde: <b>${best}</b></p>
    <div class="row" style="margin-top:14px">
      <button class="primary" id="cd-again">🔁 Jogar de novo</button>
      <a class="btn" href="ciencia-de-dados.html">📚 Rever a matéria</a>
    </div>
  </div>`;
  byId('cd-again').onclick=()=>window.mountCienciaDados();
  byId('cd-again').focus();
}

})();
