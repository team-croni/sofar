import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface RateLimitRecord {
  lastSentAt: number;
  count: number;
  windowStart: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  // ── 이메일 어뷰징(스팸 폭탄 및 쿼터 소진) 방지 Rate Limiter ──
  private readonly emailRateLimits = new Map<string, RateLimitRecord>();
  private readonly COOLDOWN_MS = 60 * 1000; // 동일 수신자 1분 쿨다운
  private readonly MAX_PER_HOUR = 5; // 1시간당 동일 수신자 최대 5회
  private readonly WINDOW_MS = 60 * 60 * 1000; // 1시간 윈도우

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: this.config.get<string>('GMAIL_USER')?.trim(),
        pass: this.config.get<string>('GMAIL_APP_PASSWORD')?.trim(),
      },
    });
  }

  /**
   * 이메일 발송 전 Rate Limiting 검증
   */
  private checkRateLimit(email: string): void {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail) return;

    const now = Date.now();
    const record = this.emailRateLimits.get(cleanEmail);

    if (record) {
      // 1. 1분 쿨다운 검증
      if (now - record.lastSentAt < this.COOLDOWN_MS) {
        const waitSec = Math.ceil((this.COOLDOWN_MS - (now - record.lastSentAt)) / 1000);
        this.logger.warn(`Email rate limit hit (Cooldown): ${cleanEmail} (wait ${waitSec}s)`);
        throw new HttpException(
          `이메일 재발송 대기 시간입니다. ${waitSec}초 후에 다시 시도해주세요.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // 2. 1시간 윈도우 검증
      if (now - record.windowStart < this.WINDOW_MS) {
        if (record.count >= this.MAX_PER_HOUR) {
          this.logger.warn(`Email rate limit hit (Hourly Max): ${cleanEmail}`);
          throw new HttpException(
            '단시간에 너무 많은 이메일 발송이 요청되었습니다. 1시간 후에 다시 시도해주세요.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        record.count += 1;
        record.lastSentAt = now;
      } else {
        // 새로운 1시간 윈도우 시작
        record.windowStart = now;
        record.count = 1;
        record.lastSentAt = now;
      }
    } else {
      // 신규 기록
      this.emailRateLimits.set(cleanEmail, {
        lastSentAt: now,
        count: 1,
        windowStart: now,
      });
    }

    // 메모리 누수 방지 (1000개 초과 시 2시간 이상 지난 오래된 레코드 정리)
    if (this.emailRateLimits.size > 1000) {
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      for (const [key, val] of this.emailRateLimits.entries()) {
        if (val.lastSentAt < twoHoursAgo) {
          this.emailRateLimits.delete(key);
        }
      }
    }
  }

  async sendOtp(email: string, token: string): Promise<void> {
    this.checkRateLimit(email);

    const from = `"sofar" <${this.config.get<string>('GMAIL_USER')?.trim()}>`;

    await this.transporter.sendMail({
      from,
      to: email,
      subject: '[sofar] 이메일 인증 코드',
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #12100e; color: #f5f2eb; border-radius: 16px;">
          <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 8px; color: #f5f2eb;">sofar 이메일 인증</h2>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            아래 6자리 인증 코드를 sofar 앱에 입력해주세요.
          </p>
          <div style="background: #1a1512; border: 1px solid rgba(212,163,115,0.2); border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 42px; font-weight: 900; letter-spacing: 14px; color: #d4a373; font-family: monospace;">${token}</span>
          </div>
          <p style="color: #555; font-size: 12px; line-height: 1.6; margin: 0;">
            이 코드는 <strong style="color: #777;">10분간</strong> 유효합니다.<br>
            본인이 요청하지 않은 경우 이 메일을 무시해주세요.
          </p>
        </div>
      `,
    });

    this.logger.log(`OTP sent to ${email}`);
  }

  async sendPasswordReset(email: string, resetLink: string): Promise<void> {
    this.checkRateLimit(email);

    const from = `"sofar" <${this.config.get<string>('GMAIL_USER')?.trim()}>`;

    await this.transporter.sendMail({
      from,
      to: email,
      subject: '[sofar] 비밀번호 재설정',
      html: `
        <div style="font-family: 'Helvetica Neue', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #12100e; color: #f5f2eb; border-radius: 16px;">
          <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 8px; color: #f5f2eb;">비밀번호 재설정</h2>
          <p style="color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
            아래 버튼을 클릭하여 비밀번호를 재설정하세요.
          </p>
          <a href="${resetLink}" style="display: inline-block; background: #d4a373; color: #1a1209; padding: 14px 28px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none;">
            비밀번호 재설정하기
          </a>
          <p style="color: #555; font-size: 12px; line-height: 1.6; margin-top: 24px;">
            이 링크는 1시간 후 만료됩니다.<br>
            본인이 요청하지 않은 경우 무시해주세요.
          </p>
        </div>
      `,
    });

    this.logger.log(`Password reset email sent to ${email}`);
  }
}
