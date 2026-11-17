import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Timer, RotateCcw } from 'lucide-react';
import { Modal, Button } from '../ui';
import './LyricsSearchModal.css';
import './LyricsEditModal.css';

const TIME_TAG_RE = /^\s*(\[\d{1,3}:\d{2}(?:\.\d{1,3})?\])+/;
const ANY_TIME_TAG_RE = /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/;

function formatTimeTag(sec) {
  const safe = Math.max(0, sec || 0);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}

/** 입력된 가사의 형식/줄 수 요약 */
function summarize(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { kind: 'empty', lines: 0, tagged: 0 };
  const tagged = lines.filter((l) => ANY_TIME_TAG_RE.test(l)).length;
  if (tagged === 0) return { kind: 'plain', lines: lines.length, tagged };
  // 메타 태그([ar:..] 등)를 제외한 가사 줄 기준
  const lyricLines = lines.filter((l) => !/^\s*\[[a-z]+:.*\]\s*$/i.test(l));
  return { kind: tagged >= lyricLines.length ? 'synced' : 'partial', lines: lyricLines.length, tagged };
}

/**
 * 가사 직접 작성/수정 모달
 * - LRC 파일 불러오기
 * - 재생 위치 타임태그 찍기 (커서 줄에 현재 시간 태그를 넣고 다음 줄로 이동 → 들으면서 연속으로 싱크 작성)
 */
export default function LyricsEditModal({
  isOpen,
  onClose,
  initialLyrics,    // 열 때 채울 가사
  hasCustomLyrics,  // 직접 지정한 가사가 있는지 (되돌리기 노출)
  getCurrentTime,   // () => number, 현재 재생 위치(초)
  onSave,           // (text: string) => void
  onReset,          // () => void
}) {
  const [text, setText] = useState('');
  const [isNew, setIsNew] = useState(true);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingCaretRef = useRef(null);

  // 프로그램으로 텍스트를 바꾼 뒤 커서 위치 복원 (React 렌더 후에 적용해야 끝으로 튀지 않음)
  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    const el = textareaRef.current;
    if (caret == null || !el) return;
    pendingCaretRef.current = null;
    el.focus();
    el.setSelectionRange(caret, caret);
    // 커서 줄이 보이도록 스크롤
    const lineIndex = el.value.slice(0, caret).split('\n').length - 1;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const top = lineIndex * lineHeight;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - lineHeight * 2) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 2);
    }
  }, [text]);

  // 닫히는 애니메이션 중에는 마지막 상태 유지
  const frozenRef = useRef({ hasCustomLyrics });
  if (isOpen) frozenRef.current = { hasCustomLyrics };
  const showReset = frozenRef.current.hasCustomLyrics;

  useEffect(() => {
    if (!isOpen) return;
    const initial = initialLyrics || '';
    setText(initial);
    setIsNew(!initial.trim());
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(0, 0);
      el.scrollTop = 0;
    });
    // 열릴 때 한 번만 초기화
  }, [isOpen]);

  const summary = useMemo(() => summarize(text), [text]);
  const isDirty = text !== (initialLyrics || '');

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(String(ev.target.result || '').replace(/\r\n?/g, '\n'));
    reader.readAsText(file);
  };

  /** 커서가 있는 줄 맨 앞에 현재 재생 시간 태그를 넣고(기존 태그는 교체) 다음 줄로 커서 이동 */
  const insertTimeTag = () => {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value;
    const pos = el.selectionStart;
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
    const lineEndIdx = value.indexOf('\n', pos);
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;

    const line = value.slice(lineStart, lineEnd).replace(TIME_TAG_RE, '').trim();
    const tag = formatTimeTag(getCurrentTime?.() || 0);
    const newLine = line ? `${tag} ${line}` : tag;
    const next = value.slice(0, lineStart) + newLine + value.slice(lineEnd);

    // 다음 줄 맨 앞으로 커서 이동 (마지막 줄이면 줄 끝)
    pendingCaretRef.current = Math.min(lineStart + newLine.length + 1, next.length);
    setText(next);
  };

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isDirty) onSave(text);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      insertTimeTag();
    }
  };

  const statusText = {
    empty: '가사를 입력하세요',
    plain: `일반 가사 · ${summary.lines}줄 (타임태그가 없으면 자동 스크롤되지 않습니다)`,
    partial: `싱크 가사 · ${summary.lines}줄 중 ${summary.tagged}줄에 타임태그`,
    synced: `싱크 가사 · ${summary.lines}줄`,
  }[summary.kind];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isNew ? '가사 작성' : '가사 수정'}
      size="lg"
      className="lsm-modal lem-modal"
    >
      <div className="lsm-root">
        <div className="lem-toolbar">
          <span className="lem-hint">
            줄마다 <code>[00:12.34]</code> 형식의 타임태그를 붙이면 싱크 가사가 됩니다.
          </span>
          <div className="lem-toolbar-actions">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Timer size={14} />}
              onClick={insertTimeTag}
              onMouseDown={(e) => e.preventDefault()}
              title="커서가 있는 줄에 현재 재생 시간을 넣고 다음 줄로 이동 (⌘/Ctrl+I)"
            >
              현재 시간 찍기
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<FileUp size={14} />}
              onClick={() => fileInputRef.current?.click()}
            >
              LRC 불러오기
            </Button>
            <input ref={fileInputRef} type="file" accept=".lrc,.txt" onChange={handleFile} hidden />
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className="lem-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder={'[00:10.00] 가사 첫 줄\n[00:15.50] 가사 두 번째 줄\n\n타임태그 없이 가사만 붙여넣어도 됩니다.'}
          aria-label="가사 입력"
        />

        <div className={`lem-status is-${summary.kind}`}>{statusText}</div>

        <div className="lsm-footer">
          {showReset ? (
            <Button variant="ghost" size="sm" leadingIcon={<RotateCcw size={13} />} onClick={onReset}>
              자동 매칭으로 되돌리기
            </Button>
          ) : (
            <span className="lsm-footer-hint">⌘/Ctrl+I 시간 찍기 · ⌘/Ctrl+Enter 저장</span>
          )}
          <div className="lsm-footer-actions">
            <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
            <Button variant="primary" size="sm" onClick={() => onSave(text)} disabled={!isDirty}>
              저장
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
