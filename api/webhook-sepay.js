import { createClient } from '@supabase/supabase-js';

const PRICE_TO_DAYS = {
  7000: 1,
  25000: 5,
  40000: 10,
  70000: 20,
  100000: 30
};

function generateRandomString(length = 6) {
  return Math.random().toString(36).substring(2, 2 + length);
}

async function createQlingAccount(days) {
  const rawUser = generateRandomString(6);
  const username = `${process.env.QLING_PREFIX}-${rawUser}`;
  const password = `Wz@${generateRandomString(6)}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Ctv-Key': process.env.QLING_CTV_KEY
  };

  const createRes = await fetch(`${process.env.QLING_BASE_URL}/api/ctv/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username, password })
  });

  if (!createRes.ok) return { success: false };

  const updateRes = await fetch(`${process.env.QLING_BASE_URL}/api/ctv/users/${encodeURIComponent(username)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ plan: 1, extend_days: days, mode: "Aimdrag_Anten" })
  });

  if (updateRes.ok) {
    return { success: true, account: `${username}|${password}` };
  }
  return { success: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const data = req.body;
    const content = data.content || "";
    const transferAmount = Number(data.transferAmount) || 0;

    const match = content.match(/WAZUE\d+/);
    if (match) {
      const orderCode = match[0];
      const days = PRICE_TO_DAYS[transferAmount];

      if (days) {
        const regResult = await createQlingAccount(days);

        if (regResult.success) {
          await supabase
            .from('orders')
            .update({ status: 'COMPLETED', account: regResult.account })
            .eq('order_code', orderCode);

          return res.status(200).json({ success: true, account: regResult.account });
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
