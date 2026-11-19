import { Module } from '@nestjs/common';
import { ChartModule } from '../chart/chart.module';
import { ListeningController } from './listening.controller';
import { ListeningService } from './listening.service';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

@Module({
  imports: [ChartModule],
  controllers: [ListeningController, SignalsController],
  providers: [ListeningService, SignalsService],
})
export class ListeningModule {}
