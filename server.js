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
    description: 'API bancaire développée par Tassolimo Zita : gérer des comptes et transactions',
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
                  owner: { type: 'string', example: 'Tassolimo Zita' },
                  email: { type: 'string', example: 'tassolimofabiola@gmail.com' },
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
                  description: { type: 'string', example: 'Dépôt initial' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Dépôt effectué' },
          400: { description: 'Montant invalide' },
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
                  description: { type: 'string', example: 'Retrait' },
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

app.post('/api/accounts', (req, res) => {
  const { owner, email, type, initialDeposit } = req.body;
  const deposit = Number(initialDeposit) || 0;

  if (!owner || !type) {
    return res.status(400).json({ error: 'owner et type sont requis' });
  }
  if (!['courant', 'epargne'].includes(type)) {
    return res.status(400).json({ error: 'type doit être courant ou epargne' });
  }
  if (deposit < 0) {
    return res.status(400).json({ error: 'Le dépôt initial ne peut pas être négatif' });
  }

  const account = {
    id: uuidv4(),
    accountNumber: nextAccountNumber(),
    owner,
    email: email || null,
    type,
    balance: parseFloat(deposit.toFixed(2)),
    currency: 'FCFA',
    status: 'actif',
    createdAt: new Date().toISOString(),
  };

  accounts.set(account.id, account);
  return res.status(201).json(account);
});

app.get('/api/accounts', (req, res) => {
  return res.json(Array.from(accounts.values()));
});

// ── ROUTES TRANSACTIONS ─────────────────────────────

app.post('/api/accounts/:id/deposit', (req, res) => {
  const account = accounts.get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

  const amount = Number(req.body.amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Le montant doit être un nombre supérieur à 0' });
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
    description: req.body.description || 'Dépôt',
    date: new Date().toISOString(),
  };
  transactions.set(tx.id, tx);
  return res.json(tx);
});

app.post('/api/accounts/:id/withdraw', (req, res) => {
  const account = accounts.get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Compte non trouvé' });

  const amount = Number(req.body.amount);
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Le montant doit être un nombre supérieur à 0' });
  }
  if (account.balance < amount) {
    return res.status(400).json({ error: `Solde insuffisant (${account.balance} FCFA)` });
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
    description: req.body.description || 'Retrait',
    date: new Date().toISOString(),
  };
  transactions.set(tx.id, tx);
  return res.json(tx);
});

app.get('/', (req, res) => res.redirect('/api-docs'));

app.listen(PORT, () => {
  console.log(`✅ Serveur de Tassolimo Zita démarré sur http://localhost:${PORT}`);
  console.log(`📖 Swagger UI : http://localhost:${PORT}/api-docs`);
});