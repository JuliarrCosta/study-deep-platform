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

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta para o repositório.
3. Vá em **Settings > Pages**.
4. Em **Build and deployment**, escolha:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Salve e aguarde o link ser gerado.

## Onde editar

- Visual global: `assets/css/main.css`
- Página principal: `index.html`
- Conteúdo e lógica dos módulos: `assets/js/*.js`
- Estrutura HTML dos módulos: `pages/*.html`

## Padrões do projeto

- Não duplicar CSS entre páginas.
- Manter o conteúdo textual dentro dos arquivos JavaScript dos módulos.
- Usar nomes claros para funções e seções.
- Testar no desktop e no celular antes de abrir pull request.
- Evitar dependências externas para manter a plataforma offline.
