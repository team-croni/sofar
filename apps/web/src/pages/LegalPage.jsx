import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Shield, FileText, ExternalLink } from 'lucide-react';
import { Logo } from '../components/ui';
import './LegalPage.css';

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'support@croni.com';
const DMCA_EMAIL = import.meta.env.VITE_DMCA_EMAIL || CONTACT_EMAIL;

export default function LegalPage({ defaultTab }) {
  const navigate = useNavigate();
  const location = useLocation();

  // URL 경로에 따라 탭 초기화 (/terms vs /privacy)
  const initialTab =
    defaultTab ||
    (location.pathname.includes('privacy') ? 'privacy' : 'terms');

  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (location.pathname.includes('privacy')) {
      setActiveTab('privacy');
    } else if (location.pathname.includes('terms')) {
      setActiveTab('terms');
    }
  }, [location.pathname]);

  return (
    <div className="legal-page">
      <div className="legal-ambient-glow" aria-hidden="true" />

      <header className="legal-header">
        <div className="legal-header-inner">
          <div className="legal-logo-wrap" onClick={() => navigate('/')}>
            <Logo iconSize={24} titleSize="1.5rem" />
          </div>

          <nav className="legal-header-nav" aria-label="법적 고지 네비게이션">
            <Link
              to="/terms"
              className={`legal-nav-btn ${activeTab === 'terms' ? 'active' : ''}`}
            >
              서비스 이용약관
            </Link>

            <Link
              to="/privacy"
              className={`legal-nav-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            >
              개인정보 처리방침
            </Link>
          </nav>
        </div>
      </header>

      <main className="legal-main">
        <div className="legal-card">
          {/* ══════════════════════════════════════════════════
              1. 서비스 이용약관 (Terms of Service)
             ══════════════════════════════════════════════════ */}
          {activeTab === 'terms' && (
            <article className="legal-content">
              <div className="legal-title-group">
                <h1 className="legal-main-title">서비스 이용약관</h1>
                <p className="legal-date">시행일자: 2026년 11월 20일 (v2.2.0)</p>
              </div>

              <section className="legal-section">
                <h2>제1조 (목적)</h2>
                <p>
                  본 약관은 <span>Croni</span>(이하 "회사")가 제공 및 운영하는 웹 오디오 플레이어 서비스 <span>sofar</span>(이하 "서비스")의 이용과 관련하여 회사와 회원(또는 비회원 게스트 이용자) 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제2조 (외부 서비스 약관 및 정책의 준용)</h2>
                <p>
                  1. 본 서비스는 Google LLC의 <span>YouTube IFrame Player API</span>를 활용하여 미디어를 스트리밍 및 렌더링합니다.<br />
                  2. 이용자는 본 서비스를 이용함으로써 다음 외부 서비스의 약관 및 개인정보 정책에 구속되며 이를 준수하는 데 동의한 것으로 간주됩니다:
                </p>
                <ul>
                  <li>
                    <a
                      href="https://www.youtube.com/t/terms"
                      target="_blank"
                      rel="noreferrer"
                      className="legal-link"
                    >
                      YouTube 서비스 약관 <ExternalLink size={13} />
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.google.com/policies/privacy"
                      target="_blank"
                      rel="noreferrer"
                      className="legal-link"
                    >
                      Google 개인정보 보호정책 <ExternalLink size={13} />
                    </a>
                  </li>
                </ul>
                <p>
                  3. 이용자는 언제든지 Google 보안 설정 페이지(
                  <a
                    href="https://security.google.com/settings/security/permissions"
                    target="_blank"
                    rel="noreferrer"
                    className="legal-link"
                  >
                    Google 보안 계정 권한 관리 <ExternalLink size={13} />
                  </a>
                  )를 방문하여 본 서비스에 부여한 Google 계정 접근 권한을 직접 조회하고 철회할 수 있습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제3조 (지식재산권의 귀속 및 콘텐츠 정책)</h2>
                <p>
                  1. 서비스 내에서 재생되는 모든 음악, 비디오 스트림, 앨범 아트워크, 가사 등의 지식재산권은 해당 저작물의 원저작자, 음원 유통사 및 YouTube 콘텐츠 크리에이터에게 귀속됩니다.<br />
                  2. 본 서비스는 오디오 스트림이나 영상을 자체 서버에 다운로드, 복제, 추출(Rip)하거나 재배포하지 않으며, YouTube 공식 API를 통한 합법적 임베드 플레이어 인터페이스만을 제공합니다.<br />
                  3. 가사, 곡 정보, 앨범 이미지, 비슷한 곡 정보는 외부 공개 API(LRCLIB, iTunes, Last.fm 등)의 공개 데이터를 활용하여 제공하며, 상업적 목적으로 재가공되지 않습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제4조 (이용자의 의무 및 금지행위)</h2>
                <p>이용자는 본 서비스 이용 시 다음 각 호의 행위를 하여서는 안 됩니다:</p>
                <ul>
                  <li>서비스의 정상적인 운영을 방해하거나 서버에 과도한 부하를 유발하는 자동화된 스크립트, 크롤러, 봇의 무단 사용</li>
                  <li>YouTube IFrame Player의 UI 요소를 비정상적으로 은폐, 변조하거나 기술적 보호조치를 우회하는 행위</li>
                  <li>음원 일치 여부 피드백 등에 허위 정보를 지속적으로 제출하거나 비정상적으로 반복 제출하는 행위</li>
                  <li>반복 재생, 반복 검색 등 비정상적인 방법으로 실시간 순위, 인기 검색어, 추천 결과를 조작하는 행위</li>
                  <li>타인의 계정 정보, 소셜 토큰을 도용하거나 부정한 목적으로 접근하는 행위</li>
                  <li>서비스를 영리 목적으로 무단 재배포하거나 복제, 판매하는 행위</li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>제5조 (게스트 모드 및 사용자 데이터 관리)</h2>
                <p>
                  1. 비회원 이용자(이하 "게스트")는 회원가입 없이도 플레이리스트 임시 생성 및 음악 재생 기능을 이용할 수 있습니다.<br />
                  2. 게스트 모드에서 생성된 플레이리스트 및 설정 데이터는 이용자 브라우저의 로컬 저장소(Local Storage)에만 보관됩니다.<br />
                  3. 이용자가 브라우저 저장 데이터를 삭제하거나 기기를 변경하는 경우 게스트 데이터가 영구 유실될 수 있으며, 회사는 이에 대해 복구 책임을 지지 않습니다. 영구적인 클라우드 동기화를 위해서는 회원가입(로그인)을 권장합니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제6조 (개인화 추천, 순위 및 공개 플레이리스트)</h2>
                <p>
                  1. 서비스는 이용자의 감상 기록, 즐겨찾기, 플레이리스트에 담은 곡을 바탕으로 노래와 플레이리스트를 추천합니다. 추천 결과는 참고용이며, 회사는 추천의 정확성이나 이용자 취향과의 일치를 보장하지 않습니다.<br />
                  2. 실시간 인기 순위와 인기 검색어는 전체 이용자의 감상·검색 기록을 개인을 알아볼 수 없는 형태로 집계하여 제공합니다.<br />
                  3. 이용자가 공개로 설정한 플레이리스트는 다른 이용자의 홈 화면 추천 목록 등에 노출될 수 있으며, 이때 작성자 이름과 이용자가 직접 올린 프로필 이미지가 함께 표시됩니다. 작성자를 익명으로 표시하면 이름과 프로필 이미지는 표시되지 않습니다.<br />
                  4. 이용자는 플레이리스트를 언제든지 비공개로 바꿔 노출을 중단할 수 있습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제7조 (사용자 피드백 및 기여 데이터)</h2>
                <p>
                  1. 이용자가 서비스 품질 개선을 위해 제출한 음원 일치 여부 피드백, 커스텀 가사 오프셋 보정값 등은 서비스의 정확도 향상 및 메타데이터 정제를 위해 비독점적으로 활용될 수 있습니다.<br />
                  2. 허위 정보 제보 또는 악의적인 시스템 교란 행위가 확인된 경우, 해당 이용자의 피드백 접수 권한이 제한될 수 있습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제8조 (면책 조항 및 서비스의 변경·중단)</h2>
                <p>
                  1. 회사는 YouTube 등 외부 플랫폼의 API 정책 변경, 영상의 비공개/삭제, 서비스 장애 등으로 인해 재생이 일시 중단되거나 지연되는 경우에 대해 책임을 지지 않습니다.<br />
                  2. 회사는 정기 점검, 인프라 교체, 천재지변 및 기타 불가항력적인 사유가 발생하는 경우 사전 공지 후(긴급한 경우 사후 공지) 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>제9조 (저작권 침해 신고 및 DMCA 창구)</h2>
                <p>
                  저작권자 또는 관련 권리자는 서비스 내에 표시되는 콘텐츠가 본인의 지식재산권을 침해한다고 판단되는 경우 아래 공식 창구로 권리 침해 사실 및 삭제를 요청할 수 있으며, 서비스는 확인 즉시 해당 콘텐츠의 색인 및 노출을 차단합니다.
                </p>
                <p className="legal-contact-box">
                  <span>저작권 침해 및 DMCA 접수처:</span>{' '}
                  <a href={`mailto:${DMCA_EMAIL}`} className="legal-link">
                    {DMCA_EMAIL}
                  </a>
                </p>
              </section>

              <section className="legal-section">
                <h2>제10조 (준거법 및 관할 법원)</h2>
                <p>
                  본 약관의 해석 및 서비스 이용과 관련하여 회사와 이용자 간에 발생한 분쟁에 대해서는 대한민국 법률을 준거법으로 하며, 분쟁에 관한 소송은 민사소송법상의 관할법원에 제기합니다.
                </p>
              </section>
            </article>
          )}

          {/* ══════════════════════════════════════════════════
              2. 개인정보 처리방침 (Privacy Policy)
             ══════════════════════════════════════════════════ */}
          {activeTab === 'privacy' && (
            <article className="legal-content">
              <div className="legal-title-group">
                <h1 className="legal-main-title">개인정보 처리방침</h1>
                <p className="legal-date">시행일자: 2026년 11월 20일 (v2.2.0)</p>
              </div>

              <section className="legal-section">
                <h2>1. 개인정보의 처리 목적</h2>
                <p>
                  <span>Croni</span>(이하 "회사")는 <span>sofar</span> 서비스 제공을 위해 다음의 목적에 한하여 최소한의 개인정보만을 처리하며, 처리 목적이 변경될 경우 관련 법령에 따라 사전 동의를 구합니다:
                </p>
                <ul>
                  <li><span>회원 관리</span>: 소셜/이메일 계정 기반 본인 식별, 중복 가입 방지, 비인가 부정 이용 방지</li>
                  <li><span>서비스 제공</span>: 플레이리스트 생성 및 다기기 클라우드 동기화, 프로필 이미지 저장, 사용자 맞춤 가사 오프셋 보관</li>
                  <li><span>개인화 추천</span>: 감상 기록, 즐겨찾기, 플레이리스트에 담은 곡을 바탕으로 한 노래·플레이리스트 추천</li>
                  <li><span>통계 및 서비스 품질 향상</span>: 실시간 인기 순위·인기 검색어 집계, 시간대별 이용 현황 등 서비스 이용 통계, 추천 품질 측정, 음원 일치 여부 피드백 정제 및 어뷰징 방지</li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>2. 처리하는 개인정보 항목 및 수집 방법</h2>
                <p>서비스는 회원가입 및 서비스 이용 시 다음과 같은 정보를 수집합니다:</p>
                <ul>
                  <li>
                    <span>소셜(Google OAuth) 로그인 시</span>: 이용자 고유 식별자(UUID), 이메일 주소, 기본 프로필 이름(닉네임), 프로필 이미지 URL
                  </li>
                  <li>
                    <span>이메일 회원가입 시</span>: 이메일 주소, 암호화된 비밀번호(단방향 해시), 닉네임
                  </li>
                  <li>
                    <span>프로필 수정 시 (선택)</span>: 이용자가 직접 올린 프로필 이미지
                  </li>
                  <li>
                    <span>감상 기록 (서비스 이용 시 자동 수집)</span>: 재생한 곡 정보(곡명, 아티스트, 영상 ID), 재생 시작·종료 시각, 실제로 재생된 시간과 곡 길이, 재생을 시작한 방식(검색, 직접 선택, 다음 곡 버튼, 자동 재생 등)과 재생한 목록, 이용자 기기 기준의 시간대·요일·시각, 기기 종류(PC/모바일/태블릿), 브라우저 언어 설정
                  </li>
                  <li>
                    <span>추천 이용 기록 (자동 수집)</span>: 홈 화면에 표시된 추천 항목과 이용자가 선택한 항목
                  </li>
                  <li>
                    <span>검색 기록 (자동 수집)</span>: 검색어. 같은 이용자의 중복 집계를 막기 위해 최근 검색 기록 일부에 한해 브라우저 식별자와 함께 보관하며, 그 밖에는 개인을 알아볼 수 없는 검색어별 집계값만 보관합니다.
                  </li>
                  <li>
                    <span>브라우저 식별자</span>: 비회원을 포함한 감상·검색 기록을 구분하기 위해 브라우저에 저장하는 무작위 문자열입니다. 이름·이메일 등과 연결되지 않으며, 로그인한 경우 회원 식별자와 함께 기록됩니다.
                  </li>
                  <li>
                    <span>브라우저 로컬 저장소 데이터</span>: 게스트 플레이리스트, 가사 싱크 오프셋 보정 수치, 볼륨/테마 등 설정값
                  </li>
                  <li>
                    <span>접속 기록</span>: 서비스 서버 이용 과정에서 IP 주소, 접속 시각 등 접속 로그가 호스팅 사업자의 인프라에 자동으로 기록될 수 있습니다.
                  </li>
                </ul>
                <div className="legal-note-box">
                  ※ 서비스는 이용자의 구글 계정 비밀번호나 신용카드 번호 등 금융 정보, 생년월일·성별 등 인적 사항을 수집하지 않습니다.
                </div>
              </section>

              <section className="legal-section">
                <h2>3. 개인정보의 보유 및 이용 기간, 파기 절차</h2>
                <p>
                  1. 회원 계정 정보는 <span>회원 탈퇴 시까지</span> 보유 및 이용됩니다.<br />
                  2. 감상 기록과 추천 이용 기록은 <span>기록된 날로부터 2년</span>간 보관하며, 기간이 지난 기록은 매일 자동으로 파기됩니다.<br />
                  3. 회원 탈퇴 시 계정 정보, 프로필 이미지, 플레이리스트 및 수록곡, 즐겨찾기, 감상 기록, 추천 이용 기록은 지체 없이 영구 삭제됩니다.<br />
                  4. 비회원의 감상 기록은 브라우저 식별자로만 구분되며, 2항의 기간이 지나면 자동 파기됩니다. 이용자가 브라우저 저장 데이터를 삭제하면 새 식별자가 만들어져 이전 기록과 더 이상 연결되지 않습니다.<br />
                  5. 브라우저 로컬 저장소의 데이터는 이용자가 브라우저 저장 데이터를 삭제하면 즉시 소멸됩니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>4. 개인정보의 처리 위탁 및 국외 이전</h2>
                <p>
                  회사는 이용자의 사전 동의 없이 개인정보를 제3자에게 제공하거나 판매하지 않습니다. 다만, 안정적인 서비스 제공을 위해 다음과 같이 처리를 위탁하고 있으며, 각 수탁자의 서버는 국외(미국 등 각 사업자의 데이터센터 소재국)에 있을 수 있습니다:
                </p>
                <ul>
                  <li>
                    <span>Supabase Inc.</span>: 데이터베이스 호스팅(계정, 플레이리스트, 감상·추천 기록), 로그인 인증 세션 관리, 프로필 이미지 저장
                  </li>
                  <li>
                    <span>Render Services, Inc.</span>: 서비스 API 서버 운영 (감상·검색 기록 처리 및 접속 로그)
                  </li>
                  <li>
                    <span>Vercel Inc.</span>: 웹 서비스 호스팅 (접속 로그)
                  </li>
                  <li>
                    <span>Google LLC</span>: YouTube IFrame Player를 통한 재생, Google 로그인(OAuth), 회원가입·로그인 인증 메일 발송(Gmail) — Google의 개인정보 보호정책에 따라 처리됩니다.
                  </li>
                </ul>
                <div className="legal-note-box">
                  ※ 가사·곡 정보·앨범 이미지·비슷한 곡 정보를 가져오기 위해 LRCLIB, iTunes, Last.fm 등 외부 API에 곡명과 아티스트명을 전송하지만, 이용자를 식별할 수 있는 정보는 전송하지 않습니다.
                </div>
              </section>

              <section className="legal-section">
                <h2>5. 이용자 및 법정대리인의 권리와 행사 방법</h2>
                <p>
                  1. 이용자는 언제든지 본인의 개인정보 열람, 닉네임/프로필 수정, 감상 기록 삭제, 회원 탈퇴를 통한 삭제를 요구할 수 있습니다.<br />
                  2. Google 계정 연동 권한은 Google 보안 설정 페이지(
                  <a
                    href="https://security.google.com/settings/security/permissions"
                    target="_blank"
                    rel="noreferrer"
                    className="legal-link"
                  >
                    https://security.google.com/settings/security/permissions <ExternalLink size={13} />
                  </a>
                  )에서 언제든지 직접 연동을 해제하실 수 있습니다.<br />
                  3. 기타 개인정보 관련 권리 행사는 아래 개인정보 보호책임자 이메일로 요청하시면 지체 없이 조치하겠습니다. 비회원의 감상 기록 삭제를 요청하실 때는 본인 확인을 위해 브라우저 식별자 확인을 요청드릴 수 있습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>6. 쿠키(Cookie) 및 로컬 스토리지(Local Storage) 운용</h2>
                <p>
                  1. 서비스는 로그인 세션 유지, 게스트 모드 플레이리스트 보관, 사용자 UI 설정(볼륨, 셔플, 반복 재생 등) 저장, 감상·검색 기록 구분을 위한 브라우저 식별자 저장을 위해 브라우저의 <span>Local Storage</span>를 운용합니다.<br />
                  2. 이용자는 웹 브라우저의 옵션 설정을 통해 로컬 데이터의 저장을 거부하거나 기존 데이터를 언제든지 일괄 삭제할 수 있습니다. 다만, 로컬 스토리지를 비활성화할 경우 게스트 모드 보관함과 맞춤 추천 이용이 제한될 수 있습니다.
                </p>
              </section>

              <section className="legal-section">
                <h2>7. 개인정보의 안전성 확보 조치</h2>
                <p>서비스는 이용자의 개인정보를 안전하게 보호하기 위해 다음과 같은 기술적·관리적 보호 조치를 취하고 있습니다:</p>
                <ul>
                  <li><span>비밀번호 암호화</span>: 회원 비밀번호는 단방향 솔트 암호화 해시 알고리즘으로 저장되어 관리자도 원문을 알 수 없습니다.</li>
                  <li><span>전송 구간 암호화</span>: 모든 네트워크 통신은 HTTPS(SSL/TLS) 보안 프로토콜을 통해 안전하게 암호화되어 전송됩니다.</li>
                  <li><span>데이터 접근 격리</span>: 데이터베이스 RLS(Row Level Security) 정책을 적용하여 본인 계정의 데이터에만 접근할 수 있도록 제어합니다. 감상·추천 기록은 서비스 서버만 기록할 수 있으며, 이용자는 본인 기록만 조회할 수 있습니다.</li>
                </ul>
              </section>

              <section className="legal-section">
                <h2>8. 개인정보 보호책임자 및 문의처</h2>
                <p>개인정보 처리와 관련된 문의, 열람 청구, 불만 처리 및 의견 수렴은 아래 공식 창구로 접수해 주시기 바랍니다.</p>
                <p className="legal-contact-box">
                  <span>개인정보 문의 창구:</span>{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="legal-link">
                    {CONTACT_EMAIL}
                  </a>
                </p>
              </section>

              <section className="legal-section">
                <h2>9. 개인정보 처리방침의 변경</h2>
                <ul>
                  <li><span>v2.2.0 (2026년 11월 20일)</span>: 감상 기록·추천 이용 기록·검색 기록 수집 및 보관 기간(2년) 추가, 개인화 추천 목적 추가, 처리 위탁 사업자(Render, Vercel, Gmail) 및 국외 이전 내용 추가</li>
                  <li><span>v2.1.0 (2026년 8월 19일)</span>: 이전 버전</li>
                </ul>
              </section>

            </article>
          )}
        </div>
      </main>
    </div>
  );
}

