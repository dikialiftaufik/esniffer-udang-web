import mqtt, { MqttClient } from 'mqtt';
import fs from 'node:fs';

export interface MosquittoProvisionResult {
  success: boolean;
  provisioned: boolean;
  message?: string;
  error?: string;
}

/**
 * Memeriksa apakah kredensial admin Mosquitto Dynamic Security telah dikonfigurasi.
 */
export function isMosquittoAdminConfigured(): boolean {
  const user = process.env.MQTT_ADMIN_USERNAME;
  let pass = process.env.MQTT_ADMIN_PASSWORD;
  if (!pass && process.env.MQTT_ADMIN_PASSWORD_FILE) {
    try {
      pass = fs.readFileSync(process.env.MQTT_ADMIN_PASSWORD_FILE, 'utf8').trim();
    } catch {
      pass = undefined;
    }
  }
  return Boolean(user && pass);
}

/**
 * Mendaftarkan akun device baru beserta ACL-nya ke broker Mosquitto via Dynamic Security plugin ($CONTROL/dynamic-security/v1).
 */
export async function provisionMqttDevice(
  deviceId: string,
  password: string,
  timeoutMs = 6000
): Promise<MosquittoProvisionResult> {
  const user = process.env.MQTT_ADMIN_USERNAME;
  let pass = process.env.MQTT_ADMIN_PASSWORD;
  if (!pass && process.env.MQTT_ADMIN_PASSWORD_FILE) {
    try {
      pass = fs.readFileSync(process.env.MQTT_ADMIN_PASSWORD_FILE, 'utf8').trim();
    } catch {
      pass = undefined;
    }
  }

  if (!user || !pass) {
    return {
      success: true,
      provisioned: false,
      message: 'Kredensial MQTT_ADMIN_USERNAME / MQTT_ADMIN_PASSWORD belum dikonfigurasi di environment.',
    };
  }

  const brokerUrl = process.env.MQTT_ADMIN_URL || process.env.MQTT_URL || 'mqtt://127.0.0.1:1883';
  const roleName = `role-${deviceId}`;

  return new Promise((resolve) => {
    let client: MqttClient | null = null;
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (client) {
        try {
          client.end(true);
        } catch {
          // Abaikan error saat disconnect
        }
      }
    };

    const finish = (result: MosquittoProvisionResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    timer = setTimeout(() => {
      finish({
        success: false,
        provisioned: false,
        error: `Batas waktu habis (${timeoutMs}ms) saat menghubungi broker Mosquitto.`,
      });
    }, timeoutMs);

    try {
      client = mqtt.connect(brokerUrl, {
        username: user,
        password: pass,
        clientId: `esniffer-web-admin-${Date.now()}`,
        connectTimeout: 4000,
        reconnectPeriod: 0,
      });

      client.on('error', (err) => {
        finish({
          success: false,
          provisioned: false,
          error: `Koneksi admin ke broker Mosquitto gagal: ${err.message}`,
        });
      });

      client.on('connect', () => {
        const responseTopic = '$CONTROL/dynamic-security/v1/response';
        const controlTopic = '$CONTROL/dynamic-security/v1';

        client!.subscribe(responseTopic, (subErr) => {
          if (subErr) {
            finish({
              success: false,
              provisioned: false,
              error: `Gagal subscribe ke topik response dynamic security: ${subErr.message}`,
            });
            return;
          }

          // Buat Role dengan ACL sempit & buat Client
          const payload = JSON.stringify({
            commands: [
              {
                command: 'createRole',
                rolename: roleName,
                acls: [
                  {
                    acltype: 'publishClientSend',
                    topic: `esniffer/v1/devices/${deviceId}/telemetry`,
                    allow: true,
                  },
                  {
                    acltype: 'publishClientSend',
                    topic: `esniffer/v1/devices/${deviceId}/status`,
                    allow: true,
                  },
                  {
                    acltype: 'subscribeLiteral',
                    topic: `esniffer/v1/devices/${deviceId}/ack`,
                    allow: true,
                  },
                ],
              },
              {
                command: 'createClient',
                username: deviceId,
                password: password,
                roles: [{ rolename: roleName }],
              },
              {
                command: 'setClientPassword',
                username: deviceId,
                password: password,
              },
              {
                command: 'addClientRole',
                username: deviceId,
                rolename: roleName,
              },
            ],
          });

          client!.publish(controlTopic, payload, { qos: 1 });
        });
      });

      client.on('message', (topic, message) => {
        if (topic !== '$CONTROL/dynamic-security/v1/response') return;
        try {
          const json = JSON.parse(message.toString());
          const responses = Array.isArray(json.responses) ? json.responses : [];

          // Cek apakah ada error fatal (selain Role/Client already exists yang normal saat re-provisioning)
          const fatalError = responses.find(
            (r: { command: string; error?: string }) =>
              r.error &&
              r.error !== 'Role already exists' &&
              r.error !== 'Client already exists' &&
              r.error !== 'Role already added to client'
          );

          if (fatalError) {
            finish({
              success: false,
              provisioned: false,
              error: `Mosquitto Dynsec: ${fatalError.error} pada perintah ${fatalError.command}`,
            });
          } else {
            finish({
              success: true,
              provisioned: true,
              message: `Akun device "${deviceId}" dan ACL berhasil didaftarkan di broker Mosquitto.`,
            });
          }
        } catch (e: unknown) {
          finish({
            success: false,
            provisioned: false,
            error: `Format respons Mosquitto tidak valid: ${e instanceof Error ? e.message : 'Unknown'}`,
          });
        }
      });
    } catch (e: unknown) {
      finish({
        success: false,
        provisioned: false,
        error: `Gagal menginisialisasi MQTT admin client: ${e instanceof Error ? e.message : 'Unknown'}`,
      });
    }
  });
}
