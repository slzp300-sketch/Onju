import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const { code, redirectUri } = req.body as { code: string; redirectUri: string };
  if (!code || !redirectUri) return res.status(400).json({ error: 'Missing params' });

  // 1. 인가 코드 → 액세스 토큰
  const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.KAKAO_REST_API_KEY!,
      redirect_uri: redirectUri,
      code,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    return res.status(400).json({ error: 'Failed to get token', detail: tokenData });
  }

  // 2. 액세스 토큰 → 사용자 정보
  const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const profile = await profileRes.json() as {
    id: number;
    kakao_account?: { profile?: { nickname?: string }; email?: string };
  };

  return res.status(200).json({
    id: String(profile.id),
    name: profile.kakao_account?.profile?.nickname ?? '카카오 사용자',
    email: profile.kakao_account?.email,
  });
}
