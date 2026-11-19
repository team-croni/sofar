import { Module } from '@nestjs/common';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { SupabaseUserGuard } from './account.guard';

@Module({
  controllers: [AccountController],
  providers: [AccountService, SupabaseUserGuard],
})
export class AccountModule {}
