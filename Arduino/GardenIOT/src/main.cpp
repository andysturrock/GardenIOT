#include <WiFiClientSecure.h>
#include <U8g2lib.h>
#include "arduino_secrets.h"

#define   FONT_ONE_HEIGHT               8                                   // font one height in pixels
#define   FONT_TWO_HEIGHT               20                                  // font two height in pixels

char      chBuffer[128];                                                    // general purpose character buffer
char      chPassword[] =                  __WIFIPASSWORD__;                 // your network password
char      chSSID[] =                      __WIFISSID__;                     // your network SSID
U8G2_SSD1306_128X64_NONAME_F_HW_I2C       u8g2(U8G2_R0, 16, 15, 4);         // OLED graphics
int       nWifiStatus =                   WL_IDLE_STATUS;                   // wifi status
int32_t   connectionTimeout =             5000;                             // Timeout in making SSL connection.

String hostname = "api.gardeniot.dev.goatsinlace.com";

const char* amazon_root_ca = \
"-----BEGIN CERTIFICATE-----\n" \
"MIID7zCCAtegAwIBAgIBADANBgkqhkiG9w0BAQsFADCBmDELMAkGA1UEBhMCVVMx\n" \
"EDAOBgNVBAgTB0FyaXpvbmExEzARBgNVBAcTClNjb3R0c2RhbGUxJTAjBgNVBAoT\n" \
"HFN0YXJmaWVsZCBUZWNobm9sb2dpZXMsIEluYy4xOzA5BgNVBAMTMlN0YXJmaWVs\n" \
"ZCBTZXJ2aWNlcyBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAtIEcyMB4XDTA5\n" \
"MDkwMTAwMDAwMFoXDTM3MTIzMTIzNTk1OVowgZgxCzAJBgNVBAYTAlVTMRAwDgYD\n" \
"VQQIEwdBcml6b25hMRMwEQYDVQQHEwpTY290dHNkYWxlMSUwIwYDVQQKExxTdGFy\n" \
"ZmllbGQgVGVjaG5vbG9naWVzLCBJbmMuMTswOQYDVQQDEzJTdGFyZmllbGQgU2Vy\n" \
"dmljZXMgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkgLSBHMjCCASIwDQYJKoZI\n" \
"hvcNAQEBBQADggEPADCCAQoCggEBANUMOsQq+U7i9b4Zl1+OiFOxHz/Lz58gE20p\n" \
"OsgPfTz3a3Y4Y9k2YKibXlwAgLIvWX/2h/klQ4bnaRtSmpDhcePYLQ1Ob/bISdm2\n" \
"8xpWriu2dBTrz/sm4xq6HZYuajtYlIlHVv8loJNwU4PahHQUw2eeBGg6345AWh1K\n" \
"Ts9DkTvnVtYAcMtS7nt9rjrnvDH5RfbCYM8TWQIrgMw0R9+53pBlbQLPLJGmpufe\n" \
"hRhJfGZOozptqbXuNC66DQO4M99H67FrjSXZm86B0UVGMpZwh94CDklDhbZsc7tk\n" \
"6mFBrMnUVN+HL8cisibMn1lUaJ/8viovxFUcdUBgF4UCVTmLfwUCAwEAAaNCMEAw\n" \
"DwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwHQYDVR0OBBYEFJxfAN+q\n" \
"AdcwKziIorhtSpzyEZGDMA0GCSqGSIb3DQEBCwUAA4IBAQBLNqaEd2ndOxmfZyMI\n" \
"bw5hyf2E3F/YNoHN2BtBLZ9g3ccaaNnRbobhiCPPE95Dz+I0swSdHynVv/heyNXB\n" \
"ve6SbzJ08pGCL72CQnqtKrcgfU28elUSwhXqvfdqlS5sdJ/PHLTyxQGjhdByPq1z\n" \
"qwubdQxtRbeOlKyWN7Wg0I8VRw7j6IPdj/3vQQF3zCepYoUz8jcI73HPdwbeyBkd\n" \
"iEDPfUYd/x7H4c7/I9vG+o1VTqkC50cRRj70/b17KSa7qWFiNyi2LSr2EIZkyXCn\n" \
"0q23KXB56jzaYyWf/Wi3MOxw+3WKt21gZ7IeyLnp2KhvAotnDU0mV3HaIPzBSlCN\n" \
"sSi6\n" \
"-----END CERTIFICATE-----\n";

void setup()
{
  Serial.begin(115200);
  while (!Serial)
  {
    Serial.print('.');
  }

  // OLED graphics.

  u8g2.begin();
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.setFontRefHeightExtendedText();
  u8g2.setDrawColor(1);
  u8g2.setFontPosTop();
  u8g2.setFontDirection(0);

  // Wifi.

  // Display title.

  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "Connecting to:");
  Serial.println(chBuffer);
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  sprintf(chBuffer, "%s", chSSID);
  Serial.println(chBuffer);
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 31 - (FONT_ONE_HEIGHT / 2), chBuffer);
  u8g2.sendBuffer();

  // From https://github.com/espressif/arduino-esp32/issues/2025
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  delay(1000);
  WiFi.persistent(false);

  // Connect to wifi.
  WiFi.begin(chSSID, chPassword);
  while (WiFi.status() != WL_CONNECTED)
  {
    Serial.print(".");
    delay(500);
  }
  Serial.println();
  sprintf(chBuffer, "WiFi connected to %s.", chSSID);
  Serial.println(chBuffer);
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  u8g2.sendBuffer();

  // Display connection stats.
  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "WiFi Stats:");
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  Serial.println(chBuffer);

  char  chIp[81];
  WiFi.localIP().toString().toCharArray(chIp, sizeof(chIp) - 1);
  sprintf(chBuffer, "IP  : %s", chIp);
  u8g2.drawStr(0, FONT_ONE_HEIGHT * 2, chBuffer);
  Serial.println(chBuffer);

  sprintf(chBuffer, "SSID: %s", chSSID);
  u8g2.drawStr(0, FONT_ONE_HEIGHT * 3, chBuffer);
  Serial.println(chBuffer);
  u8g2.sendBuffer();
}

void get()
{
  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "Connecting to server...");
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  u8g2.sendBuffer();

  WiFiClientSecure client;
  // client.setInsecure();
  client.setCACert(amazon_root_ca);
  Serial.println("\nStarting connection to server...");
  if (!client.connect(hostname.c_str(), 443, connectionTimeout)) {
    Serial.println("Connection failed!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection Failed");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();
  }
  else {
    Serial.println("Connected to server!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection made!");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    String url = "/0_0_1/temperature?sensor_id0";

    Serial.print("Requesting URL: ");
    Serial.println(url);

    // This will send the request to the server
    String http("GET " + url + " HTTP/1.1\n");
    http += "Host: " + hostname + "\n";
    http += "Connection: close\n\n";
    client.print(http);
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 5000) {
        Serial.println(">>> Client Timeout !");
        client.stop();
        return;
      }
    }

    while (client.connected()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") {
        Serial.println("headers received");
        u8g2.clearBuffer();
        sprintf(chBuffer, "%s", "headers received");
        u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
        u8g2.sendBuffer();
        break;
      }
    }
    // if there are incoming bytes available
    // from the server, read them and print them:
    u8g2.clearBuffer();
    String str;
    while (client.available()) {
      char c = client.read();
      // At end of response we seem to get a 255 so skip that.
      if(c == 255) {
        continue;
      }
      str.concat(c);
      Serial.print("c =<");
      Serial.write(c);
      Serial.println(">");
    }
    str.concat("\0");
    const char* c_str = str.c_str();
    Serial.write(c_str);
    sprintf(chBuffer, "%s", c_str);
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    client.stop();
  }
}

void post()
{
  u8g2.clearBuffer();
  sprintf(chBuffer, "%s", "Connecting to server...");
  u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
  u8g2.sendBuffer();

  WiFiClientSecure client;
  // client.setInsecure();
  client.setCACert(amazon_root_ca);
  Serial.println("\nStarting connection to server...");
  if (!client.connect(hostname.c_str(), 443, connectionTimeout)) {
    Serial.println("Connection failed!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection Failed");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();
  }
  else {
    Serial.println("Connected to server!");
    u8g2.clearBuffer();
    sprintf(chBuffer, "%s", "Connection made!");
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    String url = "/0_0_1/temperature";

    Serial.print("POSTing to URL: ");
    Serial.println(url);

    String data("[");
    data += "{\"sensor_id\": 0, \"temperature\": \"12.99\"},";
    data += "{\"sensor_id\": 1, \"temperature\": \"23.99\"},";
    data += "{\"sensor_id\": 2, \"temperature\": \"34.99\"}";
    data += "]";

    // This will send the request to the server
    String http("POST " + url + " HTTP/1.1\n");
    http += "Host: " + hostname + "\n";
    http += "Connection: close\n";
    http += "Content-Length: ";
    http.concat(data.length());
    http += "\n\n";
    http += data;
    http += "\n";
    client.print(http);
    http += "\n\n";
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 10000) {
        Serial.println(">>> Client Timeout !");
        u8g2.clearBuffer();
        sprintf(chBuffer, "%s", "Timeout");
        u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
        u8g2.sendBuffer();
        client.stop();
        return;
      }
    }

    while (client.connected()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") {
        Serial.println("headers received");
        u8g2.clearBuffer();
        sprintf(chBuffer, "%s", "headers received");
        u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
        u8g2.sendBuffer();
        break;
      }
    }
    // if there are incoming bytes available
    // from the server, read them and print them:
    u8g2.clearBuffer();
    String str;
    while (client.available()) {
      char c = client.read();
      // At end of response we seem to get a 255 so skip that.
      if(c == 255) {
        continue;
      }
      str.concat(c);
      Serial.print("c =<");
      Serial.write(c);
      Serial.println(">");
    }
    str.concat("\0");
    const char* c_str = str.c_str();
    Serial.write(c_str);
    sprintf(chBuffer, "%s", c_str);
    u8g2.drawStr(64 - (u8g2.getStrWidth(chBuffer) / 2), 0, chBuffer);
    u8g2.sendBuffer();

    client.stop();
  }
}

void loop() {
  delay(5000);
  post();
}