# Study Deep Platform

Plataforma de estudos offline com três módulos:

- Ciência de Dados
- Sistemas Distribuídos
- Cybersecurity

O conteúdo original foi preservado. A estrutura foi refatorada para separar HTML, CSS e JavaScript, facilitar manutenção e permitir publicação direta no GitHub Pages.

## Estrutura

```text
study-deep-platform/
├── index.html
├── pages/
│   ├── ciencia-de-dados.html
│   ├── sistemas-distribuidos.html
│   └── cybersecurity.html
├── assets/
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── ciencia-de-dados.js
│       ├── sistemas-distribuidos.js
│       └── cybersecurity.js
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Como usar localmente

Basta abrir `index.html` no navegador.

Opcionalmente, rode um servidor local:

```bash
python3 -m http.server 8000
```

Depois acesse:

```text
http://localhost:8000
```

## Onde editar

- Visual global: `assets/css/main.css`
- Página principal: `index.html`
- Conteúdo e lógica dos módulos: `assets/js/*.js`
- Estrutura HTML dos módulos: `pages/*.html`



## Estrutura dos jogos

Os jogos ficam isolados em `games/`, cada um com HTML, CSS e JavaScript próprios:

```text
games/
├── nimbus/
│   ├── index.html
│   └── assets/
│       ├── css/style.css
│       └── js/app.js
└── network-ops-academy/
    ├── index.html
    └── assets/
        ├── css/style.css
        └── js/app.js
```

A página `pages/jogos.html` funciona como catálogo e aponta para cada jogo. Para adicionar um novo jogo, crie uma pasta dentro de `games/novo-jogo/` e adicione um card em `pages/jogos.html`.
