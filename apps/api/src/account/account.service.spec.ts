import { parseDemographics } from './account.service';

describe('parseDemographics', () => {
  const now = new Date('2026-11-24T00:00:00Z');

  it('빈 값은 선택 안 함(null)으로 받는다', () => {
    expect(parseDemographics({ birthYear: '', gender: null }, now)).toEqual({
      value: { birthYear: null, gender: null },
    });
    expect(parseDemographics(undefined, now)).toEqual({
      value: { birthYear: null, gender: null },
    });
  });

  it('올바른 값은 그대로 받는다 (문자열 연도 포함)', () => {
    expect(
      parseDemographics({ birthYear: '1995', gender: 'female' }, now),
    ).toEqual({
      value: { birthYear: 1995, gender: 'female' },
    });
  });

  it('만 14세 미만이 되는 연도는 받지 않는다', () => {
    // 2012년생은 생일 전이면 만 13세일 수 있다
    expect(parseDemographics({ birthYear: 2011 }, now)).toEqual({
      value: { birthYear: 2011, gender: null },
    });
    expect(parseDemographics({ birthYear: 2012 }, now)).toHaveProperty('error');
  });

  it('범위 밖 연도·소수·알 수 없는 성별은 거절한다', () => {
    expect(parseDemographics({ birthYear: 1900 }, now)).toHaveProperty('error');
    expect(parseDemographics({ birthYear: 1990.5 }, now)).toHaveProperty(
      'error',
    );
    expect(parseDemographics({ gender: 'undisclosed' }, now)).toHaveProperty(
      'error',
    );
    expect(parseDemographics({ gender: 'x' }, now)).toHaveProperty('error');
  });
});
