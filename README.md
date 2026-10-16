# 💸 AWS 얼마야?

AWS가 어렵고 복잡한 사람을 위한 **초보자용 AWS 비용 계산기**입니다.
"하고 싶은 것"을 고르면 필요한 AWS 구성과 **예상 월 비용**을 쉽게 비교해주고, 쓸 서비스를 이미 안다면 직접 담아서 계산할 수도 있어요.
AWS 계정 연동이나 API 키 없이 누구나 무료로 쓸 수 있습니다.

👉 **https://dlwldp.github.io/Awscal/**

## 기능

**구성 추천** — 목적을 고르면 구성 2~3가지를 비교
- 템플릿 4종: 정적 웹사이트 / 백엔드 웹앱 / 서버리스 API / 개발용 단일 서버
- 규모 프리셋 3종(개인용 · 소규모 · 중규모), 리전 2곳(서울 · 버지니아 북부)
- 항목별 금액과 "이 비용은 왜 나오나요?" 설명, 다른 리전이었을 때 금액
- 숨은 비용 경고 (퍼블릭 IPv4, NAT Gateway, 데이터 전송, 상시 실행, Multi-AZ 등)
- **값 직접 바꿔보기**: 서버 사양·대수·트래픽 등을 바꾸면 바로 다시 계산
- 마음에 드는 구성을 **직접 계산기로 가져가서** 더 자세히 조정

**직접 계산** — 서비스를 담아서 내 구성 합계를 계산
- 15종: EC2, EBS, 퍼블릭 IPv4, Lightsail, RDS, DynamoDB, S3, CloudFront, Amplify, Lambda, API Gateway, ECS Fargate, ALB, NAT Gateway, 데이터 전송
- 사용 시간(예: 평일 낮에만 켜두기), Multi-AZ 같은 옵션 지원
- 담은 목록은 이 브라우저에 저장

USD와 원화(고정 환율)를 같이 보여줍니다.

## 실행

빌드 과정이 없는 순수 HTML/CSS/JS입니다. JSON을 `fetch`로 읽기 때문에 로컬 웹 서버로 열어야 합니다.

```bash
npm start            # = python3 -m http.server 8000
# http://localhost:8000 접속
```

## 테스트

외부 패키지 없이 Node 내장 테스트 러너를 씁니다 (Node 22+).

```bash
npm test
```

## 구조

```
index.html                  화면 뼈대
css/styles.css              스타일 (토스 스타일: 흰 카드, 큰 숫자, 파란 포인트)
js/engine.js                계산 엔진 (DOM 없음, 테스트 대상)
js/schema.js                입력 칸 정의, 직접 계산기 서비스 목록
js/app.js                   구성 추천 화면 + 라우팅
js/calculator.js            직접 계산 화면
js/ui.js                    공통 HTML 조각
data/prices.json            가격 데이터 (자동 생성 — 직접 수정하지 마세요)
data/templates.json         템플릿 · 구성안 · 프리셋 정의
data/settings.json          환율, 기본 리전
scripts/fetch_prices.py     가격 수집 스크립트
scripts/validation-report.js  공식 계산기 교차 검증 체크리스트 생성
docs/validation.md          교차 검증 체크리스트
tests/                      단위 테스트
```

## 계산 방식

- 한 달 = **730시간**, 온디맨드 요금 기준 (직접 계산에서 사용 시간을 바꿀 수 있음)
- 시간 과금: `시간당 단가 × 사용 시간 × 수량` / 사용량 과금: `단위 단가 × 사용량`
- 계층 요금(S3, 데이터 전송 등)은 **0원이 아닌 첫 구간 단가**만 적용 (프리티어 구간 제외). 첫 구간을 넘으면 화면에 알려줌
- Lightsail은 번들 월 정액 (시간당 단가 × 744시간, 센트 단위 올림). 번들 전송 허용량 초과분은 계산하지 않음
- 프리티어 · 크레딧 · 약정 할인은 반영하지 않음

## 가격 데이터

[AWS Price List Bulk API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-ppslong.html)의 공개 CSV를 스트리밍으로 읽어 필요한 SKU만 뽑습니다. 인증이 필요 없고 표준 라이브러리만 씁니다.

```bash
python3 scripts/fetch_prices.py   # data/prices.json 갱신 (약 30초)
```

추출할 항목은 스크립트의 `spec()` 화이트리스트에 있습니다. 직접 계산기에서 고를 수 있는 인스턴스도 이 목록(`EC2_INSTANCES`, `RDS_INSTANCES`, `LIGHTSAIL_BUNDLES`)에서 나옵니다. 하나라도 찾지 못하거나 첫 구간 단가가 애매하면 실패하고, 기존 `prices.json`은 그대로 남습니다.

GitHub Actions(`update-prices.yml`)가 **매주 월요일 09:00(KST)** 에 이 스크립트를 실행해 변경분을 커밋하고 다시 배포합니다.

## 템플릿 추가하기

계산 로직을 고치지 않고 `data/templates.json`만 수정하면 됩니다. 리소스 값에 `"{{preset.이름}}"`을 쓰면 프리셋 값으로 바뀌고, `count`가 0인 리소스는 결과에서 빠집니다.

```json
{ "type": "ec2", "instance": "{{preset.instance}}", "count": "{{preset.count}}" }
```

프리셋 값 이름이 `js/schema.js`의 `FIELDS`에 있으면 "값 직접 바꿔보기"에 입력 칸으로 나옵니다 (테스트가 빠진 정의를 잡아줍니다).

## 공식 계산기 교차 검증

```bash
npm run validation   # docs/validation.md 다시 만들기
```

[docs/validation.md](docs/validation.md)에 모든 템플릿 × 프리셋 × 리전 × 구성안(48개)의 우리 계산값과 calculator.aws에 넣을 입력값이 있습니다. 공식 계산기 금액을 `docs/validation-results.json`에 적고 다시 생성하면 차이(%)와 ±10% 통과 여부가 채워집니다.

## 배포

`main`에 푸시하면 `deploy.yml`이 테스트 후 **GitHub Pages**에 배포합니다. 정적 파일만 있어서 서버, API 키, 운영비가 필요 없습니다.

## 면책

이 서비스의 금액은 공개 가격표로 계산한 예상치이며 실제 청구액과 다를 수 있습니다. 정확한 견적은 [AWS Pricing Calculator](https://calculator.aws/)에서 확인하세요.
