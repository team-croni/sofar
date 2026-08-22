import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { EmailModule } from './email/email.module';
import { ChartModule } from './chart/chart.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // 환경변수 전역 설정
    ConfigModule.forRoot({
      isGlobal: true,
      // `npm --workspace`는 루트에서, `npm run dev`는 apps/api에서 실행될 수 있다.
      // 두 방식 모두 앱 전용 환경변수를 읽도록 경로를 함께 지정한다.
      envFilePath: [
        join(process.cwd(), '.env'),
        join(process.cwd(), 'apps/api/.env'),
      ],
    }),
    EmailModule,
    ChartModule,
    AdminModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
