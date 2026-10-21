// Apenas servidor. Nunca incluir esta biblioteca no bundle Vite.
let clientPromise;

export function requireDatabaseUrl(env = process.env) {
  const url = env.DATABASE_URL;
  if (typeof url !== 'string' || !/^postgres(ql)?:\/\//.test(url))
    throw new Error('DATABASE_URL indisponível');
  return url;
}

async function client() {
  if (!clientPromise) {
    clientPromise = import('postgres').then(({ default: postgres }) =>
      postgres(requireDatabaseUrl(), {
        max: 3,
        connect_timeout: 6,
        idle_timeout: 20,
        ssl: 'require',
        prepare: false,
      })
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
