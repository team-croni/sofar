import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ListeningService } from './listening.service';
import { LtrRow, TrainResult, trainModel } from './ltr';
import { supabaseRest } from './supabase-rest';

const PAGE = 1000;
const MAX_ROWS = 60000;
const DAY_MS = 24 * 3600 * 1000;

/**
 * 추천 3단계 학습 실행기
 * - 하루 한 번(서버 시작 10분 뒤부터) 최근 30일 데이터로 가중치를 학습한다. REC_LTR_AUTO_TRAIN=false 면 끈다.
 * - 관리자는 POST /api/recommend/model/train 으로 바로 실행할 수 있다.
 * - 데이터가 부족하거나 기존 가중치보다 낫지 않으면 아무것도 바꾸지 않는다.
 */
@Injectable()
export class LtrTrainerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LtrTrainerService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;
  private lastResult: (TrainResult & { at: string; version?: string }) | null =
    null;

  constructor(private readonly listening: ListeningService) {}

  onModuleInit() {
    if (process.env.REC_LTR_AUTO_TRAIN === 'false') return;
    const run = () => {
      void this.train().catch(() => undefined);
    };
    const first = setTimeout(run, 10 * 60 * 1000);
    const daily = setInterval(run, DAY_MS);
    first.unref?.();
    daily.unref?.();
    this.timers.push(first, daily);
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  private async loadRows(): Promise<LtrRow[] | null> {
    const rows: LtrRow[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const res = await supabaseRest<
        Array<Omit<LtrRow, 'position'> & { item_position: number }>
      >(`rpc/get_ltr_training_rows?limit=${PAGE}&offset=${offset}`, {
        method: 'POST',
        body: JSON.stringify({ window_days: 30, per_viewer_cap: 200 }),
      });
      if (!res.ok) return offset === 0 ? null : rows;
      const page = res.data || [];
      // DB 함수는 position 대신 item_position으로 내보낸다 (예약어)
      rows.push(
        ...page.map(({ item_position, ...row }) => ({
          ...row,
          position: Number(item_position) || 0,
        })),
      );
      if (page.length < PAGE) break;
    }
    return rows;
  }

  async train() {
    if (this.running) return { started: false, reason: '이미 학습 중입니다.' };
    this.running = true;
    try {
      const rows = await this.loadRows();
      if (!rows) {
        const result = {
          accepted: false,
          reason:
            '학습 데이터 함수가 없습니다 (supabase_rec_ltr.sql 실행 필요)',
          weights: null,
          metrics: {
            samples: 0,
            positives: 0,
            trainSamples: 0,
            validSamples: 0,
            auc: null,
            baselineAuc: null,
            logloss: null,
          },
        } satisfies TrainResult;
        this.lastResult = { ...result, at: new Date().toISOString() };
        return this.lastResult;
      }
      const result = trainModel(rows);
      let version: string | undefined;
      if (result.accepted && result.weights) {
        version = `ltr-${new Date().toISOString().slice(0, 16).replace(':', '-')}`;
        // 켜진 모델은 하나만: 기존 것을 끄고 새 것을 켠다
        await supabaseRest('rec_model_weights?active=eq.true', {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ active: false }),
        });
        const saved = await supabaseRest('rec_model_weights', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            version,
            weights: result.weights,
            metrics: result.metrics,
            active: true,
          }),
        });
        if (!saved.ok) {
          this.logger.warn(`[LTR] 저장 실패: ${saved.error}`);
          version = undefined;
        } else {
          this.listening.clearModelCache();
        }
      }
      this.lastResult = { ...result, at: new Date().toISOString(), version };
      this.logger.log(
        `[LTR] ${result.accepted ? `새 가중치 ${version}` : '유지'}: ${result.reason} ` +
          `(노출 ${result.metrics.samples}, 감상 ${result.metrics.positives}, ` +
          `AUC ${result.metrics.auc?.toFixed(3) ?? '-'} / 기존 ${result.metrics.baselineAuc?.toFixed(3) ?? '-'})`,
      );
      return this.lastResult;
    } finally {
      this.running = false;
    }
  }

  async status() {
    return {
      active: await this.listening.loadActiveModel(),
      cfNeighbors: await this.listening.cfNeighborStatus(),
      lastRun: this.lastResult,
      running: this.running,
    };
  }
}
