import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Supabase 액세스 토큰(Bearer)을 검증하고 request.user에 { id, email }을 실어 준다.
 * 토큰 검증은 Supabase Auth의 /auth/v1/user 엔드포인트에 맡긴다.
 */
@Injectable()
export class SupabaseUserGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!url || !key) {
      throw new ServiceUnavailableException('Supabase is not configured.');
    }

    const request = context.switchToHttp().getRequest();
    const header = (request.headers['authorization'] as string) || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Missing access token.');

    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new UnauthorizedException('Invalid access token.');

    const user = (await res.json()) as { id?: string; email?: string };
    if (!user?.id) throw new UnauthorizedException('Invalid access token.');

    request.user = { id: user.id, email: user.email };
    return true;
  }
}
