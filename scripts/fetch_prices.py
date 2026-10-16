#!/usr/bin/env python3
"""AWS Price List Bulk API에서 MVP에 필요한 단가만 뽑아 data/prices.json을 만든다.

- 인증 없이 접근 가능한 공개 CSV를 스트리밍으로 읽는다 (EC2 원본은 수백 MB라 메모리에 올리지 않음).
- 화이트리스트(SPEC)에 있는 항목만 추출한다.
- 계층 요금은 '0보다 큰 첫 구간' 단가만 쓴다 (프리티어 구간은 반영하지 않음).
- 하나라도 못 찾거나 값이 애매하면 실패한다 → 기존 prices.json이 그대로 유지된다.

사용법: python3 scripts/fetch_prices.py [출력경로]
외부 패키지 없이 표준 라이브러리만 사용한다.
"""
import csv
import datetime
import io
import json
import math
import sys
import urllib.request
from pathlib import Path

BASE = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws"
HOURS_LIGHTSAIL_MONTH = 744  # Lightsail 번들 월 요금 = 시간당 요금 x 744 (31일)

REGIONS = {
    # 리전 코드: CloudFront 엣지 요금 지역 (해당 리전 사용자가 주로 접속하는 엣지 기준)
    # usagePrefix: usageType 앞에 붙는 리전 접두사 (us-east-1은 접두사가 없는 경우도 있음)
    "ap-northeast-2": {"name": "서울", "cloudfrontPrefix": "AP", "usagePrefix": "APN2"},
    "us-east-1": {"name": "버지니아 북부", "cloudfrontPrefix": "US", "usagePrefix": "USE1"},
}

# 직접 계산기에서 고를 수 있는 목록이기도 하다. 늘리면 화면 선택지도 자동으로 늘어난다.
EC2_INSTANCES = ["t4g.nano", "t4g.micro", "t4g.small", "t4g.medium", "t4g.large", "t4g.xlarge",
                 "t3.micro", "t3.small", "t3.medium", "t3.large"]
RDS_INSTANCES = ["db.t4g.micro", "db.t4g.small", "db.t4g.medium", "db.t4g.large", "db.t3.micro"]
LIGHTSAIL_BUNDLES = ["0.5GB", "1GB", "2GB", "4GB", "8GB"]

LINUX_EC2 = {"operation": "RunInstances", "CapacityStatus": "Used", "Pre Installed S/W": "NA", "Tenancy": "Shared"}
MYSQL_SINGLE = {"Database Engine": "MySQL", "Deployment Option": "Single-AZ"}
MYSQL_MULTI = {"Database Engine": "MySQL", "Deployment Option": "Multi-AZ"}


def spec(cf):
    """(출력 경로, 오퍼 코드, usageType, 추가 필터) 목록. cf = CloudFront 엣지 접두사."""
    s = []
    for it in EC2_INSTANCES:
        s.append((f"ec2.{it}.hourly", "AmazonEC2", f"BoxUsage:{it}", LINUX_EC2))
    s += [
        ("ebs.gp3.perGbMonth", "AmazonEC2", "EBS:VolumeUsage.gp3", {}),
        ("alb.hourly", "AmazonEC2", "LoadBalancerUsage", {"operation": "LoadBalancing:Application"}),
        ("alb.lcuHourly", "AmazonEC2", "LCUUsage", {"operation": "LoadBalancing:Application"}),
        ("natGateway.hourly", "AmazonEC2", "NatGateway-Hours", {}),
        ("natGateway.perGb", "AmazonEC2", "NatGateway-Bytes", {}),
        ("publicIpv4.hourly", "AmazonVPC", "PublicIPv4:InUseAddress", {}),
        ("dataTransferOut.perGb", "AWSDataTransfer", "DataTransfer-Out-Bytes", {"Transfer Type": "AWS Outbound"}),
    ]
    for it in RDS_INSTANCES:
        s.append((f"rds.{it}.hourly", "AmazonRDS", f"InstanceUsage:{it}", MYSQL_SINGLE))
        s.append((f"rds.{it}.multiAzHourly", "AmazonRDS", f"Multi-AZUsage:{it}", MYSQL_MULTI))
        s.append((f"rds.{it}.storagePerGbMonth", "AmazonRDS", "RDS:GP3-Storage", MYSQL_SINGLE))
    for b in LIGHTSAIL_BUNDLES:
        s.append((f"lightsail.{b}.hourly", "AmazonLightsail", f"BundleUsage:{b}", {}))
    s += [
        ("s3.storagePerGbMonth", "AmazonS3", "TimedStorage-ByteHrs", {}),
        ("s3.putPerRequest", "AmazonS3", "Requests-Tier1", {}),
        ("s3.getPerRequest", "AmazonS3", "Requests-Tier2", {}),
        ("cloudfront.perGb", "AmazonCloudFront", f"={cf}-DataTransfer-Out-Bytes", {}),
        ("cloudfront.httpsPerRequest", "AmazonCloudFront", f"={cf}-Requests-Tier2-HTTPS", {}),
        ("amplify.buildPerMinute", "AWSAmplify", "BuildDuration", {}),
        ("amplify.storagePerGbMonth", "AWSAmplify", "DataStorage", {}),
        ("amplify.servedPerGb", "AWSAmplify", "DataTransferOut", {}),
        ("lambda.perRequest", "AWSLambda", "Request", {}),
        ("lambda.perGbSecondArm", "AWSLambda", "Lambda-GB-Second-ARM", {}),
        ("apiGatewayHttp.perRequest", "AmazonApiGateway", "ApiGatewayHttpRequest", {}),
        ("dynamodb.perReadUnit", "AmazonDynamoDB", "ReadRequestUnits", {}),
        ("dynamodb.perWriteUnit", "AmazonDynamoDB", "WriteRequestUnits", {}),
        ("dynamodb.storagePerGbMonth", "AmazonDynamoDB", "TimedStorage-ByteHrs", {}),
        ("fargate.perVcpuHour", "AmazonECS", "Fargate-vCPU-Hours:perCPU", {}),
        ("fargate.perGbHour", "AmazonECS", "Fargate-GB-Hours", {}),
    ]
    return s


def usage_matches(actual, wanted, region_prefix):
    """'APN2-Request'와 'Request'처럼 리전 접두사 유무만 다른 경우를 같은 것으로 본다.
    '='로 시작하면 정확히 일치해야 한다 (CloudFront 엣지 요금 등)."""
    if wanted.startswith("="):
        return actual == wanted[1:]
    return actual in (wanted, f"{region_prefix}-{wanted}")


def stream_csv(url):
    print(f"  GET {url}", file=sys.stderr)
    resp = urllib.request.urlopen(url, timeout=600)
    text = io.TextIOWrapper(resp, encoding="utf-8", newline="")
    for _ in range(5):  # 메타데이터 줄(FormatVersion, Disclaimer, ...) 건너뛰기
        text.readline()
    yield from csv.DictReader(text)


def offer_url(offer, region):
    if offer == "AmazonCloudFront":  # CloudFront는 글로벌 파일에 엣지 지역별 요금이 있음
        return f"{BASE}/{offer}/current/index.csv"
    return f"{BASE}/{offer}/current/{region}/index.csv"


def collect(region, region_prefix, items):
    """오퍼별로 CSV를 한 번씩만 읽으며 모든 항목의 후보 행을 모은다."""
    by_offer = {}
    for item in items:
        by_offer.setdefault(item[1], []).append(item)
    found = {item[0]: [] for item in items}
    for offer, offer_items in by_offer.items():
        for row in stream_csv(offer_url(offer, region)):
            if row.get("TermType") != "OnDemand" or row.get("Currency") != "USD":
                continue
            for path, _, usage, filters in offer_items:
                if usage_matches(row.get("usageType", ""), usage, region_prefix) and all(
                    row.get(k) == v for k, v in filters.items()
                ):
                    found[path].append(row)
    return found


def pick_price(path, rows):
    """0보다 큰 가격 중 가장 낮은 구간(첫 구간)의 (단가, 구간 끝). 구간 끝이 없으면 None.
    같은 구간에 값이 여러 개면 실패."""
    paid = [r for r in rows if float(r["PricePerUnit"]) > 0]
    if not paid:
        raise ValueError(f"{path}: 가격 행을 찾지 못함 ({len(rows)}개 후보)")
    first = min(float(r["StartingRange"] or 0) for r in paid)
    prices = {float(r["PricePerUnit"]) for r in paid if float(r["StartingRange"] or 0) == first}
    if len(prices) != 1:
        raise ValueError(f"{path}: 첫 구간 단가가 여러 개임 {sorted(prices)}")
    ends = {r["EndingRange"] for r in paid if float(r["StartingRange"] or 0) == first}
    end = None if ends & {"Inf", ""} else min(float(e) for e in ends)
    return prices.pop(), end


def split_path(path):
    """'ec2.t4g.micro.hourly' → ['ec2', 't4g.micro', 'hourly'] (인스턴스 이름에 점이 있어서
    첫 점과 마지막 점으로만 나눈다). 'alb.hourly' → ['alb', 'hourly']."""
    if path.count(".") < 2:
        return path.split(".")
    service, rest = path.split(".", 1)
    name, field = rest.rsplit(".", 1)
    return [service, name, field]


def set_path(obj, path, value):
    *parents, last = split_path(path)
    for key in parents:
        obj = obj.setdefault(key, {})
    obj[last] = value


def build():
    out = {
        "updatedAt": datetime.date.today().isoformat(),
        "source": "AWS Price List Bulk API (On-Demand, 첫 유료 구간 단가)",
        "currency": "USD",
        "regions": {},
    }
    for region, meta in REGIONS.items():
        print(f"[{region}]", file=sys.stderr)
        items = spec(meta["cloudfrontPrefix"])
        found = collect(region, meta["usagePrefix"], items)
        data = {"name": meta["name"]}
        for path, *_ in items:
            value, tier_end = pick_price(path, found[path])
            set_path(data, path, value)
            if tier_end is not None:  # 첫 구간 한도 (예: dataTransferOut.perGbUpTo = 10240GB)
                set_path(data, path + "UpTo", tier_end)
        for bundle in data["lightsail"].values():
            # 시간당 단가가 잘려서 공개되므로 센트 단위 올림 (0.0094 x 744 = 6.9936 → $7.00)
            bundle["monthly"] = math.ceil(bundle["hourly"] * HOURS_LIGHTSAIL_MONTH * 100) / 100
        out["regions"][region] = data
    return out


def main():
    target = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "data" / "prices.json")
    prices = build()
    target.write_text(json.dumps(prices, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {target}", file=sys.stderr)


if __name__ == "__main__":
    main()
