import { handleFormatProblem, handleMessage, normalizeHandle } from './handle';
import { nextHandleChangeAt } from './account.service';

describe('handle', () => {
  it('입력을 정리한다 (@ 제거, 소문자, 앞뒤 공백)', () => {
    expect(normalizeHandle('  @Night.Owl ')).toBe('night.owl');
    expect(normalizeHandle(undefined)).toBe('');
  });

  it('형식 문제를 DB와 같은 코드로 알려 준다', () => {
    expect(handleFormatProblem('ab')).toBe('too_short');
    expect(handleFormatProblem('a'.repeat(21))).toBe('too_long');
    expect(handleFormatProblem('밤올빼미')).toBe('invalid_chars');
    expect(handleFormatProblem('night-owl')).toBe('invalid_chars');
    expect(handleFormatProblem('.owl')).toBe('dot_position');
    expect(handleFormatProblem('owl.')).toBe('dot_position');
    expect(handleFormatProblem('night..owl')).toBe('dot_position');
    expect(handleFormatProblem('12345')).toBe('no_letter');
    expect(handleFormatProblem('night_owl.92')).toBeNull();
  });

  it('모르는 이유 코드도 안내 문구가 있다', () => {
    expect(handleMessage('taken')).toContain('이미 사용 중');
    expect(handleMessage('unknown')).toBeTruthy();
  });

  it('다음 변경 가능 시각은 30일 뒤, 지났으면 null', () => {
    const now = Date.parse('2026-11-24T00:00:00Z');
    expect(nextHandleChangeAt(null, now)).toBeNull();
    expect(nextHandleChangeAt('2026-11-20T00:00:00Z', now)).toBe(
      '2026-12-20T00:00:00.000Z',
    );
    expect(nextHandleChangeAt('2026-10-01T00:00:00Z', now)).toBeNull();
  });
});
