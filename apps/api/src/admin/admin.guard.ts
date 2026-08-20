import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const adminKey = process.env.ADMIN_API_KEY;

    // ADMIN_API_KEY가 설정되지 않은 경우 모든 관리자 요청 차단
    if (!adminKey) {
      this.logger.warn(
        '[AdminGuard] ADMIN_API_KEY is not configured. All admin requests are blocked.',
      );
      throw new UnauthorizedException('Admin access is not configured.');
    }

    const request = context.switchToHttp().getRequest();
    const providedKey = request.headers['x-admin-key'] as string;

    if (!providedKey) {
      throw new UnauthorizedException('Missing admin key.');
    }

    // 타이밍 공격 방지를 위한 constant-time 비교
    const adminKeyBuf = Buffer.from(adminKey, 'utf-8');
    const providedKeyBuf = Buffer.from(providedKey, 'utf-8');

    if (
      adminKeyBuf.length !== providedKeyBuf.length ||
      !crypto.timingSafeEqual(adminKeyBuf, providedKeyBuf)
    ) {
      this.logger.warn('[AdminGuard] Invalid admin key provided.');
      throw new UnauthorizedException('Invalid admin key.');
    }

    return true;
  }
}
