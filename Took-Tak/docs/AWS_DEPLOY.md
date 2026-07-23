# AWS 배포 런북

> 작성일: 2026-07-23 · 대상 아키텍처: bastion + private/public subnet + EC2 3대
> 이 문서 순서대로 따라가면 배포가 끝납니다.

## 0. 구성도

```
                 인터넷
                    │
        ┌───────────┴────────────┐
        │                        │
   [public subnet]         [public subnet]
   ┌──────────┐            ┌──────────────┐
   │ bastion  │            │  frontend    │
   │  (SSH)   │            │  EC2 + nginx │ ← 사용자 브라우저가 여기로 접속
   └────┬─────┘            └──────┬───────┘
        │ SSH                     │ /api/* 프록시
        │                         │
   ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─
   [private subnet]               ▼
        │                  ┌──────────────┐        ┌──────────────┐
        ├─────────────────▶│  backend     │───────▶│  PostgreSQL  │
        │                  │  EC2 :4000   │  5432  │  EC2         │
        │                  └──────┬───────┘        └──────────────┘
        └─────────────────────────┘  │
                                     │ NAT Gateway
                                     ▼
                              Amazon Bedrock
```

## 1. ⚠ 먼저 알아야 할 두 가지

이 두 개를 모르고 진행하면 반드시 막힙니다.

### 1-1. 프론트엔드는 백엔드의 사설 IP 를 직접 못 부릅니다

백엔드가 private subnet 에 있으므로 공인 IP 가 없습니다.
그런데 SPA(React 등)에서 실제로 API 를 호출하는 주체는 **사용자 브라우저**입니다.
브라우저는 인터넷에 있으니 `10.0.x.x` 에 절대 닿지 못합니다.

**프론트 코드에 백엔드 사설 IP 를 박으면 100% 실패합니다.**

해결: 프론트엔드 EC2 의 nginx 가 대신 받아서 백엔드로 넘깁니다.

```
브라우저 ──▶ 프론트 EC2 (공인, 같은 VPC) ──▶ 백엔드 EC2 (사설)
```

- 설정 파일: [`deploy/nginx-frontend.conf`](../deploy/nginx-frontend.conf)
- 프론트엔드는 API 주소를 **상대경로 `/api`** 로 두면 됩니다.
  오리진이 같아지므로 CORS 도 발생하지 않습니다.

### 1-2. 서울 리전에는 Bedrock Mantle 엔드포인트가 없습니다

2026-07-23 실측 결과입니다.

```
bedrock-mantle.ap-northeast-2.api.aws  →  DNS 조회 실패 (서울 없음)
bedrock-mantle.ap-northeast-3.api.aws  →  DNS 조회 실패 (오사카 없음)
bedrock-mantle.ap-northeast-1.api.aws  →  정상 (도쿄)
```

확인된 리전: `us-east-1`, `us-east-2`, `us-west-2`, `eu-west-1`, `eu-central-1`,
`ap-northeast-1`, `ap-southeast-1`, `ap-southeast-2`, `ap-south-1`

**`AWS_REGION=ap-northeast-2` 로 두면 `Connection error.` 만 뜨고 원인이 안 보입니다.**
한국에서 가장 가까운 곳은 **도쿄(`ap-northeast-1`)** 입니다.

> EC2 자체는 서울에 둬도 됩니다. Bedrock 호출만 도쿄로 나가면 됩니다.
> 리전 간 왕복이 붙지만 실측 6~9초 안에 들어옵니다.

## 2. 보안그룹

포트를 넓게 열지 말고 **보안그룹 ID 를 소스로** 지정하세요. IP 대역보다 안전합니다.

| 보안그룹 | 인바운드 | 소스 |
|---|---|---|
| `sg-bastion` | 22 (SSH) | 팀 공인 IP `/32` (0.0.0.0/0 금지) |
| `sg-frontend` | 80, 443 | `0.0.0.0/0` |
| `sg-frontend` | 22 | `sg-bastion` |
| `sg-backend` | 4000 | `sg-frontend` |
| `sg-backend` | 22 | `sg-bastion` |
| `sg-db` | 5432 | `sg-backend` |
| `sg-db` | 22 | `sg-bastion` |

아웃바운드는 모두 기본값(전체 허용)으로 두세요.
백엔드는 NAT 를 통해 Bedrock 으로 나가야 합니다.

## 3. 라우팅 — 백엔드에 NAT 가 반드시 필요합니다

private subnet 의 라우팅 테이블에 NAT Gateway 로 가는 `0.0.0.0/0` 경로가 있어야 합니다.

없으면:
- `npm ci` 가 안 됩니다
- **Bedrock 호출이 안 됩니다** → AI 분류가 조용히 실패하고 신고만 접수됩니다

NAT 데이터 요금이 아까우면 VPC 인터페이스 엔드포인트를 검토할 수 있지만,
Mantle 엔드포인트(`bedrock-mantle.{region}.api.aws`)용 서비스명을 먼저 확인해야 합니다.
**해커톤 일정이면 NAT 그대로 쓰는 걸 권합니다.**

## 4. bastion 경유 접속 설정

로컬 `~/.ssh/config` 에 넣어두면 이후 명령이 짧아집니다.

```sshconfig
Host tooktak-bastion
    HostName <bastion 공인 IP>
    User ec2-user
    IdentityFile ~/.ssh/tooktak.pem

Host tooktak-backend
    HostName <백엔드 사설 IP>
    User ec2-user
    IdentityFile ~/.ssh/tooktak.pem
    ProxyJump tooktak-bastion

Host tooktak-db
    HostName <DB 사설 IP>
    User ec2-user
    IdentityFile ~/.ssh/tooktak.pem
    ProxyJump tooktak-db-via-bastion
```

이제 `ssh tooktak-backend` 한 번으로 들어갑니다.

> bastion 에 개인키를 복사하지 마세요. `ProxyJump` 는 로컬 키를 그대로 씁니다.

## 5. DB EC2 (private subnet)

```bash
ssh tooktak-db

# 스크립트를 올린 뒤
sudo DB_PASSWORD="$(openssl rand -base64 24)" BACKEND_CIDR=10.0.2.0/24 \
     bash setup-db-ec2.sh
```

스크립트가 하는 일:
- PostgreSQL 설치 · 기동
- `listen_addresses = '*'` (기본값은 localhost 라 백엔드가 못 붙습니다)
- `pg_hba.conf` 에 **백엔드 서브넷만** `scram-sha-256` 으로 허용
- `tooktak` DB · 계정 생성

마지막에 출력되는 `DB_HOST` / `DB_PASSWORD` 를 받아두세요.

## 6. 백엔드 EC2 (private subnet)

### 6-1. 인스턴스 프로파일에 Bedrock 권한 부여

**액세스 키를 `.env` 에 넣지 마세요.** SDK 가 인스턴스 메타데이터에서 자동으로 가져옵니다.

[`deploy/iam-bedrock-policy.json`](../deploy/iam-bedrock-policy.json) 을 정책으로 만들어
백엔드 EC2 의 역할에 붙입니다.

> Mantle 클라이언트는 SigV4 서비스명이 `bedrock-mantle` 입니다(기존 `bedrock` 아님).
> 정확한 IAM 액션명은 검증하지 못해 두 네임스페이스를 모두 허용해 뒀습니다.
> 붙인 뒤 CloudTrail 에서 실제 `eventName` 을 확인해 좁히세요. (정책 파일 주석 참고)

### 6-2. Bedrock 모델 액세스 승인

✅ **도쿄(`ap-northeast-1`)의 `anthropic.claude-opus-4-8`은 이미 승인돼 있습니다** (2026-07-23 확인, `AUTHORIZED`). `.env.example` 기본값 그대로 쓰면 이 단계는 건너뛰어도 됩니다.

다른 모델·리전을 쓰려면 Bedrock 콘솔 → **Model access** 에서 그 리전에 따로 승인하세요.

### 6-3. 서버 셋업

```bash
ssh tooktak-backend
sudo bash setup-backend-ec2.sh
```

Node.js · psql 설치, `tooktak` 서비스 계정 생성, `/etc/tooktak/backend.env` 뼈대 생성까지 합니다.

### 6-4. 코드 배치

로컬에서 bastion 을 거쳐 밀어넣습니다.

```bash
rsync -az --delete \
  --exclude node_modules --exclude .git --exclude .env \
  -e "ssh -J tooktak-bastion" \
  ./Took-Tak/  ec2-user@<백엔드 사설IP>:/tmp/tooktak/

ssh tooktak-backend "sudo rsync -a --delete /tmp/tooktak/ /opt/tooktak/backend/"
```

### 6-5. 환경변수

```bash
ssh tooktak-backend
sudo vi /etc/tooktak/backend.env
```

| 키 | 값 |
|---|---|
| `DB_HOST` | 5단계에서 나온 DB 사설 IP |
| `DB_PASSWORD` | 5단계에서 생성한 비밀번호 |
| `JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_SIGNUP_CODE` | 팀이 정한 값 (관리자 권한을 막는 유일한 값입니다) |
| `AWS_REGION` | `ap-northeast-1` — **`ap-northeast-2` 는 안 됩니다** |
| `BEDROCK_MODEL_ID` | `anthropic.claude-opus-4-8` |
| `CORS_ORIGIN` | nginx 프록시를 쓰면 비워두세요 |

> `.env` 를 앱 디렉터리가 아니라 `/etc/tooktak/` 에 두는 이유는
> 재배포(rsync/git pull)마다 덮어써져 비밀값이 날아가기 때문입니다.

### 6-6. 스키마 적용 (최초 1회)

```bash
cd /opt/tooktak/backend
psql -h <DB 사설IP> -U tooktak -d tooktak -f db/schema.sql
node src/seed.js          # 건물/층/구역 기준 데이터
```

> `sequelize.sync()` 는 쓰지 않습니다. `db/schema.sql` 이 스키마의 정본입니다.

### 6-7. 서비스 등록

```bash
sudo cp /opt/tooktak/backend/deploy/tooktak-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tooktak-backend

curl localhost:4000/health     # {"status":"ok","db":"up"}
journalctl -u tooktak-backend -f
```

이후 재배포는 코드를 다시 밀어넣고:

```bash
sudo bash /opt/tooktak/backend/deploy/release.sh
```

## 7. 프론트엔드 EC2 (public subnet)

```bash
ssh -J tooktak-bastion ec2-user@<프론트 사설IP>   # 또는 공인 IP 로 직접

sudo dnf install -y nginx      # Ubuntu: sudo apt-get install -y nginx
sudo mkdir -p /var/www/tooktak
# 빌드 산출물(dist/ 또는 build/)을 /var/www/tooktak 에 복사

sudo cp nginx-frontend.conf /etc/nginx/conf.d/tooktak.conf
sudo vi /etc/nginx/conf.d/tooktak.conf   # upstream 의 백엔드 사설 IP 수정
sudo nginx -t && sudo systemctl enable --now nginx
```

확인:

```bash
curl http://<프론트 공인IP>/healthz     # 백엔드 헬스체크가 프록시되어 나옵니다
```

## 8. 배포 검증

프론트 공인 IP 기준으로 실제 흐름을 한 번 돌려봅니다.

```bash
FRONT=http://<프론트 공인IP>

# 1) 헬스체크 — DB 연결까지 확인
curl -s $FRONT/healthz

# 2) 학생 식별
TOKEN=$(curl -s -X POST $FRONT/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"studentId":"20240001","name":"테스트"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# 3) 위치 트리 (seed 확인)
curl -s $FRONT/api/locations/tree -H "Authorization: Bearer $TOKEN"

# 4) 신고 등록 — 여기서 Bedrock 이 돌아갑니다 (6~9초)
curl -s -X POST $FRONT/api/reports \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"building_id":1,"floor_id":1,"zone_id":1,
       "description":"3층 남자화장실 천장에서 물이 계속 떨어집니다"}'

# 5) AI 분류 결과 확인
curl -s $FRONT/api/reports/1 -H "Authorization: Bearer $TOKEN"
```

5번 응답에서 `ai_type` / `ai_urgency` / `ai_summary` / `ai_reasoning` /
`ai_suggested_action` 이 채워져 있으면 Bedrock 연동까지 정상입니다.

## 9. 문제 해결

| 증상 | 원인 | 확인 |
|---|---|---|
| 브라우저에서 API 만 실패 | 프론트가 백엔드 사설 IP 를 직접 호출 | 1-1절. API 주소를 `/api` 상대경로로 |
| `ai_*` 가 전부 `null` | AI 실패 (신고 접수는 성공) | `journalctl -u tooktak-backend \| grep '\[ai\]'` |
| `[ai] ... Connection error.` | 리전에 Mantle 엔드포인트 없음 / NAT 없음 | 1-2절, 3절 |
| `[ai] ... status: 403` | 모델 액세스 미승인 또는 IAM 권한 부족 | 6-1, 6-2절 |
| `[ai] BEDROCK_MODEL_ID 미설정` | 환경변수 누락 | `/etc/tooktak/backend.env` |
| 기동 직후 죽음 | DB 접속 실패 → `process.exit(1)` | `journalctl -u tooktak-backend -n 50` |
| `502 Bad Gateway` | 백엔드가 안 떠 있음 / 보안그룹 4000 미개방 | 백엔드에서 `curl localhost:4000/health` |
| `504 Gateway Time-out` | AI 호출이 nginx 기본 60초 초과 | nginx `proxy_read_timeout` 확인 |

AI 실패는 **신고 접수 자체를 막지 않습니다.** 분류 컬럼만 비워둔 채 저장됩니다.
따라서 화면상으론 정상으로 보이므로, 위 로그 grep 으로 확인해야 합니다.

## 10. 남은 보안 숙제 (해커톤 이후)

- **인증이 없습니다.** 학번을 아는 사람은 누구나 그 학번으로 신고할 수 있습니다.
  관리자 권한은 `ADMIN_SIGNUP_CODE` 하나로만 막혀 있습니다. (README 4절)
- HTTPS 미적용. 현재 nginx 는 80 포트만 받습니다. 토큰이 평문으로 오갑니다.
  ACM + ALB 또는 Let's Encrypt 를 붙이세요.
- 업로드는 EC2 로컬 디스크(`src/uploads/`)를 씁니다. 인스턴스가 죽거나 재배포되면 사진이 사라집니다. 이미지 업로드 라우트 자체도 아직 어떤 경로에도 연결돼 있지 않습니다.
