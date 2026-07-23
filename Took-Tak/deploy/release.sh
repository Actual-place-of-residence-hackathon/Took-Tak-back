#!/usr/bin/env bash
# 백엔드 재배포 (백엔드 EC2 에서 실행)
#
#   sudo bash /opt/tooktak/backend/deploy/release.sh
#
# 코드를 어떻게 올릴지는 팀 상황에 맞춰 두 가지 중 하나를 쓰세요.
#   A) git:  private subnet 에서 GitHub 로 나가려면 NAT 가 있어야 합니다 (있음)
#   B) rsync: 로컬 → bastion 경유로 밀어넣기 (AWS_DEPLOY.md 참고)
#
# 이 스크립트는 "이미 코드가 APP_DIR 에 있다" 는 전제로
# 의존성 설치 → 서비스 재시작 → 헬스체크까지 합니다.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/tooktak/backend}"
APP_USER="${APP_USER:-tooktak}"
SERVICE="tooktak-backend"
PORT="${PORT:-4000}"

cd "$APP_DIR"

echo "==> 의존성 설치 (npm ci)"
# package-lock.json 기준으로 정확히 재현합니다. npm install 은 lock 을 바꿔버립니다.
sudo -u "$APP_USER" npm ci --omit=dev

echo "==> 소유권 정리"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> 서비스 재시작"
systemctl restart "$SERVICE"

echo "==> 기동 대기"
# systemd 가 restart 를 반환해도 앱은 아직 리스닝 전일 수 있습니다.
for i in $(seq 1 30); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "  OK ($i초)"
    curl -s "http://127.0.0.1:${PORT}/health"; echo
    exit 0
  fi
  sleep 1
done

echo "헬스체크 실패. 로그를 확인하세요:"
echo "  journalctl -u $SERVICE -n 50 --no-pager"
systemctl is-active "$SERVICE" || true
exit 1
