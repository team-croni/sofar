import { Module } from '@nestjs/common';
import { ChartModule } from '../chart/chart.module';
import { ListeningController } from './listening.controller';
import { ListeningService } from './listening.service';

@Module({
  imports: [ChartModule],
  controllers: [ListeningController],
  providers: [ListeningService],
})
export class ListeningModule {}
