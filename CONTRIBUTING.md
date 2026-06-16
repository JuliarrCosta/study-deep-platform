# Guia de contribuição

Obrigada por contribuir com a Study Deep Platform.

## Antes de começar

A plataforma é estática e offline. Não há build obrigatório, framework ou backend.

## Organização do código

- `index.html`: página principal.
- `pages/`: páginas HTML dos módulos.
- `assets/css/main.css`: estilo global compartilhado.
- `assets/js/`: conteúdo, dados, interações e renderização dos módulos.

## Como contribuir

1. Crie uma branch com nome descritivo:

```bash
git checkout -b melhoria/nome-da-melhoria
```

2. Faça alterações pequenas e bem separadas.
3. Teste abrindo `index.html` no navegador.
4. Verifique responsividade usando o modo mobile do navegador.
5. Abra um Pull Request explicando:
   - o que mudou;
   - por que mudou;
   - quais páginas foram testadas.

## Padrões visuais

Use apenas as variáveis CSS definidas em `:root` no arquivo `assets/css/main.css`.

Evite criar estilos inline. Quando precisar de uma nova aparência, crie uma classe reutilizável no CSS global.

## Padrões de conteúdo

Ao adicionar questões, mantenha o formato dos objetos existentes:

```js
{
  id: "q-id",
  type: "mcq",
  week: "Semana ou tópico",
  topic: "Tema",
  difficulty: 2,
  prompt: "Enunciado",
  options: ["A", "B", "C", "D"],
  answer: 0,
  explanation: "Explicação da resposta",
  source: "origem"
}
```

Para questões verdadeiro/falso, use `type: "tf"` e `answer: true` ou `false`.

## Checklist antes do PR

- [ ] A página principal abre corretamente.
- [ ] Os três módulos carregam.
- [ ] As questões continuam funcionando.
- [ ] O layout funciona em tela pequena.
- [ ] Não há CSS duplicado dentro dos HTMLs.
- [ ] Não há JavaScript inline nos HTMLs.
