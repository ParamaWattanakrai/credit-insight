import { createHmac, randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';


const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

export function tableauConfig() {
	const clientId = env.TABLEAU_CLIENT_ID?.trim();
	const secretId = env.TABLEAU_SECRET_ID?.trim();
	const secretValue = env.TABLEAU_SECRET_VALUE?.trim();
	const user = env.TABLEAU_USER?.trim();
	const server = env.TABLEAU_SERVER_URL?.trim();
	if (!clientId || !secretId || !secretValue || !user || !server) return null;
	try {
		return { clientId, secretId, secretValue, user, origin: new URL(server).origin };
	} catch {
		return null;
	}
}

export function signTableauToken(cfg: NonNullable<ReturnType<typeof tableauConfig>>): string {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: 'HS256', typ: 'JWT', kid: cfg.secretId, iss: cfg.clientId };
	const payload = {
		iss: cfg.clientId,
		sub: cfg.user,
		aud: 'tableau',
		jti: randomUUID(),
		iat: now - 30, // small allowance for clock drift
		exp: now + 300,
		scp: ['tableau:views:embed', 'tableau:metrics:embed']
	};
	const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
	const sig = createHmac('sha256', cfg.secretValue).update(data).digest('base64url');
	return `${data}.${sig}`;
}
