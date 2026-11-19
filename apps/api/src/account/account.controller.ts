import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseUserGuard } from './account.guard';
import { AccountService } from './account.service';

@Controller('me')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  /** 회원 탈퇴 — 로그인한 본인 계정만 삭제 가능 */
  @Delete()
  @UseGuards(SupabaseUserGuard)
  @HttpCode(HttpStatus.OK)
  async deleteMe(
    @Req() req: { user: { id: string } },
  ): Promise<{ success: boolean }> {
    await this.accountService.deleteAccount(req.user.id);
    return { success: true };
  }
}
