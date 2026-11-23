import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
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

  /** 내 핸들(@아이디). 없으면 이때 만들어진다 */
  @Get('handle')
  @UseGuards(SupabaseUserGuard)
  async getHandle(@Req() req: { user: { id: string } }) {
    return {
      success: true,
      ...(await this.accountService.getHandle(req.user.id)),
    };
  }

  /** 입력 중 사용 가능 여부 확인 (본인이 쓰던 핸들은 사용 가능) */
  @Get('handle/check')
  @UseGuards(SupabaseUserGuard)
  async checkHandle(
    @Req() req: { user: { id: string } },
    @Query('handle') handle?: string,
  ) {
    return {
      success: true,
      ...(await this.accountService.checkHandle(req.user.id, handle)),
    };
  }

  /** 핸들 바꾸기 (30일에 한 번) */
  @Put('handle')
  @UseGuards(SupabaseUserGuard)
  async changeHandle(
    @Req() req: { user: { id: string } },
    @Body() body: { handle?: unknown },
  ) {
    return {
      success: true,
      ...(await this.accountService.changeHandle(req.user.id, body?.handle)),
    };
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
