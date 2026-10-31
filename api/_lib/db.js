// Apenas servidor. Nunca incluir esta biblioteca no bundle Vite.
let clientPromise;

// Projeto de BI criado exclusivamente para o ST1 Connect (nunca ST1 Academy).
// O host do pooler e publico; a senha permanece na DATABASE_URL privada do Vercel.
const ST1_CONNECT_PROJECT_REF = 'cxqoypwsqokkwcirugrg';
const DIRECT_HOST = `db.${ST1_CONNECT_PROJECT_REF}.supabase.co`;

export function requireDatabaseUrl(env = process.env) {
  const direct = env.DATABASE_URL;
  if (typeof direct !== 'string' || !/^postgres(ql)?:\/\//.test(direct))
    throw new Error('DATABASE_URL indisponível');

  const poolerHost = env.ST1_DB_POOLER_HOST;
  if (!poolerHost) return direct;

  // A alternativa IPv4 e apenas para a branch Preview. Nao migrar prod por engano.
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'preview')
    throw new Error('Pooler somente autorizado em Preview');
  if (!/^aws-[0-9]+-sa-east-1\.pooler\.supabase\.com$/.test(poolerHost))
    throw new Error('Host de Pooler invalido');

  let url;
  try { url = new URL(direct); }
  catch { throw new Error('DATABASE_URL invalida'); }
  if (url.hostname !== DIRECT_HOST || url.port !== '5432' ||
      decodeURIComponent(url.username) !== 'st1_connect_runtime' ||
      url.pathname !== '/postgres')
    throw new Error('A URL nao corresponde ao banco e usuario isolados ST1 Connect');

  // Pooler compartilhado exige role.<project-ref>, diferente da conexao direta.
  // Mantem a senha intacta dentro do runtime, sem grava-la ou expo-la em logs.
  url.hostname = poolerHost;
  url.port = '6543';
  url.username = `st1_connect_runtime.${ST1_CONNECT_PROJECT_REF}`;
  return url.toString();
}

export function databaseOptions(env = process.env) {
  return {
    max: 1,
    connect_timeout: 6,
    idle_timeout: 20,
    ssl: {
      rejectUnauthorized: true,
      ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA } : {}),
    },
    prepare: false,
  };
}

async function client() {
  if (!clientPromise) {
    clientPromise = import('postgres').then(({ default: postgres }) =>
      postgres(requireDatabaseUrl(), databaseOptions())
    ).catch(error => { clientPromise = undefined; throw error; });
  }
  return clientPromise;
}

function result(rows) {
  return {
    rows: Array.from(rows),
    rowCount: typeof rows.count === 'number' ? rows.count : rows.length,
  };
}
function adapter(sql) {
  return Object.freeze({
    query: async (statement, values = []) => {
      if (typeof statement !== 'string' || typeof values?.length !== 'number')
        throw new TypeError('SQL e parâmetros inválidos');
      return result(await sql.unsafe(statement, Array.from(values)));
    },
  });
}

export async function connection() {
  return adapter(await client());
}

export async function inTransaction(fn) {
  const sql = await client();
  return sql.begin(async transaction => fn(adapter(transaction)));
}

export async function closeDatabase() {
  if (clientPromise) {
    const sql = await clientPromise;
    await sql.end();
    clientPromise = undefined;
  }
}
