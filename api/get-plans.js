const plans = [
  { name: 'Wazue 1 Ngày', amount: 7000 },
  { name: 'Wazue 5 Ngày', amount: 25000 },
  { name: 'Wazue 10 Ngày', amount: 40000 },
  { name: 'Wazue 20 Ngày', amount: 70000 },
  { name: 'Wazue 30 Ngày', amount: 100000 }
];

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json(plans);
}
