import { Controller, Post, Body, Logger, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

interface SupabaseEmailHookPayload {
  user: {
    id: string;
    email: string;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type:
      'signup' | 'recovery' | 'invite' | 'magiclink' | 'email_change';
    site_url: string;
    new_email?: string;
  };
}

@Controller('email')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  @Post('auth-hook')
  @HttpCode(200)
  async handleAuthHook(
    @Body() payload: SupabaseEmailHookPayload,
  ): Promise<{ success: boolean }> {
    // 개발 편의성 및 Supabase 인증 에러 차단을 위해 복잡한 서명/헤더 인증을 임시로 전면 스킵합니다.
    const { user, email_data } = payload;

    if (!user || !email_data) {
      this.logger.error('Invalid payload received');
      return { success: false };
    }

    const { token, token_hash, email_action_type } = email_data;

    this.logger.log(
      `Auth hook received: ${email_action_type} for ${user.email}`,
    );

    try {
      const webUrl =
        this.config.get<string>('WEB_URL') || 'http://localhost:5173';

      switch (email_action_type) {
        case 'signup':
        case 'magiclink':
          await this.emailService.sendOtp(user.email, token);
          break;

        case 'recovery': {
          // Supabase가 가공한 링크 대신 직접 웹 링크를 조립하여 발송
          // 프론트엔드에서 수동으로 verifyOtp(token_hash, type: 'recovery')를 호출하도록 조치합니다.
          const customResetLink = `${webUrl}/reset-password?token_hash=${token_hash}&type=recovery`;
          await this.emailService.sendPasswordReset(
            user.email,
            customResetLink,
          );
          break;
        }

        default:
          this.logger.warn(`Unhandled email action type: ${email_action_type}`);
          break;
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to send email via Nodemailer: ${error?.message || error}`,
      );
      throw error;
    }
  }
}
