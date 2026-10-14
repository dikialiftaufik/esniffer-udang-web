// Isi ulang kredensial Wi-Fi/MQTT secara lokal sebelum upload. Jangan commit firmware dengan rahasia.
/*
  E-SNIFFER / STAS-RG — ESP32-S3 + NEXTION + MQTTS (schema v1)
  Migrasi komunikasi ke broker Mosquitto, TANPA mengubah logika sensor
  atau nama komponen Nextion dari firmware sebelumnya.

  Libraries (Arduino Library Manager):
    - DHT sensor library (Adafruit) + Adafruit Unified Sensor
    - ArduinoJson 7 (Benoit Blanchon)
    - MQTT (by Joel Gaehwiler / 256dpi, arduino-mqtt >= 2.5.2)
  Board: esp32 by Espressif Systems, ESP32S3 Dev Module (sesuaikan hardware)

  KONFIGURASI WAJIB: ganti kredensial placeholder sebelum upload.
  JANGAN commit password Wi-Fi / MQTT ke repo publik.
  TLS verification AKTIF; tidak menggunakan setInsecure().
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <MQTT.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>
#include <math.h>
#include <esp_system.h>
#include <sys/time.h>
// =============================================================
// KONFIGURASI KONEKSI - EDIT BAGIAN INI SEBELUM UPLOAD
// =============================================================
// Konfigurasi Wi-Fi, MQTT, dan TLS (semua di file ini).
// EDIT DI SINI, jangan commit firmware yang sudah berisi password.
// Rotasi password Wi-Fi dan MQTT lama karena telah terbuka dalam source sebelumnya.
static const char WIFI_SSID[] = "ISI_WIFI_SSID";
static const char WIFI_PASSWORD[] = "ISI_WIFI_PASSWORD";

// Harus hostname DNS-only (bukan Cloudflare HTTP proxy) yang mengarah ke VPS.
// Sertifikat broker HARUS berlaku untuk hostname ini (SAN cocok).
static const char MQTT_BROKER_HOST[] = "mqtt.stas-rg.com";
static const int MQTT_BROKER_PORT = 8883;
static const char DEVICE_ID[] = "esp32-001";
static const char MQTT_PASSWORD[] = "ISI_MQTT_DEVICE_PASSWORD";

// ISRG Root X1: root CA tepercaya untuk rantai default Let's Encrypt.
// Mosquitto perlu menyajikan fullchain.pem untuk hostname mqtt.stas-rg.com.
// Gunakan root CA (bukan leaf certificate) agar renewal tetap didukung.
// Jangan memakai tls.setInsecure().
static const char MQTT_ROOT_CA_PEM[] = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";



// Hardware asli
#define MQ137_PIN 3
#define MQ136_PIN 2
#define MQ4_PIN   1
#define DHT_PIN   4
#define DHT_TYPE  DHT22
#define LCD_RX_PIN 18
#define LCD_TX_PIN 17

// Kalibrasi asli: untuk tampilan Nextion SAJA; nilai MQTT adalah RAW ADC.
#define VC_SUPPLY 5.0f
#define V_REF     3.3f
#define ADC_MAX   4095.0f
#define RL_MQ137  1.0f
#define RL_MQ136  0.76f
#define RL_MQ4    2.0f
float R0_MQ137 = 25.0f;
float R0_MQ136 = 15.0f;
float R0_MQ4   = 18.0f;
#define MQ137_M -0.263f
#define MQ137_B  0.42f
#define MQ136_M -0.651f
#define MQ136_B  0.903f
#define MQ4_M   -0.356f
#define MQ4_B    1.069f

// Interval sampling MQ 250 ms, telemetry 500 ms, layar 500 ms; DHT22 tetap 2 detik
constexpr uint32_t SENSOR_INTERVAL_MS = 250;
constexpr uint32_t DHT_INTERVAL_MS = 2000;
constexpr uint32_t CLOCK_INTERVAL_MS = 1000;
constexpr uint32_t NEXTION_SENSOR_INTERVAL_MS = 500;
constexpr uint32_t SERIAL_INTERVAL_MS = 5000;
constexpr uint32_t TELEMETRY_INTERVAL_MS = 500;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 15000;
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t MQTT_RETRY_MS = 8000;
constexpr uint32_t NTP_RETRY_INTERVAL_MS = 30000; // Ulangi SNTP tiap 30 dtk selama jam belum valid
constexpr uint32_t APP_ACK_TIMEOUT_MS = 12000;
constexpr int MQ_ADC_SAMPLE_COUNT = 10;
constexpr uint32_t MQ_ADC_SAMPLE_DELAY_MS = 1;

DHT dht(DHT_PIN, DHT_TYPE);
HardwareSerial lcdSerial(1);
// 1 = TLS port 8883 (broker VPS). 0 = plain MQTT port 1883 (broker lokal,
// tanpa sertifikat). Ganti ke 0 HANYA untuk mode lokal, jangan commit.
#define MQTT_USE_TLS 1
#if MQTT_USE_TLS
WiFiClientSecure tls;
#else
WiFiClient plain;
#endif
MQTTClient mqtt(1024, 1024); // Cukup untuk MQTT CONNECT+LWT dan JSON ACK

float temperature = NAN, humidity = NAN;
int rawMQ137 = 0, rawMQ136 = 0, rawMQ4 = 0;
float rsMQ137 = NAN, rsMQ136 = NAN, rsMQ4 = NAN;
float ppmMQ137 = NAN, ppmMQ136 = NAN, ppmMQ4 = NAN;
int currentPage = 0;

String bootId, sessionId, mqttClientId, topicTelemetry, topicStatus, topicAck;
uint32_t connectionSequence = 0;
uint32_t statusSequence = 0;
uint32_t telemetrySequence = 0;
uint32_t lastSensorTime = 0, lastDhtTime = 0, lastClockTime = 0;
uint32_t lastNextionSensorTime = 0;
uint32_t lastMqSampleUptimeMs = 0;
String lastMqSampleAtUtc;
uint32_t lastSerialTime = 0, lastTelemetryTime = 0, lastHeartbeatTime = 0;
uint32_t lastWifiAttempt = 0, lastMqttAttempt = 0;
bool ntpConfigured = false;
bool ntpSyncAnnounced = false;
uint32_t lastNtpAttempt = 0;
bool wifiAnnounced = false;

// Hanya satu telemetry in-flight; retry memakai EXACT SAME message_id & payload.
String pendingPayload, pendingMessageId;
uint32_t pendingSentAt = 0;
bool waitingAppAck = false;

void sendNextionCommand(const String &cmd) {
  lcdSerial.print(cmd);
  lcdSerial.write(0xFF); lcdSerial.write(0xFF); lcdSerial.write(0xFF);
}

void sendNextionText(const String &obj, const String &value) {
  sendNextionCommand(obj + ".txt=\"" + value + "\"");
}

void changePage(int pageNumber) {
  sendNextionCommand("page " + String(pageNumber));
  currentPage = pageNumber;
}

// Pertahankan pemetaan touch dari firmware sebelumnya.
void readNextionEvent() {
  while (lcdSerial.available()) {
    if (lcdSerial.read() != 0x65) continue;
    delay(5);
    if (lcdSerial.available() < 6) return;
    uint8_t pageId = lcdSerial.read();
    (void)lcdSerial.read(); // component ID
    uint8_t eventType = lcdSerial.read();
    lcdSerial.read(); lcdSerial.read(); lcdSerial.read();
    if (eventType == 1 && pageId == 1) changePage(2);
    else if (eventType == 1 && pageId == 2) changePage(1);
  }
}

String uuidV4() {
  uint8_t b[16];
  esp_fill_random(b, sizeof(b));
  b[6] = (b[6] & 0x0F) | 0x40;
  b[8] = (b[8] & 0x3F) | 0x80;
  char out[37];
  snprintf(out, sizeof(out),
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
    b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
  return String(out);
}

bool clockReady() {
  return time(nullptr) > 1735689600; // 2025-01-01 UTC
}

String utcTimestamp() {
  if (!clockReady()) return "";
  struct timeval tv;
  if (gettimeofday(&tv, nullptr) != 0) return "";
  const time_t seconds = tv.tv_sec;
  struct tm utc;
  gmtime_r(&seconds, &utc);
  char date[24];
  strftime(date, sizeof(date), "%Y-%m-%dT%H:%M:%S", &utc);
  char full[32];
  snprintf(full, sizeof(full), "%s.%03ldZ", date, static_cast<long>(tv.tv_usec / 1000));
  return String(full);
}

void startNtpIfNeeded() {
  if (WiFi.status() != WL_CONNECTED) return;

  // Jam yang sudah valid boleh dipakai (backend wajib timestamp; mode TLS
  // juga membutuhkannya untuk verifikasi sertifikat).
  if (clockReady()) {
    if (!ntpSyncAnnounced) {
      ntpSyncAnnounced = true;
      Serial.printf("[NTP] SYNCED: epoch=%lld (UTC backend; WIB Nextion)\n",
                    static_cast<long long>(time(nullptr)));
    }
    return;
  }

  const uint32_t now = millis();
  if (ntpConfigured && now - lastNtpAttempt < NTP_RETRY_INTERVAL_MS) return;
  const bool retry = ntpConfigured;
  ntpConfigured = true;
  lastNtpAttempt = now;

  // SNTP diulang berkala (bukan sekali saat boot) selama Wi-Fi aktif
  // tetapi jam belum valid. Tetap WIB untuk Nextion.
  configTime(7 * 3600, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  Serial.printf("[NTP] %s sinkronisasi; IP=%s DNS=%s (cek UDP 123 jika gagal)\n",
                retry ? "Retry" : "Mulai",
                WiFi.localIP().toString().c_str(), WiFi.dnsIP().toString().c_str());
}

void updateNextionClock() {
  if (!clockReady()) return;
  const time_t now = time(nullptr);
  struct tm local;
  localtime_r(&now, &local);
  char str[12];
  snprintf(str, sizeof(str), "%02d", local.tm_hour);
  sendNextionText("tHour", String(str));
  snprintf(str, sizeof(str), "%02d", local.tm_min);
  sendNextionText("tMin", String(str));
  snprintf(str, sizeof(str), "%02d", local.tm_sec);
  sendNextionText("tSec", String(str));
  const char *hari[] = {"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"};
  const char *bulan[] = {"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"};
  sendNextionText("tHari", hari[local.tm_wday]);
  sendNextionText("tTgl", String(local.tm_mday) + " " + bulan[local.tm_mon] + " " + String(local.tm_year + 1900));
}

void readDHT() {
  const float t = dht.readTemperature();
  const float h = dht.readHumidity();
  temperature = isnan(t) ? NAN : t;
  humidity = isnan(h) ? NAN : h;
}

// Pakai parameter keluaran (reference) agar Arduino auto-prototype tidak
// mendeklarasikan fungsi dengan return type struct sebelum struct dikenali.
void readMQSample(int pin, float rl, int &raw, float &rs) {
  uint32_t sum = 0;
  for (int i = 0; i < MQ_ADC_SAMPLE_COUNT; ++i) {
    sum += analogRead(pin);
    delay(MQ_ADC_SAMPLE_DELAY_MS);
  }
  const float average = static_cast<float>(sum) / MQ_ADC_SAMPLE_COUNT;
  const float vrl = average * (V_REF / ADC_MAX);
  raw = static_cast<int>(lroundf(average));
  rs = vrl <= 0.01f ? 99999.0f : ((VC_SUPPLY / vrl) - 1.0f) * rl;
}

float calculatePPM(float rs, float r0, float m, float b) {
  if (r0 <= 0 || rs <= 0) return NAN;
  return powf(10.0f, ((log10f(rs / r0) - b) / m));
}

void readMQ() {
  readMQSample(MQ137_PIN, RL_MQ137, rawMQ137, rsMQ137);
  readMQSample(MQ136_PIN, RL_MQ136, rawMQ136, rsMQ136);
  readMQSample(MQ4_PIN, RL_MQ4, rawMQ4, rsMQ4);
  ppmMQ137 = calculatePPM(rsMQ137, R0_MQ137, MQ137_M, MQ137_B);
  ppmMQ136 = calculatePPM(rsMQ136, R0_MQ136, MQ136_M, MQ136_B);
  ppmMQ4 = calculatePPM(rsMQ4, R0_MQ4, MQ4_M, MQ4_B);
}

String displayNumber(float x, int digits, const char *unit) {
  if (!isfinite(x)) return "--";
  return String(x, digits) + unit;
}

void updateNextionSensor() {
  sendNextionText("tSuhu", displayNumber(temperature, 1, " C"));
  sendNextionText("tLembap", displayNumber(humidity, 1, " %"));
  sendNextionText("tMQ137", displayNumber(ppmMQ137, 1, " ppm"));
  sendNextionText("tMQ136", displayNumber(ppmMQ136, 1, " ppm"));
  sendNextionText("tMQ4", displayNumber(ppmMQ4, 1, " ppm"));
}

void printSensorData() {
  Serial.printf("[SENSOR] T=%s H=%s MQ137=%d MQ136=%d MQ4=%d | WiFi=%d MQTT=%d NTP=%d\n",
    isnan(temperature) ? "ERR" : String(temperature, 1).c_str(),
    isnan(humidity) ? "ERR" : String(humidity, 1).c_str(),
    rawMQ137, rawMQ136, rawMQ4,
    WiFi.status() == WL_CONNECTED, mqtt.connected(), clockReady());
  // Nol di SEMUA kanal = elektrik (rail daya/wiring putus), bukan udara bersih:
  // pemanas MQ yang menyala selalu memberi tegangan > 0.
  if (rawMQ137 == 0 && rawMQ136 == 0 && rawMQ4 == 0) {
    Serial.println("[SENSOR] WARN: semua MQ=0 — cek VCC/GND modul MQ (tak terkait broker/WiFi)");
  }
  if (isnan(temperature) && isnan(humidity)) {
    Serial.println("[SENSOR] WARN: DHT gagal — cek VCC/DATA/GND DHT22 pin 4");
  }
}

void setSensor(JsonObject sensors, const char *name, float value) {
  JsonObject sensor = sensors[name].to<JsonObject>();
  if (isfinite(value)) { sensor["value"] = value; sensor["quality"] = "ok"; }
  else { sensor["value"] = nullptr; sensor["quality"] = "sensor_error"; }
}

void setSensor(JsonObject sensors, const char *name, int value) {
  JsonObject sensor = sensors[name].to<JsonObject>();
  sensor["value"] = value;
  sensor["quality"] = "ok";
}

String makeStatus(const char *eventType, const char *state, uint32_t seq, bool forceNullTime = false) {
  JsonDocument doc;
  doc["schema_version"] = 1;
  doc["device_id"] = DEVICE_ID;
  doc["boot_id"] = bootId;
  doc["session_id"] = sessionId;
  doc["connection_sequence"] = connectionSequence;
  doc["status_sequence"] = seq;
  doc["event_type"] = eventType;
  doc["state"] = state;
  doc["uptime_ms"] = millis();
  const String timestamp = forceNullTime ? "" : utcTimestamp();
  doc["clock_synced"] = timestamp.length() > 0;
  if (timestamp.length()) doc["event_at"] = timestamp;
  else doc["event_at"] = nullptr;
  doc["firmware_version"] = "esp32-s3-mqtt-v1";
  String json;
  serializeJson(doc, json);
  return json;
}

bool sendLiveStatus(const char *eventType) {
  if (!mqtt.connected()) return false;
  const String payload = makeStatus(eventType, "online", ++statusSequence);
  const bool ok = mqtt.publish(topicStatus.c_str(), payload, true, 1);
  Serial.printf("[MQTT] status %s: %s\n", eventType, ok ? "sent" : "FAILED");
  return ok;
}

void handleAck(String &topic, String &payload) {
  if (topic != topicAck) return;
  JsonDocument ack;
  if (deserializeJson(ack, payload)) {
    Serial.println("[ACK] INVALID JSON");
    return;
  }
  const String msgId = ack["message_id"].as<String>();
  const String status = ack["status"].as<String>();
  const String reason = ack["reason_code"].is<const char *>()
    ? ack["reason_code"].as<String>() : "";
  Serial.printf("[ACK] status=%s message_id=%s reason=%s\n",
    status.c_str(), msgId.c_str(), reason.c_str());

  if (!waitingAppAck || msgId != pendingMessageId) return;
  if (status == "accepted" || status == "duplicate" ||
      status == "accepted_unresolved_time" || status == "rejected") {
    if (status == "accepted_unresolved_time") {
      Serial.println("[WARN] Timestamp unresolved: reading tidak muncul di dashboard");
    }
    waitingAppAck = false;
    pendingPayload = "";
    pendingMessageId = "";
  }
}

bool connectMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return false;
  // Jam valid wajib: backend menolak reading tanpa timestamp (mode TLS
  // juga membutuhkannya untuk verifikasi sertifikat).
  if (!clockReady()) {
    Serial.println("[MQTT] Menunggu sinkronisasi NTP...");
    return false;
  }
  ++connectionSequence;
  sessionId = uuidV4();
  // Last Will diterima broker jika koneksi hilang tidak normal.
  const String will = makeStatus("will", "offline", ++statusSequence, true);
  mqtt.clearWill();
  mqtt.setWill(topicStatus.c_str(), will.c_str(), true, 1);
  Serial.printf("[MQTT] Connecting %s:%d ...\n", MQTT_BROKER_HOST, MQTT_BROKER_PORT);
  if (!mqtt.connect(mqttClientId.c_str(), DEVICE_ID, MQTT_PASSWORD)) {
    Serial.printf("[MQTT] FAILED lastError=%d returnCode=%d (DNS/TLS/ACL?)\n",
      static_cast<int>(mqtt.lastError()), static_cast<int>(mqtt.returnCode()));
    return false;
  }
  Serial.println("[MQTT] CONNECTED");
  if (!mqtt.subscribe(topicAck.c_str(), 1)) Serial.println("[MQTT] ACK subscribe FAILED");
  sendLiveStatus("connect");
  lastHeartbeatTime = millis();
  return true;
}

void tryWifiReconnect(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (now - lastWifiAttempt < WIFI_RETRY_MS) return;
  lastWifiAttempt = now;
  wifiAnnounced = false; // cetak ulang IP/RSSI saat berikutnya tersambung
  Serial.printf("[WIFI] reconnecting... SSID=\"%s\" status=%d\n", WIFI_SSID, (int)WiFi.status());
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void tryMqttReconnect(uint32_t now) {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  if (now - lastMqttAttempt < MQTT_RETRY_MS) return;
  lastMqttAttempt = now;
  connectMqtt();
}

void sendTelemetry(uint32_t now) {
  if (!mqtt.connected()) return;
  // Retry payload lama: deduplikasi di backend menjamin tidak ada duplikasi reading.
  if (waitingAppAck) {
    if (now - pendingSentAt < APP_ACK_TIMEOUT_MS) return;
    Serial.printf("[MQTT] application ACK timeout; retry SAME message_id=%s\n", pendingMessageId.c_str());
    if (mqtt.publish(topicTelemetry.c_str(), pendingPayload, false, 1)) pendingSentAt = millis();
    return;
  }
  if (now - lastTelemetryTime < TELEMETRY_INTERVAL_MS) return;
  lastTelemetryTime = now;
  const String timestamp = lastMqSampleAtUtc;
  if (!timestamp.length()) {
    Serial.println("[NTP] belum sinkron atau belum ada sampel MQ; telemetry ditunda");
    return;
  }
  const uint32_t seq = ++telemetrySequence;
  char seqText[16];
  snprintf(seqText, sizeof(seqText), "%010lu", static_cast<unsigned long>(seq));
  pendingMessageId = bootId + ":" + seqText;

  JsonDocument doc;
  doc["schema_version"] = 1;
  doc["device_id"] = DEVICE_ID;
  doc["message_id"] = pendingMessageId;
  doc["boot_id"] = bootId;
  doc["sequence"] = seq;
  doc["sample_uptime_ms"] = lastMqSampleUptimeMs;
  doc["measured_at"] = timestamp;
  doc["clock_synced"] = true;
  doc["firmware_version"] = "esp32-s3-mqtt-v1";
  JsonObject sensors = doc["sensors"].to<JsonObject>();
  setSensor(sensors, "temperature_c", temperature);
  setSensor(sensors, "humidity_percent", humidity);
  setSensor(sensors, "mq137_raw", rawMQ137);
  setSensor(sensors, "mq136_raw", rawMQ136);
  setSensor(sensors, "mq4_raw", rawMQ4);

  pendingPayload = "";
  serializeJson(doc, pendingPayload);
  if (pendingPayload.length() > 4000) {
    Serial.println("[MQTT] payload too large");
    pendingPayload = "";
    pendingMessageId = "";
    return;
  }
  // Set sebelum publish agar ACK callback yang cepat tidak terlewat.
  waitingAppAck = true;
  pendingSentAt = millis();
  if (!mqtt.publish(topicTelemetry.c_str(), pendingPayload, false, 1)) {
    Serial.println("[MQTT] telemetry publish FAILED; akan retry");
  } else {
    Serial.printf("[MQTT] telemetry QoS1 SENT id=%s bytes=%u\n",
      pendingMessageId.c_str(), static_cast<unsigned>(pendingPayload.length()));
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  lcdSerial.begin(9600, SERIAL_8N1, LCD_RX_PIN, LCD_TX_PIN);
  dht.begin();
  analogReadResolution(12);
  bootId = uuidV4();
  mqttClientId = String(DEVICE_ID) + "-" + bootId.substring(0, 8);
  topicTelemetry = "esniffer/v1/devices/" + String(DEVICE_ID) + "/telemetry";
  topicStatus = "esniffer/v1/devices/" + String(DEVICE_ID) + "/status";
  topicAck = "esniffer/v1/devices/" + String(DEVICE_ID) + "/ack";

  #if MQTT_USE_TLS
  tls.setCACert(MQTT_ROOT_CA_PEM); // VERIFIKASI SERTIFIKAT WAJIB
  tls.setHandshakeTimeout(10);
  mqtt.begin(MQTT_BROKER_HOST, MQTT_BROKER_PORT, tls);
  #else
  mqtt.begin(MQTT_BROKER_HOST, MQTT_BROKER_PORT, plain);
  #endif
  mqtt.setOptions(30, true, 5000);
  mqtt.onMessage(handleAck);

  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  if (String(WIFI_SSID).length() == 0 || String(WIFI_SSID) == "ISI_WIFI_SSID") {
    Serial.println("[WIFI] ERROR: SSID masih placeholder — isi WIFI_SSID/WIFI_PASSWORD asli sebelum upload!");
  }
  Serial.printf("[WIFI] connecting... SSID=\"%s\" pass_len=%u\n", WIFI_SSID, String(WIFI_PASSWORD).length());
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWifiAttempt = millis();
  changePage(0); // Timer Nextion tm0 → page 1
  Serial.printf("[BOOT] device=%s boot_id=%s\n", DEVICE_ID, bootId.c_str());
}

void loop() {
  const uint32_t now = millis();
  readNextionEvent();
  if (now - lastDhtTime >= DHT_INTERVAL_MS) { lastDhtTime = now; readDHT(); }
  if (now - lastSensorTime >= SENSOR_INTERVAL_MS) {
    readMQ();
    lastMqSampleUptimeMs = millis(); // waktu selesai akuisisi ADC
    lastMqSampleAtUtc = utcTimestamp(); // timestamp beresolusi milidetik
    lastSensorTime = lastMqSampleUptimeMs;
  }
  if (now - lastNextionSensorTime >= NEXTION_SENSOR_INTERVAL_MS) {
    lastNextionSensorTime = now;
    updateNextionSensor();
  }
  if (now - lastClockTime >= CLOCK_INTERVAL_MS) {
    lastClockTime = now;
    updateNextionClock();
  }
  if (now - lastSerialTime >= SERIAL_INTERVAL_MS) {
    lastSerialTime = now;
    printSensorData();
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiAnnounced) {
      wifiAnnounced = true;
      Serial.printf("[WIFI] CONNECTED ip=%s rssi=%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    }
    startNtpIfNeeded();
    mqtt.loop();
    tryMqttReconnect(now);
    if (mqtt.connected()) {
      if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = now;
        sendLiveStatus("heartbeat");
      }
      sendTelemetry(now);
    }
  } else {
    // Wi-Fi putus sebelum SNTP sukses: izinkan init ulang saat tersambung.
    ntpConfigured = false;
    tryWifiReconnect(now);
  }
  delay(1);
}