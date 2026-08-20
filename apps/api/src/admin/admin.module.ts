import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ChartModule } from '../chart/chart.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [ChartModule, SearchModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}

