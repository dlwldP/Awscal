# 💸 AWS 얼마야?

"하고 싶은 것"을 고르면 필요한 AWS 구성과 **예상 월 비용**을 초보자 눈높이로 비교해주는 웹 서비스입니다. AWS 계정 연동 없이 사용할 수 있어요.

- 목적별 템플릿 4종: 정적 웹사이트 / 백엔드 웹앱 / 서버리스 API / 개발용 단일 서버
- 규모 프리셋 3종(개인용 · 소규모 · 중규모)과 리전 2곳(서울 · 버지니아 북부)
- 같은 목적의 구성안 2~3개를 나란히 비교, 항목별 금액과 "이 비용은 왜 나오나요?" 설명
- 숨은 비용 경고 (퍼블릭 IPv4, NAT Gateway, 데이터 전송, 상시 실행, Multi-AZ 등)
- USD + 원화(고정 환율) 표시

## 실행

빌드 과정이 없는 순수 HTML/CSS/JS입니다. 브라우저 보안 정책상 JSON을 `fetch`로 읽기 때문에 로컬 웹 서버로 열어야 합니다.

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
index.html              화면 뼈대
css/styles.css          스타일
js/engine.js            계산 엔진 (DOM 없음, 테스트 대상)
js/app.js               화면 렌더링 + 라우팅 (#/t/<템플릿>/<프리셋>/<리전>)
data/prices.json        가격 데이터 (자동 생성 — 직접 수정하지 마세요)
data/templates.json     템플릿 · 구성안 · 프리셋 정의
data/settings.json      환율, 기본 리전
scripts/fetch_prices.py 가격 수집 스크립트
tests/engine.test.js    계산 엔진 단위 테스트
```

## 계산 방식

- 한 달 = **730시간**, 온디맨드 요금 기준
- 시간 과금: `시간당 단가 × 730 × 수량` / 사용량 과금: `단위 단가 × 프리셋 사용량`
- 계층 요금(S3, 데이터 전송 등)은 **0원이 아닌 첫 구간 단가**만 적용 (프리티어 구간 제외)
- Lightsail은 번들 월 정액 (시간당 단가 × 744시간, 센트 단위 올림)
- 프리티어 · 크레딧 · 약정 할인은 반영하지 않음

## 가격 데이터

[AWS Price List Bulk API](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/using-ppslong.html)의 공개 CSV를 스트리밍으로 읽어 필요한 SKU만 뽑습니다. 표준 라이브러리만 쓰므로 설치할 것이 없습니다.

```bash
python3 scripts/fetch_prices.py   # data/prices.json 갱신 (약 30초)
```

추출할 항목은 스크립트의 `spec()` 화이트리스트에 있습니다. 하나라도 찾지 못하거나 첫 구간 단가가 여러 개로 애매하면 실패하고, 기존 `prices.json`은 그대로 남습니다.

GitHub Actions(`update-prices.yml`)가 **매주 월요일 09:00(KST)** 에 이 스크립트를 실행해 변경분을 커밋하고 다시 배포합니다.

## 템플릿 추가하기

계산 로직을 고치지 않고 `data/templates.json`만 수정하면 됩니다. 리소스 값에 `"{{preset.이름}}"`을 쓰면 프리셋 값으로 바뀝니다. `count`가 0인 리소스는 결과에서 빠집니다.

```json
{ "type": "ec2", "instance": "{{preset.instance}}", "count": "{{preset.count}}" }
```

지원 리소스 타입: `ec2`, `ebs`, `publicIpv4`, `alb`, `rds`, `dataTransferOut`, `lightsail`, `s3`, `cloudfront`, `amplify`, `lambda`, `apiGatewayHttp`, `dynamodb`, `fargate`

새 인스턴스 타입이 필요하면 `scripts/fetch_prices.py`의 목록(`EC2_INSTANCES` 등)에 추가하고 스크립트를 다시 실행하세요.

## 배포

`main`에 푸시하면 `deploy.yml`이 테스트 후 **GitHub Pages**에 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔야 합니다.

## 면책

이 서비스의 금액은 공개 가격표로 계산한 예상치이며 실제 청구액과 다를 수 있습니다. 정확한 견적은 [AWS Pricing Calculator](https://calculator.aws/)에서 확인하세요.
