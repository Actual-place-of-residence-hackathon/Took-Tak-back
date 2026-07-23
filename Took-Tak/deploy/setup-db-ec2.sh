#!/usr/bin/env bash
# PostgreSQL 설치 · 초기 설정 (DB 전용 EC2 · private subnet)
#
# 실행:  bastion 을 거쳐 DB EC2 에 접속한 뒤
#   sudo bash setup-db-ec2.sh
#
# 이 스크립트는 DB 를 "만들기만" 합니다.
# 테이블 생성(db/schema.sql)은 백엔드 EC2 에서 psql 로 적용하세요. (AWS_DEPLOY.md 6단계)

set -euo pipefail

DB_NAME="${DB_NAME:-tooktak}"
DB_USER="${DB_USER:-tooktak}"
# 비밀번호는 인자로 받습니다. 스크립트에 하드코딩하지 마세요.
DB_PASSWORD="${DB_PASSWORD:-}"
# 백엔드 EC2 가 있는 서브넷 CIDR (여기서만 접속 허용)
BACKEND_CIDR="${BACKEND_CIDR:-10.0.2.0/24}"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "DB_PASSWORD 를 지정하세요."
  echo "  예: sudo DB_PASSWORD=\"\$(openssl rand -base64 24)\" bash $0"
  exit 1
fi

echo "==> PostgreSQL 설치"
if command -v dnf >/dev/null 2>&1; then
  # Amazon Linux 2023
  dnf install -y postgresql15-server postgresql15
  PGDATA=/var/lib/pgsql/data
  PGCONF="$PGDATA/postgresql.conf"
  PGHBA="$PGDATA/pg_hba.conf"
  SERVICE=postgresql
  [[ -f "$PGCONF" ]] || postgresql-setup --initdb
else
  # Ubuntu
  apt-get update -y
  apt-get install -y postgresql postgresql-contrib
  PGVER="$(ls /etc/postgresql | sort -V | tail -1)"
  PGCONF="/etc/postgresql/$PGVER/main/postgresql.conf"
  PGHBA="/etc/postgresql/$PGVER/main/pg_hba.conf"
  SERVICE=postgresql
fi

echo "==> 외부(백엔드 EC2) 접속 허용"
# 기본값은 localhost 만 듣습니다. 이대로면 백엔드가 붙지 못합니다.
# private subnet 안이라 공인 인터넷에는 어차피 노출되지 않습니다.
if grep -qE "^#?listen_addresses" "$PGCONF"; then
  sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" "$PGCONF"
else
  echo "listen_addresses = '*'" >> "$PGCONF"
fi

# 백엔드 서브넷에서만, 비밀번호(scram) 로만 붙을 수 있게 합니다.
# 0.0.0.0/0 으로 열지 마세요. 보안그룹이 뚫리면 그대로 노출됩니다.
if ! grep -q "tooktak-backend" "$PGHBA"; then
  cat >> "$PGHBA" <<EOF

# tooktak-backend (private subnet 의 백엔드 EC2 만 허용)
host    $DB_NAME    $DB_USER    $BACKEND_CIDR    scram-sha-256
EOF
fi

systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

echo "==> DB · 계정 생성"
# 여러 번 돌려도 안전하도록 존재 여부를 먼저 봅니다.
sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOF
SELECT 'CREATE ROLE $DB_USER LOGIN PASSWORD ' || quote_literal('$DB_PASSWORD')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER')\gexec

SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DB_NAME')\gexec
EOF

# 이미 있던 계정이면 비밀번호를 지금 값으로 맞춥니다.
sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';"

echo
echo "완료. 백엔드 EC2 의 /etc/tooktak/backend.env 에 넣을 값:"
echo "  DB_HOST=$(hostname -I | awk '{print $1}')"
echo "  DB_PORT=5432"
echo "  DB_NAME=$DB_NAME"
echo "  DB_USER=$DB_USER"
echo "  DB_PASSWORD=(방금 지정한 값)"
echo
echo "다음: 백엔드 EC2 에서 스키마를 적용하세요."
echo "  psql -h <이 서버 사설IP> -U $DB_USER -d $DB_NAME -f db/schema.sql"
