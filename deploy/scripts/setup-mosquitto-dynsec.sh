#!/bin/sh
set -eu

# ==============================================================================
# Inisialisasi Mosquitto Dynamic Security (Fase Pendaftaran Akun Otomatis dari Web)
# ==============================================================================
# Menyiapkan database dinamis Mosquitto (/mosquitto/data/dynamic-security.json)
# dan mendaftarkan akun admin yang digunakan backend web untuk membuat akun device.
#
# Penggunaan:
#   chmod +x deploy/scripts/setup-mosquitto-dynsec.sh
#   ./deploy/scripts/setup-mosquitto-dynsec.sh <ADMIN_PASSWORD> <CONTAINER_NAME>
# ==============================================================================

ADMIN_PASS="${1:-}"
CONTAINER_NAME="${2:-esniffer-mosquitto}"

if [ -z "$ADMIN_PASS" ]; then
  echo "Gunakan: $0 <ADMIN_PASSWORD> [NAMA_CONTAINER_MOSQUITTO]"
  echo "Contoh:  $0 SuperSecretAdminPass123 esniffer-mosquitto"
  exit 1
fi

echo "==> Menginisialisasi dynamic-security.json pada container '$CONTAINER_NAME'..."

docker exec -i "$CONTAINER_NAME" sh -c "
  mosquitto_ctrl dynsec init /mosquitto/data/dynamic-security.json admin '$ADMIN_PASS' &&
  chown mosquitto:mosquitto /mosquitto/data/dynamic-security.json &&
  chmod 600 /mosquitto/data/dynamic-security.json
"

echo "==> Inisialisasi berhasil! Tambahkan konfigurasi berikut ke mosquitto.conf:"
echo ""
echo "    plugin /usr/lib/mosquitto_dynamic_security.so"
echo "    plugin_opt_config_file /mosquitto/data/dynamic-security.json"
echo ""
echo "==> Setel environment berikut di file .env server Anda:"
echo "    MQTT_ADMIN_USERNAME=admin"
echo "    MQTT_ADMIN_PASSWORD=$ADMIN_PASS"
echo ""
echo "Selesai! Web dashboard sekarang dapat mendaftarkan akun device secara otomatis."
