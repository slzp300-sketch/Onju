export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) {
    res.status(500).json({ error: 'Missing KAKAO_REST_API_KEY' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { code, redirectUri } = body ?? {};

  if (!code || !redirectUri) {
    res.status(400).json({ error: 'Missing code or redirectUri' });
    return;
  }

  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restApiKey,
    redirect_uri: redirectUri,
    code,
  });

  if (process.env.KAKAO_CLIENT_SECRET) {
    tokenParams.set('client_secret', process.env.KAKAO_CLIENT_SECRET);
  }

  const tokenResponse = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    res.status(400).json({ error });
    return;
  }

  const token = await tokenResponse.json();
  const profileResponse = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (!profileResponse.ok) {
    const error = await profileResponse.text();
    res.status(400).json({ error });
    return;
  }

  const profile = await profileResponse.json();
  res.status(200).json({
    id: String(profile.id),
    name: profile.kakao_account?.profile?.nickname ?? '카카오 사용자',
    email: profile.kakao_account?.email,
  });
}
