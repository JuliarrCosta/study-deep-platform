# Nebula Distributed Systems Academy

Jogo curricular baseado nos quatro materiais enviados:

- `1_intro_to_ds.pdf` — definição, motivações, desafios, transparência, QoS e modelos arquiteturais.
- `2_communication.pdf` — OSI/TCP-IP, sockets, invocação remota, comunicação indireta, group communication, publish-subscribe, filas, DSM e tuple spaces.
- `3_models.pdf` — two generals, Byzantine generals, rede, nós, tempo, disponibilidade, SLO/SLA, SPOF e failure detectors.
- `4_architecture.pdf` — middleware, objetos distribuídos, CORBA, componentes, web services, REST/SOAP e P2P.

## Missões implementadas

1. DS-01 — A nuvem não é um computador só
2. DS-02 — Transparência sem ilusão
3. DS-03 — Monte o e-commerce distribuído
4. DS-04 — O chat travou no handshake
5. DS-05 — O método está do outro lado da rede
6. DS-06 — Desacople ou colapse
7. DS-07 — Black Friday na fila
8. DS-08 — Os dois generais não têm certeza
9. DS-09 — Há traidores no cluster
10. DS-10 — Escolha suas suposições
11. DS-11 — Quatro noves ou multa
12. DS-12 — O tradutor invisível
13. DS-13 — SOAP ou REST?
14. DS-14 — Encontre o arquivo sem servidor central
15. DS-15 — Architect Mode: salve a Nebula

## Estrutura técnica

```text
games/distributed-systems-academy/
├── index.html
└── assets/
    ├── css/style.css
    └── js/app.js
```

O jogo é 100% estático e funciona no GitHub Pages.

## Atualização: Java Lab e visão aplicada

Além das missões conceituais, cada missão agora possui um **Java Lab** com:

- editor de código Java no navegador;
- código inicial relacionado ao conceito da missão;
- validação local por padrões essenciais do código;
- console simulado mostrando o comportamento distribuído esperado;
- exemplos práticos de sockets, filas, pub-sub, RMI/RPC, detectores de falha, disponibilidade, REST, DHT e arquitetura integrada.

O jogo também inclui uma seção de **Visão Geral Aplicada**, mostrando como cada conceito se encaixa em uma arquitetura distribuída completa:

```text
Cliente -> Proxy/Load Balancer -> API Cluster -> Queue/Broker -> Database Replicas
                                      |               |                |
                                  Monitoring       Middleware        P2P/DHT
```

Essa parte aproxima a teoria dos PDFs da prática de implementação e arquitetura de sistemas distribuídos.

## DS-16 — Mini Sistema Distribuído Integrado

Missão final jogável adicionada para condensar todos os conceitos em um único sistema aplicado: **NebulaShop**.

Fluxo conceitual:

```text
Cliente → Proxy/Load Balancer → API Cluster → Queue/Broker → Workers → DB Replicas → Monitoring → P2P/CDN
```

O jogador escolhe blocos de código/arquitetura para resolver incidentes reais:

1. Entrada e transparência com Proxy/Load Balancer.
2. Pico de carga com Message Queue FIFO.
3. Eventos e observabilidade com Publish-Subscribe.
4. Persistência e disponibilidade com réplicas e failover.
5. Falhas e timeouts com Failure Detector.
6. Distribuição de arquivos com P2P/DHT e GUID.
7. Nós maliciosos com modelo Byzantine e quórum.

Também foi adicionado um Java Lab específico para DS-16 com classes `MiniDistributedSystem`, `LoadBalancer`, `MessageQueue`, `FailureDetector` e `DHT`.
