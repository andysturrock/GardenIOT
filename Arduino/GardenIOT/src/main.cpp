#include <WiFiClientSecure.h>
#include <U8g2lib.h>
#include "arduino_secrets.h"
#include "temperature_reading.hpp"
#include <u8g2_stream.hpp>
#include <rest_client.hpp>
#include <string>

char      chBuffer[128];                                                    // general purpose character buffer
char      chPassword[] =                  __WIFIPASSWORD__;                 // your network password
char      chSSID[] =                      __WIFISSID__;                     // your network SSID
U8G2_SSD1306_128X64_NONAME_F_HW_I2C       u8g2(U8G2_R0, 16, 15, 4);         // OLED graphics
int       nWifiStatus =                   WL_IDLE_STATUS;                   // wifi status
int32_t   connectionTimeout =             10000;                             // Timeout in making SSL connection.

U8G2Stream u8g2Stream(u8g2);

std::string hostname = "api.gardeniot.dev.goatsinlace.com";

// From https://www.amazontrust.com/repository/SFSRootCAG2.pem
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

  u8g2Stream.init();
  u8g2Stream.clear();
  u8g2Stream.leftJustify();
  u8g2Stream << "Connecting to:" << newline << chSSID;
  u8g2Stream << flush;

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
  u8g2Stream << "WiFi connected to " << chSSID << flush;

  // Display connection stats.
  u8g2Stream << "WiFi Stats:" << newline;
  u8g2Stream << "IP: " << WiFi.localIP().toString() << newline;
  u8g2Stream << "SSID: " << chSSID;
  u8g2Stream << flush;

  delay(5000);
}

void loop()
{
  TemperatureReading temperatureReading(1, 12.3);

  WiFiClientSecure client;
  client.setInsecure();
  // client.setCACert(amazon_root_ca);

  RestClient restClient(u8g2Stream, client, hostname, connectionTimeout);
  std::string data("[");
  data += temperatureReading.toJson();
  data += "]";

  std::string returnBody;

  restClient.post("/0_0_1/temperature", data, returnBody);

  u8g2Stream << "returnBody: " << newline << returnBody << flush;

  delay(5000);
}