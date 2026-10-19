# 공식 Pricing Calculator 교차 검증

> 자동 생성 문서 — `node scripts/validation-report.js > docs/validation.md`
> 가격 데이터 2026-10-19 기준

MVP 완료 조건: 모든 결과가 [AWS Pricing Calculator](https://calculator.aws/) 대비 **±10% 이내**.

**진행 상황: 48개 중 0개 확인, 0개 통과**

## 검증 방법

1. 아래 표에서 한 줄을 골라 [calculator.aws](https://calculator.aws/#/createCalculator)에서 같은 리전으로 '입력값'을 그대로 넣습니다.
2. 나온 월 합계(USD)를 `docs/validation-results.json`에 `"키": 금액` 형식으로 적습니다.
   ```json
   { "backend-webapp/personal/ap-northeast-2/ec2-rds": 34.6 }
   ```
3. `node scripts/validation-report.js > docs/validation.md`를 다시 돌리면 차이(%)와 통과 여부가 채워집니다.

## 자동으로 보장되는 것

- **구간 요금 단순화로 인한 오차 = 0**: 모든 프리셋 사용량이 첫 요금 구간 안에 있음을 테스트로 확인합니다 (`tests/engine.test.js`의 "첫 요금 구간 안에 있다").
- **단가**: 공식 계산기와 같은 원본(AWS Price List)에서 매주 다시 받습니다. 시간 기준도 공식 계산기와 같은 730시간입니다.

## 차이가 날 수 있는 이유 (알려진 것)

| 원인 | 영향 | 대응 |
|---|---|---|
| 공식 계산기가 일부 프리티어를 자동 적용 (예: DynamoDB 저장 25GB, Lambda 무료 요청) | 서버리스·소규모 구성에서 우리 값이 더 큼 | 공식 계산기의 프리티어 옵션을 끄고 비교. 끌 수 없으면 무료 금액을 더해서 비교 |
| 데이터 전송 월 100GB 무료 (리전 공통) | 공식 계산기에 따라 반영될 수 있음 | 이 서비스는 프리티어 미반영이 원칙 |
| Lightsail 월 정액 (744시간) | 공식 계산기도 월 정액으로 보여줌 | 차이 없음 |
| ALB LCU 환산 | LCU는 연결·처리량 중 큰 값 기준 | 처리 데이터만으로 LCU를 맞춰 입력 |

## 체크리스트


### 🌐 정적 웹사이트

| 키 | 우리 계산 | 공식 계산기 | 차이 | 결과 | 입력값 |
|---|---:|---:|---:|:---:|---|
| `static-website/personal/ap-northeast-2/s3-cloudfront` | $0.75 |  |  | ☐ | S3 Standard: 저장 1GB, PUT 1,000건, GET 10,000건<br>CloudFront: 전송 5GB, HTTPS 요청 100,000건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States) |
| `static-website/personal/ap-northeast-2/amplify` | $1.07 |  |  | ☐ | Amplify: 빌드 30분, 저장 1GB, 전송 5GB |
| `static-website/personal/us-east-1/s3-cloudfront` | $0.56 |  |  | ☐ | S3 Standard: 저장 1GB, PUT 1,000건, GET 10,000건<br>CloudFront: 전송 5GB, HTTPS 요청 100,000건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States) |
| `static-website/personal/us-east-1/amplify` | $1.07 |  |  | ☐ | Amplify: 빌드 30분, 저장 1GB, 전송 5GB |
| `static-website/small/ap-northeast-2/s3-cloudfront` | $4.89 |  |  | ☐ | S3 Standard: 저장 2GB, PUT 2,000건, GET 100,000건<br>CloudFront: 전송 30GB, HTTPS 요청 1,000,000건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States) |
| `static-website/small/ap-northeast-2/amplify` | $5.15 |  |  | ☐ | Amplify: 빌드 60분, 저장 2GB, 전송 30GB |
| `static-website/small/us-east-1/s3-cloudfront` | $3.65 |  |  | ☐ | S3 Standard: 저장 2GB, PUT 2,000건, GET 100,000건<br>CloudFront: 전송 30GB, HTTPS 요청 1,000,000건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States) |
| `static-website/small/us-east-1/amplify` | $5.15 |  |  | ☐ | Amplify: 빌드 60분, 저장 2GB, 전송 30GB |
| `static-website/medium/ap-northeast-2/s3-cloudfront` | $36.50 |  |  | ☐ | S3 Standard: 저장 5GB, PUT 5,000건, GET 1,000,000건<br>CloudFront: 전송 200GB, HTTPS 요청 10,000,000건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States) |
| `static-website/medium/ap-northeast-2/amplify` | $31.62 |  |  | ☐ | Amplify: 빌드 150분, 저장 5GB, 전송 200GB |
| `static-website/medium/us-east-1/s3-cloudfront` | $27.54 |  |  | ☐ | S3 Standard: 저장 5GB, PUT 5,000건, GET 1,000,000건<br>CloudFront: 전송 200GB, HTTPS 요청 10,000,000건 (리전에 맞는 지역: 서울→Asia Pacific, 버지니아→United States) |
| `static-website/medium/us-east-1/amplify` | $31.62 |  |  | ☐ | Amplify: 빌드 150분, 저장 5GB, 전송 200GB |

### ☕ 백엔드 웹앱

| 키 | 우리 계산 | 공식 계산기 | 차이 | 결과 | 입력값 |
|---|---:|---:|---:|:---:|---|
| `backend-webapp/personal/ap-northeast-2/ec2-rds` | $34.57 |  |  | ☐ | EC2: t4g.micro, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 5GB (같은 리전) |
| `backend-webapp/personal/ap-northeast-2/lightsail` | $7.00 |  |  | ☐ | Lightsail: Linux 1GB 번들 × 1 |
| `backend-webapp/personal/ap-northeast-2/fargate-rds` | $35.51 |  |  | ☐ | ECS Fargate: Linux/x86, 태스크 1개, 0.25vCPU, 0.5GB, 하루 24시간<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 5GB (같은 리전) |
| `backend-webapp/personal/us-east-1/ec2-rds` | $25.81 |  |  | ☐ | EC2: t4g.micro, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 5GB (같은 리전) |
| `backend-webapp/personal/us-east-1/lightsail` | $7.00 |  |  | ☐ | Lightsail: Linux 1GB 번들 × 1 |
| `backend-webapp/personal/us-east-1/fargate-rds` | $27.09 |  |  | ☐ | ECS Fargate: Linux/x86, 태스크 1개, 0.25vCPU, 0.5GB, 하루 24시간<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 5GB (같은 리전) |
| `backend-webapp/small/ap-northeast-2/ec2-rds` | $45.31 |  |  | ☐ | EC2: t4g.small, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 30GB (같은 리전) |
| `backend-webapp/small/ap-northeast-2/lightsail` | $12.00 |  |  | ☐ | Lightsail: Linux 2GB 번들 × 1 |
| `backend-webapp/small/ap-northeast-2/fargate-rds` | $49.02 |  |  | ☐ | ECS Fargate: Linux/x86, 태스크 1개, 0.5vCPU, 1GB, 하루 24시간<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 30GB (같은 리전) |
| `backend-webapp/small/us-east-1/ec2-rds` | $34.19 |  |  | ☐ | EC2: t4g.small, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 30GB (같은 리전) |
| `backend-webapp/small/us-east-1/lightsail` | $12.00 |  |  | ☐ | Lightsail: Linux 2GB 번들 × 1 |
| `backend-webapp/small/us-east-1/fargate-rds` | $38.35 |  |  | ☐ | ECS Fargate: Linux/x86, 태스크 1개, 0.5vCPU, 1GB, 하루 24시간<br>VPC → Public IPv4 Address: In-use 1개<br>RDS for MySQL: db.t4g.micro, Single-AZ, On-Demand, gp3 20GB<br>Data Transfer: 인터넷으로 아웃바운드 30GB (같은 리전) |
| `backend-webapp/medium/ap-northeast-2/ec2-rds` | $136.94 |  |  | ☐ | EC2: t4g.small, Linux, On-Demand, 2대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 2개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 2개<br>Elastic Load Balancing → ALB 1개 (LCU가 0.5이 되도록 처리량 입력, 예: 처리 데이터 월 365GB)<br>VPC → Public IPv4 Address: In-use 2개<br>RDS for MySQL: db.t4g.small, Single-AZ, On-Demand, gp3 50GB<br>Data Transfer: 인터넷으로 아웃바운드 200GB (같은 리전) |
| `backend-webapp/medium/ap-northeast-2/lightsail` | $24.00 |  |  | ☐ | Lightsail: Linux 4GB 번들 × 1 |
| `backend-webapp/medium/ap-northeast-2/fargate-rds` | $144.37 |  |  | ☐ | ECS Fargate: Linux/x86, 태스크 2개, 0.5vCPU, 1GB, 하루 24시간<br>VPC → Public IPv4 Address: In-use 2개<br>Elastic Load Balancing → ALB 1개 (LCU가 0.5이 되도록 처리량 입력, 예: 처리 데이터 월 365GB)<br>VPC → Public IPv4 Address: In-use 2개<br>RDS for MySQL: db.t4g.small, Single-AZ, On-Demand, gp3 50GB<br>Data Transfer: 인터넷으로 아웃바운드 200GB (같은 리전) |
| `backend-webapp/medium/us-east-1/ec2-rds` | $108.78 |  |  | ☐ | EC2: t4g.small, Linux, On-Demand, 2대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 2개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 2개<br>Elastic Load Balancing → ALB 1개 (LCU가 0.5이 되도록 처리량 입력, 예: 처리 데이터 월 365GB)<br>VPC → Public IPv4 Address: In-use 2개<br>RDS for MySQL: db.t4g.small, Single-AZ, On-Demand, gp3 50GB<br>Data Transfer: 인터넷으로 아웃바운드 200GB (같은 리전) |
| `backend-webapp/medium/us-east-1/lightsail` | $24.00 |  |  | ☐ | Lightsail: Linux 4GB 번들 × 1 |
| `backend-webapp/medium/us-east-1/fargate-rds` | $117.10 |  |  | ☐ | ECS Fargate: Linux/x86, 태스크 2개, 0.5vCPU, 1GB, 하루 24시간<br>VPC → Public IPv4 Address: In-use 2개<br>Elastic Load Balancing → ALB 1개 (LCU가 0.5이 되도록 처리량 입력, 예: 처리 데이터 월 365GB)<br>VPC → Public IPv4 Address: In-use 2개<br>RDS for MySQL: db.t4g.small, Single-AZ, On-Demand, gp3 50GB<br>Data Transfer: 인터넷으로 아웃바운드 200GB (같은 리전) |

### ⚡ 서버리스 API

| 키 | 우리 계산 | 공식 계산기 | 차이 | 결과 | 입력값 |
|---|---:|---:|---:|:---:|---|
| `serverless-api/personal/ap-northeast-2/apigw-lambda-dynamodb` | $0.60 |  |  | ☐ | API Gateway HTTP API: 요청 100,000건<br>Lambda: Arm, 요청 100,000건, 실행 100ms, 메모리 256MB, 임시 스토리지 512MB, 프리티어 미포함<br>DynamoDB On-Demand: 쓰기 20,000건, 읽기 100,000건(Strongly consistent), 저장 1GB<br>Data Transfer: 인터넷으로 아웃바운드 1GB (같은 리전) |
| `serverless-api/personal/us-east-1/apigw-lambda-dynamodb` | $0.52 |  |  | ☐ | API Gateway HTTP API: 요청 100,000건<br>Lambda: Arm, 요청 100,000건, 실행 100ms, 메모리 256MB, 임시 스토리지 512MB, 프리티어 미포함<br>DynamoDB On-Demand: 쓰기 20,000건, 읽기 100,000건(Strongly consistent), 저장 1GB<br>Data Transfer: 인터넷으로 아웃바운드 1GB (같은 리전) |
| `serverless-api/small/ap-northeast-2/apigw-lambda-dynamodb` | $3.57 |  |  | ☐ | API Gateway HTTP API: 요청 1,000,000건<br>Lambda: Arm, 요청 1,000,000건, 실행 100ms, 메모리 256MB, 임시 스토리지 512MB, 프리티어 미포함<br>DynamoDB On-Demand: 쓰기 200,000건, 읽기 1,000,000건(Strongly consistent), 저장 1GB<br>Data Transfer: 인터넷으로 아웃바운드 10GB (같은 리전) |
| `serverless-api/small/us-east-1/apigw-lambda-dynamodb` | $2.93 |  |  | ☐ | API Gateway HTTP API: 요청 1,000,000건<br>Lambda: Arm, 요청 1,000,000건, 실행 100ms, 메모리 256MB, 임시 스토리지 512MB, 프리티어 미포함<br>DynamoDB On-Demand: 쓰기 200,000건, 읽기 1,000,000건(Strongly consistent), 저장 1GB<br>Data Transfer: 인터넷으로 아웃바운드 10GB (같은 리전) |
| `serverless-api/medium/ap-northeast-2/apigw-lambda-dynamodb` | $34.30 |  |  | ☐ | API Gateway HTTP API: 요청 10,000,000건<br>Lambda: Arm, 요청 10,000,000건, 실행 100ms, 메모리 256MB, 임시 스토리지 512MB, 프리티어 미포함<br>DynamoDB On-Demand: 쓰기 2,000,000건, 읽기 10,000,000건(Strongly consistent), 저장 5GB<br>Data Transfer: 인터넷으로 아웃바운드 100GB (같은 리전) |
| `serverless-api/medium/us-east-1/apigw-lambda-dynamodb` | $28.08 |  |  | ☐ | API Gateway HTTP API: 요청 10,000,000건<br>Lambda: Arm, 요청 10,000,000건, 실행 100ms, 메모리 256MB, 임시 스토리지 512MB, 프리티어 미포함<br>DynamoDB On-Demand: 쓰기 2,000,000건, 읽기 10,000,000건(Strongly consistent), 저장 5GB<br>Data Transfer: 인터넷으로 아웃바운드 100GB (같은 리전) |

### 🛠️ 개발용 단일 서버

| 키 | 우리 계산 | 공식 계산기 | 차이 | 결과 | 입력값 |
|---|---:|---:|---:|:---:|---|
| `dev-server/personal/ap-northeast-2/ec2` | $13.70 |  |  | ☐ | EC2: t4g.micro, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>Data Transfer: 인터넷으로 아웃바운드 5GB (같은 리전) |
| `dev-server/personal/ap-northeast-2/lightsail` | $7.00 |  |  | ☐ | Lightsail: Linux 1GB 번들 × 1 |
| `dev-server/personal/us-east-1/ec2` | $11.83 |  |  | ☐ | EC2: t4g.micro, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 20GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>Data Transfer: 인터넷으로 아웃바운드 5GB (같은 리전) |
| `dev-server/personal/us-east-1/lightsail` | $7.00 |  |  | ☐ | Lightsail: Linux 1GB 번들 × 1 |
| `dev-server/small/ap-northeast-2/ec2` | $22.83 |  |  | ☐ | EC2: t4g.small, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 30GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>Data Transfer: 인터넷으로 아웃바운드 10GB (같은 리전) |
| `dev-server/small/ap-northeast-2/lightsail` | $12.00 |  |  | ☐ | Lightsail: Linux 2GB 번들 × 1 |
| `dev-server/small/us-east-1/ec2` | $19.21 |  |  | ☐ | EC2: t4g.small, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 30GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>Data Transfer: 인터넷으로 아웃바운드 10GB (같은 리전) |
| `dev-server/small/us-east-1/lightsail` | $12.00 |  |  | ☐ | Lightsail: Linux 2GB 번들 × 1 |
| `dev-server/medium/ap-northeast-2/ec2` | $42.36 |  |  | ☐ | EC2: t4g.medium, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 50GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>Data Transfer: 인터넷으로 아웃바운드 30GB (같은 리전) |
| `dev-server/medium/ap-northeast-2/lightsail` | $24.00 |  |  | ☐ | Lightsail: Linux 4GB 번들 × 1 |
| `dev-server/medium/us-east-1/ec2` | $34.88 |  |  | ☐ | EC2: t4g.medium, Linux, On-Demand, 1대 (EBS는 0GB로 두고 아래 EBS 줄로 따로)<br>EBS: gp3 50GB × 1개 (IOPS 3000, 처리량 125MB/s 기본값)<br>VPC → Public IPv4 Address: In-use 1개<br>Data Transfer: 인터넷으로 아웃바운드 30GB (같은 리전) |
| `dev-server/medium/us-east-1/lightsail` | $24.00 |  |  | ☐ | Lightsail: Linux 4GB 번들 × 1 |
