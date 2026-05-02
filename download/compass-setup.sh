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
VERSION="1.1.4"
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
CONFIG_FILE=""
VALIDATE_ONLY=false
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
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    --validate-only)
      VALIDATE_ONLY=true
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
      echo "  --config FILE           Run non-interactively from a declarative config"
      echo "                          file (see compass-install.env.template)"
      echo "  --validate-only         Validate --config and exit; no host changes."
      echo "                          Use this to iterate on the config file before"
      echo "                          triggering an install."
      echo "  --deploy-type TYPE      Deployment type: docker, airgap, azure"
      echo "  --license FILE          License file path (or Enter for 30-day evaluation)"
      echo "  --dry-run               Preview install plan without changes"
      echo "  --silent                Unattended install (requires COMPASS_* env vars)"
      echo "  --install-dir DIR       Installation directory (default: /opt/compass)"
      echo "  --channel CHANNEL       Release channel: stable, beta (default: stable)"
      echo "  -h, --help              Show this help"
      echo ""
      echo "Deployment types:"
      echo "  docker     Docker Compose on a Linux host (recommended for pharma;"
      echo "             use this for AWS EC2, on-prem, or any self-managed VM)"
      echo "  airgap     Offline install using the pre-built image bundle"
      echo "  azure      Azure App Service + managed PostgreSQL (provisions"
      echo "             Azure resources in your tenant)"
      echo ""
      echo "  Note: AWS App Runner support was removed in v1.1.4 (architecturally"
      echo "  broken). For AWS deployments, use 'docker' on an EC2 instance."
      echo ""
      echo "Recommended: --config FILE — fills in all answers up front, validates"
      echo "before any host change, runs non-interactively. See deploy/QUICK_START.md."
      echo ""
      echo "Silent mode env vars (used when --silent without --config):"
      echo "  COMPASS_ADMIN_EMAIL, COMPASS_ADMIN_PASSWORD,"
      echo "  COMPASS_ADMIN_NAME, COMPASS_ADMIN_ORG"
      echo "Optional: COMPASS_AI_KEY, COMPASS_PROXY_URL, COMPASS_LICENSE_FILE"
      echo ""
      echo "Examples:"
      echo "  # Recommended: declarative config (validated up front, scriptable):"
      echo "  sudo ./compass-setup.sh --config /path/to/compass-install.env"
      echo ""
      echo "  # Interactive install:"
      echo "  ./compass-setup.sh"
      echo ""
      echo "  # Docker Compose on your server (sudo required):"
      echo "  sudo ./compass-setup.sh --deploy-type docker"
      echo ""
      echo "  # Silent Docker Compose install (legacy COMPASS_* env path):"
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
# Apply --config file (collect-then-execute pattern)
# ---------------------------------------------------------------------------
# When --config FILE is provided, validate every field in the file BEFORE any
# host change, then translate the schema variables into the COMPASS_* env vars
# the existing silent-mode wizard already understands. This makes --config
# additive: nothing in install.sh / lib/config-gen.sh has to change.
# ---------------------------------------------------------------------------

apply_config_file() {
  local cfg="$CONFIG_FILE"

  if [[ -z "$cfg" ]]; then
    return 0   # no --config; interactive flow
  fi

  if [[ ! -f "$cfg" ]]; then
    fail "Config file not found: ${cfg}"
    exit 1
  fi

  # Locate validator. compass-setup.sh ships in two forms:
  #   1. Marketing-site download (single file) — no adjacent lib/, fall back
  #      to minimal inline validation; full validation runs again later after
  #      the bundle is extracted.
  #   2. Inside the bundle / source repo — adjacent lib/env-validator.sh, full
  #      validation right here.
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local validator="${script_dir}/lib/env-validator.sh"

  if [[ -f "$validator" ]]; then
    # shellcheck disable=SC1090
    . "$validator"
    if ! validate_install_env "$cfg"; then
      fail "Config validation failed; aborting before any host change."
      exit 2
    fi
  else
    # Minimal inline validation — just enough to fast-fail on the common
    # errors before we download a 100MB bundle. Full validator runs after
    # extraction.
    info "Pre-validating config (basic checks; full validation runs after bundle extraction)..."
    if ! bash -n "$cfg" 2>/dev/null; then
      fail "Config file has bash syntax errors: ${cfg}"
      exit 2
    fi
    # shellcheck disable=SC1090
    . "$cfg"
    local missing=()
    [[ -z "${DEPLOYMENT_TYPE:-}" ]]      && missing+=("DEPLOYMENT_TYPE")
    [[ -z "${ADMIN_EMAIL:-}" ]]          && missing+=("ADMIN_EMAIL")
    [[ -z "${AI_PROVIDER_PRIMARY:-}" ]]  && missing+=("AI_PROVIDER_PRIMARY")
    if (( ${#missing[@]} > 0 )); then
      fail "Config file is missing required fields:"
      printf '    - %s\n' "${missing[@]}"
      exit 2
    fi
    case "${DEPLOYMENT_TYPE:-}" in
      docker|air-gapped|azure) ;;
      aws|aws-apprunner)
        fail "DEPLOYMENT_TYPE='${DEPLOYMENT_TYPE}' is not supported."
        fail "AWS App Runner was removed in v1.1.4 (architecturally broken)."
        fail "For AWS deployments, use DEPLOYMENT_TYPE=docker on an EC2 instance."
        exit 2 ;;
      *)
        fail "DEPLOYMENT_TYPE='${DEPLOYMENT_TYPE}' invalid; allowed: docker, air-gapped, azure"
        exit 2 ;;
    esac
  fi

  # ----- Translate schema vars -> COMPASS_* env vars used by the wizard -----
  # The validator (when run) already exported ADMIN_PASSWORD, ANTHROPIC_API_KEY,
  # OPENAI_API_KEY, etc. The wizard expects them under COMPASS_* names.
  export COMPASS_ADMIN_EMAIL="${ADMIN_EMAIL:-}"
  export COMPASS_ADMIN_NAME="${ADMIN_NAME:-}"
  export COMPASS_ADMIN_ORG="${ADMIN_ORG:-}"
  export COMPASS_ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
  export COMPASS_AI_PROVIDER="${AI_PROVIDER_PRIMARY:-}"
  export COMPASS_ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
  export COMPASS_OPENAI_KEY="${OPENAI_API_KEY:-}"
  # Legacy compatibility — single-key env that the wizard also reads.
  if [[ "${AI_PROVIDER_PRIMARY:-}" == "anthropic" ]]; then
    export COMPASS_AI_KEY="${ANTHROPIC_API_KEY:-}"
  elif [[ "${AI_PROVIDER_PRIMARY:-}" == "openai" ]]; then
    export COMPASS_AI_KEY="${OPENAI_API_KEY:-}"
  fi
  export COMPASS_PROXY_URL="${PROXY_URL:-}"
  export COMPASS_LICENSE_FILE="${LICENSE_FILE:-}"

  # Update the bootstrap's own variables
  DEPLOY_TYPE="${DEPLOYMENT_TYPE}"
  INSTALL_DIR="${INSTALL_DIR:-/opt/compass}"
  LICENSE_FILE="${LICENSE_FILE:-}"
  SILENT=true
  SETUP_ARGS+=("--silent")

  ok "Config file accepted: ${cfg}"

  # Sanitized configuration summary for visual confirmation. Always shown so
  # the operator can spot a wrong env-var pointing at the wrong key, etc.
  if [[ "$(type -t print_config_summary 2>/dev/null)" == "function" ]]; then
    print_config_summary
  fi

  # --validate-only: stop here, exit clean. No host change attempted.
  if [[ "$VALIDATE_ONLY" == true ]]; then
    ok "Validation passed. Re-run without --validate-only to perform the install."
    exit 0
  fi

  ok "Running non-interactively with values from config."
}

# Apply config immediately so DEPLOY_TYPE / INSTALL_DIR / SILENT reflect
# the config before any other logic runs.
apply_config_file

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
# Privileges check — supports two install postures:
#
#   (a) Classic:           operator runs with sudo. EUID=0 → pass.
#   (b) Path B-Enterprise: cloud team pre-provisions ${INSTALL_DIR} (chowned
#                          to operator) and adds operator to the docker group.
#                          Operator then runs *without* sudo.
#
# The installer needs (at most) write access to INSTALL_DIR and docker group
# membership. Root is not strictly required by any operation in install.sh
# now that Docker is a strict prerequisite (the auto-install path was removed
# in v1.1.4). This check enforces that necessary-condition without forcing
# the legacy root-only posture on enterprise customers whose policy forbids
# operator-level sudo.
check_install_privileges() {
  # Pass if the installer can write to INSTALL_DIR (chowned to operator)…
  if [[ -w "$INSTALL_DIR" ]]; then
    ok "Install dir writable as $(id -un 2>/dev/null || echo "${USER:-unknown}"): ${INSTALL_DIR}"
    return 0
  fi

  # …or INSTALL_DIR doesn't exist yet but the parent is writable (we'll mkdir it)…
  if [[ ! -e "$INSTALL_DIR" ]] && [[ -w "$(dirname "$INSTALL_DIR")" ]]; then
    ok "Will create ${INSTALL_DIR} (parent is writable as $(id -un 2>/dev/null || echo "${USER:-unknown}"))"
    return 0
  fi

  # …or we're root.
  if [[ $EUID -eq 0 ]]; then
    ok "Running as root"
    return 0
  fi

  # Otherwise we have neither write access nor root.
  fail "Cannot proceed: ${INSTALL_DIR} is not writable, and you are not root."
  echo ""
  echo "  Two ways to satisfy this check:"
  echo ""
  echo "  (a) Classic — re-run with sudo:"
  echo "        sudo $0 $*"
  echo ""
  echo "  (b) Path B-Enterprise — run the one-time cloud-team setup first,"
  echo "      then re-run this installer *without* sudo:"
  echo "        sudo install -d -o \"\$USER\" -g \"\$USER\" ${INSTALL_DIR}"
  echo "        sudo usermod -aG docker \"\$USER\""
  echo "        newgrp docker         # or open a new shell"
  echo "        $0 $*"
  echo ""
  echo "      See deploy/QUICK_START.md → 'Path B-Enterprise (sudo phase split)'."
  exit 1
}

# Backwards-compat alias (kept so out-of-tree wrappers calling check_root
# continue to work). Internal call sites should use check_install_privileges.
check_root() { check_install_privileges "$@"; }

check_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker installed: $(docker --version 2>/dev/null | head -1)"
    return 0
  fi

  fail "Docker Engine is required and not detected on PATH."
  echo ""
  echo "  Docker is a strict prerequisite for ${PRODUCT_NAME}. The installer no"
  echo "  longer auto-installs Docker; that decision belongs with your IT or"
  echo "  cloud team, who will validate it against your organization's baseline."
  echo ""
  echo "  Two options:"
  echo "    1. Install Docker per your organization's standard process, then"
  echo "       re-run this installer."
  echo "    2. Run our vetted Docker install recipe (review with your team first):"
  echo "         sudo bash deploy/install-docker.sh"
  echo "       and then re-run this installer."
  echo ""
  echo "  Required: Docker Engine >= 24.0 and Docker Compose v2 plugin."
  echo "  Reference: https://docs.docker.com/engine/install/"
  exit 1
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
  echo -e "    ${YELLOW}1)${NC}  ${BOLD}Docker Compose${NC}     Install on your own Linux server" >&2
  echo -e "                          ${DIM}Recommended for most pharma deployments. Full control.${NC}" >&2
  echo "" >&2
  echo -e "    ${YELLOW}2)${NC}  ${BOLD}Air-gapped${NC}         Offline install (no internet required)" >&2
  echo -e "                          ${DIM}For secure environments with no outbound internet.${NC}" >&2
  echo "" >&2
  echo -e "    ${GREEN}3)${NC}  ${BOLD}Azure Cloud${NC}        Azure App Service + managed PostgreSQL" >&2
  echo -e "                          ${DIM}Provisions Azure resources in your tenant.${NC}" >&2
  echo "" >&2
  echo -e "    ${DIM}q)${NC}  ${DIM}Quit${NC}" >&2
  echo "" >&2
  echo -e "    ${DIM}(AWS deployments: pick option 1 — install on an EC2 instance.${NC}" >&2
  echo -e "    ${DIM} The dedicated AWS App Runner path was removed in v1.1.4.)${NC}" >&2
  echo "" >&2

  while true; do
    echo -n "  Select [1-3/q]: " >&2
    read -r choice
    case "$choice" in
      1) echo "docker"; return ;;
      2) echo "airgap"; return ;;
      3) echo "azure";  return ;;
      q|Q) echo "quit"; return ;;
      *) echo -e "  ${RED}Invalid choice. Enter 1, 2, 3, or q.${NC}" >&2 ;;
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

  check_install_privileges "$@"
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
    aws|aws-apprunner)
      fail "AWS App Runner deployment was removed in v1.1.4."
      fail "It was architecturally broken: App Runner cannot pull from GHCR."
      fail "For AWS deployments, install on an EC2 instance via the docker path:"
      fail "  ./compass-setup.sh --deploy-type docker"
      exit 1
      ;;
    docker)  deploy_docker "$@" ;;
    airgap|air-gapped)  deploy_airgap ;;
    quit)
      echo ""
      info "Goodbye!"
      exit 0
      ;;
    *)
      fail "Unknown deployment type: ${deploy_type}"
      fail "Options: docker, airgap, azure"
      exit 1
      ;;
  esac
}

main "$@"
