# AGENTS.md

순수 HTML / CSS / JS (ES 모듈, 빌드 없음, 외부 패키지 없음) + Python 가격 수집 스크립트 + GitHub Pages.
기존 코드 패턴을 먼저 보고 따른다 (예시: `js/hidden-costs.js` 계산 함수(DOM 없음, 테스트 대상)와 `js/app.js` 화면 코드의 분리,
`data/templates.json`의 `backend-webapp` 템플릿).

## 필수
- 작업 후 `npm test` 와 `python3 -m unittest discover -s tests -p "test_*.py"` 통과. CI도 같은 테스트가 통과해야만 배포한다.
- `main` 에 푸시하면 바로 운영 사이트(https://dlwldp.github.io/Awscal/)에 배포된다. 작업 브랜치 `claude/optimistic-ptolemy-lnc9au` 도 main과 같게 맞춘다.
- 요청 없이 수정 금지:

  | 대상 | 이유 |
  | --- | --- |
  | `data/prices.json`, `data/price-changes.json` | 매주 월요일 `update-prices.yml`이 AWS Price List API로 다시 만든다. 손으로 고치면 다음 갱신 때 덮이거나 변동 내역이 틀어진다. 단가를 추가하려면 `scripts/fetch_prices.py`의 `spec()`을 고친다 |
  | `.github/workflows/` | 테스트 → 배포 경로 전체. 잘못되면 테스트 없이 배포되거나 가격 갱신이 멈춘다 |
  | `data/settings.json`의 `analytics` | GoatCounter 코드(`jylee`, Awscal 전용). 바꾸면 방문 통계가 다른 사이트로 간다 |
  | `assets/icons/aws/` | AWS 공식 아이콘. 라이선스(`LICENSE.aws-icons`)상 모양을 바꾸지 않는다 |

## 제품 원칙
- 대상은 AWS 초보자다. 고급 옵션(예약 인스턴스, 세부 요금제 등)은 넣지 않는다 → 대신 "계산 기준 더 보기"나 공식 계산기 링크로 안내한다.
- 화면 문구는 쉬운 한국어. 금액은 부가세 포함 원화가 먼저, 달러는 보조.
- 정확하지 않은 값은 추측하지 않는다 → 계산에서 빼고 "포함 안 된 비용"에 적는다. 기간 한정 무료·신규 계정 크레딧은 정책이 자주 바뀌어서 넣지 않는다.
- 쿠키·회원가입·서버 코드 없음. 분석은 GoatCounter만 쓴다 (Cloudflare는 2026-11-18에 뺐다).

## 코드
- 계산은 DOM 없는 함수(`engine.js`, `hidden-costs.js`, `quiz.js`, `share.js`, `summary.js`)에 두고 테스트한다 → 화면 코드(`app.js`, `calculator.js`, `ui.js`)는 그 결과를 그리기만 한다.
- 아이콘은 `js/icons.js`의 `icon()`(Lucide)과 `glyph("aws:ec2")`(AWS 공식)만 쓴다. 이모지 아이콘 금지.
- 색·글자 크기는 `css/styles.css`의 토큰(`--brand`, `--accent`, `--fs-*`)만 쓴다. 다크 모드를 같이 확인한다.
- 화면을 바꾸면 휴대폰(375px)과 PC(1280px)에서 가로 넘침이 없는지 확인한다.

## 변경 시 함께 수정할 곳
| 변경 | 함께 수정 |
| --- | --- |
| 새 템플릿·프리셋 | `data/templates.json`, 맨 위 구성의 가이드 `data/build-guides.json`(테스트가 확인), `index.html` 푸터 링크(테스트가 확인) |
| 새 프리셋 값 이름 | `js/schema.js`의 `FIELDS` (없으면 테스트 실패) |
| 직접 계산기 새 서비스 | `js/schema.js`의 `SERVICES`, `js/engine.js`의 `CALCULATORS`, `scripts/fetch_prices.py`의 `spec()`, 필요하면 `data/glossary.json`·`data/hidden-costs.json` |
| 새 화면(`#/…`) | `js/app.js`의 `route()`, 검색용이면 `scripts/build-pages.js`(사이트맵 포함) |
| 새 분석 이벤트 | `trackEvent()` 호출, README "방문 분석"의 이벤트 목록 |
| 기능·숫자가 바뀜 | `README.md` (기능 목록, 구조, 숫자) |

## Git
- 커밋은 기능 단위. 작성자는 dlwldP 단독이다. `Co-Authored-By`나 모델 이름을 넣지 않는다.
- 이슈·PR은 만들기 전에 제목과 내용을 먼저 확인받는다.
- 바뀐 결정은 `docs/decisions.md`에 지우지 않고 "대체됨"으로 남긴다.
