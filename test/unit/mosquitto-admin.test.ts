import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMosquittoAdminConfigured, provisionMqttDevice } from '../../lib/mosquitto-admin.ts';

describe('Mosquitto Admin & Dynamic Security Unit Tests', () => {
  it('1. isMosquittoAdminConfigured mengembalikan false jika environment tidak disetel', () => {
    const originalUser = process.env.MQTT_ADMIN_USERNAME;
    const originalPass = process.env.MQTT_ADMIN_PASSWORD;

    delete process.env.MQTT_ADMIN_USERNAME;
    delete process.env.MQTT_ADMIN_PASSWORD;

    assert.strictEqual(isMosquittoAdminConfigured(), false);

    if (originalUser) process.env.MQTT_ADMIN_USERNAME = originalUser;
    if (originalPass) process.env.MQTT_ADMIN_PASSWORD = originalPass;
  });

  it('2. isMosquittoAdminConfigured mengembalikan true saat username dan password terisi', () => {
    const originalUser = process.env.MQTT_ADMIN_USERNAME;
    const originalPass = process.env.MQTT_ADMIN_PASSWORD;

    process.env.MQTT_ADMIN_USERNAME = 'admin';
    process.env.MQTT_ADMIN_PASSWORD = 'supersecretpass';

    assert.strictEqual(isMosquittoAdminConfigured(), true);

    if (originalUser) process.env.MQTT_ADMIN_USERNAME = originalUser;
    else delete process.env.MQTT_ADMIN_USERNAME;
    if (originalPass) process.env.MQTT_ADMIN_PASSWORD = originalPass;
    else delete process.env.MQTT_ADMIN_PASSWORD;
  });

  it('3. provisionMqttDevice mengembalikan provisioned: false secara aman saat admin belum dikonfigurasi', async () => {
    delete process.env.MQTT_ADMIN_USERNAME;
    delete process.env.MQTT_ADMIN_PASSWORD;

    const res = await provisionMqttDevice('esp32-unit-test', 'pass123');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.provisioned, false);
    assert.ok(res.message?.includes('belum dikonfigurasi'));
  });
});
