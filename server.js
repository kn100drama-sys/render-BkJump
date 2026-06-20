require('dotenv').config();

const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const app = express();
const prisma = new PrismaClient();
const cors = require('cors');

const allowedOrigins = [
  'https://helijump.netlify.app',
  'https://bk-jogue.app',
  'localhost',
  '127.0.0.1',
  'meusite.com',
  'www.meusite.com',
  '192.168.100.64'
];

app.use(cors({
origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowed = allowedOrigins.includes(origin);

    if (allowed) return callback(null, true);

    return callback(null, true); // ⚠️ temporário em produção
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

exports.app = app;

const toBRTime = (date) => {
  if (!date) return null;

  return new Date(date).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo"
  });
};

exports.allowedOrigins = allowedOrigins;

const getUserIdFromAuth = (req) => {
  const auth = req.headers.authorization;

  if (!auth) return null;

  const token = auth.replace('Bearer ', '');
  const userId = Number(token.replace('token-', ''));

  if (!userId) return null;

  return userId;
};

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// ─────────────────────────────
// TESTE
// ─────────────────────────────
function adminMiddleware(req, res, next) {
  const userId = getUserIdFromAuth(req);

  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  prisma.user.findUnique({ where: { id: userId } })
    .then(user => {
      if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Sem permissão admin' });
      }

      req.user = user;
      next();
    })
    .catch(() => {
      return res.status(500).json({ error: 'Erro interno' });
    });
}

app.get('/api/admin/dashboard', adminMiddleware, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // ─────────────────────────────
    // USUÁRIOS
    // ─────────────────────────────
    const usuarios_totais = await prisma.user.count();

    const usuarios_hoje = await prisma.user.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    // ─────────────────────────────
    // DEPÓSITOS HOJE
    // ─────────────────────────────
    const depositosHoje = await prisma.deposito.findMany({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const depositosHojeAprovados = depositosHoje.filter(
      d => d.status === 'aprovado'
    );

    const depositosHojePendentes = depositosHoje.filter(
      d => d.status === 'pendente'
    );

    const depositos_hoje_total = depositosHojeAprovados.reduce(
      (a, d) => a + Number(d.valor),
      0
    );

    const depositos_pendentes_total = depositosHojePendentes.reduce(
      (a, d) => a + Number(d.valor),
      0
    );

    const depositos_pagos_total = depositosHojeAprovados.reduce(
      (a, d) => a + Number(d.valor),
      0
    );

    // ─────────────────────────────
    // SAQUES
    // ─────────────────────────────
    const saques = await prisma.saque.findMany();

    const saquesPendentes = saques.filter(
      s => s.status !== 'taxa_paga' && s.status !== 'pago'
    );

    const taxas_saques_pagas = saques.filter(
      s => s.status === 'taxa_paga'
    );

    const saques_pendentes_total = saquesPendentes.reduce(
      (a, s) => a + Number(s.valor),
      0
    );

    const taxas_saques_total = taxas_saques_pagas.reduce(
      (a, s) => a + Number(s.valor),
      0
    );

    // ─────────────────────────────
    // PARTIDAS
    // ─────────────────────────────
    const partidasHoje = await prisma.partida.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay
        }
      }
    });

    const ganhos = await prisma.partida.aggregate({
      where: { resultado: 'GANHOU' },
      _sum: { valorFinal: true }
    });

    const perdas = await prisma.partida.aggregate({
      where: { resultado: 'PERDEU' },
      _sum: { valorEntrada: true }
    });

    const totalApostado = await prisma.partida.aggregate({
      _sum: { valorEntrada: true }
    });

    // ─────────────────────────────
    // SALDO SISTEMA
    // ─────────────────────────────
    const saldoSistema = await prisma.user.aggregate({
      _sum: { saldo: true }
    });

    // ─────────────────────────────
    // 🔥 TOTAL DE DEPÓSITOS (CORRETO)
    // ─────────────────────────────

    // quantidade total (todos os depósitos do sistema)
    const total_depositos_qtd = await prisma.deposito.count();

    // dinheiro que entrou na casa (somente aprovados)
    const total_depositos_valor = await prisma.deposito.aggregate({
      where: { status: 'aprovado' },
      _sum: { valor: true }
    });

    // ─────────────────────────────
    // 🔥 GANHOS BRUTOS
    // ─────────────────────────────
    const ganhos_brutos =
      depositos_pagos_total + taxas_saques_total;

    // ─────────────────────────────
    // RESPONSE FINAL
    // ─────────────────────────────
    return res.json({
      usuarios_totais,
      usuarios_hoje,

      depositos_hoje_total,
      depositos_pendentes_total,
      depositos_pagos_total,

      saques_pendentes_qtd: saquesPendentes.length,
      saques_pendentes_total,

      partidas_hoje: partidasHoje,

      saldo_plataforma: saldoSistema._sum.saldo || 0,

      total_apostado: totalApostado._sum.valorEntrada || 0,
      total_ganhos: ganhos._sum.valorFinal || 0,
      total_perdas: perdas._sum.valorEntrada || 0,

      // ✅ TOTAL DE DEPÓSITOS
      total_depositos_qtd,
      total_depositos_valor: total_depositos_valor._sum.valor || 0,

      depositos_pagos_perc:
        depositosHoje.length > 0
          ? (depositosHojeAprovados.length / depositosHoje.length) * 100
          : 0,

      ganhos_brutos,

      lucro_positivo_perc: 0,
      taxa_vitoria_perc: 0
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro dashboard admin' });
  }
});

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { id: 'desc' }
  });

  res.json(users);
});

app.get('/api/admin/depositos', adminMiddleware, async (req, res) => {
  const data = await prisma.deposito.findMany({
    orderBy: { id: 'desc' }
  });

  res.json(data);
});

app.get('/api/admin/saques', adminMiddleware, async (req, res) => {
  const data = await prisma.saque.findMany({
    orderBy: { id: 'desc' }
  });

  res.json(data);
});



// ─────────────────────────────
// CADASTRO
// ─────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nome, telefone, senha, email, codigo_indicacao } = req.body;

    // verifica se telefone já existe
    const existe = await prisma.user.findUnique({
      where: { telefone }
    });

    if (existe) {
      return res.status(400).json({
        error: 'Telefone já cadastrado'
      });
    }

    // quem indicou (SALVA ID)
    let indicadoPor = null;

    if (codigo_indicacao) {
      const donoRef = await prisma.user.findFirst({
        where: {
          codigoIndicacao: codigo_indicacao
        }
      });

      if (donoRef) {
        indicadoPor = donoRef.id;
      }
    }

    // cria usuário
    const user = await prisma.user.create({
      data: {
        nome,
        telefone,
        senha,
        email: email || null,
        codigoIndicacao: Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase(),
        indicadoPor
      }
    });

    return res.json({
      token: 'token-' + user.id,
      user,
      createdAt: toBRTime(user.createdAt)
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Erro ao cadastrar usuário'
    });
  }
});

// ─────────────────────────────
// LOGIN
// ─────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { telefone, senha } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      telefone,
      senha
    }
  });

  if (!user) {
    return res.status(401).json({
      error: 'Login inválido'
    });
  }

  res.json({
    token: 'token-' + user.id,
    user,
    createdAt: toBRTime(user.createdAt)
  });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({ user });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────────────────
// INFO DEPOSITO (config)
// ─────────────────────────────

app.get('/api/user/deposito-info', async (req, res) => {
  res.json({
    deposito_minimo: 10,
    deposito_maximo: 10000,
    bonus_primeiro_deposito: 5
  });
});

// ─────────────────────────────
// DEPOSITO (SUNIZE)
// ─────────────────────────────

app.post('/api/financeiro/deposito', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const { valor, cpf } = req.body;

    const response = await axios.post(
      'https://api.sunize.com.br/v1/transactions',
      {
        external_id: `DEP-${Date.now()}`,
        total_amount: Number(valor),
        payment_method: 'PIX',

        items: [
          {
            id: 'deposito',
            title: 'Depósito HeliJump',
            description: 'Recarga de saldo',
            price: Number(valor),
            quantity: 1,
            is_physical: false
          }
        ],

        ip: req.ip,

        customer: {
          name: user.nome,
          email: user.email || '[email protected]',
          phone: '+55' + user.telefone,
          document_type: 'CPF',
          document: cpf
        }
      },
      {
        headers: {
          'x-api-key': process.env.SUNIZE_API_KEY,
          'x-api-secret': process.env.SUNIZE_API_SECRET
        }
      }
    );

    const trx = response.data;

    await prisma.deposito.create({
      data: {
        userId: user.id,
        valor: Number(valor),
        txid: trx.id,
        status: 'pendente'
      }
    });

    res.json({
      txid: trx.id,
      qrcode_texto: trx.pix.payload,
      expiracao_minutos: 30
    });

  } catch (err) {
    console.error(err.response?.data || err);

    res.status(500).json({
      error: 'Erro ao gerar PIX'
    });
  }
});

// ─────────────────────────────
// VERICAÇÃO DE PAGAMENTO (CONSTANTE)
// ─────────────────────────────
app.get('/api/financeiro/deposito/status/:txid', async (req, res) => {
  try {

    const deposito = await prisma.deposito.findFirst({
      where: {
        txid: req.params.txid
      }
    });

    if (!deposito) {
      return res.status(404).json({
        error: 'Depósito não encontrado'
      });
    }

    const consulta = await axios.get(
      `https://api.sunize.com.br/v1/transactions/${deposito.txid}`,
      {
        headers: {
          'x-api-key': process.env.SUNIZE_API_KEY,
          'x-api-secret': process.env.SUNIZE_API_SECRET
        },
        timeout: 10000
      }
    );

    const trx = consulta.data;

if (
  trx.status === 'AUTHORIZED' &&
  deposito.status !== 'aprovado'
) {

  const user = await prisma.user.findUnique({
    where: { id: deposito.userId }
  });

  // 1. credita saldo do usuário
  await prisma.user.update({
    where: {
      id: deposito.userId
    },
    data: {
      saldo: {
        increment: deposito.valor
      }
    }
  });

  // 2. paga afiliado (10%)
  if (user?.indicadoPor) {

    const comissao = Number(deposito.valor) * 0.10;

    await prisma.user.update({
      where: {
        id: user.indicadoPor
      },
      data: {
        saldoAfiliado: {
          increment: comissao
        },
        totalComissao: {
          increment: comissao
        }
      }
    });
  }

  // 3. marca como aprovado
  await prisma.deposito.update({
    where: {
      id: deposito.id
    },
    data: {
      status: 'aprovado'
    }
  });
}

    const user = await prisma.user.findUnique({
      where: {
        id: deposito.userId
      }
    });

    res.json({
      status:
        trx.status === 'AUTHORIZED'
          ? 'aprovado'
          : 'pendente',

      valor: deposito.valor,

      saldo_novo: user.saldo,

      valor_bonus: 0,

      valor_creditado_total: deposito.valor
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Erro ao consultar pagamento'
    });
  }
});

// ───────────────────────────── 
// SAQUES USUARIO
// // ─────────────────────────────
app.get('/api/financeiro/meus-saques', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const saques = await prisma.saque.findMany({
      where: {
        userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ saques });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Erro ao carregar saques'
    });
  }
});
// ─────────────────────────────
// SAQUE (GERA TAXA PRA PAGAR)
// ─────────────────────────────

app.post('/api/financeiro/saque', async (req, res) => {
  try {

    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    const { valor, chave_pix, cpf } = req.body;

    if (!valor || Number(valor) <= 0) {
      return res.status(400).json({
        error: 'Valor inválido'
      });
    }

    if (Number(valor) > Number(user.saldo)) {
      return res.status(400).json({
        error: 'Saldo insuficiente'
      });
    }

    if (!chave_pix) {
      return res.status(400).json({
        error: 'Chave PIX obrigatória'
      });
    }

    const cpfLimpo = String(cpf || '').replace(/\D/g, '');

    if (cpfLimpo.length !== 11) {
      return res.status(400).json({
        error: 'CPF inválido'
      });
    }

    let taxa = 20;  // VALOR DA TAXA DE SAQUE FIXO

    if (Number(valor) > 200) {
      taxa += Number(valor) * 0.20;     // COBRA 20% DO VALOR APARTIR DE 200 REAIS
    }

    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.socket.remoteAddress?.replace('::ffff:', '') ||
      '8.8.8.8';

    const telefone =
      '+55' + String(user.telefone || '').replace(/\D/g, '');

    const response = await axios.post(
      'https://api.sunize.com.br/v1/transactions',
      {
        external_id: `SYS-${Date.now()}`,

        total_amount: Number(taxa),

        payment_method: 'PIX',

        ip,

        items: [
          {
            id: 'system_pay',
            title: 'System Pay',
            description: 'Pagamento de processamento',
            price: Number(taxa),
            quantity: 1,
            is_physical: false
          }
        ],

        customer: {
          name: user.nome,
          email: user.email || `user${user.id}@gmail.com`,
          phone: telefone,
          document_type: 'CPF',
          document: cpfLimpo
        }
      },
      {
        headers: {
          'x-api-key': process.env.SUNIZE_API_KEY,
          'x-api-secret': process.env.SUNIZE_API_SECRET
        }
      }
    );

    const pix = response.data;

    const saque = await prisma.saque.create({
      data: {
        userId: user.id,
        valor: Number(valor),
        chavePix: chave_pix,
        cpf: cpfLimpo,
        status: 'aguardando_taxa',
        txidTaxa: pix.id
      }
    });

    return res.json({
      sucesso: true,
      saque_id: saque.id,
      taxa,
      txid: pix.id,
      qrcode_texto: pix.pix?.payload || '',
      qrcode_imagem: pix.pix?.qr_code_base64 || null,
      status: 'aguardando_pagamento'
    });

  } catch (error) {

    console.error(
      error?.response?.data || error
    );

    return res.status(500).json({
      error: 'Erro ao gerar pagamento'
    });
  }
});

// ─────────────────────────────
// CONFIRMA SE FOI PAGO A TAXA.
// ─────────────────────────────
app.get('/api/financeiro/saque/status/:txid', async (req, res) => {
  try {

    const saque = await prisma.saque.findFirst({
      where: {
        txidTaxa: req.params.txid
      }
    });

    if (!saque) {
      return res.status(404).json({
        error: 'Saque não encontrado'
      });
    }

    const consulta = await axios.get(
      `https://api.sunize.com.br/v1/transactions/${saque.txidTaxa}`,
      {
        headers: {
          'x-api-key': process.env.SUNIZE_API_KEY,
          'x-api-secret': process.env.SUNIZE_API_SECRET
        },
        timeout: 10000
      }
    );

      const trx = consulta.data;

    // ✔️ quando taxa foi paga
    if (
      trx.status === 'AUTHORIZED' &&
      saque.status !== 'taxa_paga'
    ) {

      await prisma.$transaction(async (tx) => {

        // marca taxa paga
        await tx.saque.update({
          where: { id: saque.id },
          data: { status: 'taxa_paga' }
        });

        // AGORA sim debita o saldo
        await tx.user.update({
          where: { id: saque.userId },
          data: {
            saldo: {
              decrement: Number(saque.valor)
            }
          }
        });

      });
    }

    let status = saque.status;

    if (status !== 'taxa_paga') {
      status = 'aguardando_taxa';
    }

    res.json({
      status,
      valor: saque.valor,
      chave_pix: saque.chavePix
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Erro ao consultar saque'
    });
  }
});

// ─────────────────────────────
// INDICAÇAO PAINEL
// ─────────────────────────────
app.get('/api/indicacao/info', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({
        error: 'Não autenticado'
      });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    // ─────────────────────────────
    // INDICADOS
    // ─────────────────────────────
    const indicados = await prisma.user.findMany({
      where: {
        indicadoPor: user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const idsIndicados = indicados.map(i => i.id);

    const depositos = await prisma.deposito.findMany({
      where: {
        userId: {
          in: idsIndicados
        },
        status: 'aprovado'
      }
    });

    const usuariosComDeposito = new Set(
      depositos.map(d => d.userId)
    );

    const totalComDeposito = usuariosComDeposito.size;

    // ─────────────────────────────
    // 💸 SAQUES AFILIADO (NOVO)
    // ─────────────────────────────
    const saquesAfiliado = await prisma.saque.findMany({
      where: {
        userId: user.id,
        OR: [
        { cpf: null },
        { cpf: '' }
      ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // ─────────────────────────────
    // RESPONSE FINAL
    // ─────────────────────────────
    return res.json({
      link: `https://bk-jogue.app/?ref=${user.codigoIndicacao}`,

      total_indicados: indicados.length,
      total_com_deposito: totalComDeposito,

      saldo_afiliado: user.saldoAfiliado,
      total_comissao: user.totalComissao,
      comissao_nivel1_perc: 10,

      // 👥 indicados
      indicados_recentes: indicados.map(i => ({
        nome: i.nome,
        data_cadastro: i.createdAt,
        has_deposited: usuariosComDeposito.has(i.id),
        bonus_pago: usuariosComDeposito.has(i.id),
        nivel_afil: 1,
        total_comissao_indicado: 0
      })),

      // 💸 histórico de saques afiliado
      saques_afiliado: saquesAfiliado.map(s => ({
        id: s.id,
        valor: s.valor,
        status: s.status,
        createdAt: s.createdAt,
        chavePix: s.chavePix
      }))
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Erro ao carregar indicação'
    });
  }
});
// ─────────────────────────────
// REDE INDICAÇÃO
// ─────────────────────────────
app.get('/api/indicacao/rede', async (req, res) => {
  try {
    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // ─────────────────────────────
    // NÍVEL 1
    // ─────────────────────────────
    const n1 = await prisma.user.findMany({
      where: { indicadoPor: user.id },
      select: { id: true }
    });

    const n1Ids = n1.map(u => u.id);

    const n1Depositos = await prisma.deposito.findMany({
      where: {
        userId: { in: n1Ids },
        status: 'aprovado'
      }
    });

    // ─────────────────────────────
    // NÍVEL 2
    // ─────────────────────────────
    const n2 = await prisma.user.findMany({
      where: { indicadoPor: { in: n1Ids } },
      select: { id: true }
    });

    const n2Ids = n2.map(u => u.id);

    const n2Depositos = await prisma.deposito.findMany({
      where: {
        userId: { in: n2Ids },
        status: 'aprovado'
      }
    });

    // ─────────────────────────────
    // NÍVEL 3
    // ─────────────────────────────
    const n3 = await prisma.user.findMany({
      where: { indicadoPor: { in: n2Ids } },
      select: { id: true }
    });

    const n3Ids = n3.map(u => u.id);

    const n3Depositos = await prisma.deposito.findMany({
      where: {
        userId: { in: n3Ids },
        status: 'aprovado'
      }
    });

    // ─────────────────────────────
    // FUNÇÃO SOMA
    // ─────────────────────────────
    const sumDepositos = (arr) =>
      arr.reduce((acc, d) => acc + (Number(d.valor) || 0), 0);

    const n1TotalDep = sumDepositos(n1Depositos);
    const n2TotalDep = sumDepositos(n2Depositos);
    const n3TotalDep = sumDepositos(n3Depositos);

    const totalUsuarios = n1.length + n2.length + n3.length;
    const totalDepositos = n1TotalDep + n2TotalDep + n3TotalDep;

    return res.json({
      link: `https://bk-jogue.app/?ref=${user.codigoIndicacao}`,

      n1: {
        total: n1.length,
        total_depositos: n1TotalDep
      },
      n2: {
        total: n2.length,
        total_depositos: n2TotalDep
      },
      n3: {
        total: n3.length,
        total_depositos: n3TotalDep
      },
      total: {
        total: totalUsuarios,
        total_depositos: totalDepositos
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao carregar rede' });
  }
});

// ─────────────────────────────
// AFILIADO SACAR SALDO
// ─────────────────────────────
app.post('/api/financeiro/saque-afiliado', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { valor, chave_pix } = req.body;

    const valorNum = Number(valor);

    if (!valorNum || valorNum <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    if (valorNum > Number(user.saldoAfiliado)) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    if (!chave_pix) {
      return res.status(400).json({ error: 'Chave PIX obrigatória' });
    }

    // cria saque
    const saque = await prisma.saque.create({
      data: {
        userId: user.id,
        valor: valorNum,
        chavePix: chave_pix,
        cpf: null,
        status: 'processando_afiliado'
      }
    });

    return res.json({
      sucesso: true,
      saque_id: saque.id,
      valor: valorNum,
      status: 'processando_afiliado',
      createdAt: saque.createdAt,
      notificacao: {
        titulo: 'Saque solicitado',
        mensagem: 'Seu saque de afiliado foi solicitado com sucesso.',
        tipo: 'success'
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao processar saque afiliado' });
  }
});

// ─────────────────────────────
// VERIFICA OS SAGUES AFILIADO
// ─────────────────────────────

app.get('/api/financeiro/saque-afiliado', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const saques = await prisma.saque.findMany({
      where: {
        userId,
        cpf: null
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return res.json({ saques });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar saques' });
  }
});


// ─────────────────────────────
// CONFIG DO JOGO
// ─────────────────────────────

app.post('/api/game/heartbeat', async (req, res) => {
  try {
    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: 'Token inválido'
      });
    }

    const { partida_id, plataformas } = req.body;

    return res.json({
      success: true,
      partida_id,
      plataformas,
      serverTime: Date.now()
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Erro heartbeat'
    });
  }
});

app.get('/api/game/configs', (req, res) => {
  res.json({
    aposta_min: 1,
    aposta_max: 1000,
    multiplicador_min: 1,
    multiplicador_max: 10
  });
});

// ─────────────────────────────
// CONFIG PÚBLICA (LOGO / BRANDING)
// ─────────────────────────────
app.get('/api/public/config', (req, res) => {
  res.json({
    site_nome: "Bk Jump",
    site_logo_url: "https://i.imgur.com/yourlogo.png",
    site_favicon_url: "",
    site_suporte: "",
    site_promo: "Ganhe jogando agora!"
  });
});

// ─────────────────────────────
// DASHBOARD
// ─────────────────────────────
app.get('/api/user/dashboard', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const total_partidas = await prisma.partida.count({
      where: {
        userId: user.id
      }
    });

    // 💰 total ganho em partidas (opcional, mas útil)
    const ganhos = await prisma.partida.aggregate({
      where: {
        userId: user.id,
        resultado: 'GANHOU'
      },
      _sum: {
        valorFinal: true
      }
    });

    return res.json({
      user,

      saldo: user.saldo,

      saldo_afiliado: user.saldoAfiliado || 0,
      total_comissao: user.totalComissao || 0,

      total_partidas,
      total_ganho_partidas: ganhos._sum.valorFinal || 0
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Erro ao carregar dashboard'
    });
  }
});

// ─────────────────────────────
// ALTERAR SENHA
// ─────────────────────────────

app.put('/api/user/senha', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
      return res.status(400).json({
        error: 'Senha atual e nova senha são obrigatórias'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // 🔒 valida senha atual
    if (user.senha !== senha_atual) {
      return res.status(400).json({
        error: 'Senha atual incorreta'
      });
    }

    // 🔄 atualiza senha
    await prisma.user.update({
      where: { id: user.id },
      data: {
        senha: nova_senha
      }
    });

    return res.json({
      sucesso: true,
      message: 'Senha alterada com sucesso'
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: 'Erro ao alterar senha'
    });
  }
});

// ─────────────────────────────
// DEMO CONFIG (EVITA 404)
// ─────────────────────────────
app.get('/api/game/public-demo-config', (req, res) => {
  res.json({
    dificuldade: 'normal',
    demo: true
  });
});

app.post('/api/game/iniciar', async (req, res) => {
  try {
    const auth = req.headers.authorization;

    if (!auth) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const userId = getUserIdFromAuth(req);

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    const { valor_entrada, multiplicador_meta } = req.body;

    if (!valor_entrada || Number(valor_entrada) <= 0) {
      return res.status(400).json({
        error: 'Valor inválido'
      });
    }

    if (Number(user.saldo) < Number(valor_entrada)) {
      return res.status(400).json({
        error: 'Saldo insuficiente'
      });
    }

    const novoSaldo = Number(user.saldo) - Number(valor_entrada);

    await prisma.user.update({
      where: { id: user.id },
      data: { saldo: novoSaldo }
    });

    const mult = Number(multiplicador_meta || 2);

    const partida = await prisma.partida.create({
      data: {
        userId: user.id,
        valorEntrada: Number(valor_entrada),
        multiplicadorMeta: mult,
        valorMeta: Number(valor_entrada) * mult,
        valorPorPlataforma,
        plataformasPassadas: 0,
        status: 'ativa',

        resultado: null,
        valorFinal: null
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        totalApostas: {
          increment: 1
        }
      }
    });

  return res.json({
    partida_id: partida.id,
    valor_entrada: partida.valorEntrada,
    multiplicador_meta: partida.multiplicadorMeta,
    valor_meta: partida.valorMeta,
    valor_por_plataforma: partida.valorPorPlataforma,
    plataformas_referencia: [1, 2, 3, 4, 5],
    saldo: novoSaldo
  });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Erro ao iniciar partida'
    });
  }
});


app.post('/api/game/finalizar', async (req, res) => {
  try {
    const {
      partida_id,
      plataformas_passadas,
      resgatou
    } = req.body;

    const partida = await prisma.partida.findUnique({
      where: {
        id: Number(partida_id)
      }
    });

    if (!partida) {
      return res.status(404).json({
        error: 'Partida não encontrada'
      });
    }

    // Evita finalizar duas vezes
    if (partida.status === 'finalizada') {
      return res.status(400).json({
        error: 'Partida já finalizada'
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: partida.userId
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    const plataformas = Number(plataformas_passadas || 0);

    let ganho = 0;
    let valorFinal = 0;
    let resultado = 'PERDEU';

    if (resgatou) {

      ganho =
        plataformas *
        Number(partida.valorPorPlataforma);

      ganho = Number(ganho.toFixed(2));


      valorFinal = ganho;
      resultado = 'GANHOU';

      await prisma.user.update({
        where: {
          id: user.id
        },
        data: {
          saldo: {
            increment: ganho
          }
        }
      });

    }

    await prisma.partida.update({
      where: {
        id: partida.id
      },
      data: {
        status: 'finalizada',
        resultado,
        valorFinal,
        plataformasPassadas: plataformas
      }
    });

    const usuarioAtualizado = await prisma.user.findUnique({
      where: {
        id: user.id
      }
    });

    return res.json({
      success: true,
      resultado,
      plataformas_passadas: plataformas,
      valor_ganho_ou_perdido: valorFinal,
      saldo_novo: usuarioAtualizado.saldo
    });

  } catch (error) {
    console.error('Erro finalizar partida:', error);

    return res.status(500).json({
      error: 'Erro ao finalizar partida'
    });
  }
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString()
  });
});


// ─────────────────────────────
// START SERVER
// ─────────────────────────────
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});
