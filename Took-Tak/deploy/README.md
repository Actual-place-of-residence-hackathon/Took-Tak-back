# deploy/ — 배포 산출물

전체 절차는 [`../docs/AWS_DEPLOY.md`](../docs/AWS_DEPLOY.md) 를 보세요. 여기는 파일별 설명입니다.

| 파일 | 올릴 곳 | 용도 |
|---|---|---|
| `setup-db-ec2.sh` | DB EC2 (private) | PostgreSQL 설치 · 계정/DB 생성 · 백엔드 서브넷만 접속 허용 |
| `setup-backend-ec2.sh` | 백엔드 EC2 (private) | Node.js 설치 · 서비스 계정 · `/etc/tooktak/backend.env` 뼈대 |
| `tooktak-backend.service` | 백엔드 EC2 `/etc/systemd/system/` | systemd 유닛 |
| `release.sh` | 백엔드 EC2 | 재배포 (`npm ci` → 재시작 → 헬스체크) |
| `nginx-frontend.conf` | 프론트 EC2 `/etc/nginx/conf.d/` | 정적 파일 + `/api/*` 프록시 |
| `iam-bedrock-policy.json` | IAM 콘솔 | 백엔드 EC2 역할에 붙일 Bedrock 권한 |

## nginx-frontend.conf 가 왜 필요한가

백엔드가 private subnet 이라 공인 IP 가 없습니다. SPA 에서 API 를 실제로 호출하는 주체는
프론트 EC2 가 아니라 **사용자 브라우저**이고, 브라우저는 인터넷에 있으므로 `10.0.x.x` 에
닿지 못합니다. **프론트 코드에 백엔드 사설 IP 를 박으면 100% 실패합니다.**

같은 VPC 안의 프론트 EC2 nginx 가 대신 받아 넘깁니다:
`브라우저 → 프론트 EC2(공인) → 백엔드 EC2(사설)`

프론트엔드는 API 주소를 상대경로 `/api` 로 두세요. 오리진이 같아져 CORS 도 안 생깁니다.

수정할 곳: `upstream tooktak_backend` 의 `server 10.0.2.10:4000;` → 실제 백엔드 사설 IP

## iam-bedrock-policy.json 에 대해

### 확인된 사실 (2026-07-23 실측)

`@anthropic-ai/bedrock-sdk` 의 `AnthropicBedrockMantle` 은 SigV4 **서비스명 `bedrock-mantle`**
로 서명하고 `https://bedrock-mantle.{region}.api.aws/anthropic` 을 호출합니다.
기존 `bedrock` 이 아닙니다.
(근거: `node_modules/@anthropic-ai/bedrock-sdk/mantle-client.js` 의 `DEFAULT_SERVICE_NAME`)

### 확인하지 못한 것

**`bedrock-mantle` 의 정확한 IAM 액션명은 검증하지 못했습니다.**
검증에 쓴 로컬 자격증명이 권한이 넓어 거부가 발생하지 않았기 때문입니다.

그래서 이 정책은 두 네임스페이스를 모두 허용하는 **출발점**입니다.
붙인 뒤 반드시 아래 절차로 좁히세요.

### 좁히는 절차

1. 이 정책을 백엔드 EC2 역할에 붙인다
2. 신고를 1건 등록해 Bedrock 호출을 발생시킨다
3. CloudTrail → 이벤트 기록에서 `eventSource` / `eventName` 을 확인한다
4. 실제로 쓰인 액션만 남기고, `Resource` 를 해당 모델 ARN 으로 제한한다
5. `BedrockClassicInvokeFallback` statement 가 안 쓰였다면 삭제한다

권한이 부족하면 `journalctl -u tooktak-backend | grep '\[ai\]'` 에
`status: 403` 이 찍힙니다. AI 실패는 신고 접수를 막지 않으므로
화면상으론 정상으로 보입니다 — 로그로 확인해야 합니다.

> ⚠ 이 JSON 에는 주석을 넣지 마세요. IAM 은 `Version`/`Id`/`Statement` 외의
> 최상위 키를 거부합니다 (`MalformedPolicyDocument`).
