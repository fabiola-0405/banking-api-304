const express = require('express');
const swaggerUi = require('swagger-ui-express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// ── Base de données en mémoire ──────────────────────
const accounts = new Map();
const transactions = new Map();

// ── Swagger Documentation ───────────────────────────
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Banking API – Devoir 304',
    version: '1.0.0',
    description: 'API bancaire : créer des comptes, dépôts et retraits',
  },
  paths: {
    '/api/accounts': {
      post: {
        tags: ['Comptes'],
        summary: 'Créer un compte',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['owner', 'type'],
                properties: {
                  owner: { type: 'string', example: 'Jean Dupont' },
                  email: { type: 'string', example: 'jean@example.com' },
                  type: { type: 'string', enum: ['courant', 'epargne'] },
                  initialDeposit: { type: 'number', example: 50000 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Compte créé avec succès' },
          400: { description: 'Données invalides' },
        },
      },
      get: {
        tags: ['Comptes'],
        summary: 'Lister tous les comptes',
        responses: {
          200: { description: 'Liste des comptes' },
        },
      },
    },
    '/api/accounts/{id}/deposit': {
      post: {
        tags: ['Transactions'],
        summary: 'Effectuer un dépôt',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: { type: 'number', example: 10000 },
                  description: { type: 'string', example: 'Salaire' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Dépôt effectué' },
          400: { description: 'Données invalides' },
          404: { description: 'Compte non trouvé' },
        },
      },
    },
    '/api/accounts/{id}/withdraw': {
      post: {
        tags: ['Transactions'],
        summary: 'Effectuer un retrait',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: {
                  amount: { type: 'number', example: 5000 },
                  description: { type: 'string', example: 'Retrait DAB' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Retrait effectué' },
          400: { description: 'Solde insuffisant' },
          404: { description: 'Compte non trouvé' },
        },
      },
    },
  },
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ── Compteur pour numéro de compte ─────────────────
let counter = 1;
const nextAccountNumber = () => `BK-${Date.now().toString().slice(-4)}${String(counter++).padStart(3, '0')}`;

// ── ROUTES COMPTES ──────────────────────────────────

// Créer un compte
app.post('/api/accounts', (req, res) => {
  const { owner, email, type, initialDeposit } = req.body;

  if (!owner || !type) {
    return res.status(400).json({ error: 'owner et type sont requis' });
  }
  if (!['courant', 'epargne'].includes(type)) {
    return res.status(400).json({ error: 'type doit être courant ou epargne' });
  }

  const account = {
    id: uuidv4(),
    accountNumber: nextAccountNumber(),
    owner,
    email: email || null,
    type,
    balance: initialDeposit || 0,
    currency: 'FCFA',
    status: 'actif',
    createdAt: new Date().toISOString(),
  };

  accounts.set(account.id, account);
  return res.status(201).json(account);
});

// Lister tous les comptes
app.get('/api/accounts', (req, res) => {
  return res.json(Array.from(accounts.values()));
});

// ── ROUTES TRANSACTIONS ─────────────────────────────

// Dépôt
app.post('/api/accounts/:id/deposit', (req, res) => {
  const account = accounts.get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

  const { amount, description } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'amount doit être > 0' });
  }

  const balanceBefore = account.balance;
  account.balance = parseFloat((account.balance + amount).toFixed(2));

  const tx = {
    id: uuidv4(),
    accountId: account.id,
    type: 'dépôt',
    amount,
    balanceBefore,
    balanceAfter: account.balance,
    description: description || 'Dépôt',
    date: new Date().toISOString(),
  };
  transactions.set(tx.id, tx);
  return res.json(tx);
});

// Retrait
app.post('/api/accounts/:id/withdraw', (req, res) => {
  const account = accounts.get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

  const { amount, description } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'amount doit être > 0' });
  }
  if (account.balance < amount) {
    return res.status(400).json({ error: `Solde insuffisant. Solde actuel : ${account.balance} FCFA` });
  }

  const balanceBefore = account.balance;
  account.balance = parseFloat((account.balance - amount).toFixed(2));

  const tx = {
    id: uuidv4(),
    accountId: account.id,
    type: 'retrait',
    amount,
    balanceBefore,
    balanceAfter: account.balance,
    description: description || 'Retrait',
    date: new Date().toISOString(),
  };
  transactions.set(tx.id, tx);
  return res.json(tx);
});

// Page d'accueil → redirige vers Swagger
app.get('/', (req, res) => res.redirect('/api-docs'));

// ── Démarrage du serveur ────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📖 Swagger UI : http://localhost:${PORT}/api-docs`);
});