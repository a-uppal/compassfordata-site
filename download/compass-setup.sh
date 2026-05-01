#!/usr/bin/env bash
# =============================================================================
# DATA Compass - Online Bootstrap Installer
# =============================================================================
# This is the ONLY file a customer downloads. It's ~15KB.
#
# What it does:
#   1. Checks prerequisites (curl/wget, Docker or offers to install)
#   2. Downloads the lightweight deploy bundle (~100KB) from compassfordata.com
#   3. Extracts it to a temp directory
#   4. Launches the setup wizard (which pulls ~700MB Docker images from registry)
#
# Usage:
#   # Cloud paths (Azure, AWS) -- no sudo needed:
#   curl -fsSL https://compassfordata.com/download/compass-setup.sh -o compass-setup.sh
#   chmod +x compass-setup.sh
#   ./compass-setup.sh
#
#   # Docker Compose path -- sudo required:
#   sudo ./compass-setup.sh --deploy-type docker
#
# Options:
#   --version         Print version and exit
#   --dry-run         Preview what would happen
#   --silent          Unattended install (requires COMPASS_* env vars)
#   --install-dir DIR Install to DIR (default: /opt/compass)
#   --channel CHAN    Release channel: stable, beta (default: stable)
#   -h, --help        Show help
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — change these for your deployment
# ---------------------------------------------------------------------------
VERSION="1.1.3"
PRODUCT_NAME="DATA Compass"
GITHUB_REPO="compassfordata/data-compass"
DOCKER_IMAGE="ghcr.io/compassfordata/data-compass"
DOWNLOAD_BASE="${COMPASS_DOWNLOAD_URL:-https://github.com/compassfordata/compass-releases/releases/download}"
BUNDLE_URL="${DOWNLOAD_BASE}/v${VERSION}/compass-deploy-v${VERSION}.tar.gz"
CHECKSUM_URL="${BUNDLE_URL}.sha256"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
if [[ -n "${NO_COLOR:-}" ]] || [ ! -t 1 ]; then
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; DIM=''; NC=''
else
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
fi

ok()   { echo -e "  ${GREEN}[OK]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "  ${BLUE}[INFO]${NC} $1"; }

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
show_banner() {
  echo ""
  echo -e "  ${BOLD}${BLUE}+----------------------------------------------+${NC}"
  echo -e "  ${BOLD}${BLUE}|                                              |${NC}"
  echo -e "  ${BOLD}${BLUE}|          ${NC}${BOLD}D A T A   C O M P A S S${NC}${BOLD}${BLUE}           |${NC}"
  echo -e "  ${BOLD}${BLUE}|                                              |${NC}"
  echo -e "  ${BOLD}${BLUE}|${NC}${DIM}     Enterprise Data Quality & FAIR Platform${NC}${BOLD}${BLUE}  |${NC}"
  echo -e "  ${BOLD}${BLUE}|                                              |${NC}"
  echo -e "  ${BOLD}${BLUE}+----------------------------------------------+${NC}"
  echo ""
  echo -e "  ${BOLD}${PRODUCT_NAME}${NC} Online Installer v${VERSION}"
  echo ""
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
INSTALL_DIR="/opt/compass"
CHANNEL="stable"
DRY_RUN=false
SILENT=false
DEPLOY_TYPE=""
LICENSE_FILE="${COMPASS_LICENSE_FILE:-}"
LICENSE_JWT=""
LICENSE_B64=""
SETUP_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      echo "${PRODUCT_NAME} Online Installer v${VERSION}"
      exit 0
      ;;
    --dry-run)
      DRY_RUN=true
      SETUP_ARGS+=("--dry-run")
      shift
      ;;
    --silent)
      SILENT=true
      SETUP_ARGS+=("--silent")
      shift
      ;;
    --deploy-type)
      DEPLOY_TYPE="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      SETUP_ARGS+=("--install-dir" "$2")
      shift 2
      ;;
    --license)
      LICENSE_FILE="$2"
      shift 2
      ;;
    --channel)
      CHANNEL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "${PRODUCT_NAME} Online Installer"
      echo ""
      echo "Options:"
      echo "  --version               Print version and exit"
      echo "  --deploy-type TYPE      Deployment type: azure, aws, docker, airgap"
      echo "  --license FILE          License file path (or Enter for 30-day evaluation)"
      echo "  --dry-run               Preview install plan without changes"
      echo "  --silent                Unattended install (requires COMPASS_* env vars)"
      echo "  --install-dir DIR       Installation directory (default: /opt/compass)"
      echo "  --channel CHANNEL       Release channel: stable, beta (default: stable)"
      echo "  -h, --help              Show this help"
      echo ""
      echo "Deployment types:"
      echo "  azure      Azure App Service + managed PostgreSQL"
      echo "  aws        AWS App Runner + RDS PostgreSQL"
      echo "  docker     Docker Compose on your own Linux server"
      echo "  airgap     Offline install (no internet required)"
      echo ""
      echo "Silent mode env vars (required when --silent):"
      echo "  COMPASS_ADMIN_EMAIL, COMPASS_ADMIN_PASSWORD,"
      echo "  COMPASS_ADMIN_NAME, COMPASS_ADMIN_ORG"
      echo "Optional: COMPASS_AI_KEY, COMPASS_PROXY_URL, COMPASS_LICENSE_FILE"
      echo ""
      echo "Examples:"
      echo "  # Interactive install (shows deployment menu):"
      echo "  ./compass-setup.sh"
      echo ""
      echo "  # Azure cloud deploy (no sudo needed):"
      echo "  ./compass-setup.sh --deploy-type azure"
      echo ""
      echo "  # Docker Compose on your server (sudo required):"
      echo "  sudo ./compass-setup.sh --deploy-type docker"
      echo ""
      echo "  # Silent Docker Compose install:"
      echo "  export COMPASS_ADMIN_EMAIL=admin@example.com"
      echo "  export COMPASS_ADMIN_PASSWORD=SecurePass123"
      echo "  export COMPASS_ADMIN_NAME='Admin User'"
      echo "  export COMPASS_ADMIN_ORG='Acme Pharma'"
      echo "  sudo -E ./compass-setup.sh --deploy-type docker --silent"
      exit 0
      ;;
    *)
      # Pass unknown args to setup.sh
      SETUP_ARGS+=("$1")
      shift
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Detect download tool
# ---------------------------------------------------------------------------
DOWNLOADER=""
detect_downloader() {
  if command -v curl &>/dev/null; then
    DOWNLOADER="curl"
  elif command -v wget &>/dev/null; then
    DOWNLOADER="wget"
  else
    fail "Neither curl nor wget found. Install one and retry."
    exit 1
  fi
}

download_file() {
  local url="$1"
  local dest="$2"
  if [[ "$DOWNLOADER" == "curl" ]]; then
    curl -fSL --progress-bar -o "$dest" "$url"
  else
    wget --show-progress -qO "$dest" "$url"
  fi
}

# ---------------------------------------------------------------------------
# Check prerequisites
# ---------------------------------------------------------------------------
check_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "This installer must be run as root (use sudo)."
    echo ""
    echo "  sudo $0 $*"
    exit 1
  fi
}

check_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker installed: $(docker --version 2>/dev/null | head -1)"
    return 0
  fi

  warn "Docker is not installed."
  echo ""

  if [[ "$SILENT" == true ]]; then
    info "Attempting automatic Docker installation..."
    install_docker
    return $?
  fi

  echo -n "  Install Docker automatically? [Y/n]: "
  read -r answer
  if [[ "$answer" =~ ^[Nn]$ ]]; then
    fail "Docker is required. Install it manually: https://docs.docker.com/engine/install/"
    exit 1
  fi

  install_docker
}

install_docker() {
  info "Installing Docker Engine..."

  if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v yum &>/dev/null; then
    # RHEL/CentOS
    yum install -y -q yum-utils
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    yum install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v dnf &>/dev/null; then
    # Fedora
    dnf install -y -q dnf-plugins-core
    dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
    dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
  else
    fail "Unsupported package manager. Install Docker manually: https://docs.docker.com/engine/install/"
    exit 1
  fi

  systemctl enable docker
  systemctl start docker
  ok "Docker installed and started"
}

check_compose() {
  if docker compose version &>/dev/null; then
    ok "Docker Compose: $(docker compose version --short 2>/dev/null)"
    return 0
  fi

  fail "Docker Compose v2 not found. It should be included with Docker Engine."
  fail "Install it: https://docs.docker.com/compose/install/"
  exit 1
}

check_resources() {
  local mem_gb
  mem_gb=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo "0")
  if [[ "$mem_gb" -lt 4 ]]; then
    warn "System has ${mem_gb}GB RAM. Minimum recommended: 4GB."
  else
    ok "RAM: ${mem_gb}GB"
  fi

  local disk_gb
  disk_gb=$(df -BG "${INSTALL_DIR%/*}" 2>/dev/null | awk 'NR==2 {gsub(/G/,"",$4); print $4}' || echo "0")
  if [[ "$disk_gb" -lt 10 ]]; then
    warn "Available disk: ${disk_gb}GB. Minimum recommended: 10GB."
  else
    ok "Disk: ${disk_gb}GB available"
  fi
}

# ---------------------------------------------------------------------------
# License validation
# ---------------------------------------------------------------------------
validate_license() {
  echo -e "  ${BOLD}License${NC}"
  echo ""

  # Prompt for license file if not provided via --license or env var
  if [[ -z "$LICENSE_FILE" ]]; then
    if [[ "$SILENT" == true ]]; then
      info "No license file specified. Starting 30-day evaluation."
    else
      echo -n "  License file path (Enter for 30-day evaluation): "
      read -r LICENSE_FILE
    fi
  fi

  if [[ -z "$LICENSE_FILE" ]]; then
    echo ""
    warn "No license provided. ${PRODUCT_NAME} will run in 30-day evaluation mode."
    warn "All modules are unlocked during evaluation."
    echo ""
    return 0
  fi

  # Check file exists
  if [[ ! -f "$LICENSE_FILE" ]]; then
    fail "License file not found: ${LICENSE_FILE}"
    exit 1
  fi

  # Read the JWT and decode the payload (middle segment)
  LICENSE_JWT=$(cat "$LICENSE_FILE" | tr -d '[:space:]')

  if [[ -z "$LICENSE_JWT" ]]; then
    fail "License file is empty."
    exit 1
  fi

  # Decode JWT payload (middle segment, base64url)
  local payload_b64
  payload_b64=$(echo "$LICENSE_JWT" | cut -d'.' -f2)

  # Base64url → base64 (replace - with +, _ with /, pad with =)
  local payload_b64std
  payload_b64std=$(echo "$payload_b64" | tr '_-' '/+')
  local pad=$(( (4 - ${#payload_b64std} % 4) % 4 ))
  for (( i=0; i<pad; i++ )); do
    payload_b64std="${payload_b64std}="
  done

  local payload_json
  payload_json=$(echo "$payload_b64std" | base64 -d 2>/dev/null || echo "")

  if [[ -z "$payload_json" ]]; then
    fail "Could not decode license file. It may be corrupted."
    exit 1
  fi

  # Extract fields using grep/sed (no jq dependency)
  local customer_name edition expiration_date
  customer_name=$(echo "$payload_json" | grep -o '"customer_name":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
  edition=$(echo "$payload_json" | grep -o '"edition":"[^"]*"' | cut -d'"' -f4 || echo "Unknown")
  expiration_date=$(echo "$payload_json" | grep -o '"expiration_date":"[^"]*"' | cut -d'"' -f4 || echo "")

  # Validate expiration
  if [[ -n "$expiration_date" ]]; then
    local exp_epoch now_epoch
    exp_epoch=$(date -d "$expiration_date" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%S" "${expiration_date%%.*}" +%s 2>/dev/null || echo "0")
    now_epoch=$(date +%s)

    if [[ "$exp_epoch" -le "$now_epoch" ]]; then
      fail "License has expired (${expiration_date})."
      fail "Contact your account representative for renewal."
      exit 1
    fi

    local exp_display
    exp_display=$(echo "$expiration_date" | cut -dT -f1)
    echo -e "  ${GREEN}✓${NC} Licensed to: ${BOLD}${customer_name}${NC}, ${edition^} edition, expires ${exp_display}"
  else
    echo -e "  ${GREEN}✓${NC} Licensed to: ${BOLD}${customer_name}${NC}, ${edition^} edition"
  fi

  # Base64-encode the JWT for cloud env var injection
  LICENSE_B64=$(echo -n "$LICENSE_JWT" | base64 -w0 2>/dev/null || echo -n "$LICENSE_JWT" | base64 2>/dev/null || echo "")

  echo ""
}

# ---------------------------------------------------------------------------
# Deployment type menu
# ---------------------------------------------------------------------------
show_deploy_menu() {
  echo -e "  ${BOLD}How would you like to deploy ${PRODUCT_NAME}?${NC}" >&2
  echo "" >&2
  echo -e "    ${GREEN}1)${NC}  ${BOLD}Azure Cloud${NC}        Azure App Service + managed PostgreSQL" >&2
  echo -e "                          ${DIM}Recommended for most deployments. No servers to manage.${NC}" >&2
  echo "" >&2
  echo -e "    ${BLUE}2)${NC}  ${BOLD}AWS Cloud${NC}          AWS App Runner + RDS PostgreSQL" >&2
  echo -e "                          ${DIM}Deploy to your AWS account. No servers to manage.${NC}" >&2
  echo "" >&2
  echo -e "    ${YELLOW}3)${NC}  ${BOLD}Docker Compose${NC}     Install on your own Linux server" >&2
  echo -e "                          ${DIM}Full control. Runs anywhere Docker is installed.${NC}" >&2
  echo "" >&2
  echo -e "    ${YELLOW}4)${NC}  ${BOLD}Air-gapped${NC}         Offline install (no internet required)" >&2
  echo -e "                          ${DIM}For secure environments with no outbound internet.${NC}" >&2
  echo "" >&2
  echo -e "    ${DIM}q)${NC}  ${DIM}Quit${NC}" >&2
  echo "" >&2

  while true; do
    echo -n "  Select [1-4/q]: " >&2
    read -r choice
    case "$choice" in
      1) echo "azure";  return ;;
      2) echo "aws";    return ;;
      3) echo "docker"; return ;;
      4) echo "airgap"; return ;;
      q|Q) echo "quit"; return ;;
      *) echo -e "  ${RED}Invalid choice. Enter 1, 2, 3, 4, or q.${NC}" >&2 ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Deploy: Azure Cloud (App Service + PostgreSQL Flexible Server)
# ---------------------------------------------------------------------------
deploy_azure() {
  echo ""
  echo -e "  ${BOLD}${GREEN}Azure Cloud Deployment${NC}"
  echo -e "  ${DIM}App Service + PostgreSQL Flexible Server${NC}"
  echo ""

  # Check for Azure CLI
  if ! command -v az &>/dev/null; then
    fail "Azure CLI (az) is not installed."
    echo ""
    echo "  Install it:"
    echo "    https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
    echo ""
    echo "  Or run this installer from Azure Cloud Shell, which has az pre-installed:"
    echo "    https://shell.azure.com"
    exit 1
  fi
  ok "Azure CLI found: $(az version --query '\"azure-cli\"' -o tsv 2>/dev/null || echo 'unknown')"

  # Check Azure login
  if ! az account show &>/dev/null 2>&1; then
    info "Not logged in to Azure. Opening login..."
    az login || { fail "Azure login failed."; exit 1; }
  fi

  local sub_name
  sub_name=$(az account show --query "name" -o tsv 2>/dev/null)
  ok "Azure subscription: ${sub_name}"
  echo ""

  # -----------------------------------------------------------------------
  # Collect configuration
  # -----------------------------------------------------------------------
  echo -e "  ${BOLD}Step 1/5: Configuration${NC}"
  echo ""

  # Generate a short random suffix to avoid name collisions
  local suffix
  suffix=$(openssl rand -hex 3)

  # Resource naming
  local rg_name app_name db_name location
  echo -n "  Resource group name [compass-rg]: "
  read -r rg_name
  rg_name="${rg_name:-compass-rg}"

  echo -n "  Region [eastus]: "
  read -r location
  location="${location:-eastus}"

  echo -n "  Web app name [compass-${suffix}]: "
  read -r app_name
  app_name="${app_name:-compass-${suffix}}"

  echo -n "  Database server name [compass-db-${suffix}]: "
  read -r db_name
  db_name="${db_name:-compass-db-${suffix}}"

  # Database credentials
  local db_user db_pass
  echo -n "  Database admin username [compassadmin]: "
  read -r db_user
  db_user="${db_user:-compassadmin}"

  echo -n "  Database admin password (min 8 chars, Enter to auto-generate): "
  read -rs db_pass
  echo ""
  if [[ -z "$db_pass" ]]; then
    # Alphanumeric only -- avoid bash/CLI special char mangling (!$&" etc)
    db_pass="Cp$(openssl rand -base64 24 | tr -d '/+=!@#$%^&*()' | head -c 20)z9"
    info "Auto-generated database password"
  fi

  # Admin user
  local admin_email admin_name admin_org admin_pass
  echo ""
  echo -e "  ${BOLD}Admin account (for logging into DATA Compass):${NC}"
  echo -n "  Admin email: "
  read -r admin_email
  echo -n "  Admin full name: "
  read -r admin_name
  echo -n "  Organization name: "
  read -r admin_org
  echo -n "  Admin password (min 8 chars): "
  read -rs admin_pass
  echo ""

  # Optional: API key
  local ai_key=""
  echo ""
  echo -n "  Anthropic API key (sk-ant-..., Enter to skip): "
  read -rs ai_key
  echo ""

  # Generate secrets
  local jwt_secret mfa_key integration_key
  jwt_secret=$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)
  mfa_key=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  integration_key=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

  echo ""
  echo -e "  ${BOLD}Configuration summary:${NC}"
  echo "    Resource group:  ${rg_name}"
  echo "    Region:          ${location}"
  echo "    Web app:         ${app_name}.azurewebsites.net"
  echo "    Database:        ${db_name}.postgres.database.azure.com"
  echo "    Admin email:     ${admin_email}"
  echo ""
  echo -n "  Proceed? [Y/n]: "
  read -r confirm
  if [[ "$confirm" =~ ^[Nn]$ ]]; then
    info "Cancelled."
    exit 0
  fi

  # -----------------------------------------------------------------------
  # Step 2: Create Azure resources
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 2/5: Create Azure Resources${NC}"
  echo ""

  # Resource group
  info "Creating resource group ${rg_name}..."
  az group create --name "$rg_name" --location "$location" -o none 2>/dev/null
  ok "Resource group: ${rg_name}"

  # PostgreSQL Flexible Server (with region fallback)
  info "Creating PostgreSQL server (this takes 2-4 minutes)..."
  local db_created=false
  local db_location="$location"
  local try_regions=("$location" "eastus" "eastus2" "westus2" "northeurope" "westeurope" "centralus")

  for try_region in "${try_regions[@]}"; do
    if az postgres flexible-server create \
      --resource-group "$rg_name" \
      --name "$db_name" \
      --location "$try_region" \
      --admin-user "$db_user" \
      --admin-password "$db_pass" \
      --sku-name Standard_B1ms \
      --tier Burstable \
      --version 16 \
      --storage-size 32 \
      --yes \
      -o none 2>/dev/null; then
      db_created=true
      db_location="$try_region"
      break
    else
      if [[ "$try_region" == "$location" ]]; then
        warn "PostgreSQL unavailable in ${try_region}, trying other regions..."
      fi
    fi
  done

  if [[ "$db_created" != true ]]; then
    fail "Could not create PostgreSQL server in any region."
    fail "Your subscription may have restrictions. Try:"
    fail "  1. Use a different subscription"
    fail "  2. Request a quota increase at https://aka.ms/ProdportalCR"
    fail "  3. Contact your Azure administrator"
    exit 1
  fi

  ok "PostgreSQL server: ${db_name} (${db_location})"
  if [[ "$db_location" != "$location" ]]; then
    warn "Database created in ${db_location} (${location} was unavailable)."
    warn "App Service will also be created in ${db_location} for best performance."
    location="$db_location"
  fi

  # Allow Azure services to connect to PostgreSQL
  info "Opening firewall for Azure services..."
  az postgres flexible-server firewall-rule create \
    --resource-group "$rg_name" \
    --name "$db_name" \
    --rule-name AllowAzureServices \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0 \
    -o none 2>/dev/null
  ok "Firewall rule: AllowAzureServices"

  # App Service Plan
  info "Creating App Service plan..."
  az appservice plan create \
    --resource-group "$rg_name" \
    --name "${app_name}-plan" \
    --location "$location" \
    --sku P1v3 \
    --is-linux \
    -o none 2>/dev/null \
    || { fail "Failed to create App Service plan."; exit 1; }
  ok "App Service plan: ${app_name}-plan (P1v3)"

  # Web App (Docker container — public image from ghcr.io, no registry credentials needed)
  info "Creating web app..."
  az webapp create \
    --resource-group "$rg_name" \
    --plan "${app_name}-plan" \
    --name "$app_name" \
    --container-image-name "${DOCKER_IMAGE}:${VERSION}" \
    -o none 2>/dev/null \
    || { fail "Failed to create web app."; exit 1; }
  ok "Web app: ${app_name}"

  # Enable Docker container logging BEFORE first start
  info "Enabling container logging..."
  az webapp log config \
    --resource-group "$rg_name" \
    --name "$app_name" \
    --docker-container-logging filesystem \
    -o none 2>/dev/null
  ok "Container logging enabled"

  # -----------------------------------------------------------------------
  # Step 3: Configure environment variables
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 3/5: Configure Application${NC}"
  echo ""

  info "Setting environment variables..."

  # Build settings array (license B64 is optional)
  local license_setting=""
  local license_required="false"
  if [[ -n "$LICENSE_B64" ]]; then
    license_setting="COMPASS_LICENSE_B64=${LICENSE_B64}"
    license_required="true"
  fi

  az webapp config appsettings set \
    --resource-group "$rg_name" \
    --name "$app_name" \
    --settings \
      NODE_ENV=production \
      PORT=8080 \
      WEBSITES_PORT=8080 \
      PGHOST="${db_name}.postgres.database.azure.com" \
      PGPORT=5432 \
      PGDATABASE=postgres \
      PGUSER="${db_user}" \
      PGPASSWORD="${db_pass}" \
      PGSSL=require \
      PGSSLMODE=require \
      PGPOOL_MAX=15 \
      JWT_SECRET="${jwt_secret}" \
      MFA_ENCRYPTION_KEY="${mfa_key}" \
      INTEGRATION_ENCRYPTION_KEY="${integration_key}" \
      RUN_MIGRATIONS=true \
      TRUST_PROXY=true \
      LOG_FORMAT=json \
      LOG_LEVEL=info \
      STORAGE_BACKEND=postgres \
      FILE_STORAGE_BACKEND=postgres \
      COMPASS_LICENSE_REQUIRED="${license_required}" \
      ENABLE_INPUT_VALIDATION=true \
      ENABLE_RATE_LIMITING=true \
      ENABLE_SECURITY_HEADERS=true \
      ENABLE_ERROR_SANITIZATION=true \
      WEBSITES_CONTAINER_START_TIME_LIMIT=600 \
      ${license_setting} \
    -o none 2>/dev/null
  ok "Core settings configured"

  if [[ -n "$ai_key" ]]; then
    az webapp config appsettings set \
      --resource-group "$rg_name" \
      --name "$app_name" \
      --settings ANTHROPIC_API_KEY="${ai_key}" \
      -o none 2>/dev/null
    ok "Anthropic API key configured"
  else
    warn "No API key set. AI features will be unavailable until configured."
  fi

  # Set health check path
  az webapp config set \
    --resource-group "$rg_name" \
    --name "$app_name" \
    --generic-configurations '{"healthCheckPath":"/health/live"}' \
    -o none 2>/dev/null
  ok "Health check path: /health/live"

  # -----------------------------------------------------------------------
  # Step 4: Wait for startup
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 4/5: Start Application${NC}"
  echo ""

  info "Restarting app to apply configuration..."
  az webapp restart --resource-group "$rg_name" --name "$app_name" -o none 2>/dev/null

  local app_url="https://${app_name}.azurewebsites.net"
  info "Waiting for ${PRODUCT_NAME} to start (this takes 3-8 minutes on first deploy)..."
  info "First start pulls the container image and runs 95 database migrations."
  echo ""

  local attempts=0
  local max_attempts=96
  while [ $attempts -lt $max_attempts ]; do
    local http_code
    http_code=$(curl -sf -o /dev/null -w "%{http_code}" "${app_url}/health" 2>/dev/null || echo "000")
    if [[ "$http_code" == "200" ]]; then
      break
    fi
    attempts=$((attempts + 1))
    printf "\r  Waiting... (%d/%d)" "$attempts" "$max_attempts"
    sleep 5
  done
  printf "\r\033[K"

  if [ $attempts -ge $max_attempts ]; then
    fail "App did not respond within 8 minutes."
    echo ""
    echo "  Troubleshooting:"
    echo "    1. View container logs:"
    echo "       az webapp log tail -g ${rg_name} -n ${app_name}"
    echo ""
    echo "    2. Download logs:"
    echo "       az webapp log download -g ${rg_name} -n ${app_name}"
    echo ""
    echo "    3. Common causes:"
    echo "       - Database connection failed (check PGHOST, PGPASSWORD)"
    echo "       - Container image could not be pulled from ghcr.io"
    echo "       - Port mismatch (must be PORT=8080 and WEBSITES_PORT=8080)"
    echo ""
    echo "    4. Restart and try again:"
    echo "       az webapp restart -g ${rg_name} -n ${app_name}"
    echo ""
    echo "    5. Tear down and start over:"
    echo "       az group delete -n ${rg_name} --yes"
    echo "       ./compass-setup.sh --deploy-type azure"
    exit 1
  else
    ok "Application is healthy!"
  fi

  # -----------------------------------------------------------------------
  # Step 5: Create admin user
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 5/5: Create Admin User${NC}"
  echo ""

  if [[ -n "$admin_email" && -n "$admin_pass" ]]; then
    info "Creating admin user via API..."

    # Step 1: Register user via the app's registration endpoint
    local reg_payload
    reg_payload=$(cat <<EOJSON
{"email":"${admin_email}","password":"${admin_pass}","fullName":"${admin_name}","organizationName":"${admin_org}"}
EOJSON
    )

    local reg_result
    reg_result=$(curl -sf -X POST "${app_url}/api/auth/register" \
      -H "Content-Type: application/json" \
      -d "$reg_payload" 2>/dev/null)

    if echo "$reg_result" | grep -qi "success\|userId"; then
      ok "User registered: ${admin_email}"
    else
      warn "Registration may have failed. Response: ${reg_result}"
      echo "  You can register manually at: ${app_url}/register"
    fi

    # Step 2: Verify email + set admin role directly in the database
    info "Verifying email and setting admin role..."
    if az postgres flexible-server execute \
      -n "$db_name" \
      -u "$db_user" \
      -p "$db_pass" \
      -d postgres \
      -q "UPDATE users SET email_verified = true, role = 'admin' WHERE email = '${admin_email}';" \
      -o none 2>/dev/null; then
      ok "Admin user verified: ${admin_email}"
    else
      warn "Could not auto-verify email. Log in to the Azure Portal and verify manually:"
      echo "  Azure Portal > PostgreSQL > compass DB > connect and run:"
      echo "  UPDATE users SET email_verified = true, role = 'admin' WHERE email = '${admin_email}';"
    fi
  fi

  # -----------------------------------------------------------------------
  # Done
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}${GREEN}====================================${NC}"
  echo -e "  ${BOLD}${GREEN}  ${PRODUCT_NAME} is deployed!${NC}"
  echo -e "  ${BOLD}${GREEN}====================================${NC}"
  echo ""
  echo "  URL:           ${app_url}"
  echo "  Admin email:   ${admin_email}"
  echo "  Resource group: ${rg_name}"
  echo ""
  echo "  Next steps:"
  echo "    1. Open ${app_url} in your browser and log in"
  echo "    2. Upload a dataset and run your first FAIR assessment"
  echo ""
  echo "  Manage:"
  echo "    View logs:   az webapp log tail -g ${rg_name} -n ${app_name}"
  echo "    Restart:     az webapp restart -g ${rg_name} -n ${app_name}"
  echo "    Tear down:   az group delete -n ${rg_name} --yes"
  echo ""
}

# ---------------------------------------------------------------------------
# Deploy: AWS Cloud (App Runner + RDS PostgreSQL)
# ---------------------------------------------------------------------------
deploy_aws() {
  echo ""
  echo -e "  ${BOLD}${GREEN}AWS Cloud Deployment${NC}"
  echo -e "  ${DIM}App Runner + RDS PostgreSQL${NC}"
  echo ""

  # Check for AWS CLI
  if ! command -v aws &>/dev/null; then
    fail "AWS CLI (aws) is not installed."
    echo ""
    echo "  Install it:"
    echo "    https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    echo ""
    echo "  Or run this installer from AWS CloudShell, which has aws pre-installed:"
    echo "    https://console.aws.amazon.com/cloudshell"
    exit 1
  fi
  ok "AWS CLI found: $(aws --version 2>/dev/null | head -1)"

  # Check AWS credentials
  if ! aws sts get-caller-identity &>/dev/null 2>&1; then
    fail "Not authenticated with AWS. Run 'aws configure' or set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY."
    exit 1
  fi

  local aws_account
  aws_account=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null)
  ok "AWS account: ${aws_account}"
  echo ""

  # -----------------------------------------------------------------------
  # Step 1: Collect configuration
  # -----------------------------------------------------------------------
  echo -e "  ${BOLD}Step 1/5: Configuration${NC}"
  echo ""

  local suffix
  suffix=$(openssl rand -hex 3)

  local region app_name db_identifier
  echo -n "  AWS region [us-east-1]: "
  read -r region
  region="${region:-us-east-1}"

  echo -n "  Service name [compass-${suffix}]: "
  read -r app_name
  app_name="${app_name:-compass-${suffix}}"

  db_identifier="${app_name}-db"

  # Database credentials
  local db_user db_pass
  echo -n "  Database admin username [compassadmin]: "
  read -r db_user
  db_user="${db_user:-compassadmin}"

  echo -n "  Database admin password (min 8 chars, Enter to auto-generate): "
  read -rs db_pass
  echo ""
  if [[ -z "$db_pass" ]]; then
    db_pass="Cp$(openssl rand -base64 24 | tr -d '/+=!@#$%^&*()' | head -c 20)z9"
    info "Auto-generated database password"
  fi

  # Admin user
  local admin_email admin_name admin_org admin_pass
  echo ""
  echo -e "  ${BOLD}Admin account (for logging into DATA Compass):${NC}"
  echo -n "  Admin email: "
  read -r admin_email
  echo -n "  Admin full name: "
  read -r admin_name
  echo -n "  Organization name: "
  read -r admin_org
  echo -n "  Admin password (min 8 chars): "
  read -rs admin_pass
  echo ""

  # Optional: API key
  local ai_key=""
  echo ""
  echo -n "  Anthropic API key (sk-ant-..., Enter to skip): "
  read -rs ai_key
  echo ""

  # Generate secrets
  local jwt_secret mfa_key integration_key
  jwt_secret=$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)
  mfa_key=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
  integration_key=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

  echo ""
  echo -e "  ${BOLD}Configuration summary:${NC}"
  echo "    Region:          ${region}"
  echo "    Service:         ${app_name}"
  echo "    Database:        ${db_identifier}"
  echo "    Admin email:     ${admin_email}"
  echo ""
  echo -n "  Proceed? [Y/n]: "
  read -r confirm
  if [[ "$confirm" =~ ^[Nn]$ ]]; then
    info "Cancelled."
    exit 0
  fi

  # -----------------------------------------------------------------------
  # Step 2: Create RDS PostgreSQL
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 2/5: Create RDS PostgreSQL${NC}"
  echo ""

  info "Creating RDS PostgreSQL instance (this takes 5-10 minutes)..."
  if ! aws rds create-db-instance \
    --db-instance-identifier "$db_identifier" \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version 16 \
    --master-username "$db_user" \
    --master-user-password "$db_pass" \
    --allocated-storage 20 \
    --storage-type gp3 \
    --publicly-accessible \
    --backup-retention-period 7 \
    --region "$region" \
    --no-multi-az \
    --output text 2>/dev/null; then
    fail "Failed to create RDS instance."
    exit 1
  fi

  info "Waiting for RDS instance to become available..."
  aws rds wait db-instance-available \
    --db-instance-identifier "$db_identifier" \
    --region "$region" 2>/dev/null
  ok "RDS instance: ${db_identifier}"

  # Get the endpoint
  local db_host
  db_host=$(aws rds describe-db-instances \
    --db-instance-identifier "$db_identifier" \
    --region "$region" \
    --query "DBInstances[0].Endpoint.Address" \
    --output text 2>/dev/null)
  ok "Database endpoint: ${db_host}"

  # -----------------------------------------------------------------------
  # Step 3: Create App Runner service
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 3/5: Create App Runner Service${NC}"
  echo ""

  # Build environment variables JSON
  local env_vars
  env_vars=$(cat <<ENVJSON
[
  {"Name":"NODE_ENV","Value":"production"},
  {"Name":"PORT","Value":"8080"},
  {"Name":"PGHOST","Value":"${db_host}"},
  {"Name":"PGPORT","Value":"5432"},
  {"Name":"PGDATABASE","Value":"postgres"},
  {"Name":"PGUSER","Value":"${db_user}"},
  {"Name":"PGPASSWORD","Value":"${db_pass}"},
  {"Name":"PGSSL","Value":"require"},
  {"Name":"PGSSLMODE","Value":"require"},
  {"Name":"JWT_SECRET","Value":"${jwt_secret}"},
  {"Name":"MFA_ENCRYPTION_KEY","Value":"${mfa_key}"},
  {"Name":"INTEGRATION_ENCRYPTION_KEY","Value":"${integration_key}"},
  {"Name":"RUN_MIGRATIONS","Value":"true"},
  {"Name":"TRUST_PROXY","Value":"true"},
  {"Name":"LOG_FORMAT","Value":"json"},
  {"Name":"LOG_LEVEL","Value":"info"},
  {"Name":"STORAGE_BACKEND","Value":"postgres"},
  {"Name":"FILE_STORAGE_BACKEND","Value":"postgres"},
  {"Name":"ENABLE_INPUT_VALIDATION","Value":"true"},
  {"Name":"ENABLE_RATE_LIMITING","Value":"true"},
  {"Name":"ENABLE_SECURITY_HEADERS","Value":"true"},
  {"Name":"ENABLE_ERROR_SANITIZATION","Value":"true"}
ENVJSON
  )

  # Add license if provided
  if [[ -n "$LICENSE_B64" ]]; then
    env_vars="${env_vars},
  {\"Name\":\"COMPASS_LICENSE_B64\",\"Value\":\"${LICENSE_B64}\"},
  {\"Name\":\"COMPASS_LICENSE_REQUIRED\",\"Value\":\"true\"}"
  else
    env_vars="${env_vars},
  {\"Name\":\"COMPASS_LICENSE_REQUIRED\",\"Value\":\"false\"}"
  fi

  # Add AI key if provided
  if [[ -n "$ai_key" ]]; then
    env_vars="${env_vars},
  {\"Name\":\"ANTHROPIC_API_KEY\",\"Value\":\"${ai_key}\"}"
  fi

  env_vars="${env_vars}
]"

  info "Creating App Runner service..."
  local create_output
  create_output=$(aws apprunner create-service \
    --service-name "$app_name" \
    --source-configuration "{
      \"ImageRepository\": {
        \"ImageIdentifier\": \"${DOCKER_IMAGE}:${VERSION}\",
        \"ImageConfiguration\": {
          \"Port\": \"8080\",
          \"RuntimeEnvironmentVariables\": ${env_vars}
        },
        \"ImageRepositoryType\": \"ECR_PUBLIC\"
      },
      \"AutoDeploymentsEnabled\": false
    }" \
    --instance-configuration "{
      \"Cpu\": \"1024\",
      \"Memory\": \"2048\"
    }" \
    --health-check-configuration "{
      \"Protocol\": \"HTTP\",
      \"Path\": \"/health/live\",
      \"Interval\": 10,
      \"Timeout\": 5,
      \"HealthyThreshold\": 1,
      \"UnhealthyThreshold\": 5
    }" \
    --region "$region" \
    --output json 2>/dev/null) || { fail "Failed to create App Runner service."; exit 1; }

  local service_arn
  service_arn=$(echo "$create_output" | grep -o '"ServiceArn": *"[^"]*"' | cut -d'"' -f4)
  ok "App Runner service created: ${app_name}"

  # -----------------------------------------------------------------------
  # Step 4: Wait for service to become running
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 4/5: Start Application${NC}"
  echo ""

  info "Waiting for App Runner service to start (this takes 3-8 minutes)..."
  info "First start runs database migrations."
  echo ""

  local attempts=0
  local max_attempts=60
  while [ $attempts -lt $max_attempts ]; do
    local status
    status=$(aws apprunner describe-service \
      --service-arn "$service_arn" \
      --region "$region" \
      --query "Service.Status" \
      --output text 2>/dev/null || echo "UNKNOWN")

    if [[ "$status" == "RUNNING" ]]; then
      break
    elif [[ "$status" == "CREATE_FAILED" ]]; then
      fail "App Runner service failed to start."
      echo ""
      echo "  Check the service logs in the AWS Console:"
      echo "    AWS Console > App Runner > ${app_name} > Logs"
      exit 1
    fi

    attempts=$((attempts + 1))
    printf "\r  Waiting... status=%s (%d/%d)" "$status" "$attempts" "$max_attempts"
    sleep 10
  done
  printf "\r\033[K"

  # Get the service URL
  local app_url
  app_url=$(aws apprunner describe-service \
    --service-arn "$service_arn" \
    --region "$region" \
    --query "Service.ServiceUrl" \
    --output text 2>/dev/null)
  app_url="https://${app_url}"

  if [ $attempts -ge $max_attempts ]; then
    fail "App Runner service did not start within 10 minutes."
    echo ""
    echo "  Check the service logs in the AWS Console:"
    echo "    AWS Console > App Runner > ${app_name} > Logs"
    echo ""
    echo "  Tear down:"
    echo "    aws apprunner delete-service --service-arn ${service_arn} --region ${region}"
    echo "    aws rds delete-db-instance --db-instance-identifier ${db_identifier} --skip-final-snapshot --region ${region}"
    exit 1
  fi

  ok "Application is running at: ${app_url}"

  # -----------------------------------------------------------------------
  # Step 5: Create admin user
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Step 5/5: Create Admin User${NC}"
  echo ""

  if [[ -n "$admin_email" && -n "$admin_pass" ]]; then
    info "Creating admin user via API..."

    local reg_payload
    reg_payload=$(cat <<EOJSON
{"email":"${admin_email}","password":"${admin_pass}","fullName":"${admin_name}","organizationName":"${admin_org}"}
EOJSON
    )

    local reg_result
    reg_result=$(curl -sf -X POST "${app_url}/api/auth/register" \
      -H "Content-Type: application/json" \
      -d "$reg_payload" 2>/dev/null)

    if echo "$reg_result" | grep -qi "success\|userId"; then
      ok "User registered: ${admin_email}"
    else
      warn "Registration may have failed. Response: ${reg_result}"
      echo "  You can register manually at: ${app_url}/register"
    fi

    # Note: For RDS, we can't easily run SQL directly from the installer.
    # The user needs to verify their email or use the app's admin CLI.
    warn "To set admin role, connect to your RDS database and run:"
    echo "  psql \"host=${db_host} user=${db_user} dbname=postgres sslmode=require\""
    echo "  UPDATE users SET email_verified = true, role = 'admin' WHERE email = '${admin_email}';"
  fi

  # -----------------------------------------------------------------------
  # Done
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}${GREEN}====================================${NC}"
  echo -e "  ${BOLD}${GREEN}  ${PRODUCT_NAME} is deployed!${NC}"
  echo -e "  ${BOLD}${GREEN}====================================${NC}"
  echo ""
  echo "  URL:           ${app_url}"
  echo "  Admin email:   ${admin_email}"
  echo "  Region:        ${region}"
  echo ""
  echo "  Next steps:"
  echo "    1. Open ${app_url} in your browser and log in"
  echo "    2. Upload a dataset and run your first FAIR assessment"
  echo ""
  echo "  Manage:"
  echo "    View logs:   AWS Console > App Runner > ${app_name} > Logs"
  echo "    Tear down:"
  echo "      aws apprunner delete-service --service-arn ${service_arn} --region ${region}"
  echo "      aws rds delete-db-instance --db-instance-identifier ${db_identifier} --skip-final-snapshot --region ${region}"
  echo ""
}

# ---------------------------------------------------------------------------
# Deploy: Docker Compose (existing flow)
# ---------------------------------------------------------------------------
deploy_docker() {
  # -----------------------------------------------------------------------
  # Step 1: Prerequisites
  # -----------------------------------------------------------------------
  echo ""
  echo -e "  ${BOLD}Docker Compose Deployment${NC}"
  echo ""
  echo -e "  ${BOLD}Step 1/4: Prerequisites${NC}"
  echo ""

  check_root "$@"
  detect_downloader
  ok "Downloader: ${DOWNLOADER}"
  check_docker
  check_compose
  check_resources
  echo ""

  # -----------------------------------------------------------------------
  # Step 2: Download deploy bundle
  # -----------------------------------------------------------------------
  echo -e "  ${BOLD}Step 2/4: Download${NC}"
  echo ""

  EXTRACT_DIR=$(mktemp -d /tmp/compass-install.XXXXXX)
  BUNDLE_FILE="${EXTRACT_DIR}/bundle.tar.gz"

  info "Downloading deploy bundle (v${VERSION})..."
  echo -e "  ${DIM}${BUNDLE_URL}${NC}"
  download_file "$BUNDLE_URL" "$BUNDLE_FILE"
  ok "Deploy bundle downloaded"

  # Verify checksum
  info "Verifying integrity..."
  CHECKSUM_FILE="${EXTRACT_DIR}/checksum.sha256"
  if download_file "$CHECKSUM_URL" "$CHECKSUM_FILE" 2>/dev/null; then
    EXPECTED=$(cut -d' ' -f1 < "$CHECKSUM_FILE")
    ACTUAL=$(sha256sum "$BUNDLE_FILE" | cut -d' ' -f1)
    if [[ "$EXPECTED" == "$ACTUAL" ]]; then
      ok "SHA-256 checksum verified"
    else
      fail "Checksum mismatch! File may be corrupted."
      fail "  Expected: ${EXPECTED}"
      fail "  Actual:   ${ACTUAL}"
      rm -rf "$EXTRACT_DIR"
      exit 1
    fi
  else
    warn "Could not download checksum file. Skipping verification."
  fi
  echo ""

  # -----------------------------------------------------------------------
  # Step 3: Extract
  # -----------------------------------------------------------------------
  echo -e "  ${BOLD}Step 3/4: Extract${NC}"
  echo ""

  tar xzf "$BUNDLE_FILE" -C "$EXTRACT_DIR" --strip-components=1
  rm -f "$BUNDLE_FILE" "$CHECKSUM_FILE"
  ok "Extracted to ${EXTRACT_DIR}"
  echo ""

  # -----------------------------------------------------------------------
  # Step 4: Launch setup wizard
  # -----------------------------------------------------------------------
  echo -e "  ${BOLD}Step 4/4: Launch Setup Wizard${NC}"
  echo ""

  if [[ -f "${EXTRACT_DIR}/setup.sh" ]]; then
    info "Handing off to setup wizard..."
    echo ""
    cd "$EXTRACT_DIR"
    exec bash ./setup.sh "${SETUP_ARGS[@]}"
  elif [[ -f "${EXTRACT_DIR}/deploy/install.sh" ]]; then
    info "Handing off to installer..."
    echo ""
    cd "$EXTRACT_DIR"
    exec bash ./deploy/install.sh --install-dir "$INSTALL_DIR" "${SETUP_ARGS[@]}"
  else
    fail "Setup wizard not found in bundle. The download may be corrupted."
    fail "Contents of ${EXTRACT_DIR}:"
    ls -la "$EXTRACT_DIR" 2>/dev/null || true
    rm -rf "$EXTRACT_DIR"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Deploy: Air-gapped (offline)
# ---------------------------------------------------------------------------
deploy_airgap() {
  echo ""
  echo -e "  ${BOLD}${YELLOW}Air-Gapped Deployment${NC}"
  echo ""
  echo "  Air-gapped installation requires the offline deployment package."
  echo ""
  echo "  1. Download the offline package (~700 MB) on a machine with internet:"
  echo "     https://compassfordata.com/download"
  echo "     Click 'Air-gapped / offline installation'"
  echo ""
  echo "  2. Transfer the package to your air-gapped server"
  echo "     (USB drive, secure file transfer, or other approved method)"
  echo ""
  echo "  3. On the air-gapped server:"
  echo "     tar xzf compass-deployment-v${VERSION}.tar.gz"
  echo "     cd compass-deployment-v${VERSION}"
  echo "     sudo ./setup.sh"
  echo ""
  echo "  See the Administrator Reference for full details."
  echo ""
  exit 0
}

# ---------------------------------------------------------------------------
# Main flow
# ---------------------------------------------------------------------------
main() {
  show_banner

  # Dry-run mode
  if [[ "$DRY_RUN" == true ]]; then
    echo -e "  ${BOLD}Dry-run: Installation plan${NC}"
    echo ""
    echo "  Deploy type: ${DEPLOY_TYPE:-interactive}"
    echo "  Bundle URL:  ${BUNDLE_URL}"
    echo "  Install dir: ${INSTALL_DIR}"
    echo "  Channel:     ${CHANNEL}"
    echo ""
    echo -e "  ${YELLOW}No changes were made.${NC}"
    exit 0
  fi

  # Validate license before deployment
  validate_license

  # Determine deployment type
  local deploy_type="${DEPLOY_TYPE}"

  if [[ -z "$deploy_type" ]]; then
    if [[ "$SILENT" == true ]]; then
      fail "--deploy-type is required in silent mode."
      fail "Options: azure, aws, docker, airgap"
      exit 1
    fi
    deploy_type=$(show_deploy_menu)
  fi

  # Dispatch
  case "$deploy_type" in
    azure)   deploy_azure ;;
    aws)     deploy_aws ;;
    docker)  deploy_docker "$@" ;;
    airgap)  deploy_airgap ;;
    quit)
      echo ""
      info "Goodbye!"
      exit 0
      ;;
    *)
      fail "Unknown deployment type: ${deploy_type}"
      fail "Options: azure, aws, docker, airgap"
      exit 1
      ;;
  esac
}

main "$@"
