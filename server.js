const express = require("express");
const session = require("express-session");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// Estas informações virão das variáveis de ambiente (no Render)
const APP_LOGIN = process.env.APP_LOGIN || "aluno";
const APP_PASSWORD = process.env.APP_PASSWORD || "senha123";
const SESSION_SECRET = process.env.SESSION_SECRET || "um-segredo-qualquer";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Middlewares para ler formulários e JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessão para login
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, "public")));

// Middleware para proteger rotas (só acessa se estiver logado)
function authRequired(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: "Não autenticado." });
}

// Rota de login (recebe POST do formulário)
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === APP_LOGIN && password === APP_PASSWORD) {
    req.session.user = { username };
    return res.redirect("/app.html"); // página interna após login
  }

  return res.send(
    'Login ou senha inválidos. <a href="/">Voltar para tentar novamente</a>'
  );
});

// Rota de logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Rota protegida que chama a IA para corrigir a redação
app.post("/api/corrigir", authRequired, async (req, res) => {
  const { redacao } = req.body;

  if (!redacao || redacao.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "Envie o texto da redação no campo 'redacao'." });
  }

  if (!OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "API key não configurada no servidor." });
  }

  try {
    const respostaIA = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Você é um corretor de redações em português do Brasil. " +
              "Avalie a redação segundo critérios de clareza, coesão, gramática, ortografia e organização. " +
              "Devolva:\n" +
              "1) Nota geral (0 a 100)\n" +
              "2) Pontos fortes\n" +
              "3) Pontos a melhorar\n" +
              "4) Sugestões de reescrita de trechos problemáticos.\n" +
              "Seja objetivo e didático.",
          },
          {
            role: "user",
            content: "Texto da redação do aluno:\n\n" + redacao,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const resposta = respostaIA.data.choices[0].message.content;
    return res.json({ correcao: resposta });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res
      .status(500)
      .json({ error: "Erro ao chamar a IA. Tente novamente mais tarde." });
  }
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
