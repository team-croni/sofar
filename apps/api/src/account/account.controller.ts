import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
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

  /** 연령·성별 (선택) — 본인만 읽고 쓸 수 있다 */
  @Get('demographics')
  @UseGuards(SupabaseUserGuard)
  async getDemographics(@Req() req: { user: { id: string } }) {
    return {
      success: true,
      ...(await this.accountService.getDemographics(req.user.id)),
    };
  }

  @Put('demographics')
  @UseGuards(SupabaseUserGuard)
  async saveDemographics(
    @Req() req: { user: { id: string } },
    @Body() body: unknown,
  ) {
    return {
      success: true,
      ...(await this.accountService.saveDemographics(req.user.id, body)),
    };
  }
}
