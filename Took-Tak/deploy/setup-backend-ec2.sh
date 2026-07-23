#!/usr/bin/env bash
# 백엔드 EC2 초기 셋업 (private subnet)
#
# 실행:  bastion 을 거쳐 백엔드 EC2 에 접속한 뒤
#   sudo bash setup-backend-ec2.sh
#
# ※ private subnet 이지만 NAT Gateway 를 통해 아웃바운드가 되어야 합니다.
#   (npm 설치 · Bedrock 호출 모두 아웃바운드가 필요합니다)

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tooktak/backend}"
APP_USER="${APP_USER:-tooktak}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "==> 아웃바운드 확인 (NAT Gateway)"
if ! curl -fsS --max-time 10 https://registry.npmjs.org/ -o /dev/null; then
  echo "인터넷에 나가지 못합니다. 라우팅 테이블에 NAT Gateway 경로가 있는지 확인하세요."
  echo "NAT 없이는 npm 설치도, Bedrock 호출도 안 됩니다."
  exit 1
fi

echo "==> Node.js ${NODE_MAJOR}.x 설치"
if command -v dnf >/dev/null 2>&1; then
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  dnf install -y nodejs postgresql15   # psql 은 스키마 적용용
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs postgresql-client
fi
node -v

echo "==> 서비스 계정 생성"
# 로그인 불가 시스템 계정. 앱을 root 로 돌리지 않습니다.
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

echo "==> 앱 디렉터리 준비: $APP_DIR"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> 환경변수 파일 자리 준비: /etc/tooktak/backend.env"
# 앱 디렉터리에 두면 배포(git pull)마다 날아가므로 분리합니다.
mkdir -p /etc/tooktak
if [[ ! -f /etc/tooktak/backend.env ]]; then
  cat > /etc/tooktak/backend.env <<'EOF'
PORT=4000

# DB EC2 의 프라이빗 IP
DB_HOST=
DB_PORT=5432
DB_NAME=tooktak
DB_USER=tooktak
DB_PASSWORD=

# openssl rand -hex 32
JWT_SECRET=

# 관리자 초대 코드 (비밀번호 인증이 없어 관리자 권한을 막는 유일한 값)
ADMIN_SIGNUP_CODE=

# ⚠ 서울(ap-northeast-2)에는 Bedrock Mantle 엔드포인트가 없습니다.
#   가장 가까운 곳은 도쿄(ap-northeast-1) 입니다.
AWS_REGION=ap-northeast-1
BEDROCK_MODEL_ID=anthropic.claude-opus-4-8

# 프론트엔드 nginx 가 같은 오리진으로 프록시하면 비워둬도 됩니다.
CORS_ORIGIN=
EOF
  echo "  생성했습니다. 값을 채우세요: sudo vi /etc/tooktak/backend.env"
else
  echo "  이미 있습니다. 건드리지 않습니다."
fi
# 비밀값이므로 서비스 계정만 읽게 합니다.
chown root:"$APP_USER" /etc/tooktak/backend.env
chmod 640 /etc/tooktak/backend.env

echo
echo "다음 단계:"
echo "  1) 코드 배치:   $APP_DIR 에 저장소 내용을 복사 (deploy/release.sh 참고)"
echo "  2) 환경변수:    sudo vi /etc/tooktak/backend.env"
echo "  3) 스키마 적용: psql -h \$DB_HOST -U tooktak -d tooktak -f $APP_DIR/db/schema.sql"
echo "  4) 서비스 등록: sudo cp $APP_DIR/deploy/tooktak-backend.service /etc/systemd/system/"
echo "                  sudo systemctl daemon-reload && sudo systemctl enable --now tooktak-backend"
