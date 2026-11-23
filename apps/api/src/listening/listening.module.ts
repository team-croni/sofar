import { Module } from '@nestjs/common';
import { ChartModule } from '../chart/chart.module';
import { ListeningController } from './listening.controller';
import { ListeningService } from './listening.service';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { LtrTrainerService } from './ltr-trainer.service';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [ChartModule],
  controllers: [ListeningController, SignalsController],
  providers: [ListeningService, SignalsService, LtrTrainerService, AdminGuard],
})
export class ListeningModule {}
